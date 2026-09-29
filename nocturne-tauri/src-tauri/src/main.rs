#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod scanner;

use commands::{
    clear_library, delete_cached_lyrics, delete_track, get_listening_stats, get_lyric_offset,
    get_lyrics, get_tracks, import_audio_files, open_music_folder, pick_audio_files, pick_folder,
    record_play, reveal_in_explorer, save_cached_lyrics, scan_folder, set_lyric_offset,
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

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState(Mutex::new(rusqlite::Connection::open_in_memory().expect("mem db"))))
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
            scan_folder,
            get_tracks,
            delete_track,
            clear_library,
            get_lyrics,
            save_cached_lyrics,
            delete_cached_lyrics,
            record_play,
            get_listening_stats,
            get_lyric_offset,
            set_lyric_offset,
            reveal_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running nocturne");
}
