import { useState, useCallback } from "react";
import * as tauri from "../lib/tauri";
import type { Note } from "../lib/types";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateNotes = useCallback(
    async (
      transcriptId: string,
      promptStyle?: string,
      customPrompt?: string
    ) => {
    setIsGenerating(true);
    setError(null);
    try {
      const note = await tauri.generateNotes(transcriptId, promptStyle, customPrompt);
      setCurrentNote(note);
      // Refresh list after generation
      const list = await tauri.listNotes();
      setNotes(list);
      return note;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error("Generate notes error:", err);
      setError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const loadNotes = useCallback(async () => {
    setError(null);
    try {
      const list = await tauri.listNotes();
      setNotes(list);
      return list;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load notes";
      setError(message);
      throw err;
    }
  }, []);

  const loadNote = useCallback(async (id: string) => {
    setError(null);
    try {
      const note = await tauri.getNote(id);
      setCurrentNote(note);
      return note;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load note";
      setError(message);
      throw err;
    }
  }, []);

  const removeNote = useCallback(async (id: string) => {
    setError(null);
    try {
      await tauri.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setCurrentNote((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete note";
      setError(message);
      throw err;
    }
  }, []);

  return {
    notes,
    currentNote,
    isGenerating,
    error,
    generateNotes,
    loadNotes,
    loadNote,
    removeNote,
    setCurrentNote,
  };
}
