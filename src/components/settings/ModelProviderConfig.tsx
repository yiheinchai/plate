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
  { id: "session_token" as const, label: "Token" },
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

  const handleModeChange = (mode: Settings["llm_auth_mode"]) => {
    updateField("llm_auth_mode", mode);
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
      <h2 className="text-[10px] font-semibold text-text-muted/40 uppercase tracking-[0.15em]">
        AI Provider
      </h2>
      <div className="bg-white/[0.02] border border-border-subtle rounded-xl p-4 flex flex-col gap-4">
        {/* Auth mode tabs */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-text-secondary">Provider</span>
          <div className="flex rounded-lg border border-border-subtle bg-white/[0.02] p-0.5">
            {AUTH_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                  settings.llm_auth_mode === mode.id
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-text-muted/60 hover:text-text-secondary"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Free mode info */}
        {isFreeMode && (
          <div className="bg-accent/5 border border-accent/10 rounded-lg px-3 py-2">
            <p className="text-[11px] text-accent/60">
              Free AI — no API key needed. Powered by Pollinations.ai.
            </p>
          </div>
        )}

        {/* API Key input */}
        {settings.llm_auth_mode === "api_key" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-secondary">Anthropic API Key</span>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.llm_api_key}
                onChange={(e) => updateField("llm_api_key", e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 pr-9 text-[12px] text-text-primary placeholder:text-text-muted/30 outline-none focus:border-accent/30 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/40 hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        )}

        {/* Session Token input */}
        {settings.llm_auth_mode === "session_token" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-secondary">Setup Token</span>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={settings.llm_session_token}
                onChange={(e) =>
                  updateField("llm_session_token", e.target.value.trim())
                }
                placeholder="sk-ant-oat01-..."
                className="w-full bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 pr-9 text-[12px] text-text-primary placeholder:text-text-muted/30 outline-none focus:border-accent/30 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/40 hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-[10px] text-text-muted/30">
              Run <code className="bg-white/[0.04] px-1 py-0.5 rounded font-mono text-accent/50">claude setup-token</code> and paste here.
            </p>
          </label>
        )}

        {/* Model */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-text-secondary">Model</span>
          <select
            value={settings.llm_model}
            onChange={(e) => updateField("llm_model", e.target.value)}
            className="bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent/30 transition-all"
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Advanced free mode */}
        {isFreeMode && (
          <details className="group">
            <summary className="text-[10px] text-text-muted/30 cursor-pointer hover:text-text-secondary transition-colors">
              Advanced
            </summary>
            <label className="flex flex-col gap-1.5 mt-3">
              <span className="text-[11px] text-text-secondary">Custom API URL</span>
              <input
                type="text"
                value={settings.g4f_url}
                onChange={(e) => updateField("g4f_url", e.target.value)}
                placeholder="https://text.pollinations.ai/openai"
                className="w-full bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 text-[11px] text-text-primary placeholder:text-text-muted/30 outline-none focus:border-accent/30 transition-all font-mono"
              />
              <p className="text-[10px] text-text-muted/30">
                Any OpenAI-compatible endpoint. Leave empty for default.
              </p>
            </label>
          </details>
        )}
      </div>
    </section>
  );
}
