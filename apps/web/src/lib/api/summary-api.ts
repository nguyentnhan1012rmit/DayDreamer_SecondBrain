import { authFetch } from "./http-client";

export type SummaryType = "daily" | "weekly" | "monthly" | "yearly";

export type SummaryRecord = {
  id: string;
  type: SummaryType;
  content: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

export type GenerateSummaryPayload = {
  type: SummaryType;
  date?: string;
  force?: boolean;
};

export type GenerateSummaryResponse = {
  generated: boolean;
  summary: SummaryRecord;
  memoryIndexingStatus?: "queued" | "succeeded" | "failed";
};

async function summaryError(response: Response, fallback: string) {
  const error = await response.json().catch(() => ({ message: fallback }));
  throw new Error(error.message || `HTTP ${response.status}`);
}

export async function getSummaries(
  accessToken: string | null,
  options: { type?: SummaryType; limit?: number } = {},
): Promise<SummaryRecord[]> {
  const params = new URLSearchParams();
  if (options.type) params.set("type", options.type);
  if (options.limit) params.set("limit", String(options.limit));

  const endpoint = `/api/summary${params.toString() ? `?${params}` : ""}`;
  const response = await authFetch(endpoint, { method: "GET" }, accessToken);
  if (!response.ok) await summaryError(response, "Failed to fetch summaries");

  const data = (await response.json()) as { summaries?: SummaryRecord[] };
  return data.summaries ?? [];
}

export async function generateSummary(
  payload: GenerateSummaryPayload,
  accessToken: string | null,
): Promise<GenerateSummaryResponse> {
  const response = await authFetch(
    "/api/summary",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  if (!response.ok) await summaryError(response, "Failed to generate summary");
  return response.json();
}
