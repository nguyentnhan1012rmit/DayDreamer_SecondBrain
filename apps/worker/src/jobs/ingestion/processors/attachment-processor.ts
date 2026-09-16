import { createClient } from "@supabase/supabase-js";
import { indexMemoryFromAttachment } from "@second-brain/ai";
import {
  deleteMemoryChunksForSource,
  markMemorySourcesChanged,
} from "@second-brain/db";
import {
  isAttachmentExtractionFallback,
  resolveSupabaseServiceRoleKey,
} from "@second-brain/shared";
import { prisma } from "../../../lib/prisma";
import {
  extractAudioAttachmentContent,
  extractAttachmentContent,
  isAudioMimeType,
  prepareImageForExtraction,
} from "../attachment-extraction";
import type { SourceProcessor } from "../indexing-job";
import {
  extractImageTextLocally,
  extractPdfDocumentLocally,
} from "../local-document-extraction";
import { persistChunksWithEntities } from "../memory-persistence";

const ATTACHMENT_BUCKET = "attachments-bucket";

export const processAttachment: SourceProcessor = async (job, context) => {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: job.source_id,
      diary_entry: { user_id: job.user_id },
    },
    include: {
      diary_entry: { select: { id: true, user_id: true, entry_date: true } },
    },
  });
  if (!attachment) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "attachment",
        sourceId: job.source_id,
      });
    });
    return;
  }

  const sourceTitle =
    typeof job.payload?.sourceTitle === "string"
      ? job.payload.sourceTitle
      : attachment.storage_path.split("/").pop();
  const storedText = attachment.extracted_text?.trim() ?? "";
  const legacyFallback = isAttachmentExtractionFallback(storedText);
  let extractedText = legacyFallback ? "" : storedText;
  if (legacyFallback) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "attachment",
        sourceId: attachment.id,
      });
    });
  }

  if (!extractedText || attachment.extraction_status === "failed") {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await tx.attachment.update({
        where: { id: attachment.id },
        data: {
          extraction_status: "processing",
          extraction_error: null,
          extraction_attempts: { increment: 1 },
          extraction_updated_at: new Date(),
        },
      });
    });
    try {
      const extraction = await extractFromStorage({
        id: attachment.id,
        path: attachment.storage_path,
        mimeType: attachment.file_type,
        fileName: sourceTitle ?? attachment.storage_path,
      });
      extractedText = extraction.text;
      await prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await tx.attachment.update({
          where: { id: attachment.id },
          data: {
            extracted_text: extractedText,
            extraction_status: extraction.status,
            extraction_completeness: extraction.completeness,
            extraction_error: null,
            extraction_updated_at: new Date(),
          },
        });
        await markMemorySourcesChanged(tx as any, {
          userId: job.user_id,
          occurredFrom: attachment.diary_entry.entry_date,
          occurredTo: attachment.diary_entry.entry_date,
        });
      });
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await tx.attachment.update({
          where: { id: attachment.id },
          data: {
            extraction_status: "failed",
            extraction_completeness: 0,
            extraction_error: (error instanceof Error ? error.message : String(error)).slice(0, 4000),
            extraction_updated_at: new Date(),
          },
        });
      });
      throw error;
    }
  }

  const result = await indexMemoryFromAttachment({
    userId: job.user_id,
    attachmentId: attachment.id,
    diaryEntryId: attachment.diary_entry.id,
    extractedText,
    occurredAt: attachment.diary_entry.entry_date,
    sourceTitle,
    fileType: attachment.file_type,
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "attachment",
          sourceId: attachment.id,
        });
      }),
  });
  if (!result.chunkCount) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "attachment",
        sourceId: attachment.id,
      });
    });
  }
};

async function extractFromStorage(input: {
  id: string;
  path: string;
  mimeType: string;
  fileName: string;
}) {
  const supabase = getSupabaseClient();
  const audio = isAudioMimeType(input.mimeType);
  const image = input.mimeType.toLowerCase().startsWith("image/");
  const pdf = input.mimeType.toLowerCase() === "application/pdf";
  try {
    if (audio || image || pdf) {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .download(input.path);
      if (error || !data) {
        throw new Error(error?.message ?? `File not found: ${input.path}`);
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      if (audio) {
        const text = await extractAudioAttachmentContent({
          attachmentId: input.id,
          buffer,
          mimeType: input.mimeType,
          fileName: input.fileName,
          maxOutputTokens: getAudioMaxTokens(),
        });
        return { text, status: "complete" as const, completeness: 1 };
      }

      const pdfExtraction = pdf ? await extractPdfDocumentLocally(buffer) : null;
      let text = image
        ? await extractImageTextLocally(buffer)
        : pdfExtraction?.text ?? "";
      if (!text && image) {
        const optimized = await prepareImageForExtraction(buffer);
        text = await extractAttachmentContent({
          attachmentId: input.id,
          base64Data: optimized.buffer.toString("base64"),
          mimeType: optimized.mimeType,
          fileName: input.fileName,
          maxOutputTokens: getExtractionMaxTokens(),
        });
      }
      if (!text) {
        throw new Error(
          pdf
            ? "PDF contains no extractable or OCR-readable text."
            : "Image contains no OCR-readable text and vision extraction was unavailable.",
        );
      }
      return pdfExtraction ?? { text, status: "complete" as const, completeness: 1 };
    }

    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(input.path, 10 * 60);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? `Could not sign: ${input.path}`);
    }
    const text = await extractAttachmentContent({
      attachmentId: input.id,
      fileUrl: data.signedUrl,
      mimeType: input.mimeType,
      fileName: input.fileName,
      maxOutputTokens: getExtractionMaxTokens(),
    });
    return { text, status: "complete" as const, completeness: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${audio ? "Audio transcription" : "Attachment extraction"} failed: ${message}`,
    );
  }
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key)
    throw new Error("Supabase URL and Service Key must be set.");
  return createClient(url, key);
}

function getExtractionMaxTokens() {
  return boundedEnv(
    "ATTACHMENT_EXTRACTION_MAX_OUTPUT_TOKENS",
    6000,
    500,
    12000,
  );
}

function getAudioMaxTokens() {
  return boundedEnv("AUDIO_TRANSCRIPTION_MAX_OUTPUT_TOKENS", 6000, 500, 12000);
}

function boundedEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), min), max)
    : fallback;
}
