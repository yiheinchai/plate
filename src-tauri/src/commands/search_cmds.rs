use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    /// "recording", "transcript", or "note"
    pub kind: String,
    pub recording_id: String,
    pub recording_title: String,
    /// Snippet of matching text with the query highlighted
    pub snippet: String,
    /// For notes: the note title
    pub note_title: Option<String>,
    /// For notes: the note id
    pub note_id: Option<String>,
}

/// Search across recordings, transcripts, and notes.
#[tauri::command]
pub async fn search(state: State<'_, AppState>, query: String) -> Result<Vec<SearchResult>, String> {
    let db_path = state.db_path.clone();
    let q = query.trim().to_lowercase();

    if q.is_empty() {
        return Ok(vec![]);
    }

    tokio::task::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut results = Vec::new();
        let like_pattern = format!("%{}%", q);

        // Search recording titles.
        {
            let mut stmt = conn
                .prepare(
                    "SELECT id, title FROM recordings WHERE LOWER(title) LIKE ?1 ORDER BY created_at DESC LIMIT 20",
                )
                .map_err(|e| format!("Query error: {}", e))?;
            let rows = stmt
                .query_map(params![like_pattern], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| format!("Query error: {}", e))?;

            for row in rows {
                let (id, title) = row.map_err(|e| format!("Read error: {}", e))?;
                results.push(SearchResult {
                    kind: "recording".to_string(),
                    recording_id: id,
                    recording_title: title.clone(),
                    snippet: title,
                    note_title: None,
                    note_id: None,
                });
            }
        }

        // Search transcript full text.
        {
            let mut stmt = conn
                .prepare(
                    "SELECT t.recording_id, r.title, t.full_text
                     FROM transcripts t
                     JOIN recordings r ON r.id = t.recording_id
                     WHERE LOWER(t.full_text) LIKE ?1
                     ORDER BY t.created_at DESC LIMIT 20",
                )
                .map_err(|e| format!("Query error: {}", e))?;
            let rows = stmt
                .query_map(params![like_pattern], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| format!("Query error: {}", e))?;

            for row in rows {
                let (rec_id, rec_title, full_text) =
                    row.map_err(|e| format!("Read error: {}", e))?;
                let snippet = extract_snippet(&full_text, &q, 80);
                results.push(SearchResult {
                    kind: "transcript".to_string(),
                    recording_id: rec_id,
                    recording_title: rec_title,
                    snippet,
                    note_title: None,
                    note_id: None,
                });
            }
        }

        // Search note titles and content.
        {
            let mut stmt = conn
                .prepare(
                    "SELECT n.id, n.title, n.content, t.recording_id, r.title
                     FROM notes n
                     JOIN transcripts t ON t.id = n.transcript_id
                     JOIN recordings r ON r.id = t.recording_id
                     WHERE LOWER(n.title) LIKE ?1 OR LOWER(n.content) LIKE ?1
                     ORDER BY n.created_at DESC LIMIT 20",
                )
                .map_err(|e| format!("Query error: {}", e))?;
            let rows = stmt
                .query_map(params![like_pattern], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                })
                .map_err(|e| format!("Query error: {}", e))?;

            for row in rows {
                let (note_id, note_title, content, rec_id, rec_title) =
                    row.map_err(|e| format!("Read error: {}", e))?;
                let snippet = if note_title.to_lowercase().contains(&q) {
                    note_title.clone()
                } else {
                    extract_snippet(&content, &q, 80)
                };
                results.push(SearchResult {
                    kind: "note".to_string(),
                    recording_id: rec_id,
                    recording_title: rec_title,
                    snippet,
                    note_title: Some(note_title),
                    note_id: Some(note_id),
                });
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Extract a snippet around the first occurrence of `query` in `text`.
fn extract_snippet(text: &str, query: &str, context_chars: usize) -> String {
    let lower = text.to_lowercase();
    if let Some(pos) = lower.find(query) {
        let start = pos.saturating_sub(context_chars);
        let end = (pos + query.len() + context_chars).min(text.len());
        let mut snippet = String::new();
        if start > 0 {
            snippet.push_str("...");
        }
        snippet.push_str(text[start..end].trim());
        if end < text.len() {
            snippet.push_str("...");
        }
        snippet
    } else {
        text.chars().take(context_chars * 2).collect()
    }
}
