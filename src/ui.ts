import './ui.css';
import { controlState } from './gate';
import { parseDramaNames, type Job } from './model';
import { renderResultRows, resultRows } from './rows';
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let job: Job | null = null,
  page = 0,
  busy = false,
  scriptOn = false,
  scriptRunning = false;
const pageSize = 20;
const statusLabel: Record<string, string> = {
  running: '搜索中',
  completed: '已结束',
};
function notice(text: string) {
  el('notice').textContent = text;
  el('notice').hidden = !text;
}
function inExtension() {
  return !!globalThis.chrome?.runtime?.id;
}
async function rpc(type: string, extra: Record<string, unknown> = {}) {
  if (!inExtension())
    throw new Error('请在 Chrome 扩展中打开此页面；普通网页预览不能启动搜索。');
  const data = await chrome.runtime.sendMessage({ type, ...extra });
  if (!data?.ok) throw new Error(data?.error ?? '后台未响应，请重新加载扩展');
  job = data.job;
  scriptOn = data.scriptOn === true;
  scriptRunning = data.scriptRunning === true;
  if (data.fatal) notice(String(data.fatal));
  render();
}
async function action(type: string, extra: Record<string, unknown> = {}) {
  if (busy) return;
  busy = true;
  notice('');
  render();
  try {
    await rpc(type, extra);
  } catch (error) {
    notice((error as Error).message);
  } finally {
    busy = false;
    render();
  }
}
el('start').addEventListener('click', () => {
  if (busy || job?.status === 'running') return;
  if (scriptRunning) {
    notice('正在由脚本搜索，请等待结束。');
    return;
  }
  let names: string[];
  try {
    names = parseDramaNames(el<HTMLTextAreaElement>('names').value);
  } catch (error) {
    notice((error as Error).message);
    return;
  }
  notice('');
  void action('start', { names });
});
el('clear').addEventListener('click', () => {
  if (window.confirm('停止当前搜索并清除这次结果？')) void action('clear');
});
el('script-switch').addEventListener('change', () => {
  const box = el<HTMLInputElement>('script-switch');
  box.disabled = true;
  void action('switch', { on: box.checked }).finally(() => {
    box.disabled = false;
  });
});
el('previous').addEventListener('click', () => {
  page--;
  render();
});
el('next').addEventListener('click', () => {
  page++;
  render();
});
function render() {
  const state = controlState({ job, scriptOn, scriptRunning, busy });
  el<HTMLInputElement>('script-switch').checked = scriptOn;
  el('script-state').textContent = state.switchLabel;
  el<HTMLButtonElement>('start').disabled = state.startDisabled;
  el<HTMLTextAreaElement>('names').disabled = state.namesDisabled;
  el('job-panel').hidden = !state.showJobPanel;
  el('empty-state').hidden = !!job;
  el('table-wrap').hidden = !state.showResults;
  el('entry-summary').textContent = state.summary;
  if (!job) {
    el('result-count').textContent = '等待搜索';
    return;
  }
  if (job.origin === 'script') {
    el('job-panel').hidden = true;
    el('table-wrap').hidden = true;
    el('empty-state').hidden = false;
    el('result-count').textContent = '由脚本搜索';
    el('job-notice').textContent = '';
    return;
  }
  const done = job.dramas.filter(
    (drama) => drama.status === 'done' || drama.status === 'failed',
  ).length;
  el('job-status').textContent = statusLabel[job.status] ?? job.status;
  el('metric-progress').textContent = `${done} / ${job.dramas.length}`;
  el('metric-videos').textContent = String(
    job.dramas.reduce((sum, drama) => sum + drama.results.length, 0),
  );
  el('metric-failed').textContent = String(
    job.dramas.filter((drama) => drama.status === 'failed').length,
  );
  el('metric-current').textContent = job.dramas[job.cursor]?.name ?? '—';
  el<HTMLProgressElement>('progress').max = Math.max(1, job.dramas.length);
  el<HTMLProgressElement>('progress').value = done;
  el('job-notice').textContent =
    job.notice ||
    (job.status === 'running'
      ? '正在 YouTube 搜索页查找标题包含剧名的视频。'
      : '');
  el<HTMLButtonElement>('clear').disabled = state.clearDisabled;
  const data = resultRows(job),
    pages = Math.max(1, Math.ceil(data.length / pageSize));
  page = Math.max(0, Math.min(page, pages - 1));
  el('result-count').textContent = `${data.length} 条记录`;
  renderResultRows(
    el('results'),
    data.slice(page * pageSize, (page + 1) * pageSize),
  );
  el('page-info').textContent =
    `第 ${page + 1} / ${pages} 页 · 每页 ${pageSize} 条`;
  el<HTMLButtonElement>('previous').disabled = page === 0;
  el<HTMLButtonElement>('next').disabled = page >= pages - 1;
}
async function refresh() {
  if (inExtension() && !busy) {
    try {
      await rpc('snapshot');
    } catch (error) {
      notice((error as Error).message);
    }
  }
  setTimeout(() => {
    void refresh();
  }, 1500);
}
if (inExtension()) chrome.runtime.connect({ name: 'control' });
void refresh();
