use anyhow::{Context, Result};
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
    pub fn download_model(&self, model_name: &str) -> Result<PathBuf> {
        let dest = self.model_path(model_name);
        if dest.exists() {
            info!("Model {} already exists at {}", model_name, dest.display());
            return Ok(dest);
        }

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
        std::fs::write(&dest, &bytes).context("Failed to write model file")?;

        info!(
            "Model {} downloaded ({} bytes)",
            model_name,
            bytes.len()
        );
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
