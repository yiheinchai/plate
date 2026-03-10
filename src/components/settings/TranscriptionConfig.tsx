import { Eye, EyeOff, Check, Download } from "lucide-react";
import { useState, useEffect } from "react";
import type { Settings, WhisperModelInfo } from "../../lib/types";
import * as tauri from "../../lib/tauri";

interface TranscriptionConfigProps {
  settings: Settings;
  updateField: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const MODEL_OPTIONS = [
  { value: "ggml-tiny.en", label: "Tiny (~39M) — Fastest" },
  { value: "ggml-base.en", label: "Base (~74M) — Recommended" },
  { value: "ggml-small.en", label: "Small (~244M) — Better accuracy" },
  { value: "ggml-medium.en", label: "Medium (~769M) — High accuracy" },
  { value: "ggml-large-v3", label: "Large (~1.5G) — Best accuracy" },
];

export default function TranscriptionConfig({
  settings,
  updateField,
}: TranscriptionConfigProps) {
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [models, setModels] = useState<WhisperModelInfo[]>([]);

  useEffect(() => {
    if (settings.transcription_engine === "whisper_local") {
      tauri.listWhisperModels().then(setModels).catch(console.error);
    }
  }, [settings.transcription_engine]);

  const downloadedSet = new Set(models.filter((m) => m.downloaded).map((m) => m.name));
  const selectedDownloaded = downloadedSet.has(settings.whisper_model);

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[10px] font-semibold text-text-muted/40 uppercase tracking-[0.15em]">
        Transcription
      </h2>
      <div className="bg-white/[0.02] border border-border-subtle rounded-xl p-4 flex flex-col gap-4">
        {/* Engine toggle */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-text-secondary">Engine</span>
          <div className="flex rounded-lg border border-border-subtle bg-white/[0.02] p-0.5">
            <button
              onClick={() => updateField("transcription_engine", "whisper_local")}
              className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                settings.transcription_engine === "whisper_local"
                  ? "bg-accent/15 text-accent shadow-sm"
                  : "text-text-muted/60 hover:text-text-secondary"
              }`}
            >
              Local (Whisper)
            </button>
            <button
              onClick={() => updateField("transcription_engine", "whisper_api")}
              className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                settings.transcription_engine === "whisper_api"
                  ? "bg-accent/15 text-accent shadow-sm"
                  : "text-text-muted/60 hover:text-text-secondary"
              }`}
            >
              OpenAI API
            </button>
          </div>
        </div>

        {/* Local Whisper model */}
        {settings.transcription_engine === "whisper_local" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-secondary">Whisper Model</span>
            <select
              value={settings.whisper_model}
              onChange={(e) => updateField("whisper_model", e.target.value)}
              className="bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent/30 transition-all"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{downloadedSet.has(opt.value) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 mt-0.5">
              {selectedDownloaded ? (
                <span className="flex items-center gap-1 text-[10px] text-success/60">
                  <Check size={9} />
                  Downloaded
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-text-muted/40">
                  <Download size={9} />
                  Will download on first transcription
                </span>
              )}
            </div>
          </div>
        )}

        {/* OpenAI API key */}
        {settings.transcription_engine === "whisper_api" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-secondary">OpenAI API Key</span>
            <div className="relative">
              <input
                type={showOpenAIKey ? "text" : "password"}
                value={settings.openai_api_key}
                onChange={(e) => updateField("openai_api_key", e.target.value)}
                placeholder="sk-..."
                className="w-full bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 pr-9 text-[12px] text-text-primary placeholder:text-text-muted/30 outline-none focus:border-accent/30 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/40 hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showOpenAIKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        )}
      </div>
    </section>
  );
}
