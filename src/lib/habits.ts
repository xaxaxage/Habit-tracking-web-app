import type { AppData, Habit, HabitKind, Log, Pause, Schedule, TimeOfDay, WeekStart } from './types';
import { addDays, dayOf, weekDays, weekStartOf, weekdayIndex } from './dates';

/**
 * Habit rules: when a habit is due, whether a day counts as done, streaks and
 * stats. Everything here is a pure function of the data and "today", so the
 * app, the tests and the Claude Desktop extension agree on every number.
 *
 * - A day is done when its value reaches the goal (1 for yes/no habits).
 * - A skipped day is neutral: it neither breaks nor extends a streak, and it
 *   isn't counted against you.
 * - Days a habit is paused, days it isn't scheduled on, and days before it
 *   started are not due.
 * - Today isn't over yet: not having done it today never breaks a streak.
 * - "N times a week" habits are judged per week; a skipped day lowers that
 *   week's goal by one.
 */

export type DayState = 'done' | 'partial' | 'skipped' | 'open' | 'rest' | 'paused' | 'before' | 'future';

type Logs = Record<string, Log> | undefined;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function isWeekly(h: Habit): h is Habit & { schedule: { type: 'weekly'; times: number } } {
  return h.schedule.type === 'weekly';
}

export function isDone(h: Habit, log: Log | undefined): boolean {
  return !!log && !log.skipped && log.value >= Math.max(1, h.target);
}

/** A log that holds nothing: what's left after an undo. */
export function isEmptyLog(log: Log | undefined): boolean {
  return !log || (!log.value && !log.skipped && !log.note);
}

/** The first day a habit counts: its start, or an earlier day something was logged. */
export function firstDay(h: Habit, logs: Logs): string {
  let first = h.start;
  if (logs) for (const [d, l] of Object.entries(logs)) if (d < first && (l.value > 0 || l.skipped)) first = d;
  return first;
}

/** The last day an archived habit counted. */
export function lastDay(h: Habit): string | undefined {
  return h.archivedAt ? dayOf(h.archivedAt) : undefined;
}

export function isPaused(h: Habit, date: string): boolean {
  return h.pauses.some((p) => date >= p.from && (!p.to || date <= p.to));
}

/** The pause going on now, if any. */
export function currentPause(h: Habit): Pause | undefined {
  return h.pauses.find((p) => !p.to);
}

export function isScheduled(schedule: Schedule, date: string): boolean {
  return schedule.type !== 'days' || schedule.days.includes(weekdayIndex(date));
}

/** Whether the day is part of the habit's life: started, not paused, not archived. */
export function isActiveOn(h: Habit, date: string, first: string): boolean {
  const last = lastDay(h);
  return date >= first && (!last || date <= last) && !isPaused(h, date);
}

/** Due on this day (for "N times a week" habits every active day is a chance, not a duty). */
export function isDueOn(h: Habit, date: string, first: string): boolean {
  return isActiveOn(h, date, first) && isScheduled(h.schedule, date);
}

export function dayState(h: Habit, logs: Logs, date: string, today: string, first = firstDay(h, logs)): DayState {
  const log = logs?.[date];
  if (date > today) return 'future';
  if (isDone(h, log)) return 'done';
  if (log?.skipped) return 'skipped';
  if (log && log.value > 0) return 'partial';
  if (date < first) return 'before';
  if (!isActiveOn(h, date, first)) return 'paused';
  if (!isScheduled(h.schedule, date)) return 'rest';
  return 'open';
}

// ── Weeks for "N times a week" habits ─────────────────────────────────────

export interface WeekProgress {
  /** Days done this week (up to today). */
  done: number;
  skipped: number;
  /** The week's goal after skipped days: 0 means the week doesn't count. */
  target: number;
  met: boolean;
  /** The week contains today (so it can still be met). */
  current: boolean;
}

export function weekProgress(h: Habit, logs: Logs, anyDay: string, today: string, weekStart: WeekStart): WeekProgress {
  const times = isWeekly(h) ? h.schedule.times : 7;
  const first = firstDay(h, logs);
  const days = weekDays(weekStartOf(anyDay, weekStart)).filter((d) => isActiveOn(h, d, first));
  let done = 0;
  let skipped = 0;
  for (const d of days) {
    if (d > today) continue;
    const log = logs?.[d];
    if (isDone(h, log)) done++;
    else if (log?.skipped) skipped++;
  }
  const target = Math.max(0, Math.min(times, days.length) - skipped);
  const current = weekDays(weekStartOf(anyDay, weekStart)).includes(today);
  return { done, skipped, target, met: target > 0 && done >= target, current };
}

