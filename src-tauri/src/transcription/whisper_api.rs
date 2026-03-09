use anyhow::{Context, Result};
use reqwest::blocking::multipart;
use std::path::Path;
use tracing::info;

use super::engine::TranscriptionEngine;
use super::types::{TranscriptSegment, TranscriptionConfig, TranscriptionResult};

/// OpenAI Whisper API transcription engine.
pub struct WhisperApi {
    api_key: String,
    base_url: String,
}

/// Response format for the verbose_json endpoint.
#[derive(Debug, serde::Deserialize)]
struct WhisperApiResponse {
    text: String,
    #[serde(default)]
    segments: Vec<ApiSegment>,
    #[serde(default)]
    language: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiSegment {
    start: f64,
    end: f64,
    text: String,
}

impl WhisperApi {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.openai.com/v1/audio/transcriptions".to_string(),
        }
    }

    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self { api_key, base_url }
    }
}

impl TranscriptionEngine for WhisperApi {
    fn transcribe(&self, config: &TranscriptionConfig) -> Result<TranscriptionResult> {
        let model = config.model.as_deref().unwrap_or("whisper-1");
        let language = config.language.as_deref().unwrap_or("en");
        let audio_path = Path::new(&config.audio_path);

        if !audio_path.exists() {
            anyhow::bail!("Audio file not found: {}", audio_path.display());
        }

        info!(
            "Sending audio to OpenAI Whisper API (model: {}, language: {})",
            model, language
        );

        let file_bytes = std::fs::read(audio_path).context("Failed to read audio file")?;
        let file_name = audio_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("audio.wav")
            .to_string();

        let file_part = multipart::Part::bytes(file_bytes)
            .file_name(file_name)
            .mime_str("audio/wav")?;

        let form = multipart::Form::new()
            .part("file", file_part)
            .text("model", model.to_string())
            .text("language", language.to_string())
            .text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "segment");

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&self.base_url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .context("Failed to send request to Whisper API")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!("Whisper API error ({}): {}", status, body);
        }

        let api_response: WhisperApiResponse = response
            .json()
            .context("Failed to parse Whisper API response")?;

        let segments: Vec<TranscriptSegment> = api_response
            .segments
            .into_iter()
            .map(|s| TranscriptSegment {
                start_ms: (s.start * 1000.0) as i64,
                end_ms: (s.end * 1000.0) as i64,
                text: s.text,
            })
            .collect();

        info!("API transcription complete: {} segments", segments.len());

        Ok(TranscriptionResult {
            full_text: api_response.text,
            segments,
            language: api_response.language.unwrap_or_else(|| language.to_string()),
            engine: "api".to_string(),
            model: Some(model.to_string()),
        })
    }
}
