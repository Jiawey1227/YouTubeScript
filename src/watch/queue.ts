import { dramaNameFromFile, EMPTY_NAME } from './name';
import { decideViews, UNDER, UNPARSEABLE } from './views';

export const NO_MATCH_STATUS = '没有匹配';
export const SEARCH_FAILED = '搜索失败';
export const MOVED_STATUS = '已移入输出文件夹';
export const WAIT = '稍后再试';
const STABLE_MS = 2000;

export interface WatchedFile {
  ino: number;
  birthtimeMs: number | null;
  size: number;
  name: string;
  path: string;
  kind: 'file' | 'dir' | 'symlink';
  source: string;
  hidden?: boolean;
}

export interface Identity {
  ino: number;
  birthtimeMs: number | null;
  key?: string;
}

export interface DoneRecord extends Identity {
  path: string;
  fileName: string;
  source: string;
  status: string;
  reason: string;
  max?: number;
  threshold?: number;
  target?: string;
}
interface Pending extends Identity {
  path: string;
  fileName: string;
  source: string;
  drama: string;
  phase: 'waiting' | 'handed' | 'move';
  stableSize: number;
  stableSince: number;
  handoffId?: string;
  max?: number;
  threshold?: number;
  said?: string;
}

export interface LedgerData {
  pending: Pending[];
  done: DoneRecord[];
  ignored: Identity[];
}

export type PollReply =
  | { action: 'search'; id: string; name: string }
  | { action: 'wait'; reason: string }
  | { action: 'none' };

export interface ExtensionResult {
  id: string;
  kind: 'views' | 'none' | 'error';
  views?: string[];
  reason?: string;
}

export function identityOf(file: {
  ino: number;
  birthtimeMs: number | null;
  path?: string;
}): Identity {
  if (file.ino > 0 && file.birthtimeMs !== null)
    return { ino: file.ino, birthtimeMs: file.birthtimeMs };
  return {
    ino: file.ino,
    birthtimeMs: file.birthtimeMs,
    key: file.path?.toLowerCase(),
  };
}

export function sameFile(left: Identity, right: Identity) {
  if (left.key !== undefined || right.key !== undefined) {
    if (!left.key || !right.key) return false;
    if (left.key !== right.key) return false;
    if (left.birthtimeMs === null || right.birthtimeMs === null) return true;
    return left.birthtimeMs === right.birthtimeMs;
  }
  if (left.ino !== right.ino) return false;
  if (left.birthtimeMs === null || right.birthtimeMs === null) return true;
  return left.birthtimeMs === right.birthtimeMs;
}

export const SYSTEM_FILE_NAMES = new Set([
  'desktop.ini',
  'thumbs.db',
  '$recycle.bin',
]);

export function isIgnoredName(name: string) {
  return name.startsWith('.') || SYSTEM_FILE_NAMES.has(name.toLowerCase());
}

function eligible(file: WatchedFile) {
  return file.kind === 'file' && !file.hidden && !isIgnoredName(file.name);
}

export class DramaQueue {
  readonly lines: string[] = [];
  private ids = 0;
  constructor(
    private data: LedgerData,
    private threshold: number,
  ) {
    for (const item of data.pending) {
      const number = Number(item.handoffId?.replace('handoff-', ''));
      if (number > this.ids) this.ids = number;
    }
  }

  static empty(threshold: number) {
    return new DramaQueue({ pending: [], done: [], ignored: [] }, threshold);
  }

  snapshot(): LedgerData {
    return structuredClone(this.data);
  }

  hasPending(): boolean {
    return this.data.pending.length > 0;
  }

  noteStartup(files: WatchedFile[]) {
    for (const file of files) {
      if (!eligible(file)) continue;
      const identity = identityOf(file);
      const pending = this.data.pending.find((item) =>
        sameFile(item, identity),
      );
      if (pending) {
        pending.path = file.path;
        pending.fileName = file.name;
        pending.source = file.source;
        continue;
      }
      if (this.data.done.some((item) => sameFile(item, identity))) continue;
      if (!this.data.ignored.some((item) => sameFile(item, identity)))
        this.data.ignored.push(identity);
    }
  }

  scan(files: WatchedFile[], now: number) {
    const present = new Set<Pending>();
    for (const file of files) {
      if (!eligible(file)) continue;
      const identity = identityOf(file);
      const pending = this.data.pending.find((item) =>
        sameFile(item, identity),
      );
      if (pending) {
        if (this.observe(pending, file, now)) present.add(pending);
        continue;
      }
      if (
        this.data.ignored.some((item) => sameFile(item, identity)) ||
        this.data.done.some((item) => sameFile(item, identity))
      )
        continue;
      const drama = dramaNameFromFile(file.name);
      if (!drama) {
        this.finish(file, EMPTY_NAME, '去掉扩展名后没有文字');
        continue;
      }
      const created: Pending = {
        ...identity,
        path: file.path,
        fileName: file.name,
        source: file.source,
        drama,
        phase: 'waiting',
        stableSize: file.size,
        stableSince: now,
      };
      this.data.pending.push(created);
      present.add(created);
    }
    this.data.pending = this.data.pending.filter((item) => present.has(item));
  }

