import { randomUUID } from "node:crypto";

export const DEFAULT_TUTURUUU_API_BASE_URL = "https://ai.tuturuuu.com/v1";
export const DEFAULT_TUTURUUU_RESPONSE_MODEL = "google/gemini-3.5-flash-lite";
export const DEFAULT_TUTURUUU_EMBEDDING_MODEL = "google/gemini-embedding-2";
const DEFAULT_TUTURUUU_REQUEST_TIMEOUT_MS = 30_000;
const MAX_TUTURUUU_REQUEST_TIMEOUT_MS = 5 * 60_000;

export type TuturuuuJsonSchema = Record<string, unknown>;

export interface TuturuuuTokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface TuturuuuGenerateTextOptions {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseSchema?: TuturuuuJsonSchema;
  responseSchemaName?: string;
  responseSchemaDescription?: string;
  responseSchemaStrict?: boolean;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseInput?: TuturuuuResponseInput;
}

export interface TuturuuuGenerateTextResult {
  output: string;
  finishReason?: string;
  usage?: TuturuuuTokenUsage;
  model: string;
  requestId?: string;
}

export interface TuturuuuEmbeddingOptions {
  input: string | string[];
  model?: string;
  dimensions?: number;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TuturuuuEmbeddingResult {
  embeddings: number[][];
  usage?: TuturuuuTokenUsage;
  model: string;
  requestId?: string;
}

export type TuturuuuResponseInput =
  | string
  | Array<{
      role: "user" | "system" | "assistant";
      content: Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string }
        | {
            type: "input_audio";
            input_audio: {
              data: string;
              format: "mp3" | "wav";
            };
          }
        | {
            type: "input_file";
            filename: string;
            file_data?: string;
            file_url?: string;
          }
      >;
    }>;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value.replace(/^"|"$/g, "") : undefined;
}

export function getTuturuuuApiKey(): string | undefined {
  return readEnv("TUTURUUU_AI_API_KEY");
}

export function requireTuturuuuApiKey(): string {
  const apiKey = getTuturuuuApiKey();
  if (!apiKey) {
    throw new Error(
      "TUTURUUU_AI_API_KEY is required to call the metered Tuturuuu AI API.",
    );
  }
  return apiKey;
}

export function canUseTuturuuuApi(): boolean {
  return Boolean(getTuturuuuApiKey());
}

export function getTuturuuuApiBaseUrl(): string {
  return (
    readEnv("TUTURUUU_AI_BASE_URL") ?? DEFAULT_TUTURUUU_API_BASE_URL
  ).replace(/\/+$/g, "");
}

export function normalizeTuturuuuModelName(
  model: string | undefined,
  fallback: string,
): string {
  const value = model?.trim();
  if (!value) return fallback;

  const normalized = value.startsWith("google/") ? value : `google/${value}`;

  if (
    normalized === "google/gemini-embedding-001" ||
    normalized === "google/text-embedding-004"
  ) {
    return DEFAULT_TUTURUUU_EMBEDDING_MODEL;
  }

  return normalized;
}

export async function generateTuturuuuText(
  options: TuturuuuGenerateTextOptions,
): Promise<TuturuuuGenerateTextResult> {
  const model = normalizeTuturuuuModelName(
    options.model,
    DEFAULT_TUTURUUU_RESPONSE_MODEL,
  );
  const requestId = options.requestId ?? randomUUID();
  const responseSchemaStrict = options.responseSchemaStrict ?? true;
  const payload = await requestTuturuuuJson("/responses", {
    method: "POST",
    requestId,
    idempotencyKey: options.idempotencyKey ?? requestId,
    body: {
      model,
      instructions: options.systemPrompt,
      input: options.responseInput ?? options.prompt,
      max_output_tokens: options.maxOutputTokens,
      temperature: normalizeTemperature(options.temperature),
      text: options.responseSchema
        ? {
            format: {
              type: "json_schema",
              name: normalizeResponseSchemaName(options.responseSchemaName),
              description: options.responseSchemaDescription,
              schema: responseSchemaStrict
                ? toStrictJsonSchema(options.responseSchema)
                : options.responseSchema,
              strict: responseSchemaStrict,
            },
          }
        : undefined,
    },
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });

  const output = extractOutputText(payload).trim();
  if (!output) {
    throw new Error("Tuturuuu AI API returned an empty output_text.");
  }

  return {
    output,
    finishReason:
      readString(payload, "finish_reason") ??
      readString(payload, "finishReason"),
    usage: normalizeUsage((payload as Record<string, unknown>).usage),
    model: readString(payload, "model") ?? model,
    requestId: payload.requestId,
  };
}

