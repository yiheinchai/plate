import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Search, RefreshCw, Trash2, Mic, Monitor, Clock, Play, Pause, Download, Upload, FileAudio, Bookmark, X, Zap, Star } from "lucide-react";
import { useTranscript } from "../hooks/useTranscript";
import * as tauri from "../lib/tauri";
import type { Recording, Transcript, Note, SearchResult, Bookmark as BookmarkType } from "../lib/types";
import TranscriptViewer from "../components/transcripts/TranscriptViewer";
import PromptPicker from "../components/notes/PromptPicker";
import NoteViewer from "../components/notes/NoteViewer";
import { useNotes } from "../hooks/useNotes";
import { useSettings } from "../hooks/useSettings";

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

function isAutoTitle(title: string): boolean {
  return /^Recording \d{4}-\d{2}-\d{2}/.test(title);
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - recDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Earlier";
}

function groupRecordingsByDate(recordings: Recording[]): { label: string; recordings: Recording[] }[] {
  const order = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];
  const groups = new Map<string, Recording[]>();
  for (const rec of recordings) {
    const label = getDateGroup(rec.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(rec);
  }
  return order.filter((l) => groups.has(l)).map((l) => ({ label: l, recordings: groups.get(l)! }));
}

export default function LibraryPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [transcriptMap, setTranscriptMap] = useState<Map<string, Transcript>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [recordingNotes, setRecordingNotes] = useState<Note[]>([]);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [detailTab, setDetailTab] = useState<"transcript" | "notes">("transcript");

  const {
    currentTranscript,
    isTranscribing,
    transcriptionProgress,
    downloadProgress,
    transcribeRecording,
    setCurrentTranscript,
  } = useTranscript();

  const { isGenerating, error: notesError, generateNotes } = useNotes();
  const { settings } = useSettings();

  const location = useLocation();
  const navState = location.state as { selectRecordingId?: string; autoTranscribe?: boolean } | null;
  const handledNavState = useRef<string | null>(null);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const [isDragOver, setIsDragOver] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recs, transcripts] = await Promise.all([
        tauri.listRecordings(),
        tauri.listTranscripts(),
      ]);
      setRecordings(recs);
      const tMap = new Map<string, Transcript>();
      transcripts.forEach((t) => tMap.set(t.recording_id, t));
      setTranscriptMap(tMap);
      return { recordings: recs, transcriptMap: tMap };
    } catch (err) {
      console.error("Failed to load library data:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reload data every time the Library route becomes active
  useEffect(() => {
    loadData().then((data) => {
      if (!data) return;
      // If navigated from Record page with a recording to auto-select
      if (navState?.selectRecordingId && handledNavState.current !== navState.selectRecordingId) {
        handledNavState.current = navState.selectRecordingId;
        const rid = navState.selectRecordingId;
        setSelectedId(rid);
        const t = data.transcriptMap.get(rid);
        setCurrentTranscript(t ?? null);
        setDetailTab("transcript");

        // Auto-transcribe if requested by nav state or enabled in settings
        if ((navState.autoTranscribe || settings.auto_transcribe) && !data.transcriptMap.has(rid)) {
          handleTranscribe(rid);
        }
      }
    });
  }, [location.key]);

  // Load notes when transcript changes
  useEffect(() => {
    if (currentTranscript) {
      tauri.listNotes(currentTranscript.id).then(setRecordingNotes).catch(console.error);
    } else {
      setRecordingNotes([]);
    }
  }, [currentTranscript]);

  // Load bookmarks when selection changes
  useEffect(() => {
    if (selectedId) {
      tauri.listBookmarks(selectedId).then(setBookmarks).catch(console.error);
    } else {
      setBookmarks([]);
    }
  }, [selectedId]);

  const handleSelect = (recording: Recording) => {
    if (selectedId === recording.id) {
      setSelectedId(null);
      setCurrentTranscript(null);
      setViewingNote(null);
    } else {
      setSelectedId(recording.id);
      const t = transcriptMap.get(recording.id);
      setCurrentTranscript(t ?? null);
      setViewingNote(null);
      setDetailTab("transcript");
    }
  };

  const handleTranscribe = async (recordingId: string) => {
    try {
      const transcript = await transcribeRecording(recordingId);
      setTranscriptMap((prev) => {
        const next = new Map(prev);
        next.set(recordingId, transcript);
        return next;
      });
      // Auto-rename recording from transcript content
      const recording = recordings.find((r) => r.id === recordingId);
      if (recording && isAutoTitle(recording.title) && transcript.full_text.length > 20) {
        autoRenameRecording(recordingId, transcript.full_text);
      }
      // Auto-generate notes if enabled (use transcript directly, not state)
      if (settings.auto_generate_notes && transcript) {
        try {
          const promptStyle = settings.default_prompt_style || "summary";
          const customPrompt = settings.default_custom_prompt || undefined;
          const note = await generateNotes(transcript.id, promptStyle, customPrompt);
          const notes = await tauri.listNotes(transcript.id);
          setRecordingNotes(notes);
          setDetailTab("notes");
          // Auto-rename from note title if still auto-titled
          const rec = recordings.find((r) => r.id === recordingId);
          if (rec && isAutoTitle(rec.title) && note.title) {
            try {
              await tauri.renameRecording(rec.id, note.title);
              setRecordings((prev) =>
                prev.map((r) => r.id === rec.id ? { ...r, title: note.title } : r)
              );
            } catch { /* non-critical */ }
          }
        } catch { /* note generation error handled in hook */ }
      }
    } catch {
      // Error handled in hook
    }
  };

  const autoRenameRecording = async (recordingId: string, transcriptText: string) => {
    try {
      const preview = transcriptText.slice(0, 300);
      const firstSentence = preview.split(/[.!?]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 5 && firstSentence.length < 80) {
        await tauri.renameRecording(recordingId, firstSentence);
        setRecordings((prev) =>
          prev.map((r) =>
            r.id === recordingId ? { ...r, title: firstSentence } : r
          )
        );
      }
    } catch (err) {
      console.error("Failed to auto-rename:", err);
    }
  };

  const handleGenerateNotes = async (promptStyle: string, customPrompt?: string) => {
    if (!currentTranscript) return;
    try {
      const note = await generateNotes(currentTranscript.id, promptStyle, customPrompt);
      // Refresh notes for this transcript
      const notes = await tauri.listNotes(currentTranscript.id);
      setRecordingNotes(notes);
      setDetailTab("notes");

      // Also auto-rename recording if it still has the default title
      const recording = recordings.find((r) => r.id === selectedId);
      if (recording && isAutoTitle(recording.title) && note.title) {
        try {
          await tauri.renameRecording(recording.id, note.title);
          setRecordings((prev) =>
            prev.map((r) =>
              r.id === recording.id ? { ...r, title: note.title } : r
            )
          );
        } catch {
          // Non-critical
        }
      }
    } catch {
      // Error handled in hook
    }
  };

  const handleToggleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const starred = await tauri.toggleStar(id);
      setRecordings((prev) =>
        prev.map((r) => (r.id === id ? { ...r, starred } : r))
      );
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const handleDeleteRecording = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tauri.deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentTranscript(null);
        setViewingNote(null);
      }
    } catch (err) {
      console.error("Failed to delete recording:", err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await tauri.deleteNote(noteId);
      setRecordingNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (viewingNote?.id === noteId) setViewingNote(null);
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  // Save playback position to DB (debounced).
  const positionSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePosition = useCallback((recId: string, timeMs: number) => {
    if (positionSaveRef.current) clearTimeout(positionSaveRef.current);
    positionSaveRef.current = setTimeout(() => {
      tauri.updatePlaybackPosition(recId, Math.round(timeMs)).catch(() => {});
    }, 2000);
  }, []);

  const togglePlayback = async () => {
    if (!audioRef.current || !selectedRecording) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      // Save position immediately on pause.
      const posMs = Math.round(audioRef.current.currentTime * 1000);
      tauri.updatePlaybackPosition(selectedRecording.id, posMs).catch(() => {});
      setRecordings((prev) =>
        prev.map((r) => r.id === selectedRecording.id ? { ...r, last_position_ms: posMs } : r)
      );
    } else {
      if (!audioReady) {
        setAudioLoading(true);
        try {
          const url = await tauri.getPlayableAudioUrl(selectedRecording.id);
          audioRef.current.src = url;
          await new Promise<void>((resolve, reject) => {
            if (!audioRef.current) return reject();
            audioRef.current.oncanplaythrough = () => resolve();
            audioRef.current.onerror = () => reject(new Error("Audio load failed"));
          });
          setAudioReady(true);
          // Restore saved position.
          if (selectedRecording.last_position_ms > 0 && audioRef.current) {
            audioRef.current.currentTime = selectedRecording.last_position_ms / 1000;
            setPlaybackTime(selectedRecording.last_position_ms / 1000);
          }
        } catch (err) {
          console.error("Failed to load audio:", err);
          setAudioLoading(false);
          return;
        }
        setAudioLoading(false);
      }
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleExport = async (id: string) => {
    setExportingId(id);
    try {
      const path = await tauri.exportRecording(id);
      console.log("Exported to:", path);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExportingId(null);
    }
  };

  const handleImportAudio = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "ogg", "flac", "aac"] }],
      });
      if (!selected) return;
      const filePath = typeof selected === "string" ? selected : (selected as { path: string }).path;
      const recording = await tauri.importAudio(filePath);
      setRecordings((prev) => [recording, ...prev]);
      setSelectedId(recording.id);
      setCurrentTranscript(null);
      setDetailTab("transcript");
    } catch (err) {
      console.error("Import failed:", err);
    }
  };

  const untranscribedCount = recordings.filter((r) => !transcriptMap.has(r.id)).length;

  const handleBatchTranscribe = async () => {
    const queue = recordings.filter((r) => !transcriptMap.has(r.id));
    if (queue.length === 0) return;
    setBatchProgress({ current: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      setBatchProgress({ current: i + 1, total: queue.length });
      try {
        const transcript = await tauri.transcribeRecording(queue[i].id);
        setTranscriptMap((prev) => {
          const next = new Map(prev);
          next.set(queue[i].id, transcript);
          return next;
        });
        // Auto-rename from transcript
        if (isAutoTitle(queue[i].title) && transcript.full_text.length > 20) {
          autoRenameRecording(queue[i].id, transcript.full_text);
        }
        // Auto-generate notes if enabled
        if (settings.auto_generate_notes) {
          try {
            const promptStyle = settings.default_prompt_style || "summary";
            const customPrompt = settings.default_custom_prompt || undefined;
            const note = await generateNotes(transcript.id, promptStyle, customPrompt);
            if (isAutoTitle(queue[i].title) && note.title) {
              try {
                await tauri.renameRecording(queue[i].id, note.title);
                setRecordings((prev) =>
                  prev.map((r) => r.id === queue[i].id ? { ...r, title: note.title } : r)
                );
              } catch { /* non-critical */ }
            }
          } catch { /* note generation error handled in hook */ }
        }
      } catch (err) {
        console.error(`Batch transcribe failed for ${queue[i].id}:`, err);
      }
    }
    setBatchProgress(null);
  };

  // Reset audio when selection changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    setIsPlaying(false);
    setAudioReady(false);
    setAudioLoading(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    setPlaybackSpeed(1);
  }, [selectedId]);

  // Drag-and-drop audio import via Tauri native events.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const AUDIO_EXTS = [".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"];
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          const audioFiles = event.payload.paths.filter((p) =>
            AUDIO_EXTS.some((ext) => p.toLowerCase().endsWith(ext))
          );
          for (const filePath of audioFiles) {
            try {
              const recording = await tauri.importAudio(filePath);
              setRecordings((prev) => [recording, ...prev]);
              if (audioFiles.length === 1) {
                setSelectedId(recording.id);
                setCurrentTranscript(null);
                setDetailTab("transcript");
              }
            } catch (err) {
              console.error("Drop import failed:", err);
            }
          }
        }
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  // Debounced full-text search across transcripts and notes.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      tauri.search(searchQuery.trim()).then((results) => {
        setSearchResults(results);
        setIsSearching(false);
      }).catch(() => setIsSearching(false));
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const filteredRecordings = (() => {
    let result = recordings;
    if (showStarredOnly) result = result.filter((r) => r.starred);
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.title.toLowerCase().includes(q));
    }
    return result;
  })();

  const hasDeepResults = searchResults.some((r) => r.kind !== "recording");

  const selectedRecording = recordings.find((r) => r.id === selectedId);

  // If viewing a specific note, show the NoteViewer full-screen in the detail panel
  if (viewingNote) {
    return (
      <div className="flex flex-col h-full min-w-0">
        <NoteViewer
          note={viewingNote}
          onBack={() => setViewingNote(null)}
          onNoteUpdated={(updated) => {
            setViewingNote(updated);
            setRecordingNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-w-0">
      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg-primary/90 border-2 border-dashed border-accent rounded-lg pointer-events-none">
          <FileAudio size={36} className="text-accent mb-2 opacity-80" />
          <p className="text-[13px] font-medium text-accent">Drop audio files to import</p>
          <p className="text-[11px] text-text-muted mt-0.5">WAV, MP3, M4A, OGG, FLAC, AAC</p>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Library</span>
        <button
          onClick={() => setShowStarredOnly(!showStarredOnly)}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer ${
            showStarredOnly
              ? "text-yellow-400 bg-yellow-400/10"
              : "text-text-muted hover:text-text-secondary hover:bg-white/5"
          }`}
          title={showStarredOnly ? "Show all" : "Show starred only"}
        >
          <Star size={13} fill={showStarredOnly ? "currentColor" : "none"} />
        </button>
        <div className="flex-1" />
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="bg-bg-input border border-border-subtle rounded pl-7 pr-3 py-1 text-[12px] text-text-primary placeholder:text-text-muted/60 outline-none focus:border-accent/60 transition-colors w-44"
          />
        </div>
        {untranscribedCount > 0 && (
          <button
            onClick={handleBatchTranscribe}
            disabled={!!batchProgress || isTranscribing}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              batchProgress
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-accent hover:bg-accent/10"
            }`}
            title={`Transcribe ${untranscribedCount} recording${untranscribedCount !== 1 ? "s" : ""}`}
          >
            {batchProgress ? (
              <>
                <div className="w-2.5 h-2.5 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
                {batchProgress.current}/{batchProgress.total}
              </>
            ) : (
              <>
                <Zap size={10} />
                Transcribe All ({untranscribedCount})
              </>
            )}
          </button>
        )}
        <button
          onClick={handleImportAudio}
          className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Import audio file"
        >
          <Upload size={13} />
        </button>
        <button
          onClick={() => loadData()}
          className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Recording list sidebar */}
        <div className={`overflow-y-auto min-w-0 ${selectedId ? "w-[260px] shrink-0 border-r border-border-subtle" : "flex-1 max-w-md"}`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="animate-spin text-text-muted" />
            </div>
          ) : filteredRecordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <Mic size={28} strokeWidth={1} className="mb-2 opacity-30" />
              <p className="text-[12px]">Nothing on your plate yet</p>
              <p className="text-[11px] mt-0.5 text-text-muted/60">Record a lecture to get started</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Deep search results (transcript/note matches) */}
              {hasDeepResults && (
                <div className="border-b border-border-subtle">
                  <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider">
                    Found in transcripts & notes
                  </div>
                  {searchResults
                    .filter((r) => r.kind !== "recording")
                    .map((result, i) => (
                      <button
                        key={`${result.kind}-${result.recording_id}-${i}`}
                        onClick={() => {
                          const rec = recordings.find((r) => r.id === result.recording_id);
                          if (rec) {
                            handleSelect(rec);
                            if (result.kind === "note") {
                              setDetailTab("notes");
                            } else {
                              setDetailTab("transcript");
                            }
                          }
                        }}
                        className="w-full flex flex-col gap-0.5 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-medium text-accent uppercase">
                            {result.kind === "note" ? "Note" : "Transcript"}
                          </span>
                          <span className="text-[10px] text-text-muted truncate">
                            {result.recording_title}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary line-clamp-2">
                          {result.snippet}
                        </p>
                      </button>
                    ))}
                </div>
              )}
              {isSearching && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-text-muted">
                  <div className="w-2.5 h-2.5 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
                  Searching...
                </div>
              )}
              {(searchQuery.trim().length >= 2
                ? [{ label: "", recordings: filteredRecordings }]
                : groupRecordingsByDate(filteredRecordings)
              ).map((group) => (
                <div key={group.label}>
                  {group.label && (
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted/70 uppercase tracking-wider bg-bg-primary/50 border-b border-border-subtle sticky top-0 z-10">
                      {group.label}
                    </div>
                  )}
                  {group.recordings.map((recording) => {
                    const isSelected = selectedId === recording.id;
                    const hasTranscript = transcriptMap.has(recording.id);
                    const duration = formatDuration(recording.duration_ms);
                    const isMic = recording.source_type === "microphone";

                    return (
                      <button
                        key={recording.id}
                        onClick={() => handleSelect(recording)}
                        className={`group w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-accent/15 text-text-primary"
                            : "hover:bg-white/[0.03] text-text-secondary"
                        }`}
                      >
                        <div className="shrink-0">
                          {recording.source_type === "imported" ? (
                            <Upload size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          ) : isMic ? (
                            <Mic size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          ) : (
                            <Monitor size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate">
                            {recording.title}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {duration && (
                              <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                                <Clock size={8} />
                                {duration}
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted">
                              {formatDate(recording.created_at)}
                            </span>
                            {recording.last_position_ms > 0 && recording.duration_ms && recording.last_position_ms < recording.duration_ms - 2000 && (
                              <span className="text-[9px] text-accent/60">
                                ▸ {formatDuration(recording.last_position_ms)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasTranscript && (
                            <span className="text-[9px] font-medium text-success">
                              T
                            </span>
                          )}
                          <button
                            onClick={(e) => handleToggleStar(recording.id, e)}
                            className={`p-1 rounded transition-all cursor-pointer ${
                              recording.starred
                                ? "text-yellow-400"
                                : "text-text-muted opacity-0 group-hover:opacity-100 hover:text-yellow-400"
                            }`}
                            title={recording.starred ? "Unstar" : "Star"}
                          >
                            <Star size={11} fill={recording.starred ? "currentColor" : "none"} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteRecording(recording.id, e)}
                            className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-record hover:bg-record/10 transition-all cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && selectedRecording && (
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Detail toolbar with tabs */}
            <div className="flex items-center gap-0 border-b border-border-subtle bg-bg-card shrink-0">
              <button
                onClick={() => setDetailTab("transcript")}
                className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors cursor-pointer ${
                  detailTab === "transcript"
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                Transcript
              </button>
              <button
                onClick={() => setDetailTab("notes")}
                className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors cursor-pointer ${
                  detailTab === "notes"
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                Notes{recordingNotes.length > 0 && ` (${recordingNotes.length})`}
              </button>
              <div className="flex-1" />
              {currentTranscript && (
                <div className="pr-2">
                  <PromptPicker
                    onGenerate={handleGenerateNotes}
                    isGenerating={isGenerating}
                  />
                </div>
              )}
            </div>

            {/* Audio player */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-bg-card">
              <audio
                ref={audioRef}
                onTimeUpdate={(e) => {
                  setPlaybackTime(e.currentTarget.currentTime);
                  if (selectedRecording) {
                    savePosition(selectedRecording.id, e.currentTarget.currentTime * 1000);
                  }
                }}
                onLoadedMetadata={(e) => setPlaybackDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
              />
              <button
                onClick={togglePlayback}
                disabled={audioLoading}
                className="shrink-0 w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-accent hover:bg-accent/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                {audioLoading ? (
                  <div className="w-3 h-3 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
                ) : isPlaying ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={playbackDuration || 100}
                step="any"
                value={playbackTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  setPlaybackTime(t);
                  if (audioRef.current) audioRef.current.currentTime = t;
                }}
                className="flex-1 h-1 accent-accent cursor-pointer"
              />
              <span className="shrink-0 text-[10px] text-text-muted font-mono tabular-nums">
                {formatDuration(playbackTime * 1000 || null)} / {formatDuration(playbackDuration * 1000 || null)}
              </span>
              <button
                onClick={() => {
                  const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
                  const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
                  setPlaybackSpeed(next);
                  if (audioRef.current) audioRef.current.playbackRate = next;
                }}
                className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer min-w-[32px] text-center"
                title="Playback speed"
              >
                {playbackSpeed}x
              </button>
              <button
                onClick={() => handleExport(selectedRecording.id)}
                disabled={exportingId === selectedRecording.id}
                className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
                title="Save to Downloads"
              >
                <Download size={10} />
                {exportingId === selectedRecording.id ? "Saving..." : "Save"}
              </button>
            </div>

            {/* Bookmarks bar */}
            {bookmarks.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border-subtle bg-bg-card overflow-x-auto">
                <Bookmark size={10} className="text-accent/60 shrink-0" />
                {bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    onClick={() => {
                      const timeSec = bm.timestamp_ms / 1000;
                      if (audioRef.current && audioReady) {
                        audioRef.current.currentTime = timeSec;
                        setPlaybackTime(timeSec);
                      }
                    }}
                    className="group flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 hover:bg-accent/20 text-accent text-[10px] font-mono transition-colors cursor-pointer shrink-0"
                    title={bm.label || `Bookmark at ${formatDuration(bm.timestamp_ms)}`}
                  >
                    {formatDuration(bm.timestamp_ms)}
                    {bm.label && <span className="text-accent/70 font-sans">{bm.label}</span>}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        tauri.deleteBookmark(bm.id).then(() => {
                          setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-record transition-opacity cursor-pointer"
                    >
                      <X size={8} />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {notesError && (
              <div className="px-3 py-1.5 bg-record/10 border-b border-record/20">
                <p className="text-[11px] text-record break-words">{notesError}</p>
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {detailTab === "transcript" && (
                <>
                  {currentTranscript ? (
                    <div className="px-4 py-3">
                      <TranscriptViewer
                        transcript={currentTranscript}
                        playbackTimeMs={playbackTime * 1000}
                        onSeek={(ms) => {
                          if (audioRef.current && audioReady) {
                            audioRef.current.currentTime = ms / 1000;
                            setPlaybackTime(ms / 1000);
                          }
                        }}
                      />
                      {/* Re-transcribe button */}
                      <div className="mt-3 pt-3 border-t border-border-subtle">
                        <button
                          onClick={() => handleTranscribe(selectedRecording.id)}
                          disabled={isTranscribing}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            isTranscribing
                              ? "bg-white/5 text-text-muted cursor-not-allowed"
                              : "bg-white/5 text-text-muted hover:text-text-secondary hover:bg-white/10"
                          }`}
                        >
                          {isTranscribing ? (
                            <span className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                              {downloadProgress ? "Downloading model..." : transcriptionProgress !== null ? `Transcribing ${transcriptionProgress}%...` : "Transcribing..."}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <RefreshCw size={10} />
                              Re-transcribe with current model
                            </span>
                          )}
                        </button>
                        {isTranscribing && (
                          <div className="flex flex-col items-start gap-1 mt-2">
                            {downloadProgress && downloadProgress.total && downloadProgress.total > 0 ? (
                              <>
                                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-accent rounded-full transition-all duration-200"
                                    style={{
                                      width: `${Math.round(((downloadProgress.downloaded ?? 0) / downloadProgress.total) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <p className="text-[10px] text-text-muted">
                                  Downloading {downloadProgress.model} — {Math.round(((downloadProgress.downloaded ?? 0) / downloadProgress.total) * 100)}%
                                  {" "}({Math.round((downloadProgress.downloaded ?? 0) / 1024 / 1024)}/{Math.round(downloadProgress.total / 1024 / 1024)} MB)
                                </p>
                              </>
                            ) : (
                              <>
                                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-accent rounded-full transition-all duration-200"
                                    style={{ width: `${transcriptionProgress ?? 0}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-text-muted">
                                  Transcribing — {transcriptionProgress ?? 0}%
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <p className="text-[12px] text-text-muted">No transcript yet</p>
                      <button
                        onClick={() => handleTranscribe(selectedRecording.id)}
                        disabled={isTranscribing}
                        className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors cursor-pointer ${
                          isTranscribing
                            ? "bg-accent/30 text-accent/50 cursor-not-allowed"
                            : "bg-accent text-white hover:bg-accent-hover"
                        }`}
                      >
                        {isTranscribing ? (
                          <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                            {downloadProgress ? "Downloading model..." : transcriptionProgress !== null ? `Transcribing ${transcriptionProgress}%...` : "Transcribing..."}
                          </span>
                        ) : (
                          "Transcribe"
                        )}
                      </button>
                      {isTranscribing && (
                        <div className="flex flex-col items-center gap-1 mt-1">
                          {downloadProgress && downloadProgress.total && downloadProgress.total > 0 ? (
                            <>
                              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent rounded-full transition-all duration-200"
                                  style={{
                                    width: `${Math.round(((downloadProgress.downloaded ?? 0) / downloadProgress.total) * 100)}%`,
                                  }}
                                />
                              </div>
                              <p className="text-[10px] text-text-muted">
                                Downloading {downloadProgress.model} — {Math.round(((downloadProgress.downloaded ?? 0) / downloadProgress.total) * 100)}%
                                {" "}({Math.round((downloadProgress.downloaded ?? 0) / 1024 / 1024)}/{Math.round(downloadProgress.total / 1024 / 1024)} MB)
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent rounded-full transition-all duration-200"
                                  style={{ width: `${transcriptionProgress ?? 0}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-text-muted">
                                Transcribing — {transcriptionProgress ?? 0}%
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {detailTab === "notes" && (
                <>
                  {recordingNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                      <p className="text-[12px]">No notes generated yet</p>
                      <p className="text-[11px] mt-0.5 text-text-muted/60">
                        {currentTranscript
                          ? "Click Generate Notes above"
                          : "Transcribe first, then generate notes"}
                      </p>
                    </div>
                  ) : recordingNotes.length === 1 ? (
                    /* Single note: show content directly */
                    <NoteViewer
                      note={recordingNotes[0]}
                      onNoteUpdated={(updated) => {
                        setRecordingNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
                      }}
                    />
                  ) : (
                    <div className="flex flex-col">
                      {recordingNotes.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => setViewingNote(note)}
                          className="group w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-text-primary truncate">
                              {note.title}
                            </div>
                            <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                              {note.content.slice(0, 120).replace(/[#*_`]/g, "")}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-text-muted capitalize">{note.prompt_style}</span>
                              <span className="text-[10px] text-text-muted/60 font-mono">{note.model}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(note.id);
                            }}
                            className="shrink-0 p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-record hover:bg-record/10 transition-all cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
