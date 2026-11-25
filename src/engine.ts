import {
  createJob,
  missing,
  NO_MATCH,
  searchUrl,
  titleContainsDramaName,
  type Job,
  type PageResult,
  type SearchHit,
  type Step,
  type VideoResult,
} from './model';
import type { JobStore } from './store';
export interface Driver {
  createTab(): Promise<number>;
  navigate(tabId: number, url: string): Promise<void>;
  schedule(at: number): Promise<void>;
  cancel(): Promise<void>;
  scriptTab?(): Promise<number | undefined>;
  rememberScriptTab?(tabId: number | undefined): Promise<void>;
}

export interface ScriptResult {
  id: string;
  kind: 'views' | 'none' | 'error';
  views?: string[];
  reason?: string;
}
export class Engine {
  private chain: Promise<unknown> = Promise.resolve();
  fatal = '';
  constructor(
    private store: JobStore,
    private driver: Driver,
    private now = () => Date.now(),
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work);
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async save(job: Job) {
    job.updatedAt = new Date(this.now()).toISOString();
    try {
      await this.store.save(job);
    } catch {
      this.fatal = '本机存储失败，已停止搜索。';
      await this.driver.cancel();
      throw new Error(this.fatal);
    }
  }
  snapshot() {
    return this.serial(async () => {
      const job = await this.store.load();
      return {
        job,
        fatal: this.fatal,
        scriptRunning: job?.status === 'running' && job.origin === 'script',
        manualRunning: job?.status === 'running' && job.origin === 'manual',
      };
    });
  }
  startup() {
    return this.serial(async () => {
      this.fatal = '';
      await this.driver.cancel();
      await this.store.clear();
    });
  }
  start(names: string[]) {
    return this.serial(async () => {
      const existing = await this.store.load();
      if (existing?.status === 'running')
        throw new Error(
          existing.origin === 'script'
            ? '正在由脚本搜索，请等待结束'
            : '正在搜索，请等待结束',
        );
      this.fatal = '';
      const job = createJob(names, this.now());
      await this.save(job);
      await this.advance(job);
    });
  }
  startScript(name: string, requestId: string) {
    return this.serial(async () => {
      const existing = await this.store.load();
      if (existing?.status === 'running')
        throw new Error('正在搜索，请等待结束');
      this.fatal = '';
      const job = createJob([name], this.now());
      job.origin = 'script';
      job.scriptRequestId = requestId;
      await this.save(job);
      await this.advance(job);
    });
  }
  takeScriptResult(): Promise<ScriptResult | null> {
    return this.serial(async () => {
      const job = await this.store.load();
      if (
        !job ||
        job.origin !== 'script' ||
        job.scriptReported ||
        !job.scriptRequestId
      )
        return null;
      const drama = job.dramas[0];
      if (!drama || (drama.status !== 'done' && drama.status !== 'failed'))
        return null;
      job.scriptReported = true;
      await this.save(job);
      if (drama.status === 'failed')
        return {
          id: job.scriptRequestId,
          kind: 'error',
          reason: drama.reason,
        };
      if (!drama.results.length)
        return {
          id: job.scriptRequestId,
          kind: 'none',
          reason: drama.reason || NO_MATCH,
        };
      return {
        id: job.scriptRequestId,
        kind: 'views',
        views: drama.results
          .map((result) => result.viewText.value)
          .filter((value): value is string => !!value),
        reason: '',
      };
    });
  }
  clear() {
    return this.serial(async () => {
      const job = await this.store.load();
      if (job?.status === 'running' && job.origin === 'script')
        throw new Error('正在由脚本搜索，不能清除');
      await this.driver.cancel();
      this.fatal = '';
      await this.store.clear();
    });
  }
  clearManual() {
    return this.serial(async () => {
      const job = await this.store.load();
      if (job?.status === 'running' && job.origin === 'script') return;
      await this.driver.cancel();
      this.fatal = '';
      await this.store.clear();
    });
  }
  failCurrent(tabId: number, reason: string, dropTab = false) {
    return this.serial(async () => {
      if (this.fatal) return;
      const job = await this.store.load();
      if (!job || job.status !== 'running' || job.tabId !== tabId || !job.step)
        return;
      if (dropTab) job.tabId = undefined;
      await this.apply(job, {
        kind: 'error',
        reason,
        retryable: false,
        blocked: false,
      });
    });
  }
  tick() {
    return this.serial(async () => {
      if (this.fatal) return;
      const job = await this.store.load();
      if (!job || job.status !== 'running') return;
      if (!job.step) {
        await this.advance(job);
        return;
      }
      if (job.step.phase === 'prepared') {
        await this.dispatch(job);
        return;
      }
      if (job.step.deadline <= this.now())
        await this.apply(job, {
          kind: 'error',
          reason: '页面读取超时或结构无法识别',
          retryable: false,
          blocked: false,
        });
      else await this.driver.schedule(job.step.deadline);
    });
  }
  claim(
    tabId: number,
    documentId: string,
  ): Promise<{ jobId: string; step: Step } | null> {
    return this.serial(async () => {
      if (this.fatal) return null;
      const job = await this.store.load();
      if (
        !job ||
        job.status !== 'running' ||
        job.tabId !== tabId ||
        !job.step ||
        job.step.phase === 'reading'
      )
        return null;
      job.step.documentId = documentId;
      job.step.phase = 'reading';
      job.step.deadline = this.now() + 32000;
      await this.save(job);
      await this.driver.schedule(job.step.deadline);
      return { jobId: job.id, step: job.step };
    });
  }
  receive(
    jobId: string,
    stepId: string,
    tabId: number,
    documentId: string,
    result: PageResult,
  ) {
    return this.serial(async () => {
      if (this.fatal) return;
      const job = await this.store.load();
      if (
        !job ||
        job.id !== jobId ||
        job.tabId !== tabId ||
        job.step?.id !== stepId ||
        job.step.documentId !== documentId
      )
        return;
      if (job.status !== 'running') return;
      await this.apply(job, result);
    });
  }
  private async advance(job: Job) {
    if (this.fatal || job.status !== 'running') return;
    if (job.cursor >= job.dramas.length) {
      job.status = 'completed';
      job.step = undefined;
      job.notice = '搜索已结束';
      await this.save(job);
      await this.driver.cancel();
      return;
    }
    const drama = job.dramas[job.cursor];
    drama.status = 'searching';
    job.step = {
      kind: 'search',
      url: searchUrl(drama.name),
      name: drama.name,
      id: crypto.randomUUID(),
      attempt: 0,
      phase: 'prepared',
      deadline: this.now() + 30000,
    };
    await this.save(job);
    await this.dispatch(job);
  }
  private async dispatch(job: Job) {
    if (!job.step || job.status !== 'running') return;
    try {
      if (job.tabId === undefined)
        job.tabId =
          job.origin === 'script'
            ? ((await this.driver.scriptTab?.()) ??
              (await this.driver.createTab()))
            : await this.driver.createTab();
      if (job.origin === 'script')
        await this.driver.rememberScriptTab?.(job.tabId);
      job.step.phase = 'loading';
      job.step.deadline = this.now() + 30000;
      await this.save(job);
      await this.driver.schedule(job.step.deadline);
      await this.driver.navigate(job.tabId, job.step.url);
    } catch (error) {
      if (this.fatal) throw error;
      if (job.origin === 'script')
        await this.driver.rememberScriptTab?.(undefined);
      job.tabId = undefined;
      await this.apply(job, {
        kind: 'error',
        reason: '无法打开搜索页',
        retryable: false,
        blocked: false,
      });
    }
  }
  private async apply(job: Job, result: PageResult) {
    const drama = job.dramas[job.cursor];
    if (!drama || !job.step) return;
    drama.searched = true;
    if (result.kind === 'error') {
      drama.status = 'failed';
      drama.reason = result.reason;
      drama.results = [];
    } else {
      drama.results = this.matches(drama.name, result.hits);
      drama.status = 'done';
      drama.reason = drama.results.length ? '' : NO_MATCH;
    }
    job.step = undefined;
    job.cursor++;
    await this.save(job);
    if (job.status === 'running') await this.advance(job);
  }
  private matches(name: string, hits: SearchHit[]) {
    const seen = new Set<string>(),
      results: VideoResult[] = [];
    for (const hit of hits) {
      if (
        !/^[\w-]{11}$/.test(hit.videoId) ||
        seen.has(hit.videoId) ||
        !titleContainsDramaName(hit.title, name)
      )
        continue;
      seen.add(hit.videoId);
      results.push({
        drama: name,
        videoId: hit.videoId,
        title: hit.title,
        rank: results.length + 1,
        viewText: hit.viewText
          ? { value: hit.viewText, source: 'search-card', reason: '' }
          : missing('不可用'),
        relativeTime: hit.relativeTime
          ? { value: hit.relativeTime, source: 'search-card', reason: '' }
          : missing('不可用'),
      });
    }
    return results;
  }
}
