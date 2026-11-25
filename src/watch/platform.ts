export function isSupportedPlatform(platform = process.platform) {
  return platform === 'win32';
}

export const UNSUPPORTED_PLATFORM = '这个脚本只支持 Windows 10 及以上。';
