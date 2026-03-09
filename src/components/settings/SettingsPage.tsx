import { Save, Loader2, AlertCircle } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import ModelProviderConfig from "./ModelProviderConfig";
import TranscriptionConfig from "./TranscriptionConfig";

export default function SettingsPanel() {
  const { settings, isLoading, isSaving, error, saveSettings, updateField } =
    useSettings();

  const handleSave = async () => {
    try {
      await saveSettings(settings);
    } catch {
      // Error is already set in the hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <ModelProviderConfig settings={settings} updateField={updateField} />
      <TranscriptionConfig settings={settings} updateField={updateField} />

      {/* Audio */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.08em]">Audio</h2>
        <div className="bg-bg-card/50 rounded-2xl border border-border-subtle/50 p-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">Sample Rate</span>
            <select
              value={settings.audio_sample_rate}
              onChange={(e) =>
                updateField("audio_sample_rate", Number(e.target.value))
              }
              className="bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors"
            >
              <option value={16000}>16,000 Hz (recommended)</option>
              <option value={44100}>44,100 Hz</option>
              <option value={48000}>48,000 Hz</option>
            </select>
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            isSaving
              ? "bg-accent/30 text-white/40 cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent-hover active:scale-[0.98] shadow-lg shadow-accent/20"
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={14} />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
