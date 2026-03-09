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
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft size={15} />
          Back to notes
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? (
            <Check size={11} className="text-success" />
          ) : (
            <Copy size={11} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold text-text-primary">{note.title}</h1>

      {/* Metadata */}
      <div className="flex items-center gap-2.5 text-[11px] text-text-muted">
        <span>
          {new Date(note.created_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
        <span>{note.model}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
        <span className="capitalize">{note.prompt_style}</span>
      </div>

      {/* Markdown content */}
      <div className="prose-dark">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-lg font-bold text-text-primary mt-5 mb-2.5">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-base font-semibold text-text-primary mt-4 mb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-[14px] font-semibold text-text-primary mt-3.5 mb-1.5">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-[13px] text-text-secondary leading-relaxed mb-2.5">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside text-[13px] text-text-secondary mb-2.5 space-y-0.5">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside text-[13px] text-text-secondary mb-2.5 space-y-0.5">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-[13px] text-text-secondary leading-relaxed">
                {children}
              </li>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <pre className="bg-bg-primary rounded-lg p-3.5 overflow-x-auto mb-2.5 border border-border-subtle/50">
                    <code className="text-[12px] text-text-secondary font-mono">
                      {children}
                    </code>
                  </pre>
                );
              }
              return (
                <code className="bg-bg-primary px-1.5 py-0.5 rounded text-[12px] text-accent font-mono">
                  {children}
                </code>
              );
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/30 pl-3.5 my-2.5 text-text-muted italic">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-text-primary">
                {children}
              </strong>
            ),
            hr: () => <hr className="border-border-subtle/50 my-3.5" />,
          }}
        >
          {note.content}
        </Markdown>
      </div>
    </div>
  );
}
