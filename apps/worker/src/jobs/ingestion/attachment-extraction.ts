import {
  generateTuturuuuAudioTranscript,
  generateTuturuuuFileText,
  generateTuturuuuVisionText,
  getTuturuuuTranscriptionModel,
  getTuturuuuVisionModel,
} from "@second-brain/ai";
import { isAudioAttachmentMimeType } from "@second-brain/shared";
import sharp from "sharp";
import {
  prepareAudioChunks,
  type PreparedAudioChunk,
} from "./audio-compression";
import {
  assertLocalAudioTranscriptionReady,
  transcribeAudioLocally,
} from "./local-audio-transcription";
import { extractImageTextLocally } from "./local-document-extraction";

export const isAudioMimeType = isAudioAttachmentMimeType;

export const MAX_AI_IMAGE_REQUEST_BYTES = 1_000_000;
const AI_IMAGE_JSON_RESERVE_BYTES = 32_000;

type ImageAttachmentExtractionInput = {
  attachmentId: string;
  buffer: Buffer;
  fileName: string;
  maxOutputTokens: number;
};

type ImageExtractionDependencies = {
  extractOcr?: (buffer: Buffer) => Promise<string>;
  extractVision?: (input: ImageAttachmentExtractionInput) => Promise<string>;
};

export function estimateImageGatewayRequestBytes(
  imageByteLength: number,
  mimeType = "image/jpeg",
) {
  const base64Bytes = 4 * Math.ceil(imageByteLength / 3);
  const dataUrlPrefixBytes = Buffer.byteLength(`data:${mimeType};base64,`);
  return base64Bytes + dataUrlPrefixBytes + AI_IMAGE_JSON_RESERVE_BYTES;
}

export async function prepareImageForExtraction(buffer: Buffer) {
  const attempts = [
    { maxDimension: 2200, quality: 84 },
    { maxDimension: 1800, quality: 76 },
    { maxDimension: 1500, quality: 68 },
    { maxDimension: 1200, quality: 58 },
    { maxDimension: 1000, quality: 50 },
    { maxDimension: 800, quality: 42 },
  ];
  let optimized = buffer;

  for (const attempt of attempts) {
    optimized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: attempt.maxDimension,
        height: attempt.maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "white" })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();

    if (
      estimateImageGatewayRequestBytes(optimized.length) <=
      MAX_AI_IMAGE_REQUEST_BYTES
    ) {
      break;
    }
  }

  const estimatedRequestBytes = estimateImageGatewayRequestBytes(
    optimized.length,
  );
  if (estimatedRequestBytes > MAX_AI_IMAGE_REQUEST_BYTES) {
    throw new Error(
      `Optimized image would create a ${estimatedRequestBytes} byte base64/JSON request, above the ${MAX_AI_IMAGE_REQUEST_BYTES} byte gateway budget.`,
    );
  }

  return { buffer: optimized, mimeType: "image/jpeg" };
}

