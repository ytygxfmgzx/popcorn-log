/** 日期工具：本地日期字符串（YYYY-MM-DD），与 UTC 时间戳严格分离 */

/** Date → 本地日期字符串 YYYY-MM-DD */
export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** 本地日期字符串 → 当地零点 Date（解析失败返回 Invalid Date） */
export function parseDateStr(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    return new Date(NaN);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** 两个本地日期字符串的天数差（a - b） */
export function diffDays(a: string, b: string): number {
  const ms = parseDateStr(a).getTime() - parseDateStr(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** 相对时间标签：今天 / 昨天 / n 天前 / n 周前；≥30 天或未来日期返回 ''（由调用方显示完整日期） */
export function relativeDayLabel(dateStr: string, today: string = todayStr()): string {
  const diff = diffDays(today, dateStr); // 正数 = 过去
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff >= 2 && diff <= 6) return `${diff} 天前`;
  if (diff >= 7 && diff <= 29) return `${Math.floor(diff / 7)} 周前`;
  return '';
}

/** 展示用短日期：今年 → MM-DD；往年 → YYYY-MM-DD */
export function formatDateShort(dateStr: string, today: string = todayStr()): string {
  if (dateStr.slice(0, 4) === today.slice(0, 4)) {
    return dateStr.slice(5);
  }
  return dateStr;
}

/** 展示用完整日期：2026-09-07 → 2026年9月7日 */
export function formatDateFull(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/** 片长分钟 → 展示文案（101 → "1 小时 41 分"；45 → "45 分钟"） */
export function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}
