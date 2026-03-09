import Markdown from "react-markdown";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Note } from "../../lib/types";

interface NoteViewerProps {
  note: Note;
  onBack: () => void;
}

export default function NoteViewer({ note, onBack }: NoteViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(note.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to notes
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? (
            <Check size={12} className="text-success" />
          ) : (
            <Copy size={12} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-text-primary">{note.title}</h1>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>
          {new Date(note.created_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="w-1 h-1 rounded-full bg-text-muted" />
        <span>{note.model}</span>
        <span className="w-1 h-1 rounded-full bg-text-muted" />
        <span className="capitalize">{note.prompt_style}</span>
      </div>

      {/* Markdown content */}
      <div className="prose-dark">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-text-primary mt-6 mb-3">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-text-primary mt-5 mb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold text-text-primary mt-4 mb-2">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-sm text-text-secondary leading-relaxed mb-3">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside text-sm text-text-secondary mb-3 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside text-sm text-text-secondary mb-3 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm text-text-secondary leading-relaxed">
                {children}
              </li>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <pre className="bg-bg-primary rounded-lg p-4 overflow-x-auto mb-3 border border-border-subtle">
                    <code className="text-xs text-text-secondary font-mono">
                      {children}
                    </code>
                  </pre>
                );
              }
              return (
                <code className="bg-bg-primary px-1.5 py-0.5 rounded text-xs text-accent font-mono">
                  {children}
                </code>
              );
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/30 pl-4 my-3 text-text-muted italic">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-text-primary">
                {children}
              </strong>
            ),
            hr: () => <hr className="border-border-subtle my-4" />,
          }}
        >
          {note.content}
        </Markdown>
      </div>
    </div>
  );
}
