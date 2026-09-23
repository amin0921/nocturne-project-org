#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod scanner;

use commands::{clear_library, delete_track, get_lyrics, get_tracks, open_music_folder, pick_folder, save_cached_lyrics, scan_folder};
use db::{open_db, DbState};
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState(Mutex::new(rusqlite::Connection::open_in_memory().expect("mem db"))))
        .setup(|app| {
            let conn = open_db(&app.handle())?;
            let state = app.state::<DbState>();
            let mut guard = state.0.lock().map_err(|e| e.to_string())?;
            *guard = conn;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_music_folder,
            pick_folder,
            scan_folder,
            get_tracks,
            delete_track,
            clear_library,
            get_lyrics,
            save_cached_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running nocturne");
}
