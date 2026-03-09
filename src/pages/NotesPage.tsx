import { useEffect, useState, useCallback } from "react";
import { useNotes } from "../hooks/useNotes";
import NotesList from "../components/notes/NotesList";
import NoteViewer from "../components/notes/NoteViewer";
import type { Note } from "../lib/types";

export default function NotesPage() {
  const { notes, currentNote, loadNotes, loadNote, removeNote, setCurrentNote } =
    useNotes();
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadNotes();
    } catch {
      // Error handled in hook
    } finally {
      setIsLoading(false);
    }
  }, [loadNotes]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSelect = async (note: Note) => {
    try {
      await loadNote(note.id);
    } catch {
      // Error handled in hook
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeNote(id);
    } catch {
      // Error handled in hook
    }
  };

  const handleBack = () => {
    setCurrentNote(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (currentNote) {
    return <NoteViewer note={currentNote} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Notes</span>
        <div className="flex-1" />
        <span className="text-[11px] text-text-muted">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        <NotesList
          notes={notes}
          selectedId={null}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
