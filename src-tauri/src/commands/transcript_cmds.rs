use rusqlite::params;
use tauri::State;
use tracing::info;

use crate::db::recordings;
use crate::db::schema::{RecordingRow, TranscriptRow, TranscriptSegmentRow};
use crate::db::transcripts;
use crate::state::AppState;
use crate::transcription::engine::TranscriptionEngine;
use crate::transcription::model_manager::ModelManager;
use crate::transcription::types::{TranscriptionConfig, TranscriptionResult, WhisperModelInfo};
use crate::transcription::whisper_api::WhisperApi;
use crate::transcription::whisper_local::WhisperLocal;

/// Full transcript response including segments, matching the frontend Transcript type.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TranscriptResponse {
    pub id: String,
    pub recording_id: String,
    pub engine: String,
    pub model: Option<String>,
    pub language: String,
    pub full_text: String,
    pub created_at: String,
    pub segments: Vec<TranscriptSegmentRow>,
}

/// Helper: load a transcript row and its segments from the database.
fn load_transcript_with_segments(
    conn: &rusqlite::Connection,
    transcript_row: &TranscriptRow,
) -> Result<TranscriptResponse, String> {
    let mut seg_stmt = conn
        .prepare(transcripts::SELECT_SEGMENTS_BY_TRANSCRIPT_SQL)
        .map_err(|e| format!("Failed to prepare segments query: {}", e))?;
    let segments = seg_stmt
        .query_map(params![transcript_row.id], |row| {
            Ok(TranscriptSegmentRow {
                id: row.get(0)?,
                transcript_id: row.get(1)?,
                start_ms: row.get(2)?,
                end_ms: row.get(3)?,
                text: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query segments: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read segments: {}", e))?;

    Ok(TranscriptResponse {
        id: transcript_row.id.clone(),
        recording_id: transcript_row.recording_id.clone(),
        engine: transcript_row.engine.clone(),
        model: transcript_row.model.clone(),
        language: transcript_row.language.clone().unwrap_or_else(|| "en".to_string()),
        full_text: transcript_row.full_text.clone(),
        created_at: transcript_row.created_at.clone(),
        segments,
    })
}

/// Transcribe a recording by its ID. Looks up the recording, runs transcription,
/// saves result to DB, and returns the full Transcript.
#[tauri::command]
pub async fn transcribe_recording(
    state: State<'_, AppState>,
    recording_id: String,
) -> Result<TranscriptResponse, String> {
    let db_path = state.db_path.clone();
    let models_dir = state.models_dir();

    // Look up the recording from DB.
    let recording: RecordingRow = {
        let db = db_path.clone();
        let rid = recording_id.clone();
        tokio::task::spawn_blocking(move || -> Result<RecordingRow, String> {
            let conn = rusqlite::Connection::open(&db)
                .map_err(|e| format!("Failed to open database: {}", e))?;
            conn.query_row(recordings::SELECT_RECORDING_BY_ID_SQL, params![rid], |row| {
                Ok(RecordingRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    source_type: row.get(2)?,
                    file_path: row.get(3)?,
                    duration_ms: row.get(4)?,
                    sample_rate: row.get(5)?,
                    created_at: row.get(6)?,
                    file_size: row.get(7)?,
                })
            })
            .map_err(|e| format!("Recording not found: {}", e))
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??
    };

    // Read settings to determine engine and model.
    let settings = state.settings.read().await;
    let engine_name = settings
        .default_transcription_engine
        .clone()
        .unwrap_or_else(|| "local".to_string());
    let whisper_model = settings.default_whisper_model.clone();
    let openai_key = settings.openai_api_key.clone();
    drop(settings);

    let audio_path = recording.file_path.clone();
    let engine_str = engine_name.clone();

    // Map frontend engine names to internal engine names.
    let internal_engine = match engine_str.as_str() {
        "whisper_local" => "local".to_string(),
        "whisper_api" => "api".to_string(),
        other => other.to_string(),
    };

    let config = TranscriptionConfig {
        audio_path,
        engine: internal_engine.clone(),
        language: Some("en".to_string()),
        model: whisper_model.clone(),
    };

    // Run transcription on a blocking thread.
    let transcription_result: TranscriptionResult = {
        let eng = internal_engine.clone();
        let md = models_dir.clone();
        let okey = openai_key.clone();
        tokio::task::spawn_blocking(move || -> Result<TranscriptionResult, String> {
            match eng.as_str() {
                "local" => {
                    let engine = WhisperLocal::new(md);
                    engine.transcribe(&config).map_err(|e| e.to_string())
                }
                "api" => {
                    let api_key = okey.ok_or("OpenAI API key not configured")?;
                    let engine = WhisperApi::new(api_key);
                    engine.transcribe(&config).map_err(|e| e.to_string())
                }
                _ => Err(format!("Unknown transcription engine: {}", eng)),
            }
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??
    };

    // Save transcript and segments to DB.
    let transcript_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let db = db_path.clone();
    let tid = transcript_id.clone();
    let rid = recording_id.clone();
    let tr = transcription_result.clone();

    let segments: Vec<TranscriptSegmentRow> = tokio::task::spawn_blocking(move || -> Result<Vec<TranscriptSegmentRow>, String> {
        let conn = rusqlite::Connection::open(&db)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute(
            transcripts::INSERT_TRANSCRIPT_SQL,
            params![
                tid,
                rid,
                tr.engine,
                tr.model,
                tr.language,
                tr.full_text,
            ],
        )
        .map_err(|e| format!("Failed to insert transcript: {}", e))?;

        // Insert segments.
        let mut segment_rows = Vec::new();
        for seg in &tr.segments {
            conn.execute(
                transcripts::INSERT_SEGMENT_SQL,
                params![tid, seg.start_ms, seg.end_ms, seg.text],
            )
            .map_err(|e| format!("Failed to insert segment: {}", e))?;

            let seg_id = conn.last_insert_rowid();
            segment_rows.push(TranscriptSegmentRow {
                id: seg_id,
                transcript_id: tid.clone(),
                start_ms: seg.start_ms,
                end_ms: seg.end_ms,
                text: seg.text.clone(),
            });
        }

        Ok(segment_rows)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    info!(
        "Transcription complete for recording {}: {} segments",
        recording_id,
        segments.len()
    );

    Ok(TranscriptResponse {
        id: transcript_id,
        recording_id,
        engine: transcription_result.engine,
        model: transcription_result.model,
        language: transcription_result.language,
        full_text: transcription_result.full_text,
        created_at,
        segments,
    })
}

/// Get a single transcript by ID, including its segments.
#[tauri::command]
pub async fn get_transcript(
    state: State<'_, AppState>,
    id: String,
) -> Result<TranscriptResponse, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<TranscriptResponse, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let transcript_row = conn
            .query_row(transcripts::SELECT_TRANSCRIPT_BY_ID_SQL, params![id], |row| {
                Ok(TranscriptRow {
                    id: row.get(0)?,
                    recording_id: row.get(1)?,
                    engine: row.get(2)?,
                    model: row.get(3)?,
                    language: row.get(4)?,
                    full_text: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Transcript not found: {}", e))?;

        load_transcript_with_segments(&conn, &transcript_row)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// List transcripts, optionally filtered by recording ID.
#[tauri::command]
pub async fn list_transcripts(
    state: State<'_, AppState>,
    recording_id: Option<String>,
) -> Result<Vec<TranscriptResponse>, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<Vec<TranscriptResponse>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let transcript_rows: Vec<TranscriptRow> = if let Some(ref rid) = recording_id {
            let mut stmt = conn
                .prepare(transcripts::SELECT_TRANSCRIPTS_BY_RECORDING_SQL)
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let mapped = stmt.query_map(params![rid], |row| {
                Ok(TranscriptRow {
                    id: row.get(0)?,
                    recording_id: row.get(1)?,
                    engine: row.get(2)?,
                    model: row.get(3)?,
                    language: row.get(4)?,
                    full_text: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query transcripts: {}", e))?;
            mapped.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read transcript rows: {}", e))?
        } else {
            let mut stmt = conn
                .prepare(transcripts::SELECT_ALL_TRANSCRIPTS_SQL)
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let mapped = stmt.query_map([], |row| {
                Ok(TranscriptRow {
                    id: row.get(0)?,
                    recording_id: row.get(1)?,
                    engine: row.get(2)?,
                    model: row.get(3)?,
                    language: row.get(4)?,
                    full_text: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query transcripts: {}", e))?;
            mapped.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read transcript rows: {}", e))?
        };

        let mut results = Vec::new();
        for tr in &transcript_rows {
            results.push(load_transcript_with_segments(&conn, tr)?);
        }
        Ok(results)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Transcribe an audio file directly (legacy command).
#[tauri::command]
pub async fn transcribe_audio(
    state: State<'_, AppState>,
    audio_path: String,
    engine: String,
    language: Option<String>,
    model: Option<String>,
) -> Result<TranscriptionResult, String> {
    let config = TranscriptionConfig {
        audio_path,
        engine: engine.clone(),
        language,
        model,
    };

    let models_dir = state.models_dir();
    let settings = state.settings.read().await;
    let openai_key = settings.openai_api_key.clone();
    drop(settings);

    // Run transcription on a blocking thread.
    let result = tokio::task::spawn_blocking(move || -> Result<TranscriptionResult, String> {
        match engine.as_str() {
            "local" => {
                let engine = WhisperLocal::new(models_dir);
                engine.transcribe(&config).map_err(|e| e.to_string())
            }
            "api" => {
                let api_key = openai_key.ok_or("OpenAI API key not configured")?;
                let engine = WhisperApi::new(api_key);
                engine.transcribe(&config).map_err(|e| e.to_string())
            }
            _ => Err(format!("Unknown transcription engine: {}", engine)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    info!("Transcription complete: {} segments", result.segments.len());
    Ok(result)
}

/// List available Whisper models and their download status.
#[tauri::command]
pub fn list_whisper_models(state: State<'_, AppState>) -> Result<Vec<WhisperModelInfo>, String> {
    let manager = ModelManager::new(state.models_dir());
    Ok(manager.list_models())
}

/// Download a Whisper model.
#[tauri::command]
pub async fn download_whisper_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<String, String> {
    let models_dir = state.models_dir();

    let path = tokio::task::spawn_blocking(move || {
        let manager = ModelManager::new(models_dir);
        manager.download_model(&model_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

/// Delete a downloaded Whisper model.
#[tauri::command]
pub async fn delete_whisper_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let models_dir = state.models_dir();

    tokio::task::spawn_blocking(move || {
        let manager = ModelManager::new(models_dir);
        manager.delete_model(&model_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e.to_string())
}
