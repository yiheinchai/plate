import { useEffect, useRef } from "react";

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
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-[10px] font-semibold text-text-muted/50 uppercase tracking-[0.15em]">
          Live Transcript
        </span>
        {isRecording && text && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-40" />
              <span className="relative block w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            <span className="text-[10px] text-success/60">listening</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="px-4 pb-3 min-h-[48px] max-h-[160px] overflow-y-auto"
      >
        {isTranscribing && !text ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-[12px] text-text-muted">Transcribing...</p>
          </div>
        ) : text ? (
          <p className="text-[12px] text-text-secondary/80 leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-[12px] text-text-muted/30 italic">
            {isRecording
              ? "Waiting for speech..."
              : "Start recording to see live transcript"}
          </p>
        )}
      </div>
    </div>
  );
}
