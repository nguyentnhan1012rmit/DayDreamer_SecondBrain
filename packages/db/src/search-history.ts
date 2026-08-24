/**
 * Search History & Cache helpers for the Second Brain project.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type SearchHistoryScope = {
  sourceType: string;
  sourceId: string;
};

export interface SaveSearchHistoryInput {
  userId: string;
  question: string;
  answer: string;
  confidence: string;
  sourcesJson?: string | null;
  analyticsJson?: string | null;
  responseLanguage: string;
  tokenCount: number;
  cacheEligible?: boolean;
  sourceScope?: SearchHistoryScope | null;
}

export async function saveSearchHistory(
  client: any,
  input: SaveSearchHistoryInput,
) {
  const now = new Date();
  const expiresAt =
    input.cacheEligible === false
      ? now
      : new Date(now.getTime() + CACHE_TTL_MS);

  return client.searchHistory.create({
    data: {
      user_id: input.userId,
      question: input.question,
      answer: input.answer,
      confidence: input.confidence,
      sources_json: input.sourcesJson ?? null,
      analytics_json: serializeHistoryAnalytics(
        input.analyticsJson,
        input.sourceScope,
      ),
      response_language: input.responseLanguage,
      token_count: input.tokenCount,
      created_at: now,
      expires_at: expiresAt,
    },
  });
}

export async function findCachedAnswer(
  client: any,
  userId: string,
  question: string,
  responseLanguage: string,
) {
  const now = new Date();
  return client.searchHistory.findFirst({
    where: {
      user_id: userId,
      question: question,
      response_language: responseLanguage,
      expires_at: { gt: now },
    },
    orderBy: { created_at: "desc" },
  });
}

export async function getUserSearchHistory(
  client: any,
  userId: string,
  limit: number = 20,
) {
  const rows: unknown = await client.searchHistory.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      question: true,
      answer: true,
      confidence: true,
      response_language: true,
      token_count: true,
      created_at: true,
      expires_at: true,
      analytics_json: true,
    },
  });

  if (!Array.isArray(rows)) return [];

  return rows.map((value) => {
    const row = isRecord(value) ? value : {};
    const { analytics_json: analyticsJson, ...historyEntry } = row;
    return {
      ...historyEntry,
      source_scope: parseHistoryScope(analyticsJson),
    };
  });
}

function serializeHistoryAnalytics(
  analyticsJson: string | null | undefined,
  sourceScope: SearchHistoryScope | null | undefined,
) {
  if (!sourceScope) return analyticsJson ?? null;

  const parsed = parseJsonRecord(analyticsJson);
  return JSON.stringify({
    ...(parsed ?? {}),
    queryScope: sourceScope,
  });
}

function parseHistoryScope(value: unknown): SearchHistoryScope | null {
  const analytics = typeof value === "string" ? parseJsonRecord(value) : null;
  const scope = analytics?.queryScope;
  if (!isRecord(scope)) return null;

  const sourceType =
    typeof scope.sourceType === "string" ? scope.sourceType.trim() : "";
  const sourceId =
    typeof scope.sourceId === "string" ? scope.sourceId.trim() : "";
  return sourceType && sourceId ? { sourceType, sourceId } : null;
}

function parseJsonRecord(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function deleteSearchHistoryItem(
  client: any,
  userId: string,
  id: string,
) {
  return client.searchHistory.deleteMany({
    where: { id, user_id: userId },
  });
}

export async function clearUserSearchHistory(client: any, userId: string) {
  return client.searchHistory.deleteMany({
    where: { user_id: userId },
  });
}
