use serde::{Deserialize, Serialize};

/// Parameters for inserting a new transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertTranscript {
    pub id: String,
    pub recording_id: String,
    pub engine: String,
    pub model: Option<String>,
    pub language: String,
    pub full_text: String,
}

/// Parameters for inserting a transcript segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertSegment {
    pub transcript_id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

pub const INSERT_TRANSCRIPT_SQL: &str = r#"
INSERT INTO transcripts (id, recording_id, engine, model, language, full_text)
VALUES (?1, ?2, ?3, ?4, ?5, ?6)
"#;

pub const INSERT_SEGMENT_SQL: &str = r#"
INSERT INTO transcript_segments (transcript_id, start_ms, end_ms, text)
VALUES (?1, ?2, ?3, ?4)
"#;

pub const SELECT_TRANSCRIPTS_BY_RECORDING_SQL: &str = r#"
SELECT id, recording_id, engine, model, language, full_text, created_at
FROM transcripts
WHERE recording_id = ?1
ORDER BY created_at DESC
"#;

pub const SELECT_TRANSCRIPT_BY_ID_SQL: &str = r#"
SELECT id, recording_id, engine, model, language, full_text, created_at
FROM transcripts
WHERE id = ?1
"#;

pub const SELECT_SEGMENTS_BY_TRANSCRIPT_SQL: &str = r#"
SELECT id, transcript_id, start_ms, end_ms, text
FROM transcript_segments
WHERE transcript_id = ?1
ORDER BY start_ms ASC
"#;

pub const SELECT_ALL_TRANSCRIPTS_SQL: &str = r#"
SELECT id, recording_id, engine, model, language, full_text, created_at
FROM transcripts
ORDER BY created_at DESC
"#;

pub const DELETE_TRANSCRIPT_SQL: &str = "DELETE FROM transcripts WHERE id = ?1";
