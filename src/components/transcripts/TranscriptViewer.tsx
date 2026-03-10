import { Clock, Copy, Check, Pencil } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Transcript } from "../../lib/types";
import * as tauri from "../../lib/tauri";

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState(transcript.segments);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Sync segments when transcript changes.
  useEffect(() => {
    setSegments(transcript.segments);
    setEditingId(null);
  }, [transcript.id]);

  const handleCopy = async () => {
    try {
      const fullText = segments.map((s) => s.text.trim()).join(" ");
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const startEditing = (segmentId: number, text: string) => {
    setEditingId(segmentId);
    setEditText(text);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const saveEdit = async () => {
    if (editingId === null || saving) return;
    const trimmed = editText.trim();
    const original = segments.find((s) => s.id === editingId);
    if (!trimmed || trimmed === original?.text.trim()) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      await tauri.updateSegmentText(editingId, transcript.id, trimmed);
      setSegments((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, text: trimmed } : s))
      );
    } catch (err) {
      console.error("Failed to save segment:", err);
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  // Find the active segment based on playback time.
  const activeSegmentId = playbackTimeMs != null
    ? segments.find(
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
          {segments.length} segments
          <span className="ml-2 text-text-muted/50">click text to edit</span>
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
      {segments.length > 0 ? (
        <div className="flex flex-col">
          {segments.map((segment) => {
            const isActive = segment.id === activeSegmentId;
            const isEditing = editingId === segment.id;
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
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <textarea
                      ref={editRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      rows={2}
                      className="w-full bg-bg-input border border-accent/40 rounded px-2 py-1 text-[12px] text-text-primary outline-none resize-none leading-relaxed"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="text-[10px] text-accent hover:text-accent-hover cursor-pointer"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <span className="text-[10px] text-text-muted/40">·</span>
                      <button
                        onClick={cancelEdit}
                        className="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer"
                      >
                        Cancel
                      </button>
                      <span className="text-[10px] text-text-muted/30 ml-1">Enter to save, Esc to cancel</span>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => startEditing(segment.id, segment.text)}
                    className={`text-[12px] leading-relaxed cursor-text group flex-1 ${
                      isActive ? "text-text-primary" : "text-text-secondary"
                    }`}
                    title="Click to edit"
                  >
                    {segment.text}
                    <Pencil size={9} className="inline ml-1 opacity-0 group-hover:opacity-30 transition-opacity" />
                  </p>
                )}
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
