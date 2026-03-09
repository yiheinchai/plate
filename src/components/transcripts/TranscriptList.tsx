import { FileText, ChevronRight, Clock, Cpu } from "lucide-react";
import type { Recording, Transcript } from "../../lib/types";

function formatDuration(ms: number | null): string {
  if (ms === null) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TranscriptListProps {
  recordings: Recording[];
  transcripts: Map<string, Transcript>;
  selectedId: string | null;
  onSelect: (recording: Recording) => void;
  onTranscribe: (recordingId: string) => void;
  isTranscribing: boolean;
}

export default function TranscriptList({
  recordings,
  transcripts,
  selectedId,
  onSelect,
  onTranscribe,
  isTranscribing,
}: TranscriptListProps) {
  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <FileText size={40} strokeWidth={1} className="mb-3 opacity-50" />
        <p className="text-sm">No recordings yet</p>
        <p className="text-xs mt-1">Start a recording to see it here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {recordings.map((recording) => {
        const transcript = transcripts.get(recording.id);
        const isSelected = selectedId === recording.id;
        const hasTranscript = !!transcript;

        return (
          <div key={recording.id}>
            <button
              onClick={() => onSelect(recording)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-bg-card-hover border border-accent/30"
                  : "bg-bg-card/50 border border-border-subtle/50 hover:bg-bg-card-hover"
              }`}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 shrink-0">
                <FileText size={18} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-text-primary truncate">
                  {recording.title}
                </h3>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-text-muted flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(recording.duration_ms)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDate(recording.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasTranscript && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                    Transcribed
                  </span>
                )}
                <ChevronRight
                  size={16}
                  className={`text-text-muted transition-transform ${
                    isSelected ? "rotate-90" : ""
                  }`}
                />
              </div>
            </button>

            {/* Expanded section */}
            {isSelected && (
              <div className="mt-2 ml-4 p-4 bg-bg-card rounded-2xl border border-border-subtle">
                {hasTranscript ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu size={12} className="text-text-muted" />
                      <span className="text-xs text-text-muted">
                        {transcript.engine}
                        {transcript.model ? ` / ${transcript.model}` : ""}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed line-clamp-6">
                      {transcript.full_text}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-sm text-text-muted">
                      No transcript yet
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTranscribe(recording.id);
                      }}
                      disabled={isTranscribing}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isTranscribing
                          ? "bg-accent/50 text-white/50 cursor-not-allowed"
                          : "bg-accent text-white hover:bg-accent-hover"
                      }`}
                    >
                      {isTranscribing ? "Transcribing..." : "Transcribe"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
