import { FileText, Trash2, Sparkles } from "lucide-react";
import type { Note } from "../../lib/types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today, ${time}`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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
      <div className="flex flex-col items-center justify-center py-12 text-text-muted">
        <Sparkles size={28} strokeWidth={1} className="mb-2 opacity-30" />
        <p className="text-[12px]">No notes yet</p>
        <p className="text-[11px] mt-0.5 text-text-muted/60">
          Generate notes from a transcript
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {notes.map((note) => {
        const isSelected = selectedId === note.id;
        return (
          <button
            key={note.id}
            onClick={() => onSelect(note)}
            className={`group w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
              isSelected
                ? "bg-accent/15 text-text-primary"
                : "hover:bg-white/[0.03] text-text-secondary"
            }`}
          >
            <FileText size={14} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate text-text-primary">
                {note.title}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                {note.content.slice(0, 120).replace(/[#*_`]/g, "")}...
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-text-muted">
                  {formatDate(note.created_at)}
                </span>
                <span className="text-[10px] text-text-muted/60 font-mono">
                  {note.model}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="shrink-0 p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-record hover:bg-record/10 transition-all cursor-pointer"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </button>
        );
      })}
    </div>
  );
}
