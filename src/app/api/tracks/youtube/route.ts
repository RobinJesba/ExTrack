import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { dbService } from '@/lib/db/db';
import { processTrackAsync } from '@/lib/server/audioProcessor';

const YT_DLP_PATH = process.env.YT_DLP_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/yt-dlp' : 'yt-dlp');
const FFMPEG_PATH = process.env.FFMPEG_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');

export async function POST(req: NextRequest) {
  try {
    const { url, title: customTitle, artist: customArtist, model = 'BS-Roformer-SW', device = 'auto', mode = 'fast' } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.includes('youtube.com') && !trimmedUrl.includes('youtu.be')) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const trackId = `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const outputTemplate = path.join(uploadDir, `${trackId}.%(ext)s`);
    const finalFilePath = path.join(uploadDir, `${trackId}.wav`);

    // Fetch video metadata first if title/artist not fully provided
    let videoTitle = customTitle;
    let videoArtist = customArtist;

    try {
      const metaProcess = spawn(YT_DLP_PATH, [
        '--dump-single-json',
        '--no-playlist',
        '--flat-playlist',
        trimmedUrl
      ]);

      let stdout = '';
      metaProcess.stdout.on('data', (d) => { stdout += d.toString(); });
      
      await new Promise<void>((resolve) => {
        metaProcess.on('close', (code) => {
          if (code === 0 && stdout.trim()) {
            try {
              const data = JSON.parse(stdout);
              if (!videoTitle) videoTitle = data.title;
              if (!videoArtist) videoArtist = data.artist || data.uploader || data.channel || 'Unknown Artist';
            } catch (e) {
              // Ignore parse error, fallback to defaults
            }
          }
          resolve();
        });
        metaProcess.on('error', () => resolve());
      });
    } catch (e) {
      // Non-fatal, continue to download
    }

    const finalTitle = videoTitle || 'YouTube Song';
    const finalArtist = videoArtist || 'Unknown Artist';

    // Download audio as high-quality WAV
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-x',
        '--audio-format', 'wav',
        '--audio-quality', '0',
        '--no-playlist',
        '--ffmpeg-location', FFMPEG_PATH,
        '-o', outputTemplate,
        trimmedUrl
      ];

      const child = spawn(YT_DLP_PATH, args);

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(finalFilePath)) {
          resolve();
        } else {
          // If wav wasn't produced directly, check if another extension exists
          const candidates = fs.readdirSync(uploadDir).filter(f => f.startsWith(trackId));
          if (candidates.length > 0) {
            resolve();
          } else {
            reject(new Error(stderr || `Failed to download YouTube audio (exit code ${code})`));
          }
        }
      });

      child.on('error', (err) => reject(err));
    });

    // Verify downloaded file
    let actualFilePath = finalFilePath;
    if (!fs.existsSync(actualFilePath)) {
      const candidates = fs.readdirSync(uploadDir).filter(f => f.startsWith(trackId));
      if (candidates.length > 0) {
        actualFilePath = path.join(uploadDir, candidates[0]);
      } else {
        return NextResponse.json({ error: 'Downloaded file not found on disk' }, { status: 500 });
      }
    }

    const ext = path.extname(actualFilePath);

    // Create DB entry
    dbService.createTrack({
      id: trackId,
      title: finalTitle,
      artist: finalArtist,
      filename: `${finalTitle}${ext}`,
      file_path: `/api/audio/uploads/${trackId}${ext}`,
      duration: 0,
      bpm: 120,
      sample_rate: 44100,
      status: 'PROCESSING',
      progress: 5,
      status_message: 'YouTube audio downloaded. Initializing hardware acceleration...'
    });

    // Launch background AI separation & chord/bass tracking
    processTrackAsync(trackId, actualFilePath, model, device, mode).catch(err => {
      console.error(`Background processing error for ${trackId}:`, err);
    });

    return NextResponse.json({
      success: true,
      trackId,
      status: 'PROCESSING',
      message: 'YouTube download successful. Separation in progress.'
    });
  } catch (error: unknown) {
    console.error('YouTube import error:', error);
    const message = error instanceof Error ? error.message : 'YouTube import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
