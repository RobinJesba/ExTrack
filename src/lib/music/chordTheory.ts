/**
 * Music Theory and Chord Mapping Engine for ExTrack
 * Maps chord notations to Piano Keys, MIDI note arrays, and Guitar Fretboard shapes.
 * Supports semitone pitch transposition and single-octave keyboard voicings.
 */

export interface ChordShape {
  name: string;
  root: string;
  quality: string;
  notes: string[];
  voicedKeys: string[]; // e.g. ["C4", "E4", "G4"] - single-octave voicing
  pianoKeys: number[]; // MIDI note numbers for highlighting
  guitarFretboard: {
    frets: (number | 'x')[]; // 6 strings from low E (string 6) to high E (string 1), e.g. ['x', 0, 2, 2, 1, 0] for Am
    fingers: (number | null)[]; // finger 1 (index), 2 (middle), 3 (ring), 4 (pinky)
    barreFret?: number;
  };
}

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
  'E#': 'F',
  'B#': 'C'
};

export function normalizeNote(note: string): string {
  if (!note) return 'C';
  const clean = note.trim();
  return ENHARMONIC_MAP[clean] || clean;
}

/**
 * Transpose a chord string by N semitones (positive or negative)
 * e.g. transposeChord("G", 2) -> "A"
 * e.g. transposeChord("Em", -2) -> "Dm"
 * e.g. transposeChord("G/B", 2) -> "A/C#"
 */
export function transposeChord(chordStr: string, semitones: number): string {
  if (!chordStr || chordStr === 'N' || chordStr === 'None' || semitones === 0) {
    return chordStr;
  }

  // Handle slash chords e.g. G/B
  const parts = chordStr.split('/');
  const mainChord = parts[0];
  const bassNote = parts[1];

  let root = mainChord.charAt(0).toUpperCase();
  let rest = mainChord.slice(1);
  if (rest.startsWith('#') || rest.startsWith('b')) {
    root += rest.charAt(0);
    rest = rest.slice(1);
  }

  const normRoot = normalizeNote(root);
  const rootIndex = CHROMATIC_SCALE.indexOf(normRoot);

  if (rootIndex === -1) return chordStr;

  const newRootIndex = ((rootIndex + semitones) % 12 + 12) % 12;
  const newRoot = CHROMATIC_SCALE[newRootIndex];

  let result = `${newRoot}${rest}`;

  if (bassNote) {
    let bRoot = bassNote.charAt(0).toUpperCase();
    let bRest = bassNote.slice(1);
    if (bRest.startsWith('#') || bRest.startsWith('b')) {
      bRoot += bRest.charAt(0);
      bRest = bRest.slice(1);
    }
    const normBRoot = normalizeNote(bRoot);
    const bIndex = CHROMATIC_SCALE.indexOf(normBRoot);
    if (bIndex !== -1) {
      const newBIndex = ((bIndex + semitones) % 12 + 12) % 12;
      result += `/${CHROMATIC_SCALE[newBIndex]}${bRest}`;
    }
  }

  return result;
}

export function detectSongKey(
  chords: Array<{ chord_name: string; start_time: number; end_time: number }> | undefined,
  semitones: number = 0
): string {
  if (!chords || chords.length === 0) {
    const root = semitones === 0 ? 'C' : transposeChord('C', semitones);
    return `${root} Major`;
  }

  // Weight chords by total duration and position
  const scoreMap: Record<string, number> = {};

  chords.forEach((c, idx) => {
    if (!c.chord_name || c.chord_name === 'N' || c.chord_name === 'None') return;
    
    // Normalize chord name (e.g. "D:maj" -> "D", "G:min" -> "Gm")
    const cleanName = c.chord_name.replace(':maj', '').replace(':min', 'm').split('/')[0];
    const duration = Math.max(0.5, c.end_time - c.start_time);
    
    // First and last chords often indicate the tonic key center
    let positionWeight = 1.0;
    if (idx === 0) positionWeight += 2.5;
    if (idx === chords.length - 1) positionWeight += 2.0;

    scoreMap[cleanName] = (scoreMap[cleanName] || 0) + (duration * positionWeight);
  });

  let bestChord = 'C';
  let maxScore = -1;

  for (const [chord, score] of Object.entries(scoreMap)) {
    if (score > maxScore) {
      maxScore = score;
      bestChord = chord;
    }
  }

  const transposed = transposeChord(bestChord, semitones);
  const isMinor = transposed.endsWith('m') && !transposed.endsWith('maj');
  const root = isMinor ? transposed.slice(0, -1) : transposed;

  return `${root} ${isMinor ? 'Minor' : 'Major'}`;
}

const CHORD_INTERVALS: Record<string, number[]> = {
  'maj': [0, 4, 7],
  '': [0, 4, 7],
  'major': [0, 4, 7],
  'm': [0, 3, 7],
  'min': [0, 3, 7],
  'minor': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'dom7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  'min7': [0, 3, 7, 10],
  'dim': [0, 3, 6],
  'dim7': [0, 3, 6, 9],
  'aug': [0, 4, 8],
  'sus4': [0, 5, 7],
  'sus2': [0, 2, 7],
  '5': [0, 7],
  'add9': [0, 4, 7, 14]
};

