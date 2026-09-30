import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/lib/db/db';
import { cancelTrackProcess } from '@/lib/server/audioProcessor';
import path from 'path';
import fs from 'fs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const track = dbService.getTrack(id);

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    // Convert stem records into a clean mapping
    const stemsMap: Record<string, string> = {};
    for (const stem of track.stems) {
      stemsMap[stem.stem_type] = stem.file_path;
    }

    return NextResponse.json({
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        bpm: track.bpm,
        status: track.status,
        progress: track.progress,
        status_message: track.status_message,
        stems: stemsMap,
        chords: track.chords,
        beats: track.beats,
        bass_notes: track.bass_notes || [],
        created_at: track.created_at
      }
    });
  } catch (error) {
    console.error('Failed to get track details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Immediately terminate any active background separation/extraction process
    cancelTrackProcess(id);

    // 2. Delete database records
    dbService.deleteTrack(id);

    // 3. Clean up stems folder from disk
    const stemsDir = path.join(process.cwd(), 'data', 'stems', id);
    if (fs.existsSync(stemsDir)) {
      try {
        fs.rmSync(stemsDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[DELETE] Failed to remove stems directory ${stemsDir}:`, e);
      }
    }

    // 4. Clean up uploaded original file from disk
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          if (file.startsWith(id)) {
            fs.unlinkSync(path.join(uploadsDir, file));
          }
        }
      } catch (e) {
        console.warn(`[DELETE] Failed to remove upload file for ${id}:`, e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete track:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
