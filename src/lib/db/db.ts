import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const OLD_DB_PATH = path.join(DATA_DIR, 'detrack.db');
const DB_PATH = path.join(DATA_DIR, 'extrack.db');
if (fs.existsSync(OLD_DB_PATH) && !fs.existsSync(DB_PATH)) {
  try {
    fs.renameSync(OLD_DB_PATH, DB_PATH);
  } catch {
    // Fallback if locked
  }
}
const db = new Database(DB_PATH);

// Optimize SQLite for high-concurrency read/writes with Next.js & Python workers
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -64000'); // 64MB memory cache

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stems (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    stem_type TEXT NOT NULL, -- vocals, drums, bass, other
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
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
  );
`);

// Migration for existing tables
try {
  db.exec("ALTER TABLE chords ADD COLUMN detailed_chord TEXT DEFAULT ''");
} catch {}
try {
  db.exec(`
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
    );
  `);
} catch {}

try {
  db.exec("ALTER TABLE bass_notes ADD COLUMN is_slide INTEGER DEFAULT 0");
} catch {}
try {
  db.exec("ALTER TABLE bass_notes ADD COLUMN slide_from_fret INTEGER DEFAULT -1");
} catch {}
try {
  db.exec("ALTER TABLE bass_notes ADD COLUMN slide_direction TEXT DEFAULT ''");
} catch {}

try {
  db.exec("ALTER TABLE tracks ADD COLUMN progress_meta TEXT DEFAULT ''");
} catch {}

export interface TrackRecord {
  id: string;
  title: string;
  artist: string | null;
  filename: string;
  file_path: string;
  duration: number;
  bpm: number;
  sample_rate: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  status_message: string;
  progress_meta?: string;
  created_at: string;
}

export type StemType = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';

export interface StemRecord {
  id: string;
  track_id: string;
  stem_type: StemType;
  file_path: string;
  format: string;
  peak_amplitude: number;
}

export interface ChordRecord {
  id: string;
  track_id: string;
  start_time: number;
  end_time: number;
  chord_name: string;
  detailed_chord?: string;
  root: string;
  quality: string;
  measure_index: number;
}

export interface BeatRecord {
  id: string;
  track_id: string;
  timestamp: number;
  beat_number: number;
  is_downbeat: number;
}

export interface BassNoteRecord {
  id: string;
  track_id: string;
  start_time: number;
  end_time: number;
  midi_pitch: number;
  note_name: string;
  frequency: number;
  string_index: number;
  fret_number: number;
  is_slide?: number;
  slide_from_fret?: number;
  slide_direction?: string;
}

export const dbService = {
  getTrack(id: string): (TrackRecord & { stems: StemRecord[]; chords: ChordRecord[]; beats: BeatRecord[]; bass_notes: BassNoteRecord[] }) | null {
    const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRecord | undefined;
    if (!track) return null;

    const stems = db.prepare('SELECT * FROM stems WHERE track_id = ?').all(id) as StemRecord[];
    const chords = db.prepare('SELECT * FROM chords WHERE track_id = ? ORDER BY start_time ASC').all(id) as ChordRecord[];
    const beats = db.prepare('SELECT * FROM beats WHERE track_id = ? ORDER BY timestamp ASC').all(id) as BeatRecord[];
    const bass_notes = db.prepare('SELECT * FROM bass_notes WHERE track_id = ? ORDER BY start_time ASC').all(id) as BassNoteRecord[];

    return { ...track, stems, chords, beats, bass_notes };
  },

  getAllTracks(): TrackRecord[] {
    return db.prepare('SELECT * FROM tracks ORDER BY created_at DESC').all() as TrackRecord[];
  },

  createTrack(track: Omit<TrackRecord, 'created_at'>) {
    const stmt = db.prepare(`
      INSERT INTO tracks (id, title, artist, filename, file_path, duration, bpm, sample_rate, status, progress, status_message)
      VALUES (@id, @title, @artist, @filename, @file_path, @duration, @bpm, @sample_rate, @status, @progress, @status_message)
    `);
    stmt.run(track);
  },

  updateTrackProgress(
    id: string,
    progress: number,
    status_message: string,
    status: TrackRecord['status'] = 'PROCESSING',
    progress_meta: string = ''
  ) {
    db.prepare(`
      UPDATE tracks 
      SET progress = ?, status_message = ?, status = ?, progress_meta = ?
      WHERE id = ?
    `).run(progress, status_message, status, progress_meta, id);
  },

  updateTrackCompleted(id: string, duration: number, bpm: number) {
    db.prepare(`
      UPDATE tracks 
      SET duration = ?, bpm = ?, status = 'COMPLETED', progress = 100, status_message = 'Complete'
      WHERE id = ?
    `).run(duration, bpm, id);
  },

  updateTrackFailed(id: string, errorMessage: string) {
    db.prepare(`
      UPDATE tracks 
      SET status = 'FAILED', status_message = ?
      WHERE id = ?
    `).run(errorMessage, id);
  },

  saveStems(stems: StemRecord[]) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stems (id, track_id, stem_type, file_path, format, peak_amplitude)
      VALUES (@id, @track_id, @stem_type, @file_path, @format, @peak_amplitude)
    `);
    const insertMany = db.transaction((records: StemRecord[]) => {
      for (const r of records) stmt.run(r);
    });
    insertMany(stems);
  },

  saveChords(chords: ChordRecord[]) {
    if (chords.length > 0) {
      db.prepare('DELETE FROM chords WHERE track_id = ?').run(chords[0].track_id);
      const stmt = db.prepare(`
        INSERT INTO chords (id, track_id, start_time, end_time, chord_name, detailed_chord, root, quality, measure_index, instrument)
        VALUES (@id, @track_id, @start_time, @end_time, @chord_name, @detailed_chord, @root, @quality, @measure_index, 'all')
      `);
      const insertMany = db.transaction((records: ChordRecord[]) => {
        for (const r of records) {
          stmt.run({
            ...r,
            detailed_chord: r.detailed_chord || r.chord_name
          });
        }
      });
      insertMany(chords);
    }
  },

  saveBeats(beats: BeatRecord[]) {
    if (beats.length > 0) {
      db.prepare('DELETE FROM beats WHERE track_id = ?').run(beats[0].track_id);
      const stmt = db.prepare(`
        INSERT INTO beats (id, track_id, timestamp, beat_number, is_downbeat)
        VALUES (@id, @track_id, @timestamp, @beat_number, @is_downbeat)
      `);
      const insertMany = db.transaction((records: BeatRecord[]) => {
        for (const r of records) stmt.run(r);
      });
      insertMany(beats);
    }
  },

  saveBassNotes(notes: BassNoteRecord[]) {
    if (notes.length > 0) {
      db.prepare('DELETE FROM bass_notes WHERE track_id = ?').run(notes[0].track_id);
      const stmt = db.prepare(`
        INSERT INTO bass_notes (id, track_id, start_time, end_time, midi_pitch, note_name, frequency, string_index, fret_number, is_slide, slide_from_fret, slide_direction)
        VALUES (@id, @track_id, @start_time, @end_time, @midi_pitch, @note_name, @frequency, @string_index, @fret_number, @is_slide, @slide_from_fret, @slide_direction)
      `);
      const insertMany = db.transaction((records: BassNoteRecord[]) => {
        for (const r of records) {
          stmt.run({
            ...r,
            is_slide: r.is_slide ? 1 : 0,
            slide_from_fret: r.slide_from_fret ?? -1,
            slide_direction: r.slide_direction || ''
          });
        }
      });
      insertMany(notes);
    }
  },

  deleteTrack(id: string) {
    // 1. Delete physical stem files and upload files from disk
    try {
      const stemsDir = path.join(DATA_DIR, 'stems', id);
      if (fs.existsSync(stemsDir)) {
        fs.rmSync(stemsDir, { recursive: true, force: true });
      }
      const track = db.prepare('SELECT file_path FROM tracks WHERE id = ?').get(id) as { file_path?: string } | undefined;
      if (track?.file_path && fs.existsSync(track.file_path)) {
        try {
          fs.unlinkSync(track.file_path);
        } catch {}
      }
    } catch (err) {
      console.warn(`[dbService] Failed to clean up files for track ${id}:`, err);
    }

    // 2. Cascade delete database rows
    db.prepare('DELETE FROM stems WHERE track_id = ?').run(id);
    db.prepare('DELETE FROM chords WHERE track_id = ?').run(id);
    db.prepare('DELETE FROM beats WHERE track_id = ?').run(id);
    db.prepare('DELETE FROM bass_notes WHERE track_id = ?').run(id);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  }
};

export default db;
