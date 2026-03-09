import { useState, useCallback, useEffect, useRef } from "react";
import * as tauri from "../lib/tauri";
import type { Settings } from "../lib/types";

const defaultSettings: Settings = {
  llm_auth_mode: "g4f",
  llm_session_token: "",
  llm_organization_id: "",
  llm_api_key: "",
  llm_model: "openai",
  g4f_url: "",
  transcription_engine: "whisper_local",
  whisper_model: "ggml-base.en",
  openai_api_key: "",
  audio_sample_rate: 16000,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await tauri.getSettings();
      setSettings(s);
    } catch (err) {
      console.error("Failed to load settings:", err);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
      loadedRef.current = true;
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: Settings) => {
    setIsSaving(true);
    setError(null);
    try {
      await tauri.updateSettings(newSettings);
      setSettings(newSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
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

  // Auto-save on change (debounced 500ms), skip the initial load
  useEffect(() => {
    if (!loadedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveSettings(settings);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, saveSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    saved,
    error,
    loadSettings,
    updateField,
  };
}
