import { useMemo } from "react";
import { useAppStore } from "../../stores/appStore";

const RING_BARS = 64;
const RADIUS = 72;

export default function WaveformVisualizer() {
  const { audioLevel, recordingStatus } = useAppStore();
  const isActive = recordingStatus === "recording";

  const bars = useMemo(() => {
    return Array.from({ length: RING_BARS }, (_, i) => {
      if (!isActive || audioLevel === 0) {
        return 0.08;
      }
      const phase = (i / RING_BARS) * Math.PI * 2;
      const wave1 = Math.sin(phase * 3 + audioLevel * 15) * 0.3;
      const wave2 = Math.sin(phase * 5 + audioLevel * 8) * 0.15;
      const base = audioLevel * 0.8;
      return Math.max(0.08, Math.min(1, base + wave1 + wave2));
    });
  }, [audioLevel, isActive]);

  return (
    <div className="relative w-[220px] h-[220px]">
      {/* Outer ambient glow */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle, rgba(99,102,241,${0.06 + audioLevel * 0.12}) 0%, transparent 70%)`,
            transform: `scale(${1.4 + audioLevel * 0.3})`,
          }}
        />
      )}

      {/* Circular waveform */}
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {bars.map((height, i) => {
          const angle = (i / RING_BARS) * Math.PI * 2 - Math.PI / 2;
          const barLen = 4 + height * 24;
          const innerR = RADIUS - barLen / 2;
          const outerR = RADIUS + barLen / 2;
          const x1 = 100 + Math.cos(angle) * innerR;
          const y1 = 100 + Math.sin(angle) * innerR;
          const x2 = 100 + Math.cos(angle) * outerR;
          const y2 = 100 + Math.sin(angle) * outerR;

          const opacity = isActive ? 0.3 + height * 0.7 : 0.12;
          const color = isActive
            ? `rgba(99, 102, 241, ${opacity})`
            : `rgba(255, 255, 255, ${opacity})`;

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{ transition: "all 0.08s ease-out" }}
            />
          );
        })}
      </svg>
    </div>
  );
}
