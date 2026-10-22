use anyhow::{Context, Result};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tracing::info;

use super::engine::TranscriptionEngine;
use super::model_manager::ModelManager;
use super::types::{TranscriptSegment, TranscriptionConfig, TranscriptionResult};

#[repr(C)]
pub struct P2Engine {
    _private: [u8; 0],
}

#[repr(C)]
pub struct P2Stream {
    _private: [u8; 0],
}

#[repr(C)]
pub struct P2Word {
    pub text: *mut c_char,
    pub start: f32,
    pub end: f32,
}

#[repr(C)]
pub struct P2Token {
    pub id: c_int,
    pub frame: c_int,
    pub duration: c_int,
}

#[repr(C)]
pub struct P2Segment {
    pub start: f32,
    pub end: f32,
    pub text: *mut c_char,
    pub first_word: c_int,
    pub n_words: c_int,
    pub first_token: c_int,
    pub n_tokens: c_int,
}

#[repr(C)]
pub struct P2Result {
    pub text: *mut c_char,
    pub words: *mut P2Word,
    pub n_words: c_int,
    pub tokens: *mut P2Token,
    pub n_tokens: c_int,
    pub segments: *mut P2Segment,
    pub n_segments: c_int,
    pub encoder_frames: c_int,
    pub duration_seconds: f32,
    pub t_mel: f64,
    pub t_encoder: f64,
    pub t_decoder: f64,
}

pub type P2ProgressFn = extern "C" fn(percent: c_int, user_data: *mut c_void);

extern "C" {
    pub fn p2_engine_open(weights_dir: *const c_char) -> *mut P2Engine;
    pub fn p2_engine_close(e: *mut P2Engine);
    pub fn p2_transcribe(
        e: *const P2Engine,
        audio: *const f32,
        n_samples: c_int,
        sample_rate: c_int,
        out: *mut P2Result,
    ) -> c_int;
    pub fn p2_transcribe_with_progress(
        e: *const P2Engine,
        audio: *const f32,
        n_samples: c_int,
        sample_rate: c_int,
        out: *mut P2Result,
        progress_fn: Option<P2ProgressFn>,
        user_data: *mut c_void,
    ) -> c_int;
    pub fn p2_result_free(r: *mut P2Result);
    pub fn p2_free(p: *mut c_void);
    pub fn p2_stream_open(e: *const P2Engine, sample_rate: c_int) -> *mut P2Stream;
    pub fn p2_stream_close(s: *mut P2Stream);
    pub fn p2_stream_feed(s: *mut P2Stream, audio: *const f32, n_samples: c_int) -> c_int;
    pub fn p2_stream_next(s: *mut P2Stream) -> *const P2Segment;
    pub fn p2_stream_partial(s: *mut P2Stream) -> *mut c_char;
    pub fn p2_stream_finish(s: *mut P2Stream) -> c_int;
}

extern "C" fn progress_trampoline(percent: c_int, user_data: *mut c_void) {
    if user_data.is_null() {
        return;
    }
    let app_handle = unsafe { &*(user_data as *const tauri::AppHandle) };
    let _ = app_handle.emit(
        "transcription-progress",
        serde_json::json!({
            "progress": percent,
        }),
    );
}

/// Safe RAII wrapper around `P2Engine`.
pub struct PhononEngineHandle {
    ptr: *mut P2Engine,
}

unsafe impl Send for PhononEngineHandle {}
unsafe impl Sync for PhononEngineHandle {}

impl PhononEngineHandle {
    pub fn open(weights_dir: &Path) -> Result<Self> {
        let dir_str = weights_dir.to_str().context("Invalid weights directory path")?;
        let c_dir = CString::new(dir_str).context("Null byte in weights directory path")?;
        let ptr = unsafe { p2_engine_open(c_dir.as_ptr()) };
        if ptr.is_null() {
            anyhow::bail!(
                "Failed to load Phonon-2 weights from {}",
                weights_dir.display()
            );
        }
        Ok(Self { ptr })
    }

    pub fn as_ptr(&self) -> *const P2Engine {
        self.ptr
    }
}

impl Drop for PhononEngineHandle {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe { p2_engine_close(self.ptr) };
        }
    }
}

/// Local Phonon-2 transcription engine using the pure-C phonon-2-c runtime.
pub struct PhononLocal {
    models_dir: PathBuf,
    app_handle: Option<tauri::AppHandle>,
}

