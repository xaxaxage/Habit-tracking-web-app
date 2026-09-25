import { describe, expect, it } from 'vitest';
import type { AppData, Habit, Log } from '../src/lib/types';
import {
  boardFor,
  dayState,
  firstDay,
  goalLabel,
  habitSummary,
  isDueOn,
  repeatLabel,
  statsOf,
  streakOf,
  weekProgress,
  weekSummary,
} from '../src/lib/habits';
import { addDays, rangeLabelLong, weekStartOf } from '../src/lib/dates';
import { emptyData } from '../src/lib/store';
import { sampleData, TODAY } from '../e2e/fixtures';

const habit = (fields: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Read',
  kind: 'check',
  target: 1,
  unit: '',
  step: 1,
  schedule: { type: 'daily' },
  time: 'anytime',
  color: 'teal',
  icon: 'book',
  order: 1,
  start: '2026-09-01',
  pauses: [],
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});

/** Logs from a compact list: "d" done, "s" skipped, a number for a value, "-" nothing. */
function logs(from: string, pattern: (string | number)[]): Record<string, Log> {
  const out: Record<string, Log> = {};
  pattern.forEach((p, i) => {
    const date = addDays(from, i);
    if (p === 'd') out[date] = { value: 1, at: 1 };
    else if (p === 's') out[date] = { value: 0, skipped: true, at: 1 };
    else if (typeof p === 'number') out[date] = { value: p, at: 1 };
  });
  return out;
}

describe('when a habit is due', () => {
  it('follows the schedule, the start, pauses and archiving', () => {
    const weekdays = habit({ schedule: { type: 'days', days: [0, 1, 2, 3, 4] } });
    expect(isDueOn(weekdays, '2026-09-25', weekdays.start)).toBe(true); // Friday
    expect(isDueOn(weekdays, '2026-09-26', weekdays.start)).toBe(false); // Saturday
    expect(isDueOn(weekdays, '2026-08-31', weekdays.start)).toBe(false); // before it started
    const paused = habit({ pauses: [{ from: '2026-09-10', to: '2026-09-12' }, { from: '2026-09-20' }] });
    expect(isDueOn(paused, '2026-09-11', paused.start)).toBe(false);
    expect(isDueOn(paused, '2026-09-13', paused.start)).toBe(true);
    expect(isDueOn(paused, '2026-09-25', paused.start)).toBe(false);
    const archived = habit({ archivedAt: new Date(2026, 8, 15, 12).getTime() });
    expect(isDueOn(archived, '2026-09-15', archived.start)).toBe(true);
    expect(isDueOn(archived, '2026-09-16', archived.start)).toBe(false);
  });

  it('starts earlier when something was logged before the start', () => {
    const h = habit({ start: '2026-09-20' });
    expect(firstDay(h, logs('2026-09-17', ['d']))).toBe('2026-09-17');
    expect(firstDay(h, { '2026-09-10': { value: 0, at: 5 } })).toBe('2026-09-20'); // an undo doesn't count
  });

  it('describes each day', () => {
    const h = habit({ kind: 'count', target: 8, schedule: { type: 'days', days: [0, 2, 4] } });
    const l = logs('2026-09-21', [8, '-', 3, 's', '-']);
    const state = (d: string) => dayState(h, l, d, '2026-09-25');
    expect(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'].map(state)).toEqual([
      'done',
      'rest',
      'partial',
      'skipped',
      'open',
      'future',
    ]);
    expect(dayState(h, l, '2026-08-01', '2026-09-25')).toBe('before');
  });
});

