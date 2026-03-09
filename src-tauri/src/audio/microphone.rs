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
pub fn build_input_config(device: &Device, target_sample_rate: u32) -> Result<StreamConfig> {
    let supported = device
        .supported_input_configs()
        .context("Failed to query supported input configs")?;

    // Try to find a config that supports our target sample rate with f32 format.
    let mut best: Option<cpal::SupportedStreamConfigRange> = None;
    for config in supported {
        if config.sample_format() == SampleFormat::F32
            && config.min_sample_rate() <= SampleRate(target_sample_rate)
            && config.max_sample_rate() >= SampleRate(target_sample_rate)
        {
            best = Some(config);
            break;
        }
        if best.is_none() {
            best = Some(config);
        }
    }

    let range = best.context("No suitable input config found")?;
    let sample_rate = if range.min_sample_rate() <= SampleRate(target_sample_rate)
        && range.max_sample_rate() >= SampleRate(target_sample_rate)
    {
        SampleRate(target_sample_rate)
    } else {
        range.max_sample_rate()
    };

    Ok(StreamConfig {
        channels: 1,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    })
}

/// A handle to a running microphone capture stream.
pub struct MicrophoneStream {
    _stream: cpal::Stream,
}

/// Start capturing audio from the given device. Samples are pushed into `producer`.
/// Returns a handle that keeps the stream alive. The stream stops when the handle is dropped
/// or when `stop_rx` receives `true`.
pub fn start_capture(
    device: &Device,
    config: &StreamConfig,
    mut producer: ringbuf::HeapProd<f32>,
    _stop_rx: tokio::sync::watch::Receiver<bool>,
    app_handle: Option<tauri::AppHandle>,
) -> Result<MicrophoneStream> {
    let config_clone = config.clone();
    let channels = config.channels as usize;

    // Track non-silent sample count for permission detection.
    let nonsilent_count = Arc::new(AtomicU64::new(0));
    let total_count = Arc::new(AtomicU64::new(0));
    let nonsilent_clone = nonsilent_count.clone();
    let total_clone = total_count.clone();

    let stream = device.build_input_stream(
        &config_clone,
        move |data: &[f32], _info: &cpal::InputCallbackInfo| {
            // Track if we're getting real audio or silence (permission denied).
            let batch_total = data.len() as u64;
            let batch_nonsilent = data.iter().filter(|&&s| s.abs() > 1e-6).count() as u64;
            total_clone.fetch_add(batch_total, Ordering::Relaxed);
            nonsilent_clone.fetch_add(batch_nonsilent, Ordering::Relaxed);

            // If multiple channels, mix down to mono.
            if channels == 1 {
                let _ = producer.push_slice(data);
            } else {
                for chunk in data.chunks(channels) {
                    let mono: f32 = chunk.iter().sum::<f32>() / channels as f32;
                    let _ = producer.try_push(mono);
                }
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
        "Microphone capture started: device='{}', channels={}, sample_rate={}",
        device_name, config.channels, config.sample_rate.0
    );

    // Spawn a thread to check after 2 seconds if we're getting real audio.
    let sr = config.sample_rate.0;
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
