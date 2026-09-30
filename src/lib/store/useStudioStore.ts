import { create } from 'zustand';
import { StemPlayer, StemType } from '../audio/StemPlayer';
import { parseChord, ChordShape, detectSongKey } from '../music/chordTheory';
import { triggerFileDownload, generateExportFilename } from '../audio/wavEncoder';

export interface ChordEvent {
  id: string;
  start_time: number;
  end_time: number;
  chord_name: string;
  detailed_chord?: string;
  root: string;
  quality: string;
  measure_index: number;
}

export interface BeatEvent {
  id: string;
  timestamp: number;
  beat_number: number;
  is_downbeat: boolean;
}

export interface BassNoteEvent {
  id: string;
  start_time: number;
  end_time: number;
  midi_pitch: number;
  note_name: string;
  frequency: number;
  string_index: number; // 1 (G), 2 (D), 3 (A), 4 (E)
  fret_number: number;  // 0 to 24
  is_slide?: boolean | number;
  slide_from_fret?: number;
  slide_direction?: 'up' | 'down' | string;
}

export interface TrackData {
  id: string;
  title: string;
  artist: string | null;
  duration: number;
  bpm: number;
  time_signature?: string;
  stems: Record<StemType, string>;
  chords: ChordEvent[];
  beats: BeatEvent[];
  bass_notes?: BassNoteEvent[];
}

interface StudioState {
  player: StemPlayer | null;
  track: TrackData | null;
  isLoading: boolean;
  loadingProgress: number;
  
  // Playback
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  pitchSemitones: number;
  masterVolume: number;
  timeSignature: string;
  
  // Mixer
  stemsConfig: Record<StemType, { volume: number; muted: boolean; soloed: boolean; pan: number }>;
  vuLevels: Record<StemType, number>;
  
  // Loop & Metronome
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;
  
  // Current Visualized Chord & Bass Note
  activeChord: ChordShape | null;
  activeChordIndex: number;
  chordProgressPercent: number; // 0.0 to 1.0 progress of current active chord interval
  chordComplexity: 'basic' | 'detailed'; // 'basic' canonical shapes vs 'detailed' jazz/passing chords
  activeBassNote: BassNoteEvent | null;
  
  // Actions
  initPlayer: () => StemPlayer;
  loadTrack: (track: TrackData) => Promise<void>;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPitchSemitones: (semitones: number) => void;
  setChordComplexity: (mode: 'basic' | 'detailed') => void;
  setMasterVolume: (volume: number) => void;
  setStemVolume: (type: StemType, volume: number) => void;
  toggleStemMute: (type: StemType) => void;
  toggleStemSolo: (type: StemType) => void;
  setStemPan: (type: StemType, pan: number) => void;
  resetStem: (type: StemType) => void;
  resetMixer: () => void;
  resetTransport: () => void;
  setLoop: (enabled: boolean, start?: number, end?: number) => void;
  toggleMetronome: () => void;
  destroyPlayer: () => void;
  
  // Export Mix
  isExporting: boolean;
  exportMix: (range?: 'full' | 'loop') => Promise<void>;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  player: null,
  track: null,
  isLoading: false,
  loadingProgress: 0,
  
  isExporting: false,
  
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  pitchSemitones: 0,
  masterVolume: 1.0,
  timeSignature: '4/4',
  chordComplexity: 'basic',
  activeBassNote: null,
  
  stemsConfig: {
    vocals: { volume: 1.0, muted: false, soloed: false, pan: 0 },
    drums: { volume: 1.0, muted: false, soloed: false, pan: 0 },
    bass: { volume: 1.0, muted: false, soloed: false, pan: 0 },
    guitar: { volume: 1.0, muted: false, soloed: false, pan: 0 },
    piano: { volume: 1.0, muted: false, soloed: false, pan: 0 },
    other: { volume: 1.0, muted: false, soloed: false, pan: 0 }
  },
  
  vuLevels: { vocals: 0, drums: 0, bass: 0, guitar: 0, piano: 0, other: 0 },
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  metronomeEnabled: false,
  
  activeChord: null,
  activeChordIndex: -1,
  chordProgressPercent: 0,

