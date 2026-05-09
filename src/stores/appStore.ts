import { create } from "zustand";
import type { AudioSource, RecordingStatus } from "../lib/types";

interface AppState {
  // Recording state
  recordingStatus: RecordingStatus;
  currentAudioSource: AudioSource;
  audioLevel: number;
  currentRecordingId: string | null;
  recordingStartTime: number | null;
  elapsedMs: number;
  continuingRecordingId: string | null;
  continuingRecordingTitle: string | null;

  // Warnings
  recordingWarning: string | null;

  // Sidebar
  sidebarExpanded: boolean;

  // Actions
  setRecordingStatus: (status: RecordingStatus) => void;
  setAudioSource: (source: AudioSource) => void;
  setAudioLevel: (level: number) => void;
  setCurrentRecordingId: (id: string | null) => void;
  setRecordingStartTime: (time: number | null) => void;
  setElapsedMs: (ms: number) => void;
  setContinuingRecording: (id: string | null, title: string | null) => void;
  setRecordingWarning: (warning: string | null) => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  recordingStatus: "idle",
  currentAudioSource: "microphone",
  audioLevel: 0,
  currentRecordingId: null,
  recordingStartTime: null,
  elapsedMs: 0,
  continuingRecordingId: null,
  continuingRecordingTitle: null,
  recordingWarning: null,
  sidebarExpanded: false,

  setRecordingStatus: (status) => set({ recordingStatus: status }),
  setAudioSource: (source) => set({ currentAudioSource: source }),
  setAudioLevel: (level) => set({ audioLevel: level }),
  setCurrentRecordingId: (id) => set({ currentRecordingId: id }),
  setRecordingStartTime: (time) => set({ recordingStartTime: time }),
  setElapsedMs: (ms) => set({ elapsedMs: ms }),
  setContinuingRecording: (id, title) => set({ continuingRecordingId: id, continuingRecordingTitle: title }),
  setRecordingWarning: (warning) => set({ recordingWarning: warning }),
  toggleSidebar: () =>
    set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
}));
