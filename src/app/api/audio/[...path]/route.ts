import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path;
  let targetPath = path.join(process.cwd(), 'data', ...pathSegments);

  const dataDir = path.join(process.cwd(), 'data');
  if (!targetPath.startsWith(dataDir)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Smart compression resolution:
  // If .wav is requested but an optimized .m4a exists, prefer the 88% smaller .m4a
  if (targetPath.endsWith('.wav')) {
    const m4aCandidate = targetPath.slice(0, -4) + '.m4a';
    if (fs.existsSync(m4aCandidate)) {
      targetPath = m4aCandidate;
    }
  }

  if (!fs.existsSync(targetPath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const stat = fs.statSync(targetPath);
  const fileSize = stat.size;
  const etag = `W/"${fileSize}-${Math.floor(stat.mtimeMs)}"`;

  // HTTP 304 Not Modified validation
  const clientEtag = req.headers.get('if-none-match');
  if (clientEtag && clientEtag === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const range = req.headers.get('range');
  const ext = path.extname(targetPath).toLowerCase();
  let contentType = 'audio/mpeg';
  if (ext === '.wav') contentType = 'audio/wav';
  else if (ext === '.flac') contentType = 'audio/flac';
  else if (ext === '.ogg') contentType = 'audio/ogg';
  else if (ext === '.m4a' || ext === '.mp4' || ext === '.aac') contentType = 'audio/mp4';

  const baseHeaders = {
    'ETag': etag,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*'
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(targetPath, { start, end });

    return new NextResponse(fileStream as unknown as BodyInit, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize.toString(),
        'Content-Type': contentType,
      },
    });
  } else {
    const fileStream = fs.createReadStream(targetPath);
    return new NextResponse(fileStream as unknown as BodyInit, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
      },
    });
  }
}
