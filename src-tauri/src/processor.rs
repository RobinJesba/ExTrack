use crate::db::{BassNoteRecord, BeatRecord, ChordRecord, DbState, StemRecord};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct ProcessState {
    pub active_pids: Arc<Mutex<HashMap<String, u32>>>,
}

impl ProcessState {
    pub fn new() -> Self {
        Self {
            active_pids: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub fn get_python_executable(app: &AppHandle) -> String {
    if let Ok(bin) = std::env::var("EXTRACK_PYTHON") {
        let p = PathBuf::from(&bin);
        if p.exists() {
            return bin;
        }
    }

    let candidates = [
        PathBuf::from("/Users/robin/Documents/Code/playground/ExTrack/backend/.venv/bin/python"),
        PathBuf::from("backend").join(".venv").join("bin").join("python"),
        PathBuf::from("/opt/homebrew/opt/python@3.11/bin/python3.11"),
        PathBuf::from("/opt/homebrew/bin/python3.11"),
    ];
    for cand in candidates {
        if cand.exists() {
            return cand.to_string_lossy().to_string();
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        let res_candidates = [
            res_dir.join("backend").join(".venv").join("bin").join("python"),
            res_dir.join(".venv").join("bin").join("python"),
        ];
        for cand in res_candidates {
            if cand.exists() {
                return cand.to_string_lossy().to_string();
            }
        }
    }

    if cfg!(windows) {
        "python".to_string()
    } else {
        "python3".to_string()
    }
}

pub fn get_script_path(app: &AppHandle) -> PathBuf {
    if let Ok(script) = std::env::var("EXTRACK_SCRIPT") {
        let p = PathBuf::from(script);
        if p.exists() {
            return p;
        }
    }

    let candidates = [
        PathBuf::from("/Users/robin/Documents/Code/playground/ExTrack/backend/process_track.py"),
        PathBuf::from("backend").join("process_track.py"),
    ];
    for cand in candidates {
        if cand.exists() {
            return cand;
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        let res_candidates = [
            res_dir.join("process_track.py"),
            res_dir.join("backend").join("process_track.py"),
            res_dir.join("_up_").join("backend").join("process_track.py"),
        ];
        for cand in res_candidates {
            if cand.exists() {
                return cand;
            }
        }
    }

    PathBuf::from("backend").join("process_track.py")
}

pub enum SidecarRunner {
    Binary(PathBuf),
    Script { python: String, script: PathBuf },
}

pub fn resolve_sidecar_runner(app: &AppHandle) -> SidecarRunner {
    if let Ok(bin) = std::env::var("EXTRACK_SIDECAR_BIN") {
        let p = PathBuf::from(bin);
        if p.exists() {
            return SidecarRunner::Binary(p);
        }
    }

    // Use Python 3.11 with dedicated .venv running natively with Apple Silicon Metal (MPS) acceleration
    SidecarRunner::Script {
        python: get_python_executable(app),
        script: get_script_path(app),
    }
}

pub fn get_models_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("EXTRACK_MODELS_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return p;
        }
    }
    if let Ok(res_dir) = app.path().resource_dir() {
        let res_models = res_dir.join("models");
        if res_models.exists() {
            return res_models;
        }
        let res_up_models = res_dir.join("_up_").join("data").join("models");
        if res_up_models.exists() {
            return res_up_models;
        }
        let res_data_models = res_dir.join("data").join("models");
        if res_data_models.exists() {
            return res_data_models;
        }
    }
    let data_models = PathBuf::from("data").join("models");
    if data_models.exists() {
        return data_models;
    }
    PathBuf::from("backend").join("models")
}

pub fn spawn_processing(
    app: AppHandle,
    track_id: String,
    input_path: String,
    model_name: String,
    device: String,
    mode: String,
) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let proc_state = app.state::<ProcessState>();

    let output_dir = db_state.base_dir.join("stems").join(&track_id);
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create stems output directory: {}", e))?;

    let runner = resolve_sidecar_runner(&app);
    let models_dir = get_models_dir(&app);

    let mode_label = if mode == "fast" { "⚡ 2x Fast Mode" } else { "💎 Ultra Quality" };
    db_state.update_track_progress(
        &track_id,
        10,
        &format!("Initializing BS-RoFormer-SW ({})...", mode_label),
        "PROCESSING",
        "",
    )?;

    let mut cmd = match &runner {
        SidecarRunner::Binary(bin_path) => {
            let mut c = Command::new(bin_path);
            c.arg(&track_id)
                .arg(&input_path)
                .arg(&output_dir)
                .arg(&model_name)
                .arg(&device)
                .arg(&mode);
            c
        }
        SidecarRunner::Script { python, script } => {
            let mut c = Command::new(python);
            c.arg(script)
                .arg(&track_id)
                .arg(&input_path)
                .arg(&output_dir)
                .arg(&model_name)
                .arg(&device)
                .arg(&mode);
            c
        }
    };

    cmd.env("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        .env("EXTRACK_DEVICE", &device)
        .env("EXTRACK_MODE", &mode)
        .env("EXTRACK_MODELS_DIR", models_dir.to_string_lossy().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to launch audio separation engine: {}",
            e
        )
    })?;

    let pid = child.id();
    {
        let mut pids = proc_state.active_pids.lock().unwrap();
        pids.insert(track_id.clone(), pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to open stdout pipe")?;
    let stderr = child.stderr.take();
    let last_err_lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let last_err_clone = last_err_lines.clone();

    if let Some(err_pipe) = stderr {
        std::thread::spawn(move || {
            let r = BufReader::new(err_pipe);
            for l in r.lines().flatten() {
                eprintln!("[AI Engine Stderr] {}", l);
                let mut lines = last_err_clone.lock().unwrap();
                if lines.len() >= 20 {
                    lines.remove(0);
                }
                lines.push(l);
            }
        });
    }

    let app_handle = app.clone();
    let track_id_clone = track_id.clone();
    let active_pids_clone = proc_state.active_pids.clone();

    // Background thread to monitor stdout JSON streams
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut last_result: Option<Value> = None;

        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
                if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
                    if msg_type == "progress" {
                        let progress = json.get("progress").and_then(|v| v.as_i64()).unwrap_or(10);
                        let message = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
                        let meta_str = json.to_string();

                        let db = app_handle.state::<DbState>();
                        let _ = db.update_track_progress(&track_id_clone, progress, message, "PROCESSING", &meta_str);

                        let event_name = format!("track-progress:{}", track_id_clone);
                        let mut normalized_json = json.clone();
                        if let Some(obj) = normalized_json.as_object_mut() {
                            obj.insert("status".to_string(), Value::String("PROCESSING".to_string()));
                            obj.insert("status_message".to_string(), Value::String(message.to_string()));
                        }
                        let _ = app_handle.emit(&event_name, &normalized_json);
                    } else if msg_type == "result" {
                        last_result = Some(json.clone());
                    }
                }
            }
        }

