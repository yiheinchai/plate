import { FileText, ChevronRight, Clock, Cpu, Mic, Monitor } from "lucide-react";
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
  // Make auto-generated titles more readable
  // "Recording 2026-03-09 16:45" -> "Mar 9 at 4:45 PM"
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
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <FileText size={36} strokeWidth={1} className="mb-3 opacity-40" />
        <p className="text-sm">No recordings yet</p>
        <p className="text-xs mt-1 text-text-muted/60">Start a recording to see it here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer ${
                isSelected
                  ? "bg-accent/[0.08] border border-accent/20"
                  : "bg-bg-card/30 border border-transparent hover:bg-bg-card-hover/60"
              }`}
            >
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                isSelected ? "bg-accent/15" : "bg-white/[0.04]"
              }`}>
                {isMic ? (
                  <Mic size={15} className={isSelected ? "text-accent" : "text-text-muted"} />
                ) : (
                  <Monitor size={15} className={isSelected ? "text-accent" : "text-text-muted"} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-medium text-text-primary truncate">
                  {formatTitle(recording.title)}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {duration && (
                    <span className="text-[11px] text-text-muted flex items-center gap-1">
                      <Clock size={9} />
                      {duration}
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted">
                    {formatDate(recording.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasTranscript && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/10 text-success">
                    Transcribed
                  </span>
                )}
                <ChevronRight
                  size={14}
                  className={`text-text-muted/50 transition-transform duration-150 ${
                    isSelected ? "rotate-90" : ""
                  }`}
                />
              </div>
            </button>

            {/* Expanded section */}
            {isSelected && (
              <div
                className="mt-1 ml-3 p-3 bg-bg-card/50 rounded-xl border border-border-subtle/30"
                style={{ animation: "fade-in 0.15s ease-out" }}
              >
                {hasTranscript ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu size={11} className="text-text-muted" />
                      <span className="text-[11px] text-text-muted">
                        {transcript.engine}
                        {transcript.model ? ` / ${transcript.model}` : ""}
                      </span>
                    </div>
                    <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-4">
                      {transcript.full_text}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 py-1">
                    <p className="text-[13px] text-text-muted">
                      No transcript yet
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTranscribe(recording.id);
                      }}
                      disabled={isTranscribing}
                      className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
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
