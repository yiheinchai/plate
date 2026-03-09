import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-full w-full bg-bg-primary">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col border-l border-border-subtle">
        {/* macOS title bar drag region */}
        <div className="h-9 shrink-0 bg-bg-sidebar" data-tauri-drag-region />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
