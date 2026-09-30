'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStudioStore } from '@/lib/store/useStudioStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

export function WaveformLooper() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    currentTime,
    duration,
    loopEnabled,
    loopStart,
    loopEnd,
    track,
    seek,
    setLoop
  } = useStudioStore();

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate synthetic or precomputed waveform peaks for the visualization
  const [waveformPeaks] = useState<number[]>(() => {
    const count = 300;
    const peaks: number[] = [];
    for (let i = 0; i < count; i++) {
      // Dynamic musical contour
      const envelope = Math.sin((i / count) * Math.PI);
      const noise = 0.2 + 0.8 * Math.abs(Math.sin(i * 0.15) * Math.cos(i * 0.08) + (Math.random() * 0.1));
      peaks.push(Math.min(1.0, envelope * noise + 0.1));
    }
    return peaks;
  });

  // Render static background layer (beats, grid, inactive waveform bars, loop regions)
  const renderBackground = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCanvasRef.current;
    bgCanvas.width = mainCanvas.width;
    bgCanvas.height = mainCanvas.height;

    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;

    const width = bgCanvas.width;
    const height = bgCanvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw background grid lines (beats)
    if (track && track.beats.length > 0 && duration > 0) {
      ctx.lineWidth = 1;
      for (const beat of track.beats) {
        const x = (beat.timestamp / duration) * width;
        ctx.strokeStyle = beat.is_downbeat ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Draw A-B Loop Region Highlight
    if (loopEnabled && duration > 0 && loopEnd > loopStart) {
      const startX = (loopStart / duration) * width;
      const endX = (loopEnd / duration) * width;

      ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.fillRect(startX, 0, endX - startX, height);

      // Loop boundaries lines
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      // A Line
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();

      // B Line
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // Draw Inactive Waveform Bars
    const barWidth = width / waveformPeaks.length;
    ctx.fillStyle = 'rgba(113, 113, 122, 0.45)'; // Zinc neutral

    for (let i = 0; i < waveformPeaks.length; i++) {
      const x = i * barWidth;
      const peak = waveformPeaks[i];
      const barHeight = Math.max(3, peak * (height * 0.82));
      const topY = centerY - barHeight / 2;

      ctx.beginPath();
      ctx.roundRect(x + 0.5, topY, Math.max(1, barWidth - 1.5), barHeight, 2);
      ctx.fill();
    }
  }, [duration, loopEnabled, loopStart, loopEnd, track, waveformPeaks]);

  // Fast 60 FPS Composite Frame (Draws background + active overlay + playhead)
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw cached background layer
    if (bgCanvasRef.current) {
      ctx.drawImage(bgCanvasRef.current, 0, 0);
    }

    const playheadX = duration > 0 ? (currentTime / duration) * width : 0;

    // 2. Draw Active (Passed) Waveform Bars in glowing cyan
    if (playheadX > 0) {
      const barWidth = width / waveformPeaks.length;
      ctx.fillStyle = '#06b6d4'; // Glowing active cyan

      const activeBarCount = Math.min(waveformPeaks.length, Math.ceil(playheadX / barWidth));
      for (let i = 0; i < activeBarCount; i++) {
        const x = i * barWidth;
        const peak = waveformPeaks[i];
        const barHeight = Math.max(3, peak * (height * 0.82));
        const topY = centerY - barHeight / 2;

        ctx.beginPath();
        ctx.roundRect(x + 0.5, topY, Math.max(1, barWidth - 1.5), barHeight, 2);
        ctx.fill();
      }
    }

    // 3. Draw Current Playhead Line & Pointer
    if (duration > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Playhead Top Pointer
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();
    }
  }, [currentTime, duration, waveformPeaks]);

  // Sync canvas size and regenerate background on resize or loop change
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderBackground();
        drawWaveform();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderBackground, drawWaveform]);

  useEffect(() => {
    renderBackground();
  }, [renderBackground]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Click & Drag Scrubbing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || duration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * duration;

    // Check if clicked close to loop handles
    const startX = (loopStart / duration) * rect.width;
    const endX = (loopEnd / duration) * rect.width;

    if (loopEnabled && Math.abs(clickX - startX) < 15) {
      setDraggingHandle('start');
    } else if (loopEnabled && Math.abs(clickX - endX) < 15) {
      setDraggingHandle('end');
    } else {
      setIsDraggingPlayhead(true);
      seek(targetTime);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current || duration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const moveX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, moveX / rect.width));
    const targetTime = ratio * duration;

    if (isDraggingPlayhead) {
      seek(targetTime);
    } else if (draggingHandle === 'start') {
      setLoop(true, Math.min(targetTime, loopEnd - 0.5), loopEnd);
    } else if (draggingHandle === 'end') {
      setLoop(true, loopStart, Math.max(targetTime, loopStart + 0.5));
    }
  };

  const handlePointerUp = () => {
    setIsDraggingPlayhead(false);
    setDraggingHandle(null);
  };

  const setLoopPointA = () => {
    setLoop(true, currentTime, Math.max(currentTime + 2, loopEnd));
  };

  const setLoopPointB = () => {
    setLoop(true, Math.min(currentTime - 2, loopStart), currentTime);
  };

  const snapToNearestMeasure = () => {
    if (!track || track.beats.length === 0) return;
    const downbeats = track.beats.filter(b => b.is_downbeat);
    if (downbeats.length < 2) return;

    // Find nearest downbeat to current loopStart and loopEnd
    let bestStart = downbeats[0].timestamp;
    let bestEnd = downbeats[Math.min(4, downbeats.length - 1)].timestamp;

    for (const b of downbeats) {
      if (Math.abs(b.timestamp - loopStart) < Math.abs(bestStart - loopStart)) {
        bestStart = b.timestamp;
      }
      if (Math.abs(b.timestamp - loopEnd) < Math.abs(bestEnd - loopEnd)) {
        bestEnd = b.timestamp;
      }
    }
    if (bestEnd <= bestStart) bestEnd = bestStart + 4;
    setLoop(true, bestStart, bestEnd);
  };

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
      {/* Waveform Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Multi-Stem Waveform & Phrase Looper
          </span>
          {loopEnabled && (
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]">
              Looping ({loopStart.toFixed(1)}s - {loopEnd.toFixed(1)}s)
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] font-mono border-zinc-800 hover:bg-zinc-800 text-zinc-300"
            onClick={setLoopPointA}
          >
            [ Set A
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] font-mono border-zinc-800 hover:bg-zinc-800 text-zinc-300"
            onClick={setLoopPointB}
          >
            Set B ]
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-amber-400 hover:bg-amber-500/10 gap-1"
            onClick={snapToNearestMeasure}
            title="Snap A-B loop to musical measure grid"
          >
            <Sparkles className="size-3" />
            <span>Snap Bar</span>
          </Button>
        </div>
      </div>

      {/* Interactive Waveform Canvas Container */}
      <div
        ref={containerRef}
        className="relative w-full h-24 bg-zinc-900/90 border border-zinc-800/90 rounded-xl overflow-hidden cursor-pointer select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
}
