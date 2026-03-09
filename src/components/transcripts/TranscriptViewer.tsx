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
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Transcript
          </span>
          <span className="text-xs text-text-muted">
            ({transcript.segments.length} segments)
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>

      {/* Segments */}
      {transcript.segments.length > 0 ? (
        <div className="flex flex-col gap-1">
          {transcript.segments.map((segment) => (
            <div
              key={segment.id}
              className="group flex gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <span className="shrink-0 flex items-center gap-1 text-[11px] text-text-muted font-mono tabular-nums pt-0.5">
                <Clock size={10} />
                {formatTimestamp(segment.start_ms)}
              </span>
              <p className="text-sm text-text-secondary leading-relaxed">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-secondary leading-relaxed">
          {transcript.full_text}
        </p>
      )}
    </div>
  );
}
