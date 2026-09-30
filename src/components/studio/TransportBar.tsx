'use client';

import React, { useEffect } from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Play, Pause, Square, Repeat, Bell, Gauge, Music2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { detectSongKey } from '@/lib/music/chordTheory';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

function getSingleValue(val: number | readonly number[] | undefined, defaultVal: number = 0): number {
  if (typeof val === 'number') return val;
  if (Array.isArray(val) || (val && typeof (val as readonly number[])[0] === 'number')) {
    return (val as readonly number[])[0];
  }
  return defaultVal;
}

export function TransportBar() {
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    pitchSemitones,
    loopEnabled,
    metronomeEnabled,
    timeSignature,
    track,
    play,
    pause,
    seek,
    setPlaybackRate,
    setPitchSemitones,
    setLoop,
    toggleMetronome
  } = useStudioStore();

  // Global studio keyboard shortcuts (Capture phase to 100% prevent browser spacebar scroll)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput = target instanceof HTMLInputElement || 
                          target instanceof HTMLTextAreaElement || 
                          Boolean(target?.isContentEditable);
      if (isTextInput) return;
      
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const store = useStudioStore.getState();
        if (store.isPlaying) {
          store.pause();
        } else {
          store.play();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const store = useStudioStore.getState();
        store.seek(Math.max(0, store.currentTime - 3));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const store = useStudioStore.getState();
        store.seek(Math.min(store.duration, store.currentTime + 3));
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        const store = useStudioStore.getState();
        store.setLoop(!store.loopEnabled);
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        const store = useStudioStore.getState();
        store.toggleMetronome();
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        const store = useStudioStore.getState();
        store.seek(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  const originalBpm = track?.bpm || 120;
  const currentBpm = Math.round(originalBpm * playbackRate);
  const currentKey = detectSongKey(track?.chords, pitchSemitones);

  return (
    <div className="bg-zinc-950/95 border border-zinc-800/90 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-wrap items-center justify-between gap-3 sm:gap-4">
      {/* Play / Pause / Stop Controls & Timer */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <Button
          size="icon"
          className={cn(
            "h-11 w-11 sm:h-12 sm:w-12 rounded-xl transition-transform active:scale-95 shadow-lg cursor-pointer",
            isPlaying 
              ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/25" 
              : "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/25"
          )}
          onClick={() => (isPlaying ? pause() : play())}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? <Pause className="size-5 sm:size-6 fill-current" /> : <Play className="size-5 sm:size-6 fill-current ml-0.5" />}
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl border-zinc-800 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
          onClick={() => seek(0)}
          title="Stop & Rewind to Start"
        >
          <Square className="size-3.5 sm:size-4 fill-current" />
        </Button>

        {/* Timecode Readout */}
        <div className="flex flex-col bg-zinc-900 border border-zinc-800/80 px-3 py-1 rounded-xl">
          <span className="text-sm sm:text-base font-mono font-bold text-zinc-100 tracking-wider">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono text-zinc-500">
            <span>TOTAL: {formatTime(duration)}</span>
            <span>•</span>
            <span className="text-cyan-400 font-bold">{timeSignature || '4/4'}</span>
          </div>
        </div>
      </div>

      {/* Center Group: Tempo & Pitch Controllers */}
      <div className="flex items-center gap-4 sm:gap-6 bg-zinc-900/60 border border-zinc-800/60 px-3.5 sm:px-5 py-2 rounded-xl flex-1 min-w-[280px] max-w-xl">
        {/* Tempo Shifter (Speed) */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-zinc-400 font-medium text-[11px] sm:text-xs">
              <Gauge className="size-3 text-amber-400" />
              <span>TEMPO</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="font-mono text-[9px] sm:text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 px-1 py-0">
                {currentBpm} BPM ({Math.round(playbackRate * 100)}%)
              </Badge>
              {playbackRate !== 1.0 && (
                <button
                  onClick={() => setPlaybackRate(1.0)}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  title="Reset Tempo to 100%"
                >
                  <RotateCcw className="size-2.5" />
                </button>
              )}
            </div>
          </div>
          <Slider
            value={[playbackRate * 100]}
            min={50}
            max={150}
            step={1}
            onValueChange={(v) => setPlaybackRate(getSingleValue(v, 100) / 100)}
            className="cursor-pointer"
          />
        </div>

        <div className="h-7 w-px bg-zinc-800" />

        {/* Pitch Transposer (Key Shift & Dynamic Key Readout) */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-zinc-400 font-medium text-[11px] sm:text-xs">
              <Music2 className="size-3 text-violet-400" />
              <span>KEY / PITCH</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="font-mono text-[9px] sm:text-[10px] bg-violet-500/10 text-violet-400 border-violet-500/30 px-1.5 py-0 flex items-center gap-1">
                <span className="font-bold">{currentKey}</span>
                {pitchSemitones !== 0 && (
                  <span className="text-[9px] opacity-80">({pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST)</span>
                )}
              </Badge>
              {pitchSemitones !== 0 && (
                <button
                  onClick={() => setPitchSemitones(0)}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  title="Reset Key to Original"
                >
                  <RotateCcw className="size-2.5" />
                </button>
              )}
            </div>
          </div>
          <Slider
            value={[pitchSemitones]}
            min={-6}
            max={6}
            step={1}
            onValueChange={(v) => setPitchSemitones(getSingleValue(v, 0))}
            className="cursor-pointer"
          />
        </div>
      </div>

      {/* Right Practice Toggles: Loop, Metronome, and Reset All */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          variant={loopEnabled ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl font-medium gap-1.5 text-xs transition-all cursor-pointer",
            loopEnabled 
              ? "bg-cyan-500 text-zinc-950 font-bold hover:bg-cyan-400 shadow-lg shadow-cyan-500/20" 
              : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          )}
          onClick={() => setLoop(!loopEnabled)}
        >
          <Repeat className="size-3.5" />
          <span className="hidden sm:inline">A-B LOOP</span>
          <span className="sm:hidden">LOOP</span>
        </Button>

        <Button
          variant={metronomeEnabled ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl font-medium gap-1.5 text-xs transition-all cursor-pointer",
            metronomeEnabled 
              ? "bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 shadow-lg shadow-amber-500/20" 
              : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          )}
          onClick={() => toggleMetronome()}
        >
          <Bell className="size-3.5" />
          <span>CLICK</span>
        </Button>
      </div>
    </div>
  );
}
