use anyhow::{Context, Result};
use tracing::info;

use super::claude_api::ClaudeApiProvider;
use super::g4f::G4fProvider;
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
    g4f_url: Option<&str>,
) -> Result<NoteGenerationResult> {
    // Build the provider. Filter out empty strings.
    let api_key = api_key.filter(|s| !s.is_empty());
    let session_key = session_key.filter(|s| !s.is_empty());

    let provider: Box<dyn LlmProvider> = match request.provider {
        LlmProviderType::ClaudeApi => {
            let key = api_key.context("Anthropic API key is required — set it in Settings")?;
            Box::new(ClaudeApiProvider::new(key.to_string()))
        }
        LlmProviderType::ClaudeSession => {
            let token = session_key
                .context("Setup token is required — run `claude setup-token` and paste it in Settings")?;
            Box::new(ClaudeApiProvider::with_oauth_token(token.to_string()))
        }
        LlmProviderType::G4f => {
            Box::new(G4fProvider::new(g4f_url.map(|s| s.to_string())))
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
        .context("LLM completion failed")?;

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
