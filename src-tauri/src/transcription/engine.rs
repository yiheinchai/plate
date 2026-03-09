use anyhow::Result;

use super::types::{TranscriptionConfig, TranscriptionResult};

/// Trait for transcription backends.
///
/// Implementations must be Send + Sync so they can be shared across threads.
pub trait TranscriptionEngine: Send + Sync {
    /// Transcribe the audio file at the path given in `config`.
    /// This is a blocking operation (may take seconds to minutes).
    fn transcribe(&self, config: &TranscriptionConfig) -> Result<TranscriptionResult>;
}
