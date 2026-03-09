use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::info;

use super::provider::LlmProvider;
use super::types::{LlmRequest, LlmResponse};

/// Default: Pollinations.ai — free, no-auth, OpenAI-compatible API.
const DEFAULT_URL: &str = "https://text.pollinations.ai/openai";
const DEFAULT_MODEL: &str = "openai";

/// Free LLM provider using Pollinations.ai (default) or any OpenAI-compatible endpoint.
/// Works out of the box — no API key, no server, no setup.
pub struct G4fProvider {
    url: String,
    default_model: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
    model: Option<String>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
}

impl G4fProvider {
    pub fn new(custom_url: Option<String>) -> Self {
        let url = custom_url
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_URL.to_string());
        Self {
            default_model: DEFAULT_MODEL.to_string(),
            url,
        }
    }
}

impl LlmProvider for G4fProvider {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let model = request
            .model
            .as_deref()
            .unwrap_or(&self.default_model)
            .to_string();
        let max_tokens = request.max_tokens;

        let mut messages: Vec<ChatMessage> = Vec::new();
        if let Some(system) = &request.system {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }
        for msg in &request.messages {
            messages.push(ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        let chat_request = ChatRequest {
            model: model.clone(),
            messages,
            max_tokens,
            stream: false,
        };

        info!("Sending request to free API (model: {}, url: {})", model, self.url);

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .context("Failed to build HTTP client")?;

        let response = client
            .post(&self.url)
            .header("content-type", "application/json")
            .json(&chat_request)
            .send()
            .context("Failed to connect to free API")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!("Free API error ({}): {}", status, body);
        }

        let body = response.text().context("Failed to read API response body")?;

        info!("Free API raw response: {}", &body[..body.len().min(500)]);

        let chat_response: ChatResponse = serde_json::from_str(&body)
            .with_context(|| format!("Failed to parse API response: {}", &body[..body.len().min(500)]))?;

        let content = chat_response
            .choices
            .into_iter()
            .filter_map(|c| c.message.content)
            .collect::<Vec<_>>()
            .join("");

        if content.trim().is_empty() {
            anyhow::bail!(
                "The AI returned an empty response. The free API (Pollinations) may be overloaded — try again in a moment."
            );
        }

        let actual_model = chat_response.model.unwrap_or(model);

        Ok(LlmResponse {
            content,
            model: actual_model,
            provider: self.provider_name().to_string(),
            tokens_used: None,
        })
    }

    fn provider_name(&self) -> &str {
        "free"
    }

    fn default_model(&self) -> &str {
        &self.default_model
    }
}
