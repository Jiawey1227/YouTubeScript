import { describe, expect, it } from 'vitest';
import { dramaNameFromFile } from '../src/watch/name';
import { decideViews, parseViewCount } from '../src/watch/views';

describe('文件名剧名', () => {
  it('去掉最后一个扩展名', () => {
    expect(dramaNameFromFile('冰山学姐沦陷了.mp4')).toBe('冰山学姐沦陷了');
    expect(dramaNameFromFile('冰山学姐沦陷了.backup.mp4')).toBe(
      '冰山学姐沦陷了.backup',
    );
    expect(dramaNameFromFile('冰山学姐沦陷了')).toBe('冰山学姐沦陷了');
  });
  it('只剩扩展名时不搜索', () => {
    expect(dramaNameFromFile('.mp4')).toBeNull();
    expect(dramaNameFromFile(' .mp4')).toBeNull();
  });
});

describe('播放量解析', () => {
  it('换算万、亿和英文单位，忽略约', () => {
    expect(parseViewCount('1.2万')).toBe(12000);
    expect(parseViewCount('约1.2万次播放')).toBe(12000);
    expect(parseViewCount('4,085')).toBe(4085);
    expect(parseViewCount('6659次播放')).toBe(6659);
    expect(parseViewCount('100次观看')).toBe(100);
    expect(parseViewCount('3 views')).toBe(3);
    expect(parseViewCount('2亿')).toBe(200000000);
    expect(parseViewCount('1.5k')).toBe(1500);
    expect(parseViewCount('1M')).toBe(1000000);
    expect(parseViewCount('7天前')).toBeNull();
  });
  it('用最大可解析值与阈值比较', () => {
    expect(decideViews(['4085', '1.2万次播放'], 10000)).toEqual({
      kind: 'over',
      max: 12000,
    });
    expect(decideViews(['6659次播放', '无法识别'], 10000)).toEqual({
      kind: 'under',
      max: 6659,
    });
    expect(decideViews(['直播中', ''], 10000)).toEqual({
      kind: 'unparseable',
    });
  });
});
