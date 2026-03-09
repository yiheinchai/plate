import { FileText, Trash2, Sparkles } from "lucide-react";
import type { Note } from "../../lib/types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onDelete: (id: string) => void;
}

export default function NotesList({
  notes,
  selectedId,
  onSelect,
  onDelete,
}: NotesListProps) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <Sparkles size={40} strokeWidth={1} className="mb-3 opacity-50" />
        <p className="text-sm">No notes yet</p>
        <p className="text-xs mt-1">
          Generate notes from a transcript to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {notes.map((note) => {
        const isSelected = selectedId === note.id;
        return (
          <button
            key={note.id}
            onClick={() => onSelect(note)}
            className={`group w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-colors cursor-pointer ${
              isSelected
                ? "bg-bg-card-hover border border-accent/30"
                : "bg-bg-card/50 border border-border-subtle/50 hover:bg-bg-card-hover"
            }`}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 shrink-0 mt-0.5">
              <FileText size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-text-primary truncate">
                {note.title}
              </h3>
              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                {note.content.slice(0, 120).replace(/[#*_`]/g, "")}...
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-text-muted">
                  {formatDate(note.created_at)}
                </span>
                <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-white/5">
                  {note.model}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="shrink-0 p-1.5 rounded-lg text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
              title="Delete note"
            >
              <Trash2 size={14} />
            </button>
          </button>
        );
      })}
    </div>
  );
}
