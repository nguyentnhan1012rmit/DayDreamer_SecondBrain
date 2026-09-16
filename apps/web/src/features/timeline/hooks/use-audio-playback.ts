"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiaryAttachment } from "@/lib/api/attachment-api";
import { getMediaErrorMessage } from "../attachment-utils";

export type AudioPlaybackState =
  | "idle"
  | "loading"
  | "ready"
  | "retrying"
  | "error";

export function useAudioPlayback(
  onLoadAttachmentAudio?: (attachmentId: string) => Promise<string | Blob>,
) {
  const [states, setStates] = useState<Record<string, AudioPlaybackState>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [blobSizes, setBlobSizes] = useState<Record<string, number>>({});
  const loadingIds = useRef(new Set<string>());
  const fallbackAttemptedIds = useRef(new Set<string>());
  const objectUrls = useRef<Record<string, string>>({});

  const loadAudio = useCallback(
    async (attachment: DiaryAttachment, retrying = false) => {
      if (loadingIds.current.has(attachment.id)) return;
      if (!retrying && attachment.signedUrl) {
        setErrors((current) => {
          const next = { ...current };
          delete next[attachment.id];
          return next;
        });
        setStates((current) => ({ ...current, [attachment.id]: "loading" }));
        setUrls((current) => ({
          ...current,
          [attachment.id]: attachment.signedUrl as string,
        }));
        return;
      }
      if (!onLoadAttachmentAudio) {
        setStates((current) => ({ ...current, [attachment.id]: "error" }));
        return;
      }

      loadingIds.current.add(attachment.id);
      setStates((current) => ({
        ...current,
        [attachment.id]: retrying ? "retrying" : "loading",
      }));
      setErrors((current) => {
        const next = { ...current };
        delete next[attachment.id];
        return next;
      });

      try {
        const content = await onLoadAttachmentAudio(attachment.id);
        const nextUrl =
          typeof content === "string" ? content : URL.createObjectURL(content);
        const previousUrl = objectUrls.current[attachment.id];
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        if (typeof content === "string") {
          delete objectUrls.current[attachment.id];
        } else {
          objectUrls.current[attachment.id] = nextUrl;
          setBlobSizes((current) => ({
            ...current,
            [attachment.id]: content.size,
          }));
        }
        setUrls((current) => ({ ...current, [attachment.id]: nextUrl }));
        setStates((current) => ({ ...current, [attachment.id]: "loading" }));
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [attachment.id]:
            error instanceof Error
              ? error.message
              : "The audio source could not be loaded.",
        }));
        setStates((current) => ({ ...current, [attachment.id]: "error" }));
      } finally {
        loadingIds.current.delete(attachment.id);
      }
    },
    [onLoadAttachmentAudio],
  );

  useEffect(
    () => () => {
      Object.values(objectUrls.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  const handleError = useCallback(
    (attachment: DiaryAttachment, mediaError: MediaError | null) => {
      if (!fallbackAttemptedIds.current.has(attachment.id)) {
        fallbackAttemptedIds.current.add(attachment.id);
        void loadAudio(attachment, true);
        return;
      }
      setErrors((current) => ({
        ...current,
        [attachment.id]: getMediaErrorMessage(mediaError),
      }));
      setStates((current) => ({ ...current, [attachment.id]: "error" }));
    },
    [loadAudio],
  );

  const handleLoadedMetadata = useCallback(
    (attachmentId: string, duration: number) => {
      if (Number.isFinite(duration)) {
        setDurations((current) => ({ ...current, [attachmentId]: duration }));
      }
      setStates((current) => ({ ...current, [attachmentId]: "ready" }));
    },
    [],
  );

  const retry = useCallback(
    (attachment: DiaryAttachment) => {
      fallbackAttemptedIds.current.delete(attachment.id);
      void loadAudio(attachment, true);
    },
    [loadAudio],
  );

  return {
    states,
    urls,
    errors,
    durations,
    blobSizes,
    load: (attachment: DiaryAttachment) => loadAudio(attachment),
    handleError,
    handleLoadedMetadata,
    retry,
  };
}
