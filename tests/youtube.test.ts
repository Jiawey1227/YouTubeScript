import { createDocument } from '@mixmark-io/domino';
import { describe, expect, it } from 'vitest';
import {
  absoluteDate,
  exactViews,
  extractDetail,
  pageBlock,
  pageNetworkError,
  parseDuration,
  searchEnded,
  searchMatches,
  searchRecognized,
  unavailableReason,
} from '../src/youtube';
const doc = (html: string) => createDocument(html) as unknown as Document;
const card = (
  i: number,
  title: string,
  meta = '<span class="inline-metadata-item">6659次播放</span><span class="inline-metadata-item">22小时前</span>',
  duration = '1:00:01',
) =>
  `<ytd-video-renderer><a id="video-title" href="/watch?v=${String(i).padStart(11, 'a')}" title="${title}">${title}</a><ytd-thumbnail-overlay-time-status-renderer>${duration}</ytd-thumbnail-overlay-time-status-renderer>${meta}</ytd-video-renderer>`;
const fullTitle =
  '高考后被初恋抛弃，他转身发现父母竟是全国首富！低调入学，却让高冷校花为他心动吃醋！《冰山学姐沦陷了》';

describe('搜索卡片标题匹配', () => {
  it('保留书名号中的完整剧名，跳过残缺标题，短视频仍然匹配', () => {
    const html = `<ytd-search>${card(1, fullTitle, '<span class="inline-metadata-item">6659次播放</span><span class="inline-metadata-item">22小时前</span>', '0:30')}${card(2, '冰山学姐')}${card(3, '别的剧《冰山学姐沦陷了》')}</ytd-search>`;
    const results = searchMatches(doc(html), '冰山学姐沦陷了');
    expect(results.map((hit) => hit.videoId)).toEqual([
      'aaaaaaaaaa1',
      'aaaaaaaaaa3',
    ]);
    expect(results[0]).toMatchObject({
      title: fullTitle,
      viewText: '6659次播放',
      relativeTime: '22小时前',
      rank: 1,
    });
    expect(results[1].rank).toBe(2);
  });
  it('标题里的标点不同时仍保留，中间多字不保留', () => {
    const html = `<ytd-search>${card(1, '冰山学姐，沦陷了')}${card(2, '《冰山学姐：沦陷了》')}${card(3, '冰山学姐没有沦陷了')}${card(4, '冰山学姐 沦陷了')}</ytd-search>`;
    expect(
      searchMatches(doc(html), '冰山学姐沦陷了').map((hit) => hit.title),
    ).toEqual(['冰山学姐，沦陷了', '《冰山学姐：沦陷了》']);
  });
  it('封面链接在标题链接前面时，仍用完整标题匹配冰山学姐', () => {
    const html = `<ytd-search><ytd-video-renderer><a id="thumbnail" href="/watch?v=abcdefghijk" aria-label="播放"><span>1:00:01</span></a><a id="video-title" href="/watch?v=abcdefghijk" title="${fullTitle}">${fullTitle}</a><span class="inline-metadata-item">6659次播放</span><span class="inline-metadata-item">22小时前</span></ytd-video-renderer></ytd-search>`;
    expect(searchMatches(doc(html), '冰山学姐')).toEqual([
      {
        videoId: 'abcdefghijk',
        title: fullTitle,
        rank: 1,
        viewText: '6659次播放',
        relativeTime: '22小时前',
      },
    ]);
  });
  it('超过十条仍全部返回，并跳过广告、Shorts 专区、播放列表、频道和重复视频', () => {
    const html = `<ytd-search><ytd-ad-slot-renderer>${card(99, '广告《冰山学姐沦陷了》')}</ytd-ad-slot-renderer><ytd-reel-shelf-renderer>${card(98, '短片《冰山学姐沦陷了》')}</ytd-reel-shelf-renderer><ytd-playlist-renderer>${card(97, '列表《冰山学姐沦陷了》')}</ytd-playlist-renderer><ytd-channel-renderer><a href="/watch?v=abcdefghijk">频道《冰山学姐沦陷了》</a></ytd-channel-renderer>${card(1, fullTitle)}${card(1, fullTitle)}${Array.from({ length: 11 }, (_, i) => card(i + 2, fullTitle)).join('')}</ytd-search>`;
    const results = searchMatches(doc(html), '冰山学姐沦陷了');
    expect(results).toHaveLength(12);
    expect(results[0].videoId).toBe('aaaaaaaaaa1');
    expect(results[11].videoId).toBe('aaaaaaaaa12');
    expect(new Set(results.map((hit) => hit.videoId)).size).toBe(12);
  });
  it('播放量和相对时间保持原文，缺失字段留空，简写播放量不换算', () => {
    const html = `<ytd-search>${card(1, fullTitle, '<span class="inline-metadata-item">1.2万次播放</span><span class="inline-metadata-item">3天前</span>')}${card(2, `其他${fullTitle}`, '<span class="inline-metadata-item">100次观看</span>')}${card(3, fullTitle, '<span>直播中</span>')}</ytd-search>`;
    const results = searchMatches(doc(html), '冰山学姐沦陷了');
    expect(results[0]).toMatchObject({
      viewText: '1.2万次播放',
      relativeTime: '3天前',
    });
    expect(results[1]).toMatchObject({
      viewText: '100次观看',
      relativeTime: null,
    });
    expect(results[2]).toMatchObject({ viewText: null, relativeTime: null });
  });
  it('搜索卡片只给出数字时，仍保留这个播放量', () => {
    const html = `<ytd-search><ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk" title="${fullTitle}">${fullTitle}</a><span class="style-scope ytd-thumbnail-overlay-time-status-renderer">2:03:00</span><span class="inline-metadata-item">4085</span><span class="inline-metadata-item">7天前</span></ytd-video-renderer></ytd-search>`;
    expect(searchMatches(doc(html), '冰山学姐')[0]).toMatchObject({
      viewText: '4085',
      relativeTime: '7天前',
    });
  });
  it('大小写和繁简按原文比较，没有匹配时返回空列表', () => {
    expect(
      searchMatches(
        doc(`<ytd-search>${card(1, 'ABC剧')}</ytd-search>`),
        'abc剧',
      ),
    ).toEqual([]);
    expect(
      searchMatches(doc(`<ytd-search>${card(1, '傳')}</ytd-search>`), '传'),
    ).toEqual([]);
    expect(
      searchMatches(
        doc(
          '<ytd-search><ytd-message-renderer>No results found</ytd-message-renderer></ytd-search>',
        ),
        '冰山学姐沦陷了',
      ),
    ).toEqual([]);
  });
  it('读取新版普通视频卡片，未知结构不视为已识别的搜索页', () => {
    const html = `<ytd-search><yt-lockup-view-model><a href="/watch?v=abcdefghijk"><div><span title="甲剧 第1集">甲剧 第1集</span></div></a><span class="inline-metadata-item">10次播放</span><span class="inline-metadata-item">1小时前</span></yt-lockup-view-model></ytd-search>`;
    expect(searchMatches(doc(html), '甲剧')).toEqual([
      {
        videoId: 'abcdefghijk',
        title: '甲剧 第1集',
        rank: 1,
        viewText: '10次播放',
        relativeTime: '1小时前',
      },
    ]);
    expect(searchRecognized(doc(html))).toBe(true);
    expect(searchRecognized(doc('<div>改版页面</div>'))).toBe(false);
    expect(
      searchEnded(
        doc(
          '<ytd-search><ytd-message-renderer>No results found</ytd-message-renderer></ytd-search>',
        ),
      ),
    ).toBe(true);
  });
});
describe('准确字段解析', () => {
  it('解析时长且拒绝无效格式', () => {
    expect(parseDuration('1:00:01')).toBe(3601);
    expect(parseDuration('PT2H3M4S')).toBe(7384);
    expect(parseDuration('1:60:00')).toBe(null);
    expect(parseDuration('直播')).toBe(null);
  });
  it('仅接受完整播放量', () => {
    expect(exactViews('1,234,567 views')).toBe('1234567');
    expect(exactViews('观看次数：123,456 次')).toBe('123456');
    expect(exactViews('观看 1,234,567 次')).toBe('1234567');
    for (const value of ['1.2万', '1.2M views', '1,23 views', '-1', '昨天 123'])
      expect(exactViews(value)).toBeNull();
  });
  it('解析中英文绝对日期，拒绝相对日期与不存在的日期', () => {
    expect(absoluteDate('2026年11月6日')).toBe('2026-11-06');
    expect(absoluteDate('Nov 6, 2026')).toBe('2026-11-06');
    expect(absoluteDate('2026-11-06T01:02:03Z')).toBe('2026-11-06T01:02:03Z');
    expect(absoluteDate('3 months ago')).toBeNull();
    expect(absoluteDate('2026-02-30')).toBeNull();
    expect(absoluteDate('2026-02-30T01:02:03Z')).toBeNull();
  });
  it('只读取当前视频，保留独立缺失状态，不用上传日期冒充发布日期', () => {
    const html = `<link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk"><script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: 'abcdefghijk', title: '甲剧全集', lengthSeconds: '4000', viewCount: '123456' }, microformat: { playerMicroformatRenderer: { uploadDate: '2020-01-01', publishDate: '2026-11-06' } } })};</script><aside>推荐视频 999999999 views</aside>`;
    const result = extractDetail(doc(html), 'abcdefghijk')!;
    expect(result.viewCount.value).toBe('123456');
    expect(result.publishedAt.value).toBe('2026-11-06');
    expect(extractDetail(doc(html), 'otherid0000')).toBeNull();
    const partial = extractDetail(
      doc(
        html
          .replace('publishDate', 'unavailablePublishDate')
          .replace('123456', '1.2万'),
      ),
      'abcdefghijk',
    )!;
    expect(partial.publishedAt.value).toBeNull();
    expect(partial.viewCount.value).toBeNull();
    const viewsMissing = extractDetail(
      doc(html.replace('123456', '1.2万')),
      'abcdefghijk',
    )!;
    expect(viewsMissing.publishedAt.value).toBe('2026-11-06');
    expect(viewsMissing.viewCount.value).toBeNull();
    const dateMissing = extractDetail(
      doc(html.replace('publishDate', 'unavailablePublishDate')),
      'abcdefghijk',
    )!;
    expect(dateMissing.publishedAt.value).toBeNull();
    expect(dateMissing.viewCount.value).toBe('123456');
  });
  it('从绑定 canonical 的网页元数据读取准确值', () => {
    const html =
      '<link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk"><meta name="title" content="甲剧"><meta itemprop="duration" content="PT2H"><meta itemprop="datePublished" content="2026-10-01"><meta itemprop="interactionCount" content="0">';
    expect(extractDetail(doc(html), 'abcdefghijk')?.viewCount.value).toBe('0');
  });
  it('识别删除、私密和不可用视频', () => {
    expect(
      unavailableReason(
        doc(
          '<ytd-player-error-message-renderer>This video is private</ytd-player-error-message-renderer>',
        ),
      ),
    ).toContain('private');
    expect(unavailableReason(doc('<body>此视频已被删除</body>'))).toContain(
      '删除',
    );
  });
  it('识别验证码和同意/登录阻塞，不把常规登录按钮当阻塞', () => {
    expect(
      pageBlock(
        doc('<iframe src="https://google.com/recaptcha"></iframe>'),
        'https://www.youtube.com',
      ),
    ).toContain('验证码');
    expect(pageBlock(doc(''), 'https://consent.youtube.com')).toContain('同意');
    expect(
      pageBlock(doc(''), 'https://www.youtube.com/consent?continue='),
    ).toContain('同意');
    expect(
      pageBlock(doc('<button>Sign in</button>'), 'https://www.youtube.com'),
    ).toBeNull();
    expect(
      pageNetworkError(doc('<body>ERR_CONNECTION_RESET</body>')),
    ).toContain('网络');
    expect(
      pageBlock(
        doc('<body>ERR_CONNECTION_RESET</body>'),
        'https://www.youtube.com',
      ),
    ).toBeNull();
  });
});
