use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::info;

use super::provider::LlmProvider;
use super::types::{LlmRequest, LlmResponse};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";
const API_VERSION: &str = "2023-06-01";

/// Standard Anthropic Messages API provider.
pub struct ClaudeApiProvider {
    api_key: String,
    default_model: String,
}

#[derive(Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<ApiMessage>,
}

#[derive(Serialize)]
struct ApiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ApiResponse {
    content: Vec<ContentBlock>,
    model: String,
    usage: Usage,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct Usage {
    output_tokens: u32,
}

impl ClaudeApiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            default_model: DEFAULT_MODEL.to_string(),
        }
    }

    pub fn with_model(api_key: String, model: String) -> Self {
        Self {
            api_key,
            default_model: model,
        }
    }
}

impl LlmProvider for ClaudeApiProvider {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let model = request
            .model
            .as_deref()
            .unwrap_or(&self.default_model)
            .to_string();
        let max_tokens = request.max_tokens.unwrap_or(4096);

        let api_messages: Vec<ApiMessage> = request
            .messages
            .iter()
            .map(|m| ApiMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let api_request = ApiRequest {
            model: model.clone(),
            max_tokens,
            system: request.system.clone(),
            messages: api_messages,
        };

        info!("Sending request to Anthropic API (model: {})", model);

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(ANTHROPIC_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&api_request)
            .send()
            .context("Failed to send request to Anthropic API")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!("Anthropic API error ({}): {}", status, body);
        }

        let api_response: ApiResponse = response
            .json()
            .context("Failed to parse Anthropic API response")?;

        let content = api_response
            .content
            .into_iter()
            .map(|block| block.text)
            .collect::<Vec<_>>()
            .join("");

        Ok(LlmResponse {
            content,
            model: api_response.model,
            provider: self.provider_name().to_string(),
            tokens_used: Some(api_response.usage.output_tokens),
        })
    }

    fn provider_name(&self) -> &str {
        "claude_api"
    }

    fn default_model(&self) -> &str {
        &self.default_model
    }
}
