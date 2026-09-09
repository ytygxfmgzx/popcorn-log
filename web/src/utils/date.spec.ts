import { describe, expect, it } from 'vitest';
import {
  diffDays,
  formatDateFull,
  formatDateShort,
  formatRuntime,
  parseDateStr,
  relativeDayLabel,
  toDateStr,
  todayStr,
} from '@/utils/date';

describe('toDateStr', () => {
  it('本地日期格式化为 YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(toDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('parseDateStr', () => {
  it('解析为当地零点', () => {
    const d = parseDateStr('2026-09-07');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(7);
  });

  it('非法输入返回 Invalid Date', () => {
    expect(Number.isNaN(parseDateStr('2026/09/07').getTime())).toBe(true);
    expect(Number.isNaN(parseDateStr('').getTime())).toBe(true);
  });
});

describe('diffDays', () => {
  it('同日为 0', () => {
    expect(diffDays('2026-09-07', '2026-09-07')).toBe(0);
  });

  it('跨月与跨年天数差', () => {
    expect(diffDays('2026-09-02', '2026-08-31')).toBe(2);
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('relativeDayLabel', () => {
  const today = '2026-09-09';

  it('今天 / 昨天', () => {
    expect(relativeDayLabel('2026-09-09', today)).toBe('今天');
    expect(relativeDayLabel('2026-09-08', today)).toBe('昨天');
  });

  it('2-6 天 → n 天前', () => {
    expect(relativeDayLabel('2026-09-07', today)).toBe('2 天前');
    expect(relativeDayLabel('2026-09-03', today)).toBe('6 天前');
  });

  it('7-29 天 → n 周前', () => {
    expect(relativeDayLabel('2026-09-02', today)).toBe('1 周前');
    expect(relativeDayLabel('2026-08-12', today)).toBe('4 周前');
  });

  it('≥30 天返回空串（由调用方显示完整日期）', () => {
    expect(relativeDayLabel('2026-08-10', today)).toBe('');
    expect(relativeDayLabel('2025-12-01', today)).toBe('');
  });

  it('未来日期返回空串', () => {
    expect(relativeDayLabel('2026-09-10', today)).toBe('');
  });
});

describe('formatDateShort', () => {
  it('同年只显示 MM-DD', () => {
    expect(formatDateShort('2026-09-07', '2026-09-09')).toBe('09-07');
  });

  it('往年带年份', () => {
    expect(formatDateShort('2025-09-07', '2026-09-09')).toBe('2025-09-07');
  });
});

describe('formatDateFull', () => {
  it('中文完整日期', () => {
    expect(formatDateFull('2026-09-07')).toBe('2026年9月7日');
  });

  it('非法输入原样返回', () => {
    expect(formatDateFull('bad')).toBe('bad');
  });
});

describe('formatRuntime', () => {
  it('小于一小时', () => {
    expect(formatRuntime(45)).toBe('45 分钟');
  });

  it('整小时', () => {
    expect(formatRuntime(120)).toBe('2 小时');
  });

  it('小时 + 分钟', () => {
    expect(formatRuntime(101)).toBe('1 小时 41 分');
  });
});

describe('todayStr', () => {
  it('与 toDateStr(new Date()) 一致', () => {
    expect(todayStr()).toBe(toDateStr(new Date()));
  });
});
