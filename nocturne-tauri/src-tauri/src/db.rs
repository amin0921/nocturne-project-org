//! SQLite persistence. Backend-owned; the webview only sees `invoke` results.
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
  date_added INTEGER NOT NULL,
  last_scanned_at INTEGER NULL
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
  folder_id INTEGER NULL REFERENCES folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Unknown Title',
  artist TEXT NOT NULL DEFAULT 'Unknown Artist',
  album TEXT NOT NULL DEFAULT 'Unknown Album',
  year INTEGER NULL,
  duration_secs REAL NULL,
  file_size INTEGER NULL,
  mtime_ms INTEGER NULL,
  missing INTEGER NOT NULL DEFAULT 0,
  date_added INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  cover_url TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_id, missing);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
";

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// One-time healing (v0.1.0): earlier builds persisted verbatim `\\?\...`
/// paths from `canonicalize()`, which broke URL round-trips. Rewrite them to
/// display form. Idempotent — matches nothing once healed. Data fix only,
/// the schema is untouched.
const VERBATIM_MIGRATION: &str = "
UPDATE tracks SET file_path = '\\\\' || substr(file_path, 9) WHERE file_path LIKE '\\\\?\\UNC\\%';
UPDATE tracks SET file_path = substr(file_path, 5) WHERE file_path LIKE '\\\\?\\%' AND file_path NOT LIKE '\\\\?\\UNC\\%';
UPDATE folders SET folder_path = '\\\\' || substr(folder_path, 9) WHERE folder_path LIKE '\\\\?\\UNC\\%';
UPDATE folders SET folder_path = substr(folder_path, 5) WHERE folder_path LIKE '\\\\?\\%' AND folder_path NOT LIKE '\\\\?\\UNC\\%';
";

/// Apply pragmas + schema to any open connection (also used by tests).
pub fn init_conn(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    conn.execute_batch(VERBATIM_MIGRATION)
        .map_err(|e| e.to_string())?;

    // Safe additive migration: add cover_url to older existing databases
    let has_cover_url: bool = conn
        .prepare("PRAGMA table_info(tracks)")
        .and_then(|mut stmt| {
            let cols = stmt.query_map([], |row| row.get::<_, String>(1))?;
            for col in cols.flatten() {
                if col == "cover_url" {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .unwrap_or(false);

    if !has_cover_url {
        let _ = conn.execute("ALTER TABLE tracks ADD COLUMN cover_url TEXT NULL", []);
    }

    Ok(())
}

/// Open (creating if needed) `<app_local_data>/nocturne.db`.
pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir: PathBuf = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("nocturne.db")).map_err(|e| e.to_string())?;
    init_conn(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_migration_heals_old_rows() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        // Simulate rows written by the pre-fix build (verbatim prefixes),
        // bypassing the migration by inserting AFTER init... so instead:
        // fresh DB + raw verbatim inserts, then re-run init_conn.
        conn.execute(
            "INSERT INTO folders (folder_path, date_added) VALUES ('\\\\?\\C:\\Music', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO folders (folder_path, date_added) VALUES ('\\\\?\\UNC\\srv\\share', 2)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (file_path, folder_id, date_added, last_seen_at) VALUES ('\\\\?\\C:\\Music\\a.mp3', 1, 1, 1)",
            [],
        )
        .unwrap();
        init_conn(&conn).unwrap();
        let folders: Vec<String> = conn
            .prepare("SELECT folder_path FROM folders ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(folders, vec!["C:\\Music".to_string(), "\\\\srv\\share".to_string()]);
        let track: String = conn
            .query_row("SELECT file_path FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(track, "C:\\Music\\a.mp3");
        // Idempotent: second run changes nothing.
        init_conn(&conn).unwrap();
        let again: String = conn
            .query_row("SELECT file_path FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(again, "C:\\Music\\a.mp3");
    }
}
