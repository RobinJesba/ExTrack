use crate::db::{DbState, TrackRecord};
use crate::processor::spawn_processing;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct YoutubeImportPayload {
    pub url: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub model: Option<String>,
    pub device: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YoutubeInfoResponse {
    pub success: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub thumbnail: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub success: bool,
    pub track_id: Option<String>,
    pub error: Option<String>,
}

pub fn get_ytdlp_bin() -> String {
    if let Ok(bin) = std::env::var("EXTRACK_YTDLP") {
        if Path::new(&bin).exists() {
            return bin;
        }
    }
    let candidates = [
        "/opt/homebrew/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
    ];
    for cand in candidates {
        if Path::new(cand).exists() {
            return cand.to_string();
        }
    }
    "yt-dlp".to_string()
}

#[tauri::command]
pub async fn get_youtube_info(url: String) -> Result<YoutubeInfoResponse, String> {
    let res = tauri::async_runtime::spawn_blocking(move || {
        let trimmed = url.trim();
        if !trimmed.contains("youtube.com") && !trimmed.contains("youtu.be") {
            return Ok(YoutubeInfoResponse {
                success: false,
                title: None,
                artist: None,
                thumbnail: None,
                error: Some("Invalid YouTube URL".to_string()),
            });
        }

        let ytdlp = get_ytdlp_bin();
        let output = Command::new(&ytdlp)
            .args(["--dump-single-json", "--no-playlist", "--flat-playlist", trimmed])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    let title = json.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let artist = json
                        .get("artist")
                        .or_else(|| json.get("uploader"))
                        .or_else(|| json.get("channel"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let thumbnail = json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string());

                    return Ok(YoutubeInfoResponse {
                        success: true,
                        title,
                        artist,
                        thumbnail,
                        error: None,
                    });
                }
                Ok(YoutubeInfoResponse {
                    success: false,
                    title: None,
                    artist: None,
                    thumbnail: None,
                    error: Some("Failed to parse YouTube metadata".to_string()),
                })
            }
            Ok(out) => {
                let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
                Ok(YoutubeInfoResponse {
                    success: false,
                    title: None,
                    artist: None,
                    thumbnail: None,
                    error: Some(err_msg),
                })
            }
            Err(e) => Ok(YoutubeInfoResponse {
                success: false,
                title: None,
                artist: None,
                thumbnail: None,
                error: Some(format!("yt-dlp error (invoking '{}'): {}", ytdlp, e)),
            }),
        }
    })
    .await;

    match res {
        Ok(inner) => inner,
        Err(e) => Err(format!("Task execution failed: {}", e)),
    }
}

pub fn get_ffmpeg_dir() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
    ];
    for dir in candidates {
        if Path::new(dir).join("ffmpeg").exists() {
            return Some(dir.to_string());
        }
    }
    None
}

