import Papa from 'papaparse';
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('无法读取编码，请将 CSV 另存为 UTF-8。');
  }
}
export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter: ',',
    skipEmptyLines: false,
  });
  if (result.errors.length)
    throw new Error(`CSV 格式错误：${result.errors[0].message}`);
  return result.data;
}
export function previewCsv(rows: string[][], header: boolean, column: number) {
  if (
    !Number.isInteger(column) ||
    column < 0 ||
    !rows.some((r) => column < r.length)
  )
    throw new Error('请选择存在的剧名列。');
  const names: string[] = [],
    seen = new Set<string>();
  let empty = 0,
    duplicates = 0;
  for (const row of rows.slice(header ? 1 : 0)) {
    const value = (row[column] ?? '').trim();
    if (!value) {
      empty++;
      continue;
    }
    if (seen.has(value)) {
      duplicates++;
      continue;
    }
    seen.add(value);
    names.push(value);
  }
  if (!names.length) throw new Error('没有有效剧名，请检查表头和列选择。');
  return { names, empty, duplicates };
}
export const displayValue = (value: string) => value || '—';
