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

        let mut all_samples: Vec<f32> = Vec::new();
        let mut last_transcribed_len: usize = 0;
        let busy = Arc::new(AtomicBool::new(false));
        // Track the cumulative text so we only emit new text.
        let mut prev_text = String::new();

        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                Ok(LiveMsg::Samples(samples)) => {
                    all_samples.extend_from_slice(&samples);
                }
                Ok(LiveMsg::Stop) => {
                    info!("Live transcriber stopping");
                    // Do one final transcription of any remaining audio.
                    if all_samples.len() > last_transcribed_len {
                        if let Some(text) = Self::transcribe_chunk(&ctx, &all_samples) {
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

            // Check if we have enough new audio to run inference.
            let new_samples = all_samples.len() - last_transcribed_len;
            if new_samples >= CHUNK_INTERVAL_SAMPLES && !busy.load(Ordering::Relaxed) {
                busy.store(true, Ordering::Relaxed);
                last_transcribed_len = all_samples.len();

                // Run inference on all accumulated audio for context coherence.
                // For long recordings, limit to the last ~30 seconds to keep it fast.
                let max_context = 16000 * 30; // 30 seconds
                let start = if all_samples.len() > max_context {
                    all_samples.len() - max_context
                } else {
                    0
                };
                let audio_slice = all_samples[start..].to_vec();

                if let Some(text) = Self::transcribe_chunk(&ctx, &audio_slice) {
                    // Emit only the new portion of text.
                    let new_text = if text.len() > prev_text.len()
                        && text.starts_with(&prev_text)
                    {
                        text[prev_text.len()..].trim_start().to_string()
                    } else {
                        text.clone()
                    };

                    if !new_text.is_empty() {
                        let _ = app_handle.emit(
                            "transcript-chunk",
                            serde_json::json!({
                                "text": new_text,
                                "is_final": true,
                            }),
                        );
                    }
                    prev_text = text;
                }

                busy.store(false, Ordering::Relaxed);
            }
        }

        info!("Live transcriber stopped");
    }

    /// Run Whisper inference on an audio chunk. Returns the full text or None on error.
    fn transcribe_chunk(ctx: &WhisperContext, samples: &[f32]) -> Option<String> {
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
}

impl Drop for LiveTranscriber {
    fn drop(&mut self) {
        let _ = self.tx.send(LiveMsg::Stop);
    }
}
