import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, Check, Loader2, RefreshCw } from "lucide-react";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; body?: string }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "up-to-date" }
  | { status: "error"; message: string };

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  // Check on mount
  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    setState({ status: "checking" });
    try {
      const update = await check();
      if (update) {
        setState({
          status: "available",
          version: update.version,
          body: update.body ?? undefined,
        });
      } else {
        setState({ status: "up-to-date" });
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to check for updates",
      });
    }
  };

  const installUpdate = async () => {
    setState({ status: "downloading", progress: 0 });
    try {
      const update = await check();
      if (!update) return;

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = (event.data as { contentLength?: number }).contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += (event.data as { chunkLength: number }).chunkLength;
          if (totalBytes > 0) {
            setState({
              status: "downloading",
              progress: Math.round((downloadedBytes / totalBytes) * 100),
            });
          }
        } else if (event.event === "Finished") {
          setState({ status: "installing" });
        }
      });

      await relaunch();
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to install update",
      });
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        Updates
      </h2>
      <div className="bg-bg-card border border-border-subtle rounded p-3">
        {state.status === "idle" || state.status === "checking" ? (
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-text-muted" />
            <span className="text-[12px] text-text-muted">Checking for updates...</span>
          </div>
        ) : state.status === "up-to-date" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={13} className="text-success" />
              <span className="text-[12px] text-text-secondary">You're up to date</span>
            </div>
            <button
              onClick={checkForUpdate}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RefreshCw size={10} />
              Check again
            </button>
          </div>
        ) : state.status === "available" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-text-primary">
                Version <strong>{state.version}</strong> available
              </span>
              <button
                onClick={installUpdate}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
              >
                <Download size={11} />
                Update now
              </button>
            </div>
            {state.body && (
              <p className="text-[11px] text-text-muted line-clamp-3">{state.body}</p>
            )}
          </div>
        ) : state.status === "downloading" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-text-secondary">Downloading update...</span>
              <span className="text-[11px] text-text-muted">{state.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        ) : state.status === "installing" ? (
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="text-[12px] text-text-secondary">Installing update, restarting...</span>
          </div>
        ) : state.status === "error" ? (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-text-muted">{state.message}</span>
            <button
              onClick={checkForUpdate}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RefreshCw size={10} />
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
