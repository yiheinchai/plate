import { useLocation, useNavigate } from "react-router-dom";
import { Mic, Library, Settings } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: "/", label: "Record", icon: <Mic size={18} /> },
  { path: "/library", label: "Library", icon: <Library size={18} /> },
  { path: "/settings", label: "Settings", icon: <Settings size={18} /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { recordingStatus } = useAppStore();

  return (
    <aside className="flex flex-col items-center w-[52px] h-full bg-bg-sidebar/80 backdrop-blur-xl border-r border-border-subtle relative z-10">
      {/* macOS drag region */}
      <div className="h-9 w-full shrink-0" data-tauri-drag-region />

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-1 pt-2 flex-1 w-full px-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isRecord = item.path === "/";
          const isRecording = isRecord && recordingStatus === "recording";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-accent/12 text-accent shadow-[0_0_12px_rgba(99,102,241,0.12)]"
                  : "text-text-muted hover:text-text-secondary hover:bg-white/[0.04]"
              }`}
              title={item.label}
            >
              <span className="relative z-10">
                {item.icon}
                {isRecording && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-record border-2 border-bg-sidebar">
                    <span className="absolute inset-0 rounded-full bg-record animate-ping opacity-40" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom glow line */}
      <div className="w-6 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent mb-4" />
    </aside>
  );
}
