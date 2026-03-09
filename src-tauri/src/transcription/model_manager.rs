use anyhow::{Context, Result};
use std::io::Write;
use std::path::PathBuf;
use tracing::info;

use super::types::WhisperModelInfo;

/// Base URL for downloading ggml Whisper models from Hugging Face.
const HF_MODEL_BASE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// Known model names and their approximate sizes in bytes.
const KNOWN_MODELS: &[(&str, u64)] = &[
    ("ggml-tiny.en", 77_700_000),
    ("ggml-tiny", 77_700_000),
    ("ggml-base.en", 148_400_000),
    ("ggml-base", 148_400_000),
    ("ggml-small.en", 488_000_000),
    ("ggml-small", 488_000_000),
    ("ggml-medium.en", 1_533_000_000),
    ("ggml-medium", 1_533_000_000),
    ("ggml-large-v3", 3_095_000_000),
];

/// Manages local Whisper model files.
pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&models_dir).ok();
        Self { models_dir }
    }

    /// List all known models and whether they are downloaded.
    pub fn list_models(&self) -> Vec<WhisperModelInfo> {
        KNOWN_MODELS
            .iter()
            .map(|(name, size)| {
                let path = self.model_path(name);
                WhisperModelInfo {
                    name: name.to_string(),
                    size_bytes: *size,
                    downloaded: path.exists(),
                }
            })
            .collect()
    }

    /// Check if a model is already downloaded.
    pub fn is_downloaded(&self, model_name: &str) -> bool {
        self.model_path(model_name).exists()
    }

    /// Remove any leftover `.part` file from a previous interrupted download.
    fn cleanup_partial(&self, dest: &PathBuf) {
        let part_path = dest.with_extension("bin.part");
        if part_path.exists() {
            info!("Removing partial download: {}", part_path.display());
            let _ = std::fs::remove_file(&part_path);
        }
    }

    /// Get the file path for a model.
    pub fn model_path(&self, model_name: &str) -> PathBuf {
        let filename = if model_name.ends_with(".bin") {
            model_name.to_string()
        } else {
            format!("{}.bin", model_name)
        };
        self.models_dir.join(filename)
    }

    /// Download a model from Hugging Face. This is a blocking operation.
    /// Downloads to a `.part` temp file first, then renames on success
    /// so a partial file from a killed process won't be mistaken for a valid model.
    pub fn download_model(&self, model_name: &str) -> Result<PathBuf> {
        let dest = self.model_path(model_name);
        self.cleanup_partial(&dest);
        if dest.exists() {
            info!("Model {} already exists at {}", model_name, dest.display());
            return Ok(dest);
        }

        let part_path = dest.with_extension("bin.part");
        let filename = if model_name.ends_with(".bin") {
            model_name.to_string()
        } else {
            format!("{}.bin", model_name)
        };
        let url = format!("{}/{}", HF_MODEL_BASE_URL, filename);

        info!("Downloading model from {} to {}", url, dest.display());

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .context("Failed to build HTTP client")?;

        let response = client
            .get(&url)
            .send()
            .context("Failed to download model")?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Failed to download model {}: HTTP {}",
                model_name,
                response.status()
            );
        }

        let bytes = response.bytes().context("Failed to read model bytes")?;
        std::fs::write(&part_path, &bytes).context("Failed to write model file")?;
        std::fs::rename(&part_path, &dest).context("Failed to finalize model file")?;

        info!(
            "Model {} downloaded ({} bytes)",
            model_name,
            bytes.len()
        );
        Ok(dest)
    }

    /// Download a model with progress events emitted via Tauri.
    /// Downloads to a `.part` temp file first, then renames on success.
    pub fn download_model_with_progress(
        &self,
        model_name: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<PathBuf> {
        use tauri::Emitter;

        let dest = self.model_path(model_name);
        self.cleanup_partial(&dest);
        if dest.exists() {
            info!("Model {} already exists at {}", model_name, dest.display());
            return Ok(dest);
        }

        let part_path = dest.with_extension("bin.part");
        let filename = if model_name.ends_with(".bin") {
            model_name.to_string()
        } else {
            format!("{}.bin", model_name)
        };
        let url = format!("{}/{}", HF_MODEL_BASE_URL, filename);

        // Look up expected size from KNOWN_MODELS
        let expected_size = KNOWN_MODELS
            .iter()
            .find(|(name, _)| *name == model_name)
            .map(|(_, size)| *size)
            .unwrap_or(0);

        let _ = app_handle.emit(
            "model-download-progress",
            serde_json::json!({
                "model": model_name,
                "downloaded": 0u64,
                "total": expected_size,
                "status": "downloading",
            }),
        );

        info!("Downloading model from {} to {}", url, dest.display());

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .context("Failed to build HTTP client")?;

        let mut response = client
            .get(&url)
            .send()
            .context("Failed to download model")?;

        if !response.status().is_success() {
            let _ = app_handle.emit(
                "model-download-progress",
                serde_json::json!({
                    "model": model_name,
                    "status": "error",
                    "error": format!("HTTP {}", response.status()),
                }),
            );
            anyhow::bail!(
                "Failed to download model {}: HTTP {}",
                model_name,
                response.status()
            );
        }

        let total = response
            .content_length()
            .unwrap_or(expected_size);

        let mut file = std::fs::File::create(&part_path)
            .context("Failed to create model file")?;
        let mut downloaded: u64 = 0;
        let mut buf = [0u8; 65536];
        let mut last_emit = std::time::Instant::now();

        loop {
            let n = std::io::Read::read(&mut response, &mut buf)
                .context("Failed to read from download stream")?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])
                .context("Failed to write model data")?;
            downloaded += n as u64;

            // Emit progress at most every 200ms to avoid flooding
            if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
                let _ = app_handle.emit(
                    "model-download-progress",
                    serde_json::json!({
                        "model": model_name,
                        "downloaded": downloaded,
                        "total": total,
                        "status": "downloading",
                    }),
                );
                last_emit = std::time::Instant::now();
            }
        }

        file.flush().context("Failed to flush model file")?;
        drop(file);
        std::fs::rename(&part_path, &dest).context("Failed to finalize model file")?;

        let _ = app_handle.emit(
            "model-download-progress",
            serde_json::json!({
                "model": model_name,
                "downloaded": downloaded,
                "total": total,
                "status": "complete",
            }),
        );

        info!("Model {} downloaded ({} bytes)", model_name, downloaded);
        Ok(dest)
    }

    /// Delete a downloaded model.
    pub fn delete_model(&self, model_name: &str) -> Result<()> {
        let path = self.model_path(model_name);
        if path.exists() {
            std::fs::remove_file(&path).context("Failed to delete model file")?;
            info!("Deleted model {}", model_name);
        }
        Ok(())
    }
}
