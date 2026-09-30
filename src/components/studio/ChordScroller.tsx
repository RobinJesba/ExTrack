'use client';

import React, { useRef, useEffect } from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { transposeChord } from '@/lib/music/chordTheory';
import { Sparkles, Music, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChordScroller() {
  const {
    track,
    currentTime,
    activeChordIndex,
    pitchSemitones,
    chordProgressPercent,
    chordComplexity,
    setChordComplexity,
    seek,
    activeChord
  } = useStudioStore();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active chord into center view
  useEffect(() => {
    if (scrollerRef.current && activeChordIndex >= 0) {
      const activeEl = scrollerRef.current.children[activeChordIndex] as HTMLElement;
      if (activeEl) {
        const container = scrollerRef.current;
        const scrollLeft = activeEl.offsetLeft - (container.clientWidth / 2) + (activeEl.clientWidth / 2);
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [activeChordIndex]);

  const chords = track?.chords || [];
  const nextChordObj = activeChordIndex >= 0 && activeChordIndex + 1 < chords.length ? chords[activeChordIndex + 1] : null;
  const nextChordRaw = nextChordObj ? ((chordComplexity === 'detailed' && nextChordObj.detailed_chord) ? nextChordObj.detailed_chord : nextChordObj.chord_name) : null;
  const nextChordTransposed = nextChordRaw ? transposeChord(nextChordRaw, pitchSemitones) : null;

  if (chords.length === 0) {
    return (
      <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-4 flex items-center justify-center text-zinc-500 text-xs">
        <Music className="size-4 mr-2" />
        No chord progression data available for this track.
      </div>
    );
  }

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
      {/* Header with Active Chord, Mode Switcher & Next Switch Preview */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Real-Time Chords
          </span>
          
          {/* Basic vs Detailed Complexity Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 ml-1">
            <button
              onClick={() => setChordComplexity('basic')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono rounded transition-all cursor-pointer",
                chordComplexity === 'basic'
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Basic
            </button>
            <button
              onClick={() => setChordComplexity('detailed')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono rounded transition-all cursor-pointer",
                chordComplexity === 'detailed'
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/40 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Detailed
            </button>
          </div>

          {pitchSemitones !== 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Transposed ({pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST)
            </span>
          )}
        </div>

        {/* Current & Upcoming Chord Info */}
        <div className="flex items-center gap-3 h-7">
          {nextChordTransposed && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg h-7">
              <span className="text-[10px] text-zinc-500 font-mono uppercase">Next:</span>
              <span className="font-bold font-mono text-zinc-200">{nextChordTransposed}</span>
              <ArrowRight className="size-3 text-cyan-400" />
            </div>
          )}

          {activeChord && activeChord.notes.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs h-7">
              <span className="text-zinc-500 font-mono text-[11px] hidden sm:inline">NOTES:</span>
              <div className="flex items-center gap-1">
                {activeChord.notes.map((note, i) => (
                  <span
                    key={i}
                    className={cn(
                      "px-1.5 py-0.5 rounded font-mono text-[10px] sm:text-[11px] font-bold border leading-none flex items-center",
                      i === 0 
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" 
                        : "bg-zinc-800 text-zinc-300 border-zinc-700"
                    )}
                  >
                    {note}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs h-7">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 uppercase leading-none flex items-center">
                Rest / Intro
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Scrolling Ribbon */}
      <div
        ref={scrollerRef}
        className="flex items-center gap-2.5 overflow-x-auto py-2.5 px-4 h-[84px] min-h-[84px] no-scrollbar scroll-smooth bg-zinc-900/60 border border-zinc-800/60 rounded-xl relative"
        style={{ scrollbarWidth: 'none' }}
      >
        {chords.map((chord, index) => {
          const isActive = index === activeChordIndex;
          const isPassed = currentTime > chord.end_time;
          const rawName = (chordComplexity === 'detailed' && chord.detailed_chord) ? chord.detailed_chord : chord.chord_name;
          const displayChord = transposeChord(rawName, pitchSemitones);

          return (
            <button
              key={chord.id || index}
              onClick={() => seek(chord.start_time)}
              className={cn(
                "flex-shrink-0 flex flex-col items-center justify-center px-4 py-1.5 h-[62px] min-w-[76px] rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden",
                isActive
                  ? "bg-gradient-to-b from-cyan-500/25 to-cyan-950/70 border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-105"
                  : isPassed
                  ? "bg-zinc-950/50 border-zinc-800/40 text-zinc-600 hover:border-zinc-700"
                  : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
              )}
            >
              <div className="h-6 flex items-center justify-center">
                <span className={cn(
                  "font-black font-mono tracking-tight leading-none",
                  isActive ? "text-base text-cyan-300" : "text-sm"
                )}>
                  {displayChord}
                </span>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 mt-0.5 leading-none">
                {Math.floor(chord.start_time / 60)}:{(chord.start_time % 60).toFixed(0).padStart(2, '0')}
              </span>

              {/* Exact Chord Switch Countdown Progress Bar */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950/80">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-75 shadow-[0_0_8px_#22d3ee]"
                    style={{ width: `${Math.round(chordProgressPercent * 100)}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
