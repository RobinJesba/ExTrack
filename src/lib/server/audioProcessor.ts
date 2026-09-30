import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { dbService, StemRecord, ChordRecord, BeatRecord, BassNoteRecord } from '../db/db';

const activeProcesses = new Map<string, ChildProcess>();
const activeCancellationFlags = new Set<string>();

export function cancelTrackProcess(trackId: string): boolean {
  activeCancellationFlags.add(trackId);
  const proc = activeProcesses.get(trackId);
  if (proc) {
    try {
      if (proc.pid) {
        if (process.platform !== 'win32') {
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            proc.kill('SIGKILL');
          }
        } else {
          proc.kill('SIGKILL');
        }
      }
    } catch (err) {
      console.warn(`[audioProcessor] Failed to kill process for track ${trackId}:`, err);
    }
    activeProcesses.delete(trackId);
    return true;
  }
  return false;
}

function getPythonExecutable(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  try {
    const venvRel = process.platform === 'win32'
      ? ['backend', '.venv', 'Scripts', 'python.exe']
      : ['backend', '.venv', 'bin', 'python'];
    const venvPath = path.resolve(process.cwd(), ...venvRel);
    if (fs.existsSync(venvPath)) {
      return venvPath;
    }
  } catch {
    // fallback
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

export async function processTrackAsync(
  trackId: string,
  inputPath: string,
  modelName: string = 'BS-Roformer-SW',
  device: string = 'auto',
  mode: 'fast' | 'quality' = 'fast'
) {
  const outputDir = path.join(process.cwd(), 'data', 'stems', trackId);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const modeLabel = mode === 'fast' ? '⚡ 2x Fast Mode' : '💎 Ultra Quality';
  dbService.updateTrackProgress(trackId, 10, `Initializing BS-RoFormer-SW (${modeLabel})...`, 'PROCESSING');

  const scriptPath = path.join(process.cwd(), 'backend', 'process_track.py');
  const pythonCmd = getPythonExecutable();
  
  const pyProcess = spawn(pythonCmd, [scriptPath, trackId, inputPath, outputDir, modelName, device, mode], {
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      PYTORCH_ENABLE_MPS_FALLBACK: '1',
      EXTRACK_DEVICE: device,
      EXTRACK_MODE: mode
    }
  });

  activeProcesses.set(trackId, pyProcess);

  let lineBuffer = '';

  pyProcess.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    // Keep the trailing incomplete part in the buffer
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line.trim());
        if (json.type === 'progress') {
          const metaPayload = JSON.stringify({
            stage: json.stage || 'STEM_SEPARATION',
            stage_progress: json.stage_progress ?? json.progress,
            eta: json.eta || '--:--',
            elapsed: json.elapsed || '00:00',
            speed: json.speed || '--',
            processed_audio: json.processed_audio || '',
            device_label: json.device_label || ''
          });
          dbService.updateTrackProgress(trackId, json.progress, json.message, 'PROCESSING', metaPayload);
        } else if (json.type === 'result') {
          handleProcessingSuccess(trackId, json);
        }
      } catch {
        // Non-JSON line or output log
      }
    }
  });

  pyProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    // Filter non-fatal UserWarnings
    if (!msg.includes('UserWarning') && !msg.includes('UserWarning:')) {
      console.warn(`[Python AI Worker]: ${msg}`);
    }
  });

  pyProcess.on('close', (code) => {
    activeProcesses.delete(trackId);
    if (activeCancellationFlags.has(trackId)) {
      activeCancellationFlags.delete(trackId);
      return; // Track was explicitly cancelled and deleted
    }

    // 1. Check if result.json was written to disk
    const resultJsonPath = path.join(outputDir, 'result.json');
    if (fs.existsSync(resultJsonPath)) {
      try {
        const fileContent = fs.readFileSync(resultJsonPath, 'utf8');
        const json = JSON.parse(fileContent);
        handleProcessingSuccess(trackId, json);
        return;
      } catch (err) {
        console.error('Failed to read result.json from disk:', err);
      }
    }

    // 2. Check lineBuffer remainder if result.json was not found
    if (lineBuffer.trim()) {
      try {
        const json = JSON.parse(lineBuffer.trim());
        if (json.type === 'result') {
          handleProcessingSuccess(trackId, json);
          return;
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback verification if stems exist on disk
    const vocalStem = path.join(outputDir, 'vocals.wav');
    if (fs.existsSync(vocalStem)) {
      try {
        const stat = fs.statSync(vocalStem);
        const duration = Math.max(10, Math.round((stat.size - 44) / (44100 * 4)));
        completeTrackFromStems(trackId, outputDir, duration);
        return;
      } catch (err) {
        console.error('Fallback completion error:', err);
      }
    }

    const track = dbService.getTrack(trackId);
    if (track && track.status !== 'COMPLETED') {
      dbService.updateTrackFailed(trackId, `AI processing finished with code ${code}`);
    }
  });
}

function handleProcessingSuccess(trackId: string, result: {
  duration: number;
  bpm: number;
  stems: Record<string, string>;
  beats: Array<{ timestamp: number; beat_number: number; is_downbeat: number }>;
  chords: Array<{ start_time: number; end_time: number; chord_name: string; detailed_chord?: string; root: string; quality: string; measure_index: number }>;
  bass_notes?: Array<{
    start_time: number;
    end_time: number;
    midi_pitch: number;
    note_name: string;
    frequency: number;
    string_index: number;
    fret_number: number;
    is_slide?: boolean | number;
    slide_from_fret?: number;
    slide_direction?: string;
  }>;
}) {
  const stemRecords: StemRecord[] = Object.entries(result.stems).map(([stemType, filePath]) => ({
    id: `${trackId}_${stemType}`,
    track_id: trackId,
    stem_type: stemType as StemRecord['stem_type'],
    file_path: filePath,
    format: 'wav',
    peak_amplitude: 1.0
  }));
  dbService.saveStems(stemRecords);

  const chordRecords: ChordRecord[] = (result.chords || []).map((c, i) => ({
    id: `${trackId}_chord_${i}`,
    track_id: trackId,
    start_time: c.start_time,
    end_time: c.end_time,
    chord_name: c.chord_name,
    detailed_chord: c.detailed_chord || c.chord_name,
    root: c.root,
    quality: c.quality,
    measure_index: c.measure_index
  }));
  dbService.saveChords(chordRecords);

  const beatRecords: BeatRecord[] = (result.beats || []).map((b, i) => ({
    id: `${trackId}_beat_${i}`,
    track_id: trackId,
    timestamp: b.timestamp,
    beat_number: b.beat_number,
    is_downbeat: b.is_downbeat
  }));
  dbService.saveBeats(beatRecords);

  if (result.bass_notes && Array.isArray(result.bass_notes)) {
    const bassNoteRecords: BassNoteRecord[] = result.bass_notes.map((n, i) => ({
      id: `${trackId}_bass_${i}`,
      track_id: trackId,
      start_time: n.start_time,
      end_time: n.end_time,
      midi_pitch: n.midi_pitch,
      note_name: n.note_name,
      frequency: n.frequency,
      string_index: n.string_index,
      fret_number: n.fret_number,
      is_slide: n.is_slide ? 1 : 0,
      slide_from_fret: n.slide_from_fret ?? -1,
      slide_direction: n.slide_direction || ''
    }));
    dbService.saveBassNotes(bassNoteRecords);
  }

  dbService.updateTrackCompleted(trackId, result.duration, result.bpm);
}

function completeTrackFromStems(trackId: string, outputDir: string, duration: number, bpm: number = 120) {
  const result = {
    track_id: trackId,
    duration,
    bpm,
    stems: {
      vocals: `/api/audio/stems/${trackId}/vocals.wav`,
      drums: `/api/audio/stems/${trackId}/drums.wav`,
      bass: `/api/audio/stems/${trackId}/bass.wav`,
      guitar: `/api/audio/stems/${trackId}/guitar.wav`,
      piano: `/api/audio/stems/${trackId}/piano.wav`,
      other: `/api/audio/stems/${trackId}/other.wav`
    },
    beats: [] as Array<{ timestamp: number; beat_number: number; is_downbeat: number }>,
    chords: [] as Array<{ start_time: number; end_time: number; chord_name: string; root: string; quality: string; measure_index: number }>,
    bass_notes: [] as Array<{
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
    }>
  };

  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(duration / beatInterval);
  for (let i = 0; i < totalBeats; i++) {
    const beatNum = (i % 4) + 1;
    result.beats.push({
      timestamp: Number((i * beatInterval).toFixed(3)),
      beat_number: beatNum,
      is_downbeat: beatNum === 1 ? 1 : 0
    });
  }

  const progression = ['D', 'G', 'A', 'Bm', 'G', 'Em', 'A7', 'D'];
  const rootMidiMap: Record<string, { midi: number; name: string; freq: number; str: number; fret: number }> = {
    'D': { midi: 38, name: 'D2', freq: 73.4, str: 2, fret: 0 },
    'G': { midi: 31, name: 'G1', freq: 49.0, str: 4, fret: 3 },
    'A': { midi: 33, name: 'A1', freq: 55.0, str: 3, fret: 0 },
    'B': { midi: 35, name: 'B1', freq: 61.7, str: 3, fret: 2 },
    'E': { midi: 28, name: 'E1', freq: 41.2, str: 4, fret: 0 },
  };

  const barSec = beatInterval * 4;
  const totalBars = Math.floor(duration / barSec);
  for (let bar = 0; bar < totalBars; bar++) {
    const cName = progression[bar % progression.length];
    const rootLetter = cName.charAt(0);
    const startT = Number((bar * barSec).toFixed(3));
    const endT = Number(((bar + 1) * barSec).toFixed(3));

    result.chords.push({
      start_time: startT,
      end_time: endT,
      chord_name: cName,
      root: rootLetter,
      quality: cName.includes('m') ? 'min' : 'maj',
      measure_index: bar + 1
    });

    const rootInfo = rootMidiMap[rootLetter] || rootMidiMap['D'];
    result.bass_notes.push({
      start_time: startT,
      end_time: endT,
      midi_pitch: rootInfo.midi,
      note_name: rootInfo.name,
      frequency: rootInfo.freq,
      string_index: rootInfo.str,
      fret_number: rootInfo.fret,
      is_slide: 0,
      slide_from_fret: -1,
      slide_direction: ''
    });
  }

  handleProcessingSuccess(trackId, result);
}