// ── Streaks ───────────────────────────────────────────────────────────────

export interface Streak {
  current: number;
  best: number;
  /** Weekly habits count their streak in weeks. */
  unit: 'day' | 'week';
}

export function streakOf(h: Habit, logs: Logs, today: string, weekStart: WeekStart): Streak {
  const first = firstDay(h, logs);
  const last = lastDay(h);
  const end = last && last < today ? last : today;
  let run = 0;
  let best = 0;

  if (isWeekly(h)) {
    for (let ws = weekStartOf(first, weekStart); ws <= end; ws = addDays(ws, 7)) {
      const w = weekProgress(h, logs, ws, today, weekStart);
      if (w.target === 0) continue;
      if (w.met) best = Math.max(best, ++run);
      else if (!w.current) run = 0;
    }
    return { current: run, best, unit: 'week' };
  }

  for (let d = first; d <= end; d = addDays(d, 1)) {
    if (!isDueOn(h, d, first)) continue;
    const log = logs?.[d];
    if (isDone(h, log)) best = Math.max(best, ++run);
    else if (log?.skipped || d === today) continue;
    else run = 0;
  }
  return { current: run, best, unit: 'day' };
}

// ── Stats over a period ───────────────────────────────────────────────────

export interface Stats {
  /** Share of the due days (or weeks) that were done, 0–100; null when nothing was due yet. */
  rate: number | null;
  hit: number;
  due: number;
  /** Days done in the period. */
  total: number;
  /** Average value per due day (count and timer habits) or days done per week (weekly habits). */
  average: number;
}

export function statsOf(h: Habit, logs: Logs, from: string, to: string, today: string, weekStart: WeekStart): Stats {
  const first = firstDay(h, logs);
  const start = from > first ? from : first;
  const end = to < today ? to : today;
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isDone(h, logs?.[d])) total++;

  if (isWeekly(h)) {
    let hit = 0;
    let due = 0;
    let doneDays = 0;
    for (let ws = weekStartOf(start, weekStart); ws <= end; ws = addDays(ws, 7)) {
      const w = weekProgress(h, logs, ws, today, weekStart);
      if (w.target === 0 || (w.current && !w.met)) continue;
      due++;
      doneDays += w.done;
      if (w.met) hit++;
    }
    return { rate: due ? Math.round((hit / due) * 100) : null, hit, due, total, average: due ? doneDays / due : 0 };
  }

  let hit = 0;
  let due = 0;
  let sum = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isDueOn(h, d, first)) continue;
    const log = logs?.[d];
    const done = isDone(h, log);
    if (log?.skipped || (d === today && !done)) continue;
    due++;
    sum += log?.value ?? 0;
    if (done) hit++;
  }
  return { rate: due ? Math.round((hit / due) * 100) : null, hit, due, total, average: due ? sum / due : 0 };
}

// ── Week view ─────────────────────────────────────────────────────────────

export interface WeekRow {
  habit: Habit;
  days: { date: string; state: DayState; log?: Log }[];
  done: number;
  due: number;
}

export interface WeekSummary {
  days: string[];
  rows: WeekRow[];
  done: number;
  due: number;
  /** 0–100, or null when nothing was due. */
  score: number | null;
}

export function weekSummary(data: AppData, first: string, today: string): WeekSummary {
  const days = weekDays(first);
  const rows: WeekRow[] = [];
  let doneN = 0;
  let dueN = 0;
  for (const h of boardHabits(data)) {
    const logs = data.logs[h.id];
    const start = firstDay(h, logs);
    if (start > days[6]) continue;
    const cells = days.map((date) => ({ date, state: dayState(h, logs, date, today, start), log: logs?.[date] }));
    let done: number;
    let due: number;
    if (isWeekly(h)) {
      const w = weekProgress(h, logs, first, today, data.settings.weekStart);
      done = w.done;
      due = w.target;
    } else {
      const counted = cells.filter((c) => c.date <= today && isDueOn(h, c.date, start) && c.state !== 'skipped');
      done = counted.filter((c) => c.state === 'done').length;
      due = counted.length;
    }
    doneN += Math.min(done, due);
    dueN += due;
    rows.push({ habit: h, days: cells, done, due });
  }
  return { days, rows, done: doneN, due: dueN, score: dueN ? Math.round((doneN / dueN) * 100) : null };
}

