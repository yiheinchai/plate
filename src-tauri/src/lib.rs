pub mod audio;
pub mod commands;
pub mod db;
pub mod llm;
pub mod state;
pub mod transcription;

use tauri::Manager;
use state::AppState;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing / logging.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Resolve the app data directory for storing recordings, models, DB, etc.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create app data directory");

            // Initialize the SQLite database schema using rusqlite.
            let db_path = data_dir.join("plate.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("Failed to open database");
            conn.execute_batch(crate::db::schema::CREATE_TABLES_SQL)
                .expect("Failed to create tables");
            // Migrations for existing databases.
            let _ = conn.execute_batch(
                "ALTER TABLE recordings ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;"
            );
            drop(conn);

            // Load settings from DB into cache.
            let app_state = AppState::new(data_dir);
            {
                let conn = rusqlite::Connection::open(&app_state.db_path)
                    .expect("Failed to open database for settings load");
                let mut stmt = conn
                    .prepare(crate::db::settings::SELECT_ALL_SETTINGS_SQL)
                    .expect("Failed to prepare settings query");
                let rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                        ))
                    })
                    .expect("Failed to query settings");
                let settings_cache = app_state.settings.blocking_write();
                let mut cache = settings_cache;
                for row in rows {
                    if let Ok((key, value)) = row {
                        cache.set(&key, &value);
                    }
                }
            }

            app.manage(app_state);

            tracing::info!("Plate app initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Audio
            commands::audio_cmds::list_audio_devices,
            commands::audio_cmds::get_audio_level,
            // Recording
            commands::recording_cmds::start_recording,
            commands::recording_cmds::stop_recording,
            commands::recording_cmds::pause_recording,
            commands::recording_cmds::resume_recording,
            commands::recording_cmds::get_recording_status,
            commands::recording_cmds::list_recordings,
            commands::recording_cmds::get_recording,
            commands::recording_cmds::delete_recording,
            commands::recording_cmds::rename_recording,
            commands::recording_cmds::export_recording,
            commands::recording_cmds::get_playable_audio,
            commands::recording_cmds::import_audio,
            commands::recording_cmds::toggle_star,
            // Transcription
            commands::transcript_cmds::transcribe_recording,
            commands::transcript_cmds::get_transcript,
            commands::transcript_cmds::list_transcripts,
            commands::transcript_cmds::transcribe_audio,
            commands::transcript_cmds::list_whisper_models,
            commands::transcript_cmds::download_whisper_model,
            commands::transcript_cmds::delete_whisper_model,
            commands::transcript_cmds::update_segment_text,
            // Notes
            commands::notes_cmds::generate_notes,
            commands::notes_cmds::get_note,
            commands::notes_cmds::list_notes,
            commands::notes_cmds::delete_note,
            commands::notes_cmds::list_saved_prompts,
            commands::notes_cmds::save_prompt,
            commands::notes_cmds::delete_saved_prompt,
            // Bookmarks
            commands::bookmark_cmds::add_bookmark,
            commands::bookmark_cmds::list_bookmarks,
            commands::bookmark_cmds::delete_bookmark,
            commands::bookmark_cmds::update_bookmark_label,
            // Search
            commands::search_cmds::search,
            // Settings
            commands::settings_cmds::get_settings,
            commands::settings_cmds::update_settings,
            commands::settings_cmds::get_setting,
            commands::settings_cmds::set_setting,
            commands::settings_cmds::get_all_settings,
            commands::settings_cmds::get_db_url,
            commands::settings_cmds::get_schema_sql,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
