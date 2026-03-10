import { Clock, Copy, Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Transcript } from "../../lib/types";

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface TranscriptViewerProps {
  transcript: Transcript;
  /** Current playback time in milliseconds, for highlighting the active segment. */
  playbackTimeMs?: number;
  /** Called when user clicks a segment timestamp to seek. */
  onSeek?: (ms: number) => void;
}

export default function TranscriptViewer({ transcript, playbackTimeMs, onSeek }: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript.full_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  // Find the active segment based on playback time.
  const activeSegmentId = playbackTimeMs != null
    ? transcript.segments.find(
        (seg) => playbackTimeMs >= seg.start_ms && playbackTimeMs < seg.end_ms
      )?.id ?? null
    : null;

  // Auto-scroll to active segment.
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSegmentId]);

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {transcript.segments.length} segments
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Segments */}
      {transcript.segments.length > 0 ? (
        <div className="flex flex-col">
          {transcript.segments.map((segment) => {
            const isActive = segment.id === activeSegmentId;
            return (
              <div
                key={segment.id}
                ref={isActive ? activeRef : undefined}
                className={`flex gap-2 py-1 transition-colors rounded ${
                  isActive
                    ? "bg-accent/10"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <button
                  onClick={() => onSeek?.(segment.start_ms)}
                  className="shrink-0 flex items-center gap-0.5 text-[10px] text-text-muted font-mono tabular-nums pt-px hover:text-accent transition-colors cursor-pointer"
                >
                  <Clock size={8} />
                  {formatTimestamp(segment.start_ms)}
                </button>
                <p className={`text-[12px] leading-relaxed ${
                  isActive ? "text-text-primary" : "text-text-secondary"
                }`}>
                  {segment.text}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] text-text-secondary leading-relaxed">
          {transcript.full_text}
        </p>
      )}
    </div>
  );
}
