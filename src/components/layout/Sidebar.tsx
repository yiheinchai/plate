import { useLocation, useNavigate } from "react-router-dom";
import { Mic, Library, FileText, Settings } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: "/", label: "Record", icon: <Mic size={18} /> },
  { path: "/library", label: "Library", icon: <Library size={18} /> },
  { path: "/notes", label: "Notes", icon: <FileText size={18} /> },
  { path: "/settings", label: "Settings", icon: <Settings size={18} /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { recordingStatus } = useAppStore();

  return (
    <aside className="flex flex-col items-center w-[68px] h-full bg-bg-sidebar border-r border-border-subtle">
      {/* Drag region for macOS title bar */}
      <div className="h-12 w-full shrink-0" data-tauri-drag-region />

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-1 px-2 flex-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isRecord = item.path === "/";
          const isRecording = isRecord && recordingStatus === "recording";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-xl text-sm transition-all duration-150 cursor-pointer group ${
                isActive
                  ? "bg-white/[0.08] text-text-primary"
                  : "text-text-muted hover:bg-white/[0.04] hover:text-text-secondary"
              }`}
              title={item.label}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-r-full" />
              )}

              <span className="relative">
                {item.icon}
                {/* Recording pulse dot */}
                {isRecording && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-record animate-pulse" />
                )}
              </span>

              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2.5 py-1 bg-bg-elevated text-text-primary text-xs font-medium rounded-md border border-border-subtle shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
