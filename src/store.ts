import type { Drama, Job } from './model';
export interface JobStore {
  load(): Promise<Job | null>;
  save(job: Job): Promise<void>;
  clear(): Promise<void>;
}
export class IndexedJobStore implements JobStore {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = 'youtube-drama-collector') {}
  private db(): Promise<IDBDatabase> {
    return (this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('job');
        request.result.createObjectStore('dramas');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }
  async load(): Promise<Job | null> {
    const job = await this.read();
    if (job && job.version !== 2) {
      await this.clear();
      return null;
    }
    return job;
  }
  private async read(): Promise<Job | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['job', 'dramas'], 'readonly');
      const root = tx.objectStore('job').get('current');
      const rows = tx.objectStore('dramas').getAll();
      tx.oncomplete = () => {
        if (!root.result) {
          resolve(null);
          return;
        }
        const dramas = rows.result as { index: number; drama: Drama }[];
        resolve({
          ...root.result,
          dramas: dramas.sort((a, b) => a.index - b.index).map((r) => r.drama),
        });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('读取任务失败'));
    });
  }
  async save(job: Job): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['job', 'dramas'], 'readwrite');
      const { dramas, ...root } = job;
      const rootStore = tx.objectStore('job');
      const dramaStore = tx.objectStore('dramas');
      rootStore.put(root, 'current');
      // Replace the per-drama records in the same transaction so stale rows from
      // a cleared or replaced job cannot reappear after reload.
      dramaStore.clear();
      dramas.forEach((drama, index) => {
        dramaStore.put({ index, drama }, `${job.id}:${index}`);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('保存任务失败'));
    });
  }
  async clear(): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['job', 'dramas'], 'readwrite');
      tx.objectStore('job').clear();
      tx.objectStore('dramas').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
