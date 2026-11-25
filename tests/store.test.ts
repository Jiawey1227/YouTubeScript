import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { IndexedJobStore } from '../src/store';
import { createJob } from '../src/model';
it('重新连接后恢复任务，更新单剧记录不会重复并能清除', async () => {
  const name = crypto.randomUUID(),
    store = new IndexedJobStore(name),
    job = createJob(['甲', '乙']);
  await store.save(job);
  const reopened = new IndexedJobStore(name);
  expect(await reopened.load()).toEqual(job);
  job.dramas[0].reason = '测试';
  await store.save(job);
  await store.save(job);
  expect((await reopened.load())?.dramas).toHaveLength(2);
  expect((await reopened.load())?.dramas[0].reason).toBe('测试');
  await store.clear();
  expect(await reopened.load()).toBeNull();
});
it('读取旧版任务时清除，不把旧任务交还调用方', async () => {
  const name = crypto.randomUUID(),
    store = new IndexedJobStore(name);
  await store.save(createJob(['甲']));
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('job', 'readwrite');
    const request = tx.objectStore('job').get('current');
    request.onsuccess = () => {
      tx.objectStore('job').put({ ...request.result, version: 1 }, 'current');
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  expect(await store.load()).toBeNull();
  expect(await new IndexedJobStore(name).load()).toBeNull();
});
it('新任务原子替换旧任务，不残留旧剧名记录', async () => {
  const name = crypto.randomUUID(),
    store = new IndexedJobStore(name);
  await store.save(createJob(['甲', '乙', '丙'], 1));
  const replacement = createJob(['丁'], 2);
  await store.save(replacement);
  expect(await store.load()).toEqual(replacement);
  expect((await store.load())?.dramas.map((d) => d.name)).toEqual(['丁']);
});
