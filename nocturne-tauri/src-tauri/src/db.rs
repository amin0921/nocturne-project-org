//! SQLite persistence. Backend-owned; the webview only sees `invoke` results.
use rusqlite::{params, Connection};
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
CREATE TABLE IF NOT EXISTS plays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL,
  album       TEXT,
  played_at   INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plays_time ON plays(played_at);
CREATE INDEX IF NOT EXISTS idx_plays_track ON plays(track_id);
CREATE TABLE IF NOT EXISTS lyric_offsets (
  track_id   TEXT PRIMARY KEY,
  offset_ms  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listening_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  duration_secs REAL NOT NULL,
  duration_listened_secs REAL NOT NULL,
  played_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed', 'skipped', 'partial'))
);
CREATE INDEX IF NOT EXISTS idx_listening_history_time ON listening_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_history_track ON listening_history(track_id);
CREATE TABLE IF NOT EXISTS queue_checkpoint (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_json TEXT NOT NULL,
  track_count INTEGER NOT NULL,
  clean_exit INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  track_count INTEGER NOT NULL,
  duration_secs REAL NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_sessions_updated ON saved_sessions(updated_at DESC);
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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

    // One-time content-dedup pass (see `deduplicate_tracks`). Guarded by an
    // `app_meta` marker so it can never run twice, and a failure here must not
    // stop the app from booting on an otherwise healthy database.
    if let Err(e) = run_dedup_migration(conn) {
        eprintln!("[nocturne] library dedup migration skipped: {e}");
    }

    Ok(())
}

/// Title placeholders that carry no real identity. Deduplication refuses to
/// match on title/artist alone for these, so two different untagged files that
/// happen to share a filename-derived title can never collapse into one.
pub const GENERIC_TITLE_LIST: &str = "'unknown title','unknown','track'";

/// Rust-side twin of the placeholder list above, used by the ingestion check.
pub fn is_generic_title(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    t.is_empty() || t == "unknown title" || t == "unknown" || t == "track"
}

/// Outcome of a deduplication pass.
pub struct DedupOutcome {
    /// Number of track rows purged.
    pub purged: usize,
    /// `file_path` of every purged row, in purge order, for auditing.
    pub purged_paths: Vec<String>,
}

