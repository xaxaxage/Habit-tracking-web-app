import { useEffect, useState } from 'preact/hooks';
import type { AppData, Habit, HabitColor, HabitKind, Log, Pause, Schedule, Settings, SyncMeta, TimeOfDay } from './types';
import { BOARD_LAYOUTS, HABIT_COLORS, HABIT_KINDS, TIMES_OF_DAY } from './types';
import { addDays, isDateKey, todayKey } from './dates';
import { isIconId } from './icons';
import { isDone, isEmptyLog } from './habits';
import { defaultStep } from './parse';

/**
 * All data lives in this browser's localStorage, as one JSON record. Every
 * change is saved at once; if saving fails (storage full), the change stays
 * on screen and a banner says so.
 */

export const STORAGE_KEY = 'habit-tracker:v1';

export const DEFAULT_THEME = 'night';

/** Longest note kept with a check-in. */
export const MAX_NOTE = 500;
export const MAX_NAME = 60;

export function emptyMeta(): SyncMeta {
  return { deletedHabits: {}, settingsAt: 0 };
}

export function emptyData(): AppData {
  return {
    version: 1,
    habits: [],
    logs: {},
    settings: { weekStart: 'mon', theme: DEFAULT_THEME, animations: true, layout: 'tiles' },
    meta: emptyMeta(),
  };
}

// ── Checking data from storage, backups and other devices ─────────────────

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function isHabitId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{4,64}$/i.test(value);
}

export function cleanSchedule(raw: any): Schedule {
  if (raw?.type === 'weekly') return { type: 'weekly', times: Math.min(7, Math.max(1, Math.round(num(raw.times, 3)))) };
  if (raw?.type === 'days' && Array.isArray(raw.days)) {
    const days = [...new Set<number>(raw.days.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort();
    if (days.length > 0 && days.length < 7) return { type: 'days', days };
  }
  return { type: 'daily' };
}

function cleanPauses(raw: unknown): Pause[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && isDateKey(p.from) && (p.to === undefined || (isDateKey(p.to) && p.to >= p.from)))
    .map((p) => (p.to ? { from: p.from, to: p.to } : { from: p.from }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .slice(-200);
}

/** A valid habit with its fields in a fixed order, or undefined. */
export function cleanHabit(raw: any): Habit | undefined {
  if (!raw || typeof raw !== 'object' || !isHabitId(raw.id)) return undefined;
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!name) return undefined;
  const kind: HabitKind = HABIT_KINDS.includes(raw.kind) ? raw.kind : 'check';
  const target = kind === 'check' ? 1 : Math.max(kind === 'timer' ? 1 : 0.1, Math.min(1_000_000, Math.round(num(raw.target, 1) * 10) / 10));
  const createdAt = time(raw.createdAt) || Date.now();
  const habit: Habit = {
    id: raw.id,
    name,
    kind,
    target,
    unit: kind === 'check' ? '' : kind === 'timer' ? 'min' : typeof raw.unit === 'string' ? raw.unit.trim().slice(0, 20) : '',
    step: kind === 'check' ? 1 : num(raw.step) > 0 ? Math.min(target, num(raw.step)) : defaultStep(kind, target),
    schedule: cleanSchedule(raw.schedule),
    time: TIMES_OF_DAY.includes(raw.time) ? raw.time : 'anytime',
    color: HABIT_COLORS.includes(raw.color) ? raw.color : 'teal',
    icon: isIconId(raw.icon) ? raw.icon : 'check',
    order: num(raw.order),
    start: isDateKey(raw.start) ? raw.start : todayKey(new Date(createdAt)),
    pauses: cleanPauses(raw.pauses),
    createdAt,
    updatedAt: time(raw.updatedAt) || createdAt,
  };
  if (time(raw.archivedAt)) habit.archivedAt = time(raw.archivedAt);
  return habit;
}

/** A valid log with its fields in a fixed order (empty ones left out), or undefined. */
export function cleanLog(raw: any): Log | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const at = time(raw.at);
  if (!at) return undefined;
  const log: Log = { value: Math.max(0, Math.min(1_000_000, Math.round(num(raw.value) * 10) / 10)), at };
  if (raw.skipped === true) {
    log.value = 0;
    log.skipped = true;
  }
  if (typeof raw.note === 'string' && raw.note.trim()) log.note = raw.note.slice(0, MAX_NOTE);
  return { value: log.value, ...(log.skipped ? { skipped: true } : {}), ...(log.note ? { note: log.note } : {}), at };
}

export function cleanLogs(raw: unknown): AppData['logs'] {
  const out: AppData['logs'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, days] of Object.entries(raw as Record<string, unknown>)) {
    if (!isHabitId(id) || !days || typeof days !== 'object') continue;
    const clean: Record<string, Log> = {};
    for (const [date, log] of Object.entries(days as Record<string, unknown>)) {
      const l = isDateKey(date) ? cleanLog(log) : undefined;
      if (l) clean[date] = l;
    }
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

function cleanMeta(raw: any): SyncMeta {
  const deletedHabits: Record<string, number> = {};
  if (raw?.deletedHabits && typeof raw.deletedHabits === 'object') {
    for (const [id, at] of Object.entries(raw.deletedHabits)) if (isHabitId(id) && time(at)) deletedHabits[id] = at as number;
  }
  return { deletedHabits, settingsAt: time(raw?.settingsAt) };
}

/** Validate data loaded from storage or an imported backup. Throws if it isn't app data. */
export function parseData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1) {
    throw new Error('This file is not a Habit Tracker backup.');
  }
  const r = raw as any;
  if (!Array.isArray(r.habits) && !r.logs) throw new Error('This file is not a Habit Tracker backup.');
  const seen = new Set<string>();
  const habits = (Array.isArray(r.habits) ? r.habits : [])
    .map(cleanHabit)
    .filter((h: Habit | undefined): h is Habit => !!h && !seen.has(h.id) && !!seen.add(h.id));
  const meta = cleanMeta(r.meta);
  const empty = emptyData();
  return {
    version: 1,
    habits: habits.filter((h: Habit) => !(meta.deletedHabits[h.id] >= h.updatedAt)),
    logs: cleanLogs(r.logs),
    settings: {
      weekStart: r.settings?.weekStart === 'sun' ? 'sun' : 'mon',
      theme: typeof r.settings?.theme === 'string' && /^[a-z0-9-]{1,60}$/.test(r.settings.theme) ? r.settings.theme : empty.settings.theme,
      animations: r.settings?.animations !== false,
      layout: BOARD_LAYOUTS.includes(r.settings?.layout) ? r.settings.layout : 'tiles',
    },
    meta,
  };
}

