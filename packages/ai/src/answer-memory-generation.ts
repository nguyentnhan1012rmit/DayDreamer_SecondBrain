import { generateTuturuuuJsonWithMeta } from "./tuturuuu-json.ts";
import { getTuturuuuAnswerModel } from "./tuturuuu-models.ts";
import type { MemorySearchHit } from "./retrieval.ts";
import { buildCitations, classifyRetrievalConfidence } from "./answer-utils.ts";
import type { AnswerMemoryResult, AnswerStrategy, ResponseLanguage } from "./answer-memory-types.ts";
import { detectMemoryIntent } from "./answer-memory-intents.ts";
import { buildGroundedSourceContext, GROUNDED_ANSWER_SYSTEM_PROMPT, MEMORY_SOURCE_SECURITY_RULES } from "./answer-memory-prompt.ts";
import { resolveMemoryTimeZone } from "./answer-memory-temporal.ts";
import { TuturuuuGroundedAnswerResponseSchema, GroundedAnswerSchema, type GroundedAnswer } from "./answer-memory-schema.ts";
import { MIN_TOP_SIMILARITY } from "./answer-memory-config.ts";
import { buildQueryAnalytics, classifyModelError, noMemoryResult } from "./answer-memory-result.ts";
import { answerFastExtractiveFromChunks } from "./answer-memory-fast-path.ts";
import { buildIntentInstruction, isBroadTemporalSynthesisQuestion, selectMaxAnswerTokens, selectPromptSourceLimit, shouldUseAutoFastPath, shouldUseIntentEvidenceFastPath } from "./answer-memory-routing.ts";
import { answerIntentEvidenceFastPath, buildUnsupportedIntentNoMemoryResult } from "./answer-memory-evidence.ts";
import { buildExtractiveFallbackAnswer, buildInsufficientModelAnswer, buildValidationFallbackAnswer, canUseExtractiveFallback, recoverCitationsForAnswer } from "./answer-memory-fallback.ts";
import { answerPassesEvidenceChecks, hasAdequateSemanticSupport, isAnswerGroundedByCitations, isIncompleteGeneratedAnswer, isInsufficientAnswer, reconcileConfidence } from "./answer-memory-validation.ts";
import { attachCitationClaims, mergeRecoveredCitations, validateModelCitations } from "./answer-memory-citations.ts";

