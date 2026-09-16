"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AUDIO_ATTACHMENT_MAX_BYTES,
  STANDARD_ATTACHMENT_MAX_BYTES,
} from "@second-brain/shared";
import { isAudioFile } from "@/features/diary/diary-utils";
import type {
  AttachmentQueueItem,
  CaptureMode,
  DiaryDraft,
} from "@/features/diary/types";

type UseAttachmentQueueOptions = {
  captureMode: CaptureMode;
  setDraft: Dispatch<SetStateAction<DiaryDraft>>;
};

export function useAttachmentQueue({
  captureMode,
  setDraft,
}: UseAttachmentQueueOptions) {
  const [items, setItems] = useState<AttachmentQueueItem[]>([]);

  const updateItem = useCallback(
    (id: string, update: Partial<AttachmentQueueItem>) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item)),
      );
    },
    [],
  );

  const queueFiles = useCallback(
    (selectedFiles: File[], sourceMode: CaptureMode = captureMode) => {
      if (!selectedFiles.length) return;

      setItems((current) => [
        ...current,
        ...selectedFiles.map((file) => {
          const audio = isAudioFile(file);
          const maxBytes = audio
            ? AUDIO_ATTACHMENT_MAX_BYTES
            : STANDARD_ATTACHMENT_MAX_BYTES;
          const tooLarge = file.size > maxBytes;

          return {
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            file,
            status: tooLarge ? ("error" as const) : ("queued" as const),
            message: tooLarge
              ? `${audio ? "Audio" : "File"} must be ${maxBytes / (1024 * 1024)} MB or smaller`
              : audio
                ? "Ready to upload and transcribe"
                : "Ready to attach",
          };
        }),
      ]);

      const firstFile = selectedFiles[0];
      const audio = isAudioFile(firstFile);
      const image = firstFile.type.startsWith("image/");
      const baseName = firstFile.name.replace(/\.[^.]+$/, "").trim();
      const defaultTitle = audio
        ? "Voice note"
        : image || sourceMode === "photo"
          ? "Photo memory"
          : baseName || "File memory";
      const defaultContent = audio
        ? "Voice note attached."
        : image || sourceMode === "photo"
          ? "Photo attached."
          : "File attached.";

      setDraft((current) => ({
        ...current,
        title: current.title.trim() ? current.title : defaultTitle,
        content: current.content.trim() ? current.content : defaultContent,
      }));
    },
    [captureMode, setDraft],
  );

  const handleSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      queueFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [queueFiles],
  );

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, updateItem, queueFiles, handleSelection, removeItem, clear };
}
