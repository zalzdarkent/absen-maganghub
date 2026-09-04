import type { LogbookEntry } from "../types";

// All dates handled in WIB (UTC+7) — consistent with lib/push.js todayKeyWIB logic.
// For client-only calendar, we operate on plain calendar dates (no time), so we
// construct dates at 12:00 WIB to avoid UTC edge shifts.

export function parseTanggal(tanggal: string): Date | null {
  const raw = String(tanggal || "").trim();
  // expected "28/08/2026" or "28-08-2026" or "2026-08-28"
  const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    const d = Number(ddmmyyyy[1]);
    const m = Number(ddmmyyyy[2]);
    const y = Number(ddmmyyyy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // noon to avoid DST/offset issues
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
  }
  const yyyymmdd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmdd) {
    const y = Number(yyyymmdd[1]);
    const m = Number(yyyymmdd[2]);
    const d = Number(yyyymmdd[3]);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  // fallback: try Date parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
  }
  return null;
}

export function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

// Replica of server todayKeyWIB for consistent today detection
export function todayKeyWIB(date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wib.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0 Sun, 6 Sat
  return day === 0 || day === 6;
}

export function isTodayWIB(date: Date): boolean {
  return toKey(date) === todayKeyWIB();
}

export function isFuture(date: Date): boolean {
  const today = fromKey(todayKeyWIB());
  // compare at noon
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).getTime();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0).getTime();
  return d > t;
}

export function getMonthMatrix(year: number, month: number): Date[][] {
  // month 0-11, weeks Monday-start
  const first = new Date(year, month, 1, 12, 0, 0, 0);
  const last = new Date(year, month + 1, 0, 12, 0, 0, 0);
  const startDay = first.getDay(); // 0 Sun
  // convert to Mon=0 ... Sun=6
  const mondayOffset = (startDay + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset, 12, 0, 0, 0);
  const endDay = last.getDay();
  const endOffset = (7 - ((endDay + 6) % 7) - 1) % 7;
  const end = new Date(year, month + 1, endOffset, 12, 0, 0, 0);

  const weeks: Date[][] = [];
  let cur = new Date(start);
  let week: Date[] = [];
  while (cur.getTime() <= end.getTime()) {
    week.push(new Date(cur));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length) weeks.push(week);
  return weeks;
}

export function getEntriesByDate(entries: LogbookEntry[]): Map<string, LogbookEntry> {
  const map = new Map<string, LogbookEntry>();
  for (const e of entries) {
    const d = parseTanggal(e.tanggal);
    if (!d) continue;
    const k = toKey(d);
    // keep last (newest) if duplicate date — entries may have multiples per day? keep last encountered
    map.set(k, e);
  }
  return map;
}

export function isMissingWorkday(date: Date, entriesByDate: Map<string, LogbookEntry>): boolean {
  if (isWeekend(date)) return false;
  if (isFuture(date)) return false;
  if (isTodayWIB(date)) return false; // today not considered missing until day ends
  const key = toKey(date);
  return !entriesByDate.has(key);
}

export function getMonthStats(entries: LogbookEntry[], year: number, month: number) {
  const map = getEntriesByDate(entries);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalWorkdays = 0;
  let filled = 0;
  let missing = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12, 0, 0, 0);
    if (isWeekend(date)) continue;
    if (isFuture(date)) continue;
    totalWorkdays++;
    const has = map.has(toKey(date));
    if (has) filled++;
    else if (!isTodayWIB(date)) missing++;
  }
  return { totalWorkdays, filled, missing, rate: totalWorkdays ? Math.round((filled / totalWorkdays) * 100) : 0 };
}

// For heatmap: generate 53 weeks starting ~ 1 year ago or from Jan 1 of given year
export function getHeatmapWeeks(entries: LogbookEntry[], year?: number) {
  const map = getEntriesByDate(entries);
  // if year specified, show that calendar year Jan-Dec
  // otherwise show last 24 weeks centered? For logbook, show current year.
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const start = new Date(targetYear, 0, 1, 12, 0, 0, 0);
  // align to Monday
  const startDay = (start.getDay() + 6) % 7;
  const alignedStart = new Date(start);
  alignedStart.setDate(start.getDate() - startDay);
  const end = new Date(targetYear, 11, 31, 12, 0, 0, 0);
  const endDay = (end.getDay() + 6) % 7;
  const alignedEnd = new Date(end);
  alignedEnd.setDate(end.getDate() + (6 - endDay));

  const weeks: Date[][] = [];
  let cur = new Date(alignedStart);
  let week: Date[] = [];
  while (cur.getTime() <= alignedEnd.getTime()) {
    week.push(new Date(cur));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { weeks, map };
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
