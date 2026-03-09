use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::db::settings;
use crate::state::AppState;

/// Settings object matching the frontend Settings type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub llm_auth_mode: String,
    pub llm_session_token: String,
    pub llm_organization_id: String,
    pub llm_api_key: String,
    pub llm_model: String,
    pub g4f_url: String,
    pub transcription_engine: String,
    pub whisper_model: String,
    pub openai_api_key: String,
    pub audio_sample_rate: u32,
}

impl Default for SettingsResponse {
    fn default() -> Self {
        Self {
            llm_auth_mode: "g4f".to_string(),
            llm_session_token: String::new(),
            llm_organization_id: String::new(),
            llm_api_key: String::new(),
            llm_model: "openai".to_string(),
            g4f_url: String::new(),
            transcription_engine: "whisper_local".to_string(),
            whisper_model: "ggml-base.en".to_string(),
            openai_api_key: String::new(),
            audio_sample_rate: 16000,
        }
    }
}

/// Get all settings as a SettingsResponse object matching the frontend type.
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsResponse, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<SettingsResponse, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare(settings::SELECT_ALL_SETTINGS_SQL)
            .map_err(|e| format!("Failed to prepare settings query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                ))
            })
            .map_err(|e| format!("Failed to query settings: {}", e))?;

        let mut response = SettingsResponse::default();
        for row in rows {
            let (key, value) = row.map_err(|e| format!("Failed to read setting: {}", e))?;
            match key.as_str() {
                "llm_auth_mode" => response.llm_auth_mode = value,
                "llm_session_token" => response.llm_session_token = value,
                "llm_organization_id" => response.llm_organization_id = value,
                "llm_api_key" => response.llm_api_key = value,
                "llm_model" => response.llm_model = value,
                "g4f_url" => response.g4f_url = value,
                "transcription_engine" => response.transcription_engine = value,
                "whisper_model" => response.whisper_model = value,
                "openai_api_key" => response.openai_api_key = value,
                "audio_sample_rate" => {
                    response.audio_sample_rate = value.parse().unwrap_or(16000);
                }
                _ => {}
            }
        }

        Ok(response)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Update settings from the frontend Settings object.
#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: SettingsResponse,
) -> Result<(), String> {
    let db_path = state.db_path.clone();

    // Build the key-value pairs.
    let pairs = vec![
        ("llm_auth_mode", settings.llm_auth_mode.clone()),
        ("llm_session_token", settings.llm_session_token.clone()),
        ("llm_organization_id", settings.llm_organization_id.clone()),
        ("llm_api_key", settings.llm_api_key.clone()),
        ("llm_model", settings.llm_model.clone()),
        ("g4f_url", settings.g4f_url.clone()),
        ("transcription_engine", settings.transcription_engine.clone()),
        ("whisper_model", settings.whisper_model.clone()),
        ("openai_api_key", settings.openai_api_key.clone()),
        ("audio_sample_rate", settings.audio_sample_rate.to_string()),
    ];

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        for (key, value) in &pairs {
            conn.execute(settings::UPSERT_SETTING_SQL, params![key, value])
                .map_err(|e| format!("Failed to save setting {}: {}", key, e))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // Update in-memory cache too.
    let mut cache = state.settings.write().await;
    cache.set("openai_api_key", &settings.openai_api_key);
    cache.set(
        "default_transcription_engine",
        &settings.transcription_engine,
    );
    cache.set("default_whisper_model", &settings.whisper_model);
    // Map llm_auth_mode + keys to the cache fields.
    match settings.llm_auth_mode.as_str() {
        "api_key" => {
            cache.set("default_llm_provider", "claude_api");
        }
        "session_token" => {
            cache.set("default_llm_provider", "claude_session");
        }
        "g4f" => {
            cache.set("default_llm_provider", "g4f");
            cache.set("g4f_url", &settings.g4f_url);
        }
        _ => {
            cache.set("default_llm_provider", "claude_api");
        }
    }
    // Always cache keys (may switch modes later).
    cache.set("anthropic_api_key", &settings.llm_api_key);
    cache.set("claude_session_key", &settings.llm_session_token);
    cache.set("claude_organization_id", &settings.llm_organization_id);

    info!("Settings updated");
    Ok(())
}

/// Get a setting value by key (legacy command).
#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let settings = state.settings.read().await;
    let value = match key.as_str() {
        "openai_api_key" => settings.openai_api_key.clone(),
        "anthropic_api_key" => settings.anthropic_api_key.clone(),
        "claude_session_key" => settings.claude_session_key.clone(),
        "claude_organization_id" => settings.claude_organization_id.clone(),
        "default_transcription_engine" => settings.default_transcription_engine.clone(),
        "default_whisper_model" => settings.default_whisper_model.clone(),
        "default_llm_provider" => settings.default_llm_provider.clone(),
        "default_prompt_style" => settings.default_prompt_style.clone(),
        _ => None,
    };
    Ok(value)
}

/// Set a setting value (legacy command). Updates both DB and in-memory cache.
#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let k = key.clone();
    let v = value.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(settings::UPSERT_SETTING_SQL, params![k, v])
            .map_err(|e| format!("Failed to save setting: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    let mut settings = state.settings.write().await;
    settings.set(&key, &value);
    info!("Setting updated: {} = [redacted]", key);
    Ok(())
}

/// Get all settings as a JSON object (legacy command).
#[tauri::command]
pub async fn get_all_settings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let settings = state.settings.read().await;
    Ok(serde_json::json!({
        "openai_api_key": settings.openai_api_key,
        "anthropic_api_key": settings.anthropic_api_key,
        "claude_session_key": settings.claude_session_key,
        "claude_organization_id": settings.claude_organization_id,
        "default_transcription_engine": settings.default_transcription_engine,
        "default_whisper_model": settings.default_whisper_model,
        "default_llm_provider": settings.default_llm_provider,
        "default_prompt_style": settings.default_prompt_style,
    }))
}

/// Get the database URL (for the frontend to use with tauri-plugin-sql).
#[tauri::command]
pub fn get_db_url(state: State<'_, AppState>) -> String {
    state.db_url.clone()
}

/// Get the schema SQL for initializing the database.
#[tauri::command]
pub fn get_schema_sql() -> String {
    crate::db::schema::CREATE_TABLES_SQL.to_string()
}
