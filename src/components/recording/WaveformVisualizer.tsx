import { useMemo } from "react";
import { useAppStore } from "../../stores/appStore";

const BAR_COUNT = 48;

export default function WaveformVisualizer() {
  const { audioLevel, recordingStatus } = useAppStore();
  const isActive = recordingStatus === "recording";

  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      if (!isActive || audioLevel === 0) {
        return 0.04;
      }
      const center = BAR_COUNT / 2;
      const distFromCenter = Math.abs(i - center) / center;
      const baseHeight = audioLevel * (1 - distFromCenter * 0.7);
      const variation = Math.sin(i * 0.8 + audioLevel * 12) * 0.12;
      return Math.max(0.04, Math.min(1, baseHeight + variation));
    });
  }, [audioLevel, isActive]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-14">
      {bars.map((height, i) => {
        const center = BAR_COUNT / 2;
        const distFromCenter = Math.abs(i - center) / center;

        return (
          <div
            key={i}
            className="rounded-full transition-all duration-100 ease-out"
            style={{
              width: "2.5px",
              height: `${Math.max(3, height * 48)}px`,
              background: isActive
                ? `linear-gradient(to top, rgba(99, 102, 241, ${0.4 + height * 0.6}), rgba(139, 92, 246, ${0.3 + height * 0.7}))`
                : `rgba(63, 63, 70, ${0.2 + (1 - distFromCenter) * 0.2})`,
            }}
          />
        );
      })}
    </div>
  );
}
