use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::provider::LlmProvider;
use super::types::{LlmRequest, LlmResponse};

const CLAUDE_AI_BASE: &str = "https://claude.ai/api";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

/// Claude.ai session-based provider.
///
/// Uses a sessionKey cookie (obtained from the browser) to interact with
/// Claude.ai's internal conversation API, similar to how OpenClaw works.
pub struct ClaudeSessionProvider {
    /// The sessionKey value from the claude.ai cookie.
    session_key: String,
    /// Organization ID (UUID) — required for API calls.
    organization_id: String,
    default_model: String,
}

// ----- API request / response types for the internal conversation API -----

#[derive(Serialize)]
struct CreateConversationRequest {
    name: String,
    uuid: String,
}

#[derive(Deserialize)]
struct CreateConversationResponse {
    uuid: String,
}

#[derive(Serialize)]
struct CompletionRequest {
    prompt: String,
    timezone: String,
    attachments: Vec<serde_json::Value>,
}

impl ClaudeSessionProvider {
    pub fn new(session_key: String, organization_id: String) -> Self {
        Self {
            session_key,
            organization_id,
            default_model: DEFAULT_MODEL.to_string(),
        }
    }

    /// Create a provider by auto-fetching the organization ID from the session token.
    pub fn from_session_key(session_key: String) -> Result<Self> {
        let org_id = Self::fetch_organization_id(&session_key)?;
        Ok(Self {
            session_key,
            organization_id: org_id,
            default_model: DEFAULT_MODEL.to_string(),
        })
    }

    /// Fetch the organization ID from claude.ai using the session cookie.
    /// Picks the first org with "chat" capability (i.e. a Pro/Max/Enterprise account).
    pub fn fetch_organization_id(session_key: &str) -> Result<String> {
        use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT};

        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("sessionKey={}", session_key))
                .context("Invalid session key")?,
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            ),
        );

        let client = reqwest::blocking::Client::builder()
            .default_headers(headers)
            .build()
            .context("Failed to build HTTP client")?;

        let url = format!("{}/organizations", CLAUDE_AI_BASE);
        let response = client
            .get(&url)
            .send()
            .context("Failed to fetch organizations")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!(
                "Failed to fetch organizations ({}): {}. Is the session token valid?",
                status,
                body
            );
        }

        let orgs: Vec<serde_json::Value> = response
            .json()
            .context("Failed to parse organizations response")?;

        // Find the first org with "chat" capability (Pro/Max/Enterprise).
        for org in &orgs {
            if let Some(caps) = org.get("capabilities").and_then(|c| c.as_array()) {
                let has_chat = caps.iter().any(|c| c.as_str() == Some("chat"));
                if has_chat {
                    if let Some(uuid) = org.get("uuid").and_then(|u| u.as_str()) {
                        info!("Auto-detected organization: {}", uuid);
                        return Ok(uuid.to_string());
                    }
                }
            }
        }

        // Fallback: use the first org if none have "chat".
        if let Some(first) = orgs.first() {
            if let Some(uuid) = first.get("uuid").and_then(|u| u.as_str()) {
                info!("Using first organization (no chat capability found): {}", uuid);
                return Ok(uuid.to_string());
            }
        }

        anyhow::bail!("No organizations found for this session token")
    }

    /// Build a reqwest client with the session cookie set.
    fn build_client(&self) -> Result<reqwest::blocking::Client> {
        use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT};
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("sessionKey={}", self.session_key))
                .context("Invalid session key")?,
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            ),
        );
        headers.insert(
            "Content-Type",
            HeaderValue::from_static("application/json"),
        );

        reqwest::blocking::Client::builder()
            .default_headers(headers)
            .build()
            .context("Failed to build HTTP client")
    }

    /// Create a new conversation and return its UUID.
    fn create_conversation(&self, client: &reqwest::blocking::Client) -> Result<String> {
        let conv_uuid = uuid::Uuid::new_v4().to_string();
        let url = format!(
            "{}/organizations/{}/chat_conversations",
            CLAUDE_AI_BASE, self.organization_id
        );

        let body = CreateConversationRequest {
            name: String::new(),
            uuid: conv_uuid.clone(),
        };

        let response = client
            .post(&url)
            .json(&body)
            .send()
            .context("Failed to create conversation")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!(
                "Failed to create conversation ({}): {}",
                status,
                body
            );
        }

        let resp: CreateConversationResponse = response
            .json()
            .context("Failed to parse conversation response")?;

        info!("Created conversation: {}", resp.uuid);
        Ok(resp.uuid)
    }

    /// Send a message to a conversation and collect the streamed response.
    fn send_message(
        &self,
        client: &reqwest::blocking::Client,
        conversation_id: &str,
        prompt: &str,
    ) -> Result<String> {
        let url = format!(
            "{}/organizations/{}/chat_conversations/{}/completion",
            CLAUDE_AI_BASE, self.organization_id, conversation_id
        );

        let body = CompletionRequest {
            prompt: prompt.to_string(),
            timezone: "UTC".to_string(),
            attachments: vec![],
        };

        let response = client
            .post(&url)
            .json(&body)
            .send()
            .context("Failed to send completion request")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            anyhow::bail!(
                "Completion request failed ({}): {}",
                status,
                body
            );
        }

        // The response is server-sent events (SSE). Each line is a JSON object.
        // We accumulate the "completion" field from each event.
        let text = response.text().context("Failed to read response body")?;
        let mut result = String::new();

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("event:") {
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(completion) = parsed.get("completion").and_then(|v| v.as_str()) {
                        result.push_str(completion);
                    }
                }
            }
        }

        Ok(result)
    }

    /// Delete a conversation (cleanup).
    fn delete_conversation(
        &self,
        client: &reqwest::blocking::Client,
        conversation_id: &str,
    ) {
        let url = format!(
            "{}/organizations/{}/chat_conversations/{}",
            CLAUDE_AI_BASE, self.organization_id, conversation_id
        );
        if let Err(e) = client.delete(&url).send() {
            warn!("Failed to delete conversation {}: {}", conversation_id, e);
        }
    }
}

impl LlmProvider for ClaudeSessionProvider {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let client = self.build_client()?;

        // Create a temporary conversation.
        let conv_id = self.create_conversation(&client)?;

        // Build a single prompt from the system message and user messages.
        let mut prompt = String::new();
        if let Some(system) = &request.system {
            prompt.push_str(system);
            prompt.push_str("\n\n");
        }
        for msg in &request.messages {
            match msg.role.as_str() {
                "user" => {
                    prompt.push_str(&msg.content);
                    prompt.push('\n');
                }
                "assistant" => {
                    // For multi-turn, include assistant messages as context.
                    prompt.push_str("[Previous assistant response]\n");
                    prompt.push_str(&msg.content);
                    prompt.push('\n');
                }
                _ => {}
            }
        }

        let content = self.send_message(&client, &conv_id, &prompt)?;

        // Cleanup: delete the temporary conversation.
        self.delete_conversation(&client, &conv_id);

        let model = request
            .model
            .as_deref()
            .unwrap_or(&self.default_model)
            .to_string();

        Ok(LlmResponse {
            content,
            model,
            provider: self.provider_name().to_string(),
            tokens_used: None,
        })
    }

    fn provider_name(&self) -> &str {
        "claude_session"
    }

    fn default_model(&self) -> &str {
        &self.default_model
    }
}
