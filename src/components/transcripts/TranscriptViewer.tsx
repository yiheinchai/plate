import { Clock, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Transcript } from "../../lib/types";

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface TranscriptViewerProps {
  transcript: Transcript;
}

export default function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript.full_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {transcript.segments.length} segments
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Segments */}
      {transcript.segments.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {transcript.segments.map((segment) => (
            <div
              key={segment.id}
              className="group flex gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
            >
              <span className="shrink-0 flex items-center gap-1 text-[10px] text-text-muted/70 font-mono tabular-nums pt-0.5">
                <Clock size={9} />
                {formatTimestamp(segment.start_ms)}
              </span>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-text-secondary leading-relaxed">
          {transcript.full_text}
        </p>
      )}
    </div>
  );
}
