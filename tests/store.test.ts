import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveHabit,
  backupJson,
  clearAll,
  createHabit,
  cycleDay,
  deleteHabit,
  getData,
  getHabit,
  getLog,
  getSaveError,
  moveHabit,
  parseData,
  pauseHabit,
  reload,
  replaceData,
  restoreBackup,
  restoreHabit,
  restoreLog,
  resumeHabit,
  setNote,
  STORAGE_KEY,
  tapHabit,
  toggleSkip,
  updateHabit,
  updateSettings,
  type HabitInput,
} from '../src/lib/store';
import { boardHabits, isDone } from '../src/lib/habits';
import { sampleData } from '../e2e/fixtures';

const water: HabitInput = {
  name: 'Water',
  kind: 'count',
  target: 8,
  unit: 'glasses',
  schedule: { type: 'daily' },
  time: 'anytime',
  color: 'teal',
  icon: 'drop',
};
const stretch: HabitInput = { ...water, name: 'Stretch', kind: 'check', target: 1, unit: '', icon: 'stretch' };
const read: HabitInput = { ...water, name: 'Read', kind: 'timer', target: 20, unit: 'min', icon: 'book' };
const DAY = '2026-09-25';

beforeEach(() => {
  localStorage.clear();
  reload();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('habits', () => {
  it('creates habits in board order with a fitting step, and saves at once', () => {
    const a = createHabit(water, DAY);
    const b = createHabit(read, DAY);
    expect(a).toMatchObject({ name: 'Water', step: 1, start: DAY, order: 1, pauses: [] });
    expect(b).toMatchObject({ step: 5, order: 2, unit: 'min' });
    expect(a.id).toMatch(/^[a-z0-9]{12}$/);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).habits).toHaveLength(2);
  });

  it('edits, reorders, archives, pauses and deletes', () => {
    const a = createHabit(water, DAY);
    const b = createHabit(stretch, DAY);
    const c = createHabit(read, DAY);
    const before = getHabit(a.id)!.updatedAt;
    updateHabit(a.id, { target: 10 });
    expect(getHabit(a.id)).toMatchObject({ target: 10, step: 1 });
    expect(getHabit(a.id)!.updatedAt).toBeGreaterThan(before);

    moveHabit(c.id, -1);
    expect(boardHabits(getData()).map((h) => h.name)).toEqual(['Water', 'Read', 'Stretch']);
    // Only the moved habit changed.
    expect(getHabit(b.id)!.order).toBe(2);
    moveHabit(c.id, -1);
    expect(boardHabits(getData()).map((h) => h.name)).toEqual(['Read', 'Water', 'Stretch']);

    archiveHabit(b.id);
    expect(boardHabits(getData()).map((h) => h.name)).toEqual(['Read', 'Water']);
    restoreHabit(b.id);
    expect(boardHabits(getData()).map((h) => h.name)).toEqual(['Read', 'Water', 'Stretch']);

    pauseHabit(a.id, '2026-09-20');
    expect(getHabit(a.id)!.pauses).toEqual([{ from: '2026-09-20' }]);
    resumeHabit(a.id, DAY);
    expect(getHabit(a.id)!.pauses).toEqual([{ from: '2026-09-20', to: '2026-09-24' }]);
    pauseHabit(a.id, DAY);
    resumeHabit(a.id, DAY); // paused and resumed the same day: nothing to remember
    expect(getHabit(a.id)!.pauses).toEqual([{ from: '2026-09-20', to: '2026-09-24' }]);

    tapHabit(getHabit(c.id)!, DAY);
    deleteHabit(c.id);
    expect(getHabit(c.id)).toBeUndefined();
    expect(getData().logs[c.id]).toBeUndefined();
    expect(getData().meta.deletedHabits[c.id]).toBeGreaterThan(0);
  });
});

