import { useLocation, useNavigate } from "react-router-dom";
import { Mic, Library, Settings } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: "/", label: "Record", icon: <Mic size={20} /> },
  { path: "/library", label: "Library", icon: <Library size={20} /> },
  { path: "/settings", label: "Settings", icon: <Settings size={20} /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { recordingStatus } = useAppStore();

  return (
    <aside className="flex flex-col items-center w-12 h-full bg-bg-sidebar">
      {/* macOS drag region */}
      <div className="h-9 w-full shrink-0" data-tauri-drag-region />

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-0.5 pt-1 flex-1 w-full">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isRecord = item.path === "/";
          const isRecording = isRecord && recordingStatus === "recording";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex items-center justify-center w-12 h-12 transition-colors cursor-pointer ${
                isActive
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              title={item.label}
            >
              {/* Active indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent rounded-r-sm" />
              )}

              <span className="relative">
                {item.icon}
                {isRecording && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-record" />
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
