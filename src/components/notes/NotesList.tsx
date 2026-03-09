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
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <Sparkles size={36} strokeWidth={1} className="mb-3 opacity-40" />
        <p className="text-sm">No notes yet</p>
        <p className="text-xs mt-1 text-text-muted/60">
          Generate notes from a transcript to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {notes.map((note) => {
        const isSelected = selectedId === note.id;
        return (
          <button
            key={note.id}
            onClick={() => onSelect(note)}
            className={`group w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer ${
              isSelected
                ? "bg-accent/[0.08] border border-accent/20"
                : "bg-bg-card/30 border border-transparent hover:bg-bg-card-hover/60"
            }`}
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 shrink-0 mt-0.5">
              <FileText size={15} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-medium text-text-primary truncate">
                {note.title}
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                {note.content.slice(0, 120).replace(/[#*_`]/g, "")}...
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-text-muted">
                  {formatDate(note.created_at)}
                </span>
                <span className="text-[10px] text-text-muted/60 px-1.5 py-0.5 rounded bg-white/[0.03]">
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
              <Trash2 size={13} />
            </button>
          </button>
        );
      })}
    </div>
  );
}
