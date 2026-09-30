'use client';

import React from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Activity, Zap, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Standard 4-string Bass Guitar Setup
// String 1 (highest): G2 (MIDI 43, 98.0 Hz)
// String 2: D2 (MIDI 38, 73.4 Hz)
// String 3: A1 (MIDI 33, 55.0 Hz)
// String 4 (lowest): E1 (MIDI 28, 41.2 Hz)
const STRINGS_4 = [
  { index: 1, name: 'G', midi: 43, freq: 98.0, gauge: 'h-[1.5px]' },
  { index: 2, name: 'D', midi: 38, freq: 73.4, gauge: 'h-[2.5px]' },
  { index: 3, name: 'A', midi: 33, freq: 55.0, gauge: 'h-[3.5px]' },
  { index: 4, name: 'E', midi: 28, freq: 41.2, gauge: 'h-[4.5px]' }
];

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];
const TOTAL_FRETS = 24;

export function BassFretboard() {
  const { track, currentTime, activeBassNote, seek } = useStudioStore();

  const bassNotes = track?.bass_notes || [];
  
  // Find upcoming notes within the next 4.5 seconds
  const upcomingNotes = bassNotes
    .filter(n => n.start_time > currentTime && n.start_time <= currentTime + 4.5)
    .slice(0, 8);

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4 overflow-hidden">
      {/* Header with Fixed Height (Prevents vertical layout shift) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 pb-3 min-h-[48px]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30 shrink-0">
            <Activity className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 leading-tight">
              Bass Guitar Real-Time Note Tracker
            </h3>
            <p className="text-[10px] font-mono text-zinc-500">
              Standard 4-String E-A-D-G • 24-Fret Long Scale (34&quot;)
            </p>
          </div>
        </div>

        {/* Live Note Badge with strict fixed height (h-8) */}
        <div className="flex items-center h-8">
          {activeBassNote ? (
            <div className="flex items-center gap-2 bg-violet-950/70 border border-violet-500/50 px-3 h-8 rounded-xl shadow-[0_0_15px_rgba(139,92,246,0.25)]">
              <span className="text-[10px] font-mono text-violet-400 uppercase tracking-widest font-semibold">
                NOTE:
              </span>
              <span className="text-sm font-black font-mono text-violet-200">
                {activeBassNote.note_name}
              </span>
              <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-700">
                {activeBassNote.frequency} Hz
              </span>
              {Boolean(activeBassNote.is_slide) && (
                <span className="text-[10px] font-mono text-cyan-300 font-extrabold bg-cyan-950/90 px-2 py-0.5 rounded border border-cyan-500/50 flex items-center gap-1 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.4)]">
                  <span>SLIDE {activeBassNote.slide_direction === 'up' ? '↗' : '↘'}</span>
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono bg-zinc-900/60 border border-zinc-800 px-3 h-8 rounded-xl">
              <Volume2 className="size-3.5 text-zinc-600" />
              <span className="text-[11px]">Rest / Inactive</span>
            </div>
          )}
        </div>
      </div>

      {/* 24-Fret Bass Fretboard Canvas */}
      <div className="overflow-x-auto pb-1 no-scrollbar">
        <div className="min-w-[900px] bg-gradient-to-b from-[#241c19] via-[#1a1412] to-[#120e0d] border border-amber-950/60 rounded-xl p-4 shadow-inner relative select-none">
          
          {/* Fret Markers Row (Top) */}
          <div className="grid grid-cols-[38px_repeat(24,1fr)] mb-1 text-center font-mono text-[9px] text-amber-200/40">
            <div>NUT</div>
            {Array.from({ length: TOTAL_FRETS }).map((_, i) => (
              <div key={i} className="font-semibold">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Fretboard Surface with 4 Strings */}
          <div className="relative border-y border-amber-900/40 py-2">
            
            {/* Frets & Inlay Background Grid */}
            <div className="absolute inset-0 grid grid-cols-[38px_repeat(24,1fr)] pointer-events-none">
              {/* Nut */}
              <div className="border-r-4 border-amber-100/70 bg-amber-100/10 shadow-[2px_0_6px_rgba(254,243,199,0.2)]" />
              
              {/* Frets 1 to 24 */}
              {Array.from({ length: TOTAL_FRETS }).map((_, i) => {
                const fretNum = i + 1;
                const isSingleInlay = INLAYS.includes(fretNum);
                const isDoubleInlay = DOUBLE_INLAYS.includes(fretNum);

                return (
                  <div
                    key={i}
                    className="border-r border-zinc-500/40 relative flex items-center justify-center"
                  >
                    {isSingleInlay && (
                      <div className="size-2.5 rounded-full bg-amber-100/25 shadow-sm border border-amber-100/40" />
                    )}
                    {isDoubleInlay && (
                      <div className="flex flex-col gap-3">
                        <div className="size-2 rounded-full bg-amber-100/30 shadow-sm border border-amber-100/50" />
                        <div className="size-2 rounded-full bg-amber-100/30 shadow-sm border border-amber-100/50" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 4 Bass Strings with Gauges */}
            <div className="relative z-10 flex flex-col gap-6 py-2">
              {STRINGS_4.map((str) => {
                const isActiveOnThisString = Boolean(activeBassNote && activeBassNote.string_index === str.index);
                const activeFret = isActiveOnThisString && activeBassNote ? activeBassNote.fret_number : -1;
                const isSlide = isActiveOnThisString && Boolean(activeBassNote?.is_slide);
                const slideFrom = isSlide && activeBassNote?.slide_from_fret !== undefined ? activeBassNote.slide_from_fret : -1;

                return (
                  <div key={str.index} className="relative flex items-center h-4">
                    {/* Open String Label (Headstock) */}
                    <div className="w-[38px] flex-shrink-0 flex items-center justify-center">
                      <span className="font-mono font-bold text-xs text-amber-300/80 bg-zinc-950/80 px-1.5 py-0.5 rounded border border-amber-500/20">
                        {str.name}
                      </span>
                    </div>

                    {/* Steel Wound String Wire */}
                    <div className="flex-1 relative flex items-center">
                      <div
                        className={cn(
                          "w-full rounded-full transition-all duration-100 shadow-md",
                          str.gauge,
                          isSlide
                            ? "bg-gradient-to-r from-cyan-400 via-violet-300 to-cyan-400 shadow-[0_0_14px_#06b6d4]"
                            : isActiveOnThisString
                            ? "bg-gradient-to-r from-violet-400 via-violet-200 to-violet-400 shadow-[0_0_10px_#a78bfa]"
                            : "bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 opacity-70"
                        )}
                      />

                      {/* 24 Fret Positions overlay */}
                      <div className="absolute inset-0 grid grid-cols-[repeat(24,minmax(0,1fr))]">
                        {Array.from({ length: TOTAL_FRETS }).map((_, fIdx) => {
                          const fretNum = fIdx + 1;
                          const isNoteHere = activeFret === fretNum;
                          const isInSlideRange = isSlide && slideFrom >= 0 && (
                            (fretNum >= Math.min(slideFrom, activeFret) && fretNum <= Math.max(slideFrom, activeFret))
                          );

                          return (
                            <div
                              key={fIdx}
                              className="relative flex items-center justify-center h-full"
                            >
                              {/* Glowing Slide Range Rail */}
                              {isInSlideRange && !isNoteHere && (
                                <div className="absolute inset-y-1 inset-x-0 bg-cyan-500/20 border-y border-cyan-400/40 rounded-sm shadow-[0_0_8px_rgba(6,182,212,0.3)] animate-pulse" />
                              )}

                              {isNoteHere && activeBassNote && (
                                <div className="absolute z-20 flex items-center justify-center pointer-events-none">
                                  <div className={cn(
                                    "size-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black font-mono text-white transition-all transform scale-110",
                                    isSlide
                                      ? "bg-gradient-to-tr from-cyan-500 to-violet-600 shadow-[0_0_20px_#06b6d4]"
                                      : "bg-violet-600 shadow-[0_0_16px_#8b5cf6]"
                                  )}>
                                    {activeBassNote.note_name}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Open String Note Marker (Fret 0) */}
                      {activeFret === 0 && (
                        <div className="absolute -left-2 z-20 flex items-center justify-center pointer-events-none">
                          <div className="size-6 rounded-full bg-violet-500 border-2 border-white shadow-[0_0_16px_#8b5cf6] flex items-center justify-center text-[10px] font-black font-mono text-white">
                            0
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>

      {/* Upcoming Bass Notes Trail (Fixed Height - Never collapses or jumps) */}
      <div className="flex flex-col gap-1.5 border-t border-zinc-800/60 pt-3 min-h-[58px]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
          <Zap className="size-3.5 text-violet-400" />
          <span>Upcoming Bassline Progression:</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar h-8">
          {upcomingNotes.length > 0 ? (
            upcomingNotes.map((note) => {
              const delta = Math.max(0, note.start_time - currentTime);
              return (
                <button
                  key={note.id}
                  onClick={() => seek(note.start_time)}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-2 px-2.5 h-7 rounded-lg text-xs font-mono transition-all cursor-pointer group border",
                    note.is_slide
                      ? "bg-cyan-950/40 border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-900/50 shadow-[0_0_8px_rgba(6,182,212,0.15)]"
                      : "bg-zinc-900/90 border-zinc-800 hover:border-violet-500/50 hover:bg-violet-950/30"
                  )}
                >
                  <span className={cn(
                    "font-bold",
                    note.is_slide ? "text-cyan-300 group-hover:text-cyan-200" : "text-violet-300 group-hover:text-violet-200"
                  )}>
                    {note.note_name}
                  </span>
                  {Boolean(note.is_slide) && (
                    <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/40">
                      slide {note.slide_direction === 'up' ? '↗' : '↘'}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    +{delta.toFixed(1)}s
                  </span>
                </button>
              );
            })
          ) : (
            <span className="text-xs font-mono text-zinc-600 italic">
              No notes in the next 4 seconds
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