export async function answerFromChunks(
  question: string,
  chunks: MemorySearchHit[],
  options: {
    minTopSimilarity?: number;
    responseLanguage?: ResponseLanguage;
    answerStrategy?: AnswerStrategy;
    timeZone?: string;
    generateAnswer?: typeof generateTuturuuuJsonWithMeta<GroundedAnswer>;
  } = {},
): Promise<AnswerMemoryResult> {
  const minTopSimilarity = options.minTopSimilarity ?? MIN_TOP_SIMILARITY;
  const lang = options.responseLanguage ?? "en";
  const answerStrategy = options.answerStrategy ?? "auto";
  const timeZone = resolveMemoryTimeZone(options.timeZone);
  const intent = detectMemoryIntent(question);

  if (!chunks.length) {
    const result = noMemoryResult(
      lang === "vi"
        ? "Mình chưa tìm thấy ký ức đủ liên quan để trả lời chắc chắn."
        : "I couldn't find any relevant memories to answer your question.",
      lang,
    );
    result.analytics = buildQueryAnalytics({
      model: "n/a",
      chunksRetrieved: 0,
      status: "no_memory",
      answerMode: "no_memory",
    });
    return result;
  }

  const sortedChunks = [...chunks].sort((a, b) => b.similarity - a.similarity);
  const topSimilarity = sortedChunks[0]?.similarity ?? 0;

  if (topSimilarity < minTopSimilarity || !hasAdequateSemanticSupport(sortedChunks)) {
    const result = noMemoryResult(
      lang === "vi"
        ? "Mình tìm thấy một vài ký ức gần nghĩa, nhưng độ liên quan chưa đủ cao để trả lời chắc chắn."
        : "I found some loosely related memories, but the relevance isn't strong enough for a confident answer.",
      lang,
    );
    result.analytics = buildQueryAnalytics({
      model: "n/a",
      chunksRetrieved: chunks.length,
      status: "no_memory",
      answerMode: "no_memory",
    });
    return result;
  }

  const sources = buildCitations(sortedChunks);
  const shouldTryIntentFastPath = shouldUseIntentEvidenceFastPath(
    question,
    intent,
    answerStrategy,
  );
  if (shouldTryIntentFastPath) {
    const intentEvidenceAnswer = answerIntentEvidenceFastPath(
      question,
      sources,
      chunks.length,
      lang,
      intent,
      timeZone,
    );
    if (intentEvidenceAnswer) return intentEvidenceAnswer;

    const unsupportedIntentAnswer = buildUnsupportedIntentNoMemoryResult(
      question,
      sources,
      chunks.length,
      lang,
      intent,
    );
    if (unsupportedIntentAnswer) return unsupportedIntentAnswer;
  }

  if (
    answerStrategy === "fast" ||
    (answerStrategy === "auto" && shouldUseAutoFastPath(question, intent))
  ) {
    return answerFastExtractiveFromChunks(question, chunks, lang, minTopSimilarity, timeZone);
  }

  const promptSourceLimit = selectPromptSourceLimit(question, intent);
  const promptSources = sources.slice(0, promptSourceLimit);
  const sourceContext = buildGroundedSourceContext(promptSources);

  const broadSynthesisQuestion = isBroadTemporalSynthesisQuestion(question, intent);
  const languageInstruction = lang === "vi"
    ? '- PHẢI trả lời bằng tiếng Việt tự nhiên. Dùng "mình" cho assistant và "bạn" cho user.'
    : "- You MUST answer in natural English.";
  const intentInstruction = buildIntentInstruction(intent, lang);
  const synthesisInstruction = broadSynthesisQuestion
    ? lang === "vi"
      ? [
          '- Vì đây là câu hỏi tóm tắt theo tuần/tháng/khoảng thời gian, hãy tổng hợp theo các mục ngắn: "Công việc chính", "Blockers/rủi ro", "Quyết định quan trọng", "Next steps".',
          "- Chỉ hiện mục nào có bằng chứng trong sources; không cần đủ cả 4 mục nếu nguồn không có.",
          "- Không copy nguyên raw chunks dài. Hãy gom ý trùng nhau và diễn đạt tự nhiên bằng tiếng Việt.",
        ].join("\n")
      : [
          '- Because this is a weekly/monthly/range summary question, synthesize with short sections: "Main work", "Blockers/risks", "Key decisions", "Next steps".',
          "- Only include sections supported by the retrieved sources; do not force all four sections.",
          "- Do not copy long raw chunks. Merge duplicate ideas and write naturally in English.",
        ].join("\n")
    : "- Do not copy long raw chunks. Summarize the relevant facts naturally.";
  const lengthInstruction = broadSynthesisQuestion
    ? "- Keep the answer compact: up to 180 words or 8 short bullets."
    : "- Keep answer concise: at most 120 words or 5 short bullets.";

  const prompt = `
You are the grounded answer generator for a personal Second Brain memory system.

Question:
${question}

Retrieved memory sources:
${sourceContext}

Rules:
${MEMORY_SOURCE_SECURITY_RULES}
- Answer ONLY using the retrieved memory sources.
- Do not invent dates, people, events, decisions, emotions, or outcomes.
- Answer naturally without adding any citation markers (like [S1]) in your text.
- However, you MUST still provide the citations in the JSON output with their respective claims.
- Each citations.claim MUST be a short exact quote or near-exact phrase copied from the source memory. Do not translate citation claims.
- If the sources do not answer the question, say that the memory is insufficient and set confidence to "low".
- Prefer a warm, concise answer over a fluent but unsupported answer.
${lengthInstruction}
- Include at most 4 citation objects unless more are absolutely necessary.
- For "what did I do" timeline/range questions, summarize the main activities first, then use short bullets only when helpful.
- Do not mention Tuturuuu, model errors, retrieval, debug trace, or implementation details.
- Return a compact JSON object with exactly these top-level fields: answer, confidence, citations.
- Return ONLY JSON. Do not wrap it in markdown.
- Required JSON shape:
  {"answer":"...","confidence":"high|medium|low","citations":[{"marker":"S1","claim":"..."}]}
- Use citation markers exactly as S1, S2, S3, etc. Do not include square brackets in marker values.
- It is okay to answer in Vietnamese while citation claims remain in the source language.
${synthesisInstruction}
- ${intentInstruction}
${languageInstruction}
`.trim();

  try {
    const generateStart = performance.now();
    const tuturuuuResult = await (options.generateAnswer ?? generateTuturuuuJsonWithMeta)({
      model: getTuturuuuAnswerModel(),
      prompt,
      systemPrompt: GROUNDED_ANSWER_SYSTEM_PROMPT,
      responseSchema: TuturuuuGroundedAnswerResponseSchema,
      responseSchemaName: "grounded_memory_answer",
      validator: GroundedAnswerSchema,
      temperature: 0.1,
      maxOutputTokens: selectMaxAnswerTokens(question),
    });
    const generateMs = performance.now() - generateStart;

    const output = tuturuuuResult.data;
    const tokenUsage = tuturuuuResult.tokenUsage;

    if (isIncompleteGeneratedAnswer(output.answer)) {
      return buildValidationFallbackAnswer(
        lang,
        promptSources,
        chunks.length,
        "Generated answer appeared incomplete.",
        {
          generateMs: Math.round(generateMs),
          tokenUsage,
        },
        question,
        timeZone,
      );
    }

    const {
      sourceByMarker,
      valid: validModelCitations,
      supported: supportedModelCitations,
    } = validateModelCitations(output.citations, promptSources);

    if (!supportedModelCitations.length && isInsufficientAnswer(output.answer)) {
      return buildInsufficientModelAnswer(lang, output.answer, chunks.length, {
        generateMs: Math.round(generateMs),
        tokenUsage,
      });
    }

    if (!supportedModelCitations.length) {
      const recoveredCitations = recoverCitationsForAnswer(
        output.answer,
        promptSources,
        question,
        intent,
      );

      if (
        recoveredCitations.length &&
        answerPassesEvidenceChecks(output.answer, recoveredCitations, promptSources)
      ) {
        const recoveredRetrievalConfidence = classifyRetrievalConfidence(
          recoveredCitations[0]?.similarity ?? topSimilarity,
          recoveredCitations.length,
        );

        return {
          answer: output.answer,
          confidence: reconcileConfidence(
            output.confidence,
            recoveredRetrievalConfidence,
            output.answer,
            false,
          ),
          citations: recoveredCitations,
          answerMode: "tuturuuu",
          analytics: buildQueryAnalytics({
            model: tokenUsage.model,
            tokenUsage,
            timing: { generateMs: Math.round(generateMs) },
            chunksRetrieved: chunks.length,
            status: "success",
            answerMode: "tuturuuu",
          }),
        };
      }

      return buildValidationFallbackAnswer(
        lang,
        promptSources,
        chunks.length,
        "Generated answer did not include usable grounded citations.",
        {
          generateMs: Math.round(generateMs),
          tokenUsage,
        },
        question,
        timeZone,
      );
    }

    const citations = attachCitationClaims(promptSources, supportedModelCitations);
    const augmentedCitations = mergeRecoveredCitations(
      citations,
      recoverCitationsForAnswer(output.answer, promptSources, question, intent),
    );
    const answerGrounded = isAnswerGroundedByCitations(
      output.answer,
      augmentedCitations.map((citation) => ({
        marker: citation.marker,
        claim: citation.claim ?? citation.quote,
      })),
      sourceByMarker,
      lang,
    );

    const retrievalConfidence = classifyRetrievalConfidence(
      topSimilarity,
      augmentedCitations.length,
    );
    if (!answerGrounded) {
      return buildValidationFallbackAnswer(
        lang,
        promptSources,
        chunks.length,
        "Generated answer was not sufficiently grounded in its citations.",
        {
          generateMs: Math.round(generateMs),
          tokenUsage,
        },
        question,
        timeZone,
      );
    }

    if (!answerPassesEvidenceChecks(output.answer, augmentedCitations, promptSources)) {
      return buildValidationFallbackAnswer(
        lang,
        promptSources,
        chunks.length,
        "Generated answer mentioned dates or named entities that were not supported by evidence.",
        {
          generateMs: Math.round(generateMs),
          tokenUsage,
        },
        question,
        timeZone,
      );
    }

    const finalConfidence = reconcileConfidence(
      output.confidence,
      retrievalConfidence,
      output.answer,
      supportedModelCitations.length < validModelCitations.length,
    );

    return {
      answer: output.answer,
      confidence: finalConfidence,
      citations: augmentedCitations,
      answerMode: "tuturuuu",
      analytics: buildQueryAnalytics({
        model: tokenUsage.model,
        tokenUsage,
        timing: { generateMs: Math.round(generateMs) },
        chunksRetrieved: chunks.length,
        status: "success",
        answerMode: "tuturuuu",
      }),
    };
  } catch (error) {
    const modelError = classifyModelError(error);
    console.warn(
      `[AnswerMemory] Failed to generate grounded answer (${modelError.kind}${modelError.status ? ` ${modelError.status}` : ""}): ${modelError.message}`,
    );

    if (canUseExtractiveFallback(modelError, promptSources)) {
      return buildExtractiveFallbackAnswer(lang, promptSources, chunks.length, modelError, {}, question, timeZone);
    }

    return {
      answer:
        lang === "vi"
          ? "Mình đã tìm thấy ký ức liên quan, nhưng không thể tạo câu trả lời có cấu trúc đáng tin cậy ở lần này."
          : "I found relevant memories, but was unable to generate a structured answer this time.",
      confidence: "low",
      citations: [],
      answerMode: "extractive_fallback",
      modelError,
      analytics: buildQueryAnalytics({
        model: "n/a",
        chunksRetrieved: chunks.length,
        status: "error",
        answerMode: "extractive_fallback",
      }),
    };
  }
}
