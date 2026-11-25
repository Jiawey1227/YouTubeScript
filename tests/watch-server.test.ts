import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listAll } from '../src/watch/files';
import { moveToOutput } from '../src/watch/output';
import { DramaQueue } from '../src/watch/queue';
import { startWatchServer, type WatchServer } from '../src/watch/server';

let server: WatchServer | null = null;

afterEach(() => {
  server?.server.close();
  server = null;
});

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), 'drama-port-'));
}

describe('本机端口', () => {
  it('按队列回答剧名，收到结果后移到输出文件夹并记录', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const moved: string[] = [];
    let now = 0;
    const queue = DramaQueue.empty(1000);
    queue.noteStartup([]);
    try {
      server = await startWatchServer({
        queue,
        list: () => listAll([source]),
        move: async (file) => {
          moved.push(file);
          return moveToOutput(file, output);
        },
        now: () => now,
        port: 0,
      });
      const address = server.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await writeFile(path.join(source, '冰山学姐沦陷了.mp4'), 'x');
      now = 500;
      await fetch(`http://127.0.0.1:${port}/poll`, {
        method: 'POST',
        body: JSON.stringify({ manual: false, busy: false }),
      });
      now = 3000;
      const polled = await fetch(`http://127.0.0.1:${port}/poll`, {
        method: 'POST',
        body: JSON.stringify({ manual: false, busy: false }),
      });
      const reply = (await polled.json()) as {
        action: string;
        id: string;
        name: string;
      };
      expect(reply).toMatchObject({
        action: 'search',
        name: '冰山学姐沦陷了',
      });
      now = 40000;
      await fetch(`http://127.0.0.1:${port}/result`, {
        method: 'POST',
        body: JSON.stringify({
          id: reply.id,
          kind: 'views',
          views: ['1.2万'],
        }),
      });
      expect(moved).toHaveLength(1);
      expect(queue.snapshot().done[0]).toMatchObject({
        status: '已移入输出文件夹',
        reason: '最大播放量 12000，阈值 1000',
        source,
        target: path.join(output, '冰山学姐沦陷了.mp4'),
      });
    } finally {
      server?.server.close();
      server = null;
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it('没有可交的剧时回答 none', async () => {
    const source = await tempDir();
    const queue = DramaQueue.empty(1000);
    queue.noteStartup([]);
    try {
      server = await startWatchServer({
        queue,
        list: () => listAll([source]),
        move: async () => '',
        now: () => 0,
        port: 0,
      });
      const address = server.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const polled = await fetch(`http://127.0.0.1:${port}/poll`, {
        method: 'POST',
        body: JSON.stringify({ manual: false, busy: false }),
      });
      expect(await polled.json()).toEqual({ action: 'none' });
    } finally {
      server?.server.close();
      server = null;
      await rm(source, { recursive: true, force: true });
    }
  });
});
