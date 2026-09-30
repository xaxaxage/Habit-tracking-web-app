import { describe, expect, it } from 'vitest';
import type { AppData, Habit, Log } from '../src/lib/types';
import { emptyData } from '../src/lib/store';
import { addDays, fromKey } from '../src/lib/dates';
import { boardOrder, daysAgainst, neighboursAt, PLACEMENT_DAYS, usualMinute } from '../src/lib/order';

const TODAY = '2026-09-25';

let n = 0;
const habit = (name: string, fields: Partial<Habit> = {}): Habit => ({
  id: `${name.toLowerCase().replace(/\W/g, '')}0000`.slice(0, 12),
  name,
  kind: 'check',
  target: 1,
  unit: '',
  step: 1,
  schedule: { type: 'daily' },
  time: 'anytime',
  color: 'teal',
  icon: 'check',
  order: ++n,
  start: '2026-06-01',
  pauses: [],
  createdAt: 100,
  updatedAt: 100,
  ...fields,
});

/** A local time on a day, as a timestamp. */
const at = (date: string, hhmm: string) => {
  const d = fromKey(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m);
  return d.getTime();
};

/** Done on each of the `days` days before today, at `hhmm`. */
const doneDaily = (days: number, hhmm: string, value = 1): Record<string, Log> =>
  Object.fromEntries(Array.from({ length: days }, (_, i) => addDays(TODAY, -1 - i)).map((d) => [d, { value, at: at(d, hhmm) }]));

const board = (habits: Habit[], logs: AppData['logs'] = {}): AppData => ({ ...emptyData(), habits, logs });
const names = (d: AppData, today = TODAY) => boardOrder(d, today).map((h) => h.name);

describe('the usual time a habit gets done', () => {
  it('is the median of when it was finished', () => {
    const h = habit('Read');
    const logs = { ...doneDaily(5, '21:00'), [addDays(TODAY, -6)]: { value: 1, at: at(addDays(TODAY, -6), '07:00') } };
    expect(usualMinute(h, logs, TODAY)).toBe(21 * 60);
  });

  it('counts only days it was finished on the day, before today', () => {
    const h = habit('Water', { kind: 'count', target: 8 });
    const d1 = addDays(TODAY, -1);
    const d2 = addDays(TODAY, -2);
    const d3 = addDays(TODAY, -3);
    const logs: Record<string, Log> = {
      [TODAY]: { value: 8, at: at(TODAY, '06:00') }, // today: not yet
      [d1]: { value: 8, at: at(TODAY, '09:00') }, // filled in the next morning
      [d2]: { value: 5, at: at(d2, '06:00') }, // not finished
      [d3]: { value: 8, at: at(d3, '19:30') },
    };
    expect(usualMinute(h, logs, TODAY)).toBe(19 * 60 + 30);
    expect(usualMinute(h, { [d2]: { value: 0, skipped: true, at: at(d2, '08:00') } }, TODAY)).toBeUndefined();
  });

  it('keeps a check-in just after midnight with the day before', () => {
    const h = habit('Screens off');
    const d = addDays(TODAY, -1);
    expect(usualMinute(h, { [d]: { value: 1, at: at(TODAY, '00:30') } }, TODAY)).toBe(24 * 60 + 30);
  });

  it('follows a new routine: recent weeks count more', () => {
    const h = habit('Run');
    const old = Object.fromEntries(Array.from({ length: 10 }, (_, i) => addDays(TODAY, -30 - i)).map((d) => [d, { value: 1, at: at(d, '21:00') }]));
    const logs = { ...old, ...doneDaily(8, '07:00') };
    expect(usualMinute(h, logs, TODAY)).toBe(7 * 60);
    // More than eight weeks ago doesn't count at all.
    const ancient = Object.fromEntries(Array.from({ length: 30 }, (_, i) => addDays(TODAY, -60 - i)).map((d) => [d, { value: 1, at: at(d, '21:00') }]));
    expect(usualMinute(h, { ...ancient, ...doneDaily(1, '07:00') }, TODAY)).toBe(7 * 60);
  });
});

describe('board order', () => {
  it('puts habits in the order you usually get them done', () => {
    const [journal, water, stretch] = [habit('Journal'), habit('Water'), habit('Stretch')];
    const d = board([journal, water, stretch], {
      [journal.id]: doneDaily(10, '22:00'),
      [water.id]: doneDaily(10, '18:00'),
      [stretch.id]: doneDaily(10, '07:15'),
    });
    expect(names(d)).toEqual(['Stretch', 'Water', 'Journal']);
    // The same answer for the same data, without working it out again.
    expect(boardOrder(d, TODAY)).toBe(boardOrder(d, TODAY));
  });

  it('places habits without a history by their time of day, "anytime" ones last, in the order they were added', () => {
    const d = board(
      [
        habit('Floss', { time: 'anytime' }),
        habit('Read', { time: 'evening' }),
        habit('Lunch walk', { time: 'afternoon' }),
        habit('Stretch', { time: 'morning' }),
        habit('Vitamins', { time: 'anytime' }),
        habit('Coffee'),
      ],
      {},
    );
    d.logs[d.habits[5].id] = doneDaily(5, '10:30');
    expect(names(d)).toEqual(['Stretch', 'Coffee', 'Lunch walk', 'Read', 'Floss', 'Vitamins']);
  });

  it('leaves archived habits out', () => {
    const d = board([habit('Kept'), habit('Gone', { archivedAt: 5 })]);
    expect(names(d)).toEqual(['Kept']);
  });
});

