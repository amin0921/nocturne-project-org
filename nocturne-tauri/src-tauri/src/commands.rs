//! Tauri `invoke` allowlist. Only these two commands reach the webview in this step.
use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::DbState;
use crate::scanner::{import_files_into_db, scan_folder_into_db_full, ImportOutcome};

/// Ingestion result for the webview: how many rows were added, and how many
/// files were recognised as already-present elsewhere in the library.
#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDto {
    /// Newly indexed tracks.
    pub inserted: usize,
    /// Files skipped because the same song is already in the library.
    pub skipped: usize,
}

impl From<ImportOutcome> for ImportResultDto {
    fn from(o: ImportOutcome) -> Self {
        ImportResultDto { inserted: o.inserted, skipped: o.skipped }
    }
}

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

/// Audio extension allowlist for the folder-picking dialog — mirrors
/// `scanner::SUPPORTED_EXTS` so the picker opens with audio tracks visible.
const PICK_FOLDER_EXTS: &[&str] = &["mp3", "wav", "m4a", "aac"];

/// Resolves the ingest root for the "Add Folder" flow.
///
/// The Windows folder picker (IFileDialog with FOS_PICKFOLDERS) hides every
/// file, which makes a music folder look empty. The approved UX instead opens
/// a *file* dialog filtered to audio: the user sees the supported tracks and
/// picks any one of them, and its canonical parent folder becomes the scan
/// root. A real directory (e.g. from drag-and-drop or future callers) still
/// works and is used as-is.
///
/// Validation is strict, in Rust only: `..` escapes are rejected, the path is
/// canonicalized, and the picked file must carry a supported audio extension.
pub fn resolve_folder_root(raw: &str) -> Result<PathBuf, String> {
    let clean = raw.trim().to_string();
    if clean.is_empty() || clean.contains("..") {
        return Err("invalid path".to_string());
    }
    let canonical = PathBuf::from(&clean)
        .canonicalize()
        .map_err(|e| format!("Path not found ({e})"))?;
    if canonical.is_dir() {
        return Ok(canonical);
    }
    if !canonical.is_file() {
        return Err("Selected path is not a folder or an audio file".to_string());
    }
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !PICK_FOLDER_EXTS.contains(&ext.as_str()) {
        return Err("Not a supported audio file".to_string());
    }
    let parent = canonical
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Selected file has no parent folder".to_string())?;
    Ok(parent)
}

