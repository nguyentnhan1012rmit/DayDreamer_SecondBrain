"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseRecorderOptions = {
  onRecordingReady: (file: File) => void;
};

export function useRecorder({ onRecordingReady }: UseRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const onRecordingReadyRef = useRef(onRecordingReady);

  useEffect(() => {
    onRecordingReadyRef.current = onRecordingReady;
  }, [onRecordingReady]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timerId = window.setInterval(
      () => setSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(timerId);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const start = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Audio recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;
      setSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Recording failed. Please try again.");
        setIsRecording(false);
        stopStream();
      };
      recorder.onstop = () => {
        setIsRecording(false);
        stopStream();
        if (discardRef.current || !chunksRef.current.length) {
          chunksRef.current = [];
          return;
        }

        const mimeType = (recorder.mimeType || "audio/webm")
          .split(";", 1)[0]
          .toLowerCase();
        const extension = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : mimeType.includes("mpeg")
              ? "mp3"
              : "webm";
        const file = new File(
          [new Blob(chunksRef.current, { type: mimeType })],
          `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
          { type: mimeType },
        );
        chunksRef.current = [];
        onRecordingReadyRef.current(file);
      };

      recorder.start(1000);
      setIsRecording(true);
    } catch (recordingError) {
      stopStream();
      setError(
        recordingError instanceof DOMException &&
          recordingError.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access and try again."
          : "Could not start microphone recording.",
      );
    }
  }, [stopStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const discard = useCallback(() => {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else stopStream();
    setIsRecording(false);
    setSeconds(0);
  }, [stopStream]);

  return {
    isRecording,
    seconds,
    error,
    clearError: () => setError(""),
    start,
    stop,
    discard,
  };
}
