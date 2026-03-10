import { Clock, Copy, Check, Pencil, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const matchRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Sync segments when transcript changes.
  useEffect(() => {
    setSegments(transcript.segments);
    setEditingId(null);
    setSearchQuery("");
    setSearchOpen(false);
  }, [transcript.id]);

  // Compute search matches: list of { segmentId, matchIndex } for each occurrence.
  const searchMatches = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    const matches: { segmentId: number; key: string }[] = [];
    for (const seg of segments) {
      const text = seg.text.toLowerCase();
      let start = 0;
      let idx: number;
      let matchNum = 0;
      while ((idx = text.indexOf(query, start)) !== -1) {
        matches.push({ segmentId: seg.id, key: `${seg.id}-${matchNum}` });
        start = idx + 1;
        matchNum++;
      }
    }
    return matches;
  }, [segments, searchQuery]);

  // Reset match index when matches change.
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [searchMatches.length]);

  // Scroll to current match.
  useEffect(() => {
    if (searchMatches.length > 0) {
      const match = searchMatches[currentMatchIdx];
      if (match) {
        const el = matchRefs.current.get(match.key);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentMatchIdx, searchMatches]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

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

  /** Render segment text with search highlights. */
  const renderHighlightedText = (text: string, segmentId: number) => {
    if (!searchQuery || searchQuery.length < 2) return text;
    const query = searchQuery.toLowerCase();
    const lowerText = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    let matchNum = 0;
    let idx: number;
    while ((idx = lowerText.indexOf(query, lastEnd)) !== -1) {
      if (idx > lastEnd) parts.push(text.slice(lastEnd, idx));
      const key = `${segmentId}-${matchNum}`;
      const globalIdx = searchMatches.findIndex((m) => m.key === key);
      const isCurrent = globalIdx === currentMatchIdx;
      parts.push(
        <mark
          key={key}
          ref={(el) => { matchRefs.current.set(key, el as HTMLDivElement | null); }}
          className={isCurrent ? "bg-accent/40 text-text-primary rounded-sm px-px" : "bg-accent/15 text-text-primary rounded-sm px-px"}
        >
          {text.slice(idx, idx + searchQuery.length)}
        </mark>
      );
      lastEnd = idx + searchQuery.length;
      matchNum++;
    }
    if (lastEnd < text.length) parts.push(text.slice(lastEnd));
    return <>{parts}</>;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {segments.length} segments
          <span className="ml-2 text-text-muted/50">click text to edit</span>
        </span>
        <div className="flex items-center gap-1">
          {searchOpen ? (
            <div className="flex items-center gap-1 bg-bg-input border border-border-subtle rounded px-1.5 py-0.5">
              <Search size={10} className="text-text-muted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? goToPrevMatch() : goToNextMatch(); }
                  if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
                }}
                placeholder="Find..."
                className="bg-transparent text-[11px] text-text-primary placeholder:text-text-muted/50 outline-none w-28"
                autoFocus
              />
              {searchMatches.length > 0 && (
                <span className="text-[10px] text-text-muted font-mono tabular-nums shrink-0">
                  {currentMatchIdx + 1}/{searchMatches.length}
                </span>
              )}
              {searchQuery.length >= 2 && searchMatches.length === 0 && (
                <span className="text-[10px] text-text-muted shrink-0">0</span>
              )}
              <button onClick={goToPrevMatch} className="p-0.5 text-text-muted hover:text-text-secondary cursor-pointer" title="Previous (Shift+Enter)">
                <ChevronUp size={10} />
              </button>
              <button onClick={goToNextMatch} className="p-0.5 text-text-muted hover:text-text-secondary cursor-pointer" title="Next (Enter)">
                <ChevronDown size={10} />
              </button>
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="p-0.5 text-text-muted hover:text-text-secondary cursor-pointer">
                <X size={10} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              title="Search transcript (Cmd+F)"
            >
              <Search size={10} />
              Find
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          >
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
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
                    {renderHighlightedText(segment.text, segment.id)}
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
