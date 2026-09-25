#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod scanner;

use commands::{
    clear_library, delete_cached_lyrics, delete_track, get_listening_stats, get_lyric_offset,
    get_lyrics, get_tracks, import_audio_files, open_music_folder, pick_audio_files, pick_folder,
    record_play, save_cached_lyrics, scan_folder, set_lyric_offset,
};
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
            set_lyric_offset
        ])
        .run(tauri::generate_context!())
        .expect("error while running nocturne");
}