export async function extractImageAttachmentContent(
  input: ImageAttachmentExtractionInput,
  dependencies: ImageExtractionDependencies = {},
) {
  const extractOcr = dependencies.extractOcr ?? extractImageTextLocally;
  const extractVision =
    dependencies.extractVision ??
    (async (visionInput: ImageAttachmentExtractionInput) => {
      const optimizedImage = await prepareImageForExtraction(
        visionInput.buffer,
      );
      return extractAttachmentContent({
        attachmentId: visionInput.attachmentId,
        base64Data: optimizedImage.buffer.toString("base64"),
        mimeType: optimizedImage.mimeType,
        fileName: visionInput.fileName,
        maxOutputTokens: visionInput.maxOutputTokens,
      });
    });

  let ocrText = "";
  let visionText = "";
  let ocrFailure = "";
  let visionFailure = "";

  try {
    ocrText = (await extractOcr(input.buffer)).trim();
  } catch (error) {
    ocrFailure = toErrorMessage(error);
  }

  try {
    visionText = (await extractVision(input)).trim();
  } catch (error) {
    visionFailure = toErrorMessage(error);
  }

  if (ocrText && visionText) {
    if (ocrText === visionText) return visionText;
    return `## OCR text\n${ocrText}\n\n## Vision extraction\n${visionText}`;
  }

  if (visionText) {
    if (ocrFailure) {
      console.warn(
        `[Attachment Extraction] OCR failed for ${input.attachmentId}; using vision extraction: ${ocrFailure}`,
      );
    }
    return visionText;
  }

  if (ocrText) {
    if (visionFailure) {
      console.warn(
        `[Attachment Extraction] Vision failed for ${input.attachmentId}; using OCR text: ${visionFailure}`,
      );
    }
    return ocrText;
  }

  throw new Error(
    [
      "Image contains no OCR- or vision-readable content.",
      ocrFailure ? `OCR failed: ${ocrFailure}` : "",
      visionFailure ? `Vision failed: ${visionFailure}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function getAudioTranscriptionProvider(): "local" | "tuturuuu" {
  const provider =
    process.env.AUDIO_TRANSCRIPTION_PROVIDER?.trim().toLowerCase() || "local";
  if (provider !== "local" && provider !== "tuturuuu") {
    throw new Error(
      `Unsupported AUDIO_TRANSCRIPTION_PROVIDER "${provider}". Use "local" or "tuturuuu".`,
    );
  }
  return provider;
}

export function assertAudioTranscriptionRuntimeReady() {
  const provider = getAudioTranscriptionProvider();
  if (provider === "local") assertLocalAudioTranscriptionReady();
  return provider;
}

export async function extractAudioAttachmentContent(input: {
  attachmentId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  maxOutputTokens: number;
}) {
  const provider = getAudioTranscriptionProvider();
  if (provider === "local") {
    return transcribeAudioLocally({
      buffer: input.buffer,
      fileName: input.fileName,
    });
  }
  const chunks = await prepareAudioChunks(input.buffer, input.mimeType);
  return transcribeAudioChunks({
    attachmentId: input.attachmentId,
    chunks,
    fileName: input.fileName,
    maxOutputTokens: input.maxOutputTokens,
  });
}

export async function transcribeAudioChunks(input: {
  attachmentId: string;
  chunks: PreparedAudioChunk[];
  fileName: string;
  maxOutputTokens: number;
}) {
  const transcripts: string[] = [];

  for (const [index, chunk] of input.chunks.entries()) {
    const partNumber = index + 1;
    const result = await generateTuturuuuAudioTranscript({
      model: getTuturuuuTranscriptionModel(),
      prompt: buildAudioTranscriptionPrompt(partNumber, input.chunks.length),
      base64Data: chunk.buffer.toString("base64"),
      mimeType: chunk.mimeType,
      fileName: buildChunkFileName(
        input.fileName,
        partNumber,
        input.chunks.length,
      ),
      maxOutputTokens: input.maxOutputTokens,
      idempotencyKey:
        input.chunks.length === 1
          ? `attachment-transcription-${input.attachmentId}`
          : `attachment-transcription-${input.attachmentId}-part-${partNumber}`,
    });

    const transcript = result.output.trim();
    if (!transcript) {
      throw new Error(
        `Audio transcription returned empty text for part ${partNumber}.`,
      );
    }
    if (isInvalidExtractionResponse(transcript)) {
      throw new Error(
        `Audio transcription provider did not process segment ${partNumber}.`,
      );
    }
    transcripts.push(transcript);
  }

  return transcripts.join("\n\n");
}

export async function extractAttachmentContent(input: {
  attachmentId: string;
  base64Data?: string;
  fileUrl?: string;
  mimeType: string;
  fileName: string;
  maxOutputTokens: number;
}) {
  const audio = isAudioMimeType(input.mimeType);
  const image = input.mimeType.toLowerCase().startsWith("image/");
  const prompt = audio
    ? buildAudioTranscriptionPrompt()
    : buildDocumentExtractionPrompt();
  let result: { output: string };

  if (audio) {
    if (!input.base64Data) {
      throw new Error("Audio extraction requires base64Data.");
    }
    result = await generateTuturuuuAudioTranscript({
      model: getTuturuuuTranscriptionModel(),
      prompt,
      base64Data: input.base64Data,
      mimeType: input.mimeType,
      fileName: input.fileName,
      maxOutputTokens: input.maxOutputTokens,
      idempotencyKey: `attachment-transcription-${input.attachmentId}`,
    });
  } else if (image) {
    result = await generateTuturuuuVisionText({
      model: getTuturuuuVisionModel(),
      prompt,
      base64Data: input.base64Data,
      imageUrl: input.fileUrl,
      mimeType: input.mimeType,
      maxOutputTokens: input.maxOutputTokens,
      idempotencyKey: `attachment-extraction-${input.attachmentId}`,
    });
  } else {
    result = await generateTuturuuuFileText({
      model: getTuturuuuVisionModel(),
      prompt,
      base64Data: input.base64Data,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      mimeType: input.mimeType,
      maxOutputTokens: input.maxOutputTokens,
      idempotencyKey: `attachment-extraction-${input.attachmentId}`,
    });
  }

  const extractedText = result.output.trim();
  if (!extractedText) {
    throw new Error(
      audio
        ? "Audio transcription returned empty text."
        : "Attachment extraction returned empty text.",
    );
  }

  if (isInvalidExtractionResponse(extractedText)) {
    throw new Error(
      audio
        ? "Audio transcription returned a provider placeholder instead of a transcript."
        : "Attachment extraction returned a provider placeholder instead of file content.",
    );
  }

  return extractedText;
}

function isInvalidExtractionResponse(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("[object object]") ||
    (normalized.includes("retype") && normalized.includes("question")) ||
    normalized.includes("provide the file again")
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildAudioTranscriptionPrompt(partNumber = 1, partCount = 1) {
  return [
    "Transcribe this audio recording accurately for a personal Second Brain memory.",
    partCount > 1
      ? `This is chronological segment ${partNumber} of ${partCount}; transcribe only this segment.`
      : "",
    "Preserve the spoken language and meaning; do not translate unless the speaker translates themselves.",
    "Add speaker labels only when speakers are clearly distinguishable.",
    "Include meaningful spoken dates, names, decisions, tasks, and action items exactly as heard.",
    "Mark unclear words briefly as [unclear] instead of inventing content.",
    "Return only the transcript, without commentary or markdown fences.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildChunkFileName(
  fileName: string,
  partNumber: number,
  partCount: number,
) {
  if (partCount === 1) return fileName;
  const extensionIndex = fileName.lastIndexOf(".");
  const suffix = `.part-${String(partNumber).padStart(4, "0")}`;
  return extensionIndex > 0
    ? `${fileName.slice(0, extensionIndex)}${suffix}${fileName.slice(extensionIndex)}`
    : `${fileName}${suffix}.mp3`;
}

function buildDocumentExtractionPrompt() {
  return [
    "You are an extraction engine for a personal Second Brain app.",
    "Read every available page or visible region of this attachment.",
    "Extract readable text, headings, labels, table content, dates, names, decisions, tasks, and other meaningful details.",
    "Preserve the document order and use short markdown headings or bullets when they clarify the structure.",
    "For images with little or no visible text, provide a concise factual description of objects, setting, and visible activity.",
    "Do not invent names, dates, or claims that are not visible in the file.",
    "Return only the extracted content or factual description, without commentary about the extraction process.",
  ].join(" ");
}
