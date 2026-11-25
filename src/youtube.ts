import {
  interactiveBlockReason,
  missing,
  titleContainsDramaName,
  type Detail,
  type Field,
  type SearchHit,
} from './model';

export function parseDuration(text: string | null): number | null {
  if (!text) return null;
  const value = text.trim();
  const iso = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    value,
  );
  if (iso && iso.slice(1).some(Boolean))
    return Math.floor(
      Number(iso[1] ?? 0) * 86400 +
        Number(iso[2] ?? 0) * 3600 +
        Number(iso[3] ?? 0) * 60 +
        Number(iso[4] ?? 0),
    );
  if (!/^\d+:\d{2}(?::\d{2})?$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}
export function exactViews(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(
      /^(?:(?:观看次数|觀看次數|播放次数|播放次數)|(?:观看|觀看|播放))\s*[:：]?\s*/u,
      '',
    )
    .replace(/\s*(?:views?|次观看|次觀看|次播放|次)\s*$/iu, '')
    .trim();
  if (!/^(?:\d+|\d{1,3}(?:[,，\u00a0 ]\d{3})+)$/.test(cleaned)) return null;
  return cleaned.replace(/[,，\u00a0 ]/g, '').replace(/^0+(?=\d)/, '');
}
export function absoluteDate(text: string | null): string | null {
  if (!text) return null;
  const value = text.trim();
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    const validDay =
      calendar.getUTCFullYear() === year &&
      calendar.getUTCMonth() === month - 1 &&
      calendar.getUTCDate() === day;
    return validDay && !Number.isNaN(Date.parse(value)) ? value : null;
  }
  const iso = /^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?$/.exec(value);
  const english =
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{1,2}), (\d{4})$/i.exec(
      value,
    );
  let y: number, m: number, d: number;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (english) {
    y = Number(english[3]);
    m =
      [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ].indexOf(english[1].slice(0, 3).toLowerCase()) + 1;
    d = Number(english[2]);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
}
export function pageBlock(doc: Document, url: string): string | null {
  const urlBlock = interactiveBlockReason(url);
  if (urlBlock) return urlBlock;
  if (
    doc.querySelector(
      'iframe[src*="recaptcha"], #captcha, form[action*="/sorry/"]',
    )
  )
    return '页面出现验证码，请手动处理后继续';
  const dialogs = Array.from(
    doc.querySelectorAll(
      'ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog:not([aria-hidden="true"]), ytd-player-error-message-renderer',
    ),
  )
    .map((e) => e.textContent ?? '')
    .join(' ');
  if (
    /Sign in to confirm|登录以确认|登入以確認|Before you continue|在继续之前|在繼續之前|not a bot|不是机器人/i.test(
      dialogs,
    )
  )
    return '需要在采集标签页完成验证或同意操作';
  return null;
}
export function pageNetworkError(doc: Document): string | null {
  const pageText = doc.body?.textContent?.slice(0, 5000) ?? '';
  return /ERR_(?:INTERNET|CONNECTION|NAME|CERT|TIMED_OUT|ADDRESS)/.test(
    pageText,
  )
    ? '页面网络加载失败'
    : null;
}
const VIEW_TEXT =
  /^(?:约\s*)?\d[\d,，.\s]*\s*(?:万|萬|亿|億|[kKmM])?\s*(?:次播放|次观看|次觀看|views?)$/i;
const VIEW_COUNT = /^(?:约\s*)?\d[\d,，.]*\s*(?:万|萬|亿|億|[kKmM])?$/;
const RELATIVE_TIME =
  /^(?:\d+\s*(?:秒钟|秒|分钟|分鐘|小时|小時|天|周|週|个月|個月|月|年)前|(?:a|an|\d+)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|yesterday|今天|昨天)$/i;