#[tauri::command]
pub fn import_youtube_track(
    app: AppHandle,
    state: State<'_, DbState>,
    payload: YoutubeImportPayload,
) -> Result<IngestResult, String> {
    let track_id = Uuid::new_v4().to_string();
    let uploads_dir = state.base_dir.join("uploads");
    fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;

    let title = payload.title.unwrap_or_else(|| "YouTube Track".to_string());
    let artist = payload.artist;
    let mode = payload.mode.unwrap_or_else(|| "fast".to_string());
    let model = payload.model.unwrap_or_else(|| "BS-Roformer-SW".to_string());
    let device = payload.device.unwrap_or_else(|| "auto".to_string());
    let url = payload.url.trim().to_string();

    let dest_filename = format!("{}.wav", track_id);
    let dest_path = uploads_dir.join(&dest_filename);

    let track_rec = TrackRecord {
        id: track_id.clone(),
        title,
        artist,
        filename: dest_filename,
        file_path: dest_path.to_string_lossy().to_string(),
        duration: 0.0,
        bpm: 120.0,
        sample_rate: 44100,
        status: "PROCESSING".to_string(),
        progress: 5,
        status_message: "Downloading YouTube audio stream...".to_string(),
        progress_meta: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.insert_track(&track_rec)?;

    let app_handle = app.clone();
    let track_id_bg = track_id.clone();
    let ytdlp = get_ytdlp_bin();
    let ffmpeg_dir = get_ffmpeg_dir();

    // Spawn download and subsequent AI stem processing in background thread
    std::thread::spawn(move || {
        let event_name = format!("track-progress:{}", track_id_bg);
        let _ = app_handle.emit(
            &event_name,
            &serde_json::json!({
                "status": "PROCESSING",
                "progress": 8,
                "status_message": "Downloading YouTube audio stream...",
                "message": "Downloading YouTube audio stream..."
            }),
        );

        let output_template = uploads_dir.join(format!("{}.%(ext)s", track_id_bg));
        let mut cmd = Command::new(&ytdlp);
        cmd.arg("-x")
            .arg("--audio-format")
            .arg("wav")
            .arg("--no-playlist")
            .arg("-o")
            .arg(output_template.to_str().unwrap_or(""));

        if let Some(ff) = ffmpeg_dir {
            cmd.arg("--ffmpeg-location").arg(ff);
        }
        cmd.arg(&url);

        let out = cmd.output();
        let db = app_handle.state::<DbState>();

        match out {
            Ok(output) if output.status.success() => {
                let mut input_path = uploads_dir.join(format!("{}.wav", track_id_bg));
                if !input_path.exists() {
                    if let Ok(entries) = fs::read_dir(&uploads_dir) {
                        for entry in entries.flatten() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.starts_with(&track_id_bg)
                                && !name.ends_with(".part")
                                && !name.ends_with(".ytdl")
                            {
                                input_path = entry.path();
                                break;
                            }
                        }
                    }
                }

                if !input_path.exists() {
                    let _ = db.update_track_progress(
                        &track_id_bg,
                        0,
                        "Downloaded audio file not found on disk",
                        "FAILED",
                        "",
                    );
                    let _ = app_handle.emit(
                        &event_name,
                        &serde_json::json!({
                            "status": "FAILED",
                            "progress": 0,
                            "status_message": "Downloaded audio file not found on disk"
                        }),
                    );
                    return;
                }

                let _ = db.update_track_progress(
                    &track_id_bg,
                    12,
                    "Download complete. Initializing neural stem separation...",
                    "PROCESSING",
                    "",
                );
                let _ = app_handle.emit(
                    &event_name,
                    &serde_json::json!({
                        "status": "PROCESSING",
                        "progress": 12,
                        "status_message": "Download complete. Initializing neural stem separation...",
                        "message": "Download complete. Initializing neural stem separation..."
                    }),
                );

                if let Err(e) = spawn_processing(
                    app_handle.clone(),
                    track_id_bg.clone(),
                    input_path.to_string_lossy().to_string(),
                    model,
                    device,
                    mode,
                ) {
                    let _ = db.update_track_progress(
                        &track_id_bg,
                        0,
                        &format!("AI separation failed: {}", e),
                        "FAILED",
                        "",
                    );
                    let _ = app_handle.emit(
                        &event_name,
                        &serde_json::json!({
                            "status": "FAILED",
                            "progress": 0,
                            "status_message": format!("AI separation failed: {}", e)
                        }),
                    );
                }
            }
            Ok(output) => {
                let err_str = String::from_utf8_lossy(&output.stderr).to_string();
                let msg = format!("yt-dlp download failed: {}", err_str);
                let _ = db.update_track_progress(&track_id_bg, 0, &msg, "FAILED", "");
                let _ = app_handle.emit(
                    &event_name,
                    &serde_json::json!({
                        "status": "FAILED",
                        "progress": 0,
                        "status_message": msg
                    }),
                );
            }
            Err(e) => {
                let msg = format!("Failed to run yt-dlp: {}", e);
                let _ = db.update_track_progress(&track_id_bg, 0, &msg, "FAILED", "");
                let _ = app_handle.emit(
                    &event_name,
                    &serde_json::json!({
                        "status": "FAILED",
                        "progress": 0,
                        "status_message": msg
                    }),
                );
            }
        }
    });

    Ok(IngestResult {
        success: true,
        track_id: Some(track_id),
        error: None,
    })
}

