export interface Field {
  value: string | null;
  source: string;
  reason: string;
}
export interface Detail {
  videoId: string;
  title: string;
  durationSeconds: number | null;
  live: boolean;
  publishedAt: Field;
  viewCount: Field;
}
export interface SearchHit {
  videoId: string;
  title: string;
  rank: number;
  viewText: string | null;
  relativeTime: string | null;
}
export type PageResult =
  | { kind: 'search'; hits: SearchHit[] }
  | { kind: 'error'; reason: string; retryable: boolean; blocked: boolean };
export interface VideoResult {
  drama: string;
  videoId: string;
  title: string;
  rank: number;
  viewText: Field;
  relativeTime: Field;
}
export interface Drama {
  name: string;
  status: 'pending' | 'searching' | 'done' | 'failed';
  searched: boolean;
  reason: string;
  results: VideoResult[];
}
export interface Step {
  id: string;
  url: string;
  kind: 'search';
  name: string;
  attempt: number;
  deadline: number;
  documentId?: string;
  phase: 'prepared' | 'loading' | 'reading';
}
export interface Job {
  version: 2;
  id: string;
  status: 'running' | 'completed';
  createdAt: string;
  updatedAt: string;
  cursor: number;
  dramas: Drama[];
  tabId?: number;
  step?: Step;
  nextAt: number;
  notice: string;
  origin: 'manual' | 'script';
  scriptRequestId?: string;
  scriptReported?: boolean;
}
export const videoUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const searchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`;
export function titleContainsDramaName(title: string, name: string): boolean {
  const needle = name.trim().replace(/\p{P}/gu, '');
  if (!needle) return false;
  return title.replace(/\p{P}/gu, '').includes(needle);
}
export const NO_MATCH = '这次搜索没有匹配';
export function interactiveBlockReason(url: string): string | null {
  if (
    /consent\.(?:youtube|google)\.com|accounts\.google\.com|youtube\.com\/consent|\/sorry\//.test(
      url,
    )
  ) {
    return '需要在采集标签页处理登录、同意页面或验证码';
  }
  return null;
}
export function missing(reason: string): Field {
  return { value: null, source: '', reason };
}
export function acceptDramaNames(names: string[]): string[] {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (!clean.length) throw new Error('请输入剧名。');
  if (clean.length > 20) throw new Error('请将剧名减少到 20 个以内。');
  return clean;
}
export function parseDramaNames(text: string): string[] {
  return acceptDramaNames(text.split(/\r?\n/));
}
export function createJob(names: string[], now = Date.now()): Job {
  const clean = acceptDramaNames(names);
  return {
    version: 2,
    id: crypto.randomUUID(),
    status: 'running',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    cursor: 0,
    nextAt: now,
    notice: '',
    origin: 'manual',
    dramas: clean.map((name) => ({
      name,
      status: 'pending',
      searched: false,
      reason: '',
      results: [],
    })),
  };
}
export function samePage(actual: string, expected: string) {
  try {
    const a = new URL(actual),
      b = new URL(expected);
    return (
      a.origin === b.origin &&
      a.pathname === b.pathname &&
      a.searchParams.get('search_query') === b.searchParams.get('search_query')
    );
  } catch {
    return false;
  }
}