  initPlayer: () => {
    let p = get().player;
    if (!p || (p && typeof p.isClosed === 'function' && p.isClosed())) {
      p = new StemPlayer();
      let lastChordIdx = -1;
      let lastBassIdx = -1;
      
      p.onTimeUpdate((time) => {
        const { track, pitchSemitones, chordComplexity } = get();
        let chord: ChordShape | null = null;
        let chordIdx = -1;
        let prog = 0;
        let currentBassNote: BassNoteEvent | null = null;

        if (track && track.chords.length > 0) {
          const chords = track.chords;
          // 1. Fast O(1) check: Is last known chord still active?
          if (lastChordIdx >= 0 && lastChordIdx < chords.length && time >= chords[lastChordIdx].start_time && time < chords[lastChordIdx].end_time) {
            chordIdx = lastChordIdx;
          } else if (lastChordIdx + 1 < chords.length && time >= chords[lastChordIdx + 1].start_time && time < chords[lastChordIdx + 1].end_time) {
            // Next sequential chord
            chordIdx = lastChordIdx + 1;
            lastChordIdx = chordIdx;
          } else {
            // Scrub/jump occurred, perform bounded find
            chordIdx = chords.findIndex(c => time >= c.start_time && time < c.end_time);
            lastChordIdx = chordIdx;
          }

          if (chordIdx !== -1) {
            const currentChordEvent = chords[chordIdx];
            const nameToParse = (chordComplexity === 'detailed' && currentChordEvent.detailed_chord)
              ? currentChordEvent.detailed_chord
              : currentChordEvent.chord_name;
            chord = parseChord(nameToParse, pitchSemitones);
            const duration = currentChordEvent.end_time - currentChordEvent.start_time;
            if (duration > 0) {
              prog = Math.max(0, Math.min(1, (time - currentChordEvent.start_time) / duration));
            }
          }
        }

        if (track && track.bass_notes && track.bass_notes.length > 0) {
          const bass = track.bass_notes;
          // Fast O(1) check: Is last known bass note still active?
          if (lastBassIdx >= 0 && lastBassIdx < bass.length && time >= bass[lastBassIdx].start_time && time < bass[lastBassIdx].end_time) {
            currentBassNote = bass[lastBassIdx];
          } else if (lastBassIdx + 1 < bass.length && time >= bass[lastBassIdx + 1].start_time && time < bass[lastBassIdx + 1].end_time) {
            lastBassIdx = lastBassIdx + 1;
            currentBassNote = bass[lastBassIdx];
          } else {
            const foundIdx = bass.findIndex(n => time >= n.start_time && time < n.end_time);
            lastBassIdx = foundIdx;
            if (foundIdx !== -1) currentBassNote = bass[foundIdx];
          }
        }

        set({
          currentTime: time,
          activeChord: chord,
          activeChordIndex: chordIdx,
          chordProgressPercent: prog,
          activeBassNote: currentBassNote
        });
      });

      p.onEnded(() => {
        set({ isPlaying: false, currentTime: 0, chordProgressPercent: 0 });
      });

      p.onVUMeter((levels) => {
        set({ vuLevels: levels });
      });

      set({ player: p });
    }
    return p;
  },

  destroyPlayer: () => {
    const { player } = get();
    if (player) {
      player.destroy();
    }
    set({
      player: null,
      track: null,
      isLoading: false,
      loadingProgress: 0,
      isPlaying: false,
      currentTime: 0,
      activeChord: null,
      activeBassNote: null,
      vuLevels: { vocals: 0, drums: 0, bass: 0, guitar: 0, piano: 0, other: 0 }
    });
  },

  loadTrack: async (trackData: TrackData) => {
    const current = get();
    // Prevent duplicate concurrent load requests for the same track
    if (current.isLoading && current.track?.id === trackData.id) {
      return;
    }
    if (!current.isLoading && current.track?.id === trackData.id && current.player && !current.player.isClosed() && current.duration > 0) {
      return;
    }

    const player = get().initPlayer();
    const ts = trackData.time_signature || '4/4';
    set({
      isLoading: true,
      loadingProgress: 0,
      track: trackData,
      duration: trackData.duration,
      timeSignature: ts
    });
    
    await player.loadStems(trackData.stems, (percent) => {
      set({ loadingProgress: percent });
    });

    const beatsFormatted = trackData.beats.map(b => ({
      timestamp: b.timestamp,
      is_downbeat: Boolean(b.is_downbeat)
    }));
    player.setBeats(beatsFormatted, trackData.bpm, ts);

    const dur = player.getDuration() || trackData.duration;
    set({
      isLoading: false,
      duration: dur,
      loopStart: 0,
      loopEnd: dur,
      currentTime: 0
    });
  },

