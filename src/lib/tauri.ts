import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Recording,
  Transcript,
  Note,
  Bookmark,
  Settings,
  SavedPrompt,
  AudioSource,
  AudioLevelPayload,
  TranscriptChunkPayload,
  RecordingCompletePayload,
  ModelDownloadProgressPayload,
  TranscriptionProgressPayload,
  WhisperModelInfo,
  SearchResult,
} from "./types";

// ─── Recording Commands ───

export async function startRecording(source: AudioSource): Promise<string> {
  return invoke<string>("start_recording", { source });
}

export async function stopRecording(): Promise<Recording> {
  return invoke<Recording>("stop_recording");
}

export async function pauseRecording(): Promise<void> {
  return invoke<void>("pause_recording");
}

export async function resumeRecording(): Promise<void> {
  return invoke<void>("resume_recording");
}

export async function listRecordings(): Promise<Recording[]> {
  return invoke<Recording[]>("list_recordings");
}

export async function getRecording(id: string): Promise<Recording> {
  return invoke<Recording>("get_recording", { id });
}

export async function deleteRecording(id: string): Promise<void> {
  return invoke<void>("delete_recording", { id });
}

export async function renameRecording(id: string, title: string): Promise<void> {
  return invoke<void>("rename_recording", { id, title });
}

export async function exportRecording(id: string): Promise<string> {
  return invoke<string>("export_recording", { id });
}

export async function importAudio(filePath: string): Promise<Recording> {
  return invoke<Recording>("import_audio", { filePath });
}

export async function toggleStar(id: string): Promise<boolean> {
  return invoke<boolean>("toggle_star", { id });
}

export async function getPlayableAudioUrl(id: string): Promise<string> {
  const path = await invoke<string>("get_playable_audio", { id });
  return convertFileSrc(path);
}

// ─── Transcript Commands ───

export async function transcribeRecording(
  recordingId: string
): Promise<Transcript> {
  return invoke<Transcript>("transcribe_recording", { recordingId });
}

export async function getTranscript(id: string): Promise<Transcript> {
  return invoke<Transcript>("get_transcript", { id });
}

export async function listTranscripts(
  recordingId?: string
): Promise<Transcript[]> {
  return invoke<Transcript[]>("list_transcripts", { recordingId });
}

export async function updateSegmentText(
  segmentId: number,
  transcriptId: string,
  text: string
): Promise<void> {
  return invoke<void>("update_segment_text", { segmentId, transcriptId, text });
}

// ─── Notes Commands ───

export async function generateNotes(
  transcriptId: string,
  promptStyle?: string,
  customPrompt?: string
): Promise<Note> {
  return invoke<Note>("generate_notes", {
    transcriptId,
    promptStyle,
    customPrompt,
  });
}

export async function listSavedPrompts(): Promise<SavedPrompt[]> {
  return invoke<SavedPrompt[]>("list_saved_prompts");
}

export async function savePrompt(
  name: string,
  promptText: string
): Promise<SavedPrompt> {
  return invoke<SavedPrompt>("save_prompt", { name, promptText });
}

export async function deleteSavedPrompt(id: string): Promise<void> {
  return invoke<void>("delete_saved_prompt", { id });
}

export async function getNote(id: string): Promise<Note> {
  return invoke<Note>("get_note", { id });
}

export async function listNotes(transcriptId?: string): Promise<Note[]> {
  return invoke<Note[]>("list_notes", { transcriptId });
}

export async function deleteNote(id: string): Promise<void> {
  return invoke<void>("delete_note", { id });
}

// ─── Bookmark Commands ───

export async function addBookmark(
  recordingId: string,
  timestampMs: number,
  label?: string
): Promise<Bookmark> {
  return invoke<Bookmark>("add_bookmark", { recordingId, timestampMs, label });
}

export async function listBookmarks(recordingId: string): Promise<Bookmark[]> {
  return invoke<Bookmark[]>("list_bookmarks", { recordingId });
}

export async function deleteBookmark(id: string): Promise<void> {
  return invoke<void>("delete_bookmark", { id });
}

export async function updateBookmarkLabel(id: string, label: string): Promise<void> {
  return invoke<void>("update_bookmark_label", { id, label });
}

// ─── Search Commands ───

export async function search(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search", { query });
}

// ─── Settings Commands ───

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke<void>("update_settings", { settings });
}

// ─── Model Commands ───

export async function listWhisperModels(): Promise<WhisperModelInfo[]> {
  return invoke<WhisperModelInfo[]>("list_whisper_models");
}

// ─── Event Listeners ───

export function onAudioLevel(
  callback: (level: number) => void
): Promise<UnlistenFn> {
  return listen<AudioLevelPayload>("audio-level", (event) => {
    callback(event.payload.level);
  });
}

export function onTranscriptChunk(
  callback: (text: string, isFinal: boolean) => void
): Promise<UnlistenFn> {
  return listen<TranscriptChunkPayload>("transcript-chunk", (event) => {
    callback(event.payload.text, event.payload.is_final);
  });
}

export function onRecordingComplete(
  callback: (recording: Recording) => void
): Promise<UnlistenFn> {
  return listen<RecordingCompletePayload>("recording-complete", (event) => {
    callback(event.payload.recording);
  });
}

export function onTranscriptionProgress(
  callback: (progress: number) => void
): Promise<UnlistenFn> {
  return listen<TranscriptionProgressPayload>("transcription-progress", (event) => {
    callback(event.payload.progress);
  });
}

export function onModelDownloadProgress(
  callback: (progress: ModelDownloadProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<ModelDownloadProgressPayload>("model-download-progress", (event) => {
    callback(event.payload);
  });
}
