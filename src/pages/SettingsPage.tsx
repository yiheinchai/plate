import SettingsPanel from "../components/settings/SettingsPage";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-text-primary tracking-tight">Settings</h1>
      <SettingsPanel />
    </div>
  );
}
