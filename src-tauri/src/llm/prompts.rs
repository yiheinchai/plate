/// Returns a system prompt and user prompt for note generation based on the style.
///
/// Supported styles:
/// - "memorization": Generates flashcard-style notes optimized for memorization.
/// - "summary": Generates a concise summary of the lecture.
/// - "cornell": Generates notes in Cornell note-taking format.
/// - "outline": Generates a structured outline with headings and bullet points.
/// - "custom": Uses the provided custom prompt.
pub fn build_note_prompt(
    transcript: &str,
    style: &str,
    custom_prompt: Option<&str>,
) -> (String, String) {
    let system = "You are an expert academic note-taker. You produce clear, well-structured, \
                  and comprehensive notes from lecture transcripts. Your notes should capture \
                  all key concepts, definitions, and examples while being concise and easy to \
                  review."
        .to_string();

    let user_prompt = match style {
        "memorization" => format!(
            "Generate study notes optimized for memorization from the following lecture transcript. \
             Include:\n\
             - Key terms and definitions as Q&A flashcard pairs\n\
             - Important facts and figures\n\
             - Mnemonics or memory aids where helpful\n\
             - A brief summary at the end\n\n\
             Format each flashcard as:\n\
             **Q:** [question]\n\
             **A:** [answer]\n\n\
             Transcript:\n\
             ---\n\
             {transcript}\n\
             ---"
        ),
        "summary" => format!(
            "Generate a concise but comprehensive summary of the following lecture transcript. \
             Include:\n\
             - Main topic and thesis\n\
             - Key points and arguments\n\
             - Important examples or evidence\n\
             - Conclusion or takeaways\n\n\
             Keep the summary to roughly 20-30% of the original length.\n\n\
             Transcript:\n\
             ---\n\
             {transcript}\n\
             ---"
        ),
        "cornell" => format!(
            "Generate notes in Cornell note-taking format from the following lecture transcript.\n\n\
             Use this structure:\n\
             ## Cue Column (left)\n\
             [Key questions and keywords that prompt recall]\n\n\
             ## Notes Column (right)\n\
             [Detailed notes organized by topic]\n\n\
             ## Summary\n\
             [5-7 sentence summary of the entire lecture]\n\n\
             Transcript:\n\
             ---\n\
             {transcript}\n\
             ---"
        ),
        "outline" => format!(
            "Generate a structured outline from the following lecture transcript. \
             Use hierarchical headings and bullet points:\n\n\
             - Use ## for main topics\n\
             - Use ### for subtopics\n\
             - Use bullet points for details\n\
             - Include key definitions, examples, and important quotes\n\
             - Mark especially important points with **bold**\n\n\
             Transcript:\n\
             ---\n\
             {transcript}\n\
             ---"
        ),
        "custom" => {
            let custom = custom_prompt.unwrap_or("Generate notes from this transcript.");
            format!(
                "{custom}\n\n\
                 Transcript:\n\
                 ---\n\
                 {transcript}\n\
                 ---"
            )
        }
        _ => format!(
            "Generate comprehensive study notes from the following lecture transcript.\n\n\
             Transcript:\n\
             ---\n\
             {transcript}\n\
             ---"
        ),
    };

    (system, user_prompt)
}

/// Generate a title for the notes from the first ~200 characters of the transcript.
pub fn build_title_prompt(transcript: &str) -> (String, String) {
    let preview: String = transcript.chars().take(500).collect();
    let system = "You are a helpful assistant. Respond with ONLY a short title (5-10 words), \
                  no quotes, no punctuation at the end."
        .to_string();
    let user = format!(
        "Generate a short descriptive title for lecture notes based on this transcript excerpt:\n\n\
         {preview}"
    );
    (system, user)
}
