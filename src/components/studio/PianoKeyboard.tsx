'use client';

import React from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Piano } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Generate 3 Octaves (C3 to B5)
const OCTAVES = [3, 4, 5];

interface KeyDef {
  note: string;
  octave: number;
  fullNote: string;
  isBlack: boolean;
  midi: number;
}

export function PianoKeyboard() {
  const { activeChord } = useStudioStore();

  const voicedKeys = activeChord?.voicedKeys || [];
  const rootNote = activeChord?.root?.toUpperCase() || '';

  // Build key definitions for 3 octaves
  const keys: KeyDef[] = [];
  const noteOffsets: Record<string, number> = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4,
    'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  };

  OCTAVES.forEach((oct) => {
    const baseMidi = 12 * (oct + 1);
    const pattern = [
      { note: 'C', isBlack: false },
      { note: 'C#', isBlack: true },
      { note: 'D', isBlack: false },
      { note: 'D#', isBlack: true },
      { note: 'E', isBlack: false },
      { note: 'F', isBlack: false },
      { note: 'F#', isBlack: true },
      { note: 'G', isBlack: false },
      { note: 'G#', isBlack: true },
      { note: 'A', isBlack: false },
      { note: 'A#', isBlack: true },
      { note: 'B', isBlack: false }
    ];

    pattern.forEach(p => {
      keys.push({
        note: p.note,
        octave: oct,
        fullNote: `${p.note}${oct}`,
        isBlack: p.isBlack,
        midi: baseMidi + noteOffsets[p.note]
      });
    });
  });

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Piano className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
            Interactive Piano Keyboard
          </h3>
          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">(Single-Octave Voicing)</span>
        </div>

        {activeChord && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">VOICING:</span>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-sm font-mono font-bold px-2.5 py-0.5">
              {activeChord.name}
            </Badge>
          </div>
        )}
      </div>

      {/* Piano Keyboard Surface */}
      <div className="w-full overflow-x-auto py-3 bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 sm:p-4 shadow-inner">
        <div className="relative h-40 sm:h-44 min-w-[620px] flex select-none">
          {/* White Keys */}
          <div className="flex w-full h-full">
            {keys.filter(k => !k.isBlack).map((k) => {
              const isActive = voicedKeys.includes(k.fullNote);
              const isRoot = isActive && rootNote === k.note;

              return (
                <div
                  key={k.fullNote}
                  className={cn(
                    "flex-1 h-full border border-zinc-700/80 rounded-b-md flex flex-col justify-end items-center pb-2 transition-all duration-150 relative",
                    isActive
                      ? isRoot
                        ? "bg-cyan-400 text-zinc-950 shadow-[0_0_15px_rgba(6,182,212,0.7)] font-black"
                        : "bg-emerald-400 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.6)] font-bold"
                      : "bg-gradient-to-b from-zinc-100 to-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  )}
                >
                  <span className="text-[10px] font-mono font-bold tracking-tight">
                    {k.note}{k.note === 'C' ? k.octave : ''}
                  </span>
                  {isActive && (
                    <div className="size-1.5 rounded-full bg-zinc-950 mt-1" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Black Keys */}
          <div className="absolute inset-0 flex pointer-events-none">
            {keys.map((k) => {
              if (!k.isBlack) return null;

              const octaveIdx = OCTAVES.indexOf(k.octave);
              const whiteIndexInOctave: Record<string, number> = {
                'C#': 0.65,
                'D#': 1.65,
                'F#': 3.65,
                'G#': 4.65,
                'A#': 5.65
              };

              const totalWhiteIndex = (octaveIdx * 7) + whiteIndexInOctave[k.note];
              const leftPercent = (totalWhiteIndex / 21) * 100;
              const widthPercent = (1 / 21) * 60; // 60% width of white key

              const isActive = voicedKeys.includes(k.fullNote);
              const isRoot = isActive && rootNote === k.note;

              return (
                <div
                  key={k.fullNote}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`
                  }}
                  className={cn(
                    "absolute top-0 h-[60%] rounded-b-md border border-zinc-900 flex flex-col justify-end items-center pb-2 z-20 transition-all duration-150 shadow-md",
                    isActive
                      ? isRoot
                        ? "bg-cyan-500 text-zinc-950 shadow-[0_0_15px_rgba(6,182,212,0.9)]"
                        : "bg-emerald-500 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
                      : "bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-400"
                  )}
                >
                  <span className="text-[9px] font-mono font-bold">
                    {k.note}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 font-mono gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-cyan-400" />
            <span className="text-zinc-400">Root Note</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-400">Voiced Chord Tones</span>
          </span>
        </div>
        <span>Octave 4 Voicing</span>
      </div>
    </div>
  );
}
