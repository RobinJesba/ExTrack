'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  Music2,
  Play,
  Trash2,
  Sliders,
  Guitar,
  Clock,
  Gauge,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

interface TrackItem {
  id: string;
  title: string;
  artist: string | null;
  duration: number;
  bpm: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Import modal state
  const [importTab, setImportTab] = useState<'youtube' | 'file'>('youtube');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [metaThumbnail, setMetaThumbnail] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [separationMode, setSeparationMode] = useState<'fast' | 'quality'>('fast');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const hasFetchedRef = React.useRef(false);

  const fetchTracks = async () => {
    try {
      const res = await fetch('/api/tracks');
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchTracks();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setTitle(baseName);
    }
  };

  const metaAbortRef = React.useRef<AbortController | null>(null);

  const handleFetchYouTubeMeta = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || youtubeUrl).trim();
    if (!targetUrl || (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be'))) return;

    if (metaAbortRef.current) {
      metaAbortRef.current.abort();
    }
    metaAbortRef.current = new AbortController();

    setIsFetchingMeta(true);
    try {
      const res = await fetch('/api/tracks/youtube/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
        signal: metaAbortRef.current.signal
      });
      const data = await res.json();
      if (data.success) {
        if (data.title && !title) setTitle(data.title);
        if (data.artist && !artist) setArtist(data.artist);
        if (data.thumbnail) setMetaThumbnail(data.thumbnail);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('Failed to fetch YouTube info:', err);
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (importTab === 'youtube') {
      if (!youtubeUrl.trim()) return;
      setIsUploading(true);

      try {
        const res = await fetch('/api/tracks/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: youtubeUrl.trim(),
            title: title || undefined,
            artist: artist || undefined,
            model: 'BS-Roformer-SW',
            device: 'auto',
            mode: separationMode
          })
        });
        const data = await res.json();
        if (data.success && data.trackId) {
          setIsDialogOpen(false);
          router.push(`/studio/${data.trackId}`);
        } else {
          alert(data.error || 'Failed to download YouTube audio');
        }
      } catch (err) {
        console.error('YouTube import error:', err);
        alert('Network error while downloading from YouTube');
      } finally {
        setIsUploading(false);
      }
    } else {
      if (!selectedFile) return;
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title || selectedFile.name);
      formData.append('artist', artist || 'Unknown Artist');
      formData.append('model', 'BS-Roformer-SW');
      formData.append('device', 'auto');
      formData.append('mode', separationMode);

      try {
        const res = await fetch('/api/tracks/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.trackId) {
          setIsDialogOpen(false);
          router.push(`/studio/${data.trackId}`);
        }
      } catch (err) {
        console.error('Upload error:', err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleDelete = async (trackId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this track?')) return;

    try {
      await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' });
      fetchTracks();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-amber-500 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
              <Sliders className="size-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              ExTrack <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">STUDIO</span>
            </h1>
            <p className="text-[11px] text-zinc-400">6-Stem AI Audio Separation & Minus-One Practice</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              setTitle('');
              setArtist('');
              setYoutubeUrl('');
              setSelectedFile(null);
              setMetaThumbnail(null);
              setIsDialogOpen(true);
            }}
            className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs gap-1.5 rounded-xl shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Import Song</span>
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 w-full sm:max-w-lg p-6 overflow-hidden rounded-3xl">
              <DialogHeader className="w-full min-w-0">
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="size-5 text-cyan-400 shrink-0" />
                  <span>Import Song to Studio</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-1">
                  Enter a YouTube link to download high-fidelity 44.1kHz audio or upload a local file.
                </DialogDescription>
              </DialogHeader>

              {/* Import Mode Tabs: YouTube first, Local File second */}
              <div className="w-full flex items-center bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 mt-1 box-border">
                <button
                  type="button"
                  onClick={() => setImportTab('youtube')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    importTab === 'youtube'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <YouTubeIcon className="size-4 text-red-400 shrink-0" />
                  <span>YouTube URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab('file')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    importTab === 'file'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <UploadCloud className="size-3.5 text-cyan-400 shrink-0" />
                  <span>Local File</span>
                </button>
              </div>

              {isUploading ? (
                <div className="w-full flex flex-col items-center justify-center py-8 gap-5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="size-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Loader2 className="size-7 animate-spin" />
                  </div>
                  <div className="text-center px-4">
                    <h3 className="text-sm font-bold text-white">
                      {importTab === 'youtube' ? 'Downloading YouTube Master Audio...' : 'Uploading Audio Track...'}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono mt-1 leading-relaxed">
                      {importTab === 'youtube'
                        ? 'Extracting 44.1kHz WAV master stream and initializing 6-stem AI separation...'
                        : 'Preparing Apple Silicon Metal acceleration pipeline...'}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleImportSubmit} className="w-full flex flex-col gap-4 mt-2 min-w-0 box-border">
                  {importTab === 'youtube' ? (
                    /* YouTube URL Input */
                    <div className="w-full flex flex-col gap-2 min-w-0">
                      <div className="w-full flex flex-col gap-1.5 min-w-0">
                        <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                          <span>YouTube Video / Song URL</span>
                          {isFetchingMeta && (
                            <span className="text-[10px] text-cyan-400 flex items-center gap-1 font-sans">
                              <Loader2 className="size-3 animate-spin" /> Fetching info...
                            </span>
                          )}
                        </label>
                        <div className="w-full relative flex items-center min-w-0">
                          <input
                            type="url"
                            value={youtubeUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              setYoutubeUrl(val);
                              if (val.includes('youtube.com') || val.includes('youtu.be')) {
                                handleFetchYouTubeMeta(val);
                              }
                            }}
                            onPaste={(e) => {
                              const val = e.clipboardData.getData('text');
                              if (val.includes('youtube.com') || val.includes('youtu.be')) {
                                handleFetchYouTubeMeta(val);
                              }
                            }}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-500 font-sans box-border"
                            required={importTab === 'youtube'}
                            autoFocus
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Downloads master audio stream directly in pristine 44.1kHz WAV.
                        </span>
                      </div>

                      {metaThumbnail && (
                        <div className="w-full flex items-center gap-3 p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden min-w-0 box-border animate-in fade-in duration-200">
                          <img
                            src={metaThumbnail}
                            alt="Thumbnail"
                            className="w-16 h-11 object-cover rounded-lg shrink-0"
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <p className="text-xs font-bold text-zinc-200 truncate block w-full">{title || 'Video Track'}</p>
                            <p className="text-[11px] text-zinc-400 truncate block w-full">{artist || 'YouTube'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* File Dropzone */
                    <label className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-800 hover:border-cyan-500/50 bg-zinc-900/50 rounded-2xl cursor-pointer transition-colors group box-border">
                      <UploadCloud className="size-10 text-zinc-500 group-hover:text-cyan-400 transition-colors mb-2" />
                      <span className="text-sm font-medium text-zinc-300">
                        {selectedFile ? selectedFile.name : 'Click or drop audio file here'}
                      </span>
                      <span className="text-[11px] text-zinc-500 mt-1 font-mono">
                        Supports MP3, WAV, FLAC, AAC, M4A, OGG
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        required={importTab === 'file'}
                      />
                    </label>
                  )}

                  {/* Song Meta inputs */}
                  <div className="w-full flex flex-col gap-1.5 min-w-0">
                    <label className="text-xs font-mono text-zinc-400">Song Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Master of Puppets"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 font-sans box-border"
                      required
                    />
                  </div>

                  <div className="w-full flex flex-col gap-1.5 min-w-0">
                    <label className="text-xs font-mono text-zinc-400">Artist / Band</label>
                    <input
                      type="text"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      placeholder="e.g. Metallica"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 font-sans box-border"
                    />
                  </div>

                  {/* AI Separation Engine Profile Selector */}
                  <div className="w-full flex flex-col gap-1.5 min-w-0 mt-1">
                    <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                      <span>Separation Engine Profile</span>
                      <span className="text-[10px] text-cyan-400 font-sans font-bold">BS-RoFormer 6-Stem</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setSeparationMode('fast')}
                        className={cn(
                          "py-2 px-2.5 rounded-lg text-left transition-all cursor-pointer flex flex-col gap-0.5",
                          separationMode === 'fast'
                            ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shadow-sm"
                            : "hover:bg-zinc-800/60 text-zinc-400 border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <Zap className="size-3 text-cyan-400" />
                          <span>2x Fast Mode</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          Native FP16 • ~3 min
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSeparationMode('quality')}
                        className={cn(
                          "py-2 px-2.5 rounded-lg text-left transition-all cursor-pointer flex flex-col gap-0.5",
                          separationMode === 'quality'
                            ? "bg-violet-500/15 border border-violet-500/30 text-violet-300 shadow-sm"
                            : "hover:bg-zinc-800/60 text-zinc-400 border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <Sparkles className="size-3 text-violet-400" />
                          <span>Ultra Quality</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          2x Overlap • Studio Master
                        </p>
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={(importTab === 'file' && !selectedFile) || (importTab === 'youtube' && !youtubeUrl.trim())}
                    className={`w-full font-bold mt-2 py-2.5 rounded-xl cursor-pointer ${
                      importTab === 'youtube'
                        ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-500/20'
                    }`}
                  >
                    {importTab === 'youtube' ? 'Download & Start 6-Stem AI Separation' : 'Start 6-Stem AI Separation'}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto p-6 flex-1 flex flex-col gap-8">
        {/* Feature Highlights Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sliders className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">6-Stem Minus-One Mixer</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Isolate or mute Vocals, Drums, Bass, Guitar, Piano, and Other with live peak meters.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Guitar className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">4-String Bass Fretboard</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time sub-bass note tracking with fret illumination and legato slide detection.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Precision Chord Ribbon</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Dual-register harmonic fusion with real-time countdowns, guitar fingering & transposer.
              </p>
            </div>
          </div>
        </div>

        {/* Tracks Library Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="size-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Your Rehearsal Tracks</h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">{tracks.length} Songs Loaded</span>
          </div>

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
              <Loader2 className="size-7 animate-spin text-cyan-400" />
              <span className="text-xs font-mono">Loading library...</span>
            </div>
          ) : tracks.length === 0 ? (
            <Card className="bg-zinc-900/40 border-zinc-800/80 p-12 text-center rounded-3xl flex flex-col items-center gap-4">
              <div className="size-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                <Music2 className="size-8" />
              </div>
              <div className="max-w-sm">
                <h3 className="text-base font-bold text-white">No tracks in library yet</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Import a song using a YouTube URL or upload an audio file to start practicing.
                </p>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs rounded-xl cursor-pointer"
                >
                  <Plus className="size-3.5 mr-1.5" />
                  Import Your First Song
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tracks.map((trk) => {
                const isComplete = trk.status === 'COMPLETED';

                return (
                  <div
                    key={trk.id}
                    onClick={() => router.push(`/studio/${trk.id}`)}
                    onMouseEnter={() => {
                      router.prefetch(`/studio/${trk.id}`);
                      fetch(`/api/tracks/${trk.id}`, { priority: 'low' as RequestPriority }).catch(() => {});
                    }}
                    className="group flex flex-col justify-between p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 hover:border-cyan-500/50 hover:bg-zinc-900 transition-all duration-200 shadow-lg hover:shadow-cyan-500/10 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="size-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                          {isComplete ? <Play className="size-5 fill-current ml-0.5" /> : <Loader2 className="size-5 animate-spin" />}
                        </div>
                        
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isComplete ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                              <CheckCircle2 className="size-3 mr-1" />
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                              Processing
                            </Badge>
                          )}
                          
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                            onClick={(e) => handleDelete(trk.id, e)}
                            title="Delete Track"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        {trk.title}
                      </h3>
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                        {trk.artist || 'Unknown Artist'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/60 text-[11px] font-mono text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Gauge className="size-3 text-amber-400" />
                        <span>{Math.round(trk.bpm || 120)} BPM</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>
                          {trk.duration ? `${Math.floor(trk.duration / 60)}:${Math.floor(trk.duration % 60).toString().padStart(2, '0')}` : '--:--'}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 py-4 px-6 text-center text-xs font-mono text-zinc-500">
        ExTrack AI Rehearsal Studio • BS-RoFormer-SW (6-Stem SOTA) • Apple Silicon Metal (MPS) Accelerated
      </footer>
    </div>
  );
}
