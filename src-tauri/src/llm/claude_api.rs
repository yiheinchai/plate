use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::info;

use super::provider::LlmProvider;
use super::types::{LlmRequest, LlmResponse};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const API_VERSION: &str = "2023-06-01";

/// Auth mode for the Anthropic Messages API.
#[derive(Clone)]
pub enum AuthMode {
    /// Standard API key auth (x-api-key header).
    ApiKey(String),
    /// OAuth token from `claude setup-token` (Bearer auth + beta header).
    OAuthToken(String),
}

/// Anthropic Messages API provider supporting both API key and OAuth token auth.
pub struct ClaudeApiProvider {
    auth: AuthMode,
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
            auth: AuthMode::ApiKey(api_key),
            default_model: DEFAULT_MODEL.to_string(),
        }
    }

    /// Create a provider using an OAuth token from `claude setup-token`.
    pub fn with_oauth_token(token: String) -> Self {
        Self {
            auth: AuthMode::OAuthToken(token),
            default_model: DEFAULT_MODEL.to_string(),
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
        let mut req = client
            .post(ANTHROPIC_API_URL)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json");

        req = match &self.auth {
            AuthMode::ApiKey(key) => req.header("x-api-key", key),
            AuthMode::OAuthToken(token) => req
                .header("Authorization", format!("Bearer {}", token))
                .header("anthropic-beta", "oauth-2025-04-20"),
        };

        let response = req
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
