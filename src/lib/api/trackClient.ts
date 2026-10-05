/**
 * Unified Client API / IPC Adapter
 * Seamlessly switches between Web (Next.js /api routes) and Desktop (Tauri IPC commands)
 */

export function checkIsTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    !!(window as any).isTauri ||
    '__TAURI_INTERNALS__' in window ||
    !!(window as any).__TAURI__ ||
    !!(window as any).__TAURI_INVOKE__
  );
}

export const isTauri = typeof window !== 'undefined' ? checkIsTauri() : false;

export interface TrackItem {
  id: string;
  title: string;
  artist: string | null;
  duration: number;
  bpm: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at: string;
}

export interface ProgressMeta {
  stage?: string;
  stage_progress?: number;
  eta?: string;
  elapsed?: string;
  speed?: string;
  processed_audio?: string;
  device_label?: string;
}

export interface ProgressPayload {
  trackId: string;
  status: string;
  progress: number;
  status_message: string;
  meta?: ProgressMeta;
}

export const trackClient = {
  async getTracks(): Promise<TrackItem[]> {
    if (checkIsTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<TrackItem[]>('get_tracks');
    }
    const res = await fetch('/api/tracks');
    if (!res.ok) throw new Error('Failed to fetch tracks');
    const data = await res.json();
    return data.tracks || [];
  },

  async getTrack(id: string, signal?: AbortSignal): Promise<any> {
    if (checkIsTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const data = await invoke<any>('get_track_details', { id });
      
      const stemsMap: Record<string, string> = {};
      if (Array.isArray(data.stems)) {
        for (const stem of data.stems) {
          stemsMap[stem.stem_type] = stem.file_path;
        }
      } else if (data.stems && typeof data.stems === 'object') {
        Object.assign(stemsMap, data.stems);
      }

      return {
        track: {
          id: data.track.id,
          title: data.track.title,
          artist: data.track.artist,
          duration: data.track.duration,
          bpm: data.track.bpm,
          status: data.track.status,
          progress: data.track.progress,
          status_message: data.track.status_message,
          progress_meta: data.track.progress_meta,
          stems: stemsMap,
          chords: data.chords || [],
          beats: data.beats || [],
          bass_notes: data.bass_notes || [],
          created_at: data.track.created_at,
        }
      };
    }
    const res = await fetch(`/api/tracks/${id}`, { signal });
    if (!res.ok) throw new Error('Track not found');
    return res.json();
  },

  async loadAudioBuffer(pathOrUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (checkIsTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        let res = await invoke<any>('read_audio_file', { filePath: pathOrUrl }).catch(() => null);
        if (!res) {
          res = await invoke<any>('read_audio_file', { file_path: pathOrUrl }).catch(() => null);
        }
        if (res) {
          if (res instanceof ArrayBuffer) {
            return res;
          }
          if (ArrayBuffer.isView(res)) {
            const view = res as ArrayBufferView;
            return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
          }
          if (Array.isArray(res)) {
            return new Uint8Array(res).buffer as ArrayBuffer;
          }
          if (typeof res.arrayBuffer === 'function') {
            return await res.arrayBuffer();
          }
        }
      } catch (err) {
        console.warn('read_audio_file failed, falling back to fetch:', err);
      }
    }
    const res = await fetch(pathOrUrl, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  },

  async deleteTrack(id: string): Promise<void> {
    if (checkIsTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_track', { id });
      return;
    }
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' });
  },

  async getYoutubeInfo(url: string, signal?: AbortSignal): Promise<{ success: boolean; title?: string; artist?: string; thumbnail?: string; error?: string }> {
    if (checkIsTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_youtube_info', { url });
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || String(err)
        };
      }
    }
    const res = await fetch('/api/tracks/youtube/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal
    });
    if (!res.ok) {
      return { success: false, error: `Failed to fetch YouTube metadata (${res.status})` };
    }
    return res.json();
  },

  async importYoutube(payload: {
    url: string;
    title?: string;
    artist?: string;
    model?: string;
    device?: string;
    mode?: 'fast' | 'quality';
  }): Promise<{ success: boolean; trackId?: string; error?: string }> {
    if (checkIsTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<any>('import_youtube_track', { payload });
        return {
          success: Boolean(res.success),
          trackId: res.trackId || res.track_id,
          error: res.error,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || String(err) || 'Failed to download YouTube audio via Tauri IPC'
        };
      }
    }
    const res = await fetch('/api/tracks/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: errText || `Server error (${res.status})` };
    }
    return res.json();
  },

  async openNativeAudioFile(): Promise<{ path: string; name: string } | null> {
    if (checkIsTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Audio Files',
          extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']
        }]
      });
      if (selected && typeof selected === 'string') {
        const name = selected.split('/').pop() || selected.split('\\').pop() || 'Selected Audio';
        return { path: selected, name };
      }
    }
    return null;
  },

  async importLocalFile(
    filePath: string,
    title?: string,
    artist?: string,
    mode: 'fast' | 'quality' = 'fast'
  ): Promise<{ success: boolean; trackId?: string; error?: string }> {
    if (checkIsTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<any>('import_local_file', {
          filePath,
          title: title || undefined,
          artist: artist || undefined,
          mode
        });
        return {
          success: Boolean(res.success),
          trackId: res.trackId || res.track_id,
          error: res.error,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || String(err)
        };
      }
    }
    throw new Error('Native file import is only available in desktop mode');
  },

  async uploadTrack(formData: FormData): Promise<{ success: boolean; trackId?: string; error?: string }> {
    if (checkIsTauri()) {
      // In desktop Tauri, local file ingestion passes file paths or byte buffers
      const { invoke } = await import('@tauri-apps/api/core');
      const file = formData.get('file') as File;
      const title = (formData.get('title') as string) || file.name;
      const artist = (formData.get('artist') as string) || 'Unknown Artist';
      const mode = (formData.get('mode') as string) || 'fast';
      return invoke('upload_track_file', {
        title,
        artist,
        mode,
        fileName: file.name
      });
    }
    const res = await fetch('/api/tracks/upload', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  subscribeProgress(id: string, onUpdate: (payload: ProgressPayload) => void): () => void {
    if (checkIsTauri()) {
      let unlistenFn: (() => void) | null = null;
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<any>(`track-progress:${id}`, (event) => {
          const p = event.payload || {};
          onUpdate({
            trackId: id,
            status: p.status || 'PROCESSING',
            progress: typeof p.progress === 'number' ? p.progress : 10,
            status_message: p.status_message || p.message || 'Processing audio...',
            meta: p.meta || p,
          });
        }).then((unlisten) => {
          unlistenFn = unlisten;
        });
      });
      return () => {
        if (unlistenFn) unlistenFn();
      };
    }

    // Standard Web Server-Sent Events (SSE) fallback
    const sse = new EventSource(`/api/tracks/${id}/progress`);
    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onUpdate(payload);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };
    return () => {
      sse.close();
    };
  }
};