/// Selects every track row that has a strictly "better" twin.
///
/// "Better" means: a present file beats a missing one, and among equals the
/// lower row id wins. This keeps the survivor stable and never lets a ghost
/// (`missing = 1`) shadow a real file that is still on disk.
///
/// Two rows are the same song only when their identity is corroborated:
///   (A) a real, non-placeholder title + artist match, or
///   (B) a byte-size match where at least one side's title is a placeholder,
///       i.e. an untagged file whose only "title" came from its filename.
/// Duration alone is never enough, and neither is byte size alone -- two
/// genuinely different songs can share both (a track and its own edit).
///
/// Duration is a SOFT gate: when both sides know it they must agree within
/// 1.0s, but a row whose duration could never be measured is still judged on
/// identity. Requiring it unconditionally would silently exempt exactly the
/// files most likely to be byte-identical copies.
fn select_duplicate_rows(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let sql = format!(
        "SELECT t.id, t.file_path
             FROM tracks t
             WHERE EXISTS (
               SELECT 1 FROM tracks k
               WHERE ((k.missing < t.missing)
                   OR (k.missing = t.missing AND k.id < t.id))
                 AND (
                   (
                     LOWER(TRIM(t.title)) <> ''
                     AND LOWER(TRIM(t.title)) NOT IN ({GENERIC_TITLE_LIST})
                     AND LOWER(TRIM(k.title)) = LOWER(TRIM(t.title))
                     AND LOWER(TRIM(k.artist)) = LOWER(TRIM(t.artist))
                   )
                   OR (
                     k.file_size IS NOT NULL
                     AND t.file_size IS NOT NULL
                     AND k.file_size = t.file_size
                     AND (
                       LOWER(TRIM(t.title)) IN ({GENERIC_TITLE_LIST})
                       OR LOWER(TRIM(k.title)) IN ({GENERIC_TITLE_LIST})
                     )
                   )
                 )
                 AND (
                   k.duration_secs IS NULL
                   OR t.duration_secs IS NULL
                   OR ABS(k.duration_secs - t.duration_secs) <= 1.0
                 )
             )"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Purges content-duplicate track rows, keeping one survivor per song.
///
/// Database records only -- no audio file on disk is read, moved or deleted, so
/// a survivor can always be re-indexed by rescanning its folder. Rows that are
/// merely gone from disk (`missing = 1`) lose to present rows, so deleting a
/// primary file cannot leave its backup permanently un-indexable.
pub fn deduplicate_tracks(conn: &Connection) -> Result<DedupOutcome, String> {
    let doomed = select_duplicate_rows(conn)?;
    if doomed.is_empty() {
        return Ok(DedupOutcome { purged: 0, purged_paths: Vec::new() });
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (id, _) in &doomed {
        tx.execute("DELETE FROM tracks WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(DedupOutcome {
        purged: doomed.len(),
        purged_paths: doomed.into_iter().map(|(_, path)| path).collect(),
    })
}

/// Runs [`deduplicate_tracks`] at most once ever, recording completion in
/// `app_meta`. Returns the outcome only on the run that actually purged.
pub fn run_dedup_migration(conn: &Connection) -> Result<Option<DedupOutcome>, String> {
    let already: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'dedup_v1'",
            [],
            |r| r.get(0),
        )
        .ok();
    if already.is_some() {
        return Ok(None);
    }
    let outcome = deduplicate_tracks(conn)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('dedup_v1', ?1)",
        params![now_ms().to_string()],
    )
    .map_err(|e| e.to_string())?;
    if outcome.purged > 0 {
        // Auditable: every purged row is named on stderr so the one-time
        // migration is never a silent deletion. Audio files are untouched.
        eprintln!(
            "[nocturne] dedup migration: purged {} duplicate track row(s)",
            outcome.purged
        );
        for path in &outcome.purged_paths {
            eprintln!("[nocturne]   purged: {path}");
        }
    }
    Ok(Some(outcome))
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

// ---------------------------------------------------------------------
// Listening history (Phase 01 · Feature 2)
//
// One row per play session with how much of the track was actually heard.
// `track_id` is an opaque TEXT reference (canonical file path or track-row
// id — the IPC caller decides) and is deliberately NOT a FOREIGN KEY so
// history survives library rescans and track-row deletions.
// ---------------------------------------------------------------------

/// Unix epoch seconds (the `played_at` unit of `listening_history`).
pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Valid `status` values, mirrored by the CHECK constraint in `SCHEMA`.
pub const LISTENING_STATUSES: [&str; 3] = ["completed", "skipped", "partial"];

/// Upper bound for a single history fetch, so a client can never ask the
/// webview to materialize the whole table.
pub const MAX_HISTORY_LIMIT: u32 = 500;

/// Default page size when the frontend omits `limit`.
pub const DEFAULT_HISTORY_LIMIT: u32 = 50;

/// One play session as serialized to the webview (camelCase keys).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub duration_secs: f64,
    pub duration_listened_secs: f64,
    /// Unix epoch seconds.
    pub played_at: i64,
    pub status: String,
}

/// Insert one play-session row. `played_at: None` stamps "now" (epoch secs).
///
/// Status is validated here so callers get a readable error instead of a raw
/// SQLite CHECK-constraint message. Returns the new row id.
pub fn insert_listening_history(
    conn: &Connection,
    track_id: &str,
    title: &str,
    artist: &str,
    duration_secs: f64,
    duration_listened_secs: f64,
    status: &str,
    played_at: Option<i64>,
) -> Result<i64, String> {
    if !LISTENING_STATUSES.contains(&status) {
        return Err(format!(
            "invalid status '{status}' — expected one of: {}",
            LISTENING_STATUSES.join(", ")
        ));
    }
    let at = played_at.unwrap_or_else(now_secs);
    conn.execute(
        "INSERT INTO listening_history
             (track_id, title, artist, duration_secs, duration_listened_secs, played_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![track_id, title, artist, duration_secs, duration_listened_secs, at, status],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Most recent history rows, newest first (`played_at DESC`, row id as the
/// tie-breaker for sessions recorded within the same second). `limit` is
/// clamped into `1..=MAX_HISTORY_LIMIT`.
pub fn get_recent_listening_history(
    conn: &Connection,
    limit: u32,
) -> Result<Vec<HistoryEntry>, String> {
    let bounded = limit.clamp(1, MAX_HISTORY_LIMIT) as i64;
    let mut stmt = conn
        .prepare(
            "SELECT id, track_id, title, artist, duration_secs, duration_listened_secs, played_at, status
             FROM listening_history
             ORDER BY played_at DESC, id DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![bounded], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                track_id: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                duration_secs: row.get(4)?,
                duration_listened_secs: row.get(5)?,
                played_at: row.get(6)?,
                status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Total number of recorded play sessions for one track id.
pub fn get_track_play_count(conn: &Connection, track_id: &str) -> Result<u64, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM listening_history WHERE track_id = ?1",
            params![track_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n.max(0) as u64)
}

// ---------------------------------------------------------------------
// Queue checkpoint & saved sessions (Phase 01 · Feature 3)
//
// `queue_checkpoint` is a SINGLETON (id = 1) holding the last playback
// snapshot. `clean_exit = 0` is the resting state after every write, so a
// row with 0 at boot means the previous run ended abruptly (crash / kill);
// only the graceful-unload path flips it to 1 before the process exits.
// `saved_sessions` are user-named copies of the same snapshot shape.
// ---------------------------------------------------------------------

/// One persisted playback snapshot as serialized to the webview (camelCase).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueCheckpointRecord {
    /// Opaque JSON blob: tracks, activeIndex, positionMs, isShuffle, repeatMode.
    pub snapshot_json: String,
    pub track_count: i64,
    /// false = crash/unexpected kill, true = graceful exit.
    pub clean_exit: bool,
    /// Unix epoch seconds.
    pub updated_at: i64,
}

/// Listing row for a user-named session (snapshot payload excluded).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSessionSummary {
    pub id: i64,
    pub name: String,
    pub track_count: i64,
    pub duration_secs: f64,
    /// Unix epoch seconds.
    pub created_at: i64,
    /// Unix epoch seconds.
    pub updated_at: i64,
}

/// UPSERT the singleton checkpoint (id = 1). Every save resets `clean_exit`
/// to the given value — callers pass `false` during playback so an
/// unclean death always leaves a crash marker behind.
pub fn save_queue_checkpoint(
    conn: &Connection,
    snapshot_json: &str,
    track_count: u32,
    clean_exit: bool,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO queue_checkpoint (id, snapshot_json, track_count, clean_exit, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
           snapshot_json = excluded.snapshot_json,
           track_count = excluded.track_count,
           clean_exit = excluded.clean_exit,
           updated_at = excluded.updated_at",
        params![snapshot_json, track_count as i64, clean_exit as i64, now_secs()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Graceful-exit marker: flip the singleton's `clean_exit` to 1. No-op when
/// no checkpoint exists.
pub fn mark_checkpoint_clean_exit(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE queue_checkpoint SET clean_exit = 1, updated_at = ?1 WHERE id = 1",
        params![now_secs()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Read the singleton checkpoint; `None` when nothing has ever been saved.
pub fn get_queue_checkpoint(conn: &Connection) -> Result<Option<QueueCheckpointRecord>, String> {
    conn.query_row(
        "SELECT snapshot_json, track_count, clean_exit, updated_at
         FROM queue_checkpoint WHERE id = 1",
        [],
        |r| {
            Ok(QueueCheckpointRecord {
                snapshot_json: r.get(0)?,
                track_count: r.get(1)?,
                clean_exit: r.get::<_, i64>(2)? != 0,
                updated_at: r.get(3)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other.to_string()),
    })
}

/// Remove the singleton checkpoint entirely (e.g. user discards a crash offer).
pub fn clear_queue_checkpoint(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM queue_checkpoint WHERE id = 1", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Insert a named session; returns its row id. Name is trimmed and must not
/// be empty.
pub fn save_named_session(
    conn: &Connection,
    name: &str,
    track_count: u32,
    duration_secs: f64,
    snapshot_json: &str,
) -> Result<i64, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("session name must not be empty".to_string());
    }
    let now = now_secs();
    conn.execute(
        "INSERT INTO saved_sessions (name, track_count, duration_secs, snapshot_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![trimmed, track_count as i64, duration_secs, snapshot_json, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// All named sessions, newest activity first (`updated_at DESC`, row id as
/// the tie-breaker). Snapshot payloads are excluded from the listing.
pub fn list_saved_sessions(conn: &Connection) -> Result<Vec<SavedSessionSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, track_count, duration_secs, created_at, updated_at
             FROM saved_sessions
             ORDER BY updated_at DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SavedSessionSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                track_count: row.get(2)?,
                duration_secs: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Delete one named session by id. Deleting an unknown id is a no-op.
pub fn delete_named_session(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM saved_sessions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
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

    #[test]
    fn listening_history_migration_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        // Re-running init_conn (every boot) must not fail or duplicate indexes.
        init_conn(&conn).unwrap();
        insert_listening_history(&conn, "C:\\M\\a.mp3", "A", "X", 180.0, 180.0, "completed", Some(1))
            .unwrap();
        // Re-init AFTER data exists too: schema is additive, rows survive.
        init_conn(&conn).unwrap();
        assert_eq!(get_track_play_count(&conn, "C:\\M\\a.mp3").unwrap(), 1);
        let statuses: Vec<String> = conn
            .prepare("SELECT sql FROM sqlite_master WHERE name = 'listening_history'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(statuses.len(), 1, "table must be created exactly once");
    }

    #[test]
    fn listening_history_insert_and_recent_ordering() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        insert_listening_history(&conn, "t1", "Old", "X", 200.0, 90.0, "partial", Some(100)).unwrap();
        insert_listening_history(&conn, "t2", "Mid", "Y", 300.0, 300.0, "completed", Some(200)).unwrap();
        insert_listening_history(&conn, "t3", "New", "Z", 240.0, 12.0, "skipped", Some(300)).unwrap();

        let rows = get_recent_listening_history(&conn, 10).unwrap();
        assert_eq!(rows.len(), 3);
        // Newest first.
        let titles: Vec<&str> = rows.iter().map(|r| r.title.as_str()).collect();
        assert_eq!(titles, vec!["New", "Mid", "Old"]);

        let new = &rows[0];
        assert_eq!(new.track_id, "t3");
        assert_eq!(new.artist, "Z");
        assert!((new.duration_secs - 240.0).abs() < f64::EPSILON);
        assert!((new.duration_listened_secs - 12.0).abs() < f64::EPSILON);
        assert_eq!(new.played_at, 300);
        assert_eq!(new.status, "skipped");
    }

    #[test]
    fn listening_history_rejects_invalid_status() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        for bad in ["", "looped", "COMPLETED", "partial "] {
            assert!(
                insert_listening_history(&conn, "t1", "A", "X", 100.0, 100.0, bad, Some(1)).is_err(),
                "status '{bad}' must be rejected"
            );
        }
        // Same rejection via the raw CHECK constraint, belt-and-braces.
        assert!(conn
            .execute(
                "INSERT INTO listening_history (track_id, title, artist, duration_secs, duration_listened_secs, played_at, status)
                 VALUES ('t1', 'A', 'X', 1.0, 1.0, 1, 'bogus')",
                []
            )
            .is_err());
        assert_eq!(get_track_play_count(&conn, "t1").unwrap(), 0);
    }

    #[test]
    fn listening_history_play_count_and_limit_bounding() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        for played_at in [10, 20, 30] {
            insert_listening_history(&conn, "t1", "Song", "Artist", 180.0, 180.0, "completed", Some(played_at))
                .unwrap();
        }
        insert_listening_history(&conn, "t2", "Other", "Artist", 120.0, 60.0, "skipped", Some(40)).unwrap();

        assert_eq!(get_track_play_count(&conn, "t1").unwrap(), 3);
        assert_eq!(get_track_play_count(&conn, "t2").unwrap(), 1);
        assert_eq!(get_track_play_count(&conn, "not-a-track").unwrap(), 0);

        // Limit bounds the page from above and stays >= 1.
        assert_eq!(get_recent_listening_history(&conn, 2).unwrap().len(), 2);
        assert_eq!(get_recent_listening_history(&conn, 10_000).unwrap().len(), 4);
        assert_eq!(get_recent_listening_history(&conn, 0).unwrap().len(), 1);
        // Ordering under a bounded limit: the three newest of the four rows.
        let recent = get_recent_listening_history(&conn, 3).unwrap();
        assert_eq!(recent.iter().map(|r| r.track_id.as_str()).collect::<Vec<_>>(), vec!["t2", "t1", "t1"]);
    }

    #[test]
    fn queue_checkpoint_singleton_upsert_and_clean_exit_toggle() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        assert!(get_queue_checkpoint(&conn).unwrap().is_none());

        save_queue_checkpoint(&conn, "{\"a\":1}", 12, false).unwrap();
        let cp = get_queue_checkpoint(&conn).unwrap().unwrap();
        assert_eq!(cp.snapshot_json, "{\"a\":1}");
        assert_eq!(cp.track_count, 12);
        assert!(!cp.clean_exit, "fresh saves must carry the crash marker");

        // UPSERT: still exactly one row (singleton), values replaced.
        save_queue_checkpoint(&conn, "{\"a\":2}", 7, false).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM queue_checkpoint", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let cp = get_queue_checkpoint(&conn).unwrap().unwrap();
        assert_eq!(cp.snapshot_json, "{\"a\":2}");
        assert_eq!(cp.track_count, 7);
        assert!(!cp.clean_exit);

        // Graceful unload flips the marker on the SAME row.
        mark_checkpoint_clean_exit(&conn).unwrap();
        let cp = get_queue_checkpoint(&conn).unwrap().unwrap();
        assert!(cp.clean_exit, "mark_checkpoint_clean_exit must set clean_exit=1");
        assert_eq!(cp.snapshot_json, "{\"a\":2}");
        assert_eq!(cp.track_count, 7);
    }

    #[test]
    fn queue_checkpoint_crash_vs_graceful_and_clear() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();

        // Crash simulation: save during playback (clean_exit=false), no unload.
        save_queue_checkpoint(&conn, "{\"i\":0}", 5, false).unwrap();
        assert!(!get_queue_checkpoint(&conn).unwrap().unwrap().clean_exit);

        // Graceful simulation: same snapshot path, then the unload marker.
        save_queue_checkpoint(&conn, "{\"i\":1}", 5, false).unwrap();
        mark_checkpoint_clean_exit(&conn).unwrap();
        assert!(get_queue_checkpoint(&conn).unwrap().unwrap().clean_exit);

        // The boolean must round-trip through storage as 0/1, not text.
        let raw: i64 = conn
            .query_row("SELECT clean_exit FROM queue_checkpoint WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(raw, 1);

        // Discarding recovery removes the row; reading afterwards is None.
        clear_queue_checkpoint(&conn).unwrap();
        assert!(get_queue_checkpoint(&conn).unwrap().is_none());
        // Clearing an absent checkpoint stays Ok (idempotent).
        clear_queue_checkpoint(&conn).unwrap();
    }

    #[test]
    fn saved_sessions_create_list_and_delete() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();

        assert!(save_named_session(&conn, "   ", 3, 100.0, "{}").is_err(), "blank names rejected");

        let id_a = save_named_session(&conn, "Morning", 10, 2400.0, "{\"q\":\"A\"}").unwrap();
        let id_b = save_named_session(&conn, "  Focus Mix  ", 4, 900.5, "{\"q\":\"B\"}").unwrap();
        let id_c = save_named_session(&conn, "Late Night", 25, 7200.0, "{\"q\":\"C\"}").unwrap();
        assert_ne!(id_a, id_b);

        // Newest activity first; names are trimmed on write.
        let listed = list_saved_sessions(&conn).unwrap();
        let names: Vec<&str> = listed.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["Late Night", "Focus Mix", "Morning"]);
        assert_eq!(listed[1].track_count, 4);
        assert!((listed[1].duration_secs - 900.5).abs() < f64::EPSILON);

        // Deleting removes exactly the target row.
        delete_named_session(&conn, id_b).unwrap();
        let listed = list_saved_sessions(&conn).unwrap();
        assert_eq!(listed.iter().map(|s| s.id).collect::<Vec<_>>(), vec![id_c, id_a]);
        // Deleting an unknown id is a silent no-op.
        delete_named_session(&conn, id_b).unwrap();
        assert_eq!(list_saved_sessions(&conn).unwrap().len(), 2);
    }

    #[test]
    fn checkpoint_and_sessions_migration_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        save_queue_checkpoint(&conn, "{\"k\":1}", 3, true).unwrap();
        save_named_session(&conn, "Keep", 3, 100.0, "{\"k\":1}").unwrap();

        // Re-running boot migration must not drop or corrupt existing rows.
        init_conn(&conn).unwrap();
        let cp = get_queue_checkpoint(&conn).unwrap().unwrap();
        assert_eq!(cp.snapshot_json, "{\"k\":1}");
        assert!(cp.clean_exit);
        let sessions = list_saved_sessions(&conn).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].name, "Keep");
        // Singleton constraint still holds after re-init.
        assert!(save_queue_checkpoint(&conn, "{\"k\":2}", 4, false).is_ok());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM queue_checkpoint", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
