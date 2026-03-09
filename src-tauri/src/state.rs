use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use crate::audio::types::RecordingState;
use crate::db::schema::SettingsCache;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Current recording state (idle, recording, paused, etc.)
    pub recording: Arc<Mutex<RecordingState>>,
    /// Path to the app data directory (for storing WAV files, models, etc.)
    pub data_dir: PathBuf,
    /// Cached settings from the database
    pub settings: Arc<RwLock<SettingsCache>>,
    /// Database URL for tauri-plugin-sql (sqlite:filename)
    pub db_url: String,
    /// Path to the SQLite database file (for rusqlite direct access)
    pub db_path: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let db_path = data_dir.join("plate.db");
        let db_url = format!("sqlite:{}", db_path.display());

        Self {
            recording: Arc::new(Mutex::new(RecordingState::default())),
            data_dir,
            settings: Arc::new(RwLock::new(SettingsCache::default())),
            db_url,
            db_path,
        }
    }

    /// Directory where recorded WAV files are stored.
    pub fn recordings_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("recordings");
        std::fs::create_dir_all(&dir).ok();
        dir
    }

    /// Directory where whisper models are stored.
    pub fn models_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("models");
        std::fs::create_dir_all(&dir).ok();
        dir
    }
}
