import { videoUrl, type Job } from './model';

export interface ResultRow {
  drama: string;
  title: string;
  views: string;
  relativeTime: string;
  href: string;
  status: string;
  detail: string;
}
const dramaStatus: Record<Job['dramas'][number]['status'], string> = {
  pending: '待搜索',
  searching: '搜索中',
  done: '已完成',
  failed: '失败',
};
export function resultRows(job: Job): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const drama of job.dramas) {
    for (const video of drama.results) {
      rows.push({
        drama: drama.name,
        title: video.title,
        href: videoUrl(video.videoId),
        status: '匹配',
        detail: '',
        views: video.viewText.value ?? '不可用',
        relativeTime: video.relativeTime.value ?? '不可用',
      });
    }
    if (drama.status === 'failed')
      rows.push({
        drama: drama.name,
        title: '',
        views: '',
        relativeTime: '',
        href: '',
        status: '失败',
        detail: drama.reason,
      });
    else if (drama.status === 'done' && !drama.results.length)
      rows.push({
        drama: drama.name,
        title: '',
        views: '',
        relativeTime: '',
        href: '',
        status: '没有匹配',
        detail: drama.reason,
      });
    else if (!drama.results.length && drama.status !== 'done')
      rows.push({
        drama: drama.name,
        title: '',
        views: '',
        relativeTime: '',
        href: '',
        status: dramaStatus[drama.status],
        detail: '',
      });
  }
  return rows;
}
export function renderResultRows(target: HTMLElement, rows: ResultRow[]) {
  const doc = target.ownerDocument;
  while (target.firstChild) target.removeChild(target.firstChild);
  for (const row of rows) {
    const tr = doc.createElement('tr');
    const values = [
      row.drama,
      row.title,
      row.views,
      row.relativeTime,
      row.status,
    ];
    values.forEach((value, index) => {
      const td = doc.createElement('td');
      if (index === 1 && row.href) {
        const link = doc.createElement('a');
        link.textContent = row.title;
        link.href = row.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        td.appendChild(link);
      } else td.textContent = value || '—';
      if (index === 4 && row.detail) {
        const note = doc.createElement('small');
        note.textContent = row.detail;
        td.appendChild(note);
      }
      tr.appendChild(td);
    });
    const linkCell = doc.createElement('td');
    if (row.href) {
      const link = doc.createElement('a');
      link.textContent = '打开视频';
      link.href = row.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      linkCell.appendChild(link);
    } else linkCell.textContent = '—';
    tr.appendChild(linkCell);
    target.appendChild(tr);
  }
}
