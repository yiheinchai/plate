import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-full w-full bg-bg-primary relative noise">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative z-10">
        {/* macOS title bar drag region */}
        <div className="h-9 shrink-0" data-tauri-drag-region />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
