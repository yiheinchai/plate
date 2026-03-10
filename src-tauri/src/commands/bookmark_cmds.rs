use rusqlite::params;
use tauri::State;

use crate::db::bookmarks;
use crate::db::schema::BookmarkRow;
use crate::state::AppState;

/// Add a bookmark at a specific timestamp in a recording.
#[tauri::command]
pub async fn add_bookmark(
    state: State<'_, AppState>,
    recording_id: String,
    timestamp_ms: i64,
    label: Option<String>,
) -> Result<BookmarkRow, String> {
    let db_path = state.db_path.clone();
    let id = uuid::Uuid::new_v4().to_string();

    let row_id = id.clone();
    let row_recording_id = recording_id.clone();
    let row_label = label.clone();

    tokio::task::spawn_blocking(move || -> Result<BookmarkRow, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(
            bookmarks::INSERT_BOOKMARK_SQL,
            params![row_id, row_recording_id, timestamp_ms, row_label],
        )
        .map_err(|e| format!("Failed to insert bookmark: {}", e))?;

        conn.query_row(
            "SELECT id, recording_id, timestamp_ms, label, created_at FROM bookmarks WHERE id = ?1",
            params![id],
            |row| {
                Ok(BookmarkRow {
                    id: row.get(0)?,
                    recording_id: row.get(1)?,
                    timestamp_ms: row.get(2)?,
                    label: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| format!("Failed to read bookmark: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// List all bookmarks for a recording.
#[tauri::command]
pub async fn list_bookmarks(
    state: State<'_, AppState>,
    recording_id: String,
) -> Result<Vec<BookmarkRow>, String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<Vec<BookmarkRow>, String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        let mut stmt = conn
            .prepare(bookmarks::SELECT_BOOKMARKS_BY_RECORDING_SQL)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;
        let rows = stmt
            .query_map(params![recording_id], |row| {
                Ok(BookmarkRow {
                    id: row.get(0)?,
                    recording_id: row.get(1)?,
                    timestamp_ms: row.get(2)?,
                    label: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to query bookmarks: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read bookmarks: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Delete a bookmark.
#[tauri::command]
pub async fn delete_bookmark(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(bookmarks::DELETE_BOOKMARK_SQL, params![id])
            .map_err(|e| format!("Failed to delete bookmark: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Update a bookmark's label.
#[tauri::command]
pub async fn update_bookmark_label(
    state: State<'_, AppState>,
    id: String,
    label: String,
) -> Result<(), String> {
    let db_path = state.db_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        conn.execute(bookmarks::UPDATE_BOOKMARK_LABEL_SQL, params![id, label])
            .map_err(|e| format!("Failed to update bookmark: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
