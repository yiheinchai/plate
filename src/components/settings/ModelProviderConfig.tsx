import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { Settings } from "../../lib/types";

interface ModelProviderConfigProps {
  settings: Settings;
  updateField: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export default function ModelProviderConfig({
  settings,
  updateField,
}: ModelProviderConfigProps) {
  const [showToken, setShowToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.08em]">
        LLM Provider
      </h2>
      <div className="bg-bg-card/50 rounded-2xl border border-border-subtle/50 p-5 flex flex-col gap-5">
        {/* Auth mode toggle */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">Authentication</span>
          <div className="relative flex bg-bg-primary rounded-xl p-1 border border-border-subtle/50">
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-lg bg-accent/15 border border-accent/20 transition-all duration-200 ease-out"
              style={{
                left: settings.llm_auth_mode === "api_key" ? "4px" : "50%",
                width: "calc(50% - 4px)",
              }}
            />
            <button
              onClick={() => updateField("llm_auth_mode", "api_key")}
              className={`relative z-10 flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                settings.llm_auth_mode === "api_key"
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              API Key
            </button>
            <button
              onClick={() => updateField("llm_auth_mode", "session_token")}
              className={`relative z-10 flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                settings.llm_auth_mode === "session_token"
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Session Token
            </button>
          </div>
        </div>

        {/* API Key input */}
        {settings.llm_auth_mode === "api_key" && (
          <label className="flex flex-col gap-2" style={{ animation: "fade-in 0.15s ease-out" }}>
            <span className="text-sm text-text-secondary">Anthropic API Key</span>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.llm_api_key}
                onChange={(e) => updateField("llm_api_key", e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>
        )}

        {/* Session Token input */}
        {settings.llm_auth_mode === "session_token" && (
          <label className="flex flex-col gap-2" style={{ animation: "fade-in 0.15s ease-out" }}>
            <span className="text-sm text-text-secondary">Session Token</span>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={settings.llm_session_token}
                onChange={(e) =>
                  updateField("llm_session_token", e.target.value)
                }
                placeholder="sk-ant-sid..."
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted/60">
              Get this from browser cookies on claude.ai (Developer Tools &rarr; Application &rarr; Cookies)
            </p>
          </label>
        )}

        {/* Model selection */}
        <label className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">Model</span>
          <select
            value={settings.llm_model}
            onChange={(e) => updateField("llm_model", e.target.value)}
            className="bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors"
          >
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
            <option value="claude-opus-4-20250514">Claude Opus 4</option>
            <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
          </select>
        </label>
      </div>
    </section>
  );
}
