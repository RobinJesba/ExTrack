'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStudioStore, TrackData } from '@/lib/store/useStudioStore';
import { MixerPanel } from '@/components/studio/MixerPanel';
import { TransportBar } from '@/components/studio/TransportBar';
import { WaveformLooper } from '@/components/studio/WaveformLooper';
import { ChordScroller } from '@/components/studio/ChordScroller';
import { GuitarFretboard } from '@/components/studio/GuitarFretboard';
import { PianoKeyboard } from '@/components/studio/PianoKeyboard';
import { BassFretboard } from '@/components/studio/BassFretboard';
import { ExportButton } from '@/components/studio/ExportButton';
import { buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { detectSongKey } from '@/lib/music/chordTheory';
import {
  ArrowLeft,
  Sparkles,
  Guitar,
  Piano,
  Layers,
  Music4,
  Loader2,
  AlertCircle,
  Activity,
  CheckCircle2,
  Zap,
  Key
} from 'lucide-react';

interface ProgressMeta {
  stage?: string;
  stage_progress?: number;
  eta?: string;
  elapsed?: string;
  speed?: string;
  processed_audio?: string;
  device_label?: string;
}

export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { loadTrack, track, isLoading, loadingProgress, destroyPlayer, pitchSemitones, playbackRate } = useStudioStore();
  const [trackStatus, setTrackStatus] = useState<string>('LOADING');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Loading track data...');
  const [progressMeta, setProgressMeta] = useState<ProgressMeta | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'guitar' | 'piano' | 'bass'>('all');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Track if this session was an active processing session so we don't flash a 0% reload on complete
  const [wasProcessing, setWasProcessing] = useState(false);
  const hasInitiatedFetchRef = React.useRef(false);

  // Fetch track & handle SSE if still processing
  useEffect(() => {
    if (hasInitiatedFetchRef.current) return;
    hasInitiatedFetchRef.current = true;

    const abortController = new AbortController();
    let sse: EventSource | null = null;

    const fetchInitialData = async () => {
      try {
        const res = await fetch(`/api/tracks/${id}`, { signal: abortController.signal });
        if (!res.ok) {
          throw new Error('Track not found');
        }
        const data = await res.json();
        if (abortController.signal.aborted) return;
        const trk = data.track;

        if (trk.status === 'PROCESSING' || trk.status === 'PENDING') {
          setWasProcessing(true);
          setTrackStatus('PROCESSING');
          setProgressPercent(trk.progress || 10);
          setStatusMessage(trk.status_message || 'Separating stems in progress...');
          if (trk.progress_meta) {
            try {
              setProgressMeta(JSON.parse(trk.progress_meta));
            } catch {}
          }

          // Subscribe to SSE progress
          sse = new EventSource(`/api/tracks/${id}/progress`);
          sse.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              setProgressPercent(payload.progress);
              setStatusMessage(payload.status_message);
              if (payload.meta) {
                setProgressMeta(payload.meta);
              }

              if (payload.status === 'COMPLETED') {
                sse?.close();
                setProgressPercent(92);
                // Load stems in background while holding continuous progress
                fetchInitialData();
              } else if (payload.status === 'FAILED') {
                sse?.close();
                setTrackStatus('FAILED');
                setStatusMessage('AI stem separation failed.');
              }
            } catch {
              // ignore
            }
          };
        } else if (trk.status === 'COMPLETED') {
          setTrackStatus('COMPLETED');
          if (abortController.signal.aborted) return;
          await loadTrack(trk as TrackData);
        } else {
          setTrackStatus('FAILED');
          setStatusMessage(trk.status_message || 'Processing failed');
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError' || abortController.signal.aborted) return;
        setFetchError(err instanceof Error ? err.message : 'Error loading track');
        setTrackStatus('FAILED');
      }
    };

    fetchInitialData();

    return () => {
      abortController.abort();
      if (sse) sse.close();
      destroyPlayer();
    };
  }, [id, loadTrack, destroyPlayer]);

  if (trackStatus === 'PROCESSING' || trackStatus === 'PENDING' || (trackStatus === 'COMPLETED' && isLoading && wasProcessing)) {
    const isNewProcessing = trackStatus === 'PROCESSING' || trackStatus === 'PENDING' || wasProcessing;
    const curProgress = wasProcessing
      ? (trackStatus === 'PROCESSING' || trackStatus === 'PENDING'
          ? Math.min(92, Math.max(5, progressPercent))
          : Math.min(100, Math.max(92, Math.round(92 + (loadingProgress / 100) * 8))))
      : Math.max(5, loadingProgress);

    let phaseTitle = 'Loading Audio Stems';
    let phaseDetail = 'Decoding 6 stems into high-precision Web Audio buffers...';
    let phaseIcon = <Loader2 className="size-5 text-cyan-400 animate-spin" />;

    if (isNewProcessing) {
      if (curProgress < 15) {
        phaseTitle = 'Hardware Engine Initialization';
        phaseDetail = progressMeta?.device_label ? `${progressMeta.device_label} Active` : 'Setting up Apple Silicon Metal (MPS) acceleration pipeline...';
        phaseIcon = <Zap className="size-5 text-amber-400 animate-pulse" />;
      } else if (curProgress < 68) {
        phaseTitle = 'Neural 6-Stem Audio Separation';
        phaseDetail = statusMessage || 'Isolating Vocals, Drums, Bass, Guitar, Piano, and Other...';
        phaseIcon = <Layers className="size-5 text-cyan-400 animate-pulse" />;
      } else if (curProgress < 78) {
        phaseTitle = 'Transient Rhythm & Beat Grid';
        phaseDetail = 'Detecting downbeats, measure timing, and dynamic BPM...';
        phaseIcon = <Activity className="size-5 text-emerald-400 animate-pulse" />;
      } else if (curProgress < 86) {
        phaseTitle = '4-String Bass & Fretboard Tracking';
        phaseDetail = 'Extracting sub-bass frequencies, fret coordinates & legato slides...';
        phaseIcon = <Guitar className="size-5 text-amber-400 animate-pulse" />;
      } else if (curProgress < 94) {
        phaseTitle = 'Precision Chord & Harmonic Fusion';
        phaseDetail = 'Dual-register harmonic consensus and chord quality analysis...';
        phaseIcon = <Sparkles className="size-5 text-violet-400 animate-pulse" />;
      } else {
        phaseTitle = 'Mounting Multi-Bus Mixer';
        phaseDetail = 'Loading rehearsal stems and interactive fretboard...';
        phaseIcon = <Activity className="size-5 text-emerald-400 animate-pulse" />;
      }
    } else {
      if (curProgress < 75) {
        phaseTitle = 'Decoding Master Stems';
        phaseDetail = 'Streaming and decoding 6 audio stems into Web Audio buffers...';
        phaseIcon = <Loader2 className="size-5 text-cyan-400 animate-spin" />;
      } else if (curProgress < 99) {
        phaseTitle = 'Mounting Multi-Bus Mixer';
        phaseDetail = 'Configuring channel faders, stereo pan, and live VU meters...';
        phaseIcon = <Activity className="size-5 text-emerald-400 animate-pulse" />;
      } else {
        phaseTitle = 'Studio Ready for Playback';
        phaseDetail = 'Mounting bass fretboard and precision chord progression...';
        phaseIcon = <CheckCircle2 className="size-5 text-emerald-400" />;
      }
    }

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-zinc-900/90 border border-zinc-800 p-6 sm:p-7 rounded-3xl backdrop-blur-2xl shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Sparkles className="size-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  {isNewProcessing ? 'AI Studio Separation' : 'Loading Studio Stems'}
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  {isNewProcessing 
                    ? (progressMeta?.device_label || 'BS-RoFormer-SW • Apple Silicon (MPS)')
                    : '6-Stem Audio Engine'}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
                {curProgress}%
              </span>
            </div>
          </div>

          {/* Dynamic Progress Bar */}
          <div className="flex flex-col gap-2">
            <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden border border-zinc-800/80 p-0.5">
              <div
                className="bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                style={{ width: `${Math.max(3, curProgress)}%` }}
              />
            </div>
          </div>

          {/* Current Active State Banner */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0">
              {phaseIcon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-zinc-200 block truncate">
                {phaseTitle}
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed font-mono">
                {phaseDetail}
              </p>
            </div>
          </div>

          {/* Cancel & Return to Library button */}
          <div className="pt-1 flex justify-center">
            <button
              onClick={() => {
                destroyPlayer();
                router.push('/');
              }}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1.5 px-3 rounded-xl hover:bg-zinc-900/80 cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Cancel & Return to Library</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (trackStatus === 'FAILED' || fetchError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center flex flex-col items-center gap-4">
          <div className="size-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <AlertCircle className="size-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Playback Error</h2>
          <p className="text-sm text-zinc-400">{fetchError || statusMessage}</p>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }), "border-zinc-700 text-zinc-200 mt-2")}
          >
            <ArrowLeft className="size-4 mr-2" />
            Return to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100 flex flex-col pb-36 sm:pb-28">
      {/* Studio Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-9 px-2 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-xl cursor-pointer"
            )}
          >
            <ArrowLeft className="size-4 mr-1.5" />
            <span className="hidden sm:inline">Library</span>
          </Link>

          <div className="h-5 w-px bg-zinc-800" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="size-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold shrink-0">
              <Music4 className="size-4" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold text-white leading-tight line-clamp-1">
                {track?.title || 'ExTrack Rehearsal Studio'}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 line-clamp-1">
                {track?.artist || 'Master Stem Breakdown'}
              </p>
            </div>
          </div>
        </div>

        {/* Visualizer Mode Switcher & Dynamic Key, BPM, Time Signature Pill */}
        <div className="flex items-center gap-2 sm:gap-3">
          {(() => {
            const currentKey = detectSongKey(track?.chords, pitchSemitones);
            const currentBpm = Math.round((track?.bpm || 120) * playbackRate);
            return (
              <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl font-mono text-xs text-zinc-300 shadow-sm">
                <span className="flex items-center gap-1 text-violet-400 font-bold">
                  <Key className="size-3" />
                  <span>{currentKey}</span>
                  {pitchSemitones !== 0 && (
                    <span className="text-[10px] opacity-75 font-normal">
                      ({pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST)
                    </span>
                  )}
                </span>
                <span className="text-zinc-700">•</span>
                <span className="text-amber-400 font-semibold">{currentBpm} BPM</span>
                <span className="text-zinc-700">•</span>
                <span className="text-cyan-400 font-semibold">{track?.time_signature || '4/4'}</span>
              </div>
            );
          })()}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'guitar' | 'piano' | 'bass')}>
            <TabsList className="bg-zinc-900 border border-zinc-800 h-9 p-0.5">
              <TabsTrigger value="all" className="text-xs px-2 sm:px-2.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
                <Layers className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">All</span>
              </TabsTrigger>
              <TabsTrigger value="guitar" className="text-xs px-2 sm:px-2.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400">
                <Guitar className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Guitar</span>
              </TabsTrigger>
              <TabsTrigger value="piano" className="text-xs px-2 sm:px-2.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">
                <Piano className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Piano</span>
              </TabsTrigger>
              <TabsTrigger value="bass" className="text-xs px-2 sm:px-2.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400">
                <Activity className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Bass</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="h-5 w-px bg-zinc-800 hidden sm:block" />

          <ExportButton />
        </div>
      </header>

      {/* Non-blocking Progressive Buffer Banner for Existing Tracks */}
      {isLoading && !wasProcessing && (
        <div className="bg-zinc-900/90 border-b border-zinc-800/80 px-4 sm:px-6 py-2 flex items-center justify-between gap-4 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2 text-zinc-300">
            <Loader2 className="size-3.5 text-cyan-400 animate-spin" />
            <span className="font-medium">Buffering rehearsal stems for instant playback...</span>
            <span className="font-mono text-cyan-400 font-bold">{loadingProgress}%</span>
          </div>
          <div className="w-28 sm:w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-200"
              style={{ width: `${Math.max(5, loadingProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Studio Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-4">
        {/* Waveform Looper & Time Scrubbing */}
        <WaveformLooper />

        {/* Real-time Scrolling Chord Progression */}
        <ChordScroller />

        {/* Dynamic Visualizer Section (Guitar, Piano & Bass) */}
        <div className="grid grid-cols-1 gap-4">
          {(activeTab === 'all' || activeTab === 'guitar') && (
            <GuitarFretboard />
          )}

          {(activeTab === 'all' || activeTab === 'piano') && (
            <PianoKeyboard />
          )}

          {(activeTab === 'all' || activeTab === 'bass') && (
            <BassFretboard />
          )}
        </div>

        {/* 4-Channel Multi-Track Mixer & Minus-One Isolation */}
        <MixerPanel />
      </main>

      {/* Floating Bottom Transport Bar */}
      <div className="fixed bottom-3 left-4 right-4 max-w-7xl mx-auto z-50">
        <TransportBar />
      </div>
    </div>
  );
}
