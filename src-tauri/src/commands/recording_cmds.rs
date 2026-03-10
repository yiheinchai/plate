use rusqlite::params;
use tauri::{Emitter, State};
use tokio::sync::watch;
use tracing::{error, info};

use crate::audio::recorder::Recorder;
use crate::audio::types::{AudioSource, RecorderStatus, RecordingConfig};
use crate::db::recordings;
use crate::db::schema::RecordingRow;
use crate::state::AppState;

/// Start a recording with the given configuration.
#[tauri::command]
pub async fn start_recording(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    source: String,
    device_name: Option<String>,
    sample_rate: Option<u32>,
) -> Result<String, String> {
    let mut rec_state = state.recording.lock().await;

    if rec_state.status != RecorderStatus::Idle {
        return Err("A recording is already in progress".to_string());
    }

    let audio_source = match source.as_str() {
        "microphone" => AudioSource::Microphone,
        "system_audio" => AudioSource::SystemAudio,
        "both" => AudioSource::Both,
        _ => return Err(format!("Unknown source: {}", source)),
    };

    let sr = sample_rate.unwrap_or(16000);
    let recording_id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.wav", recording_id);
    let output_path = state.recordings_dir().join(&filename);

    let config = RecordingConfig {
        source: audio_source.clone(),
        device_name,
        sample_rate: Some(sr),
    };

    let (stop_tx, stop_rx) = watch::channel(false);
    let (done_tx, done_rx) = tokio::sync::oneshot::channel::<()>();

    rec_state.status = RecorderStatus::Recording;
    rec_state.source = Some(audio_source);
    rec_state.output_path = Some(output_path.clone());
    rec_state.sample_rate = sr;
    rec_state.stop_tx = Some(stop_tx);
    rec_state.done_rx = Some(done_rx);
    rec_state.duration_ms = 0;

    // Spawn the recorder on a blocking thread.
    let models_dir = state.models_dir();
    let recorder = Recorder::new(config, output_path, app_handle.clone(), models_dir);
    let recording_state = state.recording.clone();

    tokio::task::spawn_blocking(move || {
        let result = recorder.run_blocking(stop_rx);
        // When the recorder finishes, reset state.
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            let mut rs = recording_state.lock().await;
            rs.status = RecorderStatus::Idle;
            rs.stop_tx = None;
            rs.source = None;
            if let Ok(ref res) = result {
                rs.duration_ms = res.duration_ms;
            }
        });
        // Notify the frontend if the recorder failed.
        if let Err(ref e) = result {
            error!("Recorder failed: {}", e);
            let _ = app_handle.emit("recording-error", e.to_string());
        }
        // Signal that the WAV file is fully written.
        let _ = done_tx.send(());
        result
    });

    info!("Recording started: {}", recording_id);
    Ok(recording_id)
}

/// Stop the current recording, save it to the database, and return a Recording object.
#[tauri::command]
pub async fn stop_recording(state: State<'_, AppState>) -> Result<RecordingRow, String> {
    let mut rec_state = state.recording.lock().await;

    match rec_state.status {
        RecorderStatus::Recording | RecorderStatus::Paused => {}
        _ => return Err("No recording in progress".to_string()),
    }

    // Send stop signal.
    if let Some(ref stop_tx) = rec_state.stop_tx {
        let _ = stop_tx.send(true);
    }

    rec_state.status = RecorderStatus::Stopping;

    let output_path = rec_state
        .output_path
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let sample_rate = rec_state.sample_rate;
    let source = rec_state.source.clone().unwrap_or(AudioSource::Microphone);
    let duration_ms = rec_state.duration_ms;

    // Extract the recording ID from the filename (filename is {id}.wav).
    let recording_id = std::path::Path::new(&output_path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Take the done_rx so we can wait for the recorder thread to finish.
    let done_rx = rec_state.done_rx.take();

    // Drop the lock before waiting.
    drop(rec_state);

    // Wait for the recorder thread to finish writing the WAV file.
    if let Some(rx) = done_rx {
        let _ = rx.await;
    }

    // Generate a human-readable title.
    let now = chrono::Local::now();
    let title = format!("Recording {}", now.format("%Y-%m-%d %H:%M"));
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // Get file size.
    let file_size = std::fs::metadata(&output_path)
        .ok()
        .map(|m| m.len() as i64);

    // Save to database.
    let db_path = state.db_path.clone();
    let rec_id = recording_id.clone();
    let rec_title = title.clone();
    let source_str = source.to_string();
    let file_path = output_path.clone();
    let sr = sample_rate as i64;
    let dur = duration_ms as i64;
    let fs = file_size;

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(
            recordings::INSERT_RECORDING_SQL,
            params![rec_id, rec_title, source_str, file_path, dur, sr, fs],
        )
        .map_err(|e| format!("Failed to insert recording: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    info!("Recording stopped and saved: {}", recording_id);

    Ok(RecordingRow {
        id: recording_id,
        title,
        source_type: source.to_string(),
        file_path: output_path,
        duration_ms: Some(duration_ms as i64),
        sample_rate: sample_rate as i64,
        created_at,
        file_size,
    })
}

/// Pause the current recording.
#[tauri::command]
pub async fn pause_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut rec_state = state.recording.lock().await;

    if rec_state.status != RecorderStatus::Recording {
        return Err("No active recording to pause".to_string());
    }

    rec_state.status = RecorderStatus::Paused;
    info!("Recording paused");
    Ok(())
}

/// Resume a paused recording.
#[tauri::command]
pub async fn resume_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut rec_state = state.recording.lock().await;

    if rec_state.status != RecorderStatus::Paused {
        return Err("No paused recording to resume".to_string());
    }

    rec_state.status = RecorderStatus::Recording;
    info!("Recording resumed");
    Ok(())
}

/// Get the current recording status.
#[tauri::command]
pub async fn get_recording_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let rec_state = state.recording.lock().await;
    Ok(serde_json::json!({
        "status": rec_state.status,
        "source": rec_state.source,
        "duration_ms": rec_state.duration_ms,
        "sample_rate": rec_state.sample_rate,
    }))
}