  poll(input: { manual: boolean; busy: boolean }, now: number): PollReply {
    const head = this.data.pending[0];
    if (!head) return { action: 'none' };
    if (head.phase === 'handed') {
      if (!input.busy && !input.manual) this.release(head, now);
      else return this.wait(head, '在等扩展');
    }
    if (head.phase === 'move') return this.wait(head, '移动失败');
    if (input.manual || input.busy) return this.wait(head, '在等扩展');
    if (now - head.stableSince < STABLE_MS)
      return this.wait(head, '在等文件稳定');
    head.phase = 'handed';
    head.handoffId = `handoff-${++this.ids}`;
    return { action: 'search', id: head.handoffId, name: head.drama };
  }

  complete(result: ExtensionResult) {
    const head = this.data.pending[0];
    if (!head || head.phase !== 'handed' || head.handoffId !== result.id)
      return;
    if (result.kind === 'error') {
      this.finishPending(head, SEARCH_FAILED, result.reason || '搜索失败');
      return;
    }
    if (result.kind === 'none') {
      this.finishPending(
        head,
        NO_MATCH_STATUS,
        result.reason || '这次搜索没有匹配',
      );
      return;
    }
    const decision = decideViews(result.views ?? [], this.threshold);
    if (decision.kind === 'unparseable') {
      this.finishPending(head, UNPARSEABLE, '无法解析播放量');
      return;
    }
    if (decision.kind === 'under') {
      head.max = decision.max;
      this.finishPending(
        head,
        UNDER,
        `最大播放量 ${decision.max}，阈值 ${this.threshold}`,
      );
      return;
    }
    head.phase = 'move';
    head.max = decision.max;
    head.threshold = this.threshold;
  }

  moveTarget() {
    const head = this.data.pending[0];
    if (head?.phase !== 'move' || head.max === undefined) return null;
    return {
      path: head.path,
      max: head.max,
      threshold: this.threshold,
    };
  }

  moveDone(ok: boolean, target?: string) {
    const head = this.data.pending[0];
    if (head?.phase !== 'move' || head.max === undefined) return;
    if (!ok) {
      this.wait(head, '移动失败');
      return;
    }
    this.finishPending(
      head,
      MOVED_STATUS,
      `最大播放量 ${head.max}，阈值 ${this.threshold}`,
      target,
    );
  }

  private observe(pending: Pending, file: WatchedFile, now: number): boolean {
    const changed =
      pending.fileName !== file.name || pending.stableSize !== file.size;
    pending.path = file.path;
    pending.source = file.source;
    if (pending.phase === 'handed' && changed) {
      this.release(pending, now);
      pending.fileName = file.name;
      pending.stableSize = file.size;
      const drama = dramaNameFromFile(file.name);
      if (!drama) {
        this.finish(file, EMPTY_NAME, '去掉扩展名后没有文字');
        return false;
      }
      pending.drama = drama;
      return true;
    }
    if (pending.phase === 'move' && changed) {
      pending.phase = 'waiting';
      pending.max = undefined;
      pending.fileName = file.name;
      pending.stableSize = file.size;
      pending.stableSince = now;
      const drama = dramaNameFromFile(file.name);
      if (drama) pending.drama = drama;
      return true;
    }
    pending.fileName = file.name;
    if (pending.phase === 'waiting') {
      const drama = dramaNameFromFile(file.name);
      if (!drama) {
        this.finish(file, EMPTY_NAME, '去掉扩展名后没有文字');
        return false;
      }
      pending.drama = drama;
      if (pending.stableSize !== file.size) {
        pending.stableSize = file.size;
        pending.stableSince = now;
      }
    }
    return true;
  }

  private release(pending: Pending, now: number) {
    pending.phase = 'waiting';
    pending.handoffId = undefined;
    pending.stableSince = now;
  }

  private wait(item: Pending, reason: string): PollReply {
    this.say(item, WAIT, reason);
    return { action: 'wait', reason };
  }

  private finish(file: WatchedFile, status: string, reason: string) {
    this.data.done.push({
      ...identityOf(file),
      path: file.path,
      fileName: file.name,
      source: file.source,
      status,
      reason,
    });
    this.sayFile(file, status, reason);
  }

  private finishPending(
    item: Pending,
    status: string,
    reason: string,
    target?: string,
  ) {
    this.data.pending = this.data.pending.filter((entry) => entry !== item);
    this.data.done.push({
      ...identityOf(item),
      path: item.path,
      fileName: item.fileName,
      source: item.source,
      status,
      reason,
      max: item.max,
      threshold: this.threshold,
      target,
    });
    this.say(item, status, reason);
  }

  private sayFile(file: WatchedFile, status: string, reason: string) {
    this.lines.push(`${file.source}\t${file.name}\t${status}\t${reason}`);
  }

  private say(item: Pending, status: string, reason: string) {
    const line = `${item.source}\t${item.fileName}\t${status}\t${reason}`;
    if (item.said === line) return;
    item.said = line;
    this.lines.push(line);
  }
}
