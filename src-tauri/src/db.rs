use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackRecord {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub filename: String,
    pub file_path: String,
    pub duration: f64,
    pub bpm: f64,
    pub sample_rate: i64,
    pub status: String,
    pub progress: i64,
    pub status_message: String,
    pub progress_meta: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StemRecord {
    pub id: String,
    pub track_id: String,
    pub stem_type: String,
    pub file_path: String,
    pub format: String,
    pub peak_amplitude: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChordRecord {
    pub id: String,
    pub track_id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub chord_name: String,
    pub detailed_chord: Option<String>,
    pub root: String,
    pub quality: String,
    pub measure_index: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BeatRecord {
    pub id: String,
    pub track_id: String,
    pub timestamp: f64,
    pub beat_number: i64,
    pub is_downbeat: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BassNoteRecord {
    pub id: String,
    pub track_id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub midi_pitch: i64,
    pub note_name: String,
    pub frequency: f64,
    pub string_index: i64,
    pub fret_number: i64,
    pub is_slide: Option<i64>,
    pub slide_from_fret: Option<i64>,
    pub slide_direction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackDetailResponse {
    pub track: TrackRecord,
    pub stems: Vec<StemRecord>,
    pub chords: Vec<ChordRecord>,
    pub beats: Vec<BeatRecord>,
    pub bass_notes: Vec<BassNoteRecord>,
}

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub base_dir: PathBuf,
}

impl DbState {
    pub fn new(app_data_dir: &Path) -> Result<Self, String> {
        let app_dir = app_data_dir.join("ExTrack");
        fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create AppData directory: {}", e))?;

        let db_path = app_dir.join("extrack.db");
        let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        // Configure WAL concurrency
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -64000;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| format!("Failed to configure SQLite pragmas: {}", e))?;

        // Initialize schema
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration REAL DEFAULT 0,
                bpm REAL DEFAULT 120,
                sample_rate INTEGER DEFAULT 44100,
                status TEXT DEFAULT 'PENDING',
                progress INTEGER DEFAULT 0,
                status_message TEXT DEFAULT '',
                progress_meta TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stems (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                stem_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                format TEXT DEFAULT 'wav',
                peak_amplitude REAL DEFAULT 1.0,
                FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chords (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                chord_name TEXT NOT NULL,
                detailed_chord TEXT DEFAULT '',
                root TEXT NOT NULL,
                quality TEXT NOT NULL,
                measure_index INTEGER DEFAULT 0,
                FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS beats (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                beat_number INTEGER NOT NULL,
                is_downbeat INTEGER DEFAULT 0,
                FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bass_notes (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                midi_pitch INTEGER NOT NULL,
                note_name TEXT NOT NULL,
                frequency REAL NOT NULL,
                string_index INTEGER NOT NULL,
                fret_number INTEGER NOT NULL,
                is_slide INTEGER DEFAULT 0,
                slide_from_fret INTEGER DEFAULT -1,
                slide_direction TEXT DEFAULT '',
                FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );",
        )
        .map_err(|e| format!("Failed to create database tables: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
            base_dir: app_dir,
        })
    }

    pub fn insert_track(&self, track: &TrackRecord) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO tracks (id, title, artist, filename, file_path, duration, bpm, sample_rate, status, progress, status_message, progress_meta)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                track.id,
                track.title,
                track.artist,
                track.filename,
                track.file_path,
                track.duration,
                track.bpm,
                track.sample_rate,
                track.status,
                track.progress,
                track.status_message,
                track.progress_meta
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_track_progress(
        &self,
        id: &str,
        progress: i64,
        status_message: &str,
        status: &str,
        progress_meta: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tracks SET progress = ?1, status_message = ?2, status = ?3, progress_meta = ?4 WHERE id = ?5",
            params![progress, status_message, status, progress_meta, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save_processing_result(
        &self,
        track_id: &str,
        duration: f64,
        bpm: f64,
        stems: &[StemRecord],
        chords: &[ChordRecord],
        beats: &[BeatRecord],
        bass_notes: &[BassNoteRecord],
    ) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // Update track metadata
        tx.execute(
            "UPDATE tracks SET duration = ?1, bpm = ?2, status = 'COMPLETED', progress = 100, status_message = 'AI stem separation complete' WHERE id = ?3",
            params![duration, bpm, track_id],
        )
        .map_err(|e| e.to_string())?;

        // Clear existing stems/chords/beats/bass_notes if any
        tx.execute("DELETE FROM stems WHERE track_id = ?1", params![track_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM chords WHERE track_id = ?1", params![track_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM beats WHERE track_id = ?1", params![track_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM bass_notes WHERE track_id = ?1", params![track_id]).map_err(|e| e.to_string())?;

        // Insert stems
        for s in stems {
            tx.execute(
                "INSERT INTO stems (id, track_id, stem_type, file_path, format, peak_amplitude) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![s.id, s.track_id, s.stem_type, s.file_path, s.format, s.peak_amplitude],
            )
            .map_err(|e| e.to_string())?;
        }

        // Insert chords
        for c in chords {
            tx.execute(
                "INSERT INTO chords (id, track_id, start_time, end_time, chord_name, detailed_chord, root, quality, measure_index) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![c.id, c.track_id, c.start_time, c.end_time, c.chord_name, c.detailed_chord, c.root, c.quality, c.measure_index],
            )
            .map_err(|e| e.to_string())?;
        }

        // Insert beats
        for b in beats {
            tx.execute(
                "INSERT INTO beats (id, track_id, timestamp, beat_number, is_downbeat) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![b.id, b.track_id, b.timestamp, b.beat_number, b.is_downbeat],
            )
            .map_err(|e| e.to_string())?;
        }

        // Insert bass notes
        for bn in bass_notes {
            tx.execute(
                "INSERT INTO bass_notes (id, track_id, start_time, end_time, midi_pitch, note_name, frequency, string_index, fret_number, is_slide, slide_from_fret, slide_direction)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    bn.id,
                    bn.track_id,
                    bn.start_time,
                    bn.end_time,
                    bn.midi_pitch,
                    bn.note_name,
                    bn.frequency,
                    bn.string_index,
                    bn.fret_number,
                    bn.is_slide.unwrap_or(0),
                    bn.slide_from_fret.unwrap_or(-1),
                    bn.slide_direction.as_deref().unwrap_or("")
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_tracks(state: State<'_, DbState>) -> Result<Vec<TrackRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, artist, filename, file_path, duration, bpm, sample_rate, status, progress, status_message, progress_meta, created_at
             FROM tracks ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TrackRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                filename: row.get(3)?,
                file_path: row.get(4)?,
                duration: row.get(5)?,
                bpm: row.get(6)?,
                sample_rate: row.get(7)?,
                status: row.get(8)?,
                progress: row.get(9)?,
                status_message: row.get(10)?,
                progress_meta: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    for track in rows {
        tracks.push(track.map_err(|e| e.to_string())?);
    }
    Ok(tracks)
}

#[tauri::command]
pub fn get_track_details(state: State<'_, DbState>, id: String) -> Result<TrackDetailResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let track = conn
        .query_row(
            "SELECT id, title, artist, filename, file_path, duration, bpm, sample_rate, status, progress, status_message, progress_meta, created_at
             FROM tracks WHERE id = ?1",
            params![id],
            |row| {
                Ok(TrackRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    filename: row.get(3)?,
                    file_path: row.get(4)?,
                    duration: row.get(5)?,
                    bpm: row.get(6)?,
                    sample_rate: row.get(7)?,
                    status: row.get(8)?,
                    progress: row.get(9)?,
                    status_message: row.get(10)?,
                    progress_meta: row.get(11)?,
                    created_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| format!("Track not found: {}", e))?;

    // Stems
    let mut stem_stmt = conn
        .prepare("SELECT id, track_id, stem_type, file_path, format, peak_amplitude FROM stems WHERE track_id = ?1")
        .map_err(|e| e.to_string())?;
    let stem_rows = stem_stmt
        .query_map(params![id], |row| {
            Ok(StemRecord {
                id: row.get(0)?,
                track_id: row.get(1)?,
                stem_type: row.get(2)?,
                file_path: row.get(3)?,
                format: row.get(4)?,
                peak_amplitude: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut stems = Vec::new();
    for s in stem_rows {
        stems.push(s.map_err(|e| e.to_string())?);
    }

    // Chords
    let mut chord_stmt = conn
        .prepare("SELECT id, track_id, start_time, end_time, chord_name, detailed_chord, root, quality, measure_index FROM chords WHERE track_id = ?1 ORDER BY start_time ASC")
        .map_err(|e| e.to_string())?;
    let chord_rows = chord_stmt
        .query_map(params![id], |row| {
            Ok(ChordRecord {
                id: row.get(0)?,
                track_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                chord_name: row.get(4)?,
                detailed_chord: row.get(5)?,
                root: row.get(6)?,
                quality: row.get(7)?,
                measure_index: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut chords = Vec::new();
    for c in chord_rows {
        chords.push(c.map_err(|e| e.to_string())?);
    }

    // Beats
    let mut beat_stmt = conn
        .prepare("SELECT id, track_id, timestamp, beat_number, is_downbeat FROM beats WHERE track_id = ?1 ORDER BY timestamp ASC")
        .map_err(|e| e.to_string())?;
    let beat_rows = beat_stmt
        .query_map(params![id], |row| {
            Ok(BeatRecord {
                id: row.get(0)?,
                track_id: row.get(1)?,
                timestamp: row.get(2)?,
                beat_number: row.get(3)?,
                is_downbeat: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut beats = Vec::new();
    for b in beat_rows {
        beats.push(b.map_err(|e| e.to_string())?);
    }

    // Bass notes
    let mut bass_stmt = conn
        .prepare("SELECT id, track_id, start_time, end_time, midi_pitch, note_name, frequency, string_index, fret_number, is_slide, slide_from_fret, slide_direction FROM bass_notes WHERE track_id = ?1 ORDER BY start_time ASC")
        .map_err(|e| e.to_string())?;
    let bass_rows = bass_stmt
        .query_map(params![id], |row| {
            Ok(BassNoteRecord {
                id: row.get(0)?,
                track_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                midi_pitch: row.get(4)?,
                note_name: row.get(5)?,
                frequency: row.get(6)?,
                string_index: row.get(7)?,
                fret_number: row.get(8)?,
                is_slide: row.get(9)?,
                slide_from_fret: row.get(10)?,
                slide_direction: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut bass_notes = Vec::new();
    for bn in bass_rows {
        bass_notes.push(bn.map_err(|e| e.to_string())?);
    }

    Ok(TrackDetailResponse {
        track,
        stems,
        chords,
        beats,
        bass_notes,
    })
}

#[tauri::command]
pub fn delete_track(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    // Also remove stems from disk
    let stems_dir = state.base_dir.join("stems").join(&id);
    if stems_dir.exists() {
        let _ = fs::remove_dir_all(&stems_dir);
    }
    Ok(())
}

#[tauri::command]
pub fn read_audio_file(state: State<'_, DbState>, file_path: String) -> Result<tauri::ipc::Response, String> {
    let p = Path::new(&file_path);
    let resolved = if p.is_absolute() {
        p.to_path_buf()
    } else {
        state.base_dir.join(p)
    };

    if !resolved.exists() {
        return Err(format!("Audio file not found: {:?}", resolved));
    }

    let bytes = fs::read(&resolved).map_err(|e| format!("Failed to read audio file {:?}: {}", resolved, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}
