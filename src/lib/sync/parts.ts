import type { AppData, Habit, Log, WeekStart } from '../types';
import { cleanHabit, cleanLog, isHabitId } from '../store';
import { isDateKey, monthKey } from '../dates';

/**
 * Sync splits the data into small parts — one for the habits themselves,
 * one per month of check-ins, one for the synced settings — so each fits
 * comfortably in a relay message and only the parts that changed are
 * uploaded again. Every part is encrypted before it leaves the device.
 *
 * Merging is per item and order-independent: the newest edit of a habit or
 * a day wins, and a deletion wins over any edit made before it. Every part
 * is written the same way on every device (fixed field order, sorted
 * items), so equal data always gives byte-identical parts.
 */

export interface HabitsPart {
  kind: 'habits';
  name: 'habits';
  habits: Habit[];
  deleted: { id: string; at: number }[];
}

/** One day of one habit. */
export interface DayLog extends Log {
  habit: string;
  date: string;
}

export interface MonthPart {
  kind: 'month';
  /** "2026-09", or "2026-09~2.1" for a share of a very full month (see buildParts). */
  name: string;
  logs: DayLog[];
}

export interface SettingsPart {
  kind: 'settings';
  name: 'settings';
  weekStart: WeekStart;
  /** When it last changed (0 = never). */
  at: number;
}

/** The data parts, merged into the habits. */
export type Part = HabitsPart | MonthPart | SettingsPart;

export type DeviceType = 'phone' | 'tablet' | 'computer' | 'claude';

/**
 * A device using the sync key, for the list in Settings. Each device writes
 * only its own, now and then while it's used; another device can mark it
 * removed, which hides it until it's used again.
 */
export interface DevicePart {
  kind: 'device';
  /** "device:<id>" */
  name: string;
  id: string;
  deviceName: string;
  type: DeviceType;
  /** App version, or the Claude Desktop extension's. */
  version: string;
  /** Last time it was used, roughly. */
  seenAt: number;
  removedAt?: number;
}

/**
 * Written over every part of a sync key that was replaced by a new one, so
 * devices still using the old key stop syncing and ask for the new one.
 */
export interface RetiredPart {
  kind: 'retired';
  at: number;
}

/** Anything a device can find on the relays. */
export type SyncPart = Part | DevicePart | RetiredPart;

const DEVICE_TYPES: DeviceType[] = ['phone', 'tablet', 'computer', 'claude'];

export const devicePartName = (id: string) => `device:${id}`;

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{8,64}$/i.test(value);
}

/**
 * Relays reject messages over 64 KB. A month's check-ins are tiny, but long
 * notes on many habits every day could add up: past this much JSON a month
 * is shared out over several parts, by habit. The split depends only on the
 * data, so every device splits the same way.
 */
export const MONTH_SPLIT_AT = 90_000;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A habit or a day, with its fields in the one fixed order. */
function canonicalHabit(h: Habit): Habit {
  return cleanHabit(h)!;
}

function canonicalLog(habit: string, date: string, l: Log): DayLog {
  return { habit, date, ...cleanLog(l)! };
}

/** Which share of a split month a habit's days go in. */
function share(habitId: string, shares: number): number {
  let h = 0;
  for (const ch of habitId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % shares;
}

export function monthPartNames(month: string, shares: number): string[] {
  return shares === 1 ? [month] : Array.from({ length: shares }, (_, i) => `${month}~${shares}.${i}`);
}

/** All parts for the data, keyed by name. */
export function buildParts(data: AppData): Map<string, Part> {
  const parts = new Map<string, Part>();
  const deleted = data.meta.deletedHabits;

  const habits = data.habits.filter((h) => !(deleted[h.id] >= h.updatedAt));
  const alive = new Set(habits.map((h) => h.id));
  parts.set('habits', {
    kind: 'habits',
    name: 'habits',
    habits: habits.map(canonicalHabit).sort((a, b) => cmp(a.id, b.id)),
    deleted: Object.entries(deleted)
      .map(([id, at]) => ({ id, at }))
      .sort((a, b) => cmp(a.id, b.id)),
  });

  const months = new Map<string, DayLog[]>();
  for (const habit of Object.keys(data.logs).sort()) {
    if (deleted[habit] && !alive.has(habit)) continue;
    const days = data.logs[habit];
    for (const date of Object.keys(days).sort()) {
      const m = monthKey(date);
      if (!months.has(m)) months.set(m, []);
      months.get(m)!.push(canonicalLog(habit, date, days[date]));
    }
  }
  for (const [month, logs] of months) {
    const size = JSON.stringify(logs).length;
    let shares = 1;
    while (size / shares > MONTH_SPLIT_AT && shares < 64) shares *= 2;
    const names = monthPartNames(month, shares);
    for (const name of names) parts.set(name, { kind: 'month', name, logs: [] });
    for (const l of logs) (parts.get(names[share(l.habit, shares)]) as MonthPart).logs.push(l);
  }

  parts.set('settings', { kind: 'settings', name: 'settings', weekStart: data.settings.weekStart, at: data.meta.settingsAt });
  return parts;
}

/** Validate a part received from another device. */
export function parsePart(raw: any): SyncPart | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  if (raw.kind === 'device') {
    if (!isDeviceId(raw.id) || typeof raw.deviceName !== 'string' || !raw.deviceName.trim()) return undefined;
    return {
      kind: 'device',
      name: devicePartName(raw.id),
      id: raw.id,
      deviceName: raw.deviceName.trim().slice(0, 60),
      type: DEVICE_TYPES.includes(raw.type) ? raw.type : 'computer',
      version: typeof raw.version === 'string' ? raw.version.slice(0, 60) : '',
      seenAt: time(raw.seenAt),
      ...(time(raw.removedAt) ? { removedAt: time(raw.removedAt) } : {}),
    };
  }
  if (raw.kind === 'retired') return time(raw.at) ? { kind: 'retired', at: time(raw.at) } : undefined;
  if (raw.kind === 'habits') {
    return {
      kind: 'habits',
      name: 'habits',
      habits: (Array.isArray(raw.habits) ? raw.habits : []).map(cleanHabit).filter(Boolean) as Habit[],
      deleted: (Array.isArray(raw.deleted) ? raw.deleted : [])
        .filter((d: any) => d && isHabitId(d.id) && time(d.at))
        .map((d: any) => ({ id: d.id, at: d.at })),
    };
  }
  if (raw.kind === 'month' && typeof raw.name === 'string' && /^\d{4}-\d{2}(~\d{1,2}\.\d{1,2})?$/.test(raw.name)) {
    const logs: DayLog[] = [];
    for (const l of Array.isArray(raw.logs) ? raw.logs : []) {
      if (!l || !isHabitId(l.habit) || !isDateKey(l.date)) continue;
      const clean = cleanLog(l);
      if (clean) logs.push({ habit: l.habit, date: l.date, ...clean });
    }
    return { kind: 'month', name: raw.name, logs };
  }
  if (raw.kind === 'settings') {
    return { kind: 'settings', name: 'settings', weekStart: raw.weekStart === 'sun' ? 'sun' : 'mon', at: time(raw.at) };
  }
  return undefined;
}

