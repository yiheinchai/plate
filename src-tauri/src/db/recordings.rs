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

/// SQL for selecting all non-deleted recordings ordered by creation date.
pub const SELECT_ALL_RECORDINGS_SQL: &str = r#"
SELECT id, title, source_type, file_path, duration_ms, sample_rate, created_at, file_size, starred, last_position_ms, deleted_at
FROM recordings
WHERE deleted_at IS NULL
ORDER BY created_at DESC
"#;

/// SQL for selecting a single recording by ID.
pub const SELECT_RECORDING_BY_ID_SQL: &str = r#"
SELECT id, title, source_type, file_path, duration_ms, sample_rate, created_at, file_size, starred, last_position_ms, deleted_at
FROM recordings
WHERE id = ?1
"#;

/// SQL for selecting all soft-deleted recordings.
pub const SELECT_DELETED_RECORDINGS_SQL: &str = r#"
SELECT id, title, source_type, file_path, duration_ms, sample_rate, created_at, file_size, starred, last_position_ms, deleted_at
FROM recordings
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC
"#;

/// SQL for toggling the starred status of a recording.
pub const TOGGLE_STAR_SQL: &str = "UPDATE recordings SET starred = CASE WHEN starred = 0 THEN 1 ELSE 0 END WHERE id = ?1";

/// SQL for updating the playback position.
pub const UPDATE_POSITION_SQL: &str = "UPDATE recordings SET last_position_ms = ?2 WHERE id = ?1";

/// SQL for soft-deleting a recording (moves to trash).
pub const SOFT_DELETE_RECORDING_SQL: &str = "UPDATE recordings SET deleted_at = datetime('now') WHERE id = ?1";

/// SQL for restoring a soft-deleted recording.
pub const RESTORE_RECORDING_SQL: &str = "UPDATE recordings SET deleted_at = NULL WHERE id = ?1";

/// SQL for permanently deleting a recording.
pub const HARD_DELETE_RECORDING_SQL: &str = "DELETE FROM recordings WHERE id = ?1";

/// SQL for updating the title of a recording.
pub const UPDATE_RECORDING_TITLE_SQL: &str = "UPDATE recordings SET title = ?2 WHERE id = ?1";

/// SQL for updating duration and file size after continuing a recording.
pub const UPDATE_RECORDING_DURATION_SQL: &str = "UPDATE recordings SET duration_ms = ?2, file_size = ?3 WHERE id = ?1";
