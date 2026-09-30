import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

const YT_DLP_PATH = process.env.YT_DLP_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/yt-dlp' : 'yt-dlp');

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.includes('youtube.com') && !trimmedUrl.includes('youtu.be')) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const info = await new Promise<{ title: string; artist: string; duration: number; thumbnail: string }>((resolve, reject) => {
      const child = spawn(YT_DLP_PATH, [
        '--dump-single-json',
        '--no-playlist',
        '--flat-playlist',
        trimmedUrl
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout);
            resolve({
              title: data.title || 'Untitled Song',
              artist: data.artist || data.uploader || data.channel || 'Unknown Artist',
              duration: data.duration || 0,
              thumbnail: data.thumbnail || ''
            });
          } catch (e) {
            reject(new Error('Failed to parse YouTube metadata JSON'));
          }
        } else {
          reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });

    return NextResponse.json({ success: true, ...info });
  } catch (error: unknown) {
    console.error('YouTube info fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch YouTube info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
