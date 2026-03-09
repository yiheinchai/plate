import SettingsPanel from "../components/settings/SettingsPage";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0 bg-bg-card">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Settings</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="max-w-lg">
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}
