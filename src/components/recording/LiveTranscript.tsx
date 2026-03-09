import { useEffect, useRef } from "react";
import { MessageSquareText } from "lucide-react";

interface LiveTranscriptProps {
  text: string;
  isRecording: boolean;
  isTranscribing?: boolean;
}

export default function LiveTranscript({ text, isRecording, isTranscribing }: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="flex flex-col bg-bg-card/50 rounded-2xl border border-border-subtle/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-subtle/50">
        <MessageSquareText size={13} className="text-text-muted" />
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
          Live Transcript
        </span>
        {isRecording && text && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[11px] text-text-muted">Listening</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="px-5 py-4 min-h-[80px] max-h-[180px] overflow-y-auto"
      >
        {isTranscribing && !text ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-sm text-text-muted">Transcribing audio...</p>
          </div>
        ) : text ? (
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-sm text-text-muted/60 italic">
            {isRecording
              ? "Waiting for speech..."
              : "Transcript will appear here after recording."}
          </p>
        )}
      </div>
    </div>
  );
}
