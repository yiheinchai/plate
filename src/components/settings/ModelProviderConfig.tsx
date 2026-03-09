import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { Settings } from "../../lib/types";

interface ModelProviderConfigProps {
  settings: Settings;
  updateField: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const AUTH_MODES = [
  { id: "g4f" as const, label: "Free" },
  { id: "api_key" as const, label: "API Key" },
  { id: "session_token" as const, label: "Setup Token" },
];

const FREE_MODELS = [
  { value: "openai", label: "GPT-4o Mini (default)" },
  { value: "openai-large", label: "GPT-4o" },
  { value: "deepseek-r1", label: "DeepSeek R1" },
  { value: "mistral", label: "Mistral" },
  { value: "gemini", label: "Gemini 2.0" },
  { value: "qwen-coder", label: "Qwen Coder" },
  { value: "llama-4-scout", label: "Llama 4 Scout" },
];

const CLAUDE_MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

export default function ModelProviderConfig({
  settings,
  updateField,
}: ModelProviderConfigProps) {
  const [showToken, setShowToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const activeIndex = AUTH_MODES.findIndex(
    (m) => m.id === settings.llm_auth_mode
  );
  const tabWidth = 100 / AUTH_MODES.length;

  const handleModeChange = (mode: Settings["llm_auth_mode"]) => {
    updateField("llm_auth_mode", mode);
    // Auto-switch model to a sensible default for the mode
    if (mode === "g4f") {
      updateField("llm_model", "openai");
    } else if (
      settings.llm_model === "openai" ||
      FREE_MODELS.some((m) => m.value === settings.llm_model)
    ) {
      updateField("llm_model", "claude-sonnet-4-6");
    }
  };

  const isFreeMode = settings.llm_auth_mode === "g4f";
  const models = isFreeMode ? FREE_MODELS : CLAUDE_MODELS;

  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.08em]">
          LLM Provider
        </h2>
        <p className="text-[11px] text-text-muted/60 mt-0.5">
          Configure AI model for note generation
        </p>
      </div>
      <div className="bg-bg-card/40 rounded-xl border border-border-subtle/40 p-4 flex flex-col gap-4">
        {/* Auth mode toggle */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-text-secondary">Provider</span>
          <div className="relative flex bg-bg-primary rounded-lg p-0.5 border border-border-subtle/40">
            <div
              className="absolute top-0.5 bottom-0.5 rounded-md bg-accent/15 border border-accent/20 transition-all duration-200 ease-out"
              style={{
                left: `calc(${activeIndex * tabWidth}% + 2px)`,
                width: `calc(${tabWidth}% - 4px)`,
              }}
            />
            {AUTH_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                className={`relative z-10 flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                  settings.llm_auth_mode === mode.id
                    ? "text-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Free mode info */}
        {isFreeMode && (
          <div
            className="bg-accent/5 border border-accent/15 rounded-lg px-3 py-2"
            style={{ animation: "fade-in 0.15s ease-out" }}
          >
            <p className="text-[11px] text-accent/80">
              Free AI — works out of the box, no API key needed.
            </p>
            <p className="text-[10px] text-text-muted/50 mt-0.5">
              Powered by Pollinations.ai. Quality may vary compared to paid
              models.
            </p>
          </div>
        )}

        {/* API Key input */}
        {settings.llm_auth_mode === "api_key" && (
          <label
            className="flex flex-col gap-1.5"
            style={{ animation: "fade-in 0.15s ease-out" }}
          >
            <span className="text-[13px] text-text-secondary">
              Anthropic API Key
            </span>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.llm_api_key}
                onChange={(e) => updateField("llm_api_key", e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 pr-9 text-[13px] text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        )}

        {/* Setup Token input */}
        {settings.llm_auth_mode === "session_token" && (
          <label
            className="flex flex-col gap-1.5"
            style={{ animation: "fade-in 0.15s ease-out" }}
          >
            <span className="text-[13px] text-text-secondary">
              Setup Token
            </span>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={settings.llm_session_token}
                onChange={(e) =>
                  updateField("llm_session_token", e.target.value.trim())
                }
                placeholder="sk-ant-oat01-..."
                className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 pr-9 text-[13px] text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-[10px] text-text-muted/50">
              Run{" "}
              <code className="bg-white/5 px-1 rounded">
                claude setup-token
              </code>{" "}
              and paste the token here. Make sure there are no extra newlines or
              spaces.
            </p>
          </label>
        )}

        {/* Model selection */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-text-secondary">Model</span>
          <select
            value={settings.llm_model}
            onChange={(e) => updateField("llm_model", e.target.value)}
            className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent/40 transition-colors"
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Advanced: custom endpoint for free mode */}
        {isFreeMode && (
          <details className="group">
            <summary className="text-[11px] text-text-muted/50 cursor-pointer hover:text-text-muted transition-colors">
              Advanced
            </summary>
            <label className="flex flex-col gap-1.5 mt-2">
              <span className="text-[12px] text-text-secondary">
                Custom API URL
              </span>
              <input
                type="text"
                value={settings.g4f_url}
                onChange={(e) => updateField("g4f_url", e.target.value)}
                placeholder="https://text.pollinations.ai/openai"
                className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors font-mono"
              />
              <p className="text-[10px] text-text-muted/50">
                Any OpenAI-compatible endpoint. Leave empty for Pollinations.ai.
              </p>
            </label>
          </details>
        )}
      </div>
    </section>
  );
}