/// List all recordings from the database.
#[tauri::command]
pub async fn list_recordings(state: State<'_, AppState>) -> Result<Vec<RecordingRow>, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<Vec<RecordingRow>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        let mut stmt = conn
            .prepare(recordings::SELECT_ALL_RECORDINGS_SQL)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;
        let rows = stmt
            .query_map([], |row| {
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
            .map_err(|e| format!("Failed to query recordings: {}", e))?;

        let mut recordings = Vec::new();
        for row in rows {
            recordings.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
        }
        Ok(recordings)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get a single recording by ID.
#[tauri::command]
pub async fn get_recording(state: State<'_, AppState>, id: String) -> Result<RecordingRow, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<RecordingRow, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.query_row(recordings::SELECT_RECORDING_BY_ID_SQL, params![id], |row| {
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
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Rename a recording.
#[tauri::command]
pub async fn rename_recording(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(recordings::UPDATE_RECORDING_TITLE_SQL, params![id, title])
            .map_err(|e| format!("Failed to rename recording: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get a browser-playable (16-bit PCM) version of a recording's WAV file.
/// Converts 32-bit float WAV to 16-bit PCM in a temp directory and returns the path.
#[tauri::command]
pub async fn get_playable_audio(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let db_path = state.db_path.clone();
    let cache_dir = state.data_dir.join("audio_cache");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create audio cache dir: {}", e))?;

    let recording: RecordingRow = tokio::task::spawn_blocking({
        let db = db_path.clone();
        let rid = id.clone();
        move || -> Result<RecordingRow, String> {
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
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    let cached_path = cache_dir.join(format!("{}.wav", id));
    if cached_path.exists() {
        return Ok(cached_path.to_string_lossy().into_owned());
    }

    let source_path = recording.file_path.clone();
    let dest = cached_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let reader = hound::WavReader::open(&source_path)
            .map_err(|e| format!("Failed to open WAV: {}", e))?;
        let spec = reader.spec();

        // If already 16-bit PCM, just copy the file.
        if spec.sample_format == hound::SampleFormat::Int && spec.bits_per_sample == 16 {
            std::fs::copy(&source_path, &dest)
                .map_err(|e| format!("Failed to copy: {}", e))?;
            return Ok(());
        }

        // Convert to 16-bit PCM.
        let out_spec = hound::WavSpec {
            channels: spec.channels,
            sample_rate: spec.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&dest, out_spec)
            .map_err(|e| format!("Failed to create output WAV: {}", e))?;

        match spec.sample_format {
            hound::SampleFormat::Float => {
                for sample in reader.into_samples::<f32>() {
                    let s = sample.map_err(|e| format!("Read error: {}", e))?;
                    let clamped = s.max(-1.0).min(1.0);
                    let pcm = (clamped * 32767.0) as i16;
                    writer.write_sample(pcm).map_err(|e| format!("Write error: {}", e))?;
                }
            }
            hound::SampleFormat::Int => {
                let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
                for sample in reader.into_samples::<i32>() {
                    let s = sample.map_err(|e| format!("Read error: {}", e))?;
                    let normalized = s as f32 / max_val;
                    let pcm = (normalized * 32767.0) as i16;
                    writer.write_sample(pcm).map_err(|e| format!("Write error: {}", e))?;
                }
            }
        }

        writer.finalize().map_err(|e| format!("Failed to finalize: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(cached_path.to_string_lossy().into_owned())
}

/// Export a recording's WAV file to the user's Downloads folder.
#[tauri::command]
pub async fn export_recording(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let db_path = state.db_path.clone();

    let recording: RecordingRow = tokio::task::spawn_blocking(move || -> Result<RecordingRow, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.query_row(recordings::SELECT_RECORDING_BY_ID_SQL, params![id], |row| {
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
    .map_err(|e| format!("Task join error: {}", e))??;

    let source = std::path::Path::new(&recording.file_path);
    if !source.exists() {
        return Err("Recording file not found on disk".to_string());
    }

    let downloads_dir = dirs::download_dir()
        .ok_or_else(|| "Could not find Downloads directory".to_string())?;

    // Sanitize the title for use as a filename.
    let safe_title: String = recording.title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let dest = downloads_dir.join(format!("{}.wav", safe_title.trim()));

    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to export recording: {}", e))?;

    Ok(dest.to_string_lossy().into_owned())
}

/// Delete a recording by ID (also removes the WAV file).
#[tauri::command]
pub async fn delete_recording(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // First get the file path so we can delete the file.
        let file_path: Option<String> = conn
            .query_row(
                recordings::SELECT_RECORDING_BY_ID_SQL,
                params![id],
                |row| row.get(3),
            )
            .ok();

        // Delete from database.
        conn.execute(recordings::DELETE_RECORDING_SQL, params![id])
            .map_err(|e| format!("Failed to delete recording: {}", e))?;

        // Delete the WAV file if it exists.
        if let Some(path) = file_path {
            let _ = std::fs::remove_file(&path);
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
