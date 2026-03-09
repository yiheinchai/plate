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
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show note viewer if a note is selected
  if (currentNote) {
    return <NoteViewer note={currentNote} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Notes</h1>
        <span className="text-xs text-text-muted">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      {/* Notes list */}
      <NotesList
        notes={notes}
        selectedId={null}
        onSelect={handleSelect}
        onDelete={handleDelete}
      />
    </div>
  );
}
