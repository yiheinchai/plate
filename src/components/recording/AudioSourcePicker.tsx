import { Mic, Monitor } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import type { AudioSource } from "../../lib/types";

export default function AudioSourcePicker() {
  const { currentAudioSource, setAudioSource, recordingStatus } = useAppStore();
  const disabled = recordingStatus !== "idle";

  const sources: { value: AudioSource; label: string; icon: React.ReactNode }[] = [
    { value: "microphone", label: "Microphone", icon: <Mic size={13} /> },
    { value: "system_audio", label: "System Audio", icon: <Monitor size={13} /> },
  ];

  return (
    <div className={`flex items-center rounded-full border border-border-subtle bg-white/[0.03] backdrop-blur-sm p-0.5 ${disabled ? "opacity-40" : ""}`}>
      {sources.map((source) => {
        const isActive = currentAudioSource === source.value;
        return (
          <button
            key={source.value}
            onClick={() => !disabled && setAudioSource(source.value)}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer ${
              isActive
                ? "bg-accent/15 text-accent shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            {source.icon}
            <span>{source.label}</span>
          </button>
        );
      })}
    </div>
  );
}
