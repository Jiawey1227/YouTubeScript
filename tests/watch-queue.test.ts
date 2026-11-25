import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/watch/args';
import { isHiddenName, listAll, listWatched } from '../src/watch/files';
import {
  acquireLock,
  acquireSourceLocks,
  loadLedger,
  saveLedger,
} from '../src/watch/ledger';
import { moveToOutput, numberedName } from '../src/watch/output';
import { isSupportedPlatform } from '../src/watch/platform';
import { DramaQueue, identityOf, type WatchedFile } from '../src/watch/queue';

const dirs: string[] = [];
async function tempDir(prefix = 'drama-watch-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

const file = (name: string, extra: Partial<WatchedFile> = {}): WatchedFile => ({
  ino: 1,
  birthtimeMs: 10,
  size: 100,
  name,
  path: `/videos/${name}`,
  kind: 'file',
  source: '/videos',
  ...extra,
});

describe('平台与参数', () => {
  it('只在 Windows 上运行', () => {
    expect(isSupportedPlatform('win32')).toBe(true);
    expect(isSupportedPlatform('darwin')).toBe(false);
    expect(isSupportedPlatform('linux')).toBe(false);
  });

  it('接受多个来源文件夹、一个输出文件夹和一个阈值', async () => {
    const one = await tempDir();
    const two = await tempDir();
    const output = path.join(await tempDir(), '已达标');
    const parsed = await parseArgs([
      '--output',
      output,
      '--threshold',
      '10000',
      one,
      two,
    ]);
    expect(parsed).toMatchObject({
      args: { sources: [one, two], output, threshold: 10000 },
    });
  });

  it('拒绝不存在的来源、非法阈值和位于来源内的输出文件夹', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const missing = path.join(source, '没有');
    expect(
      await parseArgs(['--output', output, '--threshold', '1', missing]),
    ).toHaveProperty('error');
    expect(
      await parseArgs(['--output', output, '--threshold', '1.2万', source]),
    ).toHaveProperty('error');
    expect(
      await parseArgs(['--output', output, '--threshold', '-1', source]),
    ).toHaveProperty('error');
    expect(
      await parseArgs(['--output', source, '--threshold', '1', source]),
    ).toMatchObject({
      error: expect.stringContaining('不能位于来源文件夹之内'),
    });
    const inside = path.join(source, '子目录');
    expect(
      await parseArgs(['--output', inside, '--threshold', '1', source]),
    ).toHaveProperty('error');
  });

  it('输出文件夹已存在但不是文件夹时拒绝', async () => {
    const source = await tempDir();
    const parent = await tempDir();
    const output = path.join(parent, '不是文件夹');
    await writeFile(output, 'x');
    expect(
      await parseArgs(['--output', output, '--threshold', '5', source]),
    ).toMatchObject({
      error: expect.stringContaining('输出文件夹'),
    });
  });
});

