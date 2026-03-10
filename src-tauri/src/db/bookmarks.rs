/// SQL for inserting a bookmark.
pub const INSERT_BOOKMARK_SQL: &str = r#"
INSERT INTO bookmarks (id, recording_id, timestamp_ms, label)
VALUES (?1, ?2, ?3, ?4)
"#;

/// SQL for selecting all bookmarks for a recording, ordered by timestamp.
pub const SELECT_BOOKMARKS_BY_RECORDING_SQL: &str = r#"
SELECT id, recording_id, timestamp_ms, label, created_at
FROM bookmarks
WHERE recording_id = ?1
ORDER BY timestamp_ms ASC
"#;

/// SQL for deleting a bookmark.
pub const DELETE_BOOKMARK_SQL: &str = "DELETE FROM bookmarks WHERE id = ?1";

/// SQL for updating a bookmark label.
pub const UPDATE_BOOKMARK_LABEL_SQL: &str = "UPDATE bookmarks SET label = ?2 WHERE id = ?1";