/** Whether a device belongs in the list: used since it was last removed. */
export function deviceShown(d: DevicePart): boolean {
  return !d.removedAt || d.seenAt > d.removedAt;
}

/** Merge a part from another device into local data. Returns the same object if nothing changed. */
export function mergePart(data: AppData, part: Part): AppData {
  if (part.kind === 'habits') return mergeHabits(data, part);
  if (part.kind === 'month') return mergeMonth(data, part);
  return mergeSettings(data, part);
}

/** Deterministic pick between two versions with the same time: the larger JSON. */
function laterOf<T>(a: T, b: T): T {
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeHabits(data: AppData, part: HabitsPart): AppData {
  let changed = false;
  const deletedHabits = { ...data.meta.deletedHabits };
  for (const d of part.deleted) {
    if (!(deletedHabits[d.id] >= d.at)) {
      deletedHabits[d.id] = d.at;
      changed = true;
    }
  }
  // A deletion wins over any edit made before it (a habit restored from a backup is newer).
  const gone = (h: Habit) => deletedHabits[h.id] >= h.updatedAt;

  const byId = new Map(data.habits.map((h) => [h.id, h]));
  for (const remote of part.habits) {
    if (gone(remote)) continue;
    const local = byId.get(remote.id);
    if (local) {
      if (remote.updatedAt < local.updatedAt) continue;
      if (remote.updatedAt === local.updatedAt) {
        const [a, b] = [canonicalHabit(remote), canonicalHabit(local)];
        if (JSON.stringify(a) === JSON.stringify(b) || laterOf(a, b) !== a) continue;
      }
    }
    byId.set(remote.id, remote);
    changed = true;
  }
  for (const [id, h] of byId) {
    if (gone(h)) {
      byId.delete(id);
      changed = true;
    }
  }
  // A deleted habit's days go with it.
  let logs = data.logs;
  for (const id of Object.keys(logs)) {
    if (deletedHabits[id] && !byId.has(id)) {
      if (logs === data.logs) logs = { ...logs };
      delete logs[id];
      changed = true;
    }
  }
  if (!changed) return data;
  return { ...data, habits: [...byId.values()], logs, meta: { ...data.meta, deletedHabits } };
}

function mergeMonth(data: AppData, part: MonthPart): AppData {
  let logs = data.logs;
  for (const remote of part.logs) {
    if (data.meta.deletedHabits[remote.habit] && !data.habits.some((h) => h.id === remote.habit)) continue;
    const local = logs[remote.habit]?.[remote.date];
    const { habit, date, ...incoming } = remote;
    let take = !local || incoming.at > local.at;
    if (local && incoming.at === local.at) {
      const a = JSON.stringify(cleanLog(incoming));
      const b = JSON.stringify(cleanLog(local));
      // Same moment on two devices: an undo wins, otherwise the larger JSON, so both pick the same.
      const emptyIn = !incoming.value && !incoming.skipped && !incoming.note;
      const emptyLocal = !local.value && !local.skipped && !local.note;
      take = a !== b && (emptyIn !== emptyLocal ? emptyIn : a > b);
    }
    if (!take) continue;
    if (logs === data.logs) logs = { ...logs };
    logs[habit] = { ...logs[habit], [date]: cleanLog(incoming)! };
  }
  return logs === data.logs ? data : { ...data, logs };
}

function mergeSettings(data: AppData, part: SettingsPart): AppData {
  const mine = { weekStart: data.settings.weekStart, at: data.meta.settingsAt };
  const theirs = { weekStart: part.weekStart, at: part.at };
  const take = theirs.at > mine.at || (theirs.at === mine.at && theirs.weekStart !== mine.weekStart && theirs.weekStart > mine.weekStart);
  if (!take) return data;
  return { ...data, settings: { ...data.settings, weekStart: part.weekStart }, meta: { ...data.meta, settingsAt: part.at } };
}
