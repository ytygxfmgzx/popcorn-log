import { describe, expect, it } from 'vitest';
import {
  mergeConfig,
  mergeWatchlist,
  normalizeRemoteConfig,
  normalizeRemoteRecord,
  normalizeRemoteWatchlist,
  softMerge,
} from './merge';
import type { WatchRecord, WatchlistItem } from '@/types';

function record(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: 'r1',
    mediaType: 'movie',
    tmdbId: 10478,
    titleSnapshot: '崖上的波妞',
    watchedDate: '2026-09-09',
    location: '家里',
    members: ['爸爸'],
    rating: 5,
    createdAt: '2026-09-09T10:00:00Z',
    updatedAt: '2026-09-09T10:00:00Z',
    deleted: false,
    ...overrides,
  };
}

describe('normalizeRemoteRecord', () => {
  it('合法记录通过并忽略未知字段', () => {
    const normalized = normalizeRemoteRecord({
      ...record({}),
      extraFutureField: 'whatever',
    });
    expect(normalized).not.toBeNull();
    expect(normalized).toEqual(record({}));
  });

  it('字段类型纠正：非法 rating 归 null、非法 members 过滤', () => {
    const normalized = normalizeRemoteRecord({
      ...record({}),
      rating: 9,
      members: ['妈妈', 42, null],
      quote: '',
    });
    expect(normalized?.rating).toBeNull();
    expect(normalized?.members).toEqual(['妈妈']);
    expect(normalized?.quote).toBeUndefined();
  });

  it('缺必填字段返回 null（脏数据不炸同步）', () => {
    expect(normalizeRemoteRecord({ id: 'x' })).toBeNull();
    expect(normalizeRemoteRecord({ ...record({}), watchedDate: '昨天' })).toBeNull();
    expect(normalizeRemoteRecord(null)).toBeNull();
  });
});

describe('normalizeRemoteConfig', () => {
  it('缺失字段按空数组', () => {
    expect(normalizeRemoteConfig({})).toEqual({ members: [], customLocations: [] });
    expect(normalizeRemoteConfig('junk')).toEqual({ members: [], customLocations: [] });
  });
});

describe('softMerge', () => {
  it('较新为主体：取其字段 + 成员并集 + 手记拼接', () => {
    const older = record({
      id: 'a',
      members: ['爸爸'],
      note: '爸爸记的',
      quote: '波妞！',
      rating: 4,
      updatedAt: '2026-09-09T10:00:00Z',
    });
    const newer = record({
      id: 'a',
      members: ['妈妈', '妹妹'],
      note: '妈妈记的',
      rating: 5,
      updatedAt: '2026-09-09T11:00:00Z',
    });
    const merged = softMerge(older, newer);
    // newer 为主体（无论参数顺序）
    expect(merged.rating).toBe(5);
    expect(merged.members).toEqual(['妈妈', '妹妹', '爸爸']);
    expect(merged.note).toBe('妈妈记的\n爸爸记的');
    expect(merged.quote).toBe('波妞！'); // 只有一方有，保留
    expect(merged.updatedAt > newer.updatedAt).toBe(true); // 合并产物时间前进
  });

  it('参数顺序不影响结果（对称）', () => {
    const a = record({ note: 'A', updatedAt: '2026-09-09T10:00:00Z' });
    const b = record({ note: 'B', updatedAt: '2026-09-09T12:00:00Z' });
    expect(softMerge(a, b).note).toBe(softMerge(b, a).note);
  });
});

describe('mergeConfig', () => {
  const config = (members: string[], customLocations: string[] = []) => ({
    members,
    customLocations,
  });

  it('无基准（首次同步）：退化为并集，本地顺序在前，云端新增追加', () => {
    const merged = mergeConfig(
      { members: ['爸爸', '妈妈'], customLocations: ['外婆家'] },
      { members: ['妈妈', '爷爷'], customLocations: ['外婆家', '露营'] },
    );
    expect(merged).toEqual({
      members: ['爸爸', '妈妈', '爷爷'],
      customLocations: ['外婆家', '露营'],
    });
  });

  it('本地删除 → 合并结果跟随删除（删除可上传传播）', () => {
    const base = config(['爸爸', '妈妈']);
    expect(mergeConfig(config(['爸爸']), config(['爸爸', '妈妈']), base)).toEqual(config(['爸爸']));
  });

  it('本地未动、云端删除 → 跟随删除（拉取时写回本地）', () => {
    const base = config(['爸爸', '妈妈']);
    expect(mergeConfig(config(['爸爸', '妈妈']), config(['爸爸']), base)).toEqual(config(['爸爸']));
  });

  it('两边都删 → 删', () => {
    const base = config(['爸爸', '妈妈']);
    expect(mergeConfig(config(['爸爸']), config(['爸爸']), base)).toEqual(config(['爸爸']));
  });

  it('并发共存：本地新增 + 云端删除互不吞没', () => {
    const base = config(['爸爸', '妈妈']);
    const merged = mergeConfig(config(['爸爸', '妈妈', '妹妹']), config(['爸爸']), base);
    expect(merged).toEqual(config(['爸爸', '妹妹']));
  });

  it('基准外新增：任一边加入即保留', () => {
    const base = config(['爸爸']);
    expect(mergeConfig(config(['爸爸', '妹妹']), config(['爸爸']), base)).toEqual(
      config(['爸爸', '妹妹']),
    );
    expect(mergeConfig(config(['爸爸']), config(['爸爸', '爷爷']), base)).toEqual(
      config(['爸爸', '爷爷']),
    );
  });

  it('两边都没动 → 原样返回', () => {
    const same = config(['爸爸', '妈妈'], ['家里', '影院']);
    expect(mergeConfig(same, config(['爸爸', '妈妈'], ['家里', '影院']), same)).toEqual(same);
  });

  it('customLocations 同样支持删除传播', () => {
    const base = config(['爸爸'], ['家里', '影院', '外婆家']);
    const merged = mergeConfig(
      config(['爸爸'], ['影院', '外婆家']),
      config(['爸爸'], ['家里', '影院', '外婆家']),
      base,
    );
    expect(merged.customLocations).toEqual(['影院', '外婆家']);
  });
});

