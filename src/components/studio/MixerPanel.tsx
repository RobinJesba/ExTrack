'use client';

import React from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { StemType } from '@/lib/audio/StemPlayer';
import { Mic, Drum, Guitar, Music, Volume2, Sliders, RotateCcw, Piano } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StemMeta {
  type: StemType;
  label: string;
  icon: React.ElementType;
  color: string;
  glowClass: string;
  badgeBg: string;
}

const ALL_STEM_METAS: StemMeta[] = [
  {
    type: 'vocals',
    label: 'Vocals',
    icon: Mic,
    color: '#06b6d4', // Cyan
    glowClass: 'shadow-[0_0_15px_rgba(6,182,212,0.35)] border-cyan-500/40',
    badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
  },
  {
    type: 'drums',
    label: 'Drums',
    icon: Drum,
    color: '#f59e0b', // Amber
    glowClass: 'shadow-[0_0_15px_rgba(245,158,11,0.35)] border-amber-500/40',
    badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  },
  {
    type: 'bass',
    label: 'Bass',
    icon: Guitar,
    color: '#8b5cf6', // Violet
    glowClass: 'shadow-[0_0_15px_rgba(139,92,246,0.35)] border-violet-500/40',
    badgeBg: 'bg-violet-500/10 text-violet-400 border-violet-500/30'
  },
  {
    type: 'guitar',
    label: 'Guitar',
    icon: Guitar,
    color: '#f43f5e', // Rose
    glowClass: 'shadow-[0_0_15px_rgba(244,63,94,0.35)] border-rose-500/40',
    badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
  },
  {
    type: 'piano',
    label: 'Piano',
    icon: Piano,
    color: '#0ea5e9', // Sky Blue
    glowClass: 'shadow-[0_0_15px_rgba(14,165,233,0.35)] border-sky-500/40',
    badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
  },
  {
    type: 'other',
    label: 'Other / Synth',
    icon: Music,
    color: '#10b981', // Emerald
    glowClass: 'shadow-[0_0_15px_rgba(16,185,129,0.35)] border-emerald-500/40',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  }
];

function getSingleValue(val: number | readonly number[] | undefined, defaultVal: number = 0): number {
  if (typeof val === 'number') return val;
  if (Array.isArray(val) || (val && typeof (val as readonly number[])[0] === 'number')) {
    return (val as readonly number[])[0];
  }
  return defaultVal;
}

interface BipolarPanSliderProps {
  value: number; // -1 to +1 (0 is center)
  onChange: (val: number) => void;
  className?: string;
  disabled?: boolean;
}

