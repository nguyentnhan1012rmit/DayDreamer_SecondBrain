import { createDefaultEmbeddingProvider } from "./embedding.ts";
import type { MemoryDbClient } from "./types.ts";
import type {
  AnswerMemoryOptions,
  AnswerMemoryResult,
} from "./answer-memory-types.ts";
import { detectMemoryIntent } from "./answer-memory-intents.ts";
import {
  inferRetrievalFilters,
  resolveMemoryTimeZone,
} from "./answer-memory-temporal.ts";
import { translateFastAnswerIfUseful } from "./answer-memory-translation.ts";
import {
  DEFAULT_MAX_DISTANCE,
  DEFAULT_RETRIEVAL_CANDIDATE_LIMIT,
  MIN_TOP_SIMILARITY,
} from "./answer-memory-config.ts";
import {
  buildDebugTrace,
  buildQueryAnalytics,
  classifyModelError,
  noMemoryResult,
} from "./answer-memory-result.ts";
import {
  maybeGetMemoryIndexDiagnostics,
} from "./answer-memory-diagnostics.ts";
import {
  answerFastExtractiveFromChunks,
  answerSingleDayFastPath,
  answerTemporalRangeFastPath,
} from "./answer-memory-fast-path.ts";
import {
  describeSelectedPath,
  didTranslationRun,
  isBroadTemporalSynthesisQuestion,
  shouldUseAutoFastPath,
} from "./answer-memory-routing.ts";
import {
  retrieveEmbeddedEvidenceMeasured,
  retrieveLexicalFallbackEvidenceMeasured,
  retrieveUnindexedEvidence,
} from "./answer-memory-retrieval-pipeline.ts";
import { rerankMemoryHits } from "./answer-memory-rerank.ts";
import { answerFromChunks } from "./answer-memory-generation.ts";
import { maybeBuildCreatedDateMismatchResult } from "./answer-memory-date-mismatch.ts";

type RoutingTrace = NonNullable<NonNullable<AnswerMemoryResult["debugTrace"]>["routingTrace"]>;

export type {
  AnswerMemoryOptions,
  AnswerMemoryResult,
  AnswerStrategy,
  MemoryDebugTrace,
  QueryAnalytics,
  ResponseLanguage,
} from "./answer-memory-types.ts";
export { inferRetrievalFilters, resolveMemoryTimeZone } from "./answer-memory-temporal.ts";
export { answerSingleDayFastPath, answerTemporalRangeFastPath } from "./answer-memory-fast-path.ts";
export { rerankMemoryHits } from "./answer-memory-rerank.ts";
export { answerFromChunks } from "./answer-memory-generation.ts";

