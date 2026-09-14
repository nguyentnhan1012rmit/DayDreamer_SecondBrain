import { authFetch, readApiError } from "./http-client";

export type DiaryAttachment = {
  id: string;
  fileType: string;
  fileName: string;
  signedUrl?: string;
  extractionStatus: "extracted" | "pending" | "empty" | "failed";
  extractedTextPreview?: string;
  extractedCharacterCount?: number;
  extractionCompleteness?: number;
  extractionError?: string;
  indexingStatus:
    | "pending"
    | "retry"
    | "processing"
    | "succeeded"
    | "dead_letter"
    | "failed"
    | "unknown";
  indexingError?: string | null;
  retryCount?: number;
  createdAt: string;
  updatedAt?: string;
};

export type AttachmentUploadResponse = {
  message: string;
  extractionStatus: "extracted" | "pending" | "empty" | "failed";
  memoryIndexed: boolean;
  memoryIndexingStatus?:
    | "queued"
    | "pending"
    | "processing"
    | "succeeded"
    | "failed"
    | "dead_letter"
    | "retry";
  memoryChunkCount: number;
  processingError?: string;
  attachment: {
    id: string;
    diaryEntryId: string;
    fileType: string;
    extractionStatus?: "extracted" | "pending" | "empty" | "failed";
    extractedTextPreview?: string;
    extractedCharacterCount?: number;
    extractionCompleteness?: number;
    extractionError?: string;
    signedUrl?: string;
    createdAt: string;
  };
};

export async function getDiaryAttachment(
  id: string,
  accessToken: string | null,
): Promise<{ signedUrl?: string }> {
  const response = await authFetch(
    `/api/upload/attachment/${id}`,
    { method: "GET" },
    accessToken,
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to refresh attachment URL"),
    );
  }
  return response.json();
}

export async function getDiaryAttachmentContent(
  id: string,
  accessToken: string | null,
): Promise<Blob> {
  const response = await authFetch(
    `/api/upload/attachment/${id}/content`,
    { method: "GET", headers: { Accept: "*/*" } },
    accessToken,
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to load attachment content"),
    );
  }

  const content = await response.blob();
  if (!content.size) throw new Error("Attachment is empty.");
  return content;
}

export async function uploadDiaryAttachment(
  diaryEntryId: string,
  file: File,
  accessToken: string | null,
): Promise<AttachmentUploadResponse> {
  const formData = new FormData();
  formData.set("diaryEntryId", diaryEntryId);
  formData.set("file", file);

  const response = await authFetch(
    "/api/upload/attachment",
    { method: "POST", body: formData },
    accessToken,
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to upload attachment"),
    );
  }
  return response.json();
}

export async function processDiaryAttachment(
  attachmentId: string,
  accessToken: string | null,
): Promise<AttachmentUploadResponse> {
  const response = await authFetch(
    `/api/upload/attachment/${attachmentId}/process`,
    { method: "POST" },
    accessToken,
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to process attachment"),
    );
  }
  return response.json();
}
