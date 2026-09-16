import { authFetch, readApiError } from "./http-client";

export type AskPayload = { question: string };

export type AskResponse = {
  answer: string;
  confidence?: "high" | "medium" | "low";
  sources: unknown[];
};

export type SearchHistoryEntry = {
  id: string;
  question: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  response_language: string;
  token_count: number;
  created_at: string;
  expires_at: string;
};

export async function askSearch(
  payload: AskPayload,
  accessToken: string | null,
): Promise<AskResponse> {
  const response = await authFetch(
    "/api/search",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch answer"));
  }
  return response.json() as Promise<AskResponse>;
}

export async function getSearchHistory(
  accessToken: string | null,
): Promise<SearchHistoryEntry[]> {
  const response = await authFetch(
    "/api/search/history",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok) throw new Error("Failed to fetch search history");
  return response.json();
}

export async function deleteSearchHistoryItem(
  id: string,
  accessToken: string | null,
): Promise<void> {
  const response = await authFetch(
    `/api/search/history/${id}`,
    { method: "DELETE" },
    accessToken,
  );
  if (!response.ok) throw new Error("Failed to delete search history item");
}

export async function clearSearchHistory(
  accessToken: string | null,
): Promise<void> {
  const response = await authFetch(
    "/api/search/history",
    { method: "DELETE" },
    accessToken,
  );
  if (!response.ok) throw new Error("Failed to clear search history");
}
