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
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        Transcription
      </h2>
      <div className="bg-bg-card border border-border-subtle rounded p-3 flex flex-col gap-3">
        {/* Auto-transcribe toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[12px] text-text-secondary">Auto-transcribe</span>
            <span className="text-[10px] text-text-muted">Automatically transcribe after recording stops</span>
          </div>
          <button
            onClick={() => updateField("auto_transcribe", !settings.auto_transcribe)}
            className={`relative w-8 h-[18px] rounded-full transition-colors cursor-pointer ${
              settings.auto_transcribe ? "bg-accent" : "bg-white/15"
            }`}
          >
            <div
              className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                settings.auto_transcribe ? "translate-x-[16px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </div>

        {/* Auto-generate notes toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[12px] text-text-secondary">Auto-generate notes</span>
            <span className="text-[10px] text-text-muted">Generate notes automatically after transcription</span>
          </div>
          <button
            onClick={() => updateField("auto_generate_notes", !settings.auto_generate_notes)}
            className={`relative w-8 h-[18px] rounded-full transition-colors cursor-pointer ${
              settings.auto_generate_notes ? "bg-accent" : "bg-white/15"
            }`}
          >
            <div
              className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                settings.auto_generate_notes ? "translate-x-[16px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </div>

        {/* Language */}
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-text-secondary">Language</span>
          <select
            value={settings.transcription_language}
            onChange={(e) => updateField("transcription_language", e.target.value)}
            className="bg-bg-input border border-border-subtle rounded px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/40 transition-colors"
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="zh">Chinese (中文)</option>
            <option value="es">Spanish (Español)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
            <option value="ja">Japanese (日本語)</option>
            <option value="ko">Korean (한국어)</option>
            <option value="pt">Portuguese (Português)</option>
            <option value="ar">Arabic (العربية)</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="it">Italian (Italiano)</option>
            <option value="nl">Dutch (Nederlands)</option>
            <option value="pl">Polish (Polski)</option>
            <option value="ru">Russian (Русский)</option>
            <option value="tr">Turkish (Türkçe)</option>
            <option value="vi">Vietnamese (Tiếng Việt)</option>
            <option value="th">Thai (ไทย)</option>
            <option value="id">Indonesian (Bahasa)</option>
            <option value="ms">Malay (Bahasa Melayu)</option>
            <option value="sv">Swedish (Svenska)</option>
          </select>
          <span className="text-[10px] text-text-muted">
            {settings.transcription_language === "auto"
              ? "Whisper will detect the language automatically"
              : "Use non-.en models (e.g. ggml-base) for best multilingual accuracy"}
          </span>
        </div>

        {/* Engine toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-text-secondary">Engine</span>
          <div className="flex bg-bg-primary rounded border border-border-subtle">
            <button
              onClick={() => updateField("transcription_engine", "whisper_local")}
              className={`flex-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                settings.transcription_engine === "whisper_local"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Local (Whisper)
            </button>
            <button
              onClick={() => updateField("transcription_engine", "whisper_api")}
              className={`flex-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                settings.transcription_engine === "whisper_api"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              OpenAI API
            </button>
          </div>
        </div>

        {/* Local Whisper model */}
        {settings.transcription_engine === "whisper_local" && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">Whisper Model</span>
            <select
              value={settings.whisper_model}
              onChange={(e) => updateField("whisper_model", e.target.value)}
              className="bg-bg-input border border-border-subtle rounded px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/40 transition-colors"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{downloadedSet.has(opt.value) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 mt-0.5">
              {selectedDownloaded ? (
                <span className="flex items-center gap-1 text-[10px] text-success">
                  <Check size={9} />
                  Downloaded
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-text-muted">
                  <Download size={9} />
                  Will download on first transcription
                </span>
              )}
            </div>
          </div>
        )}

        {/* OpenAI API key */}
        {settings.transcription_engine === "whisper_api" && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">OpenAI API Key</span>
            <div className="relative">
              <input
                type={showOpenAIKey ? "text" : "password"}
                value={settings.openai_api_key}
                onChange={(e) => updateField("openai_api_key", e.target.value)}
                placeholder="sk-..."
                className="w-full bg-bg-input border border-border-subtle rounded px-2.5 py-1.5 pr-8 text-[12px] text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/40 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showOpenAIKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </label>
        )}
      </div>
    </section>
  );
}
