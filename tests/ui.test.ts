import { createDocument } from '@mixmark-io/domino';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { controlState } from '../src/gate';
import { createJob, missing, NO_MATCH } from '../src/model';
import { renderResultRows, resultRows } from '../src/rows';

const html = readFileSync('index.html', 'utf8');
const doc = createDocument(html) as unknown as Document;

describe('控制页结构', () => {
  it('提供剧名输入、结果表和脚本开关，不再要求 CSV、暂停或导出', () => {
    expect(doc.getElementById('names')?.tagName).toBe('TEXTAREA');
    expect(doc.getElementById('start')).not.toBeNull();
    expect(doc.getElementById('results')).not.toBeNull();
    expect(doc.getElementById('script-switch')?.tagName).toBe('INPUT');
    expect(doc.getElementById('script-state')).not.toBeNull();
    expect(doc.getElementById('notice')?.getAttribute('role')).toBe('status');
    for (const id of ['csv-file', 'pause', 'resume', 'export', 'column'])
      expect(doc.getElementById(id), id).toBeNull();
    expect(html).not.toMatch(/CSV|暂停|继续|超过 1 小时|前 10|3600/);
  });
});

describe('脚本搜索时的控制页状态', () => {
  const job = createJob(['甲剧']);
  it('开关打开时仍可手工开始，脚本结果不进结果表', () => {
    const idle = controlState({
      job: null,
      scriptOn: true,
      scriptRunning: false,
      busy: false,
    });
    expect(idle.switchLabel).toBe('已打开');
    expect(idle.startDisabled).toBe(false);
    expect(idle.showResults).toBe(false);
    const scripted = controlState({
      job: { ...job, origin: 'script' },
      scriptOn: true,
      scriptRunning: true,
      busy: false,
    });
    expect(scripted.startDisabled).toBe(true);
    expect(scripted.clearDisabled).toBe(true);
    expect(scripted.showResults).toBe(false);
    expect(scripted.showJobPanel).toBe(false);
    expect(scripted.summary).toContain('正在由脚本搜索');
  });
});

describe('结果行', () => {
  it('同时展示匹配、没有匹配和失败，网页标题按文本写入', () => {
    const job = createJob(['冰山学姐沦陷了', '没有的剧', '失败剧']);
    job.dramas[0].status = 'done';
    job.dramas[0].results.push({
      drama: '冰山学姐沦陷了',
      videoId: 'abcdefghijk',
      title: '<script>alert(1)</script>《冰山学姐沦陷了》',
      rank: 1,
      viewText: { value: '6659次播放', source: 'search-card', reason: '' },
      relativeTime: { value: '22小时前', source: 'search-card', reason: '' },
    });
    job.dramas[1].status = 'done';
    job.dramas[1].reason = NO_MATCH;
    job.dramas[2].status = 'failed';
    job.dramas[2].reason = '页面无法读取';
    job.dramas.push({
      name: '缺字段',
      status: 'done',
      searched: true,
      reason: '',
      results: [
        {
          drama: '缺字段',
          videoId: 'bbbbbbbbbbb',
          title: '缺字段',
          rank: 1,
          viewText: missing('不可用'),
          relativeTime: { value: '1天前', source: 'search-card', reason: '' },
        },
      ],
    });
    const rows = resultRows(job);
    expect(rows.map((row) => row.status)).toEqual([
      '匹配',
      '没有匹配',
      '失败',
      '匹配',
    ]);
    expect(rows[0]).toMatchObject({
      views: '6659次播放',
      relativeTime: '22小时前',
      href: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(rows[1].detail).toBe(NO_MATCH);
    expect(rows[2].detail).toBe('页面无法读取');
    expect(rows[3].views).toBe('不可用');
    const table = createDocument(
      '<table><tbody id="results"></tbody></table>',
    ) as unknown as Document;
    const body = table.getElementById('results') as HTMLElement;
    renderResultRows(body, rows);
    expect(body.textContent).toContain('6659次播放');
    expect(body.textContent).toContain('22小时前');
    expect(body.textContent).toContain('这次搜索没有匹配');
    expect(body.textContent).toContain('页面无法读取');
    expect(body.querySelector('a')?.textContent).toBe(
      '<script>alert(1)</script>《冰山学姐沦陷了》',
    );
    expect(body.querySelector('script')).toBeFalsy();
    expect(body.innerHTML).toContain('&lt;script&gt;');
  });
});
