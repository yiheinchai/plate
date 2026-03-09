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
    <div className="flex flex-col bg-bg-card/60 rounded-xl border border-border-subtle/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle/30">
        <MessageSquareText size={12} className="text-text-muted" />
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em]">
          Live Transcript
        </span>
        {isRecording && text && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-text-muted">Listening</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="px-4 py-3 min-h-[60px] max-h-[200px] overflow-y-auto"
      >
        {isTranscribing && !text ? (
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-[13px] text-text-muted">Transcribing audio...</p>
          </div>
        ) : text ? (
          <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-[13px] text-text-muted/50 italic">
            {isRecording
              ? "Waiting for speech..."
              : "Transcript will appear here after recording."}
          </p>
        )}
      </div>
    </div>
  );
}
