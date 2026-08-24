import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_WHISPER_MODEL = "Xenova/whisper-tiny";
const WHISPER_SAMPLE_RATE = 16_000;
const BYTES_PER_FLOAT_32 = 4;
const DEFAULT_AUDIO_MAX_DURATION_SECONDS = 30 * 60;
const DEFAULT_FFMPEG_TIMEOUT_MS = 2 * 60_000;
const FFMPEG_DURATION_PROBE_SECONDS = 1;

let transcriberPromise: Promise<any> | undefined;

export function assertLocalAudioTranscriptionReady() {
  const result = spawnSync("ffmpeg", ["-version"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim();
    throw new Error(
      [
        'AUDIO_TRANSCRIPTION_PROVIDER="local" requires ffmpeg on PATH.',
        "Install ffmpeg or use the official worker image, which includes it.",
        detail ? `ffmpeg check failed: ${detail}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
}

export async function transcribeAudioLocally(input: {
  buffer: Buffer;
  fileName: string;
}) {
  const audio = await convertToWhisperPcm(input.buffer, input.fileName);
  const transcriber = await getWhisperTranscriber();
  const language = process.env.AUDIO_TRANSCRIPTION_LANGUAGE?.trim();
  const result = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    task: "transcribe",
    ...(language ? { language } : {}),
  });
  const text = readTranscriptionText(result);
  if (!text) {
    throw new Error("Local Whisper transcription returned empty text.");
  }
  return text;
}

async function getWhisperTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir =
        process.env.WHISPER_CACHE_DIR?.trim() ||
        join(tmpdir(), "second-brain-whisper-cache");
      const model =
        process.env.WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL;
      console.log(`[Audio Transcription] Loading local model ${model}`);
      return pipeline("automatic-speech-recognition", model, {
        dtype: "q8",
      });
    })().catch((error) => {
      transcriberPromise = undefined;
      throw error;
    });
  }
  return transcriberPromise;
}

async function convertToWhisperPcm(buffer: Buffer, fileName: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "local-whisper-"));
  const extension = safeAudioExtension(fileName);
  const inputPath = join(tempDir, `input${extension}`);
  const outputPath = join(tempDir, "audio.f32le");
  const maxDurationSeconds = getAudioMaxDurationSeconds();
  const ffmpegTimeoutMs = getFfmpegTimeoutMs();

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        inputPath,
        "-t",
        String(maxDurationSeconds + FFMPEG_DURATION_PROBE_SECONDS),
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(WHISPER_SAMPLE_RATE),
        "-acodec",
        "pcm_f32le",
        "-f",
        "f32le",
        outputPath,
      ],
      {
        timeout: ffmpegTimeoutMs,
        windowsHide: true,
      },
    );
    const pcm = await readFile(outputPath);
    assertPcmDurationWithinLimit(pcm.byteLength, maxDurationSeconds);
    return float32ViewFromBuffer(pcm);
  } catch (error) {
    if (isTimedOutProcessError(error)) {
      throw new Error(
        `Local audio preparation failed: ffmpeg exceeded its ${ffmpegTimeoutMs} ms runtime limit.`,
      );
    }
    throw new Error(
      `Local audio preparation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function assertPcmDurationWithinLimit(
  byteLength: number,
  maxDurationSeconds: number,
) {
  const maxPcmBytes =
    maxDurationSeconds * WHISPER_SAMPLE_RATE * BYTES_PER_FLOAT_32;
  if (byteLength > maxPcmBytes) {
    throw new Error(
      `Audio exceeds the ${maxDurationSeconds} second local transcription limit. Set AUDIO_TRANSCRIPTION_MAX_DURATION_SECONDS to a safe higher value if needed.`,
    );
  }
  if (byteLength % BYTES_PER_FLOAT_32 !== 0) {
    throw new Error("ffmpeg returned an invalid float32 PCM byte length.");
  }
}

export function float32ViewFromBuffer(buffer: Buffer) {
  if (
    buffer.byteOffset % BYTES_PER_FLOAT_32 === 0 &&
    buffer.byteLength % BYTES_PER_FLOAT_32 === 0
  ) {
    return new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / BYTES_PER_FLOAT_32,
    );
  }

  const aligned = new Uint8Array(buffer.byteLength);
  aligned.set(buffer);
  return new Float32Array(aligned.buffer);
}

function getAudioMaxDurationSeconds() {
  const configured = Number(
    process.env.AUDIO_TRANSCRIPTION_MAX_DURATION_SECONDS ??
      DEFAULT_AUDIO_MAX_DURATION_SECONDS,
  );
  if (!Number.isFinite(configured)) return DEFAULT_AUDIO_MAX_DURATION_SECONDS;
  return Math.min(Math.max(Math.trunc(configured), 30), 2 * 60 * 60);
}

function getFfmpegTimeoutMs() {
  const configured = Number(
    process.env.AUDIO_TRANSCRIPTION_FFMPEG_TIMEOUT_MS ??
      DEFAULT_FFMPEG_TIMEOUT_MS,
  );
  if (!Number.isFinite(configured)) return DEFAULT_FFMPEG_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(configured), 10_000), 10 * 60_000);
}

function isTimedOutProcessError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("killed" in error || "code" in error) &&
      ((error as { killed?: unknown }).killed === true ||
        (error as { code?: unknown }).code === "ETIMEDOUT"),
  );
}

function safeAudioExtension(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : ".audio";
}

function readTranscriptionText(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const text = (result as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}
