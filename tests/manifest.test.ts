import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<
  string,
  unknown
>;

describe('扩展权限与安全边界', () => {
  it('只申请 YouTube 网页和本机脚本所需权限', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['scripting', 'alarms', 'storage']);
    expect(manifest.host_permissions).toEqual([
      'https://www.youtube.com/*',
      'http://127.0.0.1:17321/*',
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(
      /<all_urls>|cookies|webRequest|downloads/,
    );
  });

  it('扩展页不加载远程代码或运行内联脚本', () => {
    const csp = manifest.content_security_policy as { extension_pages: string };
    const control = readFileSync('index.html', 'utf8');
    const ui = readFileSync('src/ui.ts', 'utf8');
    const bridge = readFileSync('src/bridge.ts', 'utf8');
    const productionSources = [
      'src/background.ts',
      'src/content.ts',
      'src/csv.ts',
      'src/model.ts',
      'src/store.ts',
      'src/ui.ts',
      'src/youtube.ts',
    ]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(csp.extension_pages).toContain("script-src 'self'");
    expect(csp.extension_pages).not.toMatch(
      /unsafe-eval|unsafe-inline|https?:/,
    );
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(control).not.toMatch(/<script[^>]+src=["']https?:/);
    expect(ui).not.toContain('innerHTML');
    expect(productionSources).not.toMatch(/\b(?:fetch|XMLHttpRequest)\s*\(/);
    expect(bridge).toContain("const SCRIPT_URL = 'http://127.0.0.1:17321'");
    expect(bridge).not.toMatch(/https?:\/\/(?!127\.0\.0\.1:17321)/);
  });
});
