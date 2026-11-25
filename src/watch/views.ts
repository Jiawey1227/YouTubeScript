export const UNPARSEABLE = '播放量无法解析';
export const UNDER = '未超过阈值';
export const OVER = '移入废纸篓';

const VIEW =
  /^(?:约\s*)?(\d[\d,，.]*)\s*(万|萬|亿|億|[kKmM])?(?:\s*(?:次播放|次观看|次觀看|views?))?$/i;

export function parseViewCount(text: string): number | null {
  const match = VIEW.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1].replace(/[,，]/g, ''));
  if (!Number.isFinite(value)) return null;
  const unit = match[2] ?? '';
  const scale =
    unit === '万' || unit === '萬'
      ? 10000
      : unit === '亿' || unit === '億'
        ? 100000000
        : /^k$/i.test(unit)
          ? 1000
          : /^m$/i.test(unit)
            ? 1000000
            : 1;
  return value * scale;
}

export type ViewDecision =
  | { kind: 'over'; max: number }
  | { kind: 'under'; max: number }
  | { kind: 'unparseable' };

export function decideViews(texts: string[], threshold: number): ViewDecision {
  const parsed = texts
    .map((text) => parseViewCount(text))
    .filter((value): value is number => value !== null);
  if (!parsed.length) return { kind: 'unparseable' };
  const max = Math.max(...parsed);
  return max > threshold ? { kind: 'over', max } : { kind: 'under', max };
}
