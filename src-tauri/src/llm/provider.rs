use anyhow::Result;

use super::types::{LlmRequest, LlmResponse};

/// Trait for LLM providers (Claude API, Claude session, etc.).
pub trait LlmProvider: Send + Sync {
    /// Send a completion request and return the response.
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse>;

    /// Provider name for logging / storage.
    fn provider_name(&self) -> &str;

    /// Default model name for this provider.
    fn default_model(&self) -> &str;
}
