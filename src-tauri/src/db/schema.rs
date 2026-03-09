use serde::{Deserialize, Serialize};

/// SQL statements for creating the database schema.
pub const CREATE_TABLES_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    duration_ms INTEGER,
    sample_rate INTEGER NOT NULL DEFAULT 16000,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    file_size INTEGER
);

CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    engine TEXT NOT NULL,
    model TEXT,
    language TEXT DEFAULT 'en',
    full_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_style TEXT NOT NULL DEFAULT 'memorization',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

// ----- Row types for reading from the database -----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingRow {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub file_path: String,
    pub duration_ms: Option<i64>,
    pub sample_rate: i64,
    pub created_at: String,
    pub file_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptRow {
    pub id: String,
    pub recording_id: String,
    pub engine: String,
    pub model: Option<String>,
    pub language: Option<String>,
    pub full_text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegmentRow {
    pub id: i64,
    pub transcript_id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteRow {
    pub id: String,
    pub transcript_id: String,
    pub title: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub prompt_style: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

/// In-memory cache of frequently accessed settings.
#[derive(Debug, Clone, Default)]
pub struct SettingsCache {
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub claude_session_key: Option<String>,
    pub claude_organization_id: Option<String>,
    pub default_transcription_engine: Option<String>,
    pub default_whisper_model: Option<String>,
    pub default_llm_provider: Option<String>,
    pub default_prompt_style: Option<String>,
}

impl SettingsCache {
    /// Update the cache from a key-value pair.
    pub fn set(&mut self, key: &str, value: &str) {
        let val = Some(value.to_string());
        match key {
            "openai_api_key" => self.openai_api_key = val,
            "anthropic_api_key" => self.anthropic_api_key = val,
            "claude_session_key" => self.claude_session_key = val,
            "claude_organization_id" => self.claude_organization_id = val,
            "default_transcription_engine" => self.default_transcription_engine = val,
            "default_whisper_model" => self.default_whisper_model = val,
            "default_llm_provider" => self.default_llm_provider = val,
            "default_prompt_style" => self.default_prompt_style = val,
            _ => {}
        }
    }
}
