#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod scanner;

use commands::{
    clear_library, clear_listening_history, clear_queue_checkpoint, deduplicate_library,
    delete_cached_lyrics, delete_named_session, delete_track, get_listening_history,
    get_listening_stats, get_lyric_offset, get_lyrics, get_named_session, get_queue_checkpoint,
    get_track_play_count, get_tracks, import_audio_files, ingest_paths, list_saved_sessions,
    mark_checkpoint_clean_exit, open_music_folder, pick_audio_files, pick_folder,
    record_listening_history, record_play, reveal_in_explorer, save_cached_lyrics,
    save_named_session, save_queue_checkpoint, scan_folder, set_lyric_offset,
};
use db::{open_db, DbState};
use std::sync::Mutex;
use tauri::Manager;

/// Standard macOS application menu.
///
/// macOS supplies the system key equivalents (Quit, Close Window, the whole Edit
/// clipboard block, Minimize) through the app's main menu. Without one, none of
/// them exist — no ⌘Q, no ⌘W, and no ⌘V to paste into the library search field.
///
/// Compiled only on macOS: the Windows build keeps the exact builder chain it
/// had before and still gets no menu bar at all.
#[cfg(target_os = "macos")]
fn macos_app_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, Menu, SubmenuBuilder};

    // App menu — About / Close (⌘W) / Services / Hide / Quit (⌘Q).
    let app_menu = SubmenuBuilder::new(app, "Nocturne")
        .about(Some(AboutMetadata {
            name: Some("Nocturne".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            ..Default::default()
        }))
        .separator()
        .close_window()
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // Edit — the Undo/Redo pair plus the clipboard block (⌘C / ⌘V / ⌘A).
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Window — Minimize (⌘M) and the macOS "Bring All to Front" convention.
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .bring_all_to_front()
        .build()?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}

/// Graceful shutdown: flush SQLite, then terminate the process.
///
/// ── THIS FUNCTION IS THE SINGLE CLOSE/QUIT SEAM ──
/// Every exit path funnels through here: the custom titlebar X, Alt+F4, the
/// taskbar context menu, and (macOS) the Window ▸ Close Window (⌘W) menu item,
/// all via the `on_window_event` hook in `main`. If a Tray icon or a
/// "minimize to tray" behaviour is ever adopted, "close hides instead of quits"
/// is a change to THIS function body only — the hook, the ACL, and the frontend
/// close handler all stay as they are. No rework required.
///
/// WHY THIS EXISTS — the app can own a SECOND window: `mini-island`. It is not
/// declared in tauri.conf.json any more; the frontend creates it on demand when
/// `main` is minimized and DESTROYS it on restore, so for most of a session
/// `main` is the only window. Whenever a `mini-island` does exist it is
/// always-on-top and focusable, so closing `main` can leave the event loop
/// running against the mini alone (the Tauri event loop only ends when the LAST
/// window is closed). Before the on-demand lifecycle this was permanent and
/// reproducible: the process stayed resident (measured: still there 15s after
/// close, ~29MB / 16 threads), and relaunching did nothing visible because
/// `tauri-plugin-single-instance` handed the new launch to the orphan.
///
/// `AppHandle::exit(0)` (not `std::process::exit(0)`) is deliberate: it runs
/// Tauri's normal shutdown path and event cleanup. `process::exit` would skip
/// destructors, including the `rusqlite::Connection` drop, leaving a WAL to
/// recover on next launch.
fn graceful_shutdown(app: &tauri::AppHandle) {
    // Best-effort WAL checkpoint so the next launch starts from a truncated WAL
    // instead of replaying it.
    //
    // `try_lock` is load-bearing, not defensive: `scan_folder_into_db_full`
    // holds this same Mutex for the whole recursive walk
    // (scanner.rs::scan_folder_into_db_full), so a blocking `lock()` here would
    // hang the process forever whenever the user quit mid-scan — trading a leak
    // bug for a worse hang bug. If a scan is in flight we skip the checkpoint
    // and exit anyway; SQLite recovers an uncheckpointed WAL on next open, so
    // exiting without it is still correct and never corrupts the database.
    if let Some(state) = app.try_state::<DbState>() {
        if let Ok(conn) = state.0.try_lock() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }
    app.exit(0);
}

fn main() {
    let builder = tauri::Builder::default()
        // A second launch must SURFACE the already-running app, not silently do
        // nothing. This is the safety net for any future orphan process (a crash,
        // a force-kill, a WMI kill): the user double-clicks the icon and the
        // app comes back, instead of the launch appearing to do nothing at all.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                // Best-effort, in the order a user expects: restore a minimized
                // window first, then unhide, then take focus. Each call is
                // independent — one failing must not skip the next.
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState(Mutex::new(rusqlite::Connection::open_in_memory().expect("mem db"))))
        // A closed main window means the user is done with the app, so shut the
        // whole process down rather than leaving the on-demand mini-island
        // running. Scoped to `main`: the mini-island is an implementation detail
        // of the main window's life and must never own the app lifecycle — it
        // is created on minimize and destroyed on restore, and Rust only needs
        // to guarantee it cannot outlive the main window on its own.
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // `close()` is intentional on the frontend, not `destroy()`:
                // destroy() force-tears the window down and would skip this
                // CloseRequested entirely, defeating the graceful path.
                tauri::WindowEvent::CloseRequested { .. }
                // Safety net for a close that somehow skipped CloseRequested;
                // without it, a destroyed `main` would still orphan the process.
                | tauri::WindowEvent::Destroyed => graceful_shutdown(window.app_handle()),
                _ => {}
            }
        })
        .setup(|app| {
            let conn = open_db(&app.handle())?;
            let state = app.state::<DbState>();
            let mut guard = state.0.lock().map_err(|e| e.to_string())?;
            *guard = conn;
            Ok(())
        });

    // macOS only. On Windows this statement does not exist, so the builder chain
    // and the resulting window/menu behaviour are byte-identical to before.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(macos_app_menu);

    builder
        .invoke_handler(tauri::generate_handler![
            open_music_folder,
            pick_folder,
            pick_audio_files,
            import_audio_files,
            ingest_paths,
            scan_folder,
            get_tracks,
            delete_track,
            clear_library,
            deduplicate_library,
            get_lyrics,
            save_cached_lyrics,
            delete_cached_lyrics,
            record_play,
            get_listening_stats,
            record_listening_history,
            get_listening_history,
            clear_listening_history,
            get_track_play_count,
            save_queue_checkpoint,
            mark_checkpoint_clean_exit,
            get_queue_checkpoint,
            clear_queue_checkpoint,
            save_named_session,
            list_saved_sessions,
            delete_named_session,
            get_named_session,
            get_lyric_offset,
            set_lyric_offset,
            reveal_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running nocturne");
}
