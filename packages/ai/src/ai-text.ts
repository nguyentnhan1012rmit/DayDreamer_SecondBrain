import {
  generateTuturuuuText,
} from "./tuturuuu-client.ts";

export interface GenerateAiTextOptions {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function generateAiText(
  options: GenerateAiTextOptions,
): Promise<string> {
  const result = await generateTuturuuuText({
    model: options.model,
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
  return result.output.trim();
}
