import { stat } from 'node:fs/promises';
import path from 'node:path';

export interface WatchArgs {
  sources: string[];
  output: string;
  threshold: number;
}

export async function parseArgs(
  argv: string[],
): Promise<{ args: WatchArgs } | { error: string }> {
  const sources: string[] = [];
  let output = '';
  let threshold: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--output') {
      output = argv[++index] ?? '';
      continue;
    }
    if (value === '--threshold') {
      threshold = argv[++index];
      continue;
    }
    if (value.startsWith('--')) return { error: `未知参数 ${value}` };
    sources.push(value);
  }
  if (!sources.length || !output || threshold === undefined)
    return {
      error:
        '用法：watch-dramas.cmd --output <输出文件夹> --threshold <播放量> <来源文件夹> [更多来源文件夹…]',
    };
  if (!/^\d+$/.test(threshold))
    return { error: '阈值必须是大于等于 0 的整数。' };
  const limit = Number(threshold);
  if (!Number.isSafeInteger(limit))
    return { error: '阈值必须是大于等于 0 的整数。' };

  const resolvedOutput = path.resolve(output);
  const resolved: string[] = [];
  for (const source of sources) {
    const full = path.resolve(source);
    if (resolved.includes(full)) return { error: `来源文件夹重复：${full}` };
    const info = await stat(full).catch(() => null);
    if (!info?.isDirectory())
      return { error: `来源文件夹不存在或不是文件夹：${full}` };
    resolved.push(full);
  }
  const outputInfo = await stat(resolvedOutput).catch(() => null);
  if (outputInfo && !outputInfo.isDirectory())
    return { error: `输出文件夹已存在但不是文件夹：${resolvedOutput}` };
  for (const source of resolved) {
    if (isInside(source, resolvedOutput))
      return {
        error: `输出文件夹不能位于来源文件夹之内：${resolvedOutput}`,
      };
  }
  return {
    args: { sources: resolved, output: resolvedOutput, threshold: limit },
  };
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}
