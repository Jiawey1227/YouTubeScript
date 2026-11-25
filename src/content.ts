import { samePage, type PageResult } from './model';
import {
  pageBlock,
  pageNetworkError,
  searchEnded,
  searchMatches,
  searchRecognized,
  searchTitlesReady,
} from './youtube';

// Each injection installs at most one listener in the isolated world.
const scope = globalThis as typeof globalThis & {
  dramaCollectorInstalled?: boolean;
};
if (!scope.dramaCollectorInstalled) {
  scope.dramaCollectorInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'collect') return;
    const { jobId, stepId, url, name } = message as {
      jobId: string;
      stepId: string;
      url: string;
      name: string;
    };
    respond({ accepted: true });
    void collect(url, name)
      .then((result) =>
        chrome.runtime.sendMessage({
          type: 'page-result',
          jobId,
          stepId,
          url: location.href,
          result,
        }),
      )
      .catch(() => {
        /* Background or tab may have closed. */
      });
    return false;
  });
}
async function collect(url: string, name: string): Promise<PageResult> {
  const started = performance.now();
  while (performance.now() - started < 15000) {
    const networkError = pageNetworkError(document);
    if (networkError)
      return {
        kind: 'error',
        reason: networkError,
        blocked: false,
        retryable: true,
      };
    const blocked = pageBlock(document, location.href);
    if (blocked)
      return {
        kind: 'error',
        reason: blocked,
        blocked: true,
        retryable: false,
      };
    if (!samePage(location.href, url))
      return {
        kind: 'error',
        reason: '搜索页已离开预期地址',
        blocked: false,
        retryable: false,
      };
    if (searchRecognized(document)) {
      const hits = searchMatches(document, name);
      if (hits.length || searchEnded(document) || searchTitlesReady(document))
        return { kind: 'search', hits };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (searchRecognized(document))
    return { kind: 'search', hits: searchMatches(document, name) };
  return {
    kind: 'error',
    reason: '页面读取超时或结构无法识别',
    blocked: false,
    retryable: false,
  };
}