function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const found = Array.from(root.querySelectorAll(selector));
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot)
      found.push(...queryAllDeep(element.shadowRoot, selector));
  }
  return found;
}
function watchAnchors(card: Element): HTMLAnchorElement[] {
  const roots: ParentNode[] = [card];
  if (card.shadowRoot) roots.push(card.shadowRoot);
  return roots.flatMap((root) =>
    queryAllDeep(root, 'a[href*="/watch?"]'),
  ) as HTMLAnchorElement[];
}
function linkTitle(anchor: Element): string {
  const titled = (
    anchor.getAttribute('title') ||
    anchor.querySelector('[title]')?.getAttribute('title') ||
    ''
  ).trim();
  if (titled) return titled;
  const visible = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
  if (visible && !/^\d+:\d{2}(?::\d{2})?$/.test(visible)) return visible;
  return (anchor.getAttribute('aria-label') || '').trim();
}
function isTitleAnchor(anchor: Element): boolean {
  return (
    anchor.id === 'video-title' ||
    /title/i.test(anchor.id) ||
    /title/i.test(anchor.getAttribute('class') || '')
  );
}
function pickAnchor(card: Element): HTMLAnchorElement | null {
  const links = watchAnchors(card).filter((anchor) => linkTitle(anchor));
  const preferred = links.filter(isTitleAnchor);
  const pool = preferred.length
    ? preferred
    : links.filter((anchor) => anchor.id !== 'thumbnail');
  const usable = pool.length ? pool : links;
  return (
    usable.sort((a, b) => linkTitle(b).length - linkTitle(a).length)[0] ?? null
  );
}
function metadataItems(card: Element): string[] {
  const roots: ParentNode[] = [card];
  if (card.shadowRoot) roots.push(card.shadowRoot);
  return roots
    .flatMap((root) =>
      queryAllDeep(
        root,
        '#metadata-line .inline-metadata-item, .inline-metadata-item, .yt-content-metadata-view-model__metadata-text',
      ),
    )
    .map((element) => {
      const own = Array.from(element.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent ?? '')
        .join('');
      return (
        own || (element.children.length ? '' : (element.textContent ?? ''))
      )
        .replace(/\s+/g, ' ')
        .trim();
    })
    .flatMap((text) =>
      text
        .split(/\s*[·•|]\s*/)
        .map((part) => part.trim())
        .filter((part) => part && part.length <= 80),
    );
}
function cardSnippets(card: Element, anchor: Element): string[] {
  const values: string[] = [];
  for (const element of card.querySelectorAll(
    'span, yt-formatted-string, .inline-metadata-item, #metadata-line',
  )) {
    if (anchor.contains(element)) continue;
    const own = Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join('');
    const text = (
      own || (element.children.length ? '' : (element.textContent ?? ''))
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > 80) continue;
    values.push(
      ...text
        .split(/\s*[·•|]\s*/)
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return values;
}
export function searchMatches(doc: Document, name: string): SearchHit[] {
  const needle = name.trim();
  const seen = new Set<string>(),
    hits: SearchHit[] = [];
  const root = doc.querySelector('ytd-search') ?? doc;
  for (const card of root.querySelectorAll(
    'ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model',
  )) {
    if (
      card.closest(
        'ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-playlist-renderer, ytd-channel-renderer',
      ) ||
      card.querySelector('ytd-ad-badge-renderer, .badge-style-type-ad')
    )
      continue;
    const anchor = pickAnchor(card);
    if (!anchor) continue;
    const title = linkTitle(anchor);
    if (!titleContainsDramaName(title, needle)) continue;
    let id: string | null = null;
    try {
      id = new URL(
        anchor.getAttribute('href') ?? '',
        'https://www.youtube.com',
      ).searchParams.get('v');
    } catch {
      continue;
    }
    if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const snippets = [...metadataItems(card), ...cardSnippets(card, anchor)];
    hits.push({
      videoId: id,
      title,
      rank: hits.length + 1,
      viewText:
        snippets.find((value) => VIEW_TEXT.test(value)) ??
        snippets.find((value) => VIEW_COUNT.test(value)) ??
        null,
      relativeTime: snippets.find((value) => RELATIVE_TIME.test(value)) ?? null,
    });
  }
  return hits;
}
export function searchEnded(doc: Document): boolean {
  const messages = Array.from(
    doc.querySelectorAll('ytd-search ytd-message-renderer'),
  )
    .map((e) => e.textContent ?? '')
    .join(' ');
  return /No results found|没有找到|找不到|没有更多|沒有更多|No more results/i.test(
    messages,
  );
}
export function searchTitlesReady(doc: Document): boolean {
  const root = doc.querySelector('ytd-search') ?? doc;
  return Array.from(
    root.querySelectorAll(
      'ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model',
    ),
  ).some((card) => {
    const anchor = pickAnchor(card);
    return !!anchor && linkTitle(anchor).length > 4;
  });
}
export function searchRecognized(doc: Document): boolean {
  return !!doc.querySelector(
    'ytd-search ytd-video-renderer, ytd-search ytd-grid-video-renderer, ytd-search yt-lockup-view-model, ytd-search ytd-message-renderer',
  );
}

// Parse JSON as data, never execute the page's script text.
function assignedJson(
  doc: Document,
  name: string,
): Record<string, unknown> | null {
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const text = script.textContent ?? '';
    const match = new RegExp(`(?:var\\s+)?${name}\\s*=\\s*`).exec(text);
    if (!match) continue;
    const start = text.indexOf('{', match.index + match[0].length);
    if (start < 0) continue;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function field(value: string | null, source: string, reason: string): Field {
  return value === null ? missing(reason) : { value, source, reason: '' };
}
export function extractDetail(doc: Document, id: string): Detail | null {
  const response = assignedJson(doc, 'ytInitialPlayerResponse');
  const details = object(response?.videoDetails);
  const bound = details.videoId === id;
  const micro = bound
    ? object(object(response?.microformat).playerMicroformatRenderer)
    : {};
  const canonical = doc
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.getAttribute('href');
  const canonicalId = canonical
    ? new URL(canonical, 'https://www.youtube.com').searchParams.get('v')
    : null;
  const metaBound = canonicalId === id;
  if (!bound && !metaBound) return null;
  const meta = (name: string) =>
    metaBound
      ? (doc
          .querySelector(`meta[itemprop="${name}"]`)
          ?.getAttribute('content') ?? null)
      : null;
  const live =
    bound &&
    (details.isLive === true ||
      details.isUpcoming === true ||
      object(micro.liveBroadcastDetails).isLiveNow === true);
  const title =
    (bound ? string(details.title) : null) ??
    (metaBound
      ? doc.querySelector('meta[name="title"]')?.getAttribute('content')
      : null) ??
    doc.querySelector('ytd-watch-metadata h1')?.textContent?.trim() ??
    '';
  const seconds =
    bound && /^\d+$/.test(string(details.lengthSeconds) ?? '')
      ? Number(details.lengthSeconds)
      : parseDuration(meta('duration'));
  const published =
    absoluteDate(string(micro.publishDate)) ??
    absoluteDate(meta('datePublished'));
  const views =
    exactViews(bound ? string(details.viewCount) : null) ??
    exactViews(meta('interactionCount'));
  return {
    videoId: id,
    title,
    durationSeconds: seconds,
    live,
    publishedAt: field(
      published,
      absoluteDate(string(micro.publishDate))
        ? 'playerMicroformat.publishDate'
        : 'meta.datePublished',
      '未取得准确发布日期',
    ),
    viewCount: field(
      views,
      exactViews(bound ? string(details.viewCount) : null) !== null
        ? 'videoDetails.viewCount'
        : 'meta.interactionCount',
      '未取得完整播放量',
    ),
  };
}
export function unavailableReason(doc: Document): string | null {
  const text = doc
    .querySelector(
      'ytd-player-error-message-renderer, #player-error-message-container, ytd-video-unavailable-message-renderer',
    )
    ?.textContent?.trim();
  if (text) return text.slice(0, 300);
  const body = doc.body?.textContent ?? '';
  if (
    /This video (?:is private|has been removed|is unavailable)|此视频(?:为私享|已被删除|不可用)|影片(?:為私人|已遭移除|無法播放)/i.test(
      body,
    )
  )
    return '视频已删除、私密或无法访问';
  return null;
}
