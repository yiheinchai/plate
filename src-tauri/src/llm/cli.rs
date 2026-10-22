use std::env;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::provider::LlmProvider;
use super::types::{LlmRequest, LlmResponse};

/// Metadata about a supported local CLI tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliToolInfo {
    /// Identifier stored in `settings.llm_model` when `llm_auth_mode == "cli"`, e.g. "claude", "agy", "cursor", "pi", "codex".
    pub id: String,
    /// Human-readable label shown in the UI.
    pub name: String,
    /// Resolved executable path if installed on this machine.
    pub binary_path: Option<String>,
    /// Whether this CLI was detected on the machine.
    pub installed: bool,
}

struct CliCandidate {
    id: &'static str,
    name: &'static str,
    binaries: &'static [&'static str],
}

const SUPPORTED_CLIS: &[CliCandidate] = &[
    CliCandidate {
        id: "agy",
        name: "Antigravity — Gemini 4 Argon High (agy)",
        binaries: &["agy", "antigravity"],
    },
    CliCandidate {
        id: "claude",
        name: "Claude Code (claude)",
        binaries: &["claude"],
    },
    CliCandidate {
        id: "cursor",
        name: "Cursor Agent (agent / cursor)",
        binaries: &["agent", "cursor-agent", "cursor"],
    },
    CliCandidate {
        id: "pi",
        name: "Pi Agent (pi)",
        binaries: &["pi"],
    },
    CliCandidate {
        id: "codex",
        name: "OpenAI Codex (codex)",
        binaries: &["codex"],
    },
    CliCandidate {
        id: "gemini",
        name: "Gemini CLI (gemini)",
        binaries: &["gemini"],
    },
    CliCandidate {
        id: "llm",
        name: "LLM CLI (llm)",
        binaries: &["llm"],
    },
];

/// Build an enriched list of search directories so macOS GUI bundles launched
/// from Finder/Dock can still locate CLIs installed in `~/.local/bin`, Homebrew, etc.
fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".cargo/bin"));
        dirs.push(home.join(".bun/bin"));
        dirs.push(home.join("bin"));

        // Check common nvm node bin directories if present.
        let nvm_versions = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_versions) {
            let mut version_dirs: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path().join("bin"))
                .filter(|p| p.is_dir())
                .collect();
            version_dirs.sort();
            version_dirs.reverse();
            dirs.extend(version_dirs);
        }
    }

    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs.push(PathBuf::from("/usr/bin"));
    dirs.push(PathBuf::from("/bin"));
    dirs.push(PathBuf::from(
        "/Applications/Cursor.app/Contents/Resources/app/bin",
    ));

    if let Some(path_var) = env::var_os("PATH") {
        for p in env::split_paths(&path_var) {
            if !dirs.contains(&p) {
                dirs.push(p);
            }
        }
    }

    dirs
}

/// Build an enriched PATH string for child processes (e.g. so `#!/usr/bin/env node` works).
fn enriched_path_env() -> String {
    let dirs = search_dirs();
    env::join_paths(dirs)
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin".to_string())
}