impl PhononLocal {
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            models_dir,
            app_handle: None,
        }
    }

    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Load audio from a WAV file and convert to mono f32 samples along with its sample rate.
    fn load_wav_mono(path: &Path) -> Result<(Vec<f32>, u32)> {
        let reader = hound::WavReader::open(path).context("Failed to open WAV file")?;
        let spec = reader.spec();
        let sample_rate = spec.sample_rate;
        let channels = spec.channels as usize;

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

        let mono: Vec<f32> = if channels > 1 {
            samples
                .chunks(channels)
                .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                .collect()
        } else {
            samples
        };

        Ok((mono, sample_rate))
    }

    /// Group word-level timestamps into sentence/phrase-level segments for TranscriptViewer.
    fn build_segments_from_result(res: &P2Result) -> Vec<TranscriptSegment> {
        let mut segments = Vec::new();

        if res.n_words > 0 && !res.words.is_null() {
            let words_slice = unsafe { std::slice::from_raw_parts(res.words, res.n_words as usize) };
            let mut cur_words: Vec<String> = Vec::new();
            let mut seg_start_ms: i64 = 0;
            let mut seg_end_ms: i64 = 0;

            for w in words_slice {
                if w.text.is_null() {
                    continue;
                }
                let word_str = unsafe { CStr::from_ptr(w.text) }
                    .to_string_lossy()
                    .trim()
                    .to_string();
                if word_str.is_empty() {
                    continue;
                }

                let w_start_ms = (w.start * 1000.0).round() as i64;
                let w_end_ms = (w.end * 1000.0).round().max(w_start_ms as f32) as i64;

                // Start a new segment if there's a long pause (>= 800ms) before this word.
                if !cur_words.is_empty() && w_start_ms - seg_end_ms >= 800 {
                    segments.push(TranscriptSegment {
                        start_ms: seg_start_ms,
                        end_ms: seg_end_ms,
                        text: cur_words.join(" "),
                    });
                    cur_words.clear();
                }

                if cur_words.is_empty() {
                    seg_start_ms = w_start_ms;
                }
                seg_end_ms = w_end_ms;
                let ends_sentence = word_str.ends_with('.')
                    || word_str.ends_with('?')
                    || word_str.ends_with('!');
                cur_words.push(word_str);

                let duration_ms = seg_end_ms - seg_start_ms;
                if (ends_sentence && (cur_words.len() >= 5 || duration_ms >= 2500))
                    || cur_words.len() >= 24
                    || duration_ms >= 10_000
                {
                    segments.push(TranscriptSegment {
                        start_ms: seg_start_ms,
                        end_ms: seg_end_ms,
                        text: cur_words.join(" "),
                    });
                    cur_words.clear();
                }
            }

            if !cur_words.is_empty() {
                segments.push(TranscriptSegment {
                    start_ms: seg_start_ms,
                    end_ms: seg_end_ms,
                    text: cur_words.join(" "),
                });
            }
        } else if res.n_segments > 0 && !res.segments.is_null() {
            let segs_slice =
                unsafe { std::slice::from_raw_parts(res.segments, res.n_segments as usize) };
            for s in segs_slice {
                if s.text.is_null() {
                    continue;
                }
                let text = unsafe { CStr::from_ptr(s.text) }
                    .to_string_lossy()
                    .trim()
                    .to_string();
                if text.is_empty() {
                    continue;
                }
                segments.push(TranscriptSegment {
                    start_ms: (s.start * 1000.0).round() as i64,
                    end_ms: (s.end * 1000.0).round() as i64,
                    text,
                });
            }
        }

        segments
    }
}

impl TranscriptionEngine for PhononLocal {
    fn transcribe(&self, config: &TranscriptionConfig) -> Result<TranscriptionResult> {
        let model_name = config.model.as_deref().unwrap_or("phonon-2");
        let manager = ModelManager::new(self.models_dir.clone());

        if !manager.is_downloaded(model_name) {
            info!("Phonon-2 model not found, auto-downloading {}", model_name);
            if let Some(ref app_handle) = self.app_handle {
                manager.download_model_with_progress(model_name, app_handle)?;
            } else {
                manager.download_model(model_name)?;
            }
        }

        let weights_dir = manager.model_path(model_name);
        info!("Loading Phonon-2 model from {}", weights_dir.display());
        let engine = PhononEngineHandle::open(&weights_dir)?;

        let audio_path = Path::new(&config.audio_path);
        let (samples, sample_rate) = Self::load_wav_mono(audio_path)?;

        info!(
            "Transcribing {} samples ({} Hz) with Phonon-2",
            samples.len(),
            sample_rate
        );

        let mut raw_res: P2Result = unsafe { std::mem::zeroed() };
        let rc = if let Some(ref app_handle) = self.app_handle {
            let user_data = app_handle as *const tauri::AppHandle as *mut c_void;
            unsafe {
                p2_transcribe_with_progress(
                    engine.as_ptr(),
                    samples.as_ptr(),
                    samples.len() as c_int,
                    sample_rate as c_int,
                    &mut raw_res,
                    Some(progress_trampoline),
                    user_data,
                )
            }
        } else {
            unsafe {
                p2_transcribe(
                    engine.as_ptr(),
                    samples.as_ptr(),
                    samples.len() as c_int,
                    sample_rate as c_int,
                    &mut raw_res,
                )
            }
        };

        if rc != 0 {
            unsafe { p2_result_free(&mut raw_res) };
            anyhow::bail!("Phonon-2 transcription failed");
        }

        let full_text = if !raw_res.text.is_null() {
            unsafe { CStr::from_ptr(raw_res.text) }
                .to_string_lossy()
                .trim()
                .to_string()
        } else {
            String::new()
        };

        let segments = Self::build_segments_from_result(&raw_res);
        unsafe { p2_result_free(&mut raw_res) };

        info!(
            "Phonon-2 transcription complete: {} segments ({} chars)",
            segments.len(),
            full_text.len()
        );

        Ok(TranscriptionResult {
            full_text,
            segments,
            language: "en".to_string(),
            engine: "local".to_string(),
            model: Some(model_name.to_string()),
        })
    }
}
