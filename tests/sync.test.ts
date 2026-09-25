import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Habit, Log } from '../src/lib/types';
import { buildParts, MONTH_SPLIT_AT, mergePart, parsePart, type MonthPart, type Part } from '../src/lib/sync/parts';
import { decryptText, deriveKeys, encryptText, isValidPhrase, newPhrase, normalizePhrase, partLabel, SYNC_SALT } from '../src/lib/sync/crypto';
import { clearAll, createHabit, deleteHabit, emptyData, getData, reload, replaceData, restoreBackup, parseData, backupJson, setNote, tapHabit, updateSettings } from '../src/lib/store';
import { boardHabits } from '../src/lib/habits';
import { sampleData } from '../e2e/fixtures';

const habit = (id: string, fields: Partial<Habit> = {}): Habit => ({
  id,
  name: `Habit ${id}`,
  kind: 'check',
  target: 1,
  unit: '',
  step: 1,
  schedule: { type: 'daily' },
  time: 'anytime',
  color: 'teal',
  icon: 'check',
  order: 1,
  start: '2026-09-01',
  pauses: [],
  createdAt: 100,
  updatedAt: 100,
  ...fields,
});

const withData = (habits: Habit[], logs: AppData['logs'] = {}, meta: Partial<AppData['meta']> = {}): AppData => {
  const d = emptyData();
  return { ...d, habits, logs, meta: { ...d.meta, ...meta } };
};

/** Send every part of `from` through JSON (as a relay would) and merge into `into`. */
function syncInto(into: AppData, from: AppData): AppData {
  let out = into;
  for (const part of buildParts(from).values()) out = mergePart(out, parsePart(JSON.parse(JSON.stringify(part))) as Part);
  return out;
}

const partsJson = (d: AppData) => JSON.stringify([...buildParts(d).values()]);

describe('parts', () => {
  it('has one part for the habits, one per month of check-ins, one for settings', () => {
    const parts = buildParts(sampleData());
    expect([...parts.keys()].sort()).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', 'habits', 'settings']);
    const sept = parts.get('2026-09') as MonthPart;
    expect(sept.logs.every((l) => l.date.startsWith('2026-09'))).toBe(true);
    // Every part stays far below the relays' 64 KB, before compression even.
    for (const p of parts.values()) expect(JSON.stringify(p).length).toBeLessThan(20_000);
  });

  it('writes equal data the same way, whatever order it was in', () => {
    const data = sampleData();
    const shuffled: AppData = {
      ...data,
      habits: [...data.habits].reverse().map((h) => Object.fromEntries(Object.entries(h).reverse()) as unknown as Habit),
      logs: Object.fromEntries(
        Object.entries(data.logs)
          .reverse()
          .map(([id, days]) => [id, Object.fromEntries(Object.entries(days).reverse().map(([d, l]) => [d, Object.fromEntries(Object.entries(l).reverse()) as unknown as Log]))]),
      ),
    };
    expect(partsJson(shuffled)).toBe(partsJson(data));
  });

  it('shares out a month too full for one relay message, the same way on every device', () => {
    const habits = Array.from({ length: 40 }, (_, i) => habit(`h${String(i).padStart(6, '0')}`));
    const logs: AppData['logs'] = {};
    for (const h of habits) {
      logs[h.id] = {};
      for (let d = 1; d <= 30; d++) logs[h.id][`2026-09-${String(d).padStart(2, '0')}`] = { value: 1, note: 'A long note about the day. '.repeat(10), at: 5 };
    }
    const data = withData(habits, logs);
    const parts = buildParts(data);
    const months = [...parts.values()].filter((p): p is MonthPart => p.kind === 'month');
    expect(months.length).toBeGreaterThan(1);
    expect(months.map((m) => m.name).every((n) => /^2026-09~\d+\.\d+$/.test(n))).toBe(true);
    expect(months.reduce((n, m) => n + m.logs.length, 0)).toBe(1200);
    for (const m of months) expect(JSON.stringify(m).length).toBeLessThan(MONTH_SPLIT_AT * 1.5);
    // Another device gets every day back.
    const other = syncInto(withData([]), data);
    expect(Object.values(other.logs).reduce((n, d) => n + Object.keys(d).length, 0)).toBe(1200);
  });
});

