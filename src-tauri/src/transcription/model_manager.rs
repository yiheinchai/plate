use anyhow::{Context, Result};
use std::io::Write;
use std::path::PathBuf;
use tracing::info;

use super::types::WhisperModelInfo;

/// Base URL for downloading ggml Whisper models from Hugging Face.
const HF_MODEL_BASE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// URL for downloading the pre-converted Phonon-2 weights archive from Hugging Face.
const PHONON_2_ARCHIVE_URL: &str =
    "https://huggingface.co/eschmidbauer/phonon-2-c/resolve/main/phonon-2-c-weights-v1.tar.gz";

/// Known model names and their approximate sizes in bytes.
const KNOWN_MODELS: &[(&str, u64)] = &[
    ("phonon-2", 196_151_118),
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

/// Manages local Whisper and Phonon-2 model files.
pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&models_dir).ok();
        Self { models_dir }
    }

    pub fn is_phonon_model(model_name: &str) -> bool {
        model_name == "phonon-2" || model_name.starts_with("phonon-")
    }

    /// List all known models and whether they are downloaded.
    pub fn list_models(&self) -> Vec<WhisperModelInfo> {
        KNOWN_MODELS
            .iter()
            .map(|(name, size)| WhisperModelInfo {
                name: name.to_string(),
                size_bytes: *size,
                downloaded: self.is_downloaded(name),
            })
            .collect()
    }

    /// Check if a model is already downloaded.
    pub fn is_downloaded(&self, model_name: &str) -> bool {
        let path = self.model_path(model_name);
        if Self::is_phonon_model(model_name) {
            path.join("weights.bin").exists()
                && path.join("weights.json").exists()
                && path.join("tokens.txt").exists()
        } else {
            path.exists()
        }
    }

    /// Remove any leftover `.part` file or directory from a previous interrupted download.
    fn cleanup_partial(&self, model_name: &str, dest: &PathBuf) {
        if Self::is_phonon_model(model_name) {
            let archive_part = self.models_dir.join(format!("{}.tar.gz.part", model_name));
            if archive_part.exists() {
                info!("Removing partial archive: {}", archive_part.display());
                let _ = std::fs::remove_file(&archive_part);
            }
            let dir_part = self.models_dir.join(format!("{}.part", model_name));
            if dir_part.exists() {
                info!("Removing partial directory: {}", dir_part.display());
                let _ = std::fs::remove_dir_all(&dir_part);
            }
        } else {
            let part_path = dest.with_extension("bin.part");
            if part_path.exists() {
                info!("Removing partial download: {}", part_path.display());
                let _ = std::fs::remove_file(&part_path);
            }
        }
    }

    /// Get the file or directory path for a model.
    pub fn model_path(&self, model_name: &str) -> PathBuf {
        if Self::is_phonon_model(model_name) {
            self.models_dir.join(model_name)
        } else {
            let filename = if model_name.ends_with(".bin") {
                model_name.to_string()
            } else {
                format!("{}.bin", model_name)
            };
            self.models_dir.join(filename)
        }
    }

    /// Unpack a downloaded Phonon-2 `.tar.gz` archive into `dest`.
    fn unpack_phonon_archive(&self, model_name: &str, archive_part: &PathBuf, dest: &PathBuf) -> Result<()> {
        let dir_part = self.models_dir.join(format!("{}.part", model_name));
        if dir_part.exists() {
            let _ = std::fs::remove_dir_all(&dir_part);
        }
        std::fs::create_dir_all(&dir_part)
            .context("Failed to create temporary Phonon-2 weights directory")?;

        let status = std::process::Command::new("tar")
            .args([
                "-xzf",
                archive_part.to_str().context("Invalid archive path")?,
                "--strip-components=1",
                "-C",
                dir_part.to_str().context("Invalid destination path")?,
            ])
            .status()
            .context("Failed to execute tar to unpack Phonon-2 weights")?;

        let _ = std::fs::remove_file(archive_part);

        if !status.success() {
            let _ = std::fs::remove_dir_all(&dir_part);
            anyhow::bail!("tar exited with {} while unpacking {}", status, model_name);
        }

        if !dir_part.join("weights.bin").exists()
            || !dir_part.join("weights.json").exists()
            || !dir_part.join("tokens.txt").exists()
        {
            let _ = std::fs::remove_dir_all(&dir_part);
            anyhow::bail!("Unpacked Phonon-2 archive is missing required weight files");
        }

        if dest.exists() {
            let _ = std::fs::remove_dir_all(dest);
        }
        std::fs::rename(&dir_part, dest).context("Failed to finalize Phonon-2 model directory")?;
        Ok(())
    }

    /// Download a model from Hugging Face. This is a blocking operation.
    /// Downloads to a `.part` temp file first, then renames on success
    /// so a partial file from a killed process won't be mistaken for a valid model.
    pub fn download_model(&self, model_name: &str) -> Result<PathBuf> {
        let dest = self.model_path(model_name);
        self.cleanup_partial(model_name, &dest);
        if self.is_downloaded(model_name) {
            info!("Model {} already exists at {}", model_name, dest.display());
            return Ok(dest);
        }

        let is_phonon = Self::is_phonon_model(model_name);
        let part_path = if is_phonon {
            self.models_dir.join(format!("{}.tar.gz.part", model_name))
        } else {
            dest.with_extension("bin.part")
        };
        let url = if is_phonon {
            PHONON_2_ARCHIVE_URL.to_string()
        } else {
            let filename = if model_name.ends_with(".bin") {
                model_name.to_string()
            } else {
                format!("{}.bin", model_name)
            };
            format!("{}/{}", HF_MODEL_BASE_URL, filename)
        };

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

        if is_phonon {
            self.unpack_phonon_archive(model_name, &part_path, &dest)?;
        } else {
            std::fs::rename(&part_path, &dest).context("Failed to finalize model file")?;
        }

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
        self.cleanup_partial(model_name, &dest);
        if self.is_downloaded(model_name) {
            info!("Model {} already exists at {}", model_name, dest.display());
            return Ok(dest);
        }

        let is_phonon = Self::is_phonon_model(model_name);
        let part_path = if is_phonon {
            self.models_dir.join(format!("{}.tar.gz.part", model_name))
        } else {
            dest.with_extension("bin.part")
        };
        let url = if is_phonon {
            PHONON_2_ARCHIVE_URL.to_string()
        } else {
            let filename = if model_name.ends_with(".bin") {
                model_name.to_string()
            } else {
                format!("{}.bin", model_name)
            };
            format!("{}/{}", HF_MODEL_BASE_URL, filename)
        };

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

        if is_phonon {
            if let Err(e) = self.unpack_phonon_archive(model_name, &part_path, &dest) {
                let _ = app_handle.emit(
                    "model-download-progress",
                    serde_json::json!({
                        "model": model_name,
                        "status": "error",
                        "error": e.to_string(),
                    }),
                );
                return Err(e);
            }
        } else {
            std::fs::rename(&part_path, &dest).context("Failed to finalize model file")?;
        }

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
            if path.is_dir() {
                std::fs::remove_dir_all(&path).context("Failed to delete model directory")?;
            } else {
                std::fs::remove_file(&path).context("Failed to delete model file")?;
            }
            info!("Deleted model {}", model_name);
        }
        Ok(())
    }
}
