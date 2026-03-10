use serde::{Deserialize, Serialize};

/// Parameters for inserting a new recording.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertRecording {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub file_path: String,
    pub duration_ms: Option<i64>,
    pub sample_rate: i64,
    pub file_size: Option<i64>,
}

/// SQL for inserting a recording.
pub const INSERT_RECORDING_SQL: &str = r#"
INSERT INTO recordings (id, title, source_type, file_path, duration_ms, sample_rate, file_size)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
"#;

/// SQL for selecting all recordings ordered by creation date.
pub const SELECT_ALL_RECORDINGS_SQL: &str = r#"
SELECT id, title, source_type, file_path, duration_ms, sample_rate, created_at, file_size, starred
FROM recordings
ORDER BY created_at DESC
"#;

/// SQL for selecting a single recording by ID.
pub const SELECT_RECORDING_BY_ID_SQL: &str = r#"
SELECT id, title, source_type, file_path, duration_ms, sample_rate, created_at, file_size, starred
FROM recordings
WHERE id = ?1
"#;

/// SQL for toggling the starred status of a recording.
pub const TOGGLE_STAR_SQL: &str = "UPDATE recordings SET starred = CASE WHEN starred = 0 THEN 1 ELSE 0 END WHERE id = ?1";

/// SQL for deleting a recording.
pub const DELETE_RECORDING_SQL: &str = "DELETE FROM recordings WHERE id = ?1";

/// SQL for updating the title of a recording.
pub const UPDATE_RECORDING_TITLE_SQL: &str = "UPDATE recordings SET title = ?2 WHERE id = ?1";
