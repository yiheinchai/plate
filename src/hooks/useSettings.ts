import { useState, useCallback, useEffect } from "react";
import * as tauri from "../lib/tauri";
import type { Settings } from "../lib/types";

const defaultSettings: Settings = {
  llm_auth_mode: "api_key",
  llm_session_token: "",
  llm_api_key: "",
  llm_model: "claude-sonnet-4-20250514",
  transcription_engine: "whisper_local",
  whisper_model: "base",
  openai_api_key: "",
  audio_sample_rate: 16000,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await tauri.getSettings();
      setSettings(s);
    } catch (err) {
      console.error("Failed to load settings:", err);
      // Use defaults if settings haven't been saved yet
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: Settings) => {
    setIsSaving(true);
    setError(null);
    try {
      await tauri.updateSettings(newSettings);
      setSettings(newSettings);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateField = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    loadSettings,
    saveSettings,
    updateField,
  };
}
