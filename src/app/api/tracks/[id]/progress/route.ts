import { NextRequest } from 'next/server';
import { dbService } from '@/lib/db/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendUpdate = () => {
        if (isClosed) return;
        const track = dbService.getTrack(id);
        if (!track) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Track not found' })}\n\n`));
          controller.close();
          isClosed = true;
          return;
        }

        let meta = null;
        if (track.progress_meta) {
          try {
            meta = JSON.parse(track.progress_meta);
          } catch {}
        }

        const payload = {
          id: track.id,
          status: track.status,
          progress: track.progress,
          status_message: track.status_message,
          meta
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

        if (track.status === 'COMPLETED' || track.status === 'FAILED') {
          controller.close();
          isClosed = true;
        }
      };

      // Send immediate first state
      sendUpdate();

      // Poll interval every 600ms
      const interval = setInterval(() => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }
        sendUpdate();
      }, 600);

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
