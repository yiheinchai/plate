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
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary tracking-tight">Library</h1>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search recordings..."
          className="w-full bg-bg-card/50 border border-border-subtle/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {/* Content */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Recording list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw
                size={24}
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
          <div className="w-[400px] shrink-0 bg-bg-card/50 rounded-2xl border border-border-subtle/50 p-5 overflow-y-auto flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                Full Transcript
              </span>
              <GenerateNotesButton
                onClick={handleGenerateNotes}
                isGenerating={isGenerating}
              />
            </div>
            <TranscriptViewer transcript={currentTranscript} />
          </div>
        )}
      </div>
    </div>
  );
}
