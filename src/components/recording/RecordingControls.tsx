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
        className={`text-5xl font-extralight tabular-nums tracking-[0.08em] transition-colors duration-500 ${
          isIdle ? "text-text-muted/60" : "text-text-primary"
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatTime(elapsedMs)}
      </div>

      {/* Main button area */}
      <div className="flex items-center gap-6">
        {/* Pause/resume */}
        {!isIdle && (
          <button
            onClick={handlePauseResume}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.12] transition-all duration-200 cursor-pointer backdrop-blur-sm"
            style={{ animation: "fade-in 0.25s ease-out" }}
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
        <div className="relative flex items-center justify-center">
          {/* Ambient glow ring */}
          {isRecording && (
            <div
              className="absolute w-[104px] h-[104px] rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)",
                animation: "ring-pulse 2.5s ease-in-out infinite",
              }}
            />
          )}

          {/* Outer ring */}
          <div className={`absolute w-[88px] h-[88px] rounded-full transition-all duration-500 ${
            isIdle
              ? "border border-white/[0.06]"
              : isRecording
                ? "border-2 border-record/20"
                : "border-2 border-warning/20"
          }`} />

          <button
            onClick={handleMainButton}
            className={`relative flex items-center justify-center w-[72px] h-[72px] rounded-full transition-all duration-300 cursor-pointer ${
              isIdle
                ? "bg-record hover:bg-record-hover hover:scale-[1.05] active:scale-[0.96]"
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
              <span className="w-5 h-5 rounded-full bg-white/90" />
            ) : (
              <Square
                size={20}
                className="text-white/90"
                fill="rgba(255,255,255,0.9)"
                strokeWidth={0}
              />
            )}
          </button>
        </div>

        {/* Spacer for symmetry */}
        {!isIdle && <div className="w-12" />}
      </div>

      {/* Status label */}
      <div className="flex items-center gap-2">
        {isRecording && (
          <span className="w-1.5 h-1.5 rounded-full bg-record animate-pulse" />
        )}
        {isPaused && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        )}
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors duration-500 ${
            isIdle ? "text-text-muted/50" : isRecording ? "text-record/80" : "text-warning/80"
          }`}
        >
          {isIdle && "Ready to record"}
          {isRecording && "Recording"}
          {isPaused && "Paused"}
        </p>
      </div>
    </div>
  );
}
