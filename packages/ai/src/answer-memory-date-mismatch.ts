import type {
  AnswerMemoryResult,
  ResponseLanguage,
} from "./answer-memory-types.ts";
import { formatDateForAnswer, trimPromptQuote } from "./answer-memory-format.ts";
import { buildQueryAnalytics, noMemoryResult } from "./answer-memory-result.ts";
import {
  findDiariesCreatedInRangeWithDifferentEntryDate,
  type CreatedDiaryDateMismatch,
} from "./answer-memory-unindexed.ts";
import type { RetrievalFilters } from "./retrieval.ts";
import type { MemoryDbClient } from "./types.ts";

export async function maybeBuildCreatedDateMismatchResult(
  dbClient: MemoryDbClient,
  userId: string,
  filters: RetrievalFilters,
  lang: ResponseLanguage,
  timeZone: string,
  timing: {
    embedMs: number;
    retrieveMs: number;
    totalMs: number;
  },
): Promise<AnswerMemoryResult | null> {
  if (!filters.startDate || !filters.endDate) return null;

  const rows = await findDiariesCreatedInRangeWithDifferentEntryDate(
    dbClient,
    userId,
    filters,
  );
  if (!rows.length) return null;

  const labels = rows
    .map((row) => formatDateForAnswer(row.entryDate, lang, timeZone))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  const primaryLabel = uniqueLabels[0];
  const createdLabel = formatDateForAnswer(rows[0]!.createdAt, lang, timeZone);
  const message = buildCreatedDateMismatchMessage(
    rows,
    primaryLabel,
    createdLabel,
    lang,
    timeZone,
  );
  const result = noMemoryResult(message, lang);

  result.suggestions = primaryLabel
    ? lang === "vi"
      ? [
          `Hỏi: ngày ${primaryLabel} tôi làm gì?`,
          "Kiểm tra Memory date trên diary card",
          "Sửa entry date nếu diary đang sai ngày",
        ]
      : [
          `Ask: what did I do on ${primaryLabel}?`,
          "Check the Memory date on the diary card",
          "Edit the entry date if the diary is dated incorrectly",
        ]
    : result.suggestions;
  result.analytics = buildQueryAnalytics({
    model: "n/a",
    chunksRetrieved: 0,
    status: "no_memory",
    answerMode: "no_memory",
    timing: {
      embedMs: Math.round(timing.embedMs),
      retrieveMs: Math.round(timing.retrieveMs),
      generateMs: 0,
      totalMs: Math.round(timing.totalMs),
    },
  });

  return result;
}

function buildCreatedDateMismatchMessage(
  rows: CreatedDiaryDateMismatch[],
  primaryLabel: string | undefined,
  createdLabel: string,
  lang: ResponseLanguage,
  timeZone: string,
): string {
  const titles = rows
    .map((row) => extractDiaryTitle(row.rawText))
    .filter(Boolean)
    .slice(0, 2);
  const titleSuffix = titles.length ? ` (${titles.join(", ")})` : "";
  const dateList = rows
    .map((row) => formatDateForAnswer(row.entryDate, lang, timeZone))
    .filter(Boolean);
  const uniqueDateList = [...new Set(dateList)].join(", ");

  if (lang === "vi") {
    return [
      `Mình không tìm thấy ký ức có memory date là ${createdLabel}.`,
      `Có diary được tạo ngày đó${titleSuffix}, nhưng diary này đang được lưu với memory date ${uniqueDateList || primaryLabel}.`,
      primaryLabel
        ? `Hãy hỏi "ngày ${primaryLabel} tôi làm gì?" hoặc sửa entry date nếu bạn muốn nó thuộc ngày ${createdLabel}.`
        : "Hãy kiểm tra lại entry date của diary này.",
    ].join(" ");
  }

  return [
    `I couldn't find memories whose memory date is ${createdLabel}.`,
    `I did find diary entries created on that date${titleSuffix}, but they are stored with memory date ${uniqueDateList || primaryLabel}.`,
    primaryLabel
      ? `Try asking "what did I do on ${primaryLabel}?" or edit the entry date if it should belong to ${createdLabel}.`
      : "Check the diary entry date for that entry.",
  ].join(" ");
}

function extractDiaryTitle(rawText: string): string {
  return trimPromptQuote(rawText.split(/\r?\n/, 1)[0]?.trim() ?? "", 80);
}
