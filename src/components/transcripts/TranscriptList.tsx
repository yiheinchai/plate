import { FileText, Clock, Cpu, Mic, Monitor } from "lucide-react";
import type { Recording, Transcript } from "../../lib/types";

function formatDuration(ms: number | null): string {
  if (!ms || ms === 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTitle(title: string): string {
  const match = title.match(/^Recording (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5])
    );
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }) + " at " + date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return title;
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
      <div className="flex flex-col items-center justify-center py-12 text-text-muted">
        <FileText size={28} strokeWidth={1} className="mb-2 opacity-30" />
        <p className="text-[12px]">No recordings yet</p>
        <p className="text-[11px] mt-0.5 text-text-muted/60">Record something to get started</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {recordings.map((recording) => {
        const transcript = transcripts.get(recording.id);
        const isSelected = selectedId === recording.id;
        const hasTranscript = !!transcript;
        const duration = formatDuration(recording.duration_ms);
        const isMic = recording.source_type === "microphone";

        return (
          <div key={recording.id}>
            <button
              onClick={() => onSelect(recording)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-accent/15 text-text-primary"
                  : "hover:bg-white/[0.03] text-text-secondary"
              }`}
            >
              <div className="shrink-0">
                {isMic ? (
                  <Mic size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                ) : (
                  <Monitor size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">
                  {formatTitle(recording.title)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {duration && (
                    <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                      <Clock size={8} />
                      {duration}
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted">
                    {formatDate(recording.created_at)}
                  </span>
                </div>
              </div>
              {hasTranscript && (
                <span className="shrink-0 text-[9px] font-medium text-success px-1 py-0.5 bg-success/10 rounded">
                  done
                </span>
              )}
            </button>

            {/* Expanded detail */}
            {isSelected && !hasTranscript && (
              <div
                className="px-3 py-2 bg-bg-card border-y border-border-subtle"
                style={{ animation: "fade-in 0.1s ease-out" }}
              >
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-text-muted flex-1">No transcript</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTranscribe(recording.id);
                    }}
                    disabled={isTranscribing}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      isTranscribing
                        ? "bg-accent/30 text-accent/50 cursor-not-allowed"
                        : "bg-accent text-white hover:bg-accent-hover"
                    }`}
                  >
                    {isTranscribing ? "Transcribing..." : "Transcribe"}
                  </button>
                </div>
              </div>
            )}

            {isSelected && hasTranscript && (
              <div
                className="px-3 py-2 bg-bg-card border-y border-border-subtle"
                style={{ animation: "fade-in 0.1s ease-out" }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Cpu size={10} className="text-text-muted" />
                  <span className="text-[10px] text-text-muted">
                    {transcript.engine}
                    {transcript.model ? ` / ${transcript.model}` : ""}
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-3">
                  {transcript.full_text}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