/* ---------------- 想看清单 ---------------- */

function wish(overrides: Partial<WatchlistItem>): WatchlistItem {
  return {
    id: 'w1',
    mediaType: 'movie',
    tmdbId: 10478,
    titleSnapshot: '崖上的波妞',
    addedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('normalizeRemoteWatchlist', () => {
  it('合法条目通过并忽略未知字段', () => {
    const normalized = normalizeRemoteWatchlist([{ ...wish({}), extraFutureField: 'x' }]);
    expect(normalized).toEqual([wish({})]);
  });

  it('脏数据整条丢弃，不炸同步', () => {
    expect(normalizeRemoteWatchlist('junk')).toEqual([]);
    expect(
      normalizeRemoteWatchlist([
        null,
        { id: '' }, // 缺 id
        { id: 'w2', mediaType: 'movie', tmdbId: 1, titleSnapshot: '', addedAt: 'x' }, // 缺快照/时间
        { id: 'w3', mediaType: 'person', tmdbId: 2, titleSnapshot: 'x', addedAt: 'x' }, // 非法 mediaType
      ]),
    ).toEqual([]);
  });

  it('同业务键重复条目只保留第一条', () => {
    const normalized = normalizeRemoteWatchlist([
      wish({ id: 'w1' }),
      wish({ id: 'w2', addedAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.id).toBe('w1');
  });
});

describe('mergeWatchlist', () => {
  it('无基准（首次同步）：退化为并集', () => {
    const merged = mergeWatchlist(
      [wish({ id: 'a', tmdbId: 1 })],
      [wish({ id: 'b', tmdbId: 2 }), wish({ id: 'c', tmdbId: 1 })],
    );
    expect(merged.map((item) => item.tmdbId).sort()).toEqual([1, 2]);
  });

  it('本地删除 → 跟随删除（可上传传播）', () => {
    const base = [wish({ id: 'a', tmdbId: 1 }), wish({ id: 'b', tmdbId: 2 })];
    expect(mergeWatchlist([wish({ id: 'a', tmdbId: 1 })], base, base)).toEqual([
      wish({ id: 'a', tmdbId: 1 }),
    ]);
  });

  it('本地未动、云端删除 → 跟随删除（拉取时写回本地）', () => {
    const base = [wish({ id: 'a', tmdbId: 1 }), wish({ id: 'b', tmdbId: 2 })];
    expect(mergeWatchlist(base, [wish({ id: 'a', tmdbId: 1 })], base)).toEqual([
      wish({ id: 'a', tmdbId: 1 }),
    ]);
  });

  it('并发共存：本地新增 + 云端删除互不吞没', () => {
    const base = [wish({ id: 'a', tmdbId: 1 }), wish({ id: 'b', tmdbId: 2 })];
    const merged = mergeWatchlist(
      [wish({ id: 'a', tmdbId: 1 }), wish({ id: 'c', tmdbId: 3 })],
      [wish({ id: 'a', tmdbId: 1 })],
      base,
    );
    expect(merged.map((item) => item.tmdbId)).toEqual([1, 3]);
  });

  it('同键两边都在（独立新增同一部片）→ 取 addedAt 较早者', () => {
    const merged = mergeWatchlist(
      [wish({ id: 'local', addedAt: '2026-09-05T00:00:00Z' })],
      [wish({ id: 'remote', addedAt: '2026-09-01T00:00:00Z' })],
    );
    expect(merged).toEqual([wish({ id: 'remote', addedAt: '2026-09-01T00:00:00Z' })]);
  });

  it('输出按 addedAt 升序（稳定序列化，顺序无关输入）', () => {
    const c = wish({ id: 'c', tmdbId: 3, addedAt: '2026-09-03T00:00:00Z' });
    const a = wish({ id: 'a', tmdbId: 1, addedAt: '2026-09-01T00:00:00Z' });
    const b = wish({ id: 'b', tmdbId: 2, addedAt: '2026-09-02T00:00:00Z' });
    expect(mergeWatchlist([c, a], [b])).toEqual([a, b, c]);
  });

  it('movie/tv 同 id 不同类型视为不同条目', () => {
    const merged = mergeWatchlist([wish({ mediaType: 'movie', tmdbId: 7 })], [
      wish({ id: 'w2', mediaType: 'tv', tmdbId: 7 }),
    ]);
    expect(merged).toHaveLength(2);
  });
});
