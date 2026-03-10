use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tracing::info;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::engine::TranscriptionEngine;
use super::model_manager::ModelManager;
use super::types::{TranscriptSegment, TranscriptionConfig, TranscriptionResult};

/// Local Whisper transcription engine using whisper-rs (whisper.cpp bindings).
pub struct WhisperLocal {
    models_dir: PathBuf,
    app_handle: Option<tauri::AppHandle>,
}

impl WhisperLocal {
    pub fn new(models_dir: PathBuf) -> Self {
        Self { models_dir, app_handle: None }
    }

    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Resolve the model file path from a model name like "ggml-base.en".
    fn model_path(&self, model_name: &str) -> PathBuf {
        let filename = if model_name.ends_with(".bin") {
            model_name.to_string()
        } else {
            format!("{}.bin", model_name)
        };
        self.models_dir.join(filename)
    }

    /// Load audio from a WAV file and convert to 16 kHz mono f32 samples.
    fn load_audio(path: &Path) -> Result<Vec<f32>> {
        let reader = hound::WavReader::open(path).context("Failed to open WAV file")?;
        let spec = reader.spec();
        let sample_rate = spec.sample_rate;
        let channels = spec.channels as usize;

        // Read all samples as f32.
        let samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader
                .into_samples::<f32>()
                .collect::<std::result::Result<Vec<f32>, _>>()
                .context("Failed to read float samples")?,
            hound::SampleFormat::Int => {
                let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
                reader
                    .into_samples::<i32>()
                    .collect::<std::result::Result<Vec<i32>, _>>()
                    .context("Failed to read int samples")?
                    .into_iter()
                    .map(|s| s as f32 / max_val)
                    .collect()
            }
        };

        // Mix down to mono if stereo.
        let mono: Vec<f32> = if channels > 1 {
            samples
                .chunks(channels)
                .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                .collect()
        } else {
            samples
        };

        // Resample to 16 kHz if needed (simple linear interpolation).
        let target_rate = 16000u32;
        if sample_rate == target_rate {
            return Ok(mono);
        }

        let ratio = sample_rate as f64 / target_rate as f64;
        let new_len = (mono.len() as f64 / ratio) as usize;
        let mut resampled = Vec::with_capacity(new_len);
        for i in 0..new_len {
            let src_idx = i as f64 * ratio;
            let idx0 = src_idx.floor() as usize;
            let idx1 = (idx0 + 1).min(mono.len() - 1);
            let frac = (src_idx - idx0 as f64) as f32;
            resampled.push(mono[idx0] * (1.0 - frac) + mono[idx1] * frac);
        }

        Ok(resampled)
    }
}

impl TranscriptionEngine for WhisperLocal {
    fn transcribe(&self, config: &TranscriptionConfig) -> Result<TranscriptionResult> {
        let model_name = config
            .model
            .as_deref()
            .unwrap_or("ggml-tiny.en");
        let model_path = self.model_path(model_name);

        if !model_path.exists() {
            info!("Whisper model not found, auto-downloading {}", model_name);
            let manager = ModelManager::new(self.models_dir.clone());
            if let Some(ref app_handle) = self.app_handle {
                manager.download_model_with_progress(model_name, app_handle)?;
            } else {
                manager.download_model(model_name)?;
            }
        }

        info!("Loading Whisper model from {}", model_path.display());
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().context("Invalid model path")?,
            WhisperContextParameters::default(),
        )
        .context("Failed to create Whisper context")?;

        let mut state = ctx.create_state().context("Failed to create Whisper state")?;

        // Load and preprocess audio.
        let audio_path = Path::new(&config.audio_path);
        let samples = Self::load_audio(audio_path)?;

        info!("Transcribing {} samples with model {}", samples.len(), model_name);

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let language = config.language.as_deref().unwrap_or("en");
        params.set_language(Some(language));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        if let Some(ref app_handle) = self.app_handle {
            let ah = app_handle.clone();
            params.set_progress_callback_safe(move |progress| {
                let _ = ah.emit("transcription-progress", serde_json::json!({
                    "progress": progress,
                }));
            });
        }

        state.full(params, &samples).context("Whisper inference failed")?;

        let n_segments = state.full_n_segments().context("Failed to get segment count")?;
        let mut segments = Vec::with_capacity(n_segments as usize);
        let mut full_text = String::new();

        for i in 0..n_segments {
            let text = state
                .full_get_segment_text(i)
                .context("Failed to get segment text")?;
            let start = state
                .full_get_segment_t0(i)
                .context("Failed to get segment start time")?;
            let end = state
                .full_get_segment_t1(i)
                .context("Failed to get segment end time")?;

            // Whisper timestamps are in centiseconds (10ms units).
            segments.push(TranscriptSegment {
                start_ms: start * 10,
                end_ms: end * 10,
                text: text.clone(),
            });

            if !full_text.is_empty() {
                full_text.push(' ');
            }
            full_text.push_str(text.trim());
        }

        info!("Transcription complete: {} segments", segments.len());

        Ok(TranscriptionResult {
            full_text,
            segments,
            language: language.to_string(),
            engine: "local".to_string(),
            model: Some(model_name.to_string()),
        })
    }
}
