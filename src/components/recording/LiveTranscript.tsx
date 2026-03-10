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
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border-b border-border-subtle">
        <MessageSquareText size={11} className="text-text-muted" />
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
          Transcript
        </span>
        {isRecording && text && (
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-text-muted">listening</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="px-3 py-2 min-h-[48px] max-h-[160px] overflow-y-auto"
      >
        {isTranscribing && !text ? (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-[12px] text-text-muted">Transcribing...</p>
          </div>
        ) : text ? (
          <p className="text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-[12px] text-text-muted/60 italic">
            {isRecording
              ? "Waiting for speech..."
              : "Start recording to see transcript here"}
          </p>
        )}
      </div>
    </div>
  );
}
