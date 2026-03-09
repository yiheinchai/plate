import { useState, useEffect, useRef } from "react";
import { ChevronDown, Save, Trash2, Pencil } from "lucide-react";
import * as tauri from "../../lib/tauri";
import type { SavedPrompt } from "../../lib/types";

const BUILT_IN_STYLES = [
  { id: "summary", name: "Summary", description: "Concise lecture summary" },
  {
    id: "memorization",
    name: "Memorization",
    description: "Q&A flashcard pairs",
  },
  { id: "cornell", name: "Cornell Notes", description: "Cornell format" },
  {
    id: "outline",
    name: "Outline",
    description: "Structured headings & bullets",
  },
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

  // Close dropdown on outside click
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
    ? "Custom Prompt"
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
    <div className="flex flex-col gap-2" ref={dropdownRef}>
      {/* Prompt selector row */}
      <div className="flex items-center gap-2">
        {/* Dropdown trigger */}
        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-bg-card/50 border border-border-subtle/40 text-[12px] text-text-secondary hover:border-accent/30 transition-colors cursor-pointer"
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown
              size={12}
              className={`shrink-0 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Dropdown menu */}
          {isOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-subtle/60 rounded-xl shadow-lg z-50 overflow-hidden"
              style={{ animation: "fade-in 0.1s ease-out" }}
            >
              {/* Built-in styles */}
              <div className="p-1">
                <span className="px-2.5 py-1 text-[10px] text-text-muted/60 uppercase tracking-wider font-medium">
                  Styles
                </span>
                {BUILT_IN_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleSelectBuiltIn(style.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${
                      !isCustomMode && selectedStyle === style.id
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-white/5"
                    }`}
                  >
                    <span>{style.name}</span>
                    <span className="text-[10px] text-text-muted/50">
                      {style.description}
                    </span>
                  </button>
                ))}
              </div>

              {/* Custom option */}
              <div className="border-t border-border-subtle/30 p-1">
                <button
                  onClick={() => {
                    setIsCustomMode(true);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${
                    isCustomMode
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-white/5"
                  }`}
                >
                  <Pencil size={11} />
                  <span>Custom Prompt</span>
                </button>
              </div>

              {/* Saved prompts */}
              {savedPrompts.length > 0 && (
                <div className="border-t border-border-subtle/30 p-1">
                  <span className="px-2.5 py-1 text-[10px] text-text-muted/60 uppercase tracking-wider font-medium">
                    Saved
                  </span>
                  {savedPrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => handleSelectSaved(prompt)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-text-secondary hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <span className="truncate">{prompt.name}</span>
                      <button
                        onClick={(e) => handleDeletePrompt(prompt.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-400/10 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom prompt textarea */}
      {isCustomMode && (
        <div
          className="flex flex-col gap-1.5"
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Enter your custom prompt... The transcript will be appended automatically."
            rows={3}
            className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors resize-none"
          />
          {/* Save prompt */}
          {customPrompt.trim() && (
            <div className="flex items-center gap-1.5">
              {showSaveInput ? (
                <>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSavePrompt()}
                    placeholder="Prompt name..."
                    autoFocus
                    className="flex-1 bg-bg-input border border-border-subtle rounded-md px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors"
                  />
                  <button
                    onClick={handleSavePrompt}
                    disabled={!saveName.trim()}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveName("");
                    }}
                    className="px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowSaveInput(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Save size={10} />
                  <span>Save prompt</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generate button integrated */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || (isCustomMode && !customPrompt.trim())}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
          isGenerating || (isCustomMode && !customPrompt.trim())
            ? "bg-accent/20 text-accent/40 cursor-not-allowed"
            : "bg-accent/15 text-accent hover:bg-accent/25 active:scale-[0.98] border border-accent/20"
        }`}
      >
        {isGenerating ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
            <span>Generating...</span>
          </>
        ) : (
          <span>Generate Notes</span>
        )}
      </button>
    </div>
  );
}
