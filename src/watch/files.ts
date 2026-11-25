import { lstat, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { WatchedFile } from './queue';

const exec = promisify(execFile);

export function isHiddenName(name: string) {
  return (
    name.startsWith('.') ||
    /(^|\/)(desktop\.ini|thumbs\.db|\$recycle\.bin)$/i.test(name)
  );
}

async function hiddenAttributes(dir: string): Promise<Set<string>> {
  if (process.platform !== 'win32') return new Set();
  try {
    const { stdout } = await exec('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-ChildItem -LiteralPath '${dir.replace(/'/g, "''")}' -Force | Where-Object { $_.Attributes -match 'Hidden|System' } | ForEach-Object { $_.Name }`,
    ]);
    return new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export async function listWatched(
  dir: string,
  source = dir,
): Promise<WatchedFile[]> {
  const names = await readdir(dir);
  const hidden = await hiddenAttributes(dir);
  const files: WatchedFile[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const link = await lstat(full);
    const kind = link.isSymbolicLink()
      ? 'symlink'
      : link.isDirectory()
        ? 'dir'
        : 'file';
    const info = kind === 'symlink' ? link : await stat(full);
    files.push({
      ino: info.ino,
      birthtimeMs: Number.isFinite(info.birthtimeMs) ? info.birthtimeMs : null,
      size: info.size,
      name,
      path: full,
      kind,
      source,
      hidden: isHiddenName(name) || hidden.has(name),
    });
  }
  return files;
}

export async function listAll(sources: string[]): Promise<WatchedFile[]> {
  const groups = await Promise.all(sources.map((dir) => listWatched(dir, dir)));
  return groups.flat();
}
