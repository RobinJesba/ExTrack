/**
 * ExTrack Multi-Track Synchronized Audio Engine
 * High-performance Web Audio API engine supporting sample-accurate stem synchronization,
 * minus-one muting, solo isolation, real-time tempo & pitch control, and live VU metering.
 */

import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { audioBufferToWav } from './wavEncoder';

export type StemType = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';

export interface StemChannelConfig {
  volume: number; // 0.0 to 1.5
  muted: boolean;
  soloed: boolean;
  pan: number; // -1.0 to 1.0
}

export interface StemChannelNode {
  type: StemType;
  buffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  analyserNode: AnalyserNode;
  config: StemChannelConfig;
}

export class StemPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private soundTouchNode: SoundTouchNode | null = null;
  private workletPromise: Promise<void> | null = null;
  private channels: Map<StemType, StemChannelNode> = new Map();
  
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pauseOffset: number = 0;
  private duration: number = 0;
  
  private playbackRate: number = 1.0; // 0.5 to 1.5
  private pitchSemitones: number = 0; // -12 to +12
  
  private loopEnabled: boolean = false;
  private loopStart: number = 0;
  private loopEnd: number = 0;
  
  private metronomeEnabled: boolean = false;
  private bpm: number = 120;
  private beats: Array<{ timestamp: number; is_downbeat: boolean }> = [];
  private nextBeatIndex: number = 0;
  
  private animFrameId: number | null = null;
  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;
  private onVUMeterCallback: ((levels: Record<StemType, number>) => void) | null = null;

  private isDestroyed: boolean = false;
  private loadAbortController: AbortController | null = null;

  constructor() {
    // Initialized lazily on first user interaction
  }

  private initContext() {
    if (this.isDestroyed) return;
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.initWorklet();
    }
  }

  private async initWorklet(): Promise<void> {
    if (this.soundTouchNode || !this.ctx || this.isDestroyed) return;
    if (this.workletPromise) return this.workletPromise;

    this.workletPromise = (async () => {
      try {
        if (typeof window === 'undefined' || !this.ctx || !('audioWorklet' in this.ctx)) return;
        const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');
        await SoundTouchNode.register(this.ctx, '/soundtouch-processor.js');
        if (this.isDestroyed || !this.ctx || !this.masterGain) return;

        const stNode = new SoundTouchNode({ context: this.ctx });
        stNode.playbackRate.value = this.playbackRate;
        stNode.pitchSemitones.value = this.pitchSemitones;
        stNode.pitch.value = 1.0;

        try {
          stNode.setStretchParameters({
            sequenceMs: 50,
            seekWindowMs: 15,
            overlapMs: 8,
            quickSeek: true,
          });
        } catch {}

        try {
          this.masterGain.disconnect();
        } catch {}

        this.masterGain.connect(stNode);
        stNode.connect(this.ctx.destination);
        this.soundTouchNode = stNode;
      } catch (err) {
        console.warn('[StemPlayer] SoundTouch AudioWorklet failed to initialize, falling back to direct audio routing:', err);
        if (this.masterGain && this.ctx) {
          try {
            this.masterGain.disconnect();
            this.masterGain.connect(this.ctx.destination);
          } catch {}
        }
      }
    })();

    return this.workletPromise;
  }

  public async loadStems(stems: Partial<Record<StemType, string>>, onProgress?: (percent: number) => void): Promise<void> {
    if (this.loadAbortController) {
      try {
        this.loadAbortController.abort();
      } catch {}
    }
    this.loadAbortController = new AbortController();
    const { signal } = this.loadAbortController;

    this.initContext();
    if (!this.ctx || this.isDestroyed) return;

    this.stop();
    this.channels.clear();

    const stemTypes: StemType[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
    const entries = stemTypes.filter(type => Boolean(stems[type]));
    if (entries.length === 0) return;

    let highWaterMark = 5;
    const stemProgress: Record<string, number> = {};
    entries.forEach(t => { stemProgress[t] = 0; });
    if (onProgress) onProgress(5);

    const updateCombinedProgress = () => {
      if (!onProgress || signal.aborted || this.isDestroyed) return;
      const sum = Object.values(stemProgress).reduce((a, b) => a + b, 0);
      const computedPercent = Math.min(100, Math.round((sum / entries.length) * 100));
      if (computedPercent > highWaterMark) {
        highWaterMark = computedPercent;
        onProgress(highWaterMark);
      }
    };

    try {
      await Promise.all(
        entries.map(async (type) => {
          const url = stems[type];
          if (!url || signal.aborted || this.isDestroyed) return;
          try {
            let arrayBuf: ArrayBuffer;
            
            // Check browser CacheStorage for instant retrieval
            let cacheObj: Cache | null = null;
            if (typeof window !== 'undefined' && 'caches' in window) {
              try {
                cacheObj = await window.caches.open('extrack-audio-v1');
                const matched = await cacheObj.match(url);
                if (matched) {
                  arrayBuf = await matched.arrayBuffer();
                  stemProgress[type] = 0.75;
                  updateCombinedProgress();
                }
              } catch {
                cacheObj = null;
              }
            }

            // If not cached, fetch via HTTP
            if (!arrayBuf!) {
              const res = await fetch(url, { signal });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);

              // Store cloned response into CacheStorage in background
              if (cacheObj) {
                try {
                  cacheObj.put(url, res.clone()).catch(() => {});
                } catch {}
              }

              arrayBuf = await res.arrayBuffer();
              if (signal.aborted || this.isDestroyed) return;
              stemProgress[type] = 0.75;
              updateCombinedProgress();
            }

            if (signal.aborted || this.isDestroyed || !this.ctx) return;

            // Audio buffer decode accounts for the remaining 25%
            const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
            if (signal.aborted || this.isDestroyed || !this.ctx) return;

            stemProgress[type] = 1.0;
            updateCombinedProgress();

            if (audioBuf.duration > this.duration) {
              this.duration = audioBuf.duration;
              if (this.loopEnd === 0) this.loopEnd = this.duration;
            }

            const gainNode = this.ctx.createGain();
            const panNode = this.ctx.createStereoPanner();
            const analyserNode = this.ctx.createAnalyser();
            analyserNode.fftSize = 64;

            // Routing: Source -> Gain -> Pan -> Analyser -> MasterGain -> Destination
            gainNode.connect(panNode);
            panNode.connect(analyserNode);
            analyserNode.connect(this.masterGain!);

            this.channels.set(type, {
              type,
              buffer: audioBuf,
              sourceNode: null,
              gainNode,
              panNode,
              analyserNode,
              config: { volume: 1.0, muted: false, soloed: false, pan: 0 }
            });
          } catch (err: unknown) {
            if ((err as Error)?.name === 'AbortError' || signal.aborted || this.isDestroyed) {
              return; // Clean instant abort
            }
            console.error(`Failed to load stem ${type}:`, err);
            stemProgress[type] = 1.0;
            updateCombinedProgress();
          }
        })
      );
      if (this.workletPromise) {
        await this.workletPromise;
      }
    } catch {
      // Abort or error handled cleanly
    }
  }

  public play() {
    this.initContext();
    if (!this.ctx || this.channels.size === 0 || this.isPlaying) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const currentTime = this.pauseOffset;
    if (currentTime >= this.duration) {
      this.pauseOffset = 0;
    }

    this.startTime = this.ctx.currentTime - (this.pauseOffset / this.playbackRate);

    // Any solo active?
    const hasSolo = Array.from(this.channels.values()).some(ch => ch.config.soloed);

    if (this.soundTouchNode) {
      this.soundTouchNode.playbackRate.value = this.playbackRate;
      this.soundTouchNode.pitchSemitones.value = this.pitchSemitones;
      this.soundTouchNode.pitch.value = 1.0;
    }

    this.channels.forEach(ch => {
      if (!ch.buffer) return;

      const src = this.ctx!.createBufferSource();
      src.buffer = ch.buffer;
      src.playbackRate.value = this.playbackRate;
      if (!this.soundTouchNode) {
        src.detune.value = this.pitchSemitones * 100; // 1 semitone = 100 cents (fallback)
      }

      src.connect(ch.gainNode);

      // Apply initial gain according to mute/solo config
      this.updateChannelGain(ch, hasSolo);

      src.start(0, this.pauseOffset);
      ch.sourceNode = src;
    });

    this.isPlaying = true;
    this.startRenderLoop();
  }

  public pause() {
    if (!this.isPlaying || !this.ctx) return;
    this.pauseOffset = this.getCurrentTime();
    this.stopSources();
    this.isPlaying = false;
    this.stopRenderLoop();
  }

  public stop() {
    this.pauseOffset = 0;
    this.stopSources();
    this.isPlaying = false;
    this.stopRenderLoop();
    if (this.soundTouchNode) {
      try {
        this.soundTouchNode.port.postMessage({ type: 'clear' });
      } catch {}
    }
    this.syncNextBeatIndex(0);
    if (this.onTimeUpdateCallback) this.onTimeUpdateCallback(0);
  }

  public seek(targetTimeSeconds: number) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      this.pause();
    }
    this.pauseOffset = Math.max(0, Math.min(targetTimeSeconds, this.duration));
    if (this.soundTouchNode) {
      try {
        this.soundTouchNode.port.postMessage({ type: 'clear' });
      } catch {}
    }
    this.syncNextBeatIndex(this.pauseOffset);
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(this.pauseOffset);
    }
    if (wasPlaying) {
      this.play();
    }
  }

  private stopSources() {
    this.channels.forEach(ch => {
      if (ch.sourceNode) {
        try {
          ch.sourceNode.stop();
          ch.sourceNode.disconnect();
        } catch {
          // ignore already stopped
        }
        ch.sourceNode = null;
      }
    });
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.pauseOffset;
    const elapsedReal = this.ctx.currentTime - this.startTime;
    return Math.min(this.duration, Math.max(0, elapsedReal * this.playbackRate));
  }

  public setStemVolume(type: StemType, volume: number) {
    const ch = this.channels.get(type);
    if (!ch) return;
    ch.config.volume = volume;
    const hasSolo = Array.from(this.channels.values()).some(c => c.config.soloed);
    this.updateChannelGain(ch, hasSolo);
  }

  public setStemMute(type: StemType, muted: boolean) {
    const ch = this.channels.get(type);
    if (!ch) return;
    ch.config.muted = muted;
    const hasSolo = Array.from(this.channels.values()).some(c => c.config.soloed);
    this.updateChannelGain(ch, hasSolo);
  }

  public setStemSolo(type: StemType, soloed: boolean) {
    const ch = this.channels.get(type);
    if (!ch) return;
    ch.config.soloed = soloed;
    const hasSolo = Array.from(this.channels.values()).some(c => c.config.soloed);
    this.channels.forEach(c => this.updateChannelGain(c, hasSolo));
  }

  public setStemPan(type: StemType, pan: number) {
    const ch = this.channels.get(type);
    if (!ch || !this.ctx) return;
    ch.config.pan = Math.max(-1, Math.min(1, pan));
    ch.panNode.pan.setTargetAtTime(ch.config.pan, this.ctx.currentTime, 0.015);
  }

  private updateChannelGain(ch: StemChannelNode, hasSolo: boolean) {
    if (!this.ctx) return;
    let targetGain = ch.config.volume;

    if (ch.config.muted) {
      targetGain = 0;
    } else if (hasSolo) {
      targetGain = ch.config.soloed ? ch.config.volume : 0;
    }

    ch.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.015);
  }

  public setMasterVolume(vol: number) {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, vol)), this.ctx.currentTime, 0.015);
  }

  public setTempo(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(1.5, rate));
    if (this.ctx) {
      if (this.soundTouchNode) {
        this.soundTouchNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
      }
      if (this.isPlaying) {
        const curTime = this.getCurrentTime();
        this.channels.forEach(ch => {
          if (ch.sourceNode) {
            ch.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx!.currentTime);
          }
        });
        // Recalibrate start time
        this.startTime = this.ctx.currentTime - (curTime / this.playbackRate);
      }
    }
  }

  public setPitch(semitones: number) {
    this.pitchSemitones = Math.max(-12, Math.min(12, semitones));
    if (this.soundTouchNode && this.ctx) {
      this.soundTouchNode.pitchSemitones.setValueAtTime(this.pitchSemitones, this.ctx.currentTime);
    } else if (this.isPlaying && this.ctx) {
      // Fallback if worklet is unavailable
      const detuneCents = this.pitchSemitones * 100;
      this.channels.forEach(ch => {
        if (ch.sourceNode) {
          ch.sourceNode.detune.setValueAtTime(detuneCents, this.ctx!.currentTime);
        }
      });
    }
  }

  public setLoop(enabled: boolean, startSec?: number, endSec?: number) {
    this.loopEnabled = enabled;
    if (typeof startSec === 'number') this.loopStart = Math.max(0, startSec);
    if (typeof endSec === 'number') this.loopEnd = Math.min(this.duration, endSec);
  }

  private timeSignature: string = '4/4';
  private beatsPerBar: number = 4;

  public setBeats(beats: Array<{ timestamp: number; is_downbeat: boolean }>, bpm: number, timeSignature: string = '4/4') {
    this.beats = beats;
    this.bpm = bpm;
    this.timeSignature = timeSignature || '4/4';
    const num = parseInt(this.timeSignature.split('/')[0], 10);
    this.beatsPerBar = isNaN(num) || num <= 0 ? 4 : num;
    this.syncNextBeatIndex(this.pauseOffset);
  }

  public setMetronome(enabled: boolean) {
    this.metronomeEnabled = enabled;
    if (enabled) {
      this.syncNextBeatIndex(this.getCurrentTime());
    }
  }

  private syncNextBeatIndex(currentTime: number) {
    if (this.beats.length === 0) return;
    const idx = this.beats.findIndex(b => b.timestamp >= currentTime);
    this.nextBeatIndex = idx !== -1 ? idx : 0;
  }

  private playMetronomeClick(isDownbeat: boolean) {
    if (!this.ctx || !this.metronomeEnabled) return;
    const osc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 1500 : 850, this.ctx.currentTime);
    
    clickGain.gain.setValueAtTime(isDownbeat ? 0.6 : 0.35, this.ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(clickGain);
    clickGain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  private startRenderLoop() {
    const loop = () => {
      if (!this.isPlaying) return;
      const curTime = this.getCurrentTime();

      // Check loop boundaries
      if (this.loopEnabled && this.loopEnd > this.loopStart && curTime >= this.loopEnd) {
        this.seek(this.loopStart);
        return;
      }

      // Check track end
      if (curTime >= this.duration && this.duration > 0) {
        this.stop();
        if (this.onEndedCallback) this.onEndedCallback();
        return;
      }

      // Metronome sync
      if (this.metronomeEnabled && this.beats.length > 0) {
        const nextBeat = this.beats[this.nextBeatIndex];
        if (nextBeat && curTime >= nextBeat.timestamp) {
          this.playMetronomeClick(nextBeat.is_downbeat);
          this.nextBeatIndex = (this.nextBeatIndex + 1) % this.beats.length;
        }
      }

      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(curTime);
      }

      // Compute VU Meter RMS/Peak values
      if (this.onVUMeterCallback) {
        const levels: Record<StemType, number> = { vocals: 0, drums: 0, bass: 0, guitar: 0, piano: 0, other: 0 };
        const dataArray = new Uint8Array(32);
        this.channels.forEach((ch, type) => {
          ch.analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          levels[type] = Math.min(1.0, (sum / dataArray.length) / 128);
        });
        this.onVUMeterCallback(levels);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopRenderLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public onTimeUpdate(cb: (time: number) => void) {
    this.onTimeUpdateCallback = cb;
  }

  public onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  public onVUMeter(cb: (levels: Record<StemType, number>) => void) {
    this.onVUMeterCallback = cb;
  }

  public getDuration(): number {
    return this.duration;
  }

  public isClosed(): boolean {
    return this.isDestroyed || !this.ctx || this.ctx.state === 'closed';
  }

  public async exportMix(options?: {
    range?: 'full' | 'loop';
    onProgress?: (percent: number) => void;
  }): Promise<Blob> {
    const onProgress = options?.onProgress;
    if (onProgress) onProgress(5);

    if (this.channels.size === 0) {
      throw new Error('No stems loaded to export');
    }

    // Determine export duration range
    let startSec = 0;
    let endSec = this.duration;
    if (options?.range === 'loop' && this.loopEnabled && this.loopEnd > this.loopStart) {
      startSec = Math.max(0, this.loopStart);
      endSec = Math.min(this.duration, this.loopEnd);
    }

    const durationSec = endSec - startSec;
    if (durationSec <= 0) {
      throw new Error('Invalid export duration');
    }

    // Sample rate from first available stem buffer
    let sampleRate = 44100;
    for (const ch of this.channels.values()) {
      if (ch.buffer) {
        sampleRate = ch.buffer.sampleRate;
        break;
      }
    }

    // Check if any solo is active
    const hasSolo = Array.from(this.channels.values()).some(ch => ch.config.soloed);

    // Setup OfflineAudioContext
    const totalFrames = Math.ceil(durationSec * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

    const offlineMasterGain = offlineCtx.createGain();
    const currentMasterVol = this.masterGain ? this.masterGain.gain.value : 1.0;
    offlineMasterGain.gain.value = currentMasterVol;
    offlineMasterGain.connect(offlineCtx.destination);

    let activeChannels = 0;
    this.channels.forEach(ch => {
      if (!ch.buffer) return;

      let gain = ch.config.volume;
      if (ch.config.muted) {
        gain = 0;
      } else if (hasSolo) {
        gain = ch.config.soloed ? ch.config.volume : 0;
      }

      if (gain <= 0.0001) return; // Muted / excluded

      const src = offlineCtx.createBufferSource();
      src.buffer = ch.buffer;

      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = gain;

      const panNode = offlineCtx.createStereoPanner();
      panNode.pan.value = ch.config.pan;

      src.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(offlineMasterGain);

      src.start(0, startSec, durationSec);
      activeChannels++;
    });

    if (onProgress) onProgress(25);

    let renderedBuffer = await offlineCtx.startRendering();
    if (onProgress) onProgress(65);

    // Apply pitch and tempo time-stretching if altered from standard
    if (Math.abs(this.playbackRate - 1.0) > 0.001 || this.pitchSemitones !== 0) {
      try {
        const { processOffline } = await import('@soundtouchjs/audio-worklet');
        renderedBuffer = await processOffline({
          input: renderedBuffer,
          processorUrl: '/soundtouch-processor.js',
          playbackRate: this.playbackRate,
          pitchSemitones: this.pitchSemitones,
        });
      } catch (err) {
        console.warn('[StemPlayer] SoundTouch offline processing failed, exporting mix without time-stretch:', err);
      }
    }

    if (onProgress) onProgress(90);

    const wavBlob = audioBufferToWav(renderedBuffer);
    if (onProgress) onProgress(100);

    return wavBlob;
  }

  public destroy() {
    if (this.loadAbortController) {
      try {
        this.loadAbortController.abort();
      } catch {}
      this.loadAbortController = null;
    }
    this.stop();
    this.channels.forEach((ch) => {
      if (ch.sourceNode) {
        try {
          ch.sourceNode.disconnect();
        } catch {}
        ch.sourceNode = null;
      }
      try {
        ch.gainNode.disconnect();
        ch.panNode.disconnect();
        ch.analyserNode.disconnect();
      } catch {}
      ch.buffer = null;
    });
    this.channels.clear();

    if (this.soundTouchNode) {
      try {
        this.soundTouchNode.disconnect();
      } catch {}
      this.soundTouchNode = null;
    }

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {}
      this.masterGain = null;
    }

    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    this.isDestroyed = true;
  }
}
