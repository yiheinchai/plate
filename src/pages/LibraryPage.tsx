import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw } from "lucide-react";
import { useTranscript } from "../hooks/useTranscript";
import * as tauri from "../lib/tauri";
import type { Recording, Transcript } from "../lib/types";
import TranscriptList from "../components/transcripts/TranscriptList";
import TranscriptViewer from "../components/transcripts/TranscriptViewer";
import GenerateNotesButton from "../components/notes/GenerateNotesButton";
import { useNotes } from "../hooks/useNotes";

export default function LibraryPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [transcriptMap, setTranscriptMap] = useState<Map<string, Transcript>>(
    new Map()
  );
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const {
    currentTranscript,
    isTranscribing,
    transcribeRecording,
    setCurrentTranscript,
  } = useTranscript();

  const { isGenerating, generateNotes } = useNotes();

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
    } catch (err) {
      console.error("Failed to load library data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = (recording: Recording) => {
    if (selectedRecordingId === recording.id) {
      setSelectedRecordingId(null);
      setCurrentTranscript(null);
    } else {
      setSelectedRecordingId(recording.id);
      const t = transcriptMap.get(recording.id);
      setCurrentTranscript(t ?? null);
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
    } catch {
      // Error handled in hook
    }
  };

  const handleGenerateNotes = async () => {
    if (!currentTranscript) return;
    try {
      await generateNotes(currentTranscript.id);
    } catch {
      // Error handled in hook
    }
  };

  const filteredRecordings = recordings.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 h-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold text-text-primary tracking-tight">Library</h1>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="relative shrink-0">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search recordings..."
          className="w-full bg-bg-card/50 border border-border-subtle/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors"
        />
      </div>

      {/* Content — two-column layout */}
      <div className="flex gap-5 flex-1 min-h-0 min-w-0">
        {/* Recording list */}
        <div className={`overflow-y-auto min-w-0 ${currentTranscript ? "w-1/2 shrink-0" : "flex-1"}`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw
                size={20}
                className="animate-spin text-text-muted"
              />
            </div>
          ) : (
            <TranscriptList
              recordings={filteredRecordings}
              transcripts={transcriptMap}
              selectedId={selectedRecordingId}
              onSelect={handleSelect}
              onTranscribe={handleTranscribe}
              isTranscribing={isTranscribing}
            />
          )}
        </div>

        {/* Transcript viewer panel */}
        {currentTranscript && (
          <div
            className="w-1/2 min-w-0 shrink-0 bg-bg-card/30 rounded-2xl border border-border-subtle/30 overflow-hidden flex flex-col"
            style={{ animation: "slide-in 0.2s ease-out" }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle/20 shrink-0">
              <span className="text-sm font-medium text-text-primary truncate">
                Transcript
              </span>
              <GenerateNotesButton
                onClick={handleGenerateNotes}
                isGenerating={isGenerating}
              />
            </div>
            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <TranscriptViewer transcript={currentTranscript} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