        let _ = child.wait();
        {
            let mut pids = active_pids_clone.lock().unwrap();
            pids.remove(&track_id_clone);
        }

        // If result was emitted or written to result.json, commit to SQLite
        let result_json_file = output_dir.join("result.json");
        let final_result = last_result.or_else(|| {
            if result_json_file.exists() {
                fs::read_to_string(&result_json_file)
                    .ok()
                    .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            } else {
                None
            }
        });

        let db = app_handle.state::<DbState>();
        if let Some(res) = final_result {
            let duration = res.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let bpm = res.get("bpm").and_then(|v| v.as_f64()).unwrap_or(120.0);

            // Stems
            let mut stems = Vec::new();
            if let Some(stems_obj) = res.get("stems").and_then(|v| v.as_object()) {
                for (stem_type, _val) in stems_obj {
                    let wav_name = format!("{}.wav", stem_type);
                    let rel_stem_path = format!("stems/{}/{}", track_id_clone, wav_name);
                    stems.push(StemRecord {
                        id: format!("{}_{}", track_id_clone, stem_type),
                        track_id: track_id_clone.clone(),
                        stem_type: stem_type.clone(),
                        file_path: rel_stem_path,
                        format: "wav".to_string(),
                        peak_amplitude: 1.0,
                    });
                }
            }

            // Chords
            let mut chords = Vec::new();
            if let Some(chords_arr) = res.get("chords").and_then(|v| v.as_array()) {
                for (i, c) in chords_arr.iter().enumerate() {
                    chords.push(ChordRecord {
                        id: format!("{}_chord_{}", track_id_clone, i),
                        track_id: track_id_clone.clone(),
                        start_time: c.get("start_time").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        end_time: c.get("end_time").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        chord_name: c.get("chord_name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        detailed_chord: c.get("detailed_chord").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        root: c.get("root").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        quality: c.get("quality").and_then(|v| v.as_str()).unwrap_or("maj").to_string(),
                        measure_index: c.get("measure_index").and_then(|v| v.as_i64()).unwrap_or(1),
                    });
                }
            }

            // Beats
            let mut beats = Vec::new();
            if let Some(beats_arr) = res.get("beats").and_then(|v| v.as_array()) {
                for (i, b) in beats_arr.iter().enumerate() {
                    beats.push(BeatRecord {
                        id: format!("{}_beat_{}", track_id_clone, i),
                        track_id: track_id_clone.clone(),
                        timestamp: b.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        beat_number: b.get("beat_number").and_then(|v| v.as_i64()).unwrap_or(1),
                        is_downbeat: b.get("is_downbeat").and_then(|v| v.as_i64()).unwrap_or(0),
                    });
                }
            }

            // Bass notes
            let mut bass_notes = Vec::new();
            if let Some(bass_arr) = res.get("bass_notes").and_then(|v| v.as_array()) {
                for (i, bn) in bass_arr.iter().enumerate() {
                    bass_notes.push(BassNoteRecord {
                        id: format!("{}_bass_{}", track_id_clone, i),
                        track_id: track_id_clone.clone(),
                        start_time: bn.get("start_time").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        end_time: bn.get("end_time").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        midi_pitch: bn.get("midi_pitch").and_then(|v| v.as_i64()).unwrap_or(0),
                        note_name: bn.get("note_name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        frequency: bn.get("frequency").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        string_index: bn.get("string_index").and_then(|v| v.as_i64()).unwrap_or(1),
                        fret_number: bn.get("fret_number").and_then(|v| v.as_i64()).unwrap_or(0),
                        is_slide: bn.get("is_slide").and_then(|v| v.as_i64()),
                        slide_from_fret: bn.get("slide_from_fret").and_then(|v| v.as_i64()),
                        slide_direction: bn.get("slide_direction").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    });
                }
            }

            let _ = db.save_processing_result(&track_id_clone, duration, bpm, &stems, &chords, &beats, &bass_notes);

            // Emit final completion event
            let event_name = format!("track-progress:{}", track_id_clone);
            let complete_payload = serde_json::json!({
                "type": "progress",
                "status": "COMPLETED",
                "progress": 100,
                "status_message": "AI stem separation complete"
            });
            let _ = app_handle.emit(&event_name, &complete_payload);
        } else {
            let err_summary = {
                let lines = last_err_lines.lock().unwrap();
                if lines.is_empty() {
                    "AI stem separation failed to produce results".to_string()
                } else {
                    format!("Separation error: {}", lines.last().unwrap_or(&"".to_string()))
                }
            };
            let _ = db.update_track_progress(&track_id_clone, 0, &err_summary, "FAILED", "");
            let event_name = format!("track-progress:{}", track_id_clone);
            let fail_payload = serde_json::json!({
                "type": "progress",
                "status": "FAILED",
                "progress": 0,
                "status_message": err_summary
            });
            let _ = app_handle.emit(&event_name, &fail_payload);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_track_process(state: State<'_, ProcessState>, db: State<'_, DbState>, track_id: String) -> Result<bool, String> {
    let mut pids = state.active_pids.lock().map_err(|e| e.to_string())?;
    if let Some(pid) = pids.remove(&track_id) {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).spawn();
        }
        let _ = db.update_track_progress(&track_id, 0, "Cancelled by user", "FAILED", "");
        return Ok(true);
    }
    Ok(false)
}
