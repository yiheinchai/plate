import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import * as tauri from "../lib/tauri";
import type { AudioSource, Recording } from "../lib/types";

export function useRecording() {
  const {
    recordingStatus,
    currentAudioSource,
    audioLevel,
    elapsedMs,
    setRecordingStatus,
    setAudioSource,
    setAudioLevel,
    setCurrentRecordingId,
    setRecordingStartTime,
    setElapsedMs,
  } = useAppStore();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for audio level events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    tauri.onAudioLevel((level) => {
      if (cancelled) return;
      setAudioLevel(level);
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlisten = fn; }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setAudioLevel]);

  const { setRecordingWarning } = useAppStore();

  // Listen for recording-error events (recorder thread failed after start_recording returned)
  useEffect(() => {
    let cancelled = false;
    let unlistenError: (() => void) | null = null;
    let unlistenWarning: (() => void) | null = null;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("recording-error", (event) => {
        if (cancelled) return;
        console.error("Recording failed:", event.payload);
        setRecordingStatus("idle");
        setCurrentRecordingId(null);
        setRecordingStartTime(null);
        setAudioLevel(0);
        setRecordingWarning(event.payload);
      }).then((fn) => {
        if (cancelled) { fn(); } else { unlistenError = fn; }
      });

      listen<string>("recording-warning", (event) => {
        if (cancelled) return;
        console.warn("Recording warning:", event.payload);
        setRecordingWarning(event.payload);
      }).then((fn) => {
        if (cancelled) { fn(); } else { unlistenWarning = fn; }
      });
    });

    return () => {
      cancelled = true;
      unlistenError?.();
      unlistenWarning?.();
    };
  }, [setRecordingStatus, setCurrentRecordingId, setRecordingStartTime, setAudioLevel, setRecordingWarning]);

  // Elapsed time timer
  useEffect(() => {
    if (recordingStatus === "recording") {
      timerRef.current = setInterval(() => {
        const startTime = useAppStore.getState().recordingStartTime;
        if (startTime) {
          setElapsedMs(Date.now() - startTime);
        }
      }, 100);
    } else if (recordingStatus === "paused") {
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedMs(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingStatus, setElapsedMs]);

  const { setContinuingRecording, continuingRecordingId } = useAppStore();

  const startRecording = useCallback(
    async (source?: AudioSource) => {
      const src = source ?? currentAudioSource;
      try {
        const recordingId = await tauri.startRecording(src);
        setCurrentRecordingId(recordingId);
        setRecordingStartTime(Date.now());
        setRecordingStatus("recording");
        setAudioSource(src);
      } catch (err) {
        console.error("Failed to start recording:", err);
        throw err;
      }
    },
    [
      currentAudioSource,
      setCurrentRecordingId,
      setRecordingStartTime,
      setRecordingStatus,
      setAudioSource,
    ]
  );

  const continueRecording = useCallback(
    async (recordingId: string, recordingTitle: string, source?: AudioSource) => {
      const src = source ?? currentAudioSource;
      try {
        await tauri.continueRecording(recordingId, src);
        setCurrentRecordingId(recordingId);
        setRecordingStartTime(Date.now());
        setRecordingStatus("recording");
        setAudioSource(src);
        setContinuingRecording(recordingId, recordingTitle);
      } catch (err) {
        console.error("Failed to continue recording:", err);
        throw err;
      }
    },
    [
      currentAudioSource,
      setCurrentRecordingId,
      setRecordingStartTime,
      setRecordingStatus,
      setAudioSource,
      setContinuingRecording,
    ]
  );

  const stopRecording = useCallback(async (): Promise<Recording> => {
    try {
      const recording = await tauri.stopRecording();
      setRecordingStatus("idle");
      setCurrentRecordingId(null);
      setRecordingStartTime(null);
      setAudioLevel(0);
      setContinuingRecording(null, null);
      return recording;
    } catch (err) {
      console.error("Failed to stop recording:", err);
      throw err;
    }
  }, [
    setRecordingStatus,
    setCurrentRecordingId,
    setRecordingStartTime,
    setAudioLevel,
    setContinuingRecording,
  ]);

  const pauseRecording = useCallback(async () => {
    try {
      await tauri.pauseRecording();
      setRecordingStatus("paused");
    } catch (err) {
      console.error("Failed to pause recording:", err);
      throw err;
    }
  }, [setRecordingStatus]);

  const resumeRecording = useCallback(async () => {
    try {
      await tauri.resumeRecording();
      setRecordingStatus("recording");
    } catch (err) {
      console.error("Failed to resume recording:", err);
      throw err;
    }
  }, [setRecordingStatus]);

  return {
    recordingStatus,
    currentAudioSource,
    audioLevel,
    elapsedMs,
    continuingRecordingId,
    startRecording,
    continueRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    setAudioSource,
  };
}
