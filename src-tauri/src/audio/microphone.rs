use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, SampleRate, StreamConfig};
use ringbuf::traits::*;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tracing::{error, info, warn};

use super::types::AudioDevice;

/// List available microphone input devices.
pub fn list_input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_device = host.default_input_device();
    let default_name = default_device
        .as_ref()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    info!("Audio host: {:?}, default input device: '{}'", host.id(), default_name);

    let mut devices = Vec::new();
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                info!("  Found input device: '{}'", name);
                devices.push(AudioDevice {
                    is_default: name == default_name,
                    name,
                });
            }
        }
    }
    Ok(devices)
}

/// Get an input device by name, or the default if name is None.
pub fn get_input_device(name: Option<&str>) -> Result<Device> {
    let host = cpal::default_host();
    match name {
        Some(device_name) => {
            info!("Looking for input device: '{}'", device_name);
            let devices = host
                .input_devices()
                .context("Failed to enumerate input devices")?;
            for device in devices {
                if device.name().ok().as_deref() == Some(device_name) {
                    info!("Found requested input device: '{}'", device_name);
                    return Ok(device);
                }
            }
            anyhow::bail!("Input device '{}' not found", device_name);
        }
        None => {
            let device = host
                .default_input_device()
                .context("No default input device available")?;
            let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
            info!("Using default input device: '{}'", device_name);
            Ok(device)
        }
    }
}

/// Build a cpal stream config targeting the desired sample rate.
///
/// Returns the stream config using the device's supported channels and the best
/// available sample rate. The actual sample rate may differ from `target_sample_rate`
/// if the device doesn't support it natively — the caller must resample.
pub fn build_input_config(device: &Device, target_sample_rate: u32) -> Result<StreamConfig> {
    let supported: Vec<_> = device
        .supported_input_configs()
        .context("Failed to query supported input configs")?
        .collect();

    // Try to find a config that supports our target sample rate with f32 format.
    let mut best: Option<&cpal::SupportedStreamConfigRange> = None;
    for config in &supported {
        if config.sample_format() == SampleFormat::F32
            && config.min_sample_rate() <= SampleRate(target_sample_rate)
            && config.max_sample_rate() >= SampleRate(target_sample_rate)
        {
            best = Some(config);
            break;
        }
        // Prefer f32 configs even if they don't support the target rate.
        if best.is_none() || config.sample_format() == SampleFormat::F32 {
            best = Some(config);
        }
    }

    let range = best.context("No suitable input config found")?;
    let sample_rate = if range.min_sample_rate() <= SampleRate(target_sample_rate)
        && range.max_sample_rate() >= SampleRate(target_sample_rate)
    {
        SampleRate(target_sample_rate)
    } else {
        // Device doesn't support target rate — use closest supported rate.
        range.max_sample_rate()
    };

    let channels = range.channels();
    info!(
        "Selected input config: format={:?}, channels={}, sample_rate={} (target={})",
        range.sample_format(), channels, sample_rate.0, target_sample_rate
    );

    Ok(StreamConfig {
        channels,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    })
}

/// A handle to a running microphone capture stream.
pub struct MicrophoneStream {
    _stream: cpal::Stream,
}

/// Start capturing audio from the given device. Samples are pushed into `producer`
/// as mono f32 at `target_sample_rate`. Resampling is performed if the device's
/// native rate differs from the target.
///
/// Returns a handle that keeps the stream alive. The stream stops when the handle is dropped
/// or when `stop_rx` receives `true`.
pub fn start_capture(
    device: &Device,
    config: &StreamConfig,
    target_sample_rate: u32,
    mut producer: ringbuf::HeapProd<f32>,
    _stop_rx: tokio::sync::watch::Receiver<bool>,
    app_handle: Option<tauri::AppHandle>,
) -> Result<MicrophoneStream> {
    let config_clone = config.clone();
    let channels = config.channels as usize;
    let device_rate = config.sample_rate.0;
    let needs_resample = device_rate != target_sample_rate;

    if needs_resample {
        info!(
            "Microphone resampling enabled: {}Hz -> {}Hz",
            device_rate, target_sample_rate
        );
    }

    // Track non-silent sample count for permission detection.
    let nonsilent_count = Arc::new(AtomicU64::new(0));
    let total_count = Arc::new(AtomicU64::new(0));
    let nonsilent_clone = nonsilent_count.clone();
    let total_clone = total_count.clone();

    // Resampling state: fractional position in the source stream.
    let resample_ratio = target_sample_rate as f64 / device_rate as f64;
    let mut resample_frac: f64 = 0.0;

    let stream = device.build_input_stream(
        &config_clone,
        move |data: &[f32], _info: &cpal::InputCallbackInfo| {
            // Track if we're getting real audio or silence (permission denied).
            let batch_total = data.len() as u64;
            let batch_nonsilent = data.iter().filter(|&&s| s.abs() > 1e-6).count() as u64;
            total_clone.fetch_add(batch_total, Ordering::Relaxed);
            nonsilent_clone.fetch_add(batch_nonsilent, Ordering::Relaxed);

            // Step 1: Mix down to mono if needed.
            let mono: Vec<f32>;
            let mono_data: &[f32] = if channels == 1 {
                data
            } else {
                mono = data
                    .chunks(channels)
                    .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                    .collect();
                &mono
            };

            // Step 2: Resample if device rate differs from target rate.
            if !needs_resample {
                let _ = producer.push_slice(mono_data);
            } else {
                // Linear interpolation resampling.
                let src_len = mono_data.len();
                if src_len == 0 {
                    return;
                }
                while resample_frac < src_len as f64 {
                    let idx = resample_frac as usize;
                    let frac = resample_frac - idx as f64;
                    let sample = if idx + 1 < src_len {
                        mono_data[idx] * (1.0 - frac as f32) + mono_data[idx + 1] * frac as f32
                    } else {
                        mono_data[idx]
                    };
                    let _ = producer.try_push(sample);
                    resample_frac += 1.0 / resample_ratio;
                }
                // Keep the fractional remainder for the next callback.
                resample_frac -= src_len as f64;
            }
        },
        move |err| {
            error!("Microphone stream error: {}", err);
        },
        None,
    )?;

    stream.play().context("Failed to start microphone stream")?;
    let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
    info!(
        "Microphone capture started: device='{}', channels={}, device_rate={}, target_rate={}",
        device_name, config.channels, device_rate, target_sample_rate
    );

    // Spawn a thread to check after 2 seconds if we're getting real audio.
    let sr = device_rate;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let total = total_count.load(Ordering::Relaxed);
        let nonsilent = nonsilent_count.load(Ordering::Relaxed);
        if total > 0 {
            let ratio = nonsilent as f64 / total as f64;
            info!(
                "Microphone audio check after 2s: {}/{} samples non-silent ({:.1}%)",
                nonsilent, total, ratio * 100.0
            );
            if total > (sr as u64) && ratio < 0.01 {
                let msg = "Microphone appears to be delivering silence. \
                     Grant microphone access to your terminal app (e.g. VS Code, Terminal) \
                     in System Settings > Privacy & Security > Microphone.";
                warn!("{}", msg);
                if let Some(ref handle) = app_handle {
                    use tauri::Emitter;
                    let _ = handle.emit("recording-error", msg.to_string());
                }
            }
        }
    });

    Ok(MicrophoneStream { _stream: stream })
}
