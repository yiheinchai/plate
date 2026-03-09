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
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          Notes
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-text-muted font-mono">{note.model}</span>
        <span className="text-[10px] text-text-muted capitalize">{note.prompt_style}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
        >
          {copied ? (
            <Check size={10} className="text-success" />
          ) : (
            <Copy size={10} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-2xl">
          {/* Title */}
          <h1 className="text-lg font-semibold text-text-primary mb-1">{note.title}</h1>

          {/* Date */}
          <p className="text-[11px] text-text-muted mb-4">
            {new Date(note.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>

          {/* Markdown */}
          <div className="prose-dark">
            <Markdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-[15px] font-bold text-text-primary mt-4 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-[14px] font-semibold text-text-primary mt-3.5 mb-1.5">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-[13px] font-semibold text-text-primary mt-3 mb-1">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-[12px] text-text-secondary leading-relaxed mb-2">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside text-[12px] text-text-secondary mb-2 space-y-0.5">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside text-[12px] text-text-secondary mb-2 space-y-0.5">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-[12px] text-text-secondary leading-relaxed">
                    {children}
                  </li>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <pre className="bg-bg-sidebar rounded p-3 overflow-x-auto mb-2 border border-border-subtle">
                        <code className="text-[11px] text-text-secondary font-mono">
                          {children}
                        </code>
                      </pre>
                    );
                  }
                  return (
                    <code className="bg-bg-sidebar px-1 py-0.5 rounded text-[11px] text-accent font-mono">
                      {children}
                    </code>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-muted italic">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-text-primary">
                    {children}
                  </strong>
                ),
                hr: () => <hr className="border-border-subtle my-3" />,
              }}
            >
              {note.content}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}
