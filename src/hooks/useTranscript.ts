import { useState, useCallback, useEffect, useRef } from "react";
import * as tauri from "../lib/tauri";
import type { Transcript, ModelDownloadProgressPayload } from "../lib/types";

export function useTranscript() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<Transcript | null>(
    null
  );
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  const [transcriptionProgress, setTranscriptionProgress] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgressPayload | null>(null);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isTranscribing = transcribingIds.size > 0;
  const isRecordingTranscribing = useCallback(
    (recordingId: string | null | undefined) =>
      !!recordingId && transcribingIds.has(recordingId),
    [transcribingIds]
  );

  // Listen for live transcript chunks.
  // Use a cancelled flag to handle React Strict Mode double-mounting,
  // which can cause the async listener to register after cleanup runs.
  const liveTextRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    let unlistenChunk: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;
    let unlistenTranscriptionProgress: (() => void) | null = null;

    tauri.onTranscriptionProgress((progress) => {
      if (cancelled) return;
      setTranscriptionProgress(progress);
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlistenTranscriptionProgress = fn; }
    });

    tauri.onTranscriptChunk((text, isFinal) => {
      if (cancelled) return;
      if (isFinal) {
        liveTextRef.current += text + " ";
        setLiveText(liveTextRef.current);
      } else {
        setLiveText(liveTextRef.current + text);
      }
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlistenChunk = fn; }
    });

    tauri.onModelDownloadProgress((progress) => {
      if (cancelled) return;
      if (progress.status === "complete" || progress.status === "error") {
        setDownloadProgress(null);
      } else {
        setDownloadProgress(progress);
      }
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlistenProgress = fn; }
    });

    return () => {
      cancelled = true;
      unlistenChunk?.();
      unlistenProgress?.();
      unlistenTranscriptionProgress?.();
    };
  }, []);

  const resetLiveText = useCallback(() => {
    liveTextRef.current = "";
    setLiveText("");
  }, []);

  const transcribeRecording = useCallback(
    async (recordingId: string, options?: { updateCurrent?: boolean }) => {
      setTranscribingIds((prev) => {
        const next = new Set(prev);
        next.add(recordingId);
        return next;
      });
      setTranscriptionProgress(null);
      setError(null);
      try {
        const transcript = await tauri.transcribeRecording(recordingId);
        if (options?.updateCurrent !== false) {
          setCurrentTranscript((prev) =>
            !prev || prev.recording_id === recordingId ? transcript : prev
          );
        }
        // Notify when transcription completes (useful for long recordings).
        try {
          const { sendNotification, isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
          let permitted = await isPermissionGranted();
          if (!permitted) permitted = (await requestPermission()) === "granted";
          if (permitted) {
            const preview = transcript.full_text.slice(0, 80).trim();
            sendNotification({ title: "Transcription complete", body: preview || "Ready to review" });
          }
        } catch { /* notification not critical */ }
        return transcript;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transcription failed";
        setError(message);
        throw err;
      } finally {
        setTranscribingIds((prev) => {
          const next = new Set(prev);
          next.delete(recordingId);
          return next;
        });
        setTranscriptionProgress(null);
      }
    },
    []
  );

  const loadTranscripts = useCallback(async (recordingId?: string) => {
    setError(null);
    try {
      const list = await tauri.listTranscripts(recordingId);
      setTranscripts(list);
      return list;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load transcripts";
      setError(message);
      throw err;
    }
  }, []);

  const loadTranscript = useCallback(async (id: string) => {
    setError(null);
    try {
      const transcript = await tauri.getTranscript(id);
      setCurrentTranscript(transcript);
      return transcript;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load transcript";
      setError(message);
      throw err;
    }
  }, []);

  return {
    transcripts,
    currentTranscript,
    isTranscribing,
    transcribingIds,
    isRecordingTranscribing,
    transcriptionProgress,
    downloadProgress,
    liveText,
    error,
    transcribeRecording,
    loadTranscripts,
    loadTranscript,
    resetLiveText,
    setCurrentTranscript,
  };
}