describe('多文件夹队列', () => {
  it('两个来源文件夹按发现顺序逐部交出，一个为空时另一个照常', () => {
    const queue = DramaQueue.empty(10000);
    queue.noteStartup([]);
    queue.scan(
      [file('甲.mp4', { ino: 1, source: '/a', path: '/a/甲.mp4' })],
      0,
    );
    queue.scan(
      [
        file('甲.mp4', { ino: 1, source: '/a', path: '/a/甲.mp4' }),
        file('乙.mp4', { ino: 2, source: '/b', path: '/b/乙.mp4' }),
      ],
      1500,
    );
    const first = queue.poll({ manual: false, busy: false }, 2000);
    expect(first).toEqual({ action: 'search', id: 'handoff-1', name: '甲' });
    if (first.action !== 'search') return;
    queue.complete({ id: first.id, kind: 'views', views: ['1'] });
    const second = queue.poll({ manual: false, busy: false }, 4000);
    expect(second).toEqual({ action: 'search', id: 'handoff-2', name: '乙' });
  });

  it('后面的文件夹不会越过未稳定的文件', () => {
    const queue = DramaQueue.empty(10000);
    queue.noteStartup([]);
    queue.scan([file('甲.mp4', { ino: 1, source: '/a' })], 0);
    queue.scan(
      [
        file('甲.mp4', { ino: 1, source: '/a', size: 200 }),
        file('乙.mp4', { ino: 2, source: '/b' }),
      ],
      1000,
    );
    expect(queue.poll({ manual: false, busy: false }, 1200)).toMatchObject({
      action: 'wait',
      reason: '在等文件稳定',
    });
    expect(queue.poll({ manual: false, busy: false }, 3100)).toMatchObject({
      action: 'search',
      name: '甲',
    });
  });

  it('重启后按原顺序继续，并记下来源文件夹', () => {
    const queue = DramaQueue.empty(1000);
    queue.noteStartup([]);
    queue.scan(
      [
        file('甲.mp4', { ino: 1, source: '/a', path: '/a/甲.mp4' }),
        file('乙.mp4', { ino: 2, source: '/b', path: '/b/乙.mp4' }),
      ],
      0,
    );
    const restored = new DramaQueue(queue.snapshot(), 1000);
    restored.noteStartup([
      file('甲.mp4', { ino: 1, source: '/a', path: '/a/甲.mp4' }),
    ]);
    expect(restored.poll({ manual: false, busy: false }, 0)).toMatchObject({
      action: 'wait',
      reason: '在等文件稳定',
    });
    const first = restored.poll({ manual: false, busy: false }, 2000);
    expect(first).toMatchObject({ action: 'search', name: '甲' });
    if (first.action !== 'search') return;
    restored.complete({ id: first.id, kind: 'none' });
    expect(restored.snapshot().done[0]).toMatchObject({
      source: '/a',
      status: '没有匹配',
    });
    expect(restored.poll({ manual: false, busy: false }, 4000)).toMatchObject({
      name: '乙',
    });
  });

  it('隐藏文件和系统文件不进入队列', () => {
    expect(isHiddenName('desktop.ini')).toBe(true);
    expect(isHiddenName('Thumbs.db')).toBe(true);
    expect(isHiddenName('.DS_Store')).toBe(true);
    expect(isHiddenName('正片.mp4')).toBe(false);
    const queue = DramaQueue.empty(1000);
    queue.noteStartup([]);
    queue.scan(
      [
        file('desktop.ini', { ino: 1 }),
        file('Thumbs.db', { ino: 2 }),
        file('隐藏.mp4', { ino: 3, hidden: true }),
        file('.cache', { ino: 4 }),
        file('子目录', { ino: 5, kind: 'dir' }),
        file('链接', { ino: 6, kind: 'symlink' }),
      ],
      0,
    );
    expect(queue.poll({ manual: false, busy: false }, 5000)).toEqual({
      action: 'none',
    });
    expect(queue.snapshot().pending).toHaveLength(0);
  });
});

describe('文件身份回退', () => {
  it('没有可用编号时用小写路径和创建时间', () => {
    const a = identityOf({ ino: 0, birthtimeMs: 5, path: '/A/剧.mp4' });
    expect(a).toEqual({
      ino: 0,
      birthtimeMs: 5,
      key: '/a/剧.mp4',
    });
    const queue = DramaQueue.empty(1000);
    queue.noteStartup([]);
    queue.scan(
      [
        {
          ...file('剧.mp4', { path: '/a/剧.mp4', ino: 0, birthtimeMs: 5 }),
        },
      ],
      0,
    );
    const first = queue.poll({ manual: false, busy: false }, 2000);
    expect(first).toMatchObject({ action: 'search' });
    if (first.action !== 'search') return;
    queue.complete({ id: first.id, kind: 'views', views: ['1'] });
    queue.scan(
      [
        {
          ...file('剧.mp4', { path: '/a/剧.mp4', ino: 0, birthtimeMs: 5 }),
        },
      ],
      4000,
    );
    expect(queue.poll({ manual: false, busy: false }, 4000)).toEqual({
      action: 'none',
    });
    queue.scan(
      [
        {
          ...file('剧.mp4', { path: '/a/剧.mp4', ino: 0, birthtimeMs: 9 }),
        },
      ],
      5000,
    );
    expect(queue.poll({ manual: false, busy: false }, 8000)).toMatchObject({
      action: 'search',
    });
  });

  it('旧清单里只有 inode 的记录仍被识别', async () => {
    const dir = await tempDir();
    const stateDir = await tempDir();
    await saveLedger(
      dir,
      {
        pending: [
          {
            ino: 7,
            birthtimeMs: 3,
            path: '/a/旧.mp4',
            fileName: '旧.mp4',
            source: '/a',
            drama: '旧',
            phase: 'waiting',
            stableSize: 1,
            stableSince: 0,
          },
        ],
        done: [],
        ignored: [],
      },
      stateDir,
    );
    const queue = new DramaQueue(await loadLedger(dir, stateDir), 1000);
    queue.noteStartup([file('旧.mp4', { ino: 7, birthtimeMs: 3 })]);
    expect(queue.snapshot().pending).toHaveLength(1);
    expect(queue.snapshot().ignored).toHaveLength(0);
  });
});

