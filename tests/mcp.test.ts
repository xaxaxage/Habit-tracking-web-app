import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent } from 'nostr-tools/pure';
import { getData, reload, replaceData } from '../src/lib/store';
import { decryptText, deriveKeys, encryptText, newPhrase, partLabel } from '../src/lib/sync/crypto';
import {
  archiveHabitTool,
  checkIn,
  createHabitTool,
  editHabit,
  getProgress,
  listHabits,
  skipHabit,
  ToolError,
  undoCheckIn,
} from '../mcp/tools';
import { OfflineError, RelaySync } from '../mcp/relays';
import { sampleData } from '../e2e/fixtures';
import { startRelay, startSilentRelay, startSilentTcp } from './relay-server';

// The design's day, for the sample data. Only Date is faked; sockets and timers run for real.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 12));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  reload();
  replaceData(sampleData());
});

describe('reading', () => {
  it('lists the habits and how today is going', () => {
    const r = listHabits();
    expect(r.summary).toEqual({ done: 2, still_to_do: 4, due: 6 });
    const water = r.habits.find((h) => h.name === 'Water')!;
    expect(water).toMatchObject({ id: 'water000001', type: 'count', goal: '8 glasses', status: 'partly done', amount: '5 glasses', due: true });
    expect(water.streak).toEqual({ current: 12, best: 12, unit: 'days' });
    expect(r.habits.find((h) => h.name === 'Workout')).toMatchObject({ this_week: '3 of 4', status: 'done', streak: { current: 3, unit: 'weeks' } });
    expect(listHabits({ date: '2026-09-23' }).habits.find((h) => h.name === 'Journal')).toMatchObject({ status: 'skipped' });
  });

  it('reports progress and streaks over a period', () => {
    const week = getProgress({ from: '2026-09-21', to: '2026-09-25' });
    const journal = week.habits.find((h) => h.name === 'Journal')!;
    expect(journal).toMatchObject({ days_done: '3 of 3', hit_rate: '100%', streak: { current: 3 } });
    expect(journal.days!.map((d) => d.status)).toEqual(['done', 'done', 'skipped', 'done', 'not done']);
    expect(week.habits.find((h) => h.name === 'Workout')).toMatchObject({ weeks_met: '0 of 0' });
    const read = getProgress({ habit: 'read', from: '2026-09-01' });
    expect(read.habits).toHaveLength(1);
    // 1–24 September were due (today isn't over yet); the design's history has a few misses early on.
    expect(read.habits[0]).toMatchObject({ days_done: expect.stringMatching(/^2\d of 24$/), average_per_day: expect.stringMatching(/min$/) });
    expect(read.habits[0].days).toHaveLength(25);
    expect(() => getProgress({ from: '2025-01-01', to: '2026-09-25' })).toThrow(/366 days/);
    expect(() => getProgress({ from: '2026-09-25', to: '2026-09-01' })).toThrow(/after/);
  });
});

describe('checking in', () => {
  it('logs by name or id, adds amounts, and touches only that month', () => {
    const add = checkIn({ habit: 'wat', amount: 2, add: true });
    expect(add.result).toMatchObject({ habit: 'Water', status: 'partly done', amount: '7 glasses' });
    expect(add.touched).toEqual(['2026-09']);
    expect(checkIn({ habit: 'Water' }).result).toMatchObject({ status: 'done', amount: '8 glasses' });
    const read = checkIn({ habit: 'read00000001', amount: 25, note: 'Two chapters' });
    expect(read.result).toMatchObject({ status: 'done', amount: '25 min', note: 'Two chapters' });
    expect(checkIn({ habit: 'Screens off', date: '2026-08-30' }).touched).toEqual(['2026-08']);
    expect(checkIn({ habit: 'journal' }).result.day).toEqual({ done: 5, still_to_do: 1, due: 6 });
  });

  it('skips and undoes, keeping the streak', () => {
    expect(skipHabit({ habit: 'Journal', note: 'Too tired' }).result).toMatchObject({ status: 'skipped', note: 'Too tired', streak: { current: 3 } });
    expect(undoCheckIn({ habit: 'Journal' }).result).toMatchObject({ status: 'not done', note: 'Too tired' });
    expect(undoCheckIn({ habit: 'Stretch' }).result).toMatchObject({ status: 'not done', streak: { current: 6 } });
  });

  it('explains mistakes', () => {
    expect(() => checkIn({ habit: 'Flossing' })).toThrow(/no habit "Flossing".*Water, Stretch/);
    expect(() => checkIn({ habit: 's' })).toThrow(/matches 2 habits.*Stretch.*Screens off/);
    expect(() => checkIn({ habit: 'Water', date: '2026-09-26' })).toThrow(/future/);
    expect(() => checkIn({ habit: 'Water', date: '26/09' })).toThrow(/YYYY-MM-DD/);
    expect(() => checkIn({ habit: 'Stretch', amount: 5 })).toThrow(/yes\/no/);
    expect(() => checkIn({ habit: 'Water', amount: -1 })).toThrow(ToolError);
  });
});

