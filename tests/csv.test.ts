import { describe, expect, it } from 'vitest';
import { decodeCsv, displayValue, parseCsv, previewCsv } from '../src/csv';

describe('CSV 名单', () => {
  it('保留引号内逗号、换行，处理 BOM、空值和重复剧名', () => {
    const rows = parseCsv(
      '\uFEFF剧名,备注\r\n"剧,A",x\r\n"剧\nB",y\r\n 剧,A\r\n"剧,A",z\r\n,空',
    );
    expect(previewCsv(rows, true, 0)).toEqual({
      names: ['剧,A', '剧\nB', '剧'],
      empty: 1,
      duplicates: 1,
    });
  });
  it('允许无表头以及选择任意列', () => {
    expect(previewCsv(parseCsv('1,甲\n2,乙'), false, 1).names).toEqual([
      '甲',
      '乙',
    ]);
  });
  it('拒绝错误编码、格式、列与空名单', () => {
    expect(() => decodeCsv(new Uint8Array([0xff]).buffer)).toThrow('编码');
    expect(() => parseCsv('剧名\n"未闭合')).toThrow('格式');
    expect(() => previewCsv([['剧名']], true, 0)).toThrow('没有有效');
    expect(() => previewCsv([['甲']], false, 3)).toThrow('存在');
  });
});
describe('显示文本', () => {
  it('界面明确区分零值、空字符串和普通文本', () => {
    expect(displayValue('0')).toBe('0');
    expect(displayValue('123')).toBe('123');
    expect(displayValue('')).toBe('—');
  });
});
