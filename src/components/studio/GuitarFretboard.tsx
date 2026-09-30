'use client';

import React from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Guitar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const NUM_FRETS = 12;

export function GuitarFretboard() {
  const { activeChord } = useStudioStore();

  const fretboard = activeChord?.guitarFretboard || {
    frets: ['x', 'x', 'x', 'x', 'x', 'x'] as (number | 'x')[],
    fingers: [null, null, null, null, null, null] as (number | null)[],
    barreFret: undefined
  };

  // String order in fretboard array is standard 6 to 1: [Low E, A, D, G, B, High E]
  // In UI rendering from top to bottom: High E (1), B (2), G (3), D (4), A (5), Low E (6)
  const renderedStrings = [
    { stringNum: 1, name: 'e', arrayIdx: 5 },
    { stringNum: 2, name: 'B', arrayIdx: 4 },
    { stringNum: 3, name: 'G', arrayIdx: 3 },
    { stringNum: 4, name: 'D', arrayIdx: 2 },
    { stringNum: 5, name: 'A', arrayIdx: 1 },
    { stringNum: 6, name: 'E', arrayIdx: 0 }
  ];

  const inlays = [3, 5, 7, 9, 12];

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Guitar className="size-4 text-violet-400" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
            Guitar Fretboard Guide
          </h3>
        </div>

        {activeChord && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">CHORD:</span>
            <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40 text-sm font-mono font-bold px-2.5 py-0.5">
              {activeChord.name}
            </Badge>
          </div>
        )}
      </div>

      {/* SVG Fretboard Container */}
      <div className="relative w-full overflow-x-auto py-3 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-xl p-4 shadow-inner">
        <div className="min-w-[640px] flex flex-col">
          {/* Fret Numbers Header */}
          <div className="grid grid-cols-13 text-[10px] font-mono text-zinc-500 mb-1.5 text-center">
            <div className="w-10">NUT</div>
            {Array.from({ length: NUM_FRETS }).map((_, i) => (
              <div key={i} className="flex-1 font-semibold text-zinc-400">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Fretboard Surface */}
          <div className="relative border-t-2 border-b-2 border-zinc-700/60 bg-zinc-900/90 rounded-sm">
            {/* Nut Vertical Bar */}
            <div className="absolute left-10 top-0 bottom-0 w-2.5 bg-amber-200/40 border-r-2 border-zinc-950 shadow-md z-10" />

            {/* Fret Vertical Wires */}
            <div className="absolute left-12 right-0 top-0 bottom-0 grid grid-cols-12 pointer-events-none">
              {Array.from({ length: NUM_FRETS }).map((_, i) => (
                <div key={i} className="border-r border-zinc-700/70 relative h-full">
                  {/* Position Inlay Dots */}
                  {inlays.includes(i + 1) && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-1/2 translate-x-1/2 pointer-events-none">
                      {i + 1 === 12 ? (
                        <div className="flex flex-col gap-2">
                          <div className="size-2 rounded-full bg-zinc-600/60" />
                          <div className="size-2 rounded-full bg-zinc-600/60" />
                        </div>
                      ) : (
                        <div className="size-2.5 rounded-full bg-zinc-600/50" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Render 6 Strings */}
            <div className="flex flex-col relative z-20 py-2">
              {renderedStrings.map((s, stringIdx) => {
                const fretVal = fretboard.frets[s.arrayIdx];
                const fingerVal = fretboard.fingers[s.arrayIdx];
                const isMuted = fretVal === 'x';
                const isOpen = fretVal === 0;
                const isFretted = typeof fretVal === 'number' && fretVal > 0;

                // String gauge thickness
                const stringThickness = 1 + (stringIdx * 0.45);

                return (
                  <div key={s.stringNum} className="relative h-7 flex items-center">
                    {/* String Line */}
                    <div
                      className="absolute left-0 right-0 bg-gradient-to-r from-zinc-400 via-zinc-300 to-zinc-500 shadow-sm opacity-70"
                      style={{ height: `${stringThickness}px` }}
                    />

                    {/* String Name & Nut Status */}
                    <div className="w-10 flex items-center justify-between px-1 z-30">
                      <span className="text-[11px] font-mono font-bold text-zinc-400">{s.name}</span>
                      {isMuted ? (
                        <span className="text-[11px] font-bold font-mono text-rose-500">✕</span>
                      ) : isOpen ? (
                        <span className="text-[11px] font-bold font-mono text-cyan-400">○</span>
                      ) : (
                        <span className="text-[11px] text-zinc-600">•</span>
                      )}
                    </div>

                    {/* Frets for this string */}
                    <div className="flex-1 grid grid-cols-12 relative z-30 h-full pl-2">
                      {Array.from({ length: NUM_FRETS }).map((_, fIdx) => {
                        const currentFret = fIdx + 1;
                        const isNoteHere = isFretted && fretVal === currentFret;

                        return (
                          <div key={fIdx} className="flex items-center justify-center relative">
                            {isNoteHere && (
                              <div
                                className={cn(
                                  "size-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shadow-lg transition-transform animate-in zoom-in-50",
                                  fingerVal === 1 
                                    ? "bg-cyan-500 text-zinc-950 shadow-cyan-500/50" 
                                    : "bg-violet-500 text-white shadow-violet-500/50"
                                )}
                              >
                                {fingerVal || '•'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend & Instructions */}
      <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-cyan-500" />
            <span>Index (1)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-violet-500" />
            <span>Fingers (2, 3, 4)</span>
          </span>
          <span className="flex items-center gap-1 text-cyan-400">
            <span>○ Open</span>
          </span>
          <span className="flex items-center gap-1 text-rose-400">
            <span>✕ Mute</span>
          </span>
        </div>
        <span>Standard Tuning (E A D G B E)</span>
      </div>
    </div>
  );
}
