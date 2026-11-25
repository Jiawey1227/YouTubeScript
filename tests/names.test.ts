import { describe, expect, it } from 'vitest';
import {
  createJob,
  parseDramaNames,
  searchUrl,
  titleContainsDramaName,
} from '../src/model';

describe('手动剧名', () => {
  it('去掉首尾空白，忽略空行，二十个剧名可以通过', () => {
    const names = Array.from({ length: 20 }, (_, index) => ` 剧${index + 1} `);
    expect(parseDramaNames(['', '  ', ...names].join('\n\n'))).toEqual(
      names.map((name) => name.trim()),
    );
  });
  it('没有剧名或超过二十个时拒绝', () => {
    expect(() => parseDramaNames('\n  \n')).toThrow('请输入剧名');
    expect(() =>
      parseDramaNames(
        Array.from({ length: 21 }, (_, index) => `剧${index + 1}`).join('\n'),
      ),
    ).toThrow('20 个以内');
  });
  it('相同剧名连续两行会得到两个待搜索项', () => {
    expect(parseDramaNames('甲\n甲')).toEqual(['甲', '甲']);
    expect(createJob(['甲', '甲']).dramas.map((drama) => drama.name)).toEqual([
      '甲',
      '甲',
    ]);
  });
  it('用完整剧名生成搜索地址', () => {
    expect(searchUrl('冰山学姐沦陷了')).toBe(
      'https://www.youtube.com/results?search_query=%E5%86%B0%E5%B1%B1%E5%AD%A6%E5%A7%90%E6%B2%A6%E9%99%B7%E4%BA%86',
    );
  });
  it('标点不同仍匹配，文字必须逐字相同', () => {
    expect(titleContainsDramaName('冰山学姐，沦陷了', '冰山学姐沦陷了')).toBe(
      true,
    );
    expect(
      titleContainsDramaName('《冰山学姐：沦陷了》', '  冰山学姐沦陷了  '),
    ).toBe(true);
    expect(titleContainsDramaName('冰山学姐没有沦陷了', '冰山学姐沦陷了')).toBe(
      false,
    );
    expect(titleContainsDramaName('冰山学姐 沦陷了', '冰山学姐沦陷了')).toBe(
      false,
    );
    expect(titleContainsDramaName('冰山学姐★沦陷了', '冰山学姐沦陷了')).toBe(
      false,
    );
    expect(titleContainsDramaName('冰山學姐淪陷了', '冰山学姐沦陷了')).toBe(
      false,
    );
    expect(titleContainsDramaName('冰山学姐沦陷了', '，，，')).toBe(false);
  });
});