describe('habits', () => {
  it('creates from a sentence, with fields winning', () => {
    const r = createHabitTool({ description: 'Meditate 10 min every morning' });
    expect(r.result.created).toMatchObject({ name: 'Meditate', type: 'timer', goal: '10 min', time_of_day: 'Morning', icon: 'lotus', repeat: 'Every day' });
    expect(r.touched).toEqual(['habits']);
    const run = createHabitTool({ description: 'Run 5 km', repeat: 'days', days: ['mon', 'thu'], color: 'ember' });
    expect(run.result.created).toMatchObject({ name: 'Run', type: 'count', goal: '5 km', repeat: 'Mon, Thu', color: 'ember', icon: 'run' });
    expect(createHabitTool({ name: 'Floss', type: 'yes_no' }).result.created).toMatchObject({ name: 'Floss', icon: 'tooth' });
    expect(() => createHabitTool({ name: 'water' })).toThrow(/already a habit called "Water"/);
    expect(() => createHabitTool({})).toThrow(/name/);
    expect(() => createHabitTool({ name: 'X', type: 'yes_no', goal: 5 })).toThrow(/no goal/);
  });

  it('edits, pauses, archives and restores', () => {
    expect(editHabit({ habit: 'Water', name: 'Water intake', goal: 10 }).result.updated).toMatchObject({ name: 'Water intake', goal: '10 glasses' });
    expect(editHabit({ habit: 'Workout', times_per_week: 3 }).result.updated).toMatchObject({ repeat: '3× a week' });
    expect(editHabit({ habit: 'Read', paused: true }).result.updated).toMatchObject({ paused_since: '2026-09-25' });
    // Off today's board; the 10 minutes already logged today still show.
    expect(listHabits().habits.find((h) => h.name === 'Read')).toMatchObject({ due: false, paused_since: '2026-09-25', status: 'partly done' });
    expect(listHabits().summary.due).toBe(5);
    expect(editHabit({ habit: 'Read', paused: false }).result.updated).not.toHaveProperty('paused_since');
    expect(() => editHabit({ habit: 'Read' })).toThrow(/Nothing to change/);

    expect(archiveHabitTool({ habit: 'Journal' }).result).toMatchObject({ archived: { name: 'Journal', archived: true } });
    expect(listHabits().habits.map((h) => h.name)).not.toContain('Journal');
    expect(() => checkIn({ habit: 'Journal' })).toThrow(/archived/);
    expect(listHabits({ include_archived: true }).archived!.map((h) => h.name)).toEqual(['Journal']);
    archiveHabitTool({ habit: 'Journal', restore: true });
    expect(checkIn({ habit: 'Journal' }).result.status).toBe('done');
  });
});