// ── Keeping the data ──────────────────────────────────────────────────────

function load(): AppData {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseData(JSON.parse(text));
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return emptyData();
}

let data: AppData = load();
/** Bumped on every change, so a component can tell it missed one. */
let version = 0;
let saveError: string | null = null;
const listeners = new Set<() => void>();

export const SAVE_ERROR = "Couldn't save your last change: this device's storage is full. Free up space, or export a backup.";

function commit(next: AppData) {
  data = next;
  version++;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    saveError = null;
  } catch (err) {
    console.error('Could not save data', err);
    saveError = SAVE_ERROR;
  }
  listeners.forEach((l) => l());
}

export function getData(): AppData {
  return data;
}

export function getSaveError(): string | null {
  return saveError;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read storage, e.g. after another tab changed it. */
export function reload() {
  data = load();
  version++;
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) reload();
  });
}

export function useData(): AppData {
  const [, setTick] = useState(0);
  const seen = version;
  useEffect(() => {
    const unsubscribe = subscribe(() => setTick((t) => t + 1));
    // Effects run a moment after render; catch a change made in between.
    if (version !== seen) setTick((t) => t + 1);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

/** Short random ids: 12 characters of a–z and 0–9. */
export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

let lastStamp = 0;

/**
 * Strictly increasing timestamps, so "most recent" is unambiguous. An edit is
 * always stamped later than what it replaces (`after`), even when that came
 * from a device whose clock runs ahead: otherwise merging would keep the old
 * version and quietly undo the edit on every device.
 */
export function stamp(after = 0): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1, after + 1);
  return lastStamp;
}

// ── Habits ────────────────────────────────────────────────────────────────

export function getHabit(id: string): Habit | undefined {
  return data.habits.find((h) => h.id === id);
}

export interface HabitInput {
  name: string;
  kind: HabitKind;
  target: number;
  unit: string;
  schedule: Schedule;
  time: TimeOfDay;
  color: HabitColor;
  icon: string;
  step?: number;
}

export function createHabit(input: HabitInput, today = todayKey()): Habit {
  const t = stamp();
  const order = data.habits.reduce((max, h) => Math.max(max, h.order), 0) + 1;
  const habit = cleanHabit({ ...input, id: newId(), order, start: today, pauses: [], createdAt: t, updatedAt: t })!;
  commit({ ...data, habits: [...data.habits, habit] });
  return habit;
}

function replaceHabit(id: string, change: (h: Habit) => Habit) {
  const habits = data.habits.map((h) => (h.id === id ? cleanHabit({ ...change(h), updatedAt: stamp(h.updatedAt) })! : h));
  commit({ ...data, habits });
}

export function updateHabit(id: string, patch: Partial<HabitInput>) {
  replaceHabit(id, (h) => {
    const next = { ...h, ...patch };
    // A new goal or kind gets a fitting step unless one was given.
    if (patch.step === undefined && (patch.kind !== undefined || patch.target !== undefined)) next.step = defaultStep(next.kind, next.target);
    return next;
  });
}

export function archiveHabit(id: string) {
  replaceHabit(id, (h) => ({ ...h, archivedAt: Date.now() }));
}

export function restoreHabit(id: string) {
  const order = data.habits.reduce((max, h) => Math.max(max, h.order), 0) + 1;
  replaceHabit(id, ({ archivedAt: _gone, ...h }) => ({ ...h, order }));
}

/** Pause from today: off the board, and the days don't count against the streak. */
export function pauseHabit(id: string, today = todayKey()) {
  replaceHabit(id, (h) => ({ ...h, pauses: [...h.pauses.filter((p) => p.to), { from: today }] }));
}

export function resumeHabit(id: string, today = todayKey()) {
  replaceHabit(id, (h) => ({
    ...h,
    pauses: h.pauses
      .map((p) => (p.to ? p : { from: p.from, to: addDays(today, -1) }))
      .filter((p) => p.to! >= p.from),
  }));
}

/** Move a habit one place up (-1) or down (+1) on the board. */
export function moveHabit(id: string, direction: -1 | 1) {
  const active = data.habits.filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order);
  const i = active.findIndex((h) => h.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= active.length) return;
  // Only the moved habit changes: it goes between its new neighbours.
  const after = active[j];
  const beyond = active[j + direction];
  const order = beyond ? (after.order + beyond.order) / 2 : after.order + direction;
  replaceHabit(id, (h) => ({ ...h, order }));
}

