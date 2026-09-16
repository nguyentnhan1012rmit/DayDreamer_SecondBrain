"use client";

import { useMemo, useState } from "react";
import {
  createDiaryEntry,
  copilotDiaryText,
  type CreateDiaryPayload,
} from "@/lib/api/diary-api";
import {
  processDiaryAttachment,
  uploadDiaryAttachment,
} from "@/lib/api/attachment-api";
import { clearHomeDraft } from "@/lib/home-draft";
import {
  getAttachmentMessage,
  getAttachmentStatus,
  getReflectionFallback,
  isAudioFile,
  normalizeReflectionQuestion,
} from "@/features/diary/diary-utils";
import type {
  AttachmentQueueItem,
  DiaryDraft,
  SaveState,
  SavedReflection,
} from "@/features/diary/types";

type UseDiarySubmitOptions = {
  draft: DiaryDraft;
  attachments: AttachmentQueueItem[];
  isRecording: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  updateAttachment: (id: string, update: Partial<AttachmentQueueItem>) => void;
  resetDraft: () => void;
};

export function useDiarySubmit({
  draft,
  attachments,
  isRecording,
  isAuthenticated,
  getAccessToken,
  updateAttachment,
  resetDraft,
}: UseDiarySubmitOptions) {
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [savedReflection, setSavedReflection] =
    useState<SavedReflection | null>(null);
  const [isReflectionLoading, setIsReflectionLoading] = useState(false);

  const canSubmit = useMemo(() => {
    const hasAttachment = attachments.some((item) => item.status !== "error");
    return (
      draft.title.trim().length > 0 &&
      (draft.content.trim().length > 0 || hasAttachment) &&
      draft.entryDate.trim().length > 0
    );
  }, [attachments, draft]);

  async function submit() {
    setErrorMessage("");
    if (isRecording) {
      setState("error");
      setErrorMessage("Stop the recording before saving this memory.");
      return;
    }
    if (!canSubmit) return;
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }

    setShowAuthPrompt(false);
    setState("saving");

    try {
      const accessToken = getAccessToken();
      const firstUsableAttachment = attachments.find(
        (item) => item.status !== "error",
      );
      const fallbackContent = firstUsableAttachment
        ? isAudioFile(firstUsableAttachment.file)
          ? "Voice note attached."
          : firstUsableAttachment.file.type.startsWith("image/")
            ? "Photo attached."
            : "File attached."
        : "Memory captured.";
      const payload: CreateDiaryPayload = {
        title: draft.title.trim(),
        content: draft.content.trim() || fallbackContent,
        entryDate: new Date(`${draft.entryDate}T12:00:00`).toISOString(),
        mood: draft.mood,
        tags: draft.tags,
      };

      const diaryEntry = await createDiaryEntry(payload, accessToken);
      const fallbackQuestion = getReflectionFallback(draft.mood);
      setSavedReflection({
        entryId: diaryEntry.id,
        entryTitle: payload.title,
        mood: draft.mood,
        question: fallbackQuestion,
      });
      setIsReflectionLoading(true);
      void copilotDiaryText(
        { text: `${payload.title}\n\n${payload.content}`, action: "reflect" },
        accessToken,
      )
        .then((response) => {
          setSavedReflection((current) =>
            current?.entryId === diaryEntry.id
              ? {
                  ...current,
                  question: normalizeReflectionQuestion(
                    response.result,
                    fallbackQuestion,
                  ),
                }
              : current,
          );
        })
        .catch(() => undefined)
        .finally(() => setIsReflectionLoading(false));

      let attachmentHadErrors = false;
      for (const item of attachments.filter(
        (attachment) => attachment.status === "queued",
      )) {
        try {
          updateAttachment(item.id, {
            status: "uploading",
            message: "Uploading to storage",
          });
          const uploadResult = await uploadDiaryAttachment(
            diaryEntry.id,
            item.file,
            accessToken,
          );
          updateAttachment(item.id, {
            attachmentId: uploadResult.attachment.id,
            signedUrl: uploadResult.attachment.signedUrl,
            status: getAttachmentStatus(uploadResult),
            message: getAttachmentMessage(uploadResult),
            memoryChunkCount: uploadResult.memoryChunkCount,
          });

          if (uploadResult.extractionStatus === "pending") {
            const processResult = await processDiaryAttachment(
              uploadResult.attachment.id,
              accessToken,
            );
            updateAttachment(item.id, {
              status: getAttachmentStatus(processResult),
              signedUrl:
                processResult.attachment.signedUrl ??
                uploadResult.attachment.signedUrl,
              message: getAttachmentMessage(processResult),
              memoryChunkCount: processResult.memoryChunkCount,
            });
          }
        } catch (attachmentError) {
          attachmentHadErrors = true;
          updateAttachment(item.id, {
            status: "error",
            message:
              attachmentError instanceof Error
                ? attachmentError.message
                : "Attachment upload failed",
          });
        }
      }

      resetDraft();
      clearHomeDraft();
      if (attachmentHadErrors) {
        setState("error");
        setErrorMessage(
          "Diary saved, but one or more attachments failed. Check the file status above.",
        );
      } else {
        setState("success");
      }
    } catch (submitError) {
      setState("error");
      setErrorMessage(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save diary entry",
      );
    }
  }

  function resetFeedback() {
    setState("idle");
    setErrorMessage("");
    setShowAuthPrompt(false);
  }

  return {
    canSubmit,
    submit,
    state,
    errorMessage,
    showAuthPrompt,
    savedReflection,
    isReflectionLoading,
    requestAuthentication: () => setShowAuthPrompt(true),
    setErrorMessage,
    resetFeedback,
    dismissReflection: () => setSavedReflection(null),
  };
}
