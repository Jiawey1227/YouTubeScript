import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LedgerData } from './queue';

export const LEDGER_NAME = '.drama-watch.json';
export const LOCK_NAME = '.drama-watch.lock';
export const SOURCE_LOCK_NAME = '.drama-watch-source.lock';

export function defaultStateDir(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) return path.join(localAppData, 'drama-watch');
  return path.join(os.homedir(), '.drama-watch');
}

export function stateKey(targetPath: string): string {
  return createHash('sha256')
    .update(path.resolve(targetPath).toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

export function ledgerPath(dir: string, stateDir = defaultStateDir()): string {
  return path.join(stateDir, `ledger-${stateKey(dir)}.json`);
}

export async function loadLedger(
  dir: string,
  stateDir = defaultStateDir(),
): Promise<LedgerData> {
  try {
    const raw = await readFile(ledgerPath(dir, stateDir), 'utf8');
    const data = JSON.parse(raw) as LedgerData;
    return {
      pending: data.pending ?? [],
      done: data.done ?? [],
      ignored: data.ignored ?? [],
    };
  } catch {
    return { pending: [], done: [], ignored: [] };
  }
}

export async function saveLedger(
  dir: string,
  data: LedgerData,
  stateDir = defaultStateDir(),
) {
  await mkdir(stateDir, { recursive: true });
  const file = ledgerPath(dir, stateDir);
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, file);
}

export function processAlive(pid: number) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function takeLock(
  file: string,
  message: string,
  pid: number,
  alive: (pid: number) => boolean,
) {
  await mkdir(path.dirname(file), { recursive: true });
  let existing = 0;
  try {
    existing = Number(await readFile(file, 'utf8'));
  } catch {
    existing = 0;
  }
  if (existing && alive(existing)) throw new Error(message);
  await writeFile(file, String(pid));
  return async () => {
    await rm(file, { force: true });
  };
}

export async function acquireLock(
  dir: string,
  pid = process.pid,
  alive = processAlive,
  stateDir = defaultStateDir(),
) {
  return takeLock(
    path.join(stateDir, `output-${stateKey(dir)}.lock`),
    '这个文件夹已有脚本在监视。',
    pid,
    alive,
  );
}

export async function acquireSourceLocks(
  sources: string[],
  pid = process.pid,
  alive = processAlive,
  stateDir = defaultStateDir(),
) {
  const releases: (() => Promise<void>)[] = [];
  try {
    for (const source of sources) {
      releases.push(
        await takeLock(
          path.join(stateDir, `source-${stateKey(source)}.lock`),
          `来源文件夹已被另一个脚本监视：${source}`,
          pid,
          alive,
        ),
      );
    }
  } catch (error) {
    for (const release of releases) await release();
    throw error;
  }
  return async () => {
    for (const release of releases) await release();
  };
}