/** Delete a habit and its check-ins (on every synced device, too). */
export function deleteHabit(id: string) {
  const { [id]: _logs, ...logs } = data.logs;
  const at = stamp(Math.max(getHabit(id)?.updatedAt ?? 0, data.meta.deletedHabits[id] ?? 0));
  commit({
    ...data,
    habits: data.habits.filter((h) => h.id !== id),
    logs,
    meta: { ...data.meta, deletedHabits: { ...data.meta.deletedHabits, [id]: at } },
  });
}

// ── Check-ins ─────────────────────────────────────────────────────────────

export function getLog(habitId: string, date: string): Log | undefined {
  return data.logs[habitId]?.[date];
}

/**
 * Change what happened on a day. Clearing everything keeps an empty log with
 * the time, so the undo reaches other devices too.
 */
export function setLog(habitId: string, date: string, patch: Partial<Omit<Log, 'at'>>) {
  const prev = data.logs[habitId]?.[date];
  const merged = { ...(prev ?? { value: 0 }), ...patch, at: stamp(prev?.at) };
  if (patch.value !== undefined && patch.value > 0 && patch.skipped === undefined) merged.skipped = false;
  const log = cleanLog(merged)!;
  if (isEmptyLog(prev) && isEmptyLog(log) && !prev) return;
  commit({ ...data, logs: { ...data.logs, [habitId]: { ...data.logs[habitId], [date]: log } } });
}

