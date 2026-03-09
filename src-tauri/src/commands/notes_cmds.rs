use rusqlite::params;
use tauri::State;
use tracing::info;

use crate::db::notes;
use crate::db::schema::{NoteRow, TranscriptRow};
use crate::db::transcripts;
use crate::llm::note_generator;
use crate::llm::types::{LlmProviderType, NoteGenerationRequest};
use crate::state::AppState;

/// Generate notes from a transcript by its ID. Looks up the transcript,
/// calls the LLM, saves the note to DB, and returns it.
#[tauri::command]
pub async fn generate_notes(
    state: State<'_, AppState>,
    transcript_id: String,
    prompt_style: Option<String>,
    custom_prompt: Option<String>,
) -> Result<NoteRow, String> {
    let db_path = state.db_path.clone();

    // Look up the transcript from DB.
    let transcript: TranscriptRow = {
        let db = db_path.clone();
        let tid = transcript_id.clone();
        tokio::task::spawn_blocking(move || -> Result<TranscriptRow, String> {
            let conn = rusqlite::Connection::open(&db)
                .map_err(|e| format!("Failed to open database: {}", e))?;
            conn.query_row(
                transcripts::SELECT_TRANSCRIPT_BY_ID_SQL,
                params![tid],
                |row| {
                    Ok(TranscriptRow {
                        id: row.get(0)?,
                        recording_id: row.get(1)?,
                        engine: row.get(2)?,
                        model: row.get(3)?,
                        language: row.get(4)?,
                        full_text: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| format!("Transcript not found: {}", e))
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??
    };

    // Read settings for LLM configuration.
    let settings = state.settings.read().await;
    let llm_provider_str = settings
        .default_llm_provider
        .clone()
        .unwrap_or_else(|| "claude_api".to_string());
    let prompt_style = prompt_style
        .or_else(|| settings.default_prompt_style.clone())
        .unwrap_or_else(|| "summary".to_string());
    let api_key = settings.anthropic_api_key.clone();
    let session_key = settings.claude_session_key.clone();
    let g4f_url = settings.g4f_url.clone();
    drop(settings);

    info!(
        "generate_notes: provider={}, session_key={}, api_key={}",
        llm_provider_str,
        session_key.as_deref().map(|s| if s.is_empty() { "empty" } else { "set" }).unwrap_or("none"),
        api_key.as_deref().map(|s| if s.is_empty() { "empty" } else { "set" }).unwrap_or("none"),
    );

    let provider_type = match llm_provider_str.as_str() {
        "claude_api" => LlmProviderType::ClaudeApi,
        "claude_session" => LlmProviderType::ClaudeSession,
        "g4f" => LlmProviderType::G4f,
        _ => LlmProviderType::ClaudeApi,
    };

    let request = NoteGenerationRequest {
        transcript_id: transcript.id.clone(),
        transcript_text: transcript.full_text.clone(),
        prompt_style: prompt_style.clone(),
        custom_prompt,
        provider: provider_type,
        model: None,
    };

    let result = tokio::task::spawn_blocking(move || {
        note_generator::generate_notes(
            &request,
            api_key.as_deref(),
            session_key.as_deref(),
            g4f_url.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to generate notes: {:#}", e))?;

    // Save note to DB.
    let note_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let db = db_path.clone();
    let nid = note_id.clone();
    let tid = transcript_id.clone();
    let note_title = result.title.clone();
    let note_content = result.content.clone();
    let note_provider = result.provider.clone();
    let note_model = result.model.clone();
    let note_style = result.prompt_style.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(
            notes::INSERT_NOTE_SQL,
            params![nid, tid, note_title, note_content, note_provider, note_model, note_style],
        )
        .map_err(|e| format!("Failed to insert note: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    info!("Note generated and saved: {}", note_id);

    Ok(NoteRow {
        id: note_id,
        transcript_id,
        title: result.title,
        content: result.content,
        provider: result.provider,
        model: result.model,
        prompt_style: result.prompt_style,
        created_at,
    })
}

/// Get a single note by ID.
#[tauri::command]
pub async fn get_note(state: State<'_, AppState>, id: String) -> Result<NoteRow, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<NoteRow, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.query_row(notes::SELECT_NOTE_BY_ID_SQL, params![id], |row| {
            Ok(NoteRow {
                id: row.get(0)?,
                transcript_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                provider: row.get(4)?,
                model: row.get(5)?,
                prompt_style: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Note not found: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// List all notes, optionally filtered by transcript_id.
#[tauri::command]
pub async fn list_notes(
    state: State<'_, AppState>,
    transcript_id: Option<String>,
) -> Result<Vec<NoteRow>, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<Vec<NoteRow>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let sql = if transcript_id.is_some() {
            notes::SELECT_NOTES_BY_TRANSCRIPT_SQL
        } else {
            notes::SELECT_ALL_NOTES_SQL
        };

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows: Vec<NoteRow> = if let Some(ref tid) = transcript_id {
            stmt.query_map(params![tid], |row| {
                Ok(NoteRow {
                    id: row.get(0)?,
                    transcript_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    provider: row.get(4)?,
                    model: row.get(5)?,
                    prompt_style: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query notes: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read note rows: {}", e))?
        } else {
            stmt.query_map([], |row| {
                Ok(NoteRow {
                    id: row.get(0)?,
                    transcript_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    provider: row.get(4)?,
                    model: row.get(5)?,
                    prompt_style: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query notes: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read note rows: {}", e))?
        };

        Ok(rows)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Delete a note by ID.
#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(notes::DELETE_NOTE_SQL, params![id])
            .map_err(|e| format!("Failed to delete note: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Saved Prompts ───

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SavedPrompt {
    pub id: String,
    pub name: String,
    pub prompt_text: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_saved_prompts(state: State<'_, AppState>) -> Result<Vec<SavedPrompt>, String> {
    let db_path = state.db_path.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<SavedPrompt>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT id, name, prompt_text, created_at FROM saved_prompts ORDER BY created_at DESC")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SavedPrompt {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    prompt_text: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("Failed to query prompts: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read prompt rows: {}", e))?;
        Ok(rows)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn save_prompt(
    state: State<'_, AppState>,
    name: String,
    prompt_text: String,
) -> Result<SavedPrompt, String> {
    let db_path = state.db_path.clone();
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let prompt = SavedPrompt {
        id: id.clone(),
        name,
        prompt_text,
        created_at,
    };
    let p = prompt.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(
            "INSERT INTO saved_prompts (id, name, prompt_text, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![p.id, p.name, p.prompt_text, p.created_at],
        )
        .map_err(|e| format!("Failed to save prompt: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(prompt)
}

#[tauri::command]
pub async fn delete_saved_prompt(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db_path = state.db_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute("DELETE FROM saved_prompts WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete prompt: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
