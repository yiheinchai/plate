use anyhow::{Context, Result};
use tracing::{info, warn};

use super::claude_api::ClaudeApiProvider;
use super::cli::CliProvider;
use super::g4f::G4fProvider;
use super::prompts;
use super::provider::LlmProvider;
use super::types::{
    LlmMessage, LlmProviderType, LlmRequest, LlmResponse, NoteGenerationRequest,
    NoteGenerationResult,
};

fn build_provider(
    provider_type: &LlmProviderType,
    model: Option<&str>,
    api_key: Option<&str>,
    session_key: Option<&str>,
    g4f_url: Option<&str>,
) -> Result<Box<dyn LlmProvider>> {
    let api_key = api_key.filter(|s| !s.is_empty());
    let session_key = session_key.filter(|s| !s.is_empty());

    match provider_type {
        LlmProviderType::ClaudeApi => {
            if let Some(key) = api_key {
                Ok(Box::new(ClaudeApiProvider::new(key.to_string())))
            } else if super::cli::first_installed_cli_id().is_some() {
                info!("No Anthropic API key configured; falling back to installed local CLI");
                Ok(Box::new(CliProvider::new(None)))
            } else {
                anyhow::bail!("Anthropic API key is required — set it in Settings or switch to CLI")
            }
        }
        LlmProviderType::ClaudeSession => {
            if let Some(token) = session_key {
                Ok(Box::new(ClaudeApiProvider::with_oauth_token(token.to_string())))
            } else if super::cli::first_installed_cli_id().is_some() {
                info!("No Claude setup token configured; falling back to installed local CLI");
                Ok(Box::new(CliProvider::new(None)))
            } else {
                anyhow::bail!(
                    "Setup token is required — run `claude setup-token` and paste it in Settings"
                )
            }
        }
        LlmProviderType::G4f => Ok(Box::new(G4fProvider::new(g4f_url.map(|s| s.to_string())))),
        LlmProviderType::Cli => Ok(Box::new(CliProvider::new(model.map(|s| s.to_string())))),
    }
}

fn complete_with_cli_fallback(
    provider: &dyn LlmProvider,
    provider_type: &LlmProviderType,
    llm_request: &LlmRequest,
) -> Result<LlmResponse> {
    match provider.complete(llm_request) {
        Ok(resp) => Ok(resp),
        Err(primary_err) => {
            if *provider_type != LlmProviderType::Cli
                && super::cli::first_installed_cli_id().is_some()
            {
                warn!(
                    "Primary LLM provider ({}) failed ({:#}); falling back to local CLI",
                    provider_type, primary_err
                );
                let cli_provider = CliProvider::new(None);
                let mut fallback_req = llm_request.clone();
                fallback_req.model = None;
                if let Ok(resp) = cli_provider.complete(&fallback_req) {
                    return Ok(resp);
                }
            }
            Err(primary_err)
        }
    }
}

/// Generate notes from a transcript using the specified LLM provider.
pub fn generate_notes(
    request: &NoteGenerationRequest,
    api_key: Option<&str>,
    session_key: Option<&str>,
    g4f_url: Option<&str>,
) -> Result<NoteGenerationResult> {
    let provider = build_provider(
        &request.provider,
        request.model.as_deref(),
        api_key,
        session_key,
        g4f_url,
    )?;

    // Build prompts.
    let (mut system, user_prompt) = prompts::build_note_prompt(
        &request.transcript_text,
        &request.prompt_style,
        request.custom_prompt.as_deref(),
    );
    system.push_str(
        " Begin your response with a single top-level Markdown heading (`# Concise 5-10 Word Title`) \
         that summarizes the topic, followed by the notes.",
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

    let response = complete_with_cli_fallback(provider.as_ref(), &request.provider, &llm_request)
        .context("LLM completion failed")?;

    // Extract title from leading `# Heading` if present; otherwise call title prompt.
    let (extracted_title, cleaned_content) = extract_leading_markdown_title(&response.content);
    let title = match extracted_title {
        Some(t) => t,
        None => generate_title_with_provider(
            provider.as_ref(),
            &request.provider,
            request.model.clone(),
            &request.transcript_text,
        )
        .unwrap_or_else(|e| {
            warn!("Failed to generate title, using fallback: {}", e);
            "Lecture Notes".to_string()
        }),
    };

    Ok(NoteGenerationResult {
        title,
        content: cleaned_content,
        provider: response.provider,
        model: response.model,
        prompt_style: request.prompt_style.clone(),
    })
}

/// If the markdown starts with `# Some Title`, extract `Some Title` and strip that first heading line.
fn extract_leading_markdown_title(markdown: &str) -> (Option<String>, String) {
    let trimmed = markdown.trim();
    let mut lines = trimmed.lines();
    if let Some(first_line) = lines.next() {
        let fl = first_line.trim();
        if let Some(rest_of_line) = fl.strip_prefix("# ") {
            let clean_title = rest_of_line
                .trim()
                .trim_matches(|c: char| c == '"' || c == '\'' || c == '*')
                .trim()
                .to_string();
            if clean_title.len() >= 3 && clean_title.len() <= 120 {
                let remaining: String = lines.collect::<Vec<_>>().join("\n").trim().to_string();
                if !remaining.is_empty() {
                    return (Some(clean_title), remaining);
                }
            }
        }
    }
    (None, trimmed.to_string())
}

/// Generate a short descriptive title from a transcript using the configured provider or local CLI.
pub fn generate_title_only(
    transcript_text: &str,
    provider_type: &LlmProviderType,
    model: Option<String>,
    api_key: Option<&str>,
    session_key: Option<&str>,
    g4f_url: Option<&str>,
) -> Result<String> {
    let provider = build_provider(
        provider_type,
        model.as_deref(),
        api_key,
        session_key,
        g4f_url,
    )?;
    generate_title_with_provider(provider.as_ref(), provider_type, model, transcript_text)
}

fn generate_title_with_provider(
    provider: &dyn LlmProvider,
    provider_type: &LlmProviderType,
    model: Option<String>,
    transcript_text: &str,
) -> Result<String> {
    let (title_system, title_user) = prompts::build_title_prompt(transcript_text);
    let title_request = LlmRequest {
        messages: vec![LlmMessage {
            role: "user".to_string(),
            content: title_user,
        }],
        model,
        max_tokens: Some(50),
        system: Some(title_system),
    };

    let resp = complete_with_cli_fallback(provider, provider_type, &title_request)?;
    let cleaned = resp
        .content
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("Lecture Notes")
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '#' || c == '*' || c.is_whitespace())
        .to_string();

    if cleaned.is_empty() {
        anyhow::bail!("Generated title was empty");
    }
    Ok(cleaned)
}
