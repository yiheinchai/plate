import { Loader2, AlertCircle, Check } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import ModelProviderConfig from "./ModelProviderConfig";
import TranscriptionConfig from "./TranscriptionConfig";

export default function SettingsPanel() {
  const { settings, isLoading, isSaving, saved, error, updateField } =
    useSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={16} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-record/10 border border-record/20 rounded">
          <AlertCircle size={13} className="text-record shrink-0" />
          <p className="text-[12px] text-record">{error}</p>
        </div>
      )}

      <ModelProviderConfig settings={settings} updateField={updateField} />
      <TranscriptionConfig settings={settings} updateField={updateField} />

      {/* Audio */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Audio</h2>
        <div className="bg-bg-card border border-border-subtle rounded p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">Sample Rate</span>
            <select
              value={settings.audio_sample_rate}
              onChange={(e) =>
                updateField("audio_sample_rate", Number(e.target.value))
              }
              className="bg-bg-input border border-border-subtle rounded px-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/40 transition-colors"
            >
              <option value={16000}>16,000 Hz (recommended)</option>
              <option value={44100}>44,100 Hz</option>
              <option value={48000}>48,000 Hz</option>
            </select>
          </label>
        </div>
      </section>

      {/* Auto-save status */}
      <div className="flex justify-end h-5">
        {isSaving && (
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            <Loader2 size={10} className="animate-spin" />
            Saving...
          </span>
        )}
        {saved && !isSaving && (
          <span className="flex items-center gap-1 text-[11px] text-success">
            <Check size={10} />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