describe('moving a habit', () => {
  const setup = () => {
    const [a, b, c, e] = [habit('A'), habit('B'), habit('C'), habit('E')];
    const logs = { [a.id]: doneDaily(20, '07:00'), [b.id]: doneDaily(20, '08:00'), [c.id]: doneDaily(20, '09:00'), [e.id]: doneDaily(20, '10:00') };
    return { a, b, c, e, logs };
  };
  const moved = addDays(TODAY, -10);

  it('puts it right after the habit it was dropped behind, or first', () => {
    const { a, b, c, e, logs } = setup();
    expect(names(board([a, b, c, e], logs))).toEqual(['A', 'B', 'C', 'E']);
    const e2 = { ...e, placed: { after: a.id, at: at(TODAY, '06:00') } };
    expect(names(board([a, b, c, e2], logs))).toEqual(['A', 'E', 'B', 'C']);
    const c2 = { ...c, placed: { before: a.id, at: at(TODAY, '06:00') } };
    expect(names(board([a, b, c2, e], logs))).toEqual(['C', 'A', 'B', 'E']);
  });

  it('applies moves in the order they were made', () => {
    const { a, b, c, e, logs } = setup();
    const b2 = { ...b, placed: { after: e.id, at: at(TODAY, '06:00') } };
    const c2 = { ...c, placed: { after: e.id, at: at(TODAY, '06:05') } };
    // C went behind E last, so it's right behind E, and B after it.
    expect(names(board([a, b2, c2, e], logs))).toEqual(['A', 'E', 'C', 'B']);
  });

  it(`holds until it's done in the other order on ${PLACEMENT_DAYS} days`, () => {
    const { a, b, c, e, logs } = setup();
    // E moved behind A ten days ago, but it's still done last (after A) every day: that agrees.
    const e2 = { ...e, placed: { after: a.id, at: at(moved, '06:00') } };
    expect(daysAgainst(e2, board([a, b, c, e2], logs), TODAY)).toBe(0);
    expect(names(board([a, b, c, e2], logs))).toEqual(['A', 'E', 'B', 'C']);

    // C moved in front of A, but still done after it: against it on every day since.
    const c2 = { ...c, placed: { before: a.id, at: at(addDays(TODAY, -PLACEMENT_DAYS + 1), '06:00') } };
    const d = board([a, b, c2, e], logs);
    expect(daysAgainst(c2, d, TODAY)).toBe(PLACEMENT_DAYS - 1);
    expect(names(d)).toEqual(['C', 'A', 'B', 'E']);
    // One more day like that (today, seen from tomorrow) and the learned order is back.
    const withToday = board([a, b, c2, e], {
      ...logs,
      [a.id]: { ...logs[a.id], [TODAY]: { value: 1, at: at(TODAY, '07:00') } },
      [c.id]: { ...logs[c.id], [TODAY]: { value: 1, at: at(TODAY, '09:00') } },
    });
    expect(daysAgainst(c2, withToday, TODAY)).toBe(PLACEMENT_DAYS - 1);
    expect(daysAgainst(c2, withToday, addDays(TODAY, 1))).toBe(PLACEMENT_DAYS);
    expect(names(withToday, addDays(TODAY, 1))).toEqual(['A', 'B', 'C', 'E']);
  });

  it('only counts days both were done, after the move', () => {
    const { a, b, logs } = setup();
    const b2 = { ...b, placed: { before: a.id, at: at(TODAY, '06:00') } };
    // Before the move, B was always done after A: that doesn't count against it.
    expect(daysAgainst(b2, board([a, b2], logs), TODAY)).toBe(0);
    const since = addDays(TODAY, -3);
    const b3 = { ...b, placed: { before: a.id, at: at(since, '06:00') } };
    const onlyB = { [a.id]: {}, [b.id]: logs[b.id] };
    expect(daysAgainst(b3, board([a, b3], onlyB), TODAY)).toBe(0);
  });

  it('goes back to the learned place when its neighbour is gone', () => {
    const { a, b, c, e, logs } = setup();
    const e2 = { ...e, placed: { after: a.id, at: at(TODAY, '06:00') } };
    expect(names(board([{ ...a, archivedAt: 5 }, b, c, e2], logs))).toEqual(['B', 'C', 'E']);
  });

  it('works out the neighbours of a drop', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(neighboursAt(list, 'd', 1)).toEqual({ after: 'a' });
    expect(neighboursAt(list, 'c', 0)).toEqual({ before: 'a' });
    expect(neighboursAt(list, 'a', 3)).toEqual({ after: 'd' });
    expect(neighboursAt(list, 'b', 1)).toBeUndefined();
    expect(neighboursAt(list, 'a', 9)).toEqual({ after: 'd' });
  });
});