export async function answerMemory(
  question: string,
  userId: string,
  dbClient: MemoryDbClient,
  options: AnswerMemoryOptions = {},
): Promise<AnswerMemoryResult> {
  const totalStart = performance.now();
  const normalizedQuestion = question.trim();
  const lang = options.responseLanguage ?? "en";
  const answerStrategy = options.answerStrategy ?? "auto";
  const timeZone = resolveMemoryTimeZone(options.timeZone);
  const intent = detectMemoryIntent(normalizedQuestion);

  if (!normalizedQuestion) {
    return noMemoryResult(lang === "vi" ? "Bạn chưa nhập câu hỏi." : "Please enter a question.", lang);
  }

  const inferredFilters = inferRetrievalFilters(
    normalizedQuestion,
    options.now ?? new Date(),
    timeZone,
  );
  const broadTemporalSynthesis = isBroadTemporalSynthesisQuestion(
    normalizedQuestion,
    intent,
    inferredFilters,
  );
  const appliedFilters = {
    ...inferredFilters,
    ...options.filters,
    limit: Math.min(
      Math.max(
        options.limit ?? (broadTemporalSynthesis ? 20 : DEFAULT_RETRIEVAL_CANDIDATE_LIMIT),
        DEFAULT_RETRIEVAL_CANDIDATE_LIMIT,
      ),
      20,
    ),
    maxDistance: options.maxDistance ?? DEFAULT_MAX_DISTANCE,
  };

  const preRetrieveStart = performance.now();
  const unindexedDiaryChunks = await retrieveUnindexedEvidence(
    dbClient,
    userId,
    appliedFilters,
  );
  const preRetrieveMs = performance.now() - preRetrieveStart;

  const useAutoFastPath = answerStrategy === "auto" &&
    shouldUseAutoFastPath(normalizedQuestion, intent, appliedFilters);
  const canUseFastPath = answerStrategy === "fast" || useAutoFastPath;
  const baseRoutingTrace = {
    intent,
    requestedStrategy: answerStrategy,
    autoFastEligible: useAutoFastPath,
    fastPathEligible: canUseFastPath,
  } satisfies Pick<
    RoutingTrace,
    "intent" | "requestedStrategy" | "autoFastEligible" | "fastPathEligible"
  >;

  const unindexedFastPathResult = canUseFastPath
    ? answerSingleDayFastPath(
        normalizedQuestion,
        unindexedDiaryChunks,
        appliedFilters,
        lang,
        options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
        timeZone,
      ) ?? answerTemporalRangeFastPath(
        normalizedQuestion,
        unindexedDiaryChunks,
        appliedFilters,
        lang,
        options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
        timeZone,
      )
    : null;
  if (unindexedFastPathResult) {
    const translatedUnindexedFastPathResult = await translateFastAnswerIfUseful(
      unindexedFastPathResult,
      {
        question: normalizedQuestion,
        responseLanguage: lang,
        generateTranslation: options.generateTranslation,
      },
    );

    if (unindexedFastPathResult.analytics) {
      translatedUnindexedFastPathResult.analytics!.timing.embedMs = 0;
      translatedUnindexedFastPathResult.analytics!.timing.retrieveMs = Math.round(preRetrieveMs);
      translatedUnindexedFastPathResult.analytics!.timing.preRetrieveMs = Math.round(preRetrieveMs);
      translatedUnindexedFastPathResult.analytics!.timing.rerankMs = 0;
      translatedUnindexedFastPathResult.analytics!.timing.firstResultMs = Math.round(
        preRetrieveStart + preRetrieveMs - totalStart,
      );
      translatedUnindexedFastPathResult.analytics!.timing.totalMs = Math.round(performance.now() - totalStart);
      translatedUnindexedFastPathResult.analytics!.timing.fullAnswerMs =
        translatedUnindexedFastPathResult.analytics!.timing.totalMs;
      translatedUnindexedFastPathResult.analytics!.embeddingCache = {
        status: "skipped",
        layer: "none",
      };
      translatedUnindexedFastPathResult.analytics!.tokenUsage.model =
        translatedUnindexedFastPathResult.analytics!.tokenUsage.model === "temporal-fast-path"
          ? "unindexed-diary-temporal-fast-path"
          : translatedUnindexedFastPathResult.analytics!.tokenUsage.model === "fast-path"
            ? "unindexed-diary-fast-path"
            : translatedUnindexedFastPathResult.analytics!.tokenUsage.model;
    }

    translatedUnindexedFastPathResult.debugTrace = buildDebugTrace({
      question: normalizedQuestion,
      inferredFilters,
      appliedFilters,
      chunks: unindexedDiaryChunks,
      result: translatedUnindexedFastPathResult,
      routingTrace: {
        ...baseRoutingTrace,
        selectedPath: "unindexed_fast_path",
        reason: "A direct date/range question matched diary rows that were saved but not indexed yet.",
        usedUnindexedDiary: true,
        translationRan: didTranslationRun(unindexedFastPathResult, translatedUnindexedFastPathResult),
      },
    });

    return translatedUnindexedFastPathResult;
  }

  let preSqlRetrieveMs = 0;
  let preSqlRerankMs = 0;
  if (canUseFastPath && shouldTrySqlFastPath(appliedFilters)) {
    const lexical = await retrieveLexicalFallbackEvidenceMeasured({
      question: normalizedQuestion,
      userId,
      dbClient,
      filters: appliedFilters,
      unindexedChunks: unindexedDiaryChunks,
    });
    preSqlRetrieveMs = lexical.retrieveMs;
    preSqlRerankMs = lexical.rerankMs;
    const firstResultMs = performance.now() - totalStart;
    const sqlFastPathResult = answerSingleDayFastPath(
      normalizedQuestion,
      lexical.chunks,
      appliedFilters,
      lang,
      options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
      timeZone,
    ) ?? answerTemporalRangeFastPath(
      normalizedQuestion,
      lexical.chunks,
      appliedFilters,
      lang,
      options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
      timeZone,
    );

    if (sqlFastPathResult) {
      const result = await translateFastAnswerIfUseful(sqlFastPathResult, {
        question: normalizedQuestion,
        responseLanguage: lang,
        generateTranslation: options.generateTranslation,
      });
      applyPipelineTiming(result, {
        preRetrieveMs,
        embedMs: 0,
        retrieveMs: lexical.retrieveMs,
        rerankMs: lexical.rerankMs,
        firstResultMs,
        totalMs: performance.now() - totalStart,
        embeddingCache: { status: "skipped", layer: "none" },
      });
      result.debugTrace = buildDebugTrace({
        question: normalizedQuestion,
        inferredFilters,
        appliedFilters,
        chunks: lexical.chunks,
        result,
        routingTrace: {
          ...baseRoutingTrace,
          selectedPath: "indexed_fast_path",
          reason: "An exact date/range filter was answered through SQL lexical/temporal retrieval before embedding.",
          usedUnindexedDiary: unindexedDiaryChunks.length > 0,
          translationRan: didTranslationRun(sqlFastPathResult, result),
        },
      });
      return result;
    }
  }

  const embedStart = performance.now();
  let embedding: number[];
  let embeddingCache: NonNullable<
    NonNullable<AnswerMemoryResult["analytics"]>["embeddingCache"]
  > = { status: "unknown", layer: "unknown" };
  try {
    const embedded = await embedQueryWithMetadata(
      options.embeddingProvider ?? createDefaultEmbeddingProvider(),
      normalizedQuestion,
    );
    embedding = embedded.embedding;
    embeddingCache = {
      status: embedded.cacheStatus,
      layer: embedded.cacheLayer,
    };
  } catch (error) {
    const embedMs = performance.now() - embedStart;
    embeddingCache = { status: "cold", layer: "remote" };
    const modelError = classifyModelError(error);
    let fallbackChunks = [...unindexedDiaryChunks];
    let lexicalRetrieveMs = 0;
    let rerankMs = 0;
    try {
      const lexical = await retrieveLexicalFallbackEvidenceMeasured({
        question: normalizedQuestion,
        userId,
        dbClient,
        filters: appliedFilters,
        unindexedChunks: unindexedDiaryChunks,
      });
      fallbackChunks = lexical.chunks;
      lexicalRetrieveMs = lexical.retrieveMs;
      rerankMs = lexical.rerankMs;
    } catch (lexicalError) {
      console.warn("[AnswerMemory] Lexical fallback retrieval failed:", lexicalError);
    }
    const retrieveMs = preRetrieveMs + preSqlRetrieveMs + lexicalRetrieveMs;
    rerankMs += preSqlRerankMs;
    const firstResultMs = performance.now() - totalStart;
    const unavailableMessage = modelError.kind === "quota"
      ? lang === "vi"
        ? "Tuturuuu AI đang bị giới hạn quota/rate limit nên mình chưa thể tìm kiếm AI lúc này."
        : "Tuturuuu AI is currently quota/rate limited, so AI search is unavailable right now."
      : lang === "vi"
        ? "Tuturuuu AI hiện không khả dụng, nên mình chưa thể tìm kiếm AI lúc này."
        : "Tuturuuu AI is currently unavailable, so AI search is unavailable right now.";
    const beforeTranslation = fallbackChunks.length
      ? await answerFromChunks(normalizedQuestion, fallbackChunks, {
          minTopSimilarity: options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
          responseLanguage: lang,
          answerStrategy: "fast",
          timeZone,
        })
      : noMemoryResult(unavailableMessage, lang);
    const result = await translateFastAnswerIfUseful(beforeTranslation, {
      question: normalizedQuestion,
      responseLanguage: lang,
      generateTranslation: options.generateTranslation,
    });

    result.modelError = modelError;
    result.analytics = result.analytics ?? buildQueryAnalytics({
      model: "n/a",
      chunksRetrieved: fallbackChunks.length,
      status: "error",
      answerMode: result.answerMode,
    });
    result.analytics.timing.embedMs = Math.round(embedMs);
    result.analytics.timing.retrieveMs = Math.round(retrieveMs);
    result.analytics.timing.preRetrieveMs = Math.round(preRetrieveMs);
    result.analytics.timing.rerankMs = Math.round(rerankMs);
    result.analytics.timing.firstResultMs = Math.round(firstResultMs);
    result.analytics.timing.totalMs = Math.round(performance.now() - totalStart);
    result.analytics.timing.fullAnswerMs = result.analytics.timing.totalMs;
    result.analytics.embeddingCache = embeddingCache;
    if (!fallbackChunks.length) {
      result.analytics.status = "error";
    }

    result.debugTrace = buildDebugTrace({
      question: normalizedQuestion,
      inferredFilters,
      appliedFilters,
      chunks: fallbackChunks,
      result,
      routingTrace: {
        ...baseRoutingTrace,
        selectedPath: "embedding_error_fallback",
        reason: fallbackChunks.length
          ? "Embedding failed, so indexed memory retrieval used lexical/date fallback and skipped full generation."
          : "Embedding failed before any supported lexical/date fallback evidence could be found.",
        usedUnindexedDiary: unindexedDiaryChunks.length > 0,
        translationRan: didTranslationRun(beforeTranslation, result),
      },
      diagnostics: await maybeGetMemoryIndexDiagnostics(
        dbClient,
        userId,
        appliedFilters,
        result,
        fallbackChunks.length,
      ),
    });

    return result;
  }
  const embedMs = performance.now() - embedStart;

  const retrieved = await retrieveEmbeddedEvidenceMeasured({
    question: normalizedQuestion,
    userId,
    dbClient,
    embedding,
    filters: appliedFilters,
    intent,
    unindexedChunks: unindexedDiaryChunks,
  });
  const chunks = retrieved.chunks;
  const retrieveMs = preRetrieveMs + preSqlRetrieveMs + retrieved.retrieveMs;
  const rerankMs = preSqlRerankMs + retrieved.rerankMs;
  const firstResultMs = performance.now() - totalStart;

  if (!chunks.length) {
    const createdDateMismatchResult = await maybeBuildCreatedDateMismatchResult(
      dbClient,
      userId,
      appliedFilters,
      lang,
      timeZone,
      {
        embedMs,
        retrieveMs,
        totalMs: performance.now() - totalStart,
      },
    );

    if (createdDateMismatchResult) {
      applyPipelineTiming(createdDateMismatchResult, {
        preRetrieveMs,
        embedMs,
        retrieveMs,
        rerankMs,
        firstResultMs,
        totalMs: performance.now() - totalStart,
        embeddingCache,
      });
      createdDateMismatchResult.debugTrace = buildDebugTrace({
        question: normalizedQuestion,
        inferredFilters,
        appliedFilters,
        chunks,
        result: createdDateMismatchResult,
        routingTrace: {
          ...baseRoutingTrace,
          selectedPath: "created_date_mismatch",
          reason: "No memory matched the requested memory date, but diary rows created on that date had a different entry date.",
          usedUnindexedDiary: false,
          translationRan: false,
        },
        diagnostics: await maybeGetMemoryIndexDiagnostics(
          dbClient,
          userId,
          appliedFilters,
          createdDateMismatchResult,
          chunks.length,
        ),
      });
      return createdDateMismatchResult;
    }
  }

  const fastPathResult = canUseFastPath
    ? answerSingleDayFastPath(
        normalizedQuestion,
        chunks,
        appliedFilters,
        lang,
        options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
        timeZone,
      ) ?? answerTemporalRangeFastPath(
        normalizedQuestion,
        chunks,
        appliedFilters,
        lang,
        options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
        timeZone,
      )
    : null;

  let selectedPath: RoutingTrace["selectedPath"] =
    fastPathResult || canUseFastPath ? "indexed_fast_path" : "deep_generation";
  let result = fastPathResult ??
    (canUseFastPath
      ? answerFastExtractiveFromChunks(
          normalizedQuestion,
          chunks,
          lang,
          options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
          timeZone,
        )
      : await answerFromChunks(normalizedQuestion, chunks, {
          minTopSimilarity: options.minTopSimilarity ?? MIN_TOP_SIMILARITY,
          responseLanguage: lang,
          answerStrategy,
          timeZone,
          generateAnswer: options.generateAnswer,
        }));
  if (result.answerMode === "extractive_fallback") {
    selectedPath = result.modelError?.kind === "validation"
      ? "deep_validation_fallback"
      : "deep_model_error_fallback";
  } else if (result.answerMode === "no_memory") {
    selectedPath = "no_memory";
  } else if (result.answerMode === "tuturuuu") {
    selectedPath = "deep_generation";
  } else if (result.answerMode === "fast_path") {
    selectedPath = "indexed_fast_path";
  }

  if (result.answerMode === "no_memory") {
    result.answer = temporalNoMemoryMessage(appliedFilters, lang, timeZone) ??
      result.answer;
  }

  const beforeTranslation = result;
  result = await translateFastAnswerIfUseful(result, {
    question: normalizedQuestion,
    responseLanguage: lang,
    generateTranslation: options.generateTranslation,
  });

  if (result.analytics) {
    result.analytics.timing.embedMs = Math.round(embedMs);
    result.analytics.timing.retrieveMs = Math.round(retrieveMs);
    result.analytics.timing.preRetrieveMs = Math.round(preRetrieveMs);
    result.analytics.timing.rerankMs = Math.round(rerankMs);
    result.analytics.timing.firstResultMs = Math.round(firstResultMs);
    result.analytics.timing.totalMs = Math.round(performance.now() - totalStart);
    result.analytics.timing.fullAnswerMs = result.analytics.timing.totalMs;
    result.analytics.embeddingCache = embeddingCache;
  }

  result.debugTrace = buildDebugTrace({
    question: normalizedQuestion,
    inferredFilters,
    appliedFilters,
    chunks,
    result,
    routingTrace: {
      ...baseRoutingTrace,
      selectedPath,
      reason: retrieved.usedLatestFallback
        ? `${describeSelectedPath(selectedPath, canUseFastPath, answerStrategy)} The recent window was empty, so retrieval used the latest available memories.`
        : describeSelectedPath(selectedPath, canUseFastPath, answerStrategy),
      usedUnindexedDiary: unindexedDiaryChunks.length > 0,
      translationRan: didTranslationRun(beforeTranslation, result),
    },
    diagnostics: await maybeGetMemoryIndexDiagnostics(
      dbClient,
      userId,
      appliedFilters,
      result,
      chunks.length,
    ),
  });

  return result;
}