/** Mark done, or take it back. */
export function toggleDone(h: Habit, date: string) {
  setLog(h.id, date, isDone(h, getLog(h.id, date)) ? { value: 0 } : { value: h.target, skipped: false });
}

export function toggleSkip(h: Habit, date: string) {
  setLog(h.id, date, getLog(h.id, date)?.skipped ? { skipped: false } : { skipped: true, value: 0 });
}

export function setValue(h: Habit, date: string, value: number) {
  setLog(h.id, date, { value: Math.max(0, value), skipped: false });
}

export function setNote(h: Habit, date: string, note: string) {
  setLog(h.id, date, { note: note.slice(0, MAX_NOTE) });
}

/**
 * A tap on the board: yes/no habits toggle; counts and timers go up by one
 * step, and a tap on a full tile starts it over. Returns the log before.
 */
export function tapHabit(h: Habit, date: string): Log | undefined {
  const before = getLog(h.id, date);
  if (h.kind === 'check') toggleDone(h, date);
  else if (isDone(h, before)) setValue(h, date, 0);
  else setValue(h, date, Math.min(h.target, (before?.skipped ? 0 : before?.value ?? 0) + h.step));
  return before;
}

/** Put a day back as it was (for Undo). */
export function restoreLog(h: Habit, date: string, before: Log | undefined) {
  setLog(h.id, date, { value: before?.value ?? 0, skipped: !!before?.skipped, note: before?.note ?? '' });
}

/** A tap on a day in the week grid: open → done → skipped → open. */
export function cycleDay(h: Habit, date: string) {
  const log = getLog(h.id, date);
  if (isDone(h, log)) setLog(h.id, date, { value: 0, skipped: true });
  else if (log?.skipped) setLog(h.id, date, { value: 0, skipped: false });
  else setLog(h.id, date, { value: h.target, skipped: false });
}

// ── Settings ──────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  const meta = { ...data.meta };
  if (patch.weekStart !== undefined && patch.weekStart !== data.settings.weekStart) meta.settingsAt = stamp(meta.settingsAt);
  commit({ ...data, settings: { ...data.settings, ...patch }, meta });
}

// ── Backups ───────────────────────────────────────────────────────────────

/** Backup file contents: habits, check-ins and settings. The sync key lives elsewhere and is never included. */
export function backupJson(source: AppData = data): string {
  return JSON.stringify({ app: 'habit-tracker', exportedAt: new Date().toISOString(), ...source }, null, 1);
}

/**
 * Restore a backup: its habits and check-ins replace this device's. A habit
 * in the backup that was deleted since comes back (as a new change, so the
 * deletion on other devices doesn't remove it again).
 */
export function restoreBackup(next: AppData) {
  const deleted = data.meta.deletedHabits;
  const habits = next.habits.map((h) => (deleted[h.id] >= h.updatedAt ? { ...h, updatedAt: stamp(deleted[h.id]) } : h));
  // Keep every deletion known here (the restored habits are newer than theirs).
  const deletedHabits = { ...next.meta.deletedHabits };
  for (const [id, at] of Object.entries(deleted)) deletedHabits[id] = Math.max(at, deletedHabits[id] ?? 0);
  commit({
    ...next,
    habits,
    settings: { ...next.settings, theme: data.settings.theme, animations: data.settings.animations, layout: data.settings.layout },
    meta: { ...next.meta, deletedHabits },
  });
}

/** Delete every habit and check-in (on every synced device, too). Settings stay. */
export function clearAll() {
  const t = stamp(Math.max(0, ...data.habits.map((h) => h.updatedAt)));
  const deletedHabits = { ...data.meta.deletedHabits };
  for (const h of data.habits) deletedHabits[h.id] = t;
  commit({ ...data, habits: [], logs: {}, meta: { ...data.meta, deletedHabits } });
}

/** Replace the data with a merged copy from another device. */
export function applyMerged(next: AppData) {
  commit(next);
}

/** Replace everything, e.g. with test data (checked and put in order like anything loaded). */
export function replaceData(next: AppData) {
  commit(parseData(JSON.parse(JSON.stringify(next))));
}
