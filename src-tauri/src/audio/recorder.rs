use anyhow::{Context, Result};
use hound::{WavSpec, WavWriter};
use ringbuf::{HeapRb, traits::*};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::sync::watch;
use tracing::{info, warn};

use super::live_transcriber::LiveTranscriber;
use super::microphone;
use super::system_audio;
use super::types::{AudioSource, RecordingConfig, RecordingResult};

/// Size of the ring buffer in samples (~10 seconds at 16 kHz).
const RING_BUFFER_SIZE: usize = 16000 * 10;

/// Manages a recording session: captures audio from the chosen source(s),
/// drains a ring buffer, and writes a WAV file.
pub struct Recorder {
    config: RecordingConfig,
    output_path: PathBuf,
    sample_rate: u32,
    app_handle: tauri::AppHandle,
    models_dir: PathBuf,
}

impl Recorder {
    pub fn new(
        config: RecordingConfig,
        output_path: PathBuf,
        app_handle: tauri::AppHandle,
        models_dir: PathBuf,
    ) -> Self {
        let sample_rate = config.sample_rate.unwrap_or(16000);
        Self {
            config,
            output_path,
            sample_rate,
            app_handle,
            models_dir,
        }
    }

    /// Run the recording synchronously (blocking). Call from a dedicated thread.
    ///
    /// `stop_rx` is a watch channel receiver — when the value becomes `true`,
    /// the recording stops and the WAV file is finalized.
    pub fn run_blocking(&self, stop_rx: watch::Receiver<bool>) -> Result<RecordingResult> {
        let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (producer, mut consumer) = rb.split();

        // Start the appropriate capture stream(s).
        // Both handles must be kept alive for the duration of the recording.
        let (_mic_stream, _sys_stream) = match self.config.source {
            AudioSource::Microphone | AudioSource::Both => {
                let device = microphone::get_input_device(self.config.device_name.as_deref())?;
                let stream_config =
                    microphone::build_input_config(&device, self.sample_rate)?;
                let stream = microphone::start_capture(
                    &device,
                    &stream_config,
                    producer,
                    stop_rx.clone(),
                    Some(self.app_handle.clone()),
                )?;
                (Some(stream), None)
            }
            AudioSource::SystemAudio => {
                let sys = system_audio::start_system_capture(producer, self.sample_rate)?;
                (None, Some(sys))
            }
        };

        // TODO: For AudioSource::Both, we would need two ring buffers and mix them.
        // For now, Both falls through to microphone only with a warning.
        if self.config.source == AudioSource::Both {
            warn!("Combined mic+system capture not fully implemented; only microphone is active");
        }

        // Start live transcriber.
        let live_transcriber = LiveTranscriber::new(
            self.app_handle.clone(),
            self.models_dir.clone(),
            "ggml-tiny.en".to_string(),
        );

        // Set up WAV writer.
        let spec = WavSpec {
            channels: 1,
            sample_rate: self.sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer =
            WavWriter::create(&self.output_path, spec).context("Failed to create WAV file")?;

        let mut total_samples: u64 = 0;
        let mut buf = vec![0.0f32; 4096];
        let mut level_samples: u64 = 0;
        let mut level_sum_sq: f32 = 0.0;
        // Emit audio level every ~100ms worth of samples.
        let level_interval = (self.sample_rate / 10) as u64;

        info!(
            "Recording to {} at {} Hz",
            self.output_path.display(),
            self.sample_rate
        );

        // Drain loop: pull from ring buffer and write to WAV until stop signal.
        loop {
            // Check stop signal.
            if *stop_rx.borrow() {
                // Drain remaining samples before exiting.
                let remaining = consumer.pop_slice(&mut buf);
                for &sample in &buf[..remaining] {
                    writer.write_sample(sample)?;
                    total_samples += 1;
                }
                if let Some(ref lt) = live_transcriber {
                    lt.push_samples(&buf[..remaining]);
                    lt.stop();
                }
                break;
            }

            let count = consumer.pop_slice(&mut buf);
            if count > 0 {
                for &sample in &buf[..count] {
                    writer.write_sample(sample)?;
                    total_samples += 1;
                    level_sum_sq += sample * sample;
                    level_samples += 1;
                }

                // Feed samples to live transcriber.
                if let Some(ref lt) = live_transcriber {
                    lt.push_samples(&buf[..count]);
                }

                // Emit audio level periodically.
                if level_samples >= level_interval {
                    let rms = (level_sum_sq / level_samples as f32).sqrt();
                    // Normalize to 0..1 range (clamp at reasonable max).
                    let level = (rms * 5.0).min(1.0);
                    let _ = self.app_handle.emit(
                        "audio-level",
                        serde_json::json!({ "level": level }),
                    );
                    level_sum_sq = 0.0;
                    level_samples = 0;
                }
            } else {
                // No data available — sleep briefly to avoid busy-waiting.
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }

        writer.finalize().context("Failed to finalize WAV file")?;

        let duration_ms = if self.sample_rate > 0 {
            (total_samples * 1000) / self.sample_rate as u64
        } else {
            0
        };

        info!(
            "Recording complete: {} samples, {} ms",
            total_samples, duration_ms
        );

        Ok(RecordingResult {
            file_path: self.output_path.to_string_lossy().into_owned(),
            duration_ms,
            sample_rate: self.sample_rate,
            source: self.config.source.clone(),
        })
    }
}
