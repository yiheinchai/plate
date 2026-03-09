import { useState, useEffect, useRef } from "react";
import { ChevronDown, Save, Trash2, Pencil } from "lucide-react";
import * as tauri from "../../lib/tauri";
import type { SavedPrompt } from "../../lib/types";

const BUILT_IN_STYLES = [
  { id: "summary", name: "Summary", description: "Concise lecture summary" },
  { id: "memorization", name: "Memorization", description: "Q&A flashcard pairs" },
  { id: "cornell", name: "Cornell Notes", description: "Cornell format" },
  { id: "outline", name: "Outline", description: "Structured headings & bullets" },
] as const;

interface PromptPickerProps {
  onGenerate: (promptStyle: string, customPrompt?: string) => void;
  isGenerating: boolean;
}

export default function PromptPicker({
  onGenerate,
  isGenerating,
}: PromptPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("summary");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tauri.listSavedPrompts().then(setSavedPrompts).catch(console.error);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const currentLabel = isCustomMode
    ? "Custom"
    : BUILT_IN_STYLES.find((s) => s.id === selectedStyle)?.name ?? "Summary";

  const handleSelectBuiltIn = (id: string) => {
    setSelectedStyle(id);
    setIsCustomMode(false);
    setIsOpen(false);
  };

  const handleSelectSaved = (prompt: SavedPrompt) => {
    setCustomPrompt(prompt.prompt_text);
    setIsCustomMode(true);
    setIsOpen(false);
  };

  const handleSavePrompt = async () => {
    if (!saveName.trim() || !customPrompt.trim()) return;
    try {
      const saved = await tauri.savePrompt(saveName.trim(), customPrompt.trim());
      setSavedPrompts((prev) => [saved, ...prev]);
      setSaveName("");
      setShowSaveInput(false);
    } catch (err) {
      console.error("Failed to save prompt:", err);
    }
  };

  const handleDeletePrompt = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tauri.deleteSavedPrompt(id);
      setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete prompt:", err);
    }
  };

  const handleGenerate = () => {
    if (isCustomMode) {
      onGenerate("custom", customPrompt || undefined);
    } else {
      onGenerate(selectedStyle);
    }
  };

  return (
    <div className="flex items-center gap-1.5" ref={dropdownRef}>
      {/* Style selector */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-secondary bg-bg-input border border-border-subtle hover:border-accent/40 transition-colors cursor-pointer"
        >
          <span>{currentLabel}</span>
          <ChevronDown
            size={10}
            className={`text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            className="absolute top-full right-0 mt-1 w-56 bg-bg-card border border-border-medium rounded shadow-xl z-50"
            style={{ animation: "fade-in 0.08s ease-out" }}
          >
            {/* Built-in styles */}
            <div className="py-1">
              <div className="px-2.5 py-1 text-[10px] text-text-muted uppercase tracking-wider">
                Styles
              </div>
              {BUILT_IN_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleSelectBuiltIn(style.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer ${
                    !isCustomMode && selectedStyle === style.id
                      ? "bg-accent/15 text-accent"
                      : "text-text-secondary hover:bg-white/[0.04]"
                  }`}
                >
                  <span>{style.name}</span>
                  <span className="text-[10px] text-text-muted">{style.description}</span>
                </button>
              ))}
            </div>

            {/* Custom */}
            <div className="border-t border-border-subtle py-1">
              <button
                onClick={() => {
                  setIsCustomMode(true);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-1 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  isCustomMode
                    ? "bg-accent/15 text-accent"
                    : "text-text-secondary hover:bg-white/[0.04]"
                }`}
              >
                <Pencil size={10} />
                <span>Custom Prompt</span>
              </button>
            </div>

            {/* Saved */}
            {savedPrompts.length > 0 && (
              <div className="border-t border-border-subtle py-1">
                <div className="px-2.5 py-1 text-[10px] text-text-muted uppercase tracking-wider">
                  Saved
                </div>
                {savedPrompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleSelectSaved(prompt)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <span className="truncate">{prompt.name}</span>
                    <button
                      onClick={(e) => handleDeletePrompt(prompt.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-record/10 hover:text-record transition-all cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom prompt inline input */}
      {isCustomMode && (
        <div className="flex items-center gap-1" style={{ animation: "fade-in 0.1s ease-out" }}>
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Enter prompt..."
            className="bg-bg-input border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/60 outline-none focus:border-accent/40 transition-colors w-40"
          />
          {customPrompt.trim() && !showSaveInput && (
            <button
              onClick={() => setShowSaveInput(true)}
              className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              title="Save prompt"
            >
              <Save size={11} />
            </button>
          )}
          {showSaveInput && (
            <>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePrompt()}
                placeholder="Name..."
                autoFocus
                className="bg-bg-input border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/60 outline-none focus:border-accent/40 transition-colors w-20"
              />
              <button
                onClick={handleSavePrompt}
                disabled={!saveName.trim()}
                className="px-1.5 py-1 rounded text-[10px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
            </>
          )}
        </div>
      )}

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || (isCustomMode && !customPrompt.trim())}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
          isGenerating || (isCustomMode && !customPrompt.trim())
            ? "bg-accent/20 text-accent/40 cursor-not-allowed"
            : "bg-accent text-white hover:bg-accent-hover"
        }`}
      >
        {isGenerating ? (
          <>
            <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
            <span>Generating</span>
          </>
        ) : (
          <span>Generate Notes</span>
        )}
      </button>
    </div>
  );
}
