import { useMemo } from "react";
import { useAppStore } from "../../stores/appStore";

const BAR_COUNT = 40;

export default function WaveformVisualizer() {
  const { audioLevel, recordingStatus } = useAppStore();
  const isActive = recordingStatus === "recording";

  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      if (!isActive || audioLevel === 0) {
        return 0.06;
      }
      const center = BAR_COUNT / 2;
      const distFromCenter = Math.abs(i - center) / center;
      const baseHeight = audioLevel * (1 - distFromCenter * 0.7);
      const variation = Math.sin(i * 0.8 + audioLevel * 12) * 0.12;
      return Math.max(0.06, Math.min(1, baseHeight + variation));
    });
  }, [audioLevel, isActive]);

  return (
    <div className="flex items-center justify-center gap-px h-10">
      {bars.map((height, i) => (
        <div
          key={i}
          className="transition-all duration-75 ease-out"
          style={{
            width: "2px",
            height: `${Math.max(2, height * 36)}px`,
            background: isActive
              ? `rgba(0, 122, 204, ${0.3 + height * 0.7})`
              : "rgba(255, 255, 255, 0.08)",
          }}
        />
      ))}
    </div>
  );
}
