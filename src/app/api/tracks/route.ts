import { NextResponse } from 'next/server';
import { dbService } from '@/lib/db/db';

export async function GET() {
  try {
    const tracks = dbService.getAllTracks();
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('Failed to get tracks:', error);
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
  }
}
