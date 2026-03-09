import { Square, Pause, Play } from "lucide-react";
import { useRecording } from "../../hooks/useRecording";

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

  const isIdle = recordingStatus === "idle";
  const isRecording = recordingStatus === "recording";
  const isPaused = recordingStatus === "paused";

  const handleMainButton = async () => {
    if (isIdle) {
      onStart?.();
      await startRecording();
    } else if (onStop) {
      await onStop();
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
    <div className="flex flex-col items-center gap-8">
      {/* Timer */}
      <div
        className={`text-5xl font-light tabular-nums tracking-[0.15em] transition-colors duration-300 ${
          isIdle ? "text-text-muted" : "text-text-primary"
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatTime(elapsedMs)}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-5">
        {/* Pause/resume (left side) */}
        {!isIdle && (
          <button
            onClick={handlePauseResume}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-all duration-150 cursor-pointer"
            style={{ animation: "fade-in 0.2s ease-out" }}
            title={isRecording ? "Pause" : "Resume"}
          >
            {isRecording ? (
              <Pause size={16} className="text-text-secondary" />
            ) : (
              <Play size={16} className="text-text-secondary ml-0.5" />
            )}
          </button>
        )}

        {/* Main record/stop button */}
        <div className="relative">
          {/* Outer pulse rings when recording */}
          {isRecording && (
            <>
              <span
                className="absolute inset-0 rounded-full border border-record/20"
                style={{ animation: "ring-pulse 2s ease-in-out infinite" }}
              />
              <span
                className="absolute -inset-3 rounded-full border border-record/10"
                style={{ animation: "ring-pulse 2s ease-in-out infinite 0.5s" }}
              />
            </>
          )}

          <button
            onClick={handleMainButton}
            className={`relative flex items-center justify-center w-[72px] h-[72px] rounded-full transition-all duration-200 cursor-pointer ${
              isIdle
                ? "bg-record hover:bg-record-hover hover:scale-[1.04] active:scale-95"
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
              <span className="w-5 h-5 rounded-full bg-white" />
            ) : (
              <Square
                size={20}
                className="text-white"
                fill="white"
                strokeWidth={0}
              />
            )}
          </button>
        </div>

        {/* Spacer for symmetry when pause button is visible */}
        {!isIdle && <div className="w-12" />}
      </div>

      {/* Status */}
      <p
        className={`text-xs font-medium uppercase tracking-widest transition-colors duration-300 ${
          isIdle ? "text-text-muted" : isRecording ? "text-record" : "text-warning"
        }`}
      >
        {isIdle && "Ready to record"}
        {isRecording && "Recording"}
        {isPaused && "Paused"}
      </p>
    </div>
  );
}
