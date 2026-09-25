/** Calendar-day helpers. Days are local-time strings in YYYY-MM-DD form. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toKey(fromKey(value)) === value;
}

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Wednesday, 23 September" */
export function longDate(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Wed" */
export function shortWeekday(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()].slice(0, 3);
}

/** "Wednesday" */
export function weekday(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()];
}

/** "23 Sep" */
export function dayMonth(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "Today", "Yesterday" or the weekday name, for headings. */
export function relativeDayTitle(key: string, today: string = todayKey()): string {
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekday(key);
  return dayMonth(key);
}

/** "17 – 23 Sep" or "28 Sep – 4 Oct" for a range of days. */
export function rangeLabel(start: string, end: string): string {
  const s = fromKey(start);
  const e = fromKey(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${dayMonth(end)}`;
  }
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** Day of the week with Monday = 0 … Sunday = 6. */
export function weekdayIndex(key: string): number {
  return (fromKey(key).getDay() + 6) % 7;
}

/** First day of the week containing `key`, for weeks starting on Monday or Sunday. */
export function weekStartOf(key: string, start: 'mon' | 'sun' = 'mon'): string {
  const day = fromKey(key).getDay(); // Sunday = 0
  const back = start === 'mon' ? (day + 6) % 7 : day;
  return addDays(key, -back);
}

/** The seven days of the week that starts on `first`. */
export function weekDays(first: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** "2026-09" */
export function monthKey(key: string): string {
  return key.slice(0, 7);
}

/** "23 September" */
export function dayMonthLong(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Thu 24 Sep" */
export function shortDate(key: string): string {
  return `${shortWeekday(key)} ${dayMonth(key)}`;
}

/** "21 – 27 September" or "28 September – 4 October" (with the year when it isn't this year's). */
export function rangeLabelLong(start: string, end: string, today: string = todayKey()): string {
  const s = fromKey(start);
  const e = fromKey(end);
  const year = e.getFullYear() !== fromKey(today).getFullYear() ? ` ${e.getFullYear()}` : '';
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${dayMonthLong(end)}${year}`;
  }
  const startYear = s.getFullYear() !== e.getFullYear() ? ` ${s.getFullYear()}` : '';
  return `${dayMonthLong(start)}${startYear} – ${dayMonthLong(end)}${year}`;
}

/** "May – Sep" for the months a range of days covers. */
export function monthSpan(start: string, end: string): string {
  const a = MONTHS[fromKey(start).getMonth()].slice(0, 3);
  const b = MONTHS[fromKey(end).getMonth()].slice(0, 3);
  return a === b ? a : `${a} – ${b}`;
}

/** Local calendar day of a timestamp. */
export function dayOf(ms: number): string {
  return toKey(new Date(ms));
}
