use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use tauri::Emitter;
use tracing::{error, info};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::transcription::model_manager::ModelManager;

/// Interval in samples between live transcription chunks.
/// At 16kHz, 48000 samples = 3 seconds of audio.
const CHUNK_INTERVAL_SAMPLES: usize = 16000 * 3;

/// Manages live (real-time) transcription during recording.
/// Accepts audio samples, accumulates them, and periodically runs Whisper
/// inference on new chunks, emitting `transcript-chunk` events.
pub struct LiveTranscriber {
    tx: mpsc::Sender<LiveMsg>,
    _worker: std::thread::JoinHandle<()>,
}

enum LiveMsg {
    /// A batch of audio samples to add to the buffer.
    Samples(Vec<f32>),
    /// Signal to stop the transcriber.
    Stop,
}

impl LiveTranscriber {
    /// Create and start a live transcriber.
    /// `models_dir` is where Whisper models are stored.
    /// `model_name` is e.g. "ggml-tiny.en".
    /// Audio is assumed to be 16kHz mono f32.
    pub fn new(
        app_handle: tauri::AppHandle,
        models_dir: PathBuf,
        model_name: String,
    ) -> Option<Self> {
        let (tx, rx) = mpsc::channel::<LiveMsg>();

        let worker = std::thread::spawn(move || {
            Self::worker_loop(rx, app_handle, models_dir, model_name);
        });

        Some(Self {
            tx,
            _worker: worker,
        })
    }

    /// Feed audio samples to the live transcriber.
    pub fn push_samples(&self, samples: &[f32]) {
        let _ = self.tx.send(LiveMsg::Samples(samples.to_vec()));
    }

    /// Stop the live transcriber gracefully.
    pub fn stop(&self) {
        let _ = self.tx.send(LiveMsg::Stop);
    }

    fn worker_loop(
        rx: mpsc::Receiver<LiveMsg>,
        app_handle: tauri::AppHandle,
        models_dir: PathBuf,
        model_name: String,
    ) {
        // Ensure model is downloaded.
        let manager = ModelManager::new(models_dir.clone());
        let model_path = manager.model_path(&model_name);
        if !model_path.exists() {
            info!(
                "Live transcriber: auto-downloading model {}",
                model_name
            );
            if let Err(e) = manager.download_model(&model_name) {
                error!("Live transcriber: failed to download model: {}", e);
                return;
            }
        }

        // Load whisper context once (expensive).
        let ctx = match WhisperContext::new_with_params(
            model_path.to_str().unwrap_or_default(),
            WhisperContextParameters::default(),
        ) {
            Ok(ctx) => ctx,
            Err(e) => {
                error!("Live transcriber: failed to load Whisper model: {}", e);
                return;
            }
        };

        info!("Live transcriber started with model {}", model_name);

        let mut pending_samples: Vec<f32> = Vec::new();
        let busy = Arc::new(AtomicBool::new(false));

        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                Ok(LiveMsg::Samples(samples)) => {
                    pending_samples.extend_from_slice(&samples);
                }
                Ok(LiveMsg::Stop) => {
                    info!("Live transcriber stopping");
                    // Do one final transcription of any remaining audio.
                    if !pending_samples.is_empty() {
                        if let Some(text) = Self::transcribe_chunk(&ctx, &pending_samples) {
                            if !text.is_empty() {
                                let _ = app_handle.emit(
                                    "transcript-chunk",
                                    serde_json::json!({
                                        "text": text,
                                        "is_final": true,
                                    }),
                                );
                            }
                        }
                    }
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Check if we have enough new samples to transcribe.
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            // Transcribe only new audio — no re-transcription of old chunks.
            if pending_samples.len() >= CHUNK_INTERVAL_SAMPLES && !busy.load(Ordering::Relaxed) {
                busy.store(true, Ordering::Relaxed);

                // Take the pending samples and transcribe just this chunk.
                let chunk: Vec<f32> = pending_samples.drain(..).collect();

                if let Some(text) = Self::transcribe_chunk(&ctx, &chunk) {
                    if !text.is_empty() {
                        let _ = app_handle.emit(
                            "transcript-chunk",
                            serde_json::json!({
                                "text": text,
                                "is_final": true,
                            }),
                        );
                    }
                }

                busy.store(false, Ordering::Relaxed);
            }
        }

        info!("Live transcriber stopped");
    }

    /// Run Whisper inference on an audio chunk. Returns the full text or None on error.
    fn transcribe_chunk(ctx: &WhisperContext, samples: &[f32]) -> Option<String> {
        // Dynamic range compression: boost quiet parts (distant lecturer).
        let mut compressed = samples.to_vec();
        Self::compress_dynamic_range(&mut compressed);
        let samples = &compressed;

        let mut state = ctx.create_state().ok()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        // Speed optimizations for live transcription.
        params.set_no_context(true);
        params.set_single_segment(false);

        if state.full(params, samples).is_err() {
            return None;
        }

        let n_segments = state.full_n_segments().ok()?;
        let mut text = String::new();
        for i in 0..n_segments {
            if let Ok(seg_text) = state.full_get_segment_text(i) {
                let trimmed = seg_text.trim();
                // Skip hallucinated filler like [BLANK_AUDIO], (silence), etc.
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    continue;
                }
                if trimmed.starts_with('(') && trimmed.ends_with(')') {
                    continue;
                }
                if !text.is_empty() && !trimmed.is_empty() {
                    text.push(' ');
                }
                text.push_str(trimmed);
            }
        }
        Some(text)
    }

    /// Apply dynamic range compression to boost quiet segments while keeping
    /// loud segments from clipping. Same algorithm as WhisperLocal.
    fn compress_dynamic_range(samples: &mut [f32]) {
        const FRAME_SIZE: usize = 320; // 20ms at 16kHz
        const TARGET_RMS: f32 = 0.15;
        const MAX_GAIN: f32 = 15.0;
        const ATTACK: f32 = 0.3;
        const RELEASE: f32 = 0.05;

        if samples.is_empty() {
            return;
        }

        let mut current_gain = 1.0f32;

        for chunk in samples.chunks_mut(FRAME_SIZE) {
            let rms = (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt();
            let target_gain = if rms > 0.001 {
                (TARGET_RMS / rms).min(MAX_GAIN).max(1.0)
            } else {
                1.0
            };
            let alpha = if target_gain > current_gain { ATTACK } else { RELEASE };
            current_gain += alpha * (target_gain - current_gain);
            for s in chunk.iter_mut() {
                *s = (*s * current_gain).clamp(-1.0, 1.0);
            }
        }
    }
}

impl Drop for LiveTranscriber {
    fn drop(&mut self) {
        let _ = self.tx.send(LiveMsg::Stop);
    }
}