  play: () => {
    const player = get().initPlayer();
    player.play();
    set({ isPlaying: true });
  },

  pause: () => {
    const { player } = get();
    if (player) {
      player.pause();
      set({ isPlaying: false });
    }
  },

  seek: (seconds: number) => {
    const { player, track, pitchSemitones, chordComplexity } = get();
    if (player) {
      player.seek(seconds);
    }
    
    let chord: ChordShape | null = null;
    let chordIdx = -1;
    let prog = 0;
    let currentBassNote: BassNoteEvent | null = null;

    if (track && track.chords.length > 0) {
      chordIdx = track.chords.findIndex(c => seconds >= c.start_time && seconds < c.end_time);
      if (chordIdx !== -1) {
        const currentChordEvent = track.chords[chordIdx];
        const nameToParse = (chordComplexity === 'detailed' && currentChordEvent.detailed_chord)
          ? currentChordEvent.detailed_chord
          : currentChordEvent.chord_name;
        chord = parseChord(nameToParse, pitchSemitones);
        const duration = currentChordEvent.end_time - currentChordEvent.start_time;
        if (duration > 0) {
          prog = Math.max(0, Math.min(1, (seconds - currentChordEvent.start_time) / duration));
        }
      }
    }

    if (track && track.bass_notes && track.bass_notes.length > 0) {
      const found = track.bass_notes.find(n => seconds >= n.start_time && seconds < n.end_time);
      if (found) currentBassNote = found;
    }

    set({
      currentTime: seconds,
      activeChord: chord,
      activeChordIndex: chordIdx,
      chordProgressPercent: prog,
      activeBassNote: currentBassNote
    });
  },

  setPlaybackRate: (rate: number) => {
    const { player } = get();
    if (player) player.setTempo(rate);
    set({ playbackRate: rate });
  },

  setPitchSemitones: (semitones: number) => {
    const { player, track, activeChordIndex, chordComplexity } = get();
    if (player) player.setPitch(semitones);
    
    let newChord: ChordShape | null = null;
    if (track && activeChordIndex >= 0 && track.chords[activeChordIndex]) {
      const cur = track.chords[activeChordIndex];
      const nameToParse = (chordComplexity === 'detailed' && cur.detailed_chord)
        ? cur.detailed_chord
        : cur.chord_name;
      newChord = parseChord(nameToParse, semitones);
    }

    set({ pitchSemitones: semitones, activeChord: newChord });
  },

  setChordComplexity: (mode: 'basic' | 'detailed') => {
    const { track, activeChordIndex, pitchSemitones } = get();
    let newChord: ChordShape | null = null;
    if (track && activeChordIndex >= 0 && track.chords[activeChordIndex]) {
      const cur = track.chords[activeChordIndex];
      const nameToParse = (mode === 'detailed' && cur.detailed_chord)
        ? cur.detailed_chord
        : cur.chord_name;
      newChord = parseChord(nameToParse, pitchSemitones);
    }
    set({ chordComplexity: mode, activeChord: newChord });
  },

  setMasterVolume: (volume: number) => {
    const { player } = get();
    if (player) player.setMasterVolume(volume);
    set({ masterVolume: volume });
  },

  setStemVolume: (type: StemType, volume: number) => {
    const { player, stemsConfig } = get();
    if (player) player.setStemVolume(type, volume);
    set({
      stemsConfig: {
        ...stemsConfig,
        [type]: { ...stemsConfig[type], volume }
      }
    });
  },

  toggleStemMute: (type: StemType) => {
    const { player, stemsConfig } = get();
    const muted = !stemsConfig[type].muted;
    if (player) player.setStemMute(type, muted);
    set({
      stemsConfig: {
        ...stemsConfig,
        [type]: { ...stemsConfig[type], muted }
      }
    });
  },