/// Resolve a binary name across `search_dirs()`.
pub fn find_binary(name: &str) -> Option<PathBuf> {
    let candidate_path = Path::new(name);
    if candidate_path.is_absolute() && is_executable(candidate_path) {
        return Some(candidate_path.to_path_buf());
    }

    for dir in search_dirs() {
        let full = dir.join(name);
        if is_executable(&full) {
            return Some(full);
        }
    }
    None
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Resolve the binary for a given CLI candidate ID.
fn resolve_cli_candidate(candidate: &CliCandidate) -> Option<PathBuf> {
    for &bin in candidate.binaries {
        if let Some(path) = find_binary(bin) {
            // Special check for `cursor`: if only `cursor` is found (not `agent`),
            // verify it's not a broken wrapper when Cursor.app is missing.
            if bin == "cursor"
                && candidate.id == "cursor"
                && !Path::new("/Applications/Cursor.app").exists()
            {
                continue;
            }
            return Some(path);
        }
    }
    None
}

/// Discover all supported CLI tools and whether they are installed on the machine.
pub fn list_available_clis() -> Vec<CliToolInfo> {
    SUPPORTED_CLIS
        .iter()
        .map(|c| {
            let resolved = resolve_cli_candidate(c);
            CliToolInfo {
                id: c.id.to_string(),
                name: c.name.to_string(),
                installed: resolved.is_some(),
                binary_path: resolved.map(|p| p.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

/// Return the ID of the first installed CLI tool, if any.
pub fn first_installed_cli_id() -> Option<String> {
    list_available_clis()
        .into_iter()
        .find(|c| c.installed)
        .map(|c| c.id)
}

/// LLM provider that invokes a local CLI tool (`claude`, `agy`, `cursor`/`agent`, `pi`, `codex`, `gemini`, `llm`).
pub struct CliProvider {
    /// Preferred CLI tool ID ("auto", "claude", "agy", "cursor", "pi", "codex", "gemini", "llm")
    preferred_cli: String,
}

impl CliProvider {
    pub fn new(preferred_cli: Option<String>) -> Self {
        let cli = preferred_cli
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "auto".to_string());
        Self { preferred_cli: cli }
    }

    /// Resolve which CLI ID and executable path to run, in priority order.
    fn resolve_execution_targets(&self) -> Result<Vec<(String, PathBuf)>> {
        let available = list_available_clis();
        let mut targets = Vec::new();

        let pref = self.preferred_cli.trim().to_lowercase();
        let normalized_pref = match pref.as_str() {
            "antigravity" => "agy",
            "agent" | "cursor-agent" => "cursor",
            other => other,
        };

        // If a specific CLI was requested and is installed, try it first.
        if normalized_pref != "auto" {
            if let Some(info) = available.iter().find(|c| c.id == normalized_pref && c.installed) {
                if let Some(ref path) = info.binary_path {
                    targets.push((info.id.clone(), PathBuf::from(path)));
                }
            } else if let Some(custom_bin) = find_binary(normalized_pref) {
                targets.push((normalized_pref.to_string(), custom_bin));
            }
        }

        // Add remaining installed CLIs as fallbacks (or primary when "auto").
        for info in available.into_iter().filter(|c| c.installed) {
            if !targets.iter().any(|(id, _)| id == &info.id) {
                if let Some(path) = info.binary_path {
                    targets.push((info.id, PathBuf::from(path)));
                }
            }
        }

        if targets.is_empty() {
            anyhow::bail!(
                "No supported AI CLI found on this machine (checked claude, agy, cursor/agent, pi, codex, gemini, llm)"
            );
        }

        Ok(targets)
    }

    fn execute_single_cli(
        cli_id: &str,
        binary_path: &Path,
        system: Option<&str>,
        user_prompt: &str,
    ) -> Result<String> {
        let combined_prompt = match system {
            Some(sys) if !sys.trim().is_empty() => format!("{}\n\n{}", sys.trim(), user_prompt),
            _ => user_prompt.to_string(),
        };

        let mut cmd = Command::new(binary_path);
        cmd.current_dir(env::temp_dir());
        cmd.env("PATH", enriched_path_env());
        cmd.env("NO_COLOR", "1");
        cmd.env("TERM", "dumb");
        // Clear CLAUDECODE env var in case Plate was launched from inside a Claude Code session.
        cmd.env_remove("CLAUDECODE");

        let mut pass_via_stdin: Option<String> = None;

        match cli_id {
            "claude" => {
                cmd.arg("-p")
                    .arg("--no-session-persistence")
                    .arg("--tools=")
                    .arg("--output-format")
                    .arg("text");
                if let Some(sys) = system.filter(|s| !s.trim().is_empty()) {
                    cmd.arg("--system-prompt").arg(sys);
                    pass_via_stdin = Some(user_prompt.to_string());
                } else {
                    pass_via_stdin = Some(combined_prompt);
                }
            }
            "agy" => {
                cmd.arg("--model")
                    .arg("gemini-4-argon-high")
                    .arg("--disable-slash-commands")
                    .arg("--output-format")
                    .arg("text")
                    .arg("-p")
                    .arg(&combined_prompt);
            }
            "cursor" => {
                let bin_name = binary_path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("agent");
                if bin_name == "cursor" {
                    cmd.arg("agent");
                }
                cmd.arg("--mode")
                    .arg("ask")
                    .arg("--output-format")
                    .arg("text")
                    .arg("-p")
                    .arg(&combined_prompt);
            }
            "pi" => {
                cmd.arg("-p").arg("--no-session").arg("--no-tools");
                if let Some(sys) = system.filter(|s| !s.trim().is_empty()) {
                    cmd.arg("--system-prompt").arg(sys);
                    cmd.arg(user_prompt);
                } else {
                    cmd.arg(&combined_prompt);
                }
            }
            "codex" => {
                cmd.arg("exec")
                    .arg("--skip-git-repo-check")
                    .arg("--ephemeral")
                    .arg("--color")
                    .arg("never")
                    .arg("-");
                pass_via_stdin = Some(combined_prompt);
            }
            "gemini" => {
                cmd.arg("-p").arg(&combined_prompt);
            }
            "llm" => {
                if let Some(sys) = system.filter(|s| !s.trim().is_empty()) {
                    cmd.arg("-s").arg(sys);
                    pass_via_stdin = Some(user_prompt.to_string());
                } else {
                    pass_via_stdin = Some(combined_prompt);
                }
            }
            _ => {
                cmd.arg("-p").arg(&combined_prompt);
            }
        }

        if pass_via_stdin.is_some() {
            cmd.stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        info!(
            "Running local CLI '{}' ({})",
            cli_id,
            binary_path.display()
        );

        let mut child = cmd
            .spawn()
            .with_context(|| format!("Failed to spawn CLI '{}'", binary_path.display()))?;

        if let Some(stdin_text) = pass_via_stdin {
            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(stdin_text.as_bytes())
                    .context("Failed to write prompt to CLI stdin")?;
            }
        }

        let output = child
            .wait_with_output()
            .with_context(|| format!("Failed waiting for CLI '{}'", cli_id))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let detail = if !stderr.is_empty() { stderr } else { stdout };
            anyhow::bail!(
                "CLI '{}' exited with {}: {}",
                cli_id,
                output.status,
                detail
            );
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let cleaned = strip_ansi_codes(&raw_stdout).trim().to_string();

        if cleaned.is_empty() {
            anyhow::bail!("CLI '{}' returned an empty response", cli_id);
        }

        Ok(cleaned)
    }
}

/// Strip ANSI escape sequences if any CLI emits terminal formatting codes.
fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

impl LlmProvider for CliProvider {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let targets = self.resolve_execution_targets()?;

        let mut user_prompt = String::new();
        for msg in &request.messages {
            if !user_prompt.is_empty() {
                user_prompt.push('\n');
            }
            user_prompt.push_str(&msg.content);
        }

        let mut last_err: Option<anyhow::Error> = None;

        for (cli_id, binary_path) in targets {
            match Self::execute_single_cli(
                &cli_id,
                &binary_path,
                request.system.as_deref(),
                &user_prompt,
            ) {
                Ok(content) => {
                    return Ok(LlmResponse {
                        content,
                        model: cli_id.clone(),
                        provider: "cli".to_string(),
                        tokens_used: None,
                    });
                }
                Err(e) => {
                    warn!("CLI '{}' failed, trying next if available: {:#}", cli_id, e);
                    last_err = Some(e);
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("All local AI CLIs failed")))
    }

    fn provider_name(&self) -> &str {
        "cli"
    }

    fn default_model(&self) -> &str {
        &self.preferred_cli
    }
}
