// Local calendar dates and months. Pure functions, no time zones:
// dates are "YYYY-MM-DD" strings and months are "YYYY-MM" strings, always local.
// Never parse these with new Date("YYYY-MM-DD"), which reads them as UTC.

/** The app is in English, so dates and month names are English ("3 Oct", "October 2026") on every device.
 * Numbers and money follow the device's own locale (12,50 € on a Greek phone). */
export const DATE_LOCALE = "en-GB";

export type DateStr = string; // "YYYY-MM-DD"
export type MonthKey = string; // "YYYY-MM"

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** The local calendar date of a Date object. */
export function dateOf(d: Date): DateStr {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** Split a date string into numbers, or null if it isn't a real calendar date. */
export function parseDate(s: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidDate(s: string): boolean {
  return parseDate(s) !== null;
}

export function parseMonth(s: MonthKey): { year: number; month: number } | null {
  const m = MONTH_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 1900 || month < 1 || month > 12) return null;
  return { year, month };
}

function requireMonth(s: MonthKey): { year: number; month: number } {
  const p = parseMonth(s);
  if (!p) throw new RangeError(`Invalid month key: ${s}`);
  return p;
}

/** The month a date belongs to. */
export function monthOf(date: DateStr): MonthKey {
  if (!isValidDate(date)) throw new RangeError(`Invalid date: ${date}`);
  return date.slice(0, 7);
}

/** Move a month key by n months (n can be negative). */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const { year, month: m } = requireMonth(month);
  const index = year * 12 + (m - 1) + n;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

/** Negative if a is before b, 0 if equal, positive if after. String compare is safe for this format. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  requireMonth(a);
  requireMonth(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Number of calendar months from `from` through `to`, both included. 0 if `to` is before `from`. */
export function monthsInclusive(from: MonthKey, to: MonthKey): number {
  const a = requireMonth(from);
  const b = requireMonth(to);
  const diff = b.year * 12 + b.month - (a.year * 12 + a.month);
  return diff < 0 ? 0 : diff + 1;
}

/** The last `count` months ending at `end`, oldest first. */
export function lastMonths(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - (count - 1)));
}

/** "October 2026" in the given locale. Uses the local Date constructor, never a string parse. */
export function monthLabel(month: MonthKey, locale?: string, style: "long" | "short" = "long"): string {
  const { year, month: m } = requireMonth(month);
  return new Intl.DateTimeFormat(locale ?? DATE_LOCALE, { month: style, year: "numeric" }).format(new Date(year, m - 1, 1));
}
