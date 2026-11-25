import { createServer, type Server } from 'node:http';
import type { DramaQueue, WatchedFile } from './queue';

export const SCRIPT_PORT = 17321;
const MOVE_RETRY_MS = 30000;

export interface WatchServer {
  server: Server;
  refresh(): Promise<void>;
}

export async function startWatchServer(options: {
  queue: DramaQueue;
  list: () => Promise<WatchedFile[]>;
  move: (file: string) => Promise<string>;
  shouldScan?: (now: number) => boolean;
  now?: () => number;
  port?: number;
}): Promise<WatchServer> {
  const now = options.now ?? (() => Date.now());
  const shouldScan = options.shouldScan ?? (() => true);
  let lastMove = 0;
  const refresh = async () => {
    const current = now();
    if (shouldScan(current)) {
      options.queue.scan(await options.list(), current);
    }
    const target = options.queue.moveTarget();
    if (!target) return;
    if (now() - lastMove < MOVE_RETRY_MS) return;
    lastMove = now();
    try {
      const moved = await options.move(target.path);
      options.queue.moveDone(true, moved);
    } catch {
      options.queue.moveDone(false);
    }
  };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as {
      manual?: boolean;
      busy?: boolean;
      id?: string;
      kind?: 'views' | 'none' | 'error';
      views?: string[];
      reason?: string;
    };
    await refresh();
    if (
      request.method === 'POST' &&
      request.url === '/result' &&
      body.id &&
      body.kind
    ) {
      options.queue.complete({
        id: body.id,
        kind: body.kind,
        views: body.views,
        reason: body.reason,
      });
      await refresh();
    }
    const reply =
      request.url === '/poll'
        ? options.queue.poll(
            { manual: !!body.manual, busy: !!body.busy },
            now(),
          )
        : { action: 'none' as const };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(reply));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? SCRIPT_PORT, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return { server, refresh };
}
