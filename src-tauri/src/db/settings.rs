pub const UPSERT_SETTING_SQL: &str = r#"
INSERT INTO settings (key, value) VALUES (?1, ?2)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
"#;

pub const SELECT_SETTING_SQL: &str = "SELECT key, value FROM settings WHERE key = ?1";

pub const SELECT_ALL_SETTINGS_SQL: &str = "SELECT key, value FROM settings";

pub const DELETE_SETTING_SQL: &str = "DELETE FROM settings WHERE key = ?1";