  toggleStemSolo: (type: StemType) => {
    const { player, stemsConfig } = get();
    const soloed = !stemsConfig[type].soloed;
    if (player) player.setStemSolo(type, soloed);
    set({
      stemsConfig: {
        ...stemsConfig,
        [type]: { ...stemsConfig[type], soloed }
      }
    });
  },

  setStemPan: (type: StemType, pan: number) => {
    const { player, stemsConfig } = get();
    if (player) player.setStemPan(type, pan);
    set({
      stemsConfig: {
        ...stemsConfig,
        [type]: { ...stemsConfig[type], pan }
      }
    });
  },

  resetStem: (type: StemType) => {
    const { player, stemsConfig } = get();
    if (player) {
      player.setStemVolume(type, 1.0);
      player.setStemPan(type, 0);
      player.setStemMute(type, false);
      player.setStemSolo(type, false);
    }
    set({
      stemsConfig: {
        ...stemsConfig,
        [type]: { volume: 1.0, muted: false, soloed: false, pan: 0 }
      }
    });
  },

  resetMixer: () => {
    const { player, track, activeChordIndex, chordComplexity } = get();
    const stemTypes: StemType[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
    if (player) {
      player.setMasterVolume(1.0);
      player.setTempo(1.0);
      player.setPitch(0);
      stemTypes.forEach(t => {
        player.setStemVolume(t, 1.0);
        player.setStemPan(t, 0);
        player.setStemMute(t, false);
        player.setStemSolo(t, false);
      });
    }

    let newChord: ChordShape | null = null;
    if (track && activeChordIndex >= 0 && track.chords[activeChordIndex]) {
      const cur = track.chords[activeChordIndex];
      const nameToParse = (chordComplexity === 'detailed' && cur.detailed_chord)
        ? cur.detailed_chord
        : cur.chord_name;
      newChord = parseChord(nameToParse, 0);
    }

    set({
      masterVolume: 1.0,
      playbackRate: 1.0,
      pitchSemitones: 0,
      activeChord: newChord,
      stemsConfig: {
        vocals: { volume: 1.0, muted: false, soloed: false, pan: 0 },
        drums: { volume: 1.0, muted: false, soloed: false, pan: 0 },
        bass: { volume: 1.0, muted: false, soloed: false, pan: 0 },
        guitar: { volume: 1.0, muted: false, soloed: false, pan: 0 },
        piano: { volume: 1.0, muted: false, soloed: false, pan: 0 },
        other: { volume: 1.0, muted: false, soloed: false, pan: 0 }
      }
    });
  },

  resetTransport: () => {
    const { player } = get();
    if (player) {
      player.setTempo(1.0);
      player.setPitch(0);
      player.setLoop(false);
      player.setMetronome(false);
    }
    set({
      playbackRate: 1.0,
      pitchSemitones: 0,
      loopEnabled: false,
      metronomeEnabled: false
    });
  },

  setLoop: (enabled: boolean, start?: number, end?: number) => {
    const { player, loopStart, loopEnd } = get();
    const s = typeof start === 'number' ? start : loopStart;
    const e = typeof end === 'number' ? end : loopEnd;
    if (player) player.setLoop(enabled, s, e);
    set({ loopEnabled: enabled, loopStart: s, loopEnd: e });
  },

  toggleMetronome: () => {
    const { player, metronomeEnabled } = get();
    const nextState = !metronomeEnabled;
    if (player) player.setMetronome(nextState);
    set({ metronomeEnabled: nextState });
  },

  exportMix: async (range: 'full' | 'loop' = 'full') => {
    const { player, track, playbackRate, pitchSemitones, stemsConfig, isExporting } = get();
    if (!player || !track || isExporting) return;

    set({ isExporting: true });

    try {
      const blob = await player.exportMix({ range });

      const currentBpm = Math.round((track.bpm || 120) * playbackRate);
      const currentKey = detectSongKey(track.chords, pitchSemitones);

      const filename = generateExportFilename({
        artist: track.artist,
        title: track.title,
        bpm: currentBpm,
        key: currentKey,
        stemsConfig,
        isLoop: range === 'loop',
      });

      triggerFileDownload(blob, filename);
    } catch (err) {
      console.error('Failed to export mix:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      set({ isExporting: false });
    }
  }
}));