describe('relay sync', () => {
  const relay = startRelay();
  const phrase = newPhrase();
  const clients: RelaySync[] = [];
  const client = (relays = [relay.url()], device?: ConstructorParameters<typeof RelaySync>[2], words = phrase) => {
    const c = new RelaySync(words, relays, device);
    clients.push(c);
    return c;
  };
  beforeAll(() => new Promise((r) => setTimeout(r, 50)));
  afterEach(() => relay.refuse(false));
  afterAll(async () => {
    clients.forEach((c) => c.close());
    await relay.close();
  });

  it('uploads encrypted parts, and another client reads them back', async () => {
    const a = client();
    await a.pull();
    expect(a.partCount).toBe(0);
    const { touched } = checkIn({ habit: 'Journal', note: 'Wrote about the trip' });
    expect(await a.push(['habits', 'settings', '2026-05', '2026-06', '2026-07', '2026-08', ...touched])).toEqual({ sent: 7, failed: [] });
    expect(await a.push(touched)).toEqual({ sent: 0, failed: [] });
    const stored = JSON.stringify([...relay.events.values()]);
    for (const secret of ['Journal', 'Wrote about', '2026-09', 'glasses']) expect(stored).not.toContain(secret);

    localStorage.clear();
    reload();
    const b = client();
    await b.pull();
    expect(b.partCount).toBe(7);
    expect(listHabits().habits.find((h) => h.name === 'Journal')).toMatchObject({ status: 'done', note: 'Wrote about the trip' });

    // A later change from the first client arrives on the next (incremental) pull.
    replaceData(sampleData());
    await a.pull();
    skipHabit({ habit: 'Water' });
    await a.push(['2026-09']);
    await b.pull();
    expect(getData().logs.water000001['2026-09-25']).toMatchObject({ skipped: true });
  });

  it('shows up in the device list, and stops when the key was replaced in the app', async () => {
    const keys = await deriveKeys(phrase);
    const device = { id: 'claude-test-device-01', name: 'Claude Desktop · Windows', version: '1.20260925.1200' };
    const c = client([relay.url()], device);
    await c.pull();
    await c.announce();
    const label = await partLabel(keys.nameKey, `device:${device.id}`);
    const stored = [...relay.events.values()].find((e) => e.tags.some((t) => t[0] === 'd' && t[1] === label))!;
    expect(JSON.parse(await decryptText(keys.encKey, stored.content))).toMatchObject({ kind: 'device', type: 'claude', deviceName: 'Claude Desktop · Windows' });
    await c.announce(); // not again right away
    expect([...relay.events.values()].find((e) => e.tags.some((t) => t[1] === label))!.id).toBe(stored.id);

    // Another device replaces the key: every part it knew becomes "retired".
    const retired = await encryptText(keys.encKey, JSON.stringify({ kind: 'retired', at: Date.now() }));
    for (const e of [...relay.events.values()].filter((e) => e.pubkey === stored.pubkey)) {
      const d = e.tags.find((t) => t[0] === 'd')![1];
      relay.events.set(`${e.pubkey}:30078:${d}`, finalizeEvent({ kind: 30078, created_at: e.created_at + 1, tags: [['d', d]], content: retired }, keys.secretKey));
    }
    const fresh = client([relay.url()], device);
    await fresh.pull();
    expect(fresh.retiredAt).toBeGreaterThan(0);
  });

  it('reports a relay that refuses uploads', async () => {
    const c = client();
    await c.pull();
    checkIn({ habit: 'Stretch', date: '2026-09-18' });
    relay.refuse(true);
    expect(await c.push(['2026-09'])).toEqual({ sent: 0, failed: ['2026-09'] });
  });

  it('never lists itself as a device under a key with no data', async () => {
    const c = client([relay.url()], { id: 'claude-unused-key-01', name: 'Claude Desktop · Windows', version: '1' }, newPhrase());
    const before = relay.events.size;
    await c.pull();
    await c.announce();
    expect(c.partCount).toBe(0);
    expect(relay.events.size).toBe(before);
  });

  it('says when no relay can be reached, without crashing', async () => {
    await expect(client(['ws://127.0.0.1:1', 'ws://127.0.0.1:2']).pull()).rejects.toBeInstanceOf(OfflineError);
  });

  it('keeps going past relays that never answer, and leaves them out for a while', async () => {
    const tcp = await startSilentTcp();
    const ws = startSilentRelay();
    await new Promise((r) => setTimeout(r, 50));
    try {
      const c = client([relay.url(), tcp.url, ws.url()]);
      let started = Date.now();
      await c.pull();
      // Done shortly after the working relay answered, not after the silent ones time out.
      expect(Date.now() - started).toBeLessThan(4000);
      checkIn({ habit: 'Read', amount: 30 });
      expect(await c.push(['2026-09'])).toEqual({ sent: 1, failed: [] });
      started = Date.now();
      await c.pull();
      expect(Date.now() - started).toBeLessThan(1500);
      await expect(client([tcp.url, ws.url()]).pull()).rejects.toBeInstanceOf(OfflineError);
      // A late error from a socket given up on would surface here and fail the run.
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      await tcp.close();
      await ws.close();
    }
  }, 30_000);
});
