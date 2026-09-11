import { describe, expect, it } from 'vitest';
import { filterToQuery, queryStrArray, queryToFilter } from './filter-state';
import type { StatsFilter } from './aggregate';

function filter(overrides: Partial<StatsFilter>): StatsFilter {
  return {
    range: 'all',
    members: [],
    locations: [],
    genres: [],
    ...overrides,
  };
}

describe('filterToQuery', () => {
  it('多选维度序列化为数组、custom 时间窗带起止', () => {
    const query = filterToQuery(
      filter({
        range: 'custom',
        customStart: '2026-01-01',
        customEnd: '2026-06-30',
        members: ['妈妈', '爸爸'],
        locations: ['家里'],
        genres: ['动画', '喜剧'],
        person: { name: '宫崎骏', type: 'director' },
      }),
    );
    expect(query).toEqual({
      range: 'custom',
      members: ['妈妈', '爸爸'],
      locations: ['家里'],
      genres: ['动画', '喜剧'],
      person: '宫崎骏',
      personType: 'director',
      start: '2026-01-01',
      end: '2026-06-30',
    });
  });

  it('空筛选只带 range', () => {
    expect(filterToQuery(filter({}))).toEqual({ range: 'all' });
  });
});

describe('queryStrArray', () => {
  it('null / 单值 / 数组 / 混入非字符串', () => {
    expect(queryStrArray(null)).toEqual([]);
    expect(queryStrArray(undefined)).toEqual([]);
    expect(queryStrArray('妈妈')).toEqual(['妈妈']);
    expect(queryStrArray(['妈妈', '爸爸'])).toEqual(['妈妈', '爸爸']);
    expect(queryStrArray(['妈妈', 42, null, ''])).toEqual(['妈妈']);
  });
});

describe('queryToFilter', () => {
  it('多值 query 完整恢复（filterToQuery 往返一致）', () => {
    const source = filter({
      range: 'halfYear',
      members: ['妈妈', '爸爸'],
      locations: ['家里', '影院'],
      genres: ['动画'],
      person: { name: '宫崎骏', type: 'director' },
    });
    expect(queryToFilter(filterToQuery(source))).toEqual(source);
  });

  it('旧版单值 key 回退（?member=妈妈 → [妈妈]）', () => {
    expect(
      queryToFilter({ range: 'month', member: '妈妈', location: '家里', genre: '动画' }),
    ).toEqual(
      filter({
        range: 'month',
        members: ['妈妈'],
        locations: ['家里'],
        genres: ['动画'],
      }),
    );
  });

  it('脏值回退默认：非法 range 归 all，非法 personType 归 cast', () => {
    const parsed = queryToFilter({ range: 'yesterday', person: '某人', personType: ' 编剧 ' });
    expect(parsed?.range).toBe('all');
    expect(parsed?.person).toEqual({ name: '某人', type: 'cast' });
  });

  it('不含任何筛选 key → null（调用方保持现状）', () => {
    expect(queryToFilter({})).toBeNull();
    expect(queryToFilter({ foo: 'bar' })).toBeNull();
  });
});
