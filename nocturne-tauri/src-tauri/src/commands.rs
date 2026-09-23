//! Tauri `invoke` allowlist. Only these two commands reach the webview in this step.
use rusqlite::params;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::DbState;
use crate::scanner::scan_folder_into_db_with_covers;

#[derive(serde::Serialize)]
pub struct TrackDto {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_secs: Option<f64>,
    pub missing: i64,
    #[serde(rename = "coverUrl")]
    pub cover_url: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct ScanProgressPayload {
    scanned: usize,
    total: usize,
}

/// Native folder picker dialog. Returns Some(path) or None if user cancels.
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Recursively scans a selected folder into the SQLite database with progress events.
#[tauri::command]
pub async fn scan_folder(app: AppHandle, path: String) -> Result<usize, String> {
    let selected = PathBuf::from(path);
    // Canonicalize: resolves symlinks, normalizes `..`, anchors the allowlist root.
    let root = selected.canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let _ = app.emit("scan-start", ());

    let covers_dir = app
        .path()
        .app_local_data_dir()
        .map(|d| d.join("covers"))
        .unwrap_or_else(|_| crate::scanner::default_covers_dir());
    let _ = std::fs::create_dir_all(&covers_dir);

    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        let emitter = app.clone();
        scan_folder_into_db_with_covers(
            &state,
            &root,
            Some(&covers_dir),
            Some(&mut |done, total| {
                let _ = emitter.emit(
                    "scan-progress",
                    ScanProgressPayload { scanned: done, total },
                );
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Native folder picker → recursive scan → SQLite persist.
/// Returns None if user cancels dialog, or Some(count) of imported tracks.
#[tauri::command]
pub async fn open_music_folder(app: AppHandle) -> Result<Option<usize>, String> {
    let picked = pick_folder(app.clone()).await?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let count = scan_folder(app, folder).await?;
    Ok(Some(count))
}

/// All catalogued tracks, newest first.
#[tauri::command]
pub fn get_tracks(state: State<DbState>) -> Result<Vec<TrackDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration_secs, missing, cover_url
             FROM tracks ORDER BY date_added DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let tracks = stmt
        .query_map(params![], |row| {
            Ok(TrackDto {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                duration_secs: row.get(5)?,
                missing: row.get(6)?,
                cover_url: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(tracks)
}

/// Delete one catalogued track by id. DB record only — the audio file is never touched.
fn delete_track_row(conn: &rusqlite::Connection, track_id: i64) -> Result<bool, String> {
    let removed = conn
        .execute("DELETE FROM tracks WHERE id = ?1", params![track_id])
        .map_err(|e| e.to_string())?;
    Ok(removed > 0)
}

/// Empty the whole library (tracks + folders). DB records only — files untouched.
fn clear_library_tables(conn: &rusqlite::Connection) -> Result<usize, String> {
    let removed = conn
        .execute("DELETE FROM tracks", params![])
        .map_err(|e| e.to_string())? as usize;
    conn.execute("DELETE FROM folders", params![])
        .map_err(|e| e.to_string())?;
    Ok(removed)
}

#[tauri::command]
pub fn delete_track(state: State<DbState>, track_id: i64) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_track_row(&conn, track_id)
}

#[tauri::command]
pub fn clear_library(state: State<DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    clear_library_tables(&conn)
}

/// Reads synchronized LRC lyrics file located beside the audio file.
/// If file_path is `C:\Music\song.mp3`, checks for `C:\Music\song.lrc`.
/// Returns Ok(Some(content)) if found, Ok(None) if not found.
#[tauri::command]
pub fn get_lyrics(file_path: String) -> Result<Option<String>, String> {
    let audio_path = PathBuf::from(&file_path);
    let lrc_path = audio_path.with_extension("lrc");

    if !lrc_path.exists() || !lrc_path.is_file() {
        return Ok(None);
    }

    match std::fs::read_to_string(&lrc_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) => {
            if let Ok(bytes) = std::fs::read(&lrc_path) {
                let content = String::from_utf8_lossy(&bytes).to_string();
                Ok(Some(content))
            } else {
                Err(e.to_string())
            }
        }
    }
}

/// Saves synchronized LRC lyrics content into a sibling `.lrc` file beside the audio file.
/// If file_path is `C:\Music\song.mp3`, writes to `C:\Music\song.lrc`.
#[tauri::command]
pub fn save_cached_lyrics(file_path: String, content: String) -> Result<(), String> {
    let audio_path = PathBuf::from(&file_path);
    let lrc_path = audio_path.with_extension("lrc");

    std::fs::write(&lrc_path, content.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_conn;
    use rusqlite::Connection;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_conn(&conn).unwrap();
        conn
    }

    fn seed_tracks(conn: &Connection, n: i64) -> Vec<i64> {
        let now = crate::db::now_ms();
        conn.execute(
            "INSERT OR IGNORE INTO folders (folder_path, date_added) VALUES ('C:\\Music', ?1)",
            params![now],
        )
        .unwrap();
        let mut ids = Vec::new();
        for i in 0..n {
            conn.execute(
                "INSERT INTO tracks (file_path, folder_id, title, date_added, last_seen_at)
                 VALUES (?1, 1, ?2, ?3, ?3)",
                params![format!("C:\\Music\\t{i}.mp3"), format!("Song {i}"), now],
            )
            .unwrap();
            ids.push(conn.last_insert_rowid());
        }
        ids
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn delete_track_removes_only_target() {
        let conn = mem_db();
        let ids = seed_tracks(&conn, 3);
        assert!(delete_track_row(&conn, ids[1]).unwrap());
        assert_eq!(count(&conn, "tracks"), 2);
        let remaining: Vec<i64> = conn
            .prepare("SELECT id FROM tracks ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(remaining, vec![ids[0], ids[2]]);
    }

    #[test]
    fn delete_track_missing_id_returns_false() {
        let conn = mem_db();
        seed_tracks(&conn, 1);
        assert!(!delete_track_row(&conn, 9999).unwrap());
        assert_eq!(count(&conn, "tracks"), 1);
    }

    #[test]
    fn clear_library_empties_tracks_and_folders() {
        let conn = mem_db();
        seed_tracks(&conn, 3);
        let removed = clear_library_tables(&conn).unwrap();
        assert_eq!(removed, 3);
        assert_eq!(count(&conn, "tracks"), 0);
        assert_eq!(count(&conn, "folders"), 0);
    }

    #[test]
    fn get_lyrics_returns_none_when_nonexistent() {
        let res = get_lyrics("C:\\nonexistent_audio_path_xyz_123.mp3".to_string()).unwrap();
        assert_eq!(res, None);
    }

    #[test]
    fn get_lyrics_reads_content_when_lrc_exists() {
        let test_dir = std::env::temp_dir().join(format!("nocturne_test_lyrics_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&test_dir);
        let audio_file = test_dir.join("test_song.mp3");
        let lrc_file = test_dir.join("test_song.lrc");

        std::fs::write(&lrc_file, "[00:01.00]Hello world").unwrap();

        let res = get_lyrics(audio_file.to_string_lossy().to_string()).unwrap();
        assert_eq!(res, Some("[00:01.00]Hello world".to_string()));

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn save_cached_lyrics_writes_sibling_lrc() {
        let test_dir = std::env::temp_dir().join(format!("nocturne_test_save_lyrics_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&test_dir);
        let audio_file = test_dir.join("save_song.flac");
        let lrc_file = test_dir.join("save_song.lrc");

        save_cached_lyrics(audio_file.to_string_lossy().to_string(), "[00:02.50]Cached lyrics".to_string()).unwrap();

        assert!(lrc_file.exists());
        let read_back = std::fs::read_to_string(&lrc_file).unwrap();
        assert_eq!(read_back, "[00:02.50]Cached lyrics");

        let _ = std::fs::remove_dir_all(&test_dir);
    }
}