// Common guitar standard shapes: [Low E (6), A (5), D (4), G (3), B (2), High E (1)]
const COMMON_GUITAR_CHORDS: Record<string, { frets: (number | 'x')[]; fingers: (number | null)[]; barre?: number }> = {
  'C': { frets: ['x', 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null] },
  'Cm': { frets: ['x', 3, 5, 5, 4, 3], fingers: [null, 1, 3, 4, 2, 1], barre: 3 },
  'C7': { frets: ['x', 3, 2, 3, 1, 0], fingers: [null, 3, 2, 4, 1, null] },
  'Cmaj7': { frets: ['x', 3, 2, 0, 0, 0], fingers: [null, 3, 2, null, null, null] },
  
  'D': { frets: ['x', 'x', 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2] },
  'Dm': { frets: ['x', 'x', 0, 2, 3, 1], fingers: [null, null, null, 2, 3, 1] },
  'D7': { frets: ['x', 'x', 0, 2, 1, 2], fingers: [null, null, null, 2, 1, 3] },
  'Dmaj7': { frets: ['x', 'x', 0, 2, 2, 2], fingers: [null, null, null, 1, 1, 1], barre: 2 },
  'Dsus4': { frets: ['x', 'x', 0, 2, 3, 3], fingers: [null, null, null, 1, 2, 3] },
  
  'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [null, 2, 3, 1, null, null] },
  'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [null, 2, 3, null, null, null] },
  'E7': { frets: [0, 2, 0, 1, 0, 0], fingers: [null, 2, null, 1, null, null] },
  'Em7': { frets: [0, 2, 2, 0, 3, 0], fingers: [null, 2, 3, null, 4, null] },

  'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barre: 1 },
  'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: 2 },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: 2 },
  'F#m7': { frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: 2 },

  'G': { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, null, null, null, 3] },
  'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barre: 3 },
  'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, null, null, null, 1] },
  'Gmaj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [2, 1, null, null, null, 3] },
  'G/B': { frets: ['x', 2, 0, 0, 0, 3], fingers: [null, 1, null, null, null, 2] },

  'A': { frets: ['x', 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null] },
  'Am': { frets: ['x', 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null] },
  'A7': { frets: ['x', 0, 2, 0, 2, 0], fingers: [null, null, 2, null, 3, null] },
  'Am7': { frets: ['x', 0, 2, 0, 1, 0], fingers: [null, null, 2, null, 1, null] },

  'B': { frets: ['x', 2, 4, 4, 4, 2], fingers: [null, 1, 2, 3, 4, 1], barre: 2 },
  'Bm': { frets: ['x', 2, 4, 4, 3, 2], fingers: [null, 1, 3, 4, 2, 1], barre: 2 },
  'B7': { frets: ['x', 2, 1, 2, 0, 2], fingers: [null, 2, 1, 3, null, 4] },
  'Bm7': { frets: ['x', 2, 4, 2, 3, 2], fingers: [null, 1, 3, 1, 2, 1], barre: 2 },
  'Bb': { frets: ['x', 1, 3, 3, 3, 1], fingers: [null, 1, 2, 3, 4, 1], barre: 1 },
  'Bbm': { frets: ['x', 1, 3, 3, 2, 1], fingers: [null, 1, 3, 4, 2, 1], barre: 1 }
};

export function parseChord(chordStr: string, transposeSemitones: number = 0): ChordShape {
  const effectiveChord = transposeSemitones !== 0 ? transposeChord(chordStr, transposeSemitones) : chordStr;

  if (!effectiveChord || effectiveChord === 'N' || effectiveChord === 'None') {
    return {
      name: 'No Chord',
      root: '',
      quality: '',
      notes: [],
      voicedKeys: [],
      pianoKeys: [],
      guitarFretboard: { frets: ['x', 'x', 'x', 'x', 'x', 'x'], fingers: [null, null, null, null, null, null] }
    };
  }

  // Handle slash chord e.g. G/B
  const [mainPart] = effectiveChord.split('/');
  
  // Extract Root note (e.g. C#, Bb, G)
  let root = mainPart.charAt(0).toUpperCase();
  let rest = mainPart.slice(1);
  if (rest.startsWith('#') || rest.startsWith('b')) {
    root += rest.charAt(0);
    rest = rest.slice(1);
  }

  root = normalizeNote(root);
  const quality = rest.toLowerCase() || 'maj';

  const rootIndex = CHROMATIC_SCALE.indexOf(root);
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS['maj'];

  const notes: string[] = [];
  const voicedKeys: string[] = [];
  const pianoKeys: number[] = [];

  if (rootIndex !== -1) {
    for (const interval of intervals) {
      const noteIdx = (rootIndex + interval) % 12;
      const noteName = CHROMATIC_SCALE[noteIdx];
      notes.push(noteName);

      // Single-octave musical voicing centered around Octave 4
      const octave = Math.floor((rootIndex + interval) / 12) + 4;
      voicedKeys.push(`${noteName}${octave}`);
      pianoKeys.push(60 + rootIndex + interval);
    }
  }

  // Find guitar shape
  let guitar = COMMON_GUITAR_CHORDS[effectiveChord] || COMMON_GUITAR_CHORDS[`${root}${quality === 'maj' ? '' : quality}`];

  if (!guitar) {
    // Fallback: standard E-shape or A-shape barre chord transposition
    if (rootIndex !== -1) {
      const fretOffset = rootIndex >= 4 ? rootIndex - 4 : rootIndex + 8;
      const isMinor = quality.includes('min') || quality.includes('m');
      guitar = {
        frets: [fretOffset, fretOffset + 2, fretOffset + 2, isMinor ? fretOffset : fretOffset + 1, fretOffset, fretOffset],
        fingers: [1, 3, 4, isMinor ? 1 : 2, 1, 1],
        barre: fretOffset
      };
    } else {
      guitar = { frets: ['x', 'x', 'x', 'x', 'x', 'x'], fingers: [null, null, null, null, null, null] };
    }
  }

  return {
    name: effectiveChord,
    root,
    quality,
    notes,
    voicedKeys,
    pianoKeys,
    guitarFretboard: {
      frets: guitar.frets,
      fingers: guitar.fingers,
      barreFret: guitar.barre
    }
  };
}
