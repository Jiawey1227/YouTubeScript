import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function setHidden(file: string) {
  if (process.platform !== 'win32') return;
  try {
    await exec('attrib', ['+h', file]);
  } catch {
    /* 设置隐藏属性失败不影响清单本身。 */
  }
}
