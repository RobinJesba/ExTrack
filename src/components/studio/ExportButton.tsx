'use client';

import React from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Loader2, ChevronDown, Repeat, Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ExportButton() {
  const {
    isExporting,
    exportMix,
    loopEnabled,
    loopStart,
    loopEnd,
    isLoading,
    playbackRate,
    pitchSemitones,
  } = useStudioStore();

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const hasActiveLoop = loopEnabled && loopEnd > loopStart;

  if (isExporting) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="h-9 px-2.5 sm:px-3 rounded-xl border-zinc-800 bg-zinc-900/90 text-zinc-400 text-xs font-medium flex items-center gap-1.5 cursor-wait"
      >
        <Loader2 className="size-3.5 animate-spin text-cyan-400" />
        <span>Exporting...</span>
      </Button>
    );
  }

  // When A-B loop is enabled, offer choice between Full Song and Loop Region
  if (hasActiveLoop) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              className={cn(
                "h-9 px-2.5 sm:px-3 rounded-xl border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer",
                "hover:border-cyan-500/40 hover:text-cyan-400"
              )}
            />
          }
        >
          <Download className="size-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Export Mix</span>
          <ChevronDown className="size-3 text-zinc-400 ml-0.5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-zinc-800 text-zinc-100 p-1.5 rounded-xl shadow-xl">
          <DropdownMenuLabel className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 px-2 py-1">
            Export Mix (WAV 16-Bit)
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5 text-[11px] text-zinc-400">
            Current: {Math.round(playbackRate * 100)}% Speed
            {pitchSemitones !== 0 && ` • ${pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST`}
          </div>

          <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />

          <DropdownMenuItem
            onClick={() => exportMix('full')}
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs hover:bg-zinc-800/80 cursor-pointer focus:bg-zinc-800"
          >
            <Disc3 className="size-4 text-cyan-400" />
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-200">Full Track Mix</span>
              <span className="text-[10px] text-zinc-400">Export complete song duration</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => exportMix('loop')}
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs hover:bg-zinc-800/80 cursor-pointer focus:bg-zinc-800"
          >
            <Repeat className="size-4 text-amber-400" />
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-200">Active Loop Region</span>
              <span className="text-[10px] text-zinc-400">
                Only {formatSec(loopStart)} - {formatSec(loopEnd)}
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Standard Full Song Export
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isLoading}
      onClick={() => exportMix('full')}
      title="Download current mix as lossless 16-bit WAV"
      className={cn(
        "h-9 px-2.5 sm:px-3 rounded-xl border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer",
        "hover:border-cyan-500/40 hover:text-cyan-400"
      )}
    >
      <Download className="size-3.5 text-cyan-400" />
      <span className="hidden sm:inline">Export Mix</span>
      <span className="sm:hidden">Export</span>
    </Button>
  );
}
