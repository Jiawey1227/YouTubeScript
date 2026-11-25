import { watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { parseArgs } from './args';
import { listAll } from './files';
import {
  acquireLock,
  acquireSourceLocks,
  defaultStateDir,
  loadLedger,
  saveLedger,
} from './ledger';
import { moveToOutput } from './output';
import { isSupportedPlatform, UNSUPPORTED_PLATFORM } from './platform';
import { DramaQueue } from './queue';
import {
  createWatchLifecycle,
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
} from './schedule';
import { SCRIPT_PORT, startWatchServer } from './server';

function exit(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!isSupportedPlatform()) exit(UNSUPPORTED_PLATFORM);

const parsed = await parseArgs(process.argv.slice(2));
if ('error' in parsed) exit(parsed.error);
const { sources, output, threshold } = parsed.args;

await mkdir(output, { recursive: true });

const queue = new DramaQueue(await loadLedger(output), threshold);
queue.noteStartup(await listAll(sources));

const lifecycle = createWatchLifecycle();
lifecycle.init(Date.now());

let watchers: FSWatcher[] = [];
let staggerTimers: NodeJS.Timeout[] = [];
let watcherSession = 0;

const clearStaggerTimers = () => {
  for (const timer of staggerTimers) clearTimeout(timer);
  staggerTimers = [];
};

const closeWatchersImmediately = () => {
  watcherSession++;
  clearStaggerTimers();
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
  }
  watchers = [];
};

const closeWatchersStaggered = () => {
  const session = ++watcherSession;
  clearStaggerTimers();
  const toClose = watchers.splice(0);
  let delay = 0;
  for (let index = 0; index < toClose.length; index++) {
    const watcher = toClose[index];
    if (index > 0) delay += 1000 + Math.floor(Math.random() * 3000);
    const timer = setTimeout(() => {
      if (watcherSession !== session) return;
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
    }, delay);
    staggerTimers.push(timer);
  }
};

const openWatchers = () => {
  closeWatchersImmediately();
  const session = watcherSession;
  let delay = 0;
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (index > 0) delay += 2000 + Math.floor(Math.random() * 4000);
    const timer = setTimeout(() => {
      if (watcherSession !== session) return;
      try {
        const watcher = watch(source, () => {
          lifecycle.notifyEvent();
        });
        watcher.on('error', () => {
          /* 共享盘短暂断开时不崩溃，等待下个周期重连 */
        });
        watchers.push(watcher);
      } catch {
        /* 无法建立监听时跳过，等待下个周期重试 */
      }
    }, delay);
    staggerTimers.push(timer);
  }
};

let watchingActive = false;
const syncWatchers = (nowMs: number) => {
  const { phase, changed } = lifecycle.tick(nowMs, queue.hasPending());
  if (phase === 'watching' && !watchingActive) {
    watchingActive = true;
    openWatchers();
  } else if (phase !== 'watching' && watchingActive) {
    watchingActive = false;
    closeWatchersStaggered();
  }
  if (changed) {
    const until = new Date(lifecycle.phaseUntil()).toLocaleTimeString('zh-CN', {
      hour12: false,
    });
    const label =
      phase === 'watching'
        ? '开始监听'
        : phase === 'resting'
          ? '暂停监听（错峰释放目录句柄）'
          : '夜间休眠（错峰关闭监听）';
    console.log(
      `[${new Date(nowMs).toLocaleTimeString('zh-CN', { hour12: false })}] ${label}，预计持续至 ${until}`,
    );
  }
};

if (lifecycle.phase() === 'watching') {
  watchingActive = true;
  openWatchers();
}

let server;
try {
  server = await startWatchServer({
    queue,
    list: () => listAll(sources),
    move: (file) => moveToOutput(file, output),
    shouldScan: (now) => {
      syncWatchers(now);
      return lifecycle.shouldScan(now, queue.hasPending());
    },
  });
} catch (error) {
  closeWatchersImmediately();
  const code = (error as NodeJS.ErrnoException).code;
  exit(code === 'EADDRINUSE' ? '端口已被占用。' : '无法监听本机端口。');
}

let releaseOutput: (() => Promise<void>) | undefined;
let releaseSources: (() => Promise<void>) | undefined;
try {
  releaseOutput = await acquireLock(output);
  releaseSources = await acquireSourceLocks(sources);
} catch (error) {
  closeWatchersImmediately();
  server.server.close();
  exit(error instanceof Error ? error.message : '无法锁定文件夹。');
}

let lastSaved = '';
const persistIfChanged = async () => {
  const snapshot = queue.snapshot();
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastSaved) return;
  await saveLedger(output, snapshot);
  lastSaved = serialized;
};

await persistIfChanged();

let printed = 0;
const flush = async () => {
  await server.refresh();
  while (printed < queue.lines.length) console.log(queue.lines[printed++]);
  await persistIfChanged();
};
const timer = setInterval(() => {
  void flush().catch((error) => {
    console.error(error instanceof Error ? error.message : '监视失败');
  });
}, 1000);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  closeWatchersImmediately();
  server.server.close();
  void (async () => {
    await persistIfChanged();
    await releaseSources?.();
    await releaseOutput?.();
  })();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const untilTime = new Date(lifecycle.phaseUntil()).toLocaleTimeString('zh-CN', {
  hour12: false,
});
console.log(`来源文件夹：${sources.join('；')}`);
console.log(`输出文件夹：${output}`);
console.log(`本机状态目录：${defaultStateDir()}`);
console.log(
  `活跃时段：${DEFAULT_START_HOUR}:00–${DEFAULT_END_HOUR}:00（监听 10–25 分钟 / 休息 3–8 分钟，夜间彻底关闭监听）`,
);
console.log(`当前状态：${lifecycle.phase()}，预计切换时间：${untilTime}`);
console.log(`阈值 ${threshold}，端口 ${SCRIPT_PORT}`);