describe('merging two devices', () => {
  it('adds habits and days from the other device, and is idempotent', () => {
    const phone = withData([habit('aaaa1')], { aaaa1: { '2026-09-20': { value: 1, at: 200 } } });
    const laptop = withData([habit('bbbb1')], { bbbb1: { '2026-09-21': { value: 1, at: 300 } } });
    const merged = syncInto(phone, laptop);
    expect(merged.habits.map((h) => h.id).sort()).toEqual(['aaaa1', 'bbbb1']);
    expect(Object.keys(merged.logs).sort()).toEqual(['aaaa1', 'bbbb1']);
    expect(syncInto(merged, laptop)).toBe(merged);
    expect(partsJson(syncInto(laptop, merged))).toBe(partsJson(merged));
  });

  it('keeps the newest edit of a habit and of a day', () => {
    const a = withData([habit('h1111', { name: 'Old', updatedAt: 100 })], { h1111: { '2026-09-20': { value: 3, at: 500 } } });
    const b = withData([habit('h1111', { name: 'New', updatedAt: 200 })], { h1111: { '2026-09-20': { value: 5, at: 400 } } });
    for (const m of [syncInto(a, b), syncInto(b, a)]) {
      expect(m.habits[0].name).toBe('New');
      expect(m.logs.h1111['2026-09-20'].value).toBe(3);
    }
  });

  it('an undo wins over the check-in it undid, on every device', () => {
    const done = withData([habit('h1111')], { h1111: { '2026-09-20': { value: 1, at: 500 } } });
    const undone = withData([habit('h1111')], { h1111: { '2026-09-20': { value: 0, at: 600 } } });
    expect(syncInto(done, undone).logs.h1111['2026-09-20'].value).toBe(0);
    expect(syncInto(undone, done).logs.h1111['2026-09-20'].value).toBe(0);
    // Same moment on two devices: the undo still wins.
    const tie = withData([habit('h1111')], { h1111: { '2026-09-20': { value: 0, at: 500 } } });
    expect(syncInto(done, tie).logs.h1111['2026-09-20'].value).toBe(0);
    expect(syncInto(tie, done).logs.h1111['2026-09-20'].value).toBe(0);
  });

  it('a deletion wins over older edits and takes the days with it, but not over a later edit', () => {
    const phone = withData([habit('h1111', { updatedAt: 100 }), habit('h2222', { updatedAt: 900 })], {
      h1111: { '2026-09-20': { value: 1, at: 150 } },
    });
    const laptop = withData([], {}, { deletedHabits: { h1111: 500, h2222: 500 } });
    const merged = syncInto(phone, laptop);
    expect(merged.habits.map((h) => h.id)).toEqual(['h2222']);
    expect(merged.logs.h1111).toBeUndefined();
    // The deletion travels on to a third device, and days arriving late for the deleted habit are dropped.
    const tablet = withData([habit('h1111', { updatedAt: 100 })]);
    const third = syncInto(syncInto(tablet, merged), phone);
    expect(third.habits.map((h) => h.id)).toEqual(['h2222']);
    expect(third.logs.h1111).toBeUndefined();
  });

  it('converges to byte-identical parts, even with ties', () => {
    const a = withData([habit('h1111', { name: 'A', updatedAt: 200 })], { h1111: { '2026-09-20': { value: 2, at: 700 } } });
    const b = withData([habit('h1111', { name: 'B', updatedAt: 200 }), habit('h2222')], { h1111: { '2026-09-20': { value: 4, at: 700 } } });
    const ab = syncInto(a, b);
    const ba = syncInto(b, a);
    expect(partsJson(ab)).toBe(partsJson(ba));
    expect(syncInto(ab, ba)).toBe(ab);
  });

  it('merges the synced setting by time', () => {
    const a: AppData = { ...emptyData(), settings: { ...emptyData().settings, weekStart: 'sun' }, meta: { ...emptyData().meta, settingsAt: 900 } };
    const b = emptyData();
    expect(syncInto(b, a).settings.weekStart).toBe('sun');
    expect(syncInto(a, b)).toBe(a);
    // The palette and animations stay per device.
    const themed: AppData = { ...a, settings: { ...a.settings, theme: 'paper', animations: false } };
    expect(syncInto(b, themed).settings).toMatchObject({ theme: 'night', animations: true });
  });

  it('checks parts from other devices', () => {
    expect(parsePart({ kind: 'month', name: 'bad' })).toBeUndefined();
    expect(parsePart('nope')).toBeUndefined();
    const part = parsePart({ kind: 'month', name: '2026-09', logs: [{ habit: 'x', date: '2026-09-01', value: 1, at: 1 }, { habit: 'good1', date: '2026-02-31', value: 1, at: 1 }, { habit: 'good1', date: '2026-09-02', value: 'x', at: 1 }] });
    expect(part).toEqual({ kind: 'month', name: '2026-09', logs: [{ habit: 'good1', date: '2026-09-02', value: 0, at: 1 }] });
    const habits = parsePart({ kind: 'habits', habits: [{ id: 'ok1234', name: 'Run', kind: 'evil' }, { id: '!!', name: 'x' }], deleted: [{ id: 'gone12', at: 5 }, { id: 'x' }] });
    expect(habits).toMatchObject({ habits: [{ id: 'ok1234', kind: 'check' }], deleted: [{ id: 'gone12', at: 5 }] });
  });
});

