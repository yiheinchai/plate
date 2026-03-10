import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Search, RefreshCw, Trash2, Mic, Monitor, Clock } from "lucide-react";
import { useTranscript } from "../hooks/useTranscript";
import * as tauri from "../lib/tauri";
import type { Recording, Transcript, Note } from "../lib/types";
import TranscriptViewer from "../components/transcripts/TranscriptViewer";
import PromptPicker from "../components/notes/PromptPicker";
import NoteViewer from "../components/notes/NoteViewer";
import { useNotes } from "../hooks/useNotes";

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
    downloadProgress,
    transcribeRecording,
    setCurrentTranscript,
  } = useTranscript();

  const { isGenerating, error: notesError, generateNotes } = useNotes();

  const location = useLocation();
  const navState = location.state as { selectRecordingId?: string; autoTranscribe?: boolean } | null;
  const handledNavState = useRef<string | null>(null);

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

        // Auto-transcribe if needed
        if (navState.autoTranscribe && !data.transcriptMap.has(rid)) {
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
    } catch {
      // Error handled in hook
    }
  };

  const autoRenameRecording = async (recordingId: string, transcriptText: string) => {
    try {
      // Use a short LLM call to generate a name
      const preview = transcriptText.slice(0, 300);
      // We'll generate a title via the generate_notes title prompt mechanism
      // For now, extract a sensible name from the first sentence
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

  const filteredRecordings = recordings.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRecording = recordings.find((r) => r.id === selectedId);

  // If viewing a specific note, show the NoteViewer full-screen in the detail panel
  if (viewingNote) {
    return (
      <div className="flex flex-col h-full min-w-0">
        <NoteViewer note={viewingNote} onBack={() => setViewingNote(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Library</span>
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
              {filteredRecordings.map((recording) => {
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
                      {isMic ? (
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasTranscript && (
                        <span className="text-[9px] font-medium text-success">
                          T
                        </span>
                      )}
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
                      <TranscriptViewer transcript={currentTranscript} />
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
                              {downloadProgress ? "Downloading model..." : "Transcribing..."}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <RefreshCw size={10} />
                              Re-transcribe with current model
                            </span>
                          )}
                        </button>
                        {downloadProgress && downloadProgress.total && downloadProgress.total > 0 && (
                          <div className="flex flex-col items-start gap-1 mt-2">
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
                            {downloadProgress
                              ? "Downloading model..."
                              : "Transcribing..."}
                          </span>
                        ) : (
                          "Transcribe"
                        )}
                      </button>
                      {downloadProgress && downloadProgress.total && downloadProgress.total > 0 && (
                        <div className="flex flex-col items-center gap-1 mt-1">
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
                    <NoteViewer note={recordingNotes[0]} />
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
