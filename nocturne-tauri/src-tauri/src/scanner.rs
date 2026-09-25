//! Folder walk + tag extraction. Pure std + lofty; no Tauri types (unit-testable).
use lofty::config::ParseOptions;
use lofty::picture::{Picture, PictureType};
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::read_from_path;
use rusqlite::{params, OptionalExtension};
use std::hash::{DefaultHasher, Hasher};
use std::path::{Path, PathBuf};

use crate::db::{now_ms, DbState};

/// Strip `\\?\` verbatim prefixes (`\\?\C:\...`, `\\?\UNC\server\...`) so
/// stored paths stay in plain display form for URL building.
fn strip_verbatim(path_text: &str) -> String {
    if let Some(rest) = path_text.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = path_text.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    path_text.to_string()
}

const SUPPORTED_EXTS: &[&str] = &["mp3", "wav", "m4a", "aac"];
/// Counted as "skipped unsupported", never a crash.
const UNSUPPORTED_AUDIO: &[&str] = &["flac", "ogg", "oga", "opus", "wma", "aiff", "aif", "mka"];
const BATCH_SIZE: usize = 50;

fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

pub fn is_supported(path: &Path) -> bool {
    SUPPORTED_EXTS.contains(&ext_of(path).as_str())
}

pub fn detect_image_extension(data: &[u8]) -> &'static str {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if data.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        "webp"
    } else {
        "jpg"
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(bytes);
    format!("{:016x}", hasher.finish())
}

pub fn default_covers_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("com.nocturne.app")
        .join("covers")
}

fn extract_cover_bytes(tagged: &lofty::file::TaggedFile) -> Option<(Vec<u8>, &'static str)> {
    let mut pics: Vec<&Picture> = Vec::new();
    if let Some(tag) = tagged.primary_tag() {
        pics.extend(tag.pictures());
    }
    if pics.is_empty() {
        if let Some(tag) = tagged.first_tag() {
            pics.extend(tag.pictures());
        }
    }
    if pics.is_empty() {
        for tag in tagged.tags() {
            pics.extend(tag.pictures());
        }
    }
    let best = pics
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pics.first())?;

    let data = best.data();
    if data.is_empty() {
        return None;
    }
    let ext = detect_image_extension(data);
    Some((data.to_vec(), ext))
}

fn truncate(text: &str, fallback: &str) -> String {
    let t = text.trim();
    let t = if t.is_empty() { fallback } else { t };
    if t.len() > 500 {
        t[..500].to_string()
    } else {
        t.to_string()
    }
}

/// `Artist - Title` split; otherwise the bare filename becomes the title.
pub fn fallback_from_filename(path: &Path) -> (String, String) {
    let base = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Title")
        .trim();
    if let Some(sep) = base.find(" - ") {
        let artist = base[..sep].trim();
        let title = base[sep + 3..].trim();
        (
            truncate(if title.is_empty() { base } else { title }, "Unknown Title"),
            truncate(
                if artist.is_empty() {
                    "Unknown Artist"
                } else {
                    artist
                },
                "Unknown Artist",
            ),
        )
    } else {
        (truncate(base, "Unknown Title"), "Unknown Artist".to_string())
    }
}

#[derive(Debug, Clone)]
pub struct ScannedTrack {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: Option<i64>,
    pub duration_secs: Option<f64>,
    pub file_size: Option<i64>,
    pub mtime_ms: Option<i64>,
    pub cover_url: Option<String>,
}

/// Read tags with lofty without writing cover cache.
pub fn read_metadata(canonical: &Path) -> Result<ScannedTrack, String> {
    read_metadata_with_covers(canonical, None)
}