#[tauri::command]
pub fn import_local_file(
    app: AppHandle,
    state: State<'_, DbState>,
    file_path: String,
    title: Option<String>,
    artist: Option<String>,
    mode: Option<String>,
) -> Result<IngestResult, String> {
    let source_path = Path::new(&file_path);
    if !source_path.exists() {
        return Ok(IngestResult {
            success: false,
            track_id: None,
            error: Some("Selected file does not exist".to_string()),
        });
    }

    let track_id = Uuid::new_v4().to_string();
    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav");

    let uploads_dir = state.base_dir.join("uploads");
    fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;

    let dest_filename = format!("{}.{}", track_id, ext);
    let dest_path = uploads_dir.join(&dest_filename);

    fs::copy(source_path, &dest_path).map_err(|e| format!("Failed to copy audio file: {}", e))?;

    let default_title = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Track")
        .to_string();

    let title = title.unwrap_or(default_title);
    let mode = mode.unwrap_or_else(|| "fast".to_string());

    let track_rec = TrackRecord {
        id: track_id.clone(),
        title,
        artist,
        filename: dest_filename,
        file_path: dest_path.to_string_lossy().to_string(),
        duration: 0.0,
        bpm: 120.0,
        sample_rate: 44100,
        status: "PROCESSING".to_string(),
        progress: 10,
        status_message: "Initializing stem separation...".to_string(),
        progress_meta: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.insert_track(&track_rec)?;

    // Spawn AI processing
    spawn_processing(
        app,
        track_id.clone(),
        dest_path.to_string_lossy().to_string(),
        "BS-Roformer-SW".to_string(),
        "auto".to_string(),
        mode,
    )?;

    Ok(IngestResult {
        success: true,
        track_id: Some(track_id),
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ingest_result_serialization() {
        let res = IngestResult {
            success: true,
            track_id: Some("1234".to_string()),
            error: None,
        };
        let json_str = serde_json::to_string(&res).unwrap();
        println!("Serialized: {}", json_str);
        assert!(json_str.contains("\"trackId\":\"1234\""));
    }

    #[test]
    fn test_youtube_info() {
        let res = tauri::async_runtime::block_on(get_youtube_info("https://www.youtube.com/watch?v=Oa_RSwwpPaA".to_string())).unwrap();
        println!("YouTube info result: {:?}", res);
        assert!(res.success, "Failed: {:?}", res.error);
        assert!(res.title.is_some(), "Title is None");
    }

    #[test]
    #[ignore = "requires unrestricted live network access to YouTube"]
    fn test_youtube_download() {
        let ytdlp = get_ytdlp_bin();
        let tmp_dir = std::env::temp_dir().join("extrack_test_ytdl");
        let _ = fs::create_dir_all(&tmp_dir);
        let out_template = tmp_dir.join("test_song.%(ext)s");

        let mut cmd = Command::new(&ytdlp);
        cmd.args([
            "-x",
            "--audio-format",
            "wav",
            "--no-playlist",
            "--download-sections",
            "*00:00-00:03",
            "-o",
            out_template.to_str().unwrap(),
        ]);
        if let Some(ffmpeg_dir) = get_ffmpeg_dir() {
            cmd.arg("--ffmpeg-location").arg(ffmpeg_dir);
        }
        cmd.arg("https://www.youtube.com/watch?v=Oa_RSwwpPaA");

        let output = cmd.output().expect("Failed to execute yt-dlp command");
        println!("Status: {:?}", output.status);
        println!("Stderr: {}", String::from_utf8_lossy(&output.stderr));
        assert!(output.status.success(), "yt-dlp download failed");
        let wav = tmp_dir.join("test_song.wav");
        assert!(wav.exists(), "test_song.wav was not created");
        let _ = fs::remove_dir_all(&tmp_dir);
    }
}