describe('输出文件夹', () => {
  it('同卷用 rename 移动，失败时源文件仍在', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const from = path.join(source, '甲.mp4');
    await writeFile(from, 'x');
    const target = await moveToOutput(from, output);
    expect(target).toBe(path.join(output, '甲.mp4'));
    await expect(moveToOutput(from, output)).rejects.toThrow();
  });

  it('同名文件用序号保存，不覆盖', async () => {
    const output = await tempDir();
    expect(numberedName('甲.mp4', 0)).toBe('甲.mp4');
    expect(numberedName('甲.mp4', 1)).toBe('甲 (2).mp4');
    expect(numberedName('甲.mp4', 2)).toBe('甲 (3).mp4');
    expect(numberedName('没有扩展名', 1)).toBe('没有扩展名 (2)');
    await writeFile(path.join(output, '甲.mp4'), 'first');
    const source = await tempDir();
    const second = path.join(source, '甲.mp4');
    await writeFile(second, 'second');
    const target = await moveToOutput(second, output);
    expect(target).toBe(path.join(output, '甲 (2).mp4'));
    const fs = await import('node:fs/promises');
    expect(await fs.readFile(path.join(output, '甲.mp4'), 'utf8')).toBe(
      'first',
    );
    expect(await fs.readFile(target, 'utf8')).toBe('second');
  });

  it('跨卷时复制成功后删除源文件', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const from = path.join(source, '跨卷.mp4');
    await writeFile(from, '内容');
    const copiedFiles: string[] = [];
    const removed: string[] = [];
    const target = await moveToOutput(from, output, {
      rename: async () => {
        throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
      },
      copyFile: async (input, to) => {
        copiedFiles.push(to);
        await copyFile(input, to);
      },
      rm: async (file) => {
        removed.push(file);
        await rm(file);
      },
    });
    expect(target).toBe(path.join(output, '跨卷.mp4'));
    expect(copiedFiles).toEqual([target]);
    expect(removed).toEqual([from]);
    const fs = await import('node:fs/promises');
    expect(await fs.readFile(target, 'utf8')).toBe('内容');
    await expect(fs.stat(from)).rejects.toThrow();
  });

  it('跨卷复制后大小不一致时保留源文件并报错', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const from = path.join(source, '坏.mp4');
    await writeFile(from, 'abcd');
    const fs = await import('node:fs/promises');
    await expect(
      moveToOutput(from, output, {
        rename: async () => {
          throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
        },
        copyFile: async (_input, to) => {
          await writeFile(to, 'ab');
        },
      }),
    ).rejects.toThrow('大小不一致');
    expect(await fs.readFile(from, 'utf8')).toBe('abcd');
  });
});

describe('清单与锁', () => {
  it('第二个脚本退出，崩溃后可以接管', async () => {
    const dir = await tempDir();
    const stateDir = await tempDir();
    const release = await acquireLock(dir, 10, () => false, stateDir);
    await expect(
      acquireLock(dir, 11, (pid) => pid === 10, stateDir),
    ).rejects.toThrow('已有脚本');
    await release();
    const again = await acquireLock(dir, 12, () => false, stateDir);
    await again();
  });

  it('来源文件夹共用时后启动的脚本退出', async () => {
    const one = await tempDir();
    const two = await tempDir();
    const stateDir = await tempDir();
    const release = await acquireSourceLocks([one], 20, () => false, stateDir);
    await expect(
      acquireSourceLocks([two, one], 21, (pid) => pid === 20, stateDir),
    ).rejects.toThrow('已被另一个脚本监视');
    await release();
    const clean = await acquireSourceLocks(
      [two, one],
      22,
      () => false,
      stateDir,
    );
    await clean();
    expect(
      await import('node:fs/promises').then((fs) => fs.readdir(one)),
    ).toEqual([]);
  });

  it('列出多个文件夹并带上来源', async () => {
    const one = await tempDir();
    const two = await tempDir();
    await writeFile(path.join(one, '甲.mp4'), 'a');
    await writeFile(path.join(two, '乙.mp4'), 'b');
    await mkdir(path.join(two, '子目录'));
    const listed = await listAll([one, two]);
    expect(listed.filter((item) => item.kind === 'file')).toHaveLength(2);
    expect(
      listed.every((item) => item.source === one || item.source === two),
    ).toBe(true);
    const single = await listWatched(one);
    expect(single[0].source).toBe(one);
  });
});
