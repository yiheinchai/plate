import { Mic, Monitor } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import type { AudioSource } from "../../lib/types";

export default function AudioSourcePicker() {
  const { currentAudioSource, setAudioSource, recordingStatus } = useAppStore();
  const disabled = recordingStatus !== "idle";

  const sources: { value: AudioSource; label: string; icon: React.ReactNode }[] = [
    { value: "microphone", label: "Microphone", icon: <Mic size={14} /> },
    { value: "system_audio", label: "System Audio", icon: <Monitor size={14} /> },
  ];

  return (
    <div className="relative flex items-center bg-bg-card rounded-xl p-1 border border-border-subtle">
      {/* Sliding background indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-white/[0.08] border border-white/[0.06] transition-all duration-200 ease-out"
        style={{
          left: currentAudioSource === "microphone" ? "4px" : "50%",
          width: "calc(50% - 4px)",
        }}
      />

      {sources.map((source) => {
        const isActive = currentAudioSource === source.value;
        return (
          <button
            key={source.value}
            onClick={() => !disabled && setAudioSource(source.value)}
            disabled={disabled}
            className={`relative z-10 flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
              isActive
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {source.icon}
            <span>{source.label}</span>
          </button>
        );
      })}
    </div>
  );
}
