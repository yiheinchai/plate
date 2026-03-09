use serde::{Deserialize, Serialize};

/// Which LLM provider to use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmProviderType {
    /// Anthropic Messages API (requires API key).
    ClaudeApi,
    /// Claude.ai session-based access (requires setup token).
    ClaudeSession,
    /// gpt4free — free, no API key needed.
    G4f,
}

impl std::fmt::Display for LlmProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LlmProviderType::ClaudeApi => write!(f, "claude_api"),
            LlmProviderType::ClaudeSession => write!(f, "claude_session"),
            LlmProviderType::G4f => write!(f, "g4f"),
        }
    }
}

/// A message in a conversation with the LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

/// Request to generate content from the LLM.
#[derive(Debug, Clone, Deserialize)]
pub struct LlmRequest {
    pub messages: Vec<LlmMessage>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub system: Option<String>,
}

/// Response from the LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub content: String,
    pub model: String,
    pub provider: String,
    pub tokens_used: Option<u32>,
}

/// Configuration for note generation.
#[derive(Debug, Clone, Deserialize)]
pub struct NoteGenerationRequest {
    pub transcript_id: String,
    pub transcript_text: String,
    /// The prompt style: "memorization", "summary", "cornell", "outline", "custom".
    pub prompt_style: String,
    /// Custom prompt text (used only when prompt_style is "custom").
    pub custom_prompt: Option<String>,
    /// Which provider to use.
    pub provider: LlmProviderType,
    /// Model override.
    pub model: Option<String>,
}

/// Result of note generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteGenerationResult {
    pub title: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub prompt_style: String,
}