/// Native audio file picker for the "Add Folder" button.
///
/// Windows' folder-only dialog cannot display files, so the approved UX is:
/// show the supported audio tracks (.mp3/.wav/.m4a/.aac) and let the user pick
/// any single one — its containing folder is then scanned recursively, exactly
/// as `pick_folder` + `scan_folder` did before. Returns None if user cancels.
#[tauri::command]
pub async fn pick_folder_via_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select your music folder (choose any audio file inside it)")
        .add_filter("Audio Files", PICK_FOLDER_EXTS)
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Recursively scans a selected folder into the SQLite database with progress events.
/// Runs on a blocking worker thread; reports inserted vs. deduplicated-skip counts.
///
/// `path` may be a directory or a single supported audio file inside the target
/// folder (the "Add Folder" file-picker flow): `resolve_folder_root` validates
/// and resolves the canonical scan root in Rust either way.
#[tauri::command]
pub async fn scan_folder(app: AppHandle, path: String) -> Result<ImportResultDto, String> {
    // Canonicalize + validate + parent-resolve: all in Rust, never the webview.
    let root = resolve_folder_root(&path)?;

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
        scan_folder_into_db_full(
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
    .map(ImportResultDto::from)
}

/// Native folder picker → recursive scan → SQLite persist.
/// Returns None if user cancels dialog, or the import result.
#[tauri::command]
pub async fn open_music_folder(app: AppHandle) -> Result<Option<ImportResultDto>, String> {
    let picked = pick_folder(app.clone()).await?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let result = scan_folder(app, folder).await?;
    Ok(Some(result))
}

/// "Add Folder" end-to-end: audio-file picker (files visible) → resolve the
/// picked file's parent folder → recursive scan → SQLite persist. Returns None
/// if user cancels the dialog, or the import result.
#[tauri::command]
pub async fn open_music_folder_via_file(app: AppHandle) -> Result<Option<ImportResultDto>, String> {
    let picked = pick_folder_via_file(app.clone()).await?;
    let Some(picked_path) = picked else {
        return Ok(None);
    };
    let folder = resolve_folder_root(&picked_path)?;
    let result = scan_folder(app, folder.to_string_lossy().to_string()).await?;
    Ok(Some(result))
}

/// Native multi-select audio file picker for the "Add Files" button.
/// Unlike the folder picker, files are visible in the Windows dialog, so users
/// can see names/sizes and pick one or many tracks directly.
///
/// The first filter mirrors `scanner::SUPPORTED_EXTS` (mp3 / wav / m4a / aac) so
/// the dialog opens on audio only. A second "All files" filter is offered as an
/// escape hatch: directory enumeration is what stalls on very large folders, and
/// a user who hits that can widen the view instead of waiting. Only the second
/// filter shows non-audio files, and the Rust side still rejects them.
#[tauri::command]
pub async fn pick_audio_files(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Audio Files", &["mp3", "wav", "m4a", "aac"])
        .add_filter("All Files", &["*"])
        .blocking_pick_files();
    let Some(paths) = picked else {
        return Ok(None);
    };
    Ok(Some(
        paths
            .into_iter()
            .filter_map(|file| file.into_path().ok())
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
    ))
}

/// Reads metadata for explicitly selected audio files and inserts new tracks
/// into SQLite. Returns inserted and deduplicated-skip counts.
/// Path validation, tag reads and DB writes happen in Rust only (spawn_blocking
/// keeps them off the main thread); the webview never touches disk or SQL.
///
/// This is also the landing point for files dropped onto the window, so it must
/// stay tolerant: unusable paths are skipped silently, never surfaced as errors.
#[tauri::command]
pub async fn import_audio_files(app: AppHandle, file_paths: Vec<String>) -> Result<ImportResultDto, String> {
    if file_paths.is_empty() {
        return Ok(ImportResultDto { inserted: 0, skipped: 0 });
    }
    let covers_dir = app
        .path()
        .app_local_data_dir()
        .map(|d| d.join("covers"))
        .unwrap_or_else(|_| crate::scanner::default_covers_dir());
    let _ = std::fs::create_dir_all(&covers_dir);
    let files: Vec<PathBuf> = file_paths.into_iter().map(PathBuf::from).collect();

    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        import_files_into_db(&state, &files, Some(&covers_dir))
    })
    .await
    .map_err(|e| e.to_string())?
    .map(ImportResultDto::from)
}

