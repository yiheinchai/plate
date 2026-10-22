import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, RefreshCw, Trash2, Mic, Monitor, Clock, Play, Pause, Download, Upload, FileAudio, Bookmark, X, Zap, Star, HelpCircle, Check, ArrowUpDown, Plus, RotateCcw, AlertTriangle } from "lucide-react";
import { useRecording } from "../hooks/useRecording";
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
  return /^(Recording|Recovered recording) \d{4}-\d{2}-\d{2}/i.test(title);
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
    isRecordingTranscribing,
    transcriptionProgress,
    downloadProgress,
    transcribeRecording,
    setCurrentTranscript,
  } = useTranscript();

  const {
    isGenerating,
    isGeneratingForTranscript,
    error: notesError,
    clearError: clearNotesError,
    generateNotes,
  } = useNotes();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { continueRecording } = useRecording();

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const recordingsRef = useRef<Recording[]>([]);
  recordingsRef.current = recordings;

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
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem("plate-playback-speed");
    const parsed = saved ? parseFloat(saved) : 1;
    return SPEED_OPTIONS.includes(parsed) ? parsed : 1;
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchAiProgress, setBatchAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [noteTranscriptIds, setNoteTranscriptIds] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const lastClickedIdRef = useRef<string | null>(null);
  const [bulkDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "duration" | "title">("date");
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; fromTrash?: boolean } | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedRecordings, setTrashedRecordings] = useState<Recording[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recs, transcripts, allNotes] = await Promise.all([
        tauri.listRecordings(),
        tauri.listTranscripts(),
        tauri.listNotes(),
      ]);
      setRecordings(recs);
      const tMap = new Map<string, Transcript>();
      // Transcripts are ordered newest-first (DESC); keep only the newest per recording.
      transcripts.forEach((t) => {
        if (!tMap.has(t.recording_id)) tMap.set(t.recording_id, t);
      });
      setTranscriptMap(tMap);
      setNoteTranscriptIds(new Set(allNotes.map((n) => n.transcript_id)));
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
        selectedIdRef.current = rid;
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
    let cancelled = false;
    if (currentTranscript) {
      const targetTranscriptId = currentTranscript.id;
      tauri
        .listNotes(targetTranscriptId)
        .then((notes) => {
          if (!cancelled) setRecordingNotes(notes);
        })
        .catch(console.error);
    } else {
      setRecordingNotes([]);
    }
    return () => {
      cancelled = true;
    };
  }, [currentTranscript]);

  // Load bookmarks when selection changes
  useEffect(() => {
    let cancelled = false;
    if (selectedId) {
      const targetRecordingId = selectedId;
      tauri
        .listBookmarks(targetRecordingId)
        .then((bms) => {
          if (!cancelled) setBookmarks(bms);
        })
        .catch(console.error);
    } else {
      setBookmarks([]);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleSelect = (recording: Recording) => {
    clearNotesError();
    if (selectedId === recording.id) {
      selectedIdRef.current = null;
      setSelectedId(null);
      setCurrentTranscript(null);
      setViewingNote(null);
    } else {
      selectedIdRef.current = recording.id;
      setSelectedId(recording.id);
      const t = transcriptMap.get(recording.id);
      setCurrentTranscript(t ?? null);
      setViewingNote(null);
      setDetailTab("transcript");
    }
  };

  const handleTranscribe = async (recordingId: string) => {
    try {
      const transcript = await transcribeRecording(recordingId, { updateCurrent: false });
      setTranscriptMap((prev) => {
        const next = new Map(prev);
        next.set(recordingId, transcript);
        return next;
      });
      if (selectedIdRef.current === recordingId) {
        setCurrentTranscript(transcript);
      }
      // Auto-rename recording from transcript content
      const recording = recordingsRef.current.find((r) => r.id === recordingId);
      if (recording && isAutoTitle(recording.title) && transcript.full_text.length > 20) {
        await autoRenameRecording(recordingId, transcript.full_text);
      }
      // Auto-generate notes if enabled (use transcript directly, not state)
      if (settings.auto_generate_notes && transcript) {
        try {
          const promptStyle = settings.default_prompt_style || "summary";
          const customPrompt = settings.default_custom_prompt || undefined;
          const note = await generateNotes(transcript.id, promptStyle, customPrompt);
          setNoteTranscriptIds((prev) => new Set(prev).add(transcript.id));
          if (selectedIdRef.current === recordingId) {
            const notes = await tauri.listNotes(transcript.id);
            if (selectedIdRef.current === recordingId) {
              setRecordingNotes(notes);
              setDetailTab("notes");
            }
          }
          // Auto-rename from note title if still auto-titled
          const rec = recordingsRef.current.find((r) => r.id === recordingId);
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
      const aiTitle = await tauri.generateRecordingTitle(recordingId, transcriptText);
      if (aiTitle && aiTitle.trim().length > 0) {
        setRecordings((prev) =>
          prev.map((r) =>
            r.id === recordingId ? { ...r, title: aiTitle.trim() } : r
          )
        );
        return;
      }
    } catch {
      // Fallback to first sentence below if AI/CLI title generation fails.
    }
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
    const targetTranscriptId = currentTranscript.id;
    const targetRecordingId = currentTranscript.recording_id;
    try {
      const note = await generateNotes(targetTranscriptId, promptStyle, customPrompt);
      setNoteTranscriptIds((prev) => new Set(prev).add(targetTranscriptId));
      // Refresh notes for this transcript only if the user is still viewing this recording
      if (selectedIdRef.current === targetRecordingId) {
        const notes = await tauri.listNotes(targetTranscriptId);
        if (selectedIdRef.current === targetRecordingId) {
          setRecordingNotes(notes);
          setDetailTab("notes");
        }
      }

      // Also auto-rename recording if it still has the default title
      const recording = recordingsRef.current.find((r) => r.id === targetRecordingId);
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

  const handleDeleteRecording = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ ids: [id] });
  };

  const executeDelete = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await tauri.deleteRecording(id);
      } catch (err) {
        console.error("Failed to delete recording:", err);
      }
    }
    setRecordings((prev) => prev.filter((r) => !ids.includes(r.id)));
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null);
      setCurrentTranscript(null);
      setViewingNote(null);
    }
  };

  const loadTrash = async () => {
    try {
      const deleted = await tauri.listDeletedRecordings();
      setTrashedRecordings(deleted);
    } catch (err) {
      console.error("Failed to load trash:", err);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await tauri.restoreRecording(id);
      setTrashedRecordings((prev) => prev.filter((r) => r.id !== id));
      loadData();
    } catch (err) {
      console.error("Failed to restore recording:", err);
    }
  };

  const handlePurge = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await tauri.purgeRecording(id);
      } catch (err) {
        console.error("Failed to purge recording:", err);
      }
    }
    setTrashedRecordings((prev) => prev.filter((r) => !ids.includes(r.id)));
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

  // Multi-select: Cmd+click toggles, Shift+click selects range.
  const handleRecordingClick = (recording: Recording, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle individual selection
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(recording.id)) {
          next.delete(recording.id);
        } else {
          next.add(recording.id);
        }
        return next;
      });
      lastClickedIdRef.current = recording.id;
      return;
    }
    if (e.shiftKey && lastClickedIdRef.current) {
      // Range select
      const ids = filteredRecordings.map((r) => r.id);
      const startIdx = ids.indexOf(lastClickedIdRef.current);
      const endIdx = ids.indexOf(recording.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setMultiSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        });
      }
      return;
    }
    // Normal click: clear multi-select and do regular select
    if (multiSelected.size > 0) {
      setMultiSelected(new Set());
    }
    lastClickedIdRef.current = recording.id;
    handleSelect(recording);
  };

  const handleBulkDelete = () => {
    if (multiSelected.size === 0 || bulkDeleting) return;
    setConfirmDelete({ ids: [...multiSelected] });
  };

  const handleBulkTranscribe = async () => {
    const toTranscribe = [...multiSelected].filter((id) => !transcriptMap.has(id));
    if (toTranscribe.length === 0) return;
    setBatchProgress({ current: 0, total: toTranscribe.length });
    for (let i = 0; i < toTranscribe.length; i++) {
      const recId = toTranscribe[i];
      setBatchProgress({ current: i + 1, total: toTranscribe.length });
      try {
        const transcript = await transcribeRecording(recId, { updateCurrent: false });
        setTranscriptMap((prev) => {
          const next = new Map(prev);
          next.set(recId, transcript);
          return next;
        });
        if (selectedIdRef.current === recId) {
          setCurrentTranscript(transcript);
        }
      } catch (err) {
        console.error("Failed to transcribe:", recId, err);
      }
    }
    setBatchProgress(null);
    setMultiSelected(new Set());
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
    const targetRecordingId = selectedRecording.id;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      // Save position immediately on pause.
      const posMs = Math.round(audioRef.current.currentTime * 1000);
      tauri.updatePlaybackPosition(targetRecordingId, posMs).catch(() => {});
      setRecordings((prev) =>
        prev.map((r) => r.id === targetRecordingId ? { ...r, last_position_ms: posMs } : r)
      );
    } else {
      if (!audioReady) {
        setAudioLoading(true);
        try {
          const url = await tauri.getPlayableAudioUrl(targetRecordingId);
          if (selectedIdRef.current !== targetRecordingId || !audioRef.current) {
            setAudioLoading(false);
            return;
          }
          audioRef.current.src = url;
          await new Promise<void>((resolve, reject) => {
            if (!audioRef.current) return reject();
            audioRef.current.oncanplaythrough = () => resolve();
            audioRef.current.onerror = () => reject(new Error("Audio load failed"));
          });
          if (selectedIdRef.current !== targetRecordingId || !audioRef.current) {
            setAudioLoading(false);
            return;
          }
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
      if (selectedIdRef.current !== targetRecordingId || !audioRef.current) return;
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
  const unnotedRecordings = useMemo(
    () =>
      recordings.filter((r) => {
        const t = transcriptMap.get(r.id);
        return t && t.full_text.trim().length > 20 && !noteTranscriptIds.has(t.id);
      }),
    [recordings, transcriptMap, noteTranscriptIds]
  );

  const handleBatchGenerateNotes = async (targetRecs?: Recording[]) => {
    const queue = targetRecs ?? unnotedRecordings;
    if (queue.length === 0) return;
    setBatchAiProgress({ current: 0, total: queue.length });
    const promptStyle = settings.default_prompt_style || "summary";
    const customPrompt = settings.default_custom_prompt || undefined;

    for (let i = 0; i < queue.length; i++) {
      const rec = queue[i];
      const transcript = transcriptMap.get(rec.id);
      if (!transcript) continue;
      setBatchAiProgress({ current: i + 1, total: queue.length });
      try {
        const note = await generateNotes(transcript.id, promptStyle, customPrompt);
        setNoteTranscriptIds((prev) => new Set(prev).add(transcript.id));
        if (selectedIdRef.current === rec.id) {
          const notes = await tauri.listNotes(transcript.id);
          if (selectedIdRef.current === rec.id) {
            setRecordingNotes(notes);
          }
        }
        const currentRec = recordingsRef.current.find((r) => r.id === rec.id) ?? rec;
        if (note.title && (isAutoTitle(currentRec.title) || currentRec.title.length > 35)) {
          try {
            await tauri.renameRecording(rec.id, note.title);
            setRecordings((prev) =>
              prev.map((r) => (r.id === rec.id ? { ...r, title: note.title } : r))
            );
          } catch {
            /* non-critical */
          }
        }
      } catch (err) {
        console.error(`Batch AI generation failed for ${rec.id}:`, err);
      }
    }
    setBatchAiProgress(null);
  };

  const libraryStats = useMemo(() => {
    const totalMs = recordings.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
    const totalHours = totalMs / 3_600_000;
    const transcriptCount = transcriptMap.size;
    let hoursLabel: string;
    if (totalHours < 1) {
      hoursLabel = `${Math.round(totalMs / 60_000)}m`;
    } else {
      hoursLabel = `${totalHours.toFixed(1)}h`;
    }
    return { count: recordings.length, hoursLabel, transcriptCount };
  }, [recordings, transcriptMap]);

  const handleBatchTranscribe = async () => {
    const queue = recordings.filter((r) => !transcriptMap.has(r.id));
    if (queue.length === 0) return;
    setBatchProgress({ current: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      const rec = queue[i];
      setBatchProgress({ current: i + 1, total: queue.length });
      try {
        const transcript = await transcribeRecording(rec.id, { updateCurrent: false });
        setTranscriptMap((prev) => {
          const next = new Map(prev);
          next.set(rec.id, transcript);
          return next;
        });
        if (selectedIdRef.current === rec.id) {
          setCurrentTranscript(transcript);
        }
        // Auto-rename from transcript
        const latestRec = recordingsRef.current.find((r) => r.id === rec.id) ?? rec;
        if (isAutoTitle(latestRec.title) && transcript.full_text.length > 20) {
          await autoRenameRecording(rec.id, transcript.full_text);
        }
        // Auto-generate notes if enabled
        if (settings.auto_generate_notes) {
          try {
            const promptStyle = settings.default_prompt_style || "summary";
            const customPrompt = settings.default_custom_prompt || undefined;
            const note = await generateNotes(transcript.id, promptStyle, customPrompt);
            if (selectedIdRef.current === rec.id) {
              const notes = await tauri.listNotes(transcript.id);
              if (selectedIdRef.current === rec.id) {
                setRecordingNotes(notes);
              }
            }
            const currentRec = recordingsRef.current.find((r) => r.id === rec.id) ?? rec;
            if (isAutoTitle(currentRec.title) && note.title) {
              try {
                await tauri.renameRecording(rec.id, note.title);
                setRecordings((prev) =>
                  prev.map((r) => r.id === rec.id ? { ...r, title: note.title } : r)
                );
              } catch { /* non-critical */ }
            }
          } catch { /* note generation error handled in hook */ }
        }
      } catch (err) {
        console.error(`Batch transcribe failed for ${rec.id}:`, err);
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
  }, [selectedId]);

  // Persist playback speed preference.
  useEffect(() => {
    localStorage.setItem("plate-playback-speed", String(playbackSpeed));
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Keyboard shortcuts for audio playback.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // ? key: toggle shortcuts help (works even without a selected recording)
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      // Escape: close shortcuts overlay or clear multi-select
      if (e.code === "Escape") {
        if (showShortcuts) {
          e.preventDefault();
          setShowShortcuts(false);
          return;
        }
        if (multiSelected.size > 0) {
          e.preventDefault();
          setMultiSelected(new Set());
          return;
        }
      }

      if (!selectedId || !audioRef.current) return;

      // Space: play/pause (only on library page, not record page)
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
        return;
      }

      // Left arrow: skip back 5s
      if (e.code === "ArrowLeft" && audioReady) {
        e.preventDefault();
        const t = Math.max(0, audioRef.current.currentTime - 5);
        audioRef.current.currentTime = t;
        setPlaybackTime(t);
        return;
      }

      // Right arrow: skip forward 5s
      if (e.code === "ArrowRight" && audioReady) {
        e.preventDefault();
        const t = Math.min(playbackDuration, audioRef.current.currentTime + 5);
        audioRef.current.currentTime = t;
        setPlaybackTime(t);
        return;
      }

      // [ key: slower playback
      if (e.code === "BracketLeft") {
        e.preventDefault();
        const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
        if (idx > 0) {
          const next = SPEED_OPTIONS[idx - 1];
          setPlaybackSpeed(next);
          if (audioRef.current) audioRef.current.playbackRate = next;
        }
        return;
      }

      // ] key: faster playback
      if (e.code === "BracketRight") {
        e.preventDefault();
        const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
        if (idx < SPEED_OPTIONS.length - 1) {
          const next = SPEED_OPTIONS[idx + 1];
          setPlaybackSpeed(next);
          if (audioRef.current) audioRef.current.playbackRate = next;
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, audioReady, playbackDuration, playbackSpeed, togglePlayback, showShortcuts, multiSelected]);

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
    if (sortBy === "duration") {
      result = [...result].sort((a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0));
    } else if (sortBy === "title") {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }
    // "date" is the default order from the backend (newest first)
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

      {/* Keyboard shortcuts help overlay */}
      {showShortcuts && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowShortcuts(false)}>
          <div className="bg-bg-card border border-border-subtle rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-text-primary">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-text-muted hover:text-text-secondary cursor-pointer">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Playback</p>
                <div className="flex flex-col gap-1">
                  {[
                    ["Space", "Play / Pause"],
                    ["\u2190", "Skip back 5s"],
                    ["\u2192", "Skip forward 5s"],
                    ["[", "Slower speed"],
                    ["]", "Faster speed"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary">{desc}</span>
                      <kbd className="text-[10px] font-mono bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-text-muted min-w-[28px] text-center">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Recording</p>
                <div className="flex flex-col gap-1">
                  {[
                    ["\u2318\u21e7R", "Start / Stop recording"],
                    ["B", "Add bookmark (while recording)"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary">{desc}</span>
                      <kbd className="text-[10px] font-mono bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-text-muted min-w-[28px] text-center">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Library</p>
                <div className="flex flex-col gap-1">
                  {[
                    ["\u2318+Click", "Toggle multi-select"],
                    ["\u21e7+Click", "Range select"],
                    ["Esc", "Clear selection"],
                    ["?", "Show this help"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary">{desc}</span>
                      <kbd className="text-[10px] font-mono bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-text-muted min-w-[28px] text-center">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Library</span>
        {recordings.length > 0 && (
          <span className="text-[10px] text-text-muted tabular-nums">
            {libraryStats.count} · {libraryStats.hoursLabel} · {libraryStats.transcriptCount}T
          </span>
        )}
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
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "duration" | "title")}
            className="appearance-none bg-transparent text-[10px] text-text-muted hover:text-text-secondary pl-5 pr-1 py-0.5 rounded cursor-pointer outline-none"
            title="Sort recordings"
          >
            <option value="date">Newest</option>
            <option value="duration">Longest</option>
            <option value="title">A–Z</option>
          </select>
          <ArrowUpDown size={10} className="absolute left-1 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
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
        {unnotedRecordings.length > 0 && (
          <button
            onClick={() => handleBatchGenerateNotes()}
            disabled={!!batchAiProgress || isGenerating}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              batchAiProgress
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-accent hover:bg-accent/10"
            }`}
            title={`Generate AI notes & titles for ${unnotedRecordings.length} transcribed recording${unnotedRecordings.length !== 1 ? "s" : ""}`}
          >
            {batchAiProgress ? (
              <>
                <div className="w-2.5 h-2.5 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
                AI {batchAiProgress.current}/{batchAiProgress.total}
              </>
            ) : (
              <>
                <Zap size={10} />
                AI All ({unnotedRecordings.length})
              </>
            )}
          </button>
        )}
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
          onClick={() => { setShowTrash(true); loadTrash(); }}
          className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Trash"
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={() => loadData()}
          className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setShowShortcuts(true)}
          className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle size={13} />
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
              {(searchQuery.trim().length >= 2 || sortBy !== "date"
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
                    const isMultiSelected = multiSelected.has(recording.id);
                    const hasTranscript = transcriptMap.has(recording.id);
                    const duration = formatDuration(recording.duration_ms);
                    const isMic = recording.source_type === "microphone";

                    return (
                      <button
                        key={recording.id}
                        onClick={(e) => handleRecordingClick(recording, e)}
                        className={`group w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                          isMultiSelected
                            ? "bg-accent/20 text-text-primary"
                            : isSelected
                            ? "bg-accent/15 text-text-primary"
                            : "hover:bg-white/[0.03] text-text-secondary"
                        }`}
                      >
                        {multiSelected.size > 0 ? (
                          <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            isMultiSelected
                              ? "bg-accent border-accent text-white"
                              : "border-border-subtle"
                          }`}>
                            {isMultiSelected && <Check size={10} />}
                          </div>
                        ) : (
                        <div className="shrink-0">
                          {recording.source_type === "imported" ? (
                            <Upload size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          ) : isMic ? (
                            <Mic size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          ) : (
                            <Monitor size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                          )}
                        </div>
                        )}
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
                          {hasTranscript && (
                            <p className="text-[10px] text-text-muted/60 truncate mt-0.5 leading-tight">
                              {transcriptMap.get(recording.id)!.full_text.slice(0, 120).trim()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isRecordingTranscribing(recording.id) ? (
                            <div
                              className="w-2.5 h-2.5 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin"
                              title="Transcribing..."
                            />
                          ) : (
                            hasTranscript && (
                              <>
                                <span className="text-[9px] font-medium text-success">
                                  T
                                </span>
                                {noteTranscriptIds.has(transcriptMap.get(recording.id)!.id) && (
                                  <span className="text-[9px] font-medium text-accent">
                                    N
                                  </span>
                                )}
                              </>
                            )
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
          {/* Bulk action bar */}
          {multiSelected.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-bg-card shrink-0">
              <span className="text-[11px] font-medium text-text-primary">
                {multiSelected.size} selected
              </span>
              <div className="flex-1" />
              <button
                onClick={() => {
                  const selectedRecs = recordings.filter(
                    (r) => multiSelected.has(r.id) && transcriptMap.has(r.id)
                  );
                  handleBatchGenerateNotes(selectedRecs);
                  setMultiSelected(new Set());
                }}
                disabled={!!batchAiProgress || isGenerating}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40"
                title="Generate AI notes & titles for selected"
              >
                <Zap size={10} />
                AI Notes
              </button>
              <button
                onClick={handleBulkTranscribe}
                disabled={!!batchProgress || isTranscribing}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40"
                title="Transcribe selected"
              >
                <Zap size={10} />
                Transcribe
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-text-muted hover:text-record hover:bg-record/10 transition-colors cursor-pointer disabled:opacity-40"
                title="Delete selected"
              >
                <Trash2 size={10} />
                Delete
              </button>
              <button
                onClick={() => setMultiSelected(new Set())}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X size={10} />
              </button>
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
                    isGenerating={isGeneratingForTranscript(currentTranscript.id)}
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
              <button
                onClick={async () => {
                  const src = selectedRecording.source_type === "system_audio" ? "system_audio" : "microphone";
                  await continueRecording(selectedRecording.id, selectedRecording.title, src as "microphone" | "system_audio");
                  navigate("/");
                }}
                className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-accent hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                title="Continue recording — append more audio"
              >
                <Plus size={10} />
                Continue
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
                          disabled={isRecordingTranscribing(selectedRecording.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            isRecordingTranscribing(selectedRecording.id)
                              ? "bg-white/5 text-text-muted cursor-not-allowed"
                              : "bg-white/5 text-text-muted hover:text-text-secondary hover:bg-white/10"
                          }`}
                        >
                          {isRecordingTranscribing(selectedRecording.id) ? (
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
                        {isRecordingTranscribing(selectedRecording.id) && (
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
                        disabled={isRecordingTranscribing(selectedRecording.id)}
                        className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors cursor-pointer ${
                          isRecordingTranscribing(selectedRecording.id)
                            ? "bg-accent/30 text-accent/50 cursor-not-allowed"
                            : "bg-accent text-white hover:bg-accent-hover"
                        }`}
                      >
                        {isRecordingTranscribing(selectedRecording.id) ? (
                          <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                            {downloadProgress ? "Downloading model..." : transcriptionProgress !== null ? `Transcribing ${transcriptionProgress}%...` : "Transcribing..."}
                          </span>
                        ) : (
                          "Transcribe"
                        )}
                      </button>
                      {isRecordingTranscribing(selectedRecording.id) && (
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

      {/* Confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-bg-card border border-border-subtle rounded-lg shadow-xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-record" />
              <h3 className="text-[13px] font-semibold text-text-primary">
                {confirmDelete.fromTrash ? "Permanently delete" : "Move to trash"}?
              </h3>
            </div>
            <p className="text-[12px] text-text-muted mb-4">
              {confirmDelete.fromTrash
                ? `This will permanently delete ${confirmDelete.ids.length === 1 ? "this recording" : `${confirmDelete.ids.length} recordings`} and the audio file. This cannot be undone.`
                : `${confirmDelete.ids.length === 1 ? "This recording" : `${confirmDelete.ids.length} recordings`} will be moved to trash. You can restore ${confirmDelete.ids.length === 1 ? "it" : "them"} later.`
              }
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded text-[12px] font-medium text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { ids, fromTrash } = confirmDelete;
                  setConfirmDelete(null);
                  if (fromTrash) {
                    await handlePurge(ids);
                  } else {
                    await executeDelete(ids);
                    setMultiSelected(new Set());
                  }
                }}
                className="px-3 py-1.5 rounded text-[12px] font-medium bg-record/15 text-record hover:bg-record/25 transition-colors cursor-pointer"
              >
                {confirmDelete.fromTrash ? "Delete forever" : "Move to trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash modal */}
      {showTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTrash(false)}>
          <div className="bg-bg-card border border-border-subtle rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Trash2 size={14} className="text-text-muted" />
                <h3 className="text-[13px] font-semibold text-text-primary">Trash</h3>
                <span className="text-[11px] text-text-muted">({trashedRecordings.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {trashedRecordings.length > 0 && (
                  <button
                    onClick={() => setConfirmDelete({ ids: trashedRecordings.map((r) => r.id), fromTrash: true })}
                    className="text-[11px] font-medium text-record hover:text-record/80 transition-colors cursor-pointer"
                  >
                    Empty trash
                  </button>
                )}
                <button onClick={() => setShowTrash(false)} className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {trashedRecordings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-text-muted">
                  <Trash2 size={24} strokeWidth={1} className="mb-2 opacity-30" />
                  <p className="text-[12px]">Trash is empty</p>
                </div>
              ) : (
                trashedRecordings.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-text-primary truncate">{rec.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted">{formatDate(rec.created_at)}</span>
                        {rec.duration_ms && <span className="text-[10px] text-text-muted">{formatDuration(rec.duration_ms)}</span>}
                        {rec.deleted_at && <span className="text-[10px] text-text-muted/60">Deleted {formatDate(rec.deleted_at)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(rec.id)}
                      className="p-1.5 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent/10 transition-all cursor-pointer"
                      title="Restore"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ ids: [rec.id], fromTrash: true })}
                      className="p-1.5 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-record hover:bg-record/10 transition-all cursor-pointer"
                      title="Delete forever"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