function BipolarPanSlider({ value, onChange, className, disabled }: BipolarPanSliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !trackRef.current) return;
    const track = trackRef.current;
    track.setPointerCapture(e.pointerId);

    const updateFromPointer = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      let pan = (ratio - 0.5) * 2;
      // Snap to exact center when close to center deadzone
      if (Math.abs(pan) < 0.08) pan = 0;
      onChange(Math.round(pan * 100) / 100);
    };

    updateFromPointer(e.clientX);

    const handlePointerMove = (ev: PointerEvent) => {
      updateFromPointer(ev.clientX);
    };

    const handlePointerUp = (ev: PointerEvent) => {
      try {
        track.releasePointerCapture(ev.pointerId);
      } catch {}
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleDoubleClick = () => {
    if (disabled) return;
    onChange(0);
  };

  const percent = (value * 0.5 + 0.5) * 100;
  const isLeft = value < 0;
  const isRight = value > 0;
  const fillLeft = isLeft ? `${percent}%` : '50%';
  const fillWidth = isLeft ? `${(0 - value) * 50}%` : isRight ? `${value * 50}%` : '0%';

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      title="Stereo Pan (Double click to reset to Center)"
      className={cn(
        "relative h-4 w-full flex items-center cursor-pointer select-none touch-none group",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {/* Background Track */}
      <div className="relative w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
        {/* Center-originated bidirectional fill */}
        <div
          className="absolute h-full bg-cyan-400"
          style={{
            left: fillLeft,
            width: fillWidth
          }}
        />
      </div>

      {/* Center Notch Indicator (Tick) */}
      <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-2 bg-zinc-600 rounded-full pointer-events-none" />

      {/* Draggable Thumb Dot */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full bg-white border border-zinc-950 shadow-md shadow-black/80 group-hover:scale-125 active:scale-110 transition-transform pointer-events-none"
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

export function MixerPanel() {
  const {
    track,
    stemsConfig,
    vuLevels,
    setStemVolume,
    toggleStemMute,
    toggleStemSolo,
    setStemPan,
    resetStem,
    resetMixer,
    masterVolume,
    setMasterVolume
  } = useStudioStore();

  // Filter available stems dynamically based on what the track has (4-stem or 6-stem)
  const availableStems = ALL_STEM_METAS.filter(meta => {
    if (!track?.stems) return ['vocals', 'drums', 'bass', 'other'].includes(meta.type);
    return Boolean(track.stems[meta.type]);
  });

  const gridColsClass = availableStems.length > 4
    ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-cyan-400" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
            {availableStems.length}-Stem Isolation & Rehearsal Mixer
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Reset All Mixer Controls */}
          <Button
            size="sm"
            variant="outline"
            onClick={resetMixer}
            className="h-8 px-2.5 text-xs text-zinc-400 hover:text-zinc-100 border-zinc-800 hover:bg-zinc-800 rounded-lg gap-1.5 cursor-pointer"
            title="Reset All Faders, Mutes, Key & Tempo"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reset Mixer</span>
          </Button>

          {/* Master Output Level */}
          <div className="flex items-center gap-2.5 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <Volume2 className="size-4 text-zinc-400" />
            <span className="text-xs font-mono text-zinc-400 uppercase hidden sm:inline">Master</span>
            <div className="w-20 sm:w-24">
              <Slider
                value={[masterVolume * 100]}
                min={0}
                max={150}
                step={1}
                onValueChange={(val) => setMasterVolume(getSingleValue(val, 100) / 100)}
              />
            </div>
            <span className="text-xs font-mono text-zinc-200 w-8 text-right">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Stems Responsive Grid */}
      <div className={cn("grid gap-3", gridColsClass)}>
        {availableStems.map((meta) => {
          const cfg = stemsConfig[meta.type] || { volume: 1.0, muted: false, soloed: false, pan: 0 };
          const vu = vuLevels[meta.type] || 0;
          const Icon = meta.icon;
          const isModified = cfg.volume !== 1.0 || cfg.pan !== 0 || cfg.muted || cfg.soloed;

          return (
            <div
              key={meta.type}
              className={cn(
                "flex flex-col gap-3 p-3.5 rounded-xl border bg-zinc-900/60 transition-all duration-200",
                cfg.soloed ? meta.glowClass : "border-zinc-800/70 hover:border-zinc-700/80"
              )}
            >
              {/* Stem Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "p-1.5 rounded-lg border",
                      meta.badgeBg
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-200 tracking-tight">{meta.label}</div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {cfg.muted ? 'MUTED' : cfg.soloed ? 'SOLO' : `${Math.round(cfg.volume * 100)}%`}
                    </div>
                  </div>
                </div>

                {/* Reset & Mute / Solo Buttons */}
                <div className="flex items-center gap-1">
                  {isModified && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resetStem(meta.type)}
                      className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg cursor-pointer"
                      title={`Reset ${meta.label} channel`}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant={cfg.muted ? "destructive" : "outline"}
                    className={cn(
                      "h-7 w-7 p-0 text-[11px] font-bold font-mono transition-colors cursor-pointer",
                      cfg.muted ? "bg-rose-600 text-white hover:bg-rose-700" : "text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800"
                    )}
                    onClick={() => toggleStemMute(meta.type)}
                    title={`Mute ${meta.label} (Minus-One)`}
                  >
                    M
                  </Button>
                  <Button
                    size="sm"
                    variant={cfg.soloed ? "default" : "outline"}
                    className={cn(
                      "h-7 w-7 p-0 text-[11px] font-bold font-mono transition-colors cursor-pointer",
                      cfg.soloed 
                        ? "bg-amber-500 text-zinc-950 font-black hover:bg-amber-400" 
                        : "text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800"
                    )}
                    onClick={() => toggleStemSolo(meta.type)}
                    title={`Solo ${meta.label}`}
                  >
                    S
                  </Button>
                </div>
              </div>

              {/* Volume Slider & VU Meter Bar */}
              <div className="flex items-center gap-2.5">
                <div className="flex-1">
                  <Slider
                    value={[cfg.volume * 100]}
                    min={0}
                    max={150}
                    step={1}
                    disabled={cfg.muted}
                    onValueChange={(val) => setStemVolume(meta.type, getSingleValue(val, 100) / 100)}
                    className="cursor-pointer"
                  />
                </div>

                {/* Real-time Dynamic Peak Level Meter */}
                <div className="w-2.5 h-7 bg-zinc-950 rounded-full border border-zinc-800 overflow-hidden flex flex-col justify-end p-0.5">
                  <div
                    className="w-full rounded-full transition-all duration-75"
                    style={{
                      height: `${Math.min(100, Math.round(vu * 100))}%`,
                      backgroundColor: meta.color,
                      boxShadow: `0 0 8px ${meta.color}`
                    }}
                  />
                </div>
              </div>

              {/* Stereo Pan Control */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50 text-[10px] text-zinc-500 font-mono">
                <span className="text-zinc-400">PAN</span>
                <div className="w-24">
                  <BipolarPanSlider
                    value={cfg.pan}
                    disabled={cfg.muted}
                    onChange={(val) => setStemPan(meta.type, val)}
                  />
                </div>
                <span className="w-6 text-right font-mono text-zinc-400">
                  {cfg.pan === 0 ? 'C' : cfg.pan < 0 ? `L${Math.abs(Math.round(cfg.pan * 100))}` : `R${Math.round(cfg.pan * 100)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
