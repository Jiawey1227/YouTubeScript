import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireLock,
  acquireSourceLocks,
  loadLedger,
  saveLedger,
} from '../src/watch/ledger';
import {
  createWatchLifecycle,
  isWithinActiveHours,
  nextActiveStart,
} from '../src/watch/schedule';

const dirs: string[] = [];
async function tempDir(prefix = 'drama-sched-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe('监听与休眠生命周期', () => {
  it('白天在监听和休息之间交替，夜间彻底休眠到次日 8:00', () => {
    const start = new Date(2026, 10, 25, 10, 0, 0).getTime();
    const life = createWatchLifecycle({
      minWatchMs: 10 * 60 * 1000,
      maxWatchMs: 10 * 60 * 1000,
      minRestMs: 5 * 60 * 1000,
      maxRestMs: 5 * 60 * 1000,
      maxJitterMs: 0,
    });
    life.init(start);
    expect(life.phase()).toBe('watching');
    // 刚进入 watching 会触发一次初始扫描
    expect(life.shouldScan(start, false)).toBe(true);
    expect(life.shouldScan(start + 1000, false)).toBe(false);

    // 收到 fs.watch 事件后触发扫描
    life.notifyEvent();
    expect(life.shouldScan(start + 2000, false)).toBe(true);

    // 10 分钟后若无待处理文件，进入 resting（关闭 fs.watch）
    const restAt = start + 10 * 60 * 1000;
    expect(life.tick(restAt, false)).toEqual({
      phase: 'resting',
      changed: true,
    });
    expect(life.shouldScan(restAt, false)).toBe(false);

    // 休息 5 分钟后重新进入 watching
    const resumeAt = restAt + 5 * 60 * 1000;
    expect(life.tick(resumeAt, false)).toEqual({
      phase: 'watching',
      changed: true,
    });

    // 到了 23:00 彻底进入 sleeping
    const night = new Date(2026, 10, 25, 23, 0, 0).getTime();
    expect(life.tick(night, false)).toEqual({
      phase: 'sleeping',
      changed: true,
    });
    const nextMorning = new Date(life.phaseUntil());
    expect(nextMorning.getDate()).toBe(26);
    expect(nextMorning.getHours()).toBe(8);
  });

  it('有待处理文件时推迟休息，处理完再进入休息', () => {
    const start = new Date(2026, 10, 25, 14, 0, 0).getTime();
    const life = createWatchLifecycle({
      minWatchMs: 10 * 60 * 1000,
      maxWatchMs: 10 * 60 * 1000,
      minRestMs: 5 * 60 * 1000,
      maxRestMs: 5 * 60 * 1000,
    });
    life.init(start);
    const afterWatch = start + 10 * 60 * 1000;
    expect(life.tick(afterWatch, true)).toEqual({
      phase: 'watching',
      changed: false,
    });
    expect(life.tick(afterWatch + 3000, false)).toEqual({
      phase: 'resting',
      changed: true,
    });
  });

  it('活跃时段与次日唤醒时间计算正确', () => {
    const early = new Date(2026, 10, 25, 3, 30, 0).getTime();
    const day = new Date(2026, 10, 25, 10, 15, 0).getTime();
    const late = new Date(2026, 10, 25, 23, 5, 0).getTime();

    expect(isWithinActiveHours(early)).toBe(false);
    expect(isWithinActiveHours(day)).toBe(true);
    expect(isWithinActiveHours(late)).toBe(false);

    const wakeEarly = new Date(nextActiveStart(early, { maxJitterMs: 0 }));
    expect(wakeEarly.getDate()).toBe(25);
    expect(wakeEarly.getHours()).toBe(8);

    const wakeLate = new Date(nextActiveStart(late, { maxJitterMs: 0 }));
    expect(wakeLate.getDate()).toBe(26);
    expect(wakeLate.getHours()).toBe(8);
  });
});

describe('本机状态目录（共享盘零写入）', () => {
  it('锁文件和账本不写入来源或输出文件夹', async () => {
    const source = await tempDir();
    const output = await tempDir();
    const stateDir = await tempDir();

    const releaseOut = await acquireLock(output, 100, () => false, stateDir);
    const releaseSrc = await acquireSourceLocks(
      [source],
      100,
      () => false,
      stateDir,
    );
    await saveLedger(output, { pending: [], done: [], ignored: [] }, stateDir);

    expect(await readdir(source)).toEqual([]);
    expect(await readdir(output)).toEqual([]);
    expect(await loadLedger(output, stateDir)).toEqual({
      pending: [],
      done: [],
      ignored: [],
    });

    await releaseSrc();
    await releaseOut();
  });
});
