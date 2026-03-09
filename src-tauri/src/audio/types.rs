use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::watch;

/// Source of an audio recording.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Microphone,
    SystemAudio,
    Both,
}

impl std::fmt::Display for AudioSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioSource::Microphone => write!(f, "microphone"),
            AudioSource::SystemAudio => write!(f, "system_audio"),
            AudioSource::Both => write!(f, "both"),
        }
    }
}

/// Current status of the recorder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecorderStatus {
    Idle,
    Recording,
    Paused,
    Stopping,
}

/// Holds the live recording state: current file path, sample rate, status, and a stop signal.
pub struct RecordingState {
    pub status: RecorderStatus,
    pub source: Option<AudioSource>,
    pub output_path: Option<PathBuf>,
    pub sample_rate: u32,
    /// Sender half of a watch channel used to signal the recorder to stop.
    pub stop_tx: Option<watch::Sender<bool>>,
    /// Receiver for when the recorder thread finishes (WAV fully written).
    pub done_rx: Option<tokio::sync::oneshot::Receiver<()>>,
    /// Accumulated duration in milliseconds (updated periodically).
    pub duration_ms: u64,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            status: RecorderStatus::Idle,
            source: None,
            output_path: None,
            sample_rate: 16000,
            stop_tx: None,
            done_rx: None,
            duration_ms: 0,
        }
    }
}

/// Information about an available audio input device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

/// Configuration for starting a recording.
#[derive(Debug, Clone, Deserialize)]
pub struct RecordingConfig {
    pub source: AudioSource,
    /// Optional device name override; if None, uses default.
    pub device_name: Option<String>,
    /// Target sample rate (default 16000 for Whisper compatibility).
    pub sample_rate: Option<u32>,
}

/// Result returned after a recording completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingResult {
    pub file_path: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub source: AudioSource,
}

/// Audio level metering data emitted during recording.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevel {
    pub rms: f32,
    pub peak: f32,
}
