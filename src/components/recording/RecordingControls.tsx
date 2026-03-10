import { useState } from "react";
import { Square, Pause, Play, Bookmark } from "lucide-react";
import { useRecording } from "../../hooks/useRecording";
import { useAppStore } from "../../stores/appStore";
import * as tauri from "../../lib/tauri";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface RecordingControlsProps {
  onStop?: () => void | Promise<void>;
  onStart?: () => void;
}

export default function RecordingControls({ onStop, onStart }: RecordingControlsProps) {
  const {
    recordingStatus,
    elapsedMs,
    startRecording,
    pauseRecording,
    resumeRecording,
  } = useRecording();
  const { currentRecordingId } = useAppStore();
  const [bookmarkFlash, setBookmarkFlash] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const isIdle = recordingStatus === "idle";
  const isRecording = recordingStatus === "recording";
  const isPaused = recordingStatus === "paused";

  const handleMainButton = async () => {
    if (isIdle) {
      setBookmarkCount(0);
      onStart?.();
      await startRecording();
    } else if (onStop) {
      await onStop();
    }
  };

  const handleBookmark = async () => {
    if (!currentRecordingId) return;
    try {
      await tauri.addBookmark(currentRecordingId, elapsedMs);
      setBookmarkCount((c) => c + 1);
      setBookmarkFlash(true);
      setTimeout(() => setBookmarkFlash(false), 400);
    } catch (err) {
      console.error("Failed to add bookmark:", err);
    }
  };

  const handlePauseResume = async () => {
    if (isRecording) {
      await pauseRecording();
    } else if (isPaused) {
      await resumeRecording();
    }
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Timer */}
      <div
        className={`text-4xl font-light tabular-nums tracking-wide font-mono transition-colors ${
          isIdle ? "text-text-muted" : "text-text-primary"
        }`}
      >
        {formatTime(elapsedMs)}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-4">
        {/* Pause/resume */}
        {!isIdle && (
          <button
            onClick={handlePauseResume}
            className="flex items-center justify-center w-9 h-9 rounded bg-bg-card border border-border-subtle hover:bg-bg-card-hover transition-colors cursor-pointer"
            style={{ animation: "fade-in 0.15s ease-out" }}
            title={isRecording ? "Pause" : "Resume"}
          >
            {isRecording ? (
              <Pause size={14} className="text-text-secondary" />
            ) : (
              <Play size={14} className="text-text-secondary ml-0.5" />
            )}
          </button>
        )}

        {/* Main record/stop button */}
        <button
          onClick={handleMainButton}
          className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all cursor-pointer ${
            isIdle
              ? "bg-record hover:bg-record-hover"
              : "bg-record hover:bg-record-hover"
          }`}
          style={
            isRecording
              ? { animation: "pulse-record 2s ease-in-out infinite" }
              : {}
          }
          title={isIdle ? "Start recording" : "Stop recording"}
        >
          {isIdle ? (
            <span className="w-4 h-4 rounded-full bg-white/90" />
          ) : (
            <Square
              size={16}
              className="text-white/90"
              fill="rgba(255,255,255,0.9)"
              strokeWidth={0}
            />
          )}
        </button>

        {/* Bookmark button */}
        {!isIdle && (
          <button
            onClick={handleBookmark}
            className={`flex items-center justify-center w-9 h-9 rounded transition-all cursor-pointer ${
              bookmarkFlash
                ? "bg-accent/20 text-accent scale-110"
                : "bg-bg-card border border-border-subtle hover:bg-bg-card-hover text-text-secondary"
            }`}
            style={{ animation: "fade-in 0.15s ease-out" }}
            title="Add bookmark (marks this moment)"
          >
            <Bookmark size={14} fill={bookmarkFlash ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        {isRecording && (
          <span className="w-1.5 h-1.5 rounded-full bg-record animate-pulse" />
        )}
        {isPaused && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        )}
        <span
          className={`text-[11px] font-medium uppercase tracking-widest ${
            isIdle ? "text-text-muted" : isRecording ? "text-record" : "text-warning"
          }`}
        >
          {isIdle && "Ready"}
          {isRecording && "Recording"}
          {isPaused && "Paused"}
        </span>
        {isIdle && (
          <span className="text-[10px] text-text-muted/50 mt-0.5">
            Press Space to start
          </span>
        )}
        {!isIdle && bookmarkCount > 0 && (
          <span className="text-[10px] text-accent/70 ml-1">
            {bookmarkCount} bookmark{bookmarkCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
