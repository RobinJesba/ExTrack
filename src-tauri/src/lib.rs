mod db;
mod ingest;
mod processor;

use db::{delete_track, get_track_details, get_tracks, read_audio_file, DbState};
use ingest::{get_youtube_info, import_local_file, import_youtube_track};
use processor::{cancel_track_process, ProcessState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let home = std::env::var("HOME").unwrap_or_default();
        let extra_paths = format!(
            "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}/.cargo/bin:{}/.local/bin",
            home, home
        );
        let new_path = if current_path.is_empty() {
            extra_paths
        } else {
            format!("{}:{}", extra_paths, current_path)
        };
        unsafe {
            std::env::set_var("PATH", new_path);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app.path().app_data_dir().expect("failed to resolve app_data_dir");
            let db_state = DbState::new(&app_data_dir).expect("failed to initialize SQLite database");
            app.manage(db_state);
            app.manage(ProcessState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tracks,
            get_track_details,
            delete_track,
            get_youtube_info,
            import_youtube_track,
            import_local_file,
            cancel_track_process,
            read_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