function temporalNoMemoryMessage(
  filters: {
    startDate?: Date;
    endDate?: Date;
    fallbackToLatest?: boolean;
  },
  lang: "en" | "vi",
  timeZone: string,
) {
  if (
    !filters.startDate ||
    !filters.endDate ||
    filters.fallbackToLatest === true
  ) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
  const start = formatter.format(filters.startDate);
  const end = formatter.format(filters.endDate);

  if (start === end) {
    return lang === "vi"
      ? `Không có memory nào được ghi nhận trong ngày ${start}.`
      : `No memories were recorded on ${start}.`;
  }

  return lang === "vi"
    ? `Không có memory nào được ghi nhận trong khoảng ${start}–${end}.`
    : `No memories were recorded between ${start} and ${end}.`;
}

function shouldTrySqlFastPath(filters: {
  startDate?: Date;
  endDate?: Date;
  sourceId?: string;
  sourceIds?: string[];
}) {
  return Boolean(
    (filters.startDate && filters.endDate) ||
      filters.sourceId ||
      filters.sourceIds?.length,
  );
}

async function embedQueryWithMetadata(
  provider: NonNullable<AnswerMemoryOptions["embeddingProvider"]>,
  question: string,
) {
  if (provider.embedQueryWithMetadata) {
    return provider.embedQueryWithMetadata(question);
  }
  return {
    embedding: await provider.embedQuery(question),
    cacheStatus: "unknown" as const,
    cacheLayer: "unknown" as const,
  };
}

function applyPipelineTiming(
  result: AnswerMemoryResult,
  input: {
    preRetrieveMs: number;
    embedMs: number;
    retrieveMs: number;
    rerankMs: number;
    firstResultMs: number;
    totalMs: number;
    embeddingCache: NonNullable<
      NonNullable<AnswerMemoryResult["analytics"]>["embeddingCache"]
    >;
  },
) {
  if (!result.analytics) return;
  result.analytics.timing.preRetrieveMs = Math.round(input.preRetrieveMs);
  result.analytics.timing.embedMs = Math.round(input.embedMs);
  result.analytics.timing.retrieveMs = Math.round(input.retrieveMs);
  result.analytics.timing.rerankMs = Math.round(input.rerankMs);
  result.analytics.timing.firstResultMs = Math.round(input.firstResultMs);
  result.analytics.timing.totalMs = Math.round(input.totalMs);
  result.analytics.timing.fullAnswerMs = Math.round(input.totalMs);
  result.analytics.embeddingCache = input.embeddingCache;
}
