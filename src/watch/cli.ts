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

function nowLabel(ms = Date.now()): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function log(message: string, ms = Date.now()) {
  console.log(`[${nowLabel(ms)}] ${message}`);
}

function exit(message: string): never {
  console.error(`[${nowLabel()}] 错误：${message}`);
  process.exit(1);
}

if (!isSupportedPlatform()) exit(UNSUPPORTED_PLATFORM);

const parsed = await parseArgs(process.argv.slice(2));
if ('error' in parsed) exit(parsed.error);
const { sources, output, threshold } = parsed.args;

await mkdir(output, { recursive: true });

const queue = new DramaQueue(await loadLedger(output), threshold);
const startupFiles = await listAll(sources);
queue.noteStartup(startupFiles);
log(
  `启动初始化完成：忽略已有文件 ${startupFiles.filter((f) => f.kind === 'file').length} 个，待处理队列 ${queue.snapshot().pending.length} 个`,
);

const lifecycle = createWatchLifecycle();
lifecycle.init(Date.now());

let watchers: { source: string; watcher: FSWatcher }[] = [];
let staggerTimers: NodeJS.Timeout[] = [];
let watcherSession = 0;

const clearStaggerTimers = () => {
  for (const timer of staggerTimers) clearTimeout(timer);
  staggerTimers = [];
};

const closeWatchersImmediately = () => {
  watcherSession++;
  clearStaggerTimers();
  for (const { watcher } of watchers) {
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
    const { source, watcher } = toClose[index];
    if (index > 0) delay += 1000 + Math.floor(Math.random() * 3000);
    const timer = setTimeout(() => {
      if (watcherSession !== session) return;
      try {
        watcher.close();
        log(`已关闭监听：${source}`);
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
        const watcher = watch(source, (eventType, filename) => {
          log(
            `收到目录变动通知（${eventType}）：${source}${filename ? `\\${String(filename)}` : ''}`,
          );
          lifecycle.notifyEvent();
        });
        watcher.on('error', (err) => {
          log(`监听异常（将在下个周期重试）：${source} - ${err.message}`);
        });
        watchers.push({ source, watcher });
        log(`已开启监听：${source}`);
      } catch (err) {
        log(
          `开启监听失败（将在下个周期重试）：${source} - ${err instanceof Error ? err.message : String(err)}`,
        );
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
    const until = nowLabel(lifecycle.phaseUntil());
    const label =
      phase === 'watching'
        ? '进入监听期'
        : phase === 'resting'
          ? '进入休息期（错峰释放目录句柄）'
          : '进入夜间休眠（错峰关闭监听）';
    log(`${label}，预计持续至 ${until}`, nowMs);
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
    list: async () => {
      const files = await listAll(sources);
      log(
        `扫描来源目录完成：共发现 ${files.filter((f) => f.kind === 'file').length} 个文件，队列待处理 ${queue.snapshot().pending.length} 个`,
      );
      return files;
    },
    move: async (file) => {
      log(`开始移动达标文件：${file} -> ${output}`);
      const target = await moveToOutput(file, output);
      log(`移动成功：${target}`);
      return target;
    },
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
  while (printed < queue.lines.length) log(queue.lines[printed++]);
  await persistIfChanged();
};
const timer = setInterval(() => {
  void flush().catch((error) => {
    console.error(
      `[${nowLabel()}] 监视失败：${error instanceof Error ? error.message : String(error)}`,
    );
  });
}, 1000);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  log('收到退出信号，正在保存账本并清理监听…');
  clearInterval(timer);
  closeWatchersImmediately();
  server.server.close();
  void (async () => {
    await persistIfChanged();
    await releaseSources?.();
    await releaseOutput?.();
    log('已安全退出。');
  })();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const untilTime = nowLabel(lifecycle.phaseUntil());
log(`来源文件夹：${sources.join('；')}`);
log(`输出文件夹：${output}`);
log(`本机状态目录：${defaultStateDir()}`);
log(
  `活跃时段：${DEFAULT_START_HOUR}:00–${DEFAULT_END_HOUR}:00（监听 10–25 分钟 / 休息 3–8 分钟，夜间彻底关闭监听）`,
);
log(`当前状态：${lifecycle.phase()}，预计切换时间：${untilTime}`);
log(`阈值 ${threshold}，端口 ${SCRIPT_PORT}`);