export async function generateTuturuuuVisionText(options: {
  prompt: string;
  base64Data?: string;
  imageUrl?: string;
  mimeType: string;
  model?: string;
  maxOutputTokens?: number;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<TuturuuuGenerateTextResult> {
  const imageUrl =
    options.imageUrl ??
    (options.base64Data
      ? `data:${options.mimeType};base64,${options.base64Data}`
      : undefined);
  if (!imageUrl) {
    throw new Error("Vision input requires imageUrl or base64Data.");
  }

  return generateTuturuuuText({
    model: options.model,
    prompt: options.prompt,
    maxOutputTokens: options.maxOutputTokens,
    idempotencyKey: options.idempotencyKey,
    requestId: options.requestId,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    responseInput: [
      {
        role: "user",
        content: [
          { type: "input_text", text: options.prompt },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
  });
}

export async function generateTuturuuuFileText(options: {
  prompt: string;
  fileName: string;
  fileUrl?: string;
  base64Data?: string;
  mimeType: string;
  model?: string;
  maxOutputTokens?: number;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<TuturuuuGenerateTextResult> {
  const fileInput = options.fileUrl
    ? {
        type: "input_file" as const,
        filename: options.fileName,
        file_url: options.fileUrl,
      }
    : options.base64Data
      ? {
          type: "input_file" as const,
          filename: options.fileName,
          file_data: `data:${options.mimeType};base64,${options.base64Data}`,
        }
      : null;
  if (!fileInput) {
    throw new Error("File input requires fileUrl or base64Data.");
  }

  return generateTuturuuuText({
    model: options.model,
    prompt: options.prompt,
    maxOutputTokens: options.maxOutputTokens,
    idempotencyKey: options.idempotencyKey,
    requestId: options.requestId,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    responseInput: [
      {
        role: "user",
        content: [{ type: "input_text", text: options.prompt }, fileInput],
      },
    ],
  });
}

export async function generateTuturuuuAudioTranscript(options: {
  prompt: string;
  base64Data: string;
  mimeType: string;
  fileName: string;
  model?: string;
  maxOutputTokens?: number;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<TuturuuuGenerateTextResult> {
  const format = getAudioInputFormat(options.mimeType, options.fileName);

  return generateTuturuuuText({
    model: options.model,
    prompt: options.prompt,
    maxOutputTokens: options.maxOutputTokens,
    idempotencyKey: options.idempotencyKey,
    requestId: options.requestId,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    responseInput: [
      {
        role: "user",
        content: [
          { type: "input_text", text: options.prompt },
          {
            type: "input_audio",
            input_audio: {
              data: options.base64Data,
              format,
            },
          },
        ],
      },
    ],
  });
}

function getAudioInputFormat(
  mimeType: string,
  fileName: string,
): "mp3" | "wav" {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  if (
    normalizedMimeType === "audio/wav" ||
    normalizedMimeType === "audio/x-wav" ||
    normalizedFileName.endsWith(".wav")
  ) {
    return "wav";
  }
  if (
    normalizedMimeType === "audio/mpeg" ||
    normalizedMimeType === "audio/mp3" ||
    normalizedFileName.endsWith(".mp3")
  ) {
    return "mp3";
  }

  throw new Error(
    `Audio input must be normalized to MP3 or WAV before transcription (received ${mimeType}).`,
  );
}

export async function embedTuturuuu(
  options: TuturuuuEmbeddingOptions,
): Promise<TuturuuuEmbeddingResult> {
  const model = normalizeTuturuuuModelName(
    options.model,
    DEFAULT_TUTURUUU_EMBEDDING_MODEL,
  );
  const requestId = options.requestId ?? randomUUID();
  const payload = await requestTuturuuuJson("/embeddings", {
    method: "POST",
    requestId,
    idempotencyKey: options.idempotencyKey ?? requestId,
    body: {
      model,
      input: options.input,
      dimensions: options.dimensions,
    },
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });

  const embeddings = extractEmbeddings(payload);
  if (!embeddings.length) {
    throw new Error("Tuturuuu AI embeddings request returned no vectors.");
  }

  return {
    embeddings,
    usage: normalizeUsage((payload as Record<string, unknown>).usage),
    model: readString(payload, "model") ?? model,
    requestId: payload.requestId,
  };
}

async function requestTuturuuuJson(
  path: string,
  options: {
    method: "GET" | "POST";
    requestId: string;
    idempotencyKey?: string;
    body?: Record<string, unknown>;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<Record<string, unknown> & { requestId?: string }> {
  const timeoutMs = resolveRequestTimeoutMs(options.timeoutMs);
  const abortContext = createRequestAbortContext(timeoutMs, options.signal);

  try {
    const response = await fetch(`${getTuturuuuApiBaseUrl()}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${requireTuturuuuApiKey()}`,
        "Content-Type": "application/json",
        "X-Request-Id": options.requestId,
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: options.body
        ? JSON.stringify(stripUndefined(options.body))
        : undefined,
      signal: abortContext.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch (error) {
      if (abortContext.signal.aborted) throw error;
    }
    const responseRequestId =
      response.headers.get("x-request-id") ?? options.requestId;
    if (!response.ok) {
      const error = buildTuturuuuError(
        payload,
        response.status,
        responseRequestId,
      );
      throw error;
    }

    if (!payload || typeof payload !== "object") {
      throw new Error(
        `Tuturuuu AI API returned a non-JSON response (${responseRequestId}).`,
      );
    }

    return {
      ...(payload as Record<string, unknown>),
      requestId: responseRequestId,
    };
  } catch (error) {
    if (abortContext.didTimeout()) {
      throw buildTuturuuuTimeoutError(timeoutMs, options.requestId);
    }
    throw error;
  } finally {
    abortContext.cleanup();
  }
}

function resolveRequestTimeoutMs(value: number | undefined): number {
  const configured = Number(
    value ??
      readEnv("TUTURUUU_REQUEST_TIMEOUT_MS") ??
      DEFAULT_TUTURUUU_REQUEST_TIMEOUT_MS,
  );
  if (!Number.isFinite(configured)) return DEFAULT_TUTURUUU_REQUEST_TIMEOUT_MS;
  return Math.min(
    MAX_TUTURUUU_REQUEST_TIMEOUT_MS,
    Math.max(100, Math.floor(configured)),
  );
}

function createRequestAbortContext(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    onExternalAbort();
  } else {
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function buildTuturuuuTimeoutError(timeoutMs: number, requestId: string): Error {
  const error = new Error(
    `Tuturuuu AI request timed out after ${timeoutMs}ms (${requestId}).`,
  );
  error.name = "TuturuuuTimeoutError";
  (error as { code?: string }).code = "TUTURUUU_TIMEOUT";
  (error as { status?: number }).status = 408;
  return error;
}

function normalizeTemperature(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error("Tuturuuu temperature must be a finite number from 0 to 2.");
  }
  return value;
}

function normalizeResponseSchemaName(value: string | undefined): string {
  const normalized = (value ?? "structured_response")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "structured_response";
}

function toStrictJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStrictJsonSchema);
  if (!value || typeof value !== "object") return value;

  const schema = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      toStrictJsonSchema(item),
    ]),
  );
  if (schema.type === "object" && schema.additionalProperties === undefined) {
    schema.additionalProperties = false;
  }
  return schema;
}

function buildTuturuuuError(
  payload: unknown,
  status: number,
  requestId: string,
): Error {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : {};
  const code =
    readString(nested, "code") ??
    readString(record, "code") ??
    "request_failed";
  const message =
    readString(nested, "message") ??
    readString(record, "message") ??
    readString(record, "error") ??
    `HTTP ${status}`;
  const error = new Error(`${code}: ${message} (${requestId})`);
  (error as { status?: number }).status = status;
  return error;
}

function extractOutputText(payload: Record<string, unknown>): string {
  const direct =
    readString(payload, "output_text") ?? readString(payload, "outputText");
  if (direct) return direct;

  const output = payload.output;
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) return [];
      return content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        return (
          readString(record, "text") ?? readString(record, "output_text") ?? ""
        );
      });
    })
    .filter(Boolean)
    .join("\n");
}

function extractEmbeddings(payload: Record<string, unknown>): number[][] {
  if (Array.isArray(payload.embedding)) {
    return [coerceNumberArray(payload.embedding)];
  }

  const data = payload.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      if (!item || typeof item !== "object") return [];
      const embedding = (item as Record<string, unknown>).embedding;
      return Array.isArray(embedding) ? coerceNumberArray(embedding) : [];
    })
    .filter((embedding) => embedding.length > 0);
}

function normalizeUsage(value: unknown): TuturuuuTokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    inputTokens: readNumber(record.input_tokens ?? record.inputTokens),
    outputTokens: readNumber(record.output_tokens ?? record.outputTokens),
    reasoningTokens: readNumber(
      record.reasoning_tokens ?? record.reasoningTokens,
    ),
    totalTokens: readNumber(record.total_tokens ?? record.totalTokens),
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function coerceNumberArray(value: unknown[]): number[] {
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
