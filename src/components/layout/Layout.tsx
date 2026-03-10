import { useEffect, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useRecording } from "../../hooks/useRecording";
import { useAppStore } from "../../stores/appStore";
import * as tauri from "../../lib/tauri";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recordingStatus, startRecording, stopRecording, elapsedMs } = useRecording();
  const { currentRecordingId } = useAppStore();

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Space on Record page: toggle recording
      if (e.code === "Space" && location.pathname === "/") {
        e.preventDefault();
        if (recordingStatus === "idle") {
          await startRecording();
        } else {
          const recording = await stopRecording();
          navigate("/library", {
            state: { selectRecordingId: recording.id, autoTranscribe: true },
          });
        }
        return;
      }

      // B key: add bookmark while recording
      if (e.code === "KeyB" && !e.metaKey && !e.ctrlKey && recordingStatus !== "idle" && currentRecordingId) {
        e.preventDefault();
        tauri.addBookmark(currentRecordingId, elapsedMs).catch(console.error);
        return;
      }

      // Cmd+Shift+R: toggle recording from any page
      if (e.code === "KeyR" && e.metaKey && e.shiftKey) {
        e.preventDefault();
        if (recordingStatus === "idle") {
          if (location.pathname !== "/") navigate("/");
          await startRecording();
        } else {
          const recording = await stopRecording();
          navigate("/library", {
            state: { selectRecordingId: recording.id, autoTranscribe: true },
          });
        }
      }
    },
    [recordingStatus, startRecording, stopRecording, navigate, location.pathname, currentRecordingId, elapsedMs]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
