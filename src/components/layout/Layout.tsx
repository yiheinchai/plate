import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-full w-full bg-bg-primary">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Drag region for macOS title bar */}
        <div className="h-12 shrink-0" data-tauri-drag-region />
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
