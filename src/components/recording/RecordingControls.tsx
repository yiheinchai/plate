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
    <div className="flex flex-col items-center gap-6">
      {/* Timer */}
      <div
        className={`text-5xl font-extralight tabular-nums tracking-tight font-mono transition-all duration-300 ${
          isIdle ? "text-text-muted/40" : "text-text-primary"
        }`}
      >
        {formatTime(elapsedMs)}
      </div>

      {/* Main record button — sits in center of waveform ring */}
      <div className="relative flex items-center justify-center">
        {/* Pulse rings when recording */}
        {isRecording && (
          <>
            <span
              className="absolute w-16 h-16 rounded-full border border-record/30"
              style={{ animation: "pulse-ring 2s ease-out infinite" }}
            />
            <span
              className="absolute w-16 h-16 rounded-full border border-record/20"
              style={{ animation: "pulse-ring 2s ease-out infinite 0.6s" }}
            />
          </>
        )}

        <button
          onClick={handleMainButton}
          className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 cursor-pointer ${
            isIdle
              ? "bg-gradient-to-br from-record to-red-600 hover:from-record-hover hover:to-red-500 shadow-lg shadow-record/20 hover:shadow-record/40 hover:scale-105"
              : "bg-gradient-to-br from-record to-red-700 shadow-lg shadow-record/30"
          }`}
          style={
            isRecording
              ? { animation: "pulse-record 2.5s ease-in-out infinite" }
              : {}
          }
          title={isIdle ? "Start recording" : "Stop recording"}
        >
          {isIdle ? (
            <span className="w-5 h-5 rounded-full bg-white/90" />
          ) : (
            <Square
              size={18}
              className="text-white/90"
              fill="rgba(255,255,255,0.9)"
              strokeWidth={0}
            />
          )}
        </button>
      </div>

      {/* Secondary controls */}
      <div className="flex items-center gap-3">
        {!isIdle && (
          <button
            onClick={handlePauseResume}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-all duration-200 cursor-pointer"
            style={{ animation: "fade-in-scale 0.2s ease-out" }}
            title={isRecording ? "Pause" : "Resume"}
          >
            {isRecording ? (
              <Pause size={14} className="text-text-secondary" />
            ) : (
              <Play size={14} className="text-text-secondary ml-0.5" />
            )}
          </button>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        {isRecording && (
          <span className="w-1.5 h-1.5 rounded-full bg-record animate-pulse" />
        )}
        {isPaused && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        )}
        <span
          className={`text-[11px] font-medium uppercase tracking-[0.15em] transition-colors ${
            isIdle ? "text-text-muted/40" : isRecording ? "text-record/80" : "text-warning/80"
          }`}
        >
          {isIdle && "Ready to record"}
          {isRecording && "Recording"}
          {isPaused && "Paused"}
        </span>
      </div>
    </div>
  );
}
