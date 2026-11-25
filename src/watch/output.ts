import { copyFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export interface MoveOps {
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  rm(file: string): Promise<void>;
  stat(file: string): Promise<{ size: number }>;
}

const nodeOps: MoveOps = {
  rename,
  copyFile,
  rm: (file) => rm(file),
  stat,
};

export async function moveToOutput(
  file: string,
  output: string,
  ops: Partial<MoveOps> = {},
) {
  const io: MoveOps = { ...nodeOps, ...ops };
  const name = path.basename(file);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const target = path.join(output, numberedName(name, attempt));
    const exists = await io.stat(target).catch(() => null);
    if (exists) continue;
    try {
      await io.rename(file, target);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await io.copyFile(file, target);
      const copied = await io.stat(target);
      const source = await io.stat(file).catch(() => null);
      if (source && copied.size !== source.size) {
        await io.rm(target);
        throw new Error('复制后大小不一致');
      }
      await io.rm(file);
      return target;
    }
  }
  throw new Error('输出文件夹里同名文件过多');
}

export function numberedName(name: string, attempt: number) {
  if (!attempt) return name;
  const extension = path.extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  return `${stem} (${attempt + 1})${extension}`;
}