describe('streaks', () => {
  it('counts done days in a row; skips and today do not break it', () => {
    const h = habit();
    // 1 to 10 September: done, done, done, missed, done, skipped, done, done, done, (today, nothing yet)
    const l = logs('2026-09-01', ['d', 'd', 'd', '-', 'd', 's', 'd', 'd', 'd']);
    expect(streakOf(h, l, '2026-09-10', 'mon')).toEqual({ current: 4, best: 4, unit: 'day' });
    // Done today too.
    expect(streakOf(h, { ...l, ...logs('2026-09-10', ['d']) }, '2026-09-10', 'mon').current).toBe(5);
    // Missing yesterday breaks it.
    expect(streakOf(h, l, '2026-09-11', 'mon')).toEqual({ current: 0, best: 4, unit: 'day' });
  });

  it('ignores days off the schedule and paused days, and a partial day breaks it', () => {
    const h = habit({ kind: 'timer', target: 20, schedule: { type: 'days', days: [0, 2, 4] }, pauses: [{ from: '2026-09-09', to: '2026-09-12' }] });
    // Mon 7 done, Wed 9 + Fri 11 paused, Mon 14 done, Wed 16 done
    const l = logs('2026-09-07', [20, '-', '-', '-', '-', '-', '-', 25, '-', 30]);
    expect(streakOf(h, l, '2026-09-17', 'mon').current).toBe(3);
    const partial = { ...l, '2026-09-16': { value: 10, at: 1 } };
    expect(streakOf(h, partial, '2026-09-17', 'mon')).toMatchObject({ current: 0, best: 2 });
  });

  it('counts weeks for "N times a week", with skips lowering the week\'s goal', () => {
    const h = habit({ schedule: { type: 'weekly', times: 3 }, start: '2026-08-31' });
    const l = {
      ...logs('2026-08-31', ['d', 'd', 'd']), // week 1: 3 of 3
      ...logs('2026-09-07', ['d', 's', 'd']), // week 2: 2 done, 1 skipped → goal 2, met
      ...logs('2026-09-14', ['d', 'd']), // week 3: 2 of 3, missed
      ...logs('2026-09-21', ['d', 'd', 'd', 'd']), // week 4: met
      ...logs('2026-09-28', ['d']), // this week: 1 so far
    };
    expect(streakOf(h, l, '2026-09-29', 'mon')).toEqual({ current: 1, best: 2, unit: 'week' });
    expect(weekProgress(h, l, '2026-09-10', '2026-09-29', 'mon')).toMatchObject({ done: 2, skipped: 1, target: 2, met: true });
    expect(weekProgress(h, l, '2026-09-29', '2026-09-29', 'mon')).toMatchObject({ done: 1, target: 3, met: false, current: true });
  });

  it('gives the design\'s streaks for its sample data', () => {
    const data = sampleData();
    const streak = (id: string) => streakOf(data.habits.find((h) => h.id === id)!, data.logs[id], TODAY, 'mon').current;
    expect(['water000001', 'stretch00001', 'workout00001', 'read00000001', 'journal00001', 'screens00001'].map(streak)).toEqual([12, 7, 3, 21, 3, 1]);
  });
});

describe('stats', () => {
  it('works out the hit rate and average, leaving out today until it is done', () => {
    const h = habit({ kind: 'timer', target: 20, start: '2026-09-21' });
    const l = logs('2026-09-21', [20, 10, 's', 30, 5]);
    const s = statsOf(h, l, '2026-09-01', '2026-09-25', '2026-09-25', 'mon');
    // Mon 20 ✓, Tue 10 ✗, Wed skipped (not counted), Thu 30 ✓, Fri (today) not done yet.
    expect(s).toMatchObject({ hit: 2, due: 3, rate: 67, total: 2 });
    expect(s.average).toBeCloseTo(20);
    expect(statsOf(habit({ start: '2026-09-25' }), {}, '2026-09-01', '2026-09-25', '2026-09-25', 'mon').rate).toBeNull();
  });

  it('judges weekly habits by the week', () => {
    const h = habit({ schedule: { type: 'weekly', times: 2 }, start: '2026-09-07' });
    const l = { ...logs('2026-09-07', ['d', 'd']), ...logs('2026-09-14', ['d']), ...logs('2026-09-21', ['d']) };
    // Two weeks judged (the current one isn't met yet): 1 of 2.
    expect(statsOf(h, l, '2026-09-01', '2026-09-25', '2026-09-25', 'mon')).toMatchObject({ hit: 1, due: 2, rate: 50 });
  });
});