describe('checking in', () => {
  it('taps: yes/no toggles, counts and timers add a step and start over when full', () => {
    const s = createHabit(stretch, DAY);
    tapHabit(s, DAY);
    expect(isDone(s, getLog(s.id, DAY))).toBe(true);
    tapHabit(s, DAY);
    expect(getLog(s.id, DAY)).toMatchObject({ value: 0 });

    const r = createHabit({ ...read, target: 18 }, DAY);
    for (let i = 0; i < 3; i++) tapHabit(r, DAY);
    expect(getLog(r.id, DAY)!.value).toBe(15);
    tapHabit(r, DAY); // never past the goal by tapping
    expect(getLog(r.id, DAY)!.value).toBe(18);
    const before = tapHabit(r, DAY); // full: starts over
    expect(getLog(r.id, DAY)!.value).toBe(0);
    restoreLog(r, DAY, before); // Undo
    expect(getLog(r.id, DAY)!.value).toBe(18);
  });

  it('skips, notes and the week grid cycle', () => {
    const w = createHabit(water, DAY);
    setNote(w, DAY, 'Hot day');
    toggleSkip(w, DAY);
    expect(getLog(w.id, DAY)).toMatchObject({ value: 0, skipped: true, note: 'Hot day' });
    tapHabit(w, DAY); // logging after all clears the skip
    expect(getLog(w.id, DAY)).toMatchObject({ value: 1, note: 'Hot day' });
    expect(getLog(w.id, DAY)!.skipped).toBeUndefined();

    const d = '2026-09-24';
    cycleDay(w, d);
    expect(getLog(w.id, d)).toMatchObject({ value: 8 });
    cycleDay(w, d);
    expect(getLog(w.id, d)).toMatchObject({ value: 0, skipped: true });
    cycleDay(w, d);
    // Back to open, but remembered as an undo so other devices undo it too.
    expect(getLog(w.id, d)).toEqual({ value: 0, at: expect.any(Number) });
  });

  it('stamps every change later than the one before', () => {
    const w = createHabit(water, DAY);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      tapHabit(w, DAY);
      times.push(getLog(w.id, DAY)!.at);
    }
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(times).size).toBe(5);
  });
});

describe('settings', () => {
  it('stamps the synced setting only when it changes', () => {
    updateSettings({ theme: 'paper' });
    expect(getData().meta.settingsAt).toBe(0);
    updateSettings({ weekStart: 'sun' });
    expect(getData().meta.settingsAt).toBeGreaterThan(0);
  });
});

describe('saving', () => {
  it('keeps the change on screen and says so when storage is full, then recovers', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const w = createHabit(water, DAY);
    expect(getSaveError()).toMatch(/storage is full/);
    expect(getHabit(w.id)).toBeDefined();
    spy.mockRestore();
    tapHabit(w, DAY);
    expect(getSaveError()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).habits).toHaveLength(1);
  });

  it('reads back exactly what it saved', () => {
    replaceData(sampleData());
    const saved = JSON.stringify(getData());
    reload();
    expect(JSON.stringify(getData())).toBe(saved);
    expect(getData()).toEqual(sampleData());
  });
});

describe('backups', () => {
  it('round-trips everything and never contains the sync key', () => {
    replaceData(sampleData());
    const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    localStorage.setItem('habit-tracker:sync', JSON.stringify({ phrase }));
    const json = backupJson();
    expect(json).not.toContain('abandon');
    expect(json).not.toContain('phrase');

    const original = getData();
    clearAll();
    expect(getData().habits).toHaveLength(0);
    restoreBackup(parseData(JSON.parse(json)));
    const restored = getData();
    expect(restored.habits.map((h) => h.name)).toEqual(sampleData().habits.map((h) => h.name));
    expect(restored.logs).toEqual(original.logs);
    expect(restored.habits.map((h) => ({ ...h, updatedAt: 0 }))).toEqual(original.habits.map((h) => ({ ...h, updatedAt: 0 })));
    // Deleted everywhere and then restored: the habits are newer than the deletion, so they stay.
    for (const h of restored.habits) expect(restored.meta.deletedHabits[h.id]).toBeUndefined();
  });

  it('refuses files that are not backups', () => {
    expect(() => parseData({ version: 1, entries: [], favorites: [] })).toThrow(/not a Habit Tracker backup/);
    expect(() => parseData('hello')).toThrow();
    expect(() => parseData({ version: 2, habits: [] })).toThrow();
  });

  it('cleans what it reads', () => {
    const data = parseData({
      version: 1,
      habits: [
        { id: 'ok123456', name: '  Walk  ', kind: 'count', target: 'x', schedule: { type: 'days', days: [9, 1, 1] }, color: 'pink' },
        { id: 'bad id!', name: 'x' },
        { id: 'noname01' },
      ],
      logs: { ok123456: { '2026-02-30': { value: 1, at: 1 }, '2026-09-25': { value: 3, skipped: true, note: 42, at: 5 } } },
    });
    expect(data.habits).toHaveLength(1);
    expect(data.habits[0]).toMatchObject({ name: 'Walk', target: 1, schedule: { type: 'days', days: [1] }, color: 'teal', icon: 'check' });
    expect(data.logs.ok123456).toEqual({ '2026-09-25': { value: 0, skipped: true, at: 5 } });
  });
});