// ── Board ─────────────────────────────────────────────────────────────────

export type TileStatus = 'done' | 'partial' | 'skipped' | 'open' | 'met';

export interface Tile {
  habit: Habit;
  log?: Log;
  status: TileStatus;
  /** Progress towards the day's goal, 0–1. */
  progress: number;
  streak: Streak;
  /** Weekly habits: this week so far. */
  week?: WeekProgress;
}

/** Habits that aren't archived, in board order. */
export function boardHabits(data: AppData): Habit[] {
  return data.habits.filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export function tileFor(data: AppData, h: Habit, date: string, today: string): Tile {
  const logs = data.logs[h.id];
  const log = logs?.[date];
  const weekStart = data.settings.weekStart;
  const progress = log && !log.skipped ? Math.min(1, log.value / Math.max(1, h.target)) : 0;
  const week = isWeekly(h) ? weekProgress(h, logs, date, today, weekStart) : undefined;
  let status: TileStatus = 'open';
  if (isDone(h, log)) status = 'done';
  else if (log?.skipped) status = 'skipped';
  else if (week?.met) status = 'met';
  else if (progress > 0) status = 'partial';
  return { habit: h, log, status, progress, streak: streakOf(h, logs, today, weekStart), week };
}

export interface Board {
  /** Due that day. */
  due: Tile[];
  /** Not due that day (not scheduled, paused, or not started yet); can still be logged. */
  other: Tile[];
  /** Due and not done or skipped yet. */
  left: number;
  /** Done out of those that count for the day. */
  done: number;
  total: number;
}

export function boardFor(data: AppData, date: string, today: string): Board {
  const due: Tile[] = [];
  const other: Tile[] = [];
  for (const h of boardHabits(data)) {
    const tile = tileFor(data, h, date, today);
    const first = firstDay(h, data.logs[h.id]);
    (isDueOn(h, date, first) ? due : other).push(tile);
  }
  const counted = due.filter((t) => t.status !== 'skipped' && t.status !== 'met');
  const done = counted.filter((t) => t.status === 'done').length;
  return { due, other, left: counted.length - done, done, total: counted.length };
}

// ── Words ─────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<HabitKind, string> = { check: 'Yes / No', count: 'Count', timer: 'Timer' };

export const TIME_LABEL: Record<TimeOfDay, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** "20 min", "1 h", "1 h 30 min" */
export function minutesLabel(min: number): string {
  if (min < 60) return `${fmt(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Numbers without needless decimals: 2.5, 8, 0.3. */
export function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** An amount of a habit: "20 min", "8 glasses", "Done". */
export function amountLabel(h: Habit, value: number): string {
  if (h.kind === 'timer') return minutesLabel(value);
  if (h.kind === 'count') return `${fmt(value)}${h.unit ? ` ${h.unit}` : ''}`;
  return value >= 1 ? 'Done' : 'Not done';
}

/** "Just do it", "8 glasses", "20 min" */
export function goalLabel(h: Pick<Habit, 'kind' | 'target' | 'unit'>): string {
  if (h.kind === 'check') return 'Just do it';
  if (h.kind === 'timer') return minutesLabel(h.target);
  return `${fmt(h.target)}${h.unit ? ` ${h.unit}` : ''}`;
}

/** "Every day", "Weekdays", "Weekends", "Mon, Wed, Fri", "3× a week" */
export function repeatLabel(s: Schedule): string {
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return s.times === 1 ? 'Once a week' : `${s.times}× a week`;
  const days = [...s.days].sort();
  const key = days.join('');
  if (key === '01234') return 'Weekdays';
  if (key === '56') return 'Weekends';
  if (key === '0123456') return 'Every day';
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** The line under a habit's name on its page: "20 min a day · Evening". */
export function habitSummary(h: Habit): string {
  const goal = h.kind === 'check' ? '' : goalLabel(h);
  let repeat = repeatLabel(h.schedule);
  if (goal && h.schedule.type === 'daily') repeat = 'a day';
  const parts = [goal ? `${goal} ${repeat === 'a day' ? repeat : `· ${repeat}`}` : repeat];
  if (h.time !== 'anytime') parts.push(TIME_LABEL[h.time]);
  return parts.join(' · ');
}
