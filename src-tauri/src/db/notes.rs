use serde::{Deserialize, Serialize};

/// Parameters for inserting a new note.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertNote {
    pub id: String,
    pub transcript_id: String,
    pub title: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub prompt_style: String,
}

pub const INSERT_NOTE_SQL: &str = r#"
INSERT INTO notes (id, transcript_id, title, content, provider, model, prompt_style)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
"#;

pub const SELECT_NOTES_BY_TRANSCRIPT_SQL: &str = r#"
SELECT id, transcript_id, title, content, provider, model, prompt_style, created_at
FROM notes
WHERE transcript_id = ?1
ORDER BY created_at DESC
"#;

pub const SELECT_NOTE_BY_ID_SQL: &str = r#"
SELECT id, transcript_id, title, content, provider, model, prompt_style, created_at
FROM notes
WHERE id = ?1
"#;

pub const SELECT_ALL_NOTES_SQL: &str = r#"
SELECT id, transcript_id, title, content, provider, model, prompt_style, created_at
FROM notes
ORDER BY created_at DESC
"#;

pub const DELETE_NOTE_SQL: &str = "DELETE FROM notes WHERE id = ?1";

pub const UPDATE_NOTE_CONTENT_SQL: &str = r#"
UPDATE notes SET title = ?2, content = ?3 WHERE id = ?1
"#;
