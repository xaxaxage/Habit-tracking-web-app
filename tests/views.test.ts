import { beforeEach, describe, expect, it } from 'vitest';
import type { Habit, TimeOfDay } from '../src/lib/types';
import { cleanGroup, groupsOf, inView, matchGroup, MANY, parseView, viewParam, viewsFor } from '../src/lib/views';
import { createHabit, getData, getHabit, parseData, reload, renameGroup, updateHabit, type HabitInput } from '../src/lib/store';

let n = 0;
const habit = (group?: string, time: TimeOfDay = 'anytime'): Habit => ({
  id: `habit${String(++n).padStart(7, '0')}`,
  name: `Habit ${n}`,
  kind: 'check',
  target: 1,
  unit: '',
  step: 1,
  schedule: { type: 'daily' },
  time,
  color: 'teal',
  icon: 'check',
  order: n,
  start: '2026-09-01',
  pauses: [],
  createdAt: 1,
  updatedAt: 1,
  ...(group ? { group } : {}),
});

describe('groups', () => {
  it('cleans names', () => {
    expect(cleanGroup('  Self   care \n')).toBe('Self care');
    expect(cleanGroup('a'.repeat(40))).toHaveLength(30);
    expect(cleanGroup('Tab\tand\u0007bell')).toBe('Tab andbell');
    expect(cleanGroup(42)).toBe('');
    expect(cleanGroup('   ')).toBe('');
  });

  it('lists the groups in use A to Z, one per name whatever its case', () => {
    const habits = [habit('Self-care'), habit('education'), habit(), habit('self-care'), habit('Health')];
    expect(groupsOf(habits)).toEqual(['education', 'Health', 'Self-care']);
    expect(matchGroup(' SELF-CARE ', groupsOf(habits))).toBe('Self-care');
    expect(matchGroup('Sport', groupsOf(habits))).toBe('Sport');
  });

  it('is kept with the habit, cleaned', () => {
    const data = parseData({ version: 1, habits: [{ id: 'grp12345', name: 'Floss', group: '  Self  care ' }, { id: 'grp23456', name: 'Run', group: 7 }] });
    expect(data.habits[0].group).toBe('Self care');
    expect(data.habits[1]).not.toHaveProperty('group');
  });
});

describe('views', () => {
  const few = [habit('Health', 'morning'), habit('Education', 'evening'), habit(undefined, 'evening')];

  it('offers all, then the groups; times of day only once there are many habits', () => {
    expect(viewsFor(few).map(viewParam)).toEqual([undefined, 'g:Education', 'g:Health']);
    const many = Array.from({ length: MANY + 1 }, (_, i) => habit(undefined, i % 2 ? 'evening' : 'morning'));
    expect(viewsFor(many).map(viewParam)).toEqual([undefined, 'morning', 'evening']);
    // All at the same time of day: nothing to pick.
    expect(viewsFor(Array.from({ length: MANY + 1 }, () => habit()))).toHaveLength(1);
  });

  it('reads a view from a link, and shows only what belongs in it', () => {
    expect(parseView('evening', few)).toEqual({ kind: 'time', time: 'evening' });
    expect(parseView('g:health', few)).toEqual({ kind: 'group', group: 'Health' });
    expect(parseView('g:Gone', few)).toEqual({ kind: 'all' });
    expect(parseView('nonsense', few)).toEqual({ kind: 'all' });
    expect(few.filter((h) => inView(h, { kind: 'time', time: 'evening' }))).toHaveLength(2);
    expect(few.filter((h) => inView(h, { kind: 'group', group: 'health' }))).toEqual([few[0]]);
    expect(few.filter((h) => inView(h, { kind: 'all' }))).toHaveLength(3);
  });
});

describe('the store', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });
  const input: HabitInput = { name: 'Floss', kind: 'check', target: 1, unit: '', schedule: { type: 'daily' }, time: 'anytime', color: 'teal', icon: 'tooth' };

  it('puts habits in a group and takes them out', () => {
    const a = createHabit({ ...input, group: 'Self-care' });
    const b = createHabit({ ...input, name: 'Read', group: 'Education' });
    expect(getHabit(a.id)!.group).toBe('Self-care');
    updateHabit(b.id, { group: '' });
    expect(getHabit(b.id)).not.toHaveProperty('group');
  });

  it('renames a group on all its habits, and only those change', () => {
    const a = createHabit({ ...input, group: 'Self-care' });
    const b = createHabit({ ...input, name: 'Stretch', group: 'Self-care' });
    const c = createHabit({ ...input, name: 'Read', group: 'Education' });
    const before = getHabit(c.id)!.updatedAt;
    renameGroup('Self-care', '  Care  ');
    expect([getHabit(a.id)!.group, getHabit(b.id)!.group, getHabit(c.id)!.group]).toEqual(['Care', 'Care', 'Education']);
    expect(getHabit(a.id)!.updatedAt).toBeGreaterThan(a.updatedAt);
    expect(getHabit(c.id)!.updatedAt).toBe(before);
    renameGroup('Care', '');
    expect(groupsOf(getData().habits)).toEqual(['Education']);
  });
});