/// Ingests a mixed set of OS paths -- the drag-and-drop entry point.
///
/// The webview cannot stat a path, so the folder/file split is made HERE, in
/// Rust, where paths are canonicalized and validated exactly as they are for
/// the dialog paths: `..` is rejected, the target must exist, and only real
/// files reach the metadata reader. Each folder is scanned, then the loose files
/// are imported; a failure on one item is logged and the rest still proceed, so
/// one bad path in a multi-item drop cannot lose the whole drop.
///
/// Audio files on disk are never modified, only catalogued.
#[tauri::command]
pub async fn ingest_paths(app: AppHandle, paths: Vec<String>) -> Result<ImportResultDto, String> {
    if paths.is_empty() {
        return Ok(ImportResultDto { inserted: 0, skipped: 0 });
    }

    let mut folders: Vec<PathBuf> = Vec::new();
    let mut files: Vec<PathBuf> = Vec::new();
    for raw in paths {
        if raw.contains("..") {
            continue;
        }
        let Ok(canonical) = PathBuf::from(&raw).canonicalize() else {
            continue; // vanished or malformed: skip, never fail the whole drop
        };
        if canonical.is_dir() {
            folders.push(canonical);
        } else if canonical.is_file() {
            files.push(canonical);
        }
    }
    if folders.is_empty() && files.is_empty() {
        return Ok(ImportResultDto { inserted: 0, skipped: 0 });
    }

    let covers_dir = app
        .path()
        .app_local_data_dir()
        .map(|d| d.join("covers"))
        .unwrap_or_else(|_| crate::scanner::default_covers_dir());
    let _ = std::fs::create_dir_all(&covers_dir);

    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        let mut inserted = 0usize;
        let mut skipped = 0usize;
        for folder in &folders {
            match scan_folder_into_db_full(&state, folder, Some(&covers_dir), None) {
                Ok(o) => {
                    inserted += o.inserted;
                    skipped += o.skipped;
                }
                Err(e) => eprintln!("[nocturne] dropped folder failed to scan: {e}"),
            }
        }
        if !files.is_empty() {
            match import_files_into_db(&state, &files, Some(&covers_dir)) {
                Ok(o) => {
                    inserted += o.inserted;
                    skipped += o.skipped;
                }
                Err(e) => eprintln!("[nocturne] dropped files failed to import: {e}"),
            }
        }
        Ok(ImportResultDto { inserted, skipped })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Purges content-duplicate track rows, keeping one survivor per song.
/// Returns how many rows were removed.
///
/// Database records only: no audio file on disk is ever read, moved or deleted,
/// so every survivor can be re-indexed by rescanning its folder. Unlike the
/// one-shot startup migration this is NOT marker-gated, so it stays available as
/// a manual "Remove duplicates" action for the life of the install.
#[tauri::command]
pub fn deduplicate_library(state: State<DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let outcome = crate::db::deduplicate_tracks(&conn)?;
    if outcome.purged > 0 {
        eprintln!(
            "[nocturne] deduplicate_library: purged {} duplicate track row(s)",
            outcome.purged
        );
        for path in &outcome.purged_paths {
            eprintln!("[nocturne]   purged: {path}");
        }
    }
    Ok(outcome.purged)
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

/// Deletes the sibling `.lrc` file beside `file_path` (bad / mismatched cached lyrics).
/// Idempotent: returns Ok(true) when no lyrics file remains beside the track.
#[tauri::command]
pub fn delete_cached_lyrics(file_path: String) -> Result<bool, String> {
    if file_path.contains("..") {
        return Err("invalid path".to_string());
    }
    let audio_path = PathBuf::from(&file_path);
    let lrc_path = audio_path.with_extension("lrc");

    if !lrc_path.exists() {
        return Ok(true);
    }
    if !lrc_path.is_file() {
        return Ok(false);
    }

    std::fs::remove_file(&lrc_path).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Audio extensions the Explorer reveal may touch — mirrors
/// `scanner::SUPPORTED_EXTS` (same pattern as `pick_audio_files`).
const REVEAL_EXTS: &[&str] = &["mp3", "wav", "m4a", "aac"];

/// Validates a path before it can reach the OS: rejects empty/`..` escapes,
/// canonicalizes to an existing audio file, and requires the path to be
/// catalogued in `tracks` (the library allowlist). Returns the normalized
/// display path that the OS should be handed.
///
/// Separator normalization is Windows-only. A stored Windows path is always
/// backslash-separated, so a forward-slash form arriving from the webview has to
/// be rewritten to match the `file_path` column. On macOS every absolute path
/// already begins with `/`, and rewriting those slashes to backslashes would
/// destroy the path outright, so the raw value is used unchanged there.
fn validate_reveal_path(conn: &rusqlite::Connection, raw: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let clean = raw.replace('/', "\\");
    #[cfg(not(target_os = "windows"))]
    let clean = raw.to_string();
    if clean.trim().is_empty() || clean.contains("..") {
        return Err("invalid path".to_string());
    }
    let canonical = PathBuf::from(&clean)
        .canonicalize()
        .map_err(|e| format!("File not found ({e})"))?;
    if !canonical.is_file() {
        return Err("Path is not a file".to_string());
    }
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !REVEAL_EXTS.contains(&ext.as_str()) {
        return Err("Not a supported audio file".to_string());
    }
    let tracked: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM tracks WHERE file_path = ?1",
            params![clean],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if tracked.is_none() {
        return Err("Path is not in the library".to_string());
    }
    Ok(clean)
}

/// Reveals a library audio file in the OS file manager and highlights it.
///
/// The webview only ever passes a DB-catalogued track path; validation happens
/// in Rust so the OS is never pointed anywhere else.
/// - Windows: `explorer /select,`
/// - macOS:   `open -R` (reveals in Finder with the file selected)
///
/// The Windows arm is byte-identical to the original implementation.
#[tauri::command]
pub fn reveal_in_explorer(state: State<DbState>, path: String) -> Result<(), String> {
    let clean_path = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        validate_reveal_path(&conn, &path)?
    };

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(["/select,", &clean_path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args(["-R", &clean_path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = clean_path;
        Err("Only supported on Windows and macOS".into())
    }
}

/// Reads the per-track lyric calibration offset (ms) from `lyric_offsets`.
/// Absent track → `0` (perfectly aligned). Pure DB read — no disk writes.
pub fn get_lyric_offset_impl(conn: &rusqlite::Connection, track_id: &str) -> Result<i32, String> {
    let stored: Option<i32> = conn
        .query_row(
            "SELECT offset_ms FROM lyric_offsets WHERE track_id = ?1",
            params![track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(stored.unwrap_or(0))
}

/// Upserts the per-track lyric calibration offset (ms) into `lyric_offsets`.
/// Idempotent: repeated writes for the same track keep a single row.
pub fn set_lyric_offset_impl(
    conn: &rusqlite::Connection,
    track_id: &str,
    offset_ms: i32,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO lyric_offsets (track_id, offset_ms, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(track_id) DO UPDATE SET
           offset_ms = excluded.offset_ms,
           updated_at = excluded.updated_at",
        params![track_id, offset_ms, crate::db::now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the saved lyric offset for one track (ms, 0 when never calibrated).
#[tauri::command]
pub fn get_lyric_offset(state: State<DbState>, track_id: String) -> Result<i32, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_lyric_offset_impl(&conn, &track_id)
}

/// Persists the lyric offset for one track (ms). SQLite only — `.lrc` files
/// on disk are never rewritten by this command.
#[tauri::command]
pub fn set_lyric_offset(state: State<DbState>, track_id: String, offset_ms: i32) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    set_lyric_offset_impl(&conn, &track_id, offset_ms)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RankedItemDto {
    pub id: String,
    pub title: String,
    pub sub: String,
    pub metric: String,
    pub value: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatsPayload {
    pub hours: f64,
    pub hours_delta: f64,
    pub hours_trend: Vec<f64>,
    pub plays: u64,
    pub plays_delta: f64,
    pub plays_trend: Vec<f64>,
    pub artists: usize,
    pub artists_delta: f64,
    pub active_days: usize,
    pub week_bars: Vec<f64>,
    pub today_index: usize,
    pub top_artists: Vec<RankedItemDto>,
    pub top_tracks: Vec<RankedItemDto>,
}

pub fn record_play_impl(
    conn: &rusqlite::Connection,
    track_id: &str,
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration_ms: u64,
) -> Result<i64, String> {
    let now = crate::db::now_ms();
    conn.execute(
        "INSERT INTO plays (track_id, title, artist, album, played_at, duration_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![track_id, title, artist, album, now, duration_ms as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn get_listening_stats_impl(
    conn: &rusqlite::Connection,
    range: &str,
) -> Result<StatsPayload, String> {
    let now = crate::db::now_ms();
    let timeframe_ms: i64 = match range {
        "month" => 30 * 24 * 3600 * 1000,
        "year" => 365 * 24 * 3600 * 1000,
        _ => 7 * 24 * 3600 * 1000, // "week"
    };

    let cur_start = now - timeframe_ms;
    let prev_start = cur_start - timeframe_ms;
    let prev_end = cur_start;

    // Current period metrics
    let (cur_hours, cur_plays, cur_artists, active_days): (f64, i64, usize, usize) = conn
        .query_row(
            "SELECT
               COALESCE(SUM(duration_ms)/3600000.0, 0.0),
               COUNT(*),
               COUNT(DISTINCT artist),
               COUNT(DISTINCT strftime('%Y-%m-%d', played_at/1000, 'unixepoch', 'localtime'))
             FROM plays
             WHERE played_at >= ?1",
            params![cur_start],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap_or((0.0, 0, 0, 0));

    // Previous period metrics
    let (prev_hours, prev_plays, prev_artists): (f64, i64, usize) = conn
        .query_row(
            "SELECT
               COALESCE(SUM(duration_ms)/3600000.0, 0.0),
               COUNT(*),
               COUNT(DISTINCT artist)
             FROM plays
             WHERE played_at >= ?1 AND played_at < ?2",
            params![prev_start, prev_end],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap_or((0.0, 0, 0));

    let calc_delta = |cur: f64, prev: f64| -> f64 {
        if prev > 0.0 {
            ((cur - prev) / prev) * 100.0
        } else if cur > 0.0 {
            100.0
        } else {
            0.0
        }
    };

    let hours_delta = calc_delta(cur_hours, prev_hours);
    let plays_delta = calc_delta(cur_plays as f64, prev_plays as f64);
    let artists_delta = calc_delta(cur_artists as f64, prev_artists as f64);

    // 8 normalized trend values
    let mut hours_trend = vec![0.0; 8];
    let mut plays_trend = vec![0.0; 8];
    let bucket_ms = timeframe_ms / 8;
    for i in 0..8 {
        let b_start = cur_start + (i as i64) * bucket_ms;
        let b_end = if i == 7 { now } else { cur_start + ((i + 1) as i64) * bucket_ms };
        let (h, p): (f64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_ms)/3600000.0, 0.0), COUNT(*)
                 FROM plays WHERE played_at >= ?1 AND played_at < ?2",
                params![b_start, b_end],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((0.0, 0));
        hours_trend[i] = h;
        plays_trend[i] = p as f64;
    }
    let max_h = hours_trend.iter().cloned().fold(0.0, f64::max);
    if max_h > 0.0 {
        for val in &mut hours_trend {
            *val = *val / max_h;
        }
    }
    let max_p = plays_trend.iter().cloned().fold(0.0, f64::max);
    if max_p > 0.0 {
        for val in &mut plays_trend {
            *val = *val / max_p;
        }
    }

    // Week bars (7 values, Saturday to Friday) and today_index
    let today_index: usize = conn
        .query_row(
            "SELECT (cast(strftime('%w', 'now', 'localtime') as integer) + 1) % 7",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let saturday_midnight_ms: i64 = conn
        .query_row(
            "SELECT (cast(strftime('%s', 'now', 'localtime', 'start of day') as integer) - (?1 * 86400)) * 1000",
            params![today_index as i64],
            |r| r.get(0),
        )
        .unwrap_or(cur_start);

    let mut week_bars = vec![0.0; 7];
    if let Ok(mut stmt) = conn.prepare(
        "SELECT (cast(strftime('%w', played_at/1000, 'unixepoch', 'localtime') as integer) + 1) % 7 AS dow,
                SUM(duration_ms)/3600000.0 AS hours
         FROM plays
         WHERE played_at >= ?1
         GROUP BY dow",
    ) {
        if let Ok(rows) = stmt.query_map(params![saturday_midnight_ms], |r| {
            Ok((r.get::<_, usize>(0)?, r.get::<_, f64>(1)?))
        }) {
            for row in rows.flatten() {
                if row.0 < 7 {
                    week_bars[row.0] = row.1;
                }
            }
        }
    }

    // Top 10 artists by duration
    let mut top_artists = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT artist, SUM(duration_ms) AS ms, COUNT(*) AS plays
         FROM plays
         WHERE played_at >= ?1
         GROUP BY artist
         ORDER BY ms DESC, plays DESC
         LIMIT 10",
    ) {
        if let Ok(rows) = stmt.query_map(params![cur_start], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
        }) {
            for row in rows.flatten() {
                let artist = row.0;
                let ms = row.1;
                let plays = row.2;
                let hours = (ms as f64) / 3_600_000.0;
                let metric = if hours >= 0.1 {
                    format!("{:.1}h", hours)
                } else {
                    format!("{}m", ms / 60_000)
                };
                top_artists.push(RankedItemDto {
                    id: artist.clone(),
                    title: artist,
                    sub: format!("{} plays", plays),
                    metric,
                    value: hours,
                });
            }
        }
    }

    // Top 10 tracks by play count
    let mut top_tracks = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT track_id, title, artist, COUNT(*) AS plays, SUM(duration_ms) AS ms
         FROM plays
         WHERE played_at >= ?1
         GROUP BY track_id
         ORDER BY plays DESC, ms DESC
         LIMIT 10",
    ) {
        if let Ok(rows) = stmt.query_map(params![cur_start], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
            ))
        }) {
            for row in rows.flatten() {
                let track_id = row.0;
                let title = row.1;
                let artist = row.2;
                let plays = row.3;
                let _ms = row.4;
                top_tracks.push(RankedItemDto {
                    id: track_id,
                    title,
                    sub: artist,
                    metric: format!("{} plays", plays),
                    value: plays as f64,
                });
            }
        }
    }

    Ok(StatsPayload {
        hours: cur_hours,
        hours_delta,
        hours_trend,
        plays: cur_plays as u64,
        plays_delta,
        plays_trend,
        artists: cur_artists,
        artists_delta,
        active_days,
        week_bars,
        today_index,
        top_artists,
        top_tracks,
    })
}

/// Inserts a play event into SQLite.
#[tauri::command]
pub fn record_play(
    state: State<DbState>,
    track_id: String,
    title: String,
    artist: String,
    album: Option<String>,
    duration_ms: u64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    record_play_impl(&conn, &track_id, &title, &artist, album.as_deref(), duration_ms)?;
    Ok(())
}

/// Retrieves aggregated listening stats for range "week", "month", or "year".
#[tauri::command]
pub fn get_listening_stats(
    state: State<DbState>,
    range: String,
) -> Result<StatsPayload, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_listening_stats_impl(&conn, &range)
}

/// Records one listening-history play session (Phase 01 · Feature 2).
#[tauri::command]
pub fn record_listening_history(
    state: State<DbState>,
    track_id: String,
    title: String,
    artist: String,
    duration_secs: f64,
    duration_listened_secs: f64,
    status: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::insert_listening_history(
        &conn,
        &track_id,
        &title,
        &artist,
        duration_secs,
        duration_listened_secs,
        &status,
        None,
    )?;
    Ok(())
}

/// Most recent listening-history rows, newest first. `limit` defaults to
/// `DEFAULT_HISTORY_LIMIT` and is clamped to `1..=MAX_HISTORY_LIMIT`.
#[tauri::command]
pub fn get_listening_history(
    state: State<DbState>,
    limit: Option<u32>,
) -> Result<Vec<crate::db::HistoryEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::get_recent_listening_history(&conn, limit.unwrap_or(crate::db::DEFAULT_HISTORY_LIMIT))
}

/// Total recorded play sessions for one track id.
#[tauri::command]
pub fn get_track_play_count(
    state: State<DbState>,
    track_id: String,
) -> Result<u64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::get_track_play_count(&conn, &track_id)
}

// ---------------- Queue checkpoint & saved sessions (Phase 01 · Feature 3) ----------------

/// UPSERT the singleton playback checkpoint. `cleanExit` defaults to false so
/// periodic saves during playback always leave a crash marker until the
/// graceful-unload path explicitly flips it.
#[tauri::command]
pub fn save_queue_checkpoint(
    state: State<DbState>,
    snapshot_json: String,
    track_count: u32,
    clean_exit: Option<bool>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::save_queue_checkpoint(&conn, &snapshot_json, track_count, clean_exit.unwrap_or(false))
}

/// Graceful-exit marker: mark the checkpoint as a clean shutdown.
#[tauri::command]
pub fn mark_checkpoint_clean_exit(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::mark_checkpoint_clean_exit(&conn)
}

/// Read the singleton checkpoint; `null` when nothing has ever been saved.
#[tauri::command]
pub fn get_queue_checkpoint(
    state: State<DbState>,
) -> Result<Option<crate::db::QueueCheckpointRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::get_queue_checkpoint(&conn)
}

/// Discard the checkpoint (e.g. the user declines crash recovery).
#[tauri::command]
pub fn clear_queue_checkpoint(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::clear_queue_checkpoint(&conn)
}

/// Persist the current playback state as a named session; returns its id.
#[tauri::command]
pub fn save_named_session(
    state: State<DbState>,
    name: String,
    track_count: u32,
    duration_secs: f64,
    snapshot_json: String,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::save_named_session(&conn, &name, track_count, duration_secs, &snapshot_json)
}

/// List named sessions, newest activity first.
#[tauri::command]
pub fn list_saved_sessions(
    state: State<DbState>,
) -> Result<Vec<crate::db::SavedSessionSummary>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::list_saved_sessions(&conn)
}

/// Delete one named session by id.
#[tauri::command]
pub fn delete_named_session(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::delete_named_session(&conn, id)
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

    #[test]
    fn delete_cached_lyrics_removes_sibling_lrc() {
        let test_dir = std::env::temp_dir().join(format!("nocturne_test_delete_lyrics_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&test_dir);
        let audio_file = test_dir.join("bad_song.mp3");
        let lrc_file = test_dir.join("bad_song.lrc");

        std::fs::write(&lrc_file, "[00:01.00]Wrong artist lyrics").unwrap();

        let removed = delete_cached_lyrics(audio_file.to_string_lossy().to_string()).unwrap();
        assert!(removed);
        assert!(!lrc_file.exists());

        let again = delete_cached_lyrics(audio_file.to_string_lossy().to_string()).unwrap();
        assert!(again);

        assert!(delete_cached_lyrics("..\\..\\escaped_track.mp3".to_string()).is_err());

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn record_play_and_get_stats_empty() {
        let conn = mem_db();
        let stats = get_listening_stats_impl(&conn, "week").unwrap();
        assert_eq!(stats.hours, 0.0);
        assert_eq!(stats.plays, 0);
        assert_eq!(stats.artists, 0);
        assert_eq!(stats.active_days, 0);
        assert_eq!(stats.hours_trend.len(), 8);
        assert_eq!(stats.plays_trend.len(), 8);
        assert_eq!(stats.week_bars.len(), 7);
        assert!(stats.top_artists.is_empty());
        assert!(stats.top_tracks.is_empty());
    }

    #[test]
    fn record_play_and_get_stats_with_data() {
        let conn = mem_db();
        let row_id = record_play_impl(&conn, "t1", "Track 1", "Artist A", Some("Album A"), 180_000).unwrap();
        assert!(row_id > 0);
        record_play_impl(&conn, "t2", "Track 2", "Artist B", None, 120_000).unwrap();
        record_play_impl(&conn, "t1", "Track 1", "Artist A", Some("Album A"), 180_000).unwrap();

        let stats = get_listening_stats_impl(&conn, "week").unwrap();
        assert_eq!(stats.plays, 3);
        assert_eq!(stats.artists, 2);
        assert_eq!(stats.active_days, 1);
        assert!((stats.hours - 0.1333).abs() < 0.01);
        assert_eq!(stats.top_artists.len(), 2);
        assert_eq!(stats.top_artists[0].title, "Artist A");
        assert_eq!(stats.top_tracks.len(), 2);
        assert_eq!(stats.top_tracks[0].title, "Track 1");
        assert_eq!(stats.top_tracks[0].value, 2.0);
    }

    #[test]
    fn lyric_offset_absent_track_defaults_to_zero() {
        let conn = mem_db();
        assert_eq!(get_lyric_offset_impl(&conn, "never-seen").unwrap(), 0);
    }

    #[test]
    fn lyric_offset_roundtrip_is_per_track() {
        let conn = mem_db();
        // Track A calibrated to +1.50s …
        set_lyric_offset_impl(&conn, "track-a", 1500).unwrap();
        // … switching to Track B must read a pristine 0.00s …
        assert_eq!(get_lyric_offset_impl(&conn, "track-b").unwrap(), 0);
        // … and coming back to Track A restores +1.50s.
        assert_eq!(get_lyric_offset_impl(&conn, "track-a").unwrap(), 1500);
    }

    #[test]
    fn lyric_offset_upsert_updates_in_place() {
        let conn = mem_db();
        set_lyric_offset_impl(&conn, "t1", 500).unwrap();
        set_lyric_offset_impl(&conn, "t1", -2450).unwrap();
        assert_eq!(get_lyric_offset_impl(&conn, "t1").unwrap(), -2450);
        assert_eq!(count(&conn, "lyric_offsets"), 1);
        // Reset writes a real 0 row, not a deletion — readback stays 0.
        set_lyric_offset_impl(&conn, "t1", 0).unwrap();
        assert_eq!(get_lyric_offset_impl(&conn, "t1").unwrap(), 0);
        assert_eq!(count(&conn, "lyric_offsets"), 1);
    }

    #[test]
    fn lyric_offset_accepts_full_calibration_range() {
        let conn = mem_db();
        for offset in [-5000_i32, -4950, -50, 0, 50, 4950, 5000] {
            set_lyric_offset_impl(&conn, "range", offset).unwrap();
            assert_eq!(get_lyric_offset_impl(&conn, "range").unwrap(), offset);
        }
    }

    #[test]
    fn resolve_folder_root_rejects_escape_empty_and_missing() {
        assert!(resolve_folder_root("").is_err());
        assert!(resolve_folder_root("   ").is_err());
        assert!(resolve_folder_root("..\\..\\escape").is_err());
        assert!(resolve_folder_root("C:\\definitely\\not\\there_xyz").is_err());
    }

    #[test]
    fn resolve_folder_root_accepts_dir_and_audio_file_parent() {
        let dir = std::env::temp_dir().join(format!("nocturne_test_root_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        // A directory passes through as the scan root.
        assert_eq!(
            resolve_folder_root(&dir.to_string_lossy()).unwrap(),
            dir.canonicalize().unwrap()
        );

        // A supported audio file resolves to its canonical parent folder.
        let file = dir.join("track.mp3");
        std::fs::write(&file, b"x").unwrap();
        assert_eq!(
            resolve_folder_root(&file.to_string_lossy()).unwrap(),
            dir.canonicalize().unwrap()
        );

        // A non-audio file is rejected, even if it exists.
        let note = dir.join("note.txt");
        std::fs::write(&note, b"x").unwrap();
        assert!(resolve_folder_root(&note.to_string_lossy()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_path_rejects_escape_empty_foreign_and_non_audio() {
        let conn = mem_db();

        // Escape / empty inputs never reach the filesystem.
        assert!(validate_reveal_path(&conn, "..\\..\\escape.mp3").is_err());
        assert!(validate_reveal_path(&conn, "").is_err());
        assert!(validate_reveal_path(&conn, "   ").is_err());

        let dir = std::env::temp_dir().join(format!("nocturne_test_reveal_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        // Existing audio file that is NOT catalogued → library allowlist denies.
        let foreign = dir.join("foreign.mp3");
        std::fs::write(&foreign, b"x").unwrap();
        assert!(validate_reveal_path(&conn, &foreign.to_string_lossy()).is_err());

        // Catalogued or not, a non-audio extension is denied before any spawn.
        let note = dir.join("note.txt");
        std::fs::write(&note, b"not audio").unwrap();
        assert!(validate_reveal_path(&conn, &note.to_string_lossy()).is_err());

        // Nonexistent audio file → canonicalize fails.
        let ghost = dir.join("ghost.mp3");
        assert!(validate_reveal_path(&conn, &ghost.to_string_lossy()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_path_accepts_catalogued_audio_file() {
        let conn = mem_db();
        let dir = std::env::temp_dir().join(format!("nocturne_test_reveal_ok_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("catalogued.m4a");
        std::fs::write(&file, b"").unwrap();
        let path_str = file.to_string_lossy().to_string();

        let now = crate::db::now_ms();
        conn.execute(
            "INSERT INTO folders (folder_path, date_added) VALUES (?1, ?2)",
            params![dir.to_string_lossy().to_string(), now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (file_path, folder_id, title, date_added, last_seen_at)
             VALUES (?1, 1, 'Song', ?2, ?2)",
            params![path_str, now],
        )
        .unwrap();

        // Display path round-trips unchanged…
        assert_eq!(validate_reveal_path(&conn, &path_str).unwrap(), path_str);
        // …and forward slashes are normalized before the allowlist lookup.
        assert_eq!(
            validate_reveal_path(&conn, &path_str.replace('\\', "/")).unwrap(),
            path_str
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
