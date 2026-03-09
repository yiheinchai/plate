import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-full w-full bg-bg-primary">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Drag region for macOS title bar */}
        <div className="h-11 shrink-0" data-tauri-drag-region />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="h-full px-6 pb-6 pt-1" style={{ padding: "1rem" }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
