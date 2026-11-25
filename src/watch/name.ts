export const EMPTY_NAME = '名字为空';

export function dramaNameFromFile(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot === 0) return null;
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  return stem || null;
}
