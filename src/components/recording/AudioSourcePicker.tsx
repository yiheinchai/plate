import { Mic, Monitor } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import type { AudioSource } from "../../lib/types";

export default function AudioSourcePicker() {
  const { currentAudioSource, setAudioSource, recordingStatus } = useAppStore();
  const disabled = recordingStatus !== "idle";

  const sources: { value: AudioSource; label: string; icon: React.ReactNode }[] = [
    { value: "microphone", label: "Mic", icon: <Mic size={13} /> },
    { value: "system_audio", label: "System", icon: <Monitor size={13} /> },
  ];

  return (
    <div className="flex items-center bg-bg-card border border-border-subtle rounded">
      {sources.map((source) => {
        const isActive = currentAudioSource === source.value;
        return (
          <button
            key={source.value}
            onClick={() => !disabled && setAudioSource(source.value)}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
              isActive
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-text-secondary hover:bg-white/[0.03]"
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
