import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ArrowLeft, Copy, Check, Download, Pencil, Save, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Note } from "../../lib/types";
import * as tauri from "../../lib/tauri";

interface NoteViewerProps {
  note: Note;
  onBack?: () => void;
  onNoteUpdated?: (note: Note) => void;
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-md overflow-hidden border border-border-subtle">
      {language && (
        <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e1e] border-b border-border-subtle">
          <span className="text-[10px] text-text-muted font-mono">{language}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language || "text"}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "12px",
          fontSize: "11px",
          background: "#1e1e1e",
          borderRadius: 0,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function NoteViewer({ note, onBack, onNoteUpdated }: NoteViewerProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [editTitle, setEditTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditContent(note.content);
    setEditTitle(note.title);
    setIsEditing(false);
  }, [note.id]);

  const handleStartEdit = () => {
    setEditContent(note.content);
    setEditTitle(note.title);
    setIsEditing(true);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const handleSaveEdit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await tauri.updateNote(note.id, editTitle, editContent);
      const updated = { ...note, title: editTitle, content: editContent };
      onNoteUpdated?.(updated);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(note.content);
    setEditTitle(note.title);
    setIsEditing(false);
  };

  const handleExport = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const safeName = note.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
      const filePath = await save({
        defaultPath: `${safeName}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!filePath) return;
      const content = `# ${note.title}\n\n${note.content}`;
      await writeTextFile(filePath, content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

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
      {onBack && (
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
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          >
            {saved ? (
              <Check size={10} className="text-success" />
            ) : (
              <Download size={10} />
            )}
            {saved ? "Saved" : "Export"}
          </button>
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-accent hover:bg-accent/10 transition-colors cursor-pointer"
              >
                <Save size={10} />
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={10} />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Pencil size={10} />
              Edit
            </button>
          )}
        </div>
      )}

      {/* Inline edit/save for non-toolbar mode */}
      {!onBack && !isEditing && (
        <div className="flex justify-end px-5 pt-3">
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Pencil size={10} />
            Edit
          </button>
        </div>
      )}
      {!onBack && isEditing && (
        <div className="flex justify-end gap-1 px-5 pt-3">
          <button
            onClick={handleSaveEdit}
            disabled={isSaving}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-accent hover:bg-accent/10 transition-colors cursor-pointer"
          >
            <Save size={10} />
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleCancelEdit}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={10} />
            Cancel
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isEditing ? (
          <div className="max-w-2xl flex flex-col gap-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="bg-bg-input border border-border-subtle rounded px-3 py-1.5 text-[14px] font-semibold text-text-primary outline-none focus:border-accent/40 transition-colors"
              placeholder="Note title"
            />
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "s" && e.metaKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === "Escape") handleCancelEdit();
              }}
              className="flex-1 min-h-[400px] bg-bg-input border border-border-subtle rounded px-3 py-2 text-[12px] text-text-primary font-mono leading-relaxed outline-none focus:border-accent/40 transition-colors resize-y"
              placeholder="Markdown content..."
            />
            <p className="text-[10px] text-text-muted">Cmd+S to save, Esc to cancel. Supports Markdown formatting.</p>
          </div>
        ) : (
        <div className="max-w-2xl markdown-body">
          {/* Title */}
          {onBack && (
            <>
              <h1 className="text-lg font-semibold text-text-primary mb-1">{isEditing ? editTitle : note.title}</h1>
              <p className="text-[11px] text-text-muted mb-4">
                {new Date(note.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </>
          )}

          {/* Markdown */}
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-[16px] font-bold text-text-primary mt-5 mb-2 pb-1 border-b border-border-subtle">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-[14px] font-semibold text-text-primary mt-4 mb-1.5 pb-1 border-b border-border-subtle">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[13px] font-semibold text-text-primary mt-3.5 mb-1">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-[12px] font-semibold text-text-primary mt-3 mb-1">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="text-[12px] text-text-secondary leading-relaxed mb-3">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="text-[12px] text-text-secondary mb-3 pl-5 space-y-1 list-disc">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="text-[12px] text-text-secondary mb-3 pl-5 space-y-1 list-decimal">
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
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                }
                return (
                  <code className="bg-[#2d2d2d] px-1.5 py-0.5 rounded text-[11px] text-[#ce9178] font-mono">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <>{children}</>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-3 border-accent/50 pl-3 my-3 text-text-muted">
                  {children}
                </blockquote>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-text-primary">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="italic text-text-secondary">{children}</em>
              ),
              hr: () => <hr className="border-border-subtle my-4" />,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover underline underline-offset-2"
                >
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-3 rounded-md border border-border-subtle">
                  <table className="w-full text-[12px] border-collapse">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-[#2d2d2d]">{children}</thead>
              ),
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => (
                <tr className="border-b border-border-subtle last:border-b-0">
                  {children}
                </tr>
              ),
              th: ({ children }) => (
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-text-primary">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-1.5 text-text-secondary">
                  {children}
                </td>
              ),
              input: ({ checked, ...props }) => {
                if (props.type === "checkbox") {
                  return (
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="mr-1.5 accent-accent"
                    />
                  );
                }
                return <input {...props} />;
              },
              del: ({ children }) => (
                <del className="text-text-muted line-through">{children}</del>
              ),
              img: ({ src, alt }) => (
                <img src={src} alt={alt} className="max-w-full rounded-md my-2" />
              ),
            }}
          >
            {note.content}
          </Markdown>
        </div>
        )}
      </div>
    </div>
  );
}
