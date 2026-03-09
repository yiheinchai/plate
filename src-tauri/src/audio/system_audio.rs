use anyhow::Result;
use ringbuf::traits::Producer;
use std::sync::Mutex;
use tracing::{error, info};

#[cfg(target_os = "macos")]
use screencapturekit::prelude::*;

/// A handle to a running system audio capture stream.
/// When dropped, the capture stops.
pub struct SystemAudioStream {
    #[cfg(target_os = "macos")]
    stream: SCStream,
}

impl Drop for SystemAudioStream {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        {
            if let Err(e) = self.stream.stop_capture() {
                error!("Failed to stop system audio capture: {}", e);
            }
        }
        info!("System audio capture stopped");
    }
}

/// Start capturing system (desktop) audio on macOS using ScreenCaptureKit.
///
/// Captured samples are pushed into `producer` as mono f32 at the configured sample rate.
/// Returns a handle that keeps the capture alive until dropped.
///
/// # Platform
/// This only works on macOS 13+. On other platforms it returns an error.
#[cfg(target_os = "macos")]
pub fn start_system_capture(
    producer: ringbuf::HeapProd<f32>,
    sample_rate: u32,
) -> Result<SystemAudioStream> {
    // 1. Enumerate displays and pick the main one.
    let content = SCShareableContent::get()
        .map_err(|e| anyhow::anyhow!("Failed to get shareable content: {}", e))?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No display found for system audio capture"))?;

    // 2. Create a content filter for the main display (captures all audio on that display).
    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&[])
        .build();

    // 3. Configure for audio-only capture.
    let config = SCStreamConfiguration::new()
        .with_captures_audio(true)
        .with_excludes_current_process_audio(true)
        .with_sample_rate(sample_rate as i32)
        .with_channel_count(1);

    // 4. Create the stream and add an audio output handler.
    let mut stream = SCStream::new(&filter, &config);

    // Wrap producer in Mutex for interior mutability (handler requires Fn, not FnMut).
    let producer = Mutex::new(producer);

    stream.add_output_handler(
        move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
            if !matches!(of_type, SCStreamOutputType::Audio) {
                return;
            }

            // Get the audio buffer list from the sample.
            let buffer_list = match sample.audio_buffer_list() {
                Some(list) => list,
                None => return,
            };

            let mut prod = match producer.lock() {
                Ok(p) => p,
                Err(_) => return,
            };

            // Check the audio format to determine how to interpret the data.
            let is_float = sample
                .format_description()
                .map(|fmt| fmt.audio_is_float())
                .unwrap_or(true);
            let bits = sample
                .format_description()
                .and_then(|fmt| fmt.audio_bits_per_channel())
                .unwrap_or(32);

            for buffer in buffer_list.iter() {
                let raw_data = buffer.data();
                if raw_data.is_empty() {
                    continue;
                }

                if is_float && bits == 32 {
                    // f32 PCM — the common case for ScreenCaptureKit audio.
                    let samples: &[f32] = unsafe {
                        std::slice::from_raw_parts(
                            raw_data.as_ptr() as *const f32,
                            raw_data.len() / 4,
                        )
                    };
                    let _ = prod.push_slice(samples);
                } else if bits == 16 {
                    // i16 PCM — convert to f32.
                    let i16_data: &[i16] = unsafe {
                        std::slice::from_raw_parts(
                            raw_data.as_ptr() as *const i16,
                            raw_data.len() / 2,
                        )
                    };
                    for &s in i16_data {
                        let _ = prod.try_push(s as f32 / 32768.0);
                    }
                } else if is_float && bits == 64 {
                    // f64 PCM — convert to f32.
                    let f64_data: &[f64] = unsafe {
                        std::slice::from_raw_parts(
                            raw_data.as_ptr() as *const f64,
                            raw_data.len() / 8,
                        )
                    };
                    for &s in f64_data {
                        let _ = prod.try_push(s as f32);
                    }
                }
            }
        },
        SCStreamOutputType::Audio,
    );

    // 5. Start capturing.
    stream
        .start_capture()
        .map_err(|e| anyhow::anyhow!("Failed to start system audio capture: {}", e))?;

    info!(
        "System audio capture started at {} Hz (mono)",
        sample_rate
    );

    Ok(SystemAudioStream { stream })
}

#[cfg(not(target_os = "macos"))]
pub fn start_system_capture(
    _producer: ringbuf::HeapProd<f32>,
    _sample_rate: u32,
) -> Result<SystemAudioStream> {
    anyhow::bail!("System audio capture is only supported on macOS")
}
