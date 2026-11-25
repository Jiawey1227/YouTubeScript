import { describe, expect, it } from 'vitest';
import { Engine, type Driver } from '../src/engine';
import {
  NO_MATCH,
  searchUrl,
  type Job,
  type PageResult,
  type SearchHit,
} from '../src/model';
import type { JobStore } from '../src/store';
class Memory implements JobStore {
  value: Job | null = null;
  fail = false;
  async load() {
    return this.value ? structuredClone(this.value) : null;
  }
  async save(job: Job) {
    if (this.fail) throw new Error('quota');
    this.value = structuredClone(job);
  }
  async clear() {
    this.value = null;
  }
}
function setup() {
  const store = new Memory();
  let now = 100000;
  const navigations: { id: number; url: string }[] = [];
  let scheduled = 0;
  let tabs = 54;
  const driver: Driver = {
    async createTab() {
      return ++tabs;
    },
    async navigate(id, url) {
      navigations.push({ id, url });
    },
    async schedule(at) {
      scheduled = at;
    },
    async cancel() {
      scheduled = 0;
    },
  };
  let engine = new Engine(store, driver, () => now);
  const receive = async (result: PageResult) => {
    const claim = await engine.claim(navigations.at(-1)!.id, 'doc');
    if (!claim) throw new Error('No claim');
    await engine.receive(
      claim.jobId,
      claim.step.id,
      navigations.at(-1)!.id,
      'doc',
      result,
    );
    return claim;
  };
  return {
    store,
    navigations,
    get engine() {
      return engine;
    },
    receive,
    async tick() {
      now = Math.max(now + 1000, scheduled);
      await engine.tick();
    },
    restart() {
      engine = new Engine(store, driver, () => now);
    },
    now: () => now,
  };
}
const hit = (
  id: string,
  title: string,
  viewText: string | null,
  relativeTime: string | null,
): SearchHit => ({ videoId: id, title, rank: 1, viewText, relativeTime });
const search = (hits: SearchHit[]): PageResult => ({ kind: 'search', hits });
describe('只搜索不进详情页', () => {
  it('每个剧名只打开搜索页', async () => {
    const s = setup();
    await s.engine.start(['冰山学姐沦陷了']);
    expect(s.navigations.map((item) => item.url)).toEqual([
      searchUrl('冰山学姐沦陷了'),
    ]);
    await s.receive(
      search([
        hit('abcdefghijk', '故事《冰山学姐沦陷了》', '6659次播放', '22小时前'),
      ]),
    );
    expect(s.navigations.every((item) => !item.url.includes('/watch'))).toBe(
      true,
    );
    expect(s.store.value?.dramas[0].results[0]).toMatchObject({
      viewText: { value: '6659次播放' },
      relativeTime: { value: '22小时前' },
    });
    expect(s.store.value?.status).toBe('completed');
  });
  it('后台保留标点不同的标题，不把内容脚本收下的结果丢掉', async () => {
    const s = setup();
    await s.engine.start(['冰山学姐沦陷了']);
    await s.receive(
      search([
        hit('abcdefghijk', '冰山学姐，沦陷了', '6659次播放', '22小时前'),
        hit('bbbbbbbbbbb', '冰山学姐没有沦陷了', '1次播放', '1小时前'),
      ]),
    );
    expect(
      s.store.value?.dramas[0].results.map((result) => result.title),
    ).toEqual(['冰山学姐，沦陷了']);
  });
  it('按页面顺序保留全部匹配，没有匹配时不声称全站没有视频', async () => {
    const s = setup();
    await s.engine.start(['甲剧']);
    await s.receive(
      search([
        hit('aaaaaaaaaaa', '无关', '1次播放', '1小时前'),
        hit('bbbbbbbbbbb', '甲剧上', '2次播放', '2小时前'),
        hit('ccccccccccc', '甲剧下', null, '3小时前'),
      ]),
    );
    const drama = s.store.value?.dramas[0];
    expect(drama?.results.map((result) => result.videoId)).toEqual([
      'bbbbbbbbbbb',
      'ccccccccccc',
    ]);
    expect(drama?.results[1].viewText.value).toBeNull();
    await s.engine.start(['乙剧']);
    await s.receive(search([]));
    expect(s.store.value?.dramas[0].reason).toBe(NO_MATCH);
    expect(s.store.value?.dramas[0].reason).not.toContain('全站');
  });
  it('后一个剧名失败时保留前一个结果，并且不进入暂停等待', async () => {
    const s = setup();
    await s.engine.start(['甲剧', '乙剧']);
    await s.receive(
      search([hit('abcdefghijk', '甲剧全集', '10次播放', '1天前')]),
    );
    await s.receive({
      kind: 'error',
      reason: '页面出现验证码，请手动处理后继续',
      retryable: false,
      blocked: true,
    });
    expect(s.store.value?.dramas[0].results).toHaveLength(1);
    expect(s.store.value?.dramas[1].status).toBe('failed');
    expect(s.store.value?.dramas[1].reason).toContain('验证码');
    expect(s.store.value?.status).toBe('completed');
    expect(s.store.value?.status).not.toBe('paused');
    expect(s.navigations.every((item) => !item.url.includes('/watch'))).toBe(
      true,
    );
  });
  it('搜索超时后继续后续剧名，不重复打开详情页', async () => {
    const s = setup();
    await s.engine.start(['甲剧', '乙剧']);
    await s.tick();
    expect(
      s.navigations.filter((item) => item.url === searchUrl('甲剧')),
    ).toHaveLength(1);
    expect(s.store.value?.dramas[0].status).toBe('failed');
    expect(s.navigations.at(-1)?.url).toBe(searchUrl('乙剧'));
    expect(s.navigations.every((item) => !item.url.includes('/watch'))).toBe(
      true,
    );
  });
  it('启动时清除已有任务，不继续导航', async () => {
    const s = setup();
    await s.engine.start(['甲剧']);
    const count = s.navigations.length;
    s.restart();
    await s.engine.startup();
    expect(s.store.value).toBeNull();
    await s.engine.tick();
    expect(s.navigations).toHaveLength(count);
    expect(s.navigations.every((item) => !item.url.includes('/watch'))).toBe(
      true,
    );
  });
  it('清除后迟到结果不能恢复任务', async () => {
    const s = setup();
    await s.engine.start(['甲剧']);
    const claim = await s.engine.claim(s.navigations.at(-1)!.id, 'doc');
    await s.engine.clear();
    await s.engine.receive(
      claim!.jobId,
      claim!.step.id,
      s.navigations.at(-1)!.id,
      'doc',
      search([hit('abcdefghijk', '甲剧', '1次播放', '1小时前')]),
    );
    expect(s.store.value).toBeNull();
  });
  it('存储失败停止推进', async () => {
    const s = setup();
    await s.engine.start(['甲剧']);
    s.store.fail = true;
    await expect(s.receive(search([]))).rejects.toThrow('存储失败');
    await s.engine.tick();
    expect(s.navigations).toHaveLength(1);
    expect((await s.engine.snapshot()).job).not.toBeNull();
  });
});