describe('the store, as sync sees it', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it('records edits, undos, deletions and the synced setting', () => {
    const h = createHabit({ name: 'Run', kind: 'check', target: 1, unit: '', schedule: { type: 'daily' }, time: 'anytime', color: 'teal', icon: 'run' });
    tapHabit(h, '2026-09-20');
    tapHabit(h, '2026-09-20');
    expect(getData().logs[h.id]['2026-09-20']).toMatchObject({ value: 0 });
    setNote(h, '2026-09-21', 'Rain');
    updateSettings({ weekStart: 'sun' });
    expect(getData().meta.settingsAt).toBeGreaterThan(0);
    deleteHabit(h.id);
    expect(getData().meta.deletedHabits[h.id]).toBeGreaterThan(0);
  });

  it('an edit wins even over a version from a device whose clock runs ahead', () => {
    const future = Date.now() + 3 * 3600_000;
    const h = { ...createHabit({ name: 'Run', kind: 'count', target: 8, unit: 'km', schedule: { type: 'daily' }, time: 'anytime', color: 'teal', icon: 'run' }) };
    // The other device (clock 3 hours ahead) logged 5 and renamed the habit.
    const ahead = withData([{ ...h, name: 'Long run', updatedAt: future }], { [h.id]: { '2026-09-25': { value: 5, at: future } } });
    replaceData(syncInto(getData(), ahead));
    tapHabit(getData().habits[0], '2026-09-25');
    updateSettings({ weekStart: 'sun' });
    expect(getData().logs[h.id]['2026-09-25'].at).toBeGreaterThan(future);
    // Back on the device that is ahead, this device's newer edit wins.
    expect(syncInto(ahead, getData()).logs[h.id]['2026-09-25'].value).toBe(6);
    deleteHabit(h.id);
    expect(syncInto(ahead, getData()).habits).toHaveLength(0);
  });

  it('delete everything reaches other devices, and a restored backup is not deleted again', () => {
    replaceData(sampleData());
    const backup = parseData(JSON.parse(backupJson()));
    const otherDevice = getData();
    clearAll();
    // The other device hears about the deletion…
    const afterDelete = syncInto(otherDevice, getData());
    expect(afterDelete.habits).toHaveLength(0);
    // …then this device restores the backup, and the other device gets the habits back.
    restoreBackup(backup);
    const afterRestore = syncInto(afterDelete, getData());
    expect(boardHabits(afterRestore).map((h) => h.name)).toEqual(sampleData().habits.map((h) => h.name));
    expect(afterRestore.logs).toEqual(getData().logs);
    expect(partsJson(syncInto(getData(), afterRestore))).toBe(partsJson(afterRestore));
  });
});

describe('sync key and encryption', () => {
  it('makes 12-word keys and accepts pasted or dictated variants', () => {
    const phrase = newPhrase();
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidPhrase(phrase)).toBe(true);
    expect(isValidPhrase(`  ${phrase.toUpperCase().replace(/ /g, ',\n ')}.`)).toBe(true);
    expect(isValidPhrase(phrase.split(' ').slice(0, 11).join(' '))).toBe(false);
    expect(isValidPhrase('abandon '.repeat(12))).toBe(false); // bad checksum
    expect(normalizePhrase(' Apple,  BANANA\ncherry ')).toBe('apple banana cherry');
  });

  it('derives the same keys from the same words on every device, and opaque labels', async () => {
    const phrase = newPhrase();
    const a = await deriveKeys(phrase);
    const b = await deriveKeys(phrase.toUpperCase());
    expect(a.pubkey).toBe(b.pubkey);
    expect(a.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(await partLabel(a.nameKey, '2026-09')).toBe(await partLabel(b.nameKey, '2026-09'));
    expect(await partLabel(a.nameKey, '2026-09')).not.toContain('2026');
  });

  it('never meets the calorie tracker, even with the same 12 words', async () => {
    expect(SYNC_SALT).toBe('habit-tracker-sync');
    const phrase = newPhrase();
    const habits = await deriveKeys(phrase);
    const calories = await deriveKeys(phrase, 'calorie-tracker-sync');
    // Different author on the relays: neither app ever downloads or replaces the other's events.
    expect(habits.pubkey).not.toBe(calories.pubkey);
    // Different labels and encryption: nothing either app could write would even decrypt in the other.
    expect(await partLabel(habits.nameKey, 'meta')).not.toBe(await partLabel(calories.nameKey, 'meta'));
    const sealed = await encryptText(calories.encKey, JSON.stringify({ kind: 'week', name: '2026-W39', entries: [] }));
    await expect(decryptText(habits.encKey, sealed)).rejects.toThrow();
  });

  it('compresses and encrypts so only the same words can read it', async () => {
    const phrase = newPhrase();
    const a = await deriveKeys(phrase);
    const b = await deriveKeys(phrase);
    const text = JSON.stringify(buildParts(sampleData()).get('2026-09'));
    const sealed = await encryptText(a.encKey, text);
    expect(sealed.startsWith('1z:')).toBe(true);
    expect(sealed).not.toContain('water');
    expect(sealed.length).toBeLessThan(text.length);
    expect(await decryptText(b.encKey, sealed)).toBe(text);
    await expect(decryptText((await deriveKeys(newPhrase())).encKey, sealed)).rejects.toThrow();
  });
});
