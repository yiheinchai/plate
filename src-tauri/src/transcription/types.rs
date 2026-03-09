use serde::{Deserialize, Serialize};

/// A single timed segment within a transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    /// Start time in milliseconds.
    pub start_ms: i64,
    /// End time in milliseconds.
    pub end_ms: i64,
    /// The transcribed text for this segment.
    pub text: String,
}

/// Full transcription result returned by a transcription engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    /// The complete transcribed text.
    pub full_text: String,
    /// Individual timed segments.
    pub segments: Vec<TranscriptSegment>,
    /// Language code (e.g. "en").
    pub language: String,
    /// Which engine produced this result.
    pub engine: String,
    /// Which model was used (e.g. "ggml-base.en", "whisper-1").
    pub model: Option<String>,
}

/// Configuration for a transcription request.
#[derive(Debug, Clone, Deserialize)]
pub struct TranscriptionConfig {
    /// Path to the audio file to transcribe.
    pub audio_path: String,
    /// Which engine to use: "local" or "api".
    pub engine: String,
    /// Language hint (ISO 639-1 code). Defaults to "en".
    pub language: Option<String>,
    /// Model name override (e.g. "ggml-base.en" for local, "whisper-1" for API).
    pub model: Option<String>,
}

/// Available Whisper model sizes for local transcription.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub downloaded: bool,
}
