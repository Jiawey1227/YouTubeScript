import { describe, expect, it } from 'vitest';
import { Engine, type Driver } from '../src/engine';
import { NO_MATCH, searchUrl, type Job, type PageResult } from '../src/model';
import type { JobStore } from '../src/store';

class Memory implements JobStore {
  value: Job | null = null;
  async load() {
    return this.value ? structuredClone(this.value) : null;
  }
  async save(job: Job) {
    this.value = structuredClone(job);
  }
  async clear() {
    this.value = null;
  }
}

function setup() {
  const store = new Memory();
  const navigations: { id: number; url: string }[] = [];
  const created: number[] = [];
  let scriptTab: number | undefined;
  let tabs = 100;
  const driver: Driver = {
    async createTab() {
      const id = ++tabs;
      created.push(id);
      return id;
    },
    async navigate(id, url) {
      navigations.push({ id, url });
    },
    async schedule() {},
    async cancel() {},
    async scriptTab() {
      return scriptTab;
    },
    async rememberScriptTab(id) {
      scriptTab = id;
    },
  };
  const engine = new Engine(store, driver, () => 1000);
  const receive = async (result: PageResult) => {
    const last = navigations.at(-1)!;
    const claim = await engine.claim(last.id, 'doc');
    if (!claim) throw new Error('No claim');
    await engine.receive(claim.jobId, claim.step.id, last.id, 'doc', result);
  };
  return {
    store,
    engine,
    navigations,
    created,
    receive,
    scriptTab: () => scriptTab,
  };
}

const hit = (id: string, title: string, viewText: string | null) => ({
  videoId: id,
  title,
  rank: 1,
  viewText,
  relativeTime: '22小时前',
});

describe('脚本搜索', () => {
  it('连续两部剧复用同一个后台标签', async () => {
    const s = setup();
    await s.engine.startScript('甲剧', 'handoff-1');
    expect(s.navigations[0].url).toBe(searchUrl('甲剧'));
    await s.receive({
      kind: 'search',
      hits: [hit('abcdefghijk', '甲剧', '10')],
    });
    expect(await s.engine.takeScriptResult()).toEqual({
      id: 'handoff-1',
      kind: 'views',
      views: ['10'],
      reason: '',
    });
    await s.engine.clear();
    await s.engine.startScript('乙剧', 'handoff-2');
    expect(s.created).toHaveLength(1);
    expect(s.navigations[1].id).toBe(s.navigations[0].id);
  });

  it('脚本结果只交一次，没有匹配和失败分别返回', async () => {
    const s = setup();
    await s.engine.startScript('甲剧', 'handoff-1');
    await s.receive({ kind: 'search', hits: [] });
    expect(await s.engine.takeScriptResult()).toEqual({
      id: 'handoff-1',
      kind: 'none',
      reason: NO_MATCH,
    });
    expect(await s.engine.takeScriptResult()).toBeNull();
    await s.engine.clear();
    await s.engine.startScript('乙剧', 'handoff-2');
    await s.receive({
      kind: 'error',
      reason: '页面出现验证码',
      retryable: false,
      blocked: true,
    });
    expect(await s.engine.takeScriptResult()).toEqual({
      id: 'handoff-2',
      kind: 'error',
      reason: '页面出现验证码',
    });
  });

  it('脚本搜索时控制页不能开始或清除，关掉控制页不会取消脚本搜索', async () => {
    const s = setup();
    await s.engine.startScript('甲剧', 'handoff-1');
    await expect(s.engine.start(['乙剧'])).rejects.toThrow('正在由脚本搜索');
    await expect(s.engine.clear()).rejects.toThrow('不能清除');
    await s.engine.clearManual();
    expect(s.store.value?.origin).toBe('script');
    expect(s.store.value?.status).toBe('running');
    const snapshot = await s.engine.snapshot();
    expect(snapshot.scriptRunning).toBe(true);
    expect(snapshot.manualRunning).toBe(false);
  });

  it('手工搜索仍由关闭控制页清除', async () => {
    const s = setup();
    await s.engine.start(['甲剧']);
    const snapshot = await s.engine.snapshot();
    expect(snapshot.manualRunning).toBe(true);
    await s.engine.clearManual();
    expect(s.store.value).toBeNull();
  });
});
