import { google } from "googleapis";
import { indexMemoryFromDrive } from "@second-brain/ai";
import {
  deleteMemoryChunksForSource,
  markMemorySourcesChanged,
} from "@second-brain/db";
import { decryptOAuthToken, encryptOAuthToken } from "@second-brain/shared";
import { prisma } from "../../../lib/prisma";
import {
  extractAudioAttachmentContent,
  extractAttachmentContent,
  isAudioMimeType,
} from "../attachment-extraction";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";
import { extractPdfDocumentLocally } from "../local-document-extraction";

type DriveFile = {
  external_id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  modified_time: Date | null;
  extraction_status: string;
  user: {
    id: string;
    google_access_token: string | null;
    google_refresh_token: string | null;
  };
};

export const processDrive: SourceProcessor = async (job, context) => {
  const driveFile = await prisma.googleDriveFile.findFirst({
    where: { id: job.source_id, user_id: job.user_id },
    include: {
      user: {
        select: {
          id: true,
          google_access_token: true,
          google_refresh_token: true,
        },
      },
    },
  });
  if (!driveFile) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "drive",
        sourceId: job.source_id,
      });
    });
    return;
  }

  let extractedText = driveFile.extracted_text?.trim() ?? "";
  if (!extractedText || driveFile.extraction_status === "failed") {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await tx.googleDriveFile.update({
        where: { id: driveFile.id },
        data: {
          extraction_status: "processing",
          extraction_error: null,
          extraction_attempts: { increment: 1 },
          extraction_updated_at: new Date(),
        },
      });
    });
    try {
      const extraction = await extractGoogleDriveFileText(driveFile);
      extractedText = extraction.text;
      await prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await tx.googleDriveFile.update({
          where: { id: driveFile.id },
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
          occurredFrom: driveFile.modified_time,
          occurredTo: driveFile.modified_time,
        });
      });
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await tx.googleDriveFile.update({
          where: { id: driveFile.id },
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
  const result = await indexMemoryFromDrive({
    userId: job.user_id,
    driveFileId: driveFile.id,
    externalId: driveFile.external_id,
    name: driveFile.name,
    mimeType: driveFile.mime_type,
    extractedText,
    webViewLink: driveFile.web_view_link,
    modifiedTime: driveFile.modified_time,
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "drive",
          sourceId: driveFile.id,
        });
      }),
  });
  if (!result.chunkCount) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "drive",
        sourceId: driveFile.id,
      });
    });
  }
};

async function extractGoogleDriveFileText(driveFile: DriveFile) {
  if (
    !driveFile.user.google_access_token &&
    !driveFile.user.google_refresh_token
  ) {
    throw new Error("Google token is missing for Drive extraction.");
  }
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({
    access_token: decryptOAuthToken(driveFile.user.google_access_token),
    refresh_token: decryptOAuthToken(driveFile.user.google_refresh_token),
  });
  auth.on("tokens", async (tokens) => {
    await prisma.user.update({
      where: { id: driveFile.user.id },
      data: {
        ...(tokens.access_token && {
          google_access_token: encryptOAuthToken(tokens.access_token),
        }),
        ...(tokens.refresh_token && {
          google_refresh_token: encryptOAuthToken(tokens.refresh_token),
        }),
      },
    });
  });

  const drive = google.drive({ version: "v3", auth });
  const exportMimeType = getDriveExportMimeType(driveFile.mime_type);
  if (exportMimeType) {
    const response = await drive.files.export(
      { fileId: driveFile.external_id, mimeType: exportMimeType },
      { responseType: "arraybuffer" },
    );
    const exported = Buffer.from(response.data as ArrayBuffer);
    if (exportMimeType === "application/pdf") {
      const result = await extractPdfDocumentLocally(exported);
      if (!result.text) throw new Error("Google Drive PDF export contains no readable text.");
      return result;
    }
    const text = exported.toString("utf8").trim();
    if (!text) throw new Error("Google Drive export returned no text.");
    return { text, status: "complete" as const, completeness: 1 };
  }

  const response = await drive.files.get(
    { fileId: driveFile.external_id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const buffer = Buffer.from(response.data as ArrayBuffer);
  if (isPlainTextMimeType(driveFile.mime_type)) {
    const text = buffer.toString("utf8").trim();
    if (!text) throw new Error("Google Drive text file is empty.");
    return { text, status: "complete" as const, completeness: 1 };
  }
  if (driveFile.mime_type === "application/pdf") {
    const result = await extractPdfDocumentLocally(buffer);
    if (!result.text) throw new Error("PDF contains no extractable or OCR-readable text.");
    return result;
  }
  const audio = isAudioMimeType(driveFile.mime_type);
  const text = audio
      ? await extractAudioAttachmentContent({
          attachmentId: `drive-${driveFile.external_id}`,
          buffer,
          mimeType: driveFile.mime_type,
          fileName: driveFile.name,
          maxOutputTokens: getTokens("AUDIO_TRANSCRIPTION_MAX_OUTPUT_TOKENS"),
        })
      : await extractAttachmentContent({
          attachmentId: `drive-${driveFile.external_id}`,
          base64Data: buffer.toString("base64"),
          mimeType: driveFile.mime_type,
          fileName: driveFile.name,
          maxOutputTokens: getTokens("ATTACHMENT_EXTRACTION_MAX_OUTPUT_TOKENS"),
        });
  if (!text.trim()) throw new Error("Google Drive extraction returned no text.");
  return { text, status: "complete" as const, completeness: 1 };
}

function getDriveExportMimeType(mimeType: string) {
  return (
    (
      {
        "application/vnd.google-apps.document": "text/plain",
        "application/vnd.google-apps.spreadsheet": "text/csv",
        "application/vnd.google-apps.presentation": "text/plain",
        "application/vnd.google-apps.drawing": "application/pdf",
      } as Record<string, string>
    )[mimeType] ?? null
  );
}

function isPlainTextMimeType(mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
      "application/csv",
    ].includes(mimeType)
  );
}

function getTokens(name: string) {
  const value = Number(process.env[name] ?? 6000);
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 500), 12000)
    : 6000;
}
