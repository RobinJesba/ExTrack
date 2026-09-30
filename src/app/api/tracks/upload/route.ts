import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { dbService } from '@/lib/db/db';
import { processTrackAsync } from '@/lib/server/audioProcessor';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || (file ? file.name.replace(/\.[^/.]+$/, '') : 'Untitled Song');
    const artist = (formData.get('artist') as string) || 'Unknown Artist';
    const model = (formData.get('model') as string) || 'BS-Roformer-SW';
    const device = (formData.get('device') as string) || 'auto'; // 'auto' | 'mps' | 'cuda' | 'cpu'
    const mode = ((formData.get('mode') as string) || 'fast') as 'fast' | 'quality';

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const trackId = `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const originalExt = path.extname(file.name) || '.mp3';
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const savedFilePath = path.join(uploadDir, `${trackId}${originalExt}`);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(savedFilePath, buffer);

    // Create DB entry
    dbService.createTrack({
      id: trackId,
      title,
      artist,
      filename: file.name,
      file_path: `/api/audio/uploads/${trackId}${originalExt}`,
      duration: 0,
      bpm: 120,
      sample_rate: 44100,
      status: 'PROCESSING',
      progress: 5,
      status_message: 'File uploaded. Initializing hardware acceleration...'
    });

    // Start asynchronous processing in background
    processTrackAsync(trackId, savedFilePath, model, device, mode).catch(err => {
      console.error(`Background processing error for ${trackId}:`, err);
    });

    return NextResponse.json({
      success: true,
      trackId,
      status: 'PROCESSING',
      message: 'Upload successful. Separation in progress.'
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
