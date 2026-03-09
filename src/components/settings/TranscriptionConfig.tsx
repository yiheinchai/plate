import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { Settings } from "../../lib/types";

interface TranscriptionConfigProps {
  settings: Settings;
  updateField: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export default function TranscriptionConfig({
  settings,
  updateField,
}: TranscriptionConfigProps) {
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.08em]">
        Transcription
      </h2>
      <div className="bg-bg-card/50 rounded-2xl border border-border-subtle/50 p-5 flex flex-col gap-5">
        {/* Engine toggle */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">Engine</span>
          <div className="relative flex bg-bg-primary rounded-xl p-1 border border-border-subtle/50">
            <div
              className="absolute top-1 bottom-1 rounded-lg bg-accent/15 border border-accent/20 transition-all duration-200 ease-out"
              style={{
                left: settings.transcription_engine === "whisper_local" ? "4px" : "50%",
                width: "calc(50% - 4px)",
              }}
            />
            <button
              onClick={() => updateField("transcription_engine", "whisper_local")}
              className={`relative z-10 flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                settings.transcription_engine === "whisper_local"
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Local (Whisper)
            </button>
            <button
              onClick={() => updateField("transcription_engine", "whisper_api")}
              className={`relative z-10 flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                settings.transcription_engine === "whisper_api"
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              OpenAI API
            </button>
          </div>
        </div>

        {/* Local Whisper model */}
        {settings.transcription_engine === "whisper_local" && (
          <label className="flex flex-col gap-2" style={{ animation: "fade-in 0.15s ease-out" }}>
            <span className="text-sm text-text-secondary">Whisper Model</span>
            <select
              value={settings.whisper_model}
              onChange={(e) => updateField("whisper_model", e.target.value)}
              className="bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors"
            >
              <option value="tiny">Tiny (~39M) — Fastest</option>
              <option value="base">Base (~74M) — Recommended</option>
              <option value="small">Small (~244M) — Better accuracy</option>
              <option value="medium">Medium (~769M) — High accuracy</option>
              <option value="large">Large (~1.5G) — Best accuracy</option>
            </select>
            <p className="text-[11px] text-text-muted/60">
              Larger models are more accurate but slower and use more memory
            </p>
          </label>
        )}

        {/* OpenAI API key */}
        {settings.transcription_engine === "whisper_api" && (
          <label className="flex flex-col gap-2" style={{ animation: "fade-in 0.15s ease-out" }}>
            <span className="text-sm text-text-secondary">OpenAI API Key</span>
            <div className="relative">
              <input
                type={showOpenAIKey ? "text" : "password"}
                value={settings.openai_api_key}
                onChange={(e) => updateField("openai_api_key", e.target.value)}
                placeholder="sk-..."
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showOpenAIKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted/60">
              Required for OpenAI Whisper API transcription
            </p>
          </label>
        )}
      </div>
    </section>
  );
}
