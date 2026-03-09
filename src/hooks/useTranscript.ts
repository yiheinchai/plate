import { useState, useCallback, useEffect, useRef } from "react";
import * as tauri from "../lib/tauri";
import type { Transcript } from "../lib/types";

export function useTranscript() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<Transcript | null>(
    null
  );
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Listen for live transcript chunks.
  // Use a cancelled flag to handle React Strict Mode double-mounting,
  // which can cause the async listener to register after cleanup runs.
  const liveTextRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    tauri.onTranscriptChunk((text, isFinal) => {
      if (cancelled) return;
      if (isFinal) {
        liveTextRef.current += text + " ";
        setLiveText(liveTextRef.current);
      } else {
        setLiveText(liveTextRef.current + text);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const resetLiveText = useCallback(() => {
    liveTextRef.current = "";
    setLiveText("");
  }, []);

  const transcribeRecording = useCallback(async (recordingId: string) => {
    setIsTranscribing(true);
    setError(null);
    try {
      const transcript = await tauri.transcribeRecording(recordingId);
      setCurrentTranscript(transcript);
      return transcript;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Transcription failed";
      setError(message);
      throw err;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

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
    liveText,
    error,
    transcribeRecording,
    loadTranscripts,
    loadTranscript,
    resetLiveText,
    setCurrentTranscript,
  };
}
