import { calculateFailureTransition } from "./reliability";
import { normalizeSourceType, type IndexingJob } from "./indexing-job";

export class RetryPolicy {
  transition(job: IndexingJob, error: unknown) {
    const message = this.toErrorMessage(error).slice(0, 4000);
    const requiresReconnect = this.isGoogleReconnectRequired(message);
    return {
      ...calculateFailureTransition({
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
        requiresReconnect,
        baseDelayMs: Number(process.env.INDEXING_RETRY_BASE_MS ?? 30_000),
        maxDelayMs: Number(process.env.INDEXING_RETRY_MAX_MS ?? 15 * 60_000),
      }),
      message,
      requiresReconnect,
    };
  }

  googleSource(sourceType: string) {
    const source = normalizeSourceType(sourceType);
    return ["calendar", "contact", "drive", "gmail"].includes(source)
      ? source
      : null;
  }

  toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private isGoogleReconnectRequired(message: string) {
    const value = message.toLowerCase();
    return (
      /\binvalid_(grant|credentials)\b/i.test(message) ||
      value.includes("invalid credentials") ||
      value.includes("token has been expired") ||
      value.includes("token has been revoked") ||
      value.includes("token expired") ||
      value.includes("unauthorized") ||
      value.includes("401") ||
      value.includes("insufficient authentication scopes") ||
      value.includes("insufficient permission") ||
      value.includes("insufficient scope") ||
      value.includes("insufficient_scope") ||
      (value.includes("forbidden") &&
        (value.includes("scope") || value.includes("permission")))
    );
  }
}