/// Read tags with lofty and extract cover artwork if covers_dir is provided.
/// Corrupt/untagged files fall back to the filename.
/// Only hard-fails if the file itself is unreadable (vanished, permissions).
pub fn read_metadata_with_covers(
    canonical: &Path,
    covers_dir: Option<&Path>,
) -> Result<ScannedTrack, String> {
    let (fb_title, fb_artist) = fallback_from_filename(canonical);
    let meta = std::fs::metadata(canonical).map_err(|e| e.to_string())?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);

    let mut track = ScannedTrack {
        path: canonical.to_string_lossy().to_string(),
        title: fb_title.clone(),
        artist: fb_artist.clone(),
        album: "Unknown Album".to_string(),
        year: None,
        duration_secs: None,
        file_size: Some(meta.len() as i64),
        mtime_ms,
        cover_url: None,
    };

    let tagged = match read_from_path(canonical) {
        Ok(t) => Some((t, true)),
        Err(_) => {
            // Corrupt audio frames: salvage the tag header without properties.
            let mut options = ParseOptions::new();
            options.read_properties(false);
            Probe::open(canonical)
                .ok()
                .and_then(|probe| probe.options(options).read().ok())
                .map(|t| (t, false))
        }
    };
    let Some((tagged, with_properties)) = tagged else {
        return Ok(track); // graceful: keep filename fallback
    };
    if let Some(tag) = tagged.primary_tag() {
        if let Some(v) = tag.title() {
            track.title = truncate(&v, &fb_title);
        }
        if let Some(v) = tag.artist() {
            track.artist = truncate(&v, &fb_artist);
        }
        if let Some(v) = tag.album() {
            track.album = truncate(&v, "Unknown Album");
        }
        track.year = tag.year().map(|y| y as i64);
    }
    if with_properties {
        let secs = tagged.properties().duration().as_secs_f64();
        if secs.is_finite() && secs > 0.0 {
            track.duration_secs = Some(secs);
        }
    }

    if let Some((bytes, ext)) = extract_cover_bytes(&tagged) {
        if let Some(target_dir) = covers_dir {
            let hash = hash_bytes(&bytes);
            let filename = format!("{hash}.{ext}");
            let target_path = target_dir.join(&filename);
            if !target_path.exists() {
                if let Ok(()) = std::fs::create_dir_all(target_dir) {
                    let _ = std::fs::write(&target_path, &bytes);
                }
            }
            track.cover_url = Some(strip_verbatim(&target_path.to_string_lossy()));
        }
    }

    Ok(track)
}

/// Recursive walk with plain std::fs. Returns supported files + unsupported-audio count.
pub fn walk_folder(root: &Path) -> (Vec<PathBuf>, usize) {
    let mut files = Vec::new();
    let mut skipped = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // unreadable dir: skip, never crash
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let ft = match entry.file_type() {
                Ok(f) => f,
                Err(_) => continue,
            };
            if ft.is_dir() {
                let hidden = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with('.'))
                    .unwrap_or(false);
                if !hidden {
                    stack.push(path);
                }
            } else if ft.is_file() {
                let ext = ext_of(&path);
                if is_supported(&path) {
                    files.push(path);
                } else if UNSUPPORTED_AUDIO.contains(&ext.as_str()) {
                    skipped += 1;
                }
            }
        }
    }
    (files, skipped)
}

const UPSERT_SQL: &str = "
INSERT INTO tracks (
  file_path, folder_id, title, artist, album, year, duration_secs,
  file_size, mtime_ms, missing, date_added, last_seen_at, cover_url
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?10, ?11)
ON CONFLICT(file_path) DO UPDATE SET
  folder_id = excluded.folder_id,
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  year = excluded.year,
  duration_secs = excluded.duration_secs,
  file_size = excluded.file_size,
  mtime_ms = excluded.mtime_ms,
  missing = 0,
  last_seen_at = excluded.last_seen_at,
  cover_url = COALESCE(excluded.cover_url, tracks.cover_url)
";

pub fn scan_folder_into_db(
    state: &DbState,
    root: &Path,
    progress: Option<&mut dyn FnMut(usize, usize)>,
) -> Result<usize, String> {
    scan_folder_into_db_with_covers(state, root, None, progress)
}

