use tauri::State;

use crate::audio::microphone;
use crate::audio::types::AudioDevice;
use crate::state::AppState;

/// List available audio input devices.
#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    microphone::list_input_devices().map_err(|e| e.to_string())
}

/// Get the current audio recording level (placeholder — would be fed from a meter).
#[tauri::command]
pub fn get_audio_level(_state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    // In a real implementation, the recorder would continuously update a level meter
    // in the app state. For now, return zeros.
    Ok(serde_json::json!({
        "rms": 0.0,
        "peak": 0.0,
    }))
}
