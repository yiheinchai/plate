export interface Recording {
  id: string;
  title: string;
  source_type: "microphone" | "system_audio" | "imported";
  file_path: string;
  duration_ms: number | null;
  sample_rate: number;
  created_at: string;
  file_size: number | null;
  starred: boolean;
}

export interface Transcript {
  id: string;
  recording_id: string;
  engine: string;
  model: string | null;
  language: string;
  full_text: string;
  created_at: string;
  segments: TranscriptSegment[];
}

export interface TranscriptSegment {
  id: number;
  transcript_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Note {
  id: string;
  transcript_id: string;
  title: string;
  content: string;
  provider: string;
  model: string;
  prompt_style: string;
  created_at: string;
}

export interface Bookmark {
  id: string;
  recording_id: string;
  timestamp_ms: number;
  label: string | null;
  created_at: string;
}

export type AudioSource = "microphone" | "system_audio";
export type RecordingStatus = "idle" | "recording" | "paused";

export interface Settings {
  llm_auth_mode: "session_token" | "api_key" | "g4f";
  llm_session_token: string;
  llm_organization_id: string;
  llm_api_key: string;
  llm_model: string;
  g4f_url: string;
  transcription_engine: "whisper_local" | "whisper_api";
  whisper_model: string;
  openai_api_key: string;
  audio_sample_rate: number;
  default_prompt_style: string;
  default_custom_prompt: string;
  auto_transcribe: boolean;
  auto_generate_notes: boolean;
  transcription_language: string;
}

export interface SavedPrompt {
  id: string;
  name: string;
  prompt_text: string;
  created_at: string;
}

export interface SearchResult {
  kind: "recording" | "transcript" | "note";
  recording_id: string;
  recording_title: string;
  snippet: string;
  note_title: string | null;
  note_id: string | null;
}

export interface AudioLevelPayload {
  level: number;
}

export interface TranscriptChunkPayload {
  text: string;
  is_final: boolean;
}

export interface RecordingCompletePayload {
  recording: Recording;
}

export interface WhisperModelInfo {
  name: string;
  size_bytes: number;
  downloaded: boolean;
}

export interface TranscriptionProgressPayload {
  progress: number;
}

export interface ModelDownloadProgressPayload {
  model: string;
  downloaded?: number;
  total?: number;
  status: "downloading" | "complete" | "error";
  error?: string;
}