/// Scan one canonical folder into the DB with cover extraction.
pub fn scan_folder_into_db_with_covers(
    state: &DbState,
    root: &Path,
    covers_dir: Option<&Path>,
    mut progress: Option<&mut dyn FnMut(usize, usize)>,
) -> Result<usize, String> {
    let now = now_ms();
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    // Store display (non-verbatim) paths: `canonicalize()` yields `\\?\...`
    // on Windows, which breaks URL round-trips if persisted raw.
    let root_text = strip_verbatim(&root.to_string_lossy());
    conn.execute(
        "INSERT OR IGNORE INTO folders (folder_path, date_added) VALUES (?1, ?2)",
        params![root_text, now],
    )
    .map_err(|e| e.to_string())?;
    let folder_id: i64 = conn
        .query_row(
            "SELECT id FROM folders WHERE folder_path = ?1",
            params![root_text],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let (files, _skipped) = walk_folder(root);
    let total = files.len();
    if let Some(cb) = progress.as_mut() {
        cb(0, total);
    }
    let mut upserted = 0usize;
    let mut done = 0usize;
    for batch in files.chunks(BATCH_SIZE) {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for file in batch {
            done += 1;
            if let Some(cb) = progress.as_mut() {
                cb(done, total);
            }
            let track = match read_metadata_with_covers(file, covers_dir) {
                Ok(t) => t,
                Err(_) => continue, // vanished mid-scan: skip
            };
            // Persist the display form (see root_text): verbatim prefixes
            // must never reach the DB, or URL round-trips break.
            let db_path = strip_verbatim(&track.path);
            // Fast path: unchanged file already catalogued with cover → touch last_seen only.
            let (existing_mtime, existing_cover): (Option<i64>, Option<String>) = tx
                .query_row(
                    "SELECT mtime_ms, cover_url FROM tracks WHERE file_path = ?1",
                    params![db_path],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap_or((None, None));
            let unchanged = existing_mtime == track.mtime_ms
                && (existing_cover.is_some() || track.cover_url.is_none());
            if unchanged {
                tx.execute(
                    "UPDATE tracks SET last_seen_at = ?1, missing = 0 WHERE file_path = ?2",
                    params![now, db_path],
                )
                .map_err(|e| e.to_string())?;
                continue;
            }
            tx.execute(
                UPSERT_SQL,
                params![
                    db_path,
                    folder_id,
                    track.title,
                    track.artist,
                    track.album,
                    track.year,
                    track.duration_secs,
                    track.file_size,
                    track.mtime_ms,
                    now,
                    track.cover_url
                ],
            )
            .map_err(|e| e.to_string())?;
            upserted += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    conn.execute(
        "UPDATE tracks SET missing = 1 WHERE folder_id = ?1 AND last_seen_at < ?2 AND missing = 0",
        params![folder_id, now],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE folders SET last_scanned_at = ?1 WHERE id = ?2",
        params![now, folder_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(upserted)
}

/// Index explicitly user-selected files (native "Add Files" picker) into the DB.
/// No recursion and no missing-sweep: each path is validated (`..` rejected,
/// canonicalized, must exist and pass `is_supported`) and upserted under its own
/// parent folder row so a later folder scan dedupes by `file_path`.
/// Returns the count of newly indexed tracks — already-catalogued files refresh
/// their metadata but are not counted again.
pub fn import_files_into_db(
    state: &DbState,
    files: &[PathBuf],
    covers_dir: Option<&Path>,
) -> Result<usize, String> {
    let now = now_ms();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut folder_ids: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut imported = 0usize;

    for raw in files {
        // IPC-side guard: no parent traversal ever reaches the filesystem.
        if raw.to_string_lossy().contains("..") {
            continue;
        }
        let canonical = match raw.canonicalize() {
            Ok(p) => p,
            Err(_) => continue, // vanished or malformed: skip, never crash
        };
        if !canonical.is_file() || !is_supported(&canonical) {
            continue;
        }

        let parent_text = strip_verbatim(
            canonical
                .parent()
                .unwrap_or_else(|| Path::new(""))
                .to_string_lossy()
                .as_ref(),
        );
        let folder_id = match folder_ids.get(&parent_text) {
            Some(id) => *id,
            None => {
                conn.execute(
                    "INSERT OR IGNORE INTO folders (folder_path, date_added) VALUES (?1, ?2)",
                    params![parent_text, now],
                )
                .map_err(|e| e.to_string())?;
                let id: i64 = conn
                    .query_row(
                        "SELECT id FROM folders WHERE folder_path = ?1",
                        params![parent_text],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                folder_ids.insert(parent_text.clone(), id);
                id
            }
        };

        let track = match read_metadata_with_covers(&canonical, covers_dir) {
            Ok(t) => t,
            Err(_) => continue,
        };
        // Persist the display form: `canonicalize()` yields `\\?\...` on Windows.
        let db_path = strip_verbatim(&track.path);
        let exists = conn
            .query_row(
                "SELECT 1 FROM tracks WHERE file_path = ?1",
                params![db_path],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        conn.execute(
            UPSERT_SQL,
            params![
                db_path,
                folder_id,
                track.title,
                track.artist,
                track.album,
                track.year,
                track.duration_secs,
                track.file_size,
                track.mtime_ms,
                now,
                track.cover_url
            ],
        )
        .map_err(|e| e.to_string())?;
        if !exists {
            imported += 1;
        }
    }
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("nocturne-test-{}-{}-{}", name, std::process::id(), nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fixture_music_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("data")
            .join("fixtures")
            .join("music")
    }

    #[test]
    fn fallback_splits_artist_title() {
        let (title, artist) = fallback_from_filename(Path::new("C:\\Music\\Aurora - Night Drive.mp3"));
        assert_eq!(title, "Night Drive");
        assert_eq!(artist, "Aurora");
    }

    #[test]
    fn fallback_bare_filename() {
        let (title, artist) = fallback_from_filename(Path::new("C:\\Music\\lonelytrack.mp3"));
        assert_eq!(title, "lonelytrack");
        assert_eq!(artist, "Unknown Artist");
    }

    #[test]
    fn walk_counts_supported_and_skips_flac() {
        let dir = unique_dir("walk");
        fs::write(dir.join("a.mp3"), b"x").unwrap();
        fs::write(dir.join("b.wav"), b"x").unwrap();
        fs::write(dir.join("c.flac"), b"x").unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        let (files, skipped) = walk_folder(&dir);
        assert_eq!(files.len(), 2);
        assert_eq!(skipped, 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_metadata_reads_id3_fixture() {
        let tagged = fixture_music_dir().join("tagged.mp3");
        if !tagged.exists() {
            return; // fixtures are dev-only scratch; never fail CI without them
        }
        let track = read_metadata(&tagged).unwrap();
        assert_eq!(track.title, "Nocturne Test Title");
        assert_eq!(track.artist, "Nocturne Test Artist");
        assert_eq!(track.album, "Nocturne Test Album");
        assert_eq!(track.year, Some(2024));
    }

    #[test]
    fn read_metadata_falls_back_on_garbage() {
        let dir = unique_dir("meta");
        let garbage = dir.join("Mystery - Static.mp3");
        fs::write(&garbage, b"definitely not audio").unwrap();
        let track = read_metadata(&garbage).unwrap();
        assert_eq!(track.title, "Static");
        assert_eq!(track.artist, "Mystery");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_end_to_end_with_missing_sweep() {
        let src = fixture_music_dir();
        if !src.join("tagged.mp3").exists() {
            return;
        }
        // Copy fixtures to a temp dir so the missing-sweep test never mutates shared files.
        let dir = unique_dir("scan");
        for entry in fs::read_dir(&src).unwrap().flatten() {
            let dst = dir.join(entry.file_name());
            fs::copy(entry.path(), dst).unwrap();
        }
        let db_path = dir.join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        crate::db::init_conn(&conn).unwrap();
        let state = DbState(Mutex::new(conn));

        let n1 = scan_folder_into_db(&state, &dir, None).unwrap();
        assert!(n1 >= 3, "expected >=3 tracks, got {n1}");

        let count: i64 = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM tracks WHERE missing = 0", [], |r| r.get(0))
            .unwrap();
        assert!(count >= 3);

        let tagged_title: String = state
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT title FROM tracks WHERE file_path LIKE '%tagged.mp3'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tagged_title, "Nocturne Test Title");

        let n2 = scan_folder_into_db(&state, &dir, None).unwrap();
        assert_eq!(n2, 0, "incremental rescan must upsert nothing");

        fs::remove_file(dir.join("lonelytrack.mp3")).unwrap();
        scan_folder_into_db(&state, &dir, None).unwrap();
        let missing: i64 = state
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT missing FROM tracks WHERE file_path LIKE '%lonelytrack.mp3'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(missing, 1);

        drop(state);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_runs_on_background_blocking_thread() {        // Mirrors the command path: the scan body must be Send + 'static so it
        // can move onto a worker thread instead of the Tauri main thread.
        let src = fixture_music_dir();
        if !src.join("tagged.mp3").exists() {
            return;
        }
        let dir = unique_dir("bg");
        for entry in fs::read_dir(&src).unwrap().flatten() {
            fs::copy(entry.path(), dir.join(entry.file_name())).unwrap();
        }
        let db_path = dir.join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        crate::db::init_conn(&conn).unwrap();
        let state = DbState(Mutex::new(conn));
        let work = dir.clone();
        let count = tauri::async_runtime::block_on(async {
            tauri::async_runtime::spawn_blocking(move || scan_folder_into_db(&state, &work, None))
                .await
                .expect("worker panicked")
        })
        .expect("scan failed");
        assert!(count >= 3, "expected >=3 tracks, got {count}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_reports_monotonic_progress_to_total() {
        let src = fixture_music_dir();
        if !src.join("tagged.mp3").exists() {
            return;
        }
        let dir = unique_dir("progress");
        for entry in fs::read_dir(&src).unwrap().flatten() {
            fs::copy(entry.path(), dir.join(entry.file_name())).unwrap();
        }
        let conn = Connection::open(dir.join("test.db")).unwrap();
        crate::db::init_conn(&conn).unwrap();
        let state = DbState(Mutex::new(conn));
        let mut events: Vec<(usize, usize)> = Vec::new();
        let n = scan_folder_into_db(&state, &dir, Some(&mut |done, total| events.push((done, total)))).unwrap();
        assert!(n >= 3);
        assert!(!events.is_empty(), "progress must fire");
        let total = events.iter().map(|(_, t)| *t).max().unwrap();
        assert_eq!(*events.last().unwrap(), (total, total), "progress must end at total/total");
        for pair in events.windows(2) {
            assert!(pair[1].0 >= pair[0].0, "progress must be monotonic");
        }
        drop(state);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Real-world probe: point NOCTURNE_PROBE_DIR at any music folder to time
    /// the exact production scan path (walk + lofty + SQLite) headlessly.
    /// Skipped when the env var is unset. Never writes outside a temp DB.
    #[test]
    fn scan_probe_dir_if_provided() {
        use std::time::Instant;
        let dir = match std::env::var("NOCTURNE_PROBE_DIR") {
            Ok(d) => PathBuf::from(d),
            Err(_) => return,
        };
        if !dir.is_dir() {
            return;
        }
        let (files, skipped) = walk_folder(&dir);
        eprintln!("PROBE walk: {} files, {} skipped", files.len(), skipped);
        let mut slow: Vec<(u128, PathBuf)> = Vec::new();
        let t_all = Instant::now();
        for file in &files {
            let t = Instant::now();
            let r = read_metadata(file);
            let ms = t.elapsed().as_millis();
            if ms > 1000 {
                slow.push((ms, file.clone()));
            }
            if r.is_err() {
                eprintln!("PROBE unreadable: {}", file.display());
            }
        }
        eprintln!("PROBE metadata pass: {:?} total", t_all.elapsed());
        for (ms, file) in slow.iter().take(10) {
            eprintln!("PROBE slow file: {ms}ms {}", file.display());
        }
        let work = unique_dir("probe-db");
        let conn = Connection::open(work.join("probe.db")).unwrap();
        crate::db::init_conn(&conn).unwrap();
        let state = DbState(Mutex::new(conn));
        let t_db = Instant::now();
        let n = scan_folder_into_db(&state, &dir, None).unwrap();
        eprintln!("PROBE db scan: {n} upserted in {:?}", t_db.elapsed());
        drop(state);
        fs::remove_dir_all(&work).unwrap();
    }

    #[test]
    fn test_detect_image_extension_and_hash() {
        let jpeg_data = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        assert_eq!(detect_image_extension(&jpeg_data), "jpg");

        let png_data = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(detect_image_extension(&png_data), "png");

        let webp_data = b"RIFF....WEBPVP8 ";
        assert_eq!(detect_image_extension(webp_data), "webp");

        let h1 = hash_bytes(&jpeg_data);
        let h2 = hash_bytes(&jpeg_data);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 16);
    }

    #[test]
    fn import_files_indexes_supported_and_skips_the_rest() {
        let dir = unique_dir("import");
        let good = dir.join("Mystery - Static.mp3");
        fs::write(&good, b"definitely not audio").unwrap();
        fs::write(dir.join("skip.flac"), b"x").unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_conn(&conn).unwrap();
        let state = DbState(Mutex::new(conn));

        let picked = vec![
            good.clone(),
            dir.join("skip.flac"),
            dir.join("notes.txt"),
            dir.join("..").join("escape.mp3"), // `..` guard rejects before fs access
            dir.join("ghost.mp3"),             // never written: canonicalize fails
        ];
        let n = import_files_into_db(&state, &picked, None).unwrap();
        assert_eq!(n, 1, "only the supported, existing file is indexed");

        let rows: i64 = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
        let title: String = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT title FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Static");
        let folder_path: String = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT folder_path FROM folders", [], |r| r.get(0))
            .unwrap();
        let expected_folder = strip_verbatim(&dir.canonicalize().unwrap().to_string_lossy());
        assert_eq!(folder_path, expected_folder, "parent folder must be registered");

        // Re-importing the same file refreshes metadata but is not "new".
        let n2 = import_files_into_db(&state, std::slice::from_ref(&good), None).unwrap();
        assert_eq!(n2, 0);

        drop(state);
        fs::remove_dir_all(&dir).unwrap();
    }
}
