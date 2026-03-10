import { Loader2, AlertCircle, Check } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import ModelProviderConfig from "./ModelProviderConfig";
import TranscriptionConfig from "./TranscriptionConfig";
import UpdateChecker from "./UpdateChecker";

export default function SettingsPanel() {
  const { settings, isLoading, isSaving, saved, error, updateField } =
    useSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={16} className="animate-spin text-text-muted/30" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-record/5 border border-record/10 rounded-xl">
          <AlertCircle size={13} className="text-record/70 shrink-0" />
          <p className="text-[12px] text-record/80">{error}</p>
        </div>
      )}

      <ModelProviderConfig settings={settings} updateField={updateField} />
      <TranscriptionConfig settings={settings} updateField={updateField} />

      {/* Audio */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[10px] font-semibold text-text-muted/40 uppercase tracking-[0.15em]">Audio</h2>
        <div className="bg-white/[0.02] border border-border-subtle rounded-xl p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-secondary">Sample Rate</span>
            <select
              value={settings.audio_sample_rate}
              onChange={(e) =>
                updateField("audio_sample_rate", Number(e.target.value))
              }
              className="bg-white/[0.04] border border-border-subtle rounded-lg px-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent/30 transition-all"
            >
              <option value={16000}>16,000 Hz (recommended)</option>
              <option value={44100}>44,100 Hz</option>
              <option value={48000}>48,000 Hz</option>
            </select>
          </label>
        </div>
      </section>

      <UpdateChecker />

      {/* Auto-save status */}
      <div className="flex justify-end h-5">
        {isSaving && (
          <span className="flex items-center gap-1.5 text-[11px] text-text-muted/40">
            <Loader2 size={10} className="animate-spin" />
            Saving...
          </span>
        )}
        {saved && !isSaving && (
          <span className="flex items-center gap-1.5 text-[11px] text-success/60">
            <Check size={10} />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