describe('the week', () => {
  it('scores the design\'s week, not holding skipped days against you', () => {
    const data = sampleData();
    const week = weekSummary(data, '2026-09-21', TODAY);
    const counts = Object.fromEntries(week.rows.map((r) => [r.habit.name, `${r.done}/${r.due}`]));
    expect(counts).toEqual({
      Water: '4/5',
      Stretch: '5/5',
      Workout: '3/4',
      Read: '4/5',
      Journal: '3/4',
      'Screens off 23:00': '3/5',
    });
    expect(week).toMatchObject({ done: 22, due: 28, score: 79 });
  });

  it('starts on Sunday when asked', () => {
    expect(weekStartOf('2026-09-25', 'sun')).toBe('2026-09-20');
    expect(weekStartOf('2026-09-20', 'sun')).toBe('2026-09-20');
    expect(weekStartOf('2026-09-20', 'mon')).toBe('2026-09-14');
    const h = habit({ schedule: { type: 'weekly', times: 2 } });
    const l = logs('2026-09-20', ['d', 'd']); // Sunday and Monday
    expect(weekProgress(h, l, '2026-09-22', '2026-09-26', 'sun').met).toBe(true);
    expect(weekProgress(h, l, '2026-09-22', '2026-09-26', 'mon').met).toBe(false);
  });

  it('labels weeks across months and years', () => {
    expect(rangeLabelLong('2026-09-21', '2026-09-27', '2026-09-25')).toBe('21 – 27 September');
    expect(rangeLabelLong('2026-09-28', '2026-10-04', '2026-09-25')).toBe('28 September – 4 October');
    expect(rangeLabelLong('2025-12-29', '2026-01-04', '2026-09-25')).toBe('29 December 2025 – 4 January');
  });
});

describe('the board', () => {
  it('counts what is left, leaving out skipped habits and met weekly goals', () => {
    const data = sampleData();
    const board = boardFor(data, TODAY, TODAY);
    expect(board.due.map((t) => `${t.habit.name}:${t.status}`)).toEqual([
      'Water:partial',
      'Stretch:done',
      'Workout:done',
      'Read:partial',
      'Journal:open',
      'Screens off 23:00:open',
    ]);
    expect(board).toMatchObject({ left: 4, done: 2, total: 6 });
    // Wednesday: Journal was skipped.
    expect(boardFor(data, '2026-09-23', TODAY)).toMatchObject({ done: 4, total: 5 });
  });

  it('puts habits that are not due in a separate list', () => {
    const data: AppData = {
      ...emptyData(),
      habits: [habit({ id: 'a', name: 'Weekend run', schedule: { type: 'days', days: [5, 6] } }), habit({ id: 'b', name: 'Daily', order: 2 })],
    };
    const board = boardFor(data, '2026-09-25', '2026-09-25');
    expect(board.due.map((t) => t.habit.id)).toEqual(['b']);
    expect(board.other.map((t) => t.habit.id)).toEqual(['a']);
  });

  it('shows a met weekly goal as done for the day', () => {
    const h = habit({ schedule: { type: 'weekly', times: 2 } });
    const data: AppData = { ...emptyData(), habits: [h], logs: { h1: logs('2026-09-21', ['d', 'd']) } };
    const board = boardFor(data, '2026-09-24', '2026-09-24');
    expect(board.due[0].status).toBe('met');
    expect(board).toMatchObject({ left: 0, total: 0 });
  });
});

describe('words', () => {
  it('describes goals and repeats', () => {
    expect(goalLabel({ kind: 'timer', target: 90, unit: 'min' })).toBe('1 h 30 min');
    expect(goalLabel({ kind: 'count', target: 2.5, unit: 'litres' })).toBe('2.5 litres');
    expect(goalLabel({ kind: 'check', target: 1, unit: '' })).toBe('Just do it');
    expect(repeatLabel({ type: 'days', days: [4, 0, 2] })).toBe('Mon, Wed, Fri');
    expect(repeatLabel({ type: 'days', days: [5, 6] })).toBe('Weekends');
    expect(repeatLabel({ type: 'weekly', times: 1 })).toBe('Once a week');
    expect(habitSummary(habit({ kind: 'timer', target: 20, unit: 'min', time: 'evening' }))).toBe('20 min a day · Evening');
    expect(habitSummary(habit({ schedule: { type: 'weekly', times: 4 } }))).toBe('4× a week');
    expect(habitSummary(habit({ kind: 'count', target: 8, unit: 'glasses', schedule: { type: 'days', days: [0, 1, 2, 3, 4] } }))).toBe('8 glasses · Weekdays');
  });
});
