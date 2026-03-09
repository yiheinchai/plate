use anyhow::{Context, Result};
use tracing::info;

use super::claude_api::ClaudeApiProvider;
use super::claude_session::ClaudeSessionProvider;
use super::prompts;
use super::provider::LlmProvider;
use super::types::{
    LlmMessage, LlmProviderType, LlmRequest, NoteGenerationRequest, NoteGenerationResult,
};

/// Generate notes from a transcript using the specified LLM provider.
pub fn generate_notes(
    request: &NoteGenerationRequest,
    api_key: Option<&str>,
    session_key: Option<&str>,
    organization_id: Option<&str>,
) -> Result<NoteGenerationResult> {
    // Build the provider.
    let provider: Box<dyn LlmProvider> = match request.provider {
        LlmProviderType::ClaudeApi => {
            let key = api_key.context("Anthropic API key is required for claude_api provider")?;
            Box::new(ClaudeApiProvider::new(key.to_string()))
        }
        LlmProviderType::ClaudeSession => {
            let session = session_key
                .context("Session key is required for claude_session provider")?;
            let org = organization_id
                .context("Organization ID is required for claude_session provider")?;
            Box::new(ClaudeSessionProvider::new(
                session.to_string(),
                org.to_string(),
            ))
        }
    };

    // Build prompts.
    let (system, user_prompt) = prompts::build_note_prompt(
        &request.transcript_text,
        &request.prompt_style,
        request.custom_prompt.as_deref(),
    );

    info!(
        "Generating notes with provider={}, style={}",
        request.provider, request.prompt_style
    );

    // Generate the notes content.
    let llm_request = LlmRequest {
        messages: vec![LlmMessage {
            role: "user".to_string(),
            content: user_prompt,
        }],
        model: request.model.clone(),
        max_tokens: Some(4096),
        system: Some(system),
    };

    let response = provider
        .complete(&llm_request)
        .context("Failed to generate notes")?;

    // Generate a title.
    let (title_system, title_user) = prompts::build_title_prompt(&request.transcript_text);
    let title_request = LlmRequest {
        messages: vec![LlmMessage {
            role: "user".to_string(),
            content: title_user,
        }],
        model: request.model.clone(),
        max_tokens: Some(50),
        system: Some(title_system),
    };

    let title = match provider.complete(&title_request) {
        Ok(title_resp) => title_resp.content.trim().to_string(),
        Err(e) => {
            tracing::warn!("Failed to generate title, using fallback: {}", e);
            "Lecture Notes".to_string()
        }
    };

    Ok(NoteGenerationResult {
        title,
        content: response.content,
        provider: response.provider,
        model: response.model,
        prompt_style: request.prompt_style.clone(),
    })
}
