import type { Habit, HabitColor, HabitKind, Schedule, TimeOfDay } from '../src/lib/types';
import { HABIT_COLORS, TIMES_OF_DAY } from '../src/lib/types';
import {
  archiveHabit,
  createHabit,
  getData,
  getLog,
  MAX_NAME,
  MAX_NOTE,
  pauseHabit,
  restoreHabit,
  resumeHabit,
  setLog,
  updateHabit,
  type HabitInput,
} from '../src/lib/store';
import {
  amountLabel,
  boardFor,
  boardHabits,
  currentPause,
  dayState,
  firstDay,
  goalLabel,
  isDueOn,
  isWeekly,
  repeatLabel,
  statsOf,
  streakOf,
  TIME_LABEL,
  weekProgress,
  type DayState,
} from '../src/lib/habits';
import { addDays, daysBetween, isDateKey, monthKey, todayKey } from '../src/lib/dates';
import { autoColor, parseHabit } from '../src/lib/parse';
import { guessIcon, HABIT_ICONS, isIconId } from '../src/lib/icons';
import { buildParts } from '../src/lib/sync/parts';

/**
 * What each tool does to the habits, apart from talking to the relays.
 * Writes return the sync parts they touched, so only those get uploaded.
 */

/** A mistake in the request, explained so Claude can fix it and call again. */
export class ToolError extends Error {}

export interface WriteResult<T> {
  result: T;
  touched: string[];
}

const KIND_OUT: Record<HabitKind, string> = { check: 'yes/no', count: 'count', timer: 'timer' };
const KIND_IN: Record<string, HabitKind> = { yes_no: 'check', 'yes/no': 'check', check: 'check', count: 'count', timer: 'timer', minutes: 'timer' };
const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const STATUS: Record<DayState, string> = {
  done: 'done',
  partial: 'partly done',
  skipped: 'skipped',
  open: 'not done',
  rest: 'not due',
  paused: 'paused',
  before: 'before it started',
  future: 'upcoming',
};

export function checkDate(date: string | undefined, { future = false } = {}): string {
  const today = todayKey();
  let d: string;
  if (date === undefined || date === '' || date === 'today') d = today;
  else if (date === 'yesterday') d = addDays(today, -1);
  else if (!isDateKey(date)) throw new ToolError(`"${date}" is not a date. Use YYYY-MM-DD.`);
  else d = date;
  if (!future && d > today) throw new ToolError(`${d} is in the future; check-ins are for today or earlier days.`);
  return d;
}

/** A habit by its id or its name (exact, then the start of a name, then part of one). */
export function findHabit(ref: string, { archived = false }: { archived?: boolean } = {}): Habit {
  const all = getData().habits;
  const byId = all.find((h) => h.id === ref.trim());
  if (byId) return byId;
  const q = ref.trim().toLowerCase();
  if (!q) throw new ToolError('Say which habit: its name or id (list_habits shows them).');
  const pool = archived ? all : all.filter((h) => !h.archivedAt);
  for (const match of [
    (h: Habit) => h.name.toLowerCase() === q,
    (h: Habit) => h.name.toLowerCase().startsWith(q),
    (h: Habit) => h.name.toLowerCase().includes(q),
  ]) {
    const found = pool.filter(match);
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      throw new ToolError(`"${ref}" matches ${found.length} habits: ${found.map((h) => `${h.name} (${h.id})`).join(', ')}. Use the id.`);
    }
  }
  const archivedMatch = !archived && all.find((h) => h.archivedAt && h.name.toLowerCase().includes(q));
  if (archivedMatch) throw new ToolError(`"${archivedMatch.name}" is archived. Restore it with archive_habit (restore: true) first.`);
  const names = boardHabits(getData()).map((h) => h.name);
  throw new ToolError(`There is no habit "${ref}".${names.length ? ` The habits are: ${names.join(', ')}.` : ' There are no habits yet.'}`);
}

function habitOut(h: Habit) {
  return {
    id: h.id,
    name: h.name,
    type: KIND_OUT[h.kind],
    goal: goalLabel(h),
    ...(h.kind === 'check' ? {} : { goal_amount: h.target, unit: h.unit }),
    repeat: repeatLabel(h.schedule),
    time_of_day: TIME_LABEL[h.time],
    color: h.color,
    icon: h.icon,
    ...(currentPause(h) ? { paused_since: currentPause(h)!.from } : {}),
    ...(h.archivedAt ? { archived: true } : {}),
  };
}

function dayOut(h: Habit, date: string, today: string) {
  const logs = getData().logs[h.id];
  const log = logs?.[date];
  const state = dayState(h, logs, date, today);
  return {
    status: STATUS[state],
    ...(h.kind !== 'check' && log && log.value > 0 ? { amount: amountLabel(h, log.value) } : {}),
    ...(log?.note ? { note: log.note } : {}),
  };
}

function streakOut(h: Habit, today: string) {
  const s = streakOf(h, getData().logs[h.id], today, getData().settings.weekStart);
  return { current: s.current, best: s.best, unit: s.unit === 'week' ? 'weeks' : 'days' };
}

/** The month part(s) a day's check-in lives in. */
function monthParts(date: string): string[] {
  const m = monthKey(date);
  return [...buildParts(getData()).keys()].filter((n) => n === m || n.startsWith(`${m}~`));
}

// ── Reading ───────────────────────────────────────────────────────────────

export function listHabits(input: { date?: string; include_archived?: boolean } = {}) {
  const today = todayKey();
  const date = checkDate(input.date);
  const data = getData();
  const board = boardFor(data, date, today);
  const habits = [...board.due, ...board.other].map((t) => {
    const h = t.habit;
    const w = isWeekly(h) ? weekProgress(h, data.logs[h.id], date, today, data.settings.weekStart) : undefined;
    return {
      ...habitOut(h),
      due: board.due.includes(t),
      ...dayOut(h, date, today),
      streak: streakOut(h, today),
      ...(w ? { this_week: `${w.done} of ${h.schedule.type === 'weekly' ? h.schedule.times : 7}` } : {}),
    };
  });
  const archived = input.include_archived ? data.habits.filter((h) => h.archivedAt).map(habitOut) : undefined;
  return {
    date,
    today,
    summary: { done: board.done, still_to_do: board.left, due: board.total },
    habits,
    ...(archived ? { archived } : {}),
  };
}

export function getProgress(input: { from?: string; to?: string; habit?: string } = {}) {
  const today = todayKey();
  const to = checkDate(input.to);
  const from = input.from ? checkDate(input.from) : addDays(to, -6);
  const span = daysBetween(from, to);
  if (span < 0) throw new ToolError('"from" must not be after "to".');
  if (span > 365) throw new ToolError('Ask for at most 366 days at a time.');
  const data = getData();
  const habits = input.habit ? [findHabit(input.habit, { archived: true })] : boardHabits(data);
  const withDays = !!input.habit || span <= 31;
  let hit = 0;
  let due = 0;
  const out = habits.map((h) => {
    const s = statsOf(h, data.logs[h.id], from, to, today, data.settings.weekStart);
    hit += s.hit;
    due += s.due;
    const days: { date: string; status: string; amount?: string; note?: string }[] = [];
    if (withDays) {
      const first = firstDay(h, data.logs[h.id]);
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (d < first) continue;
        days.push({ date: d, ...dayOut(h, d, today) });
      }
    }
    return {
      id: h.id,
      name: h.name,
      repeat: repeatLabel(h.schedule),
      [isWeekly(h) ? 'weeks_met' : 'days_done']: `${s.hit} of ${s.due}`,
      hit_rate: s.rate === null ? null : `${s.rate}%`,
      ...(h.kind !== 'check' && !isWeekly(h) ? { average_per_day: amountLabel(h, Math.round(s.average * 10) / 10) } : {}),
      streak: streakOut(h, today),
      ...(withDays ? { days } : {}),
    };
  });
  return {
    from,
    to,
    today,
    overall_hit_rate: due ? `${Math.round((hit / due) * 100)}%` : null,
    note: 'Skipped days, days a habit is paused or not scheduled, and today until it is done do not count against the hit rate.',
    habits: out,
  };
}

// ── Checking in ───────────────────────────────────────────────────────────

function checkInResult(h: Habit, date: string) {
  const today = todayKey();
  const board = boardFor(getData(), date, today);
  return {
    habit: h.name,
    id: h.id,
    date,
    ...dayOut(h, date, today),
    streak: streakOut(h, today),
    day: { done: board.done, still_to_do: board.left, due: board.total },
  };
}

export function checkIn(input: { habit: string; date?: string; amount?: number; add?: boolean; note?: string }) {
  const h = findHabit(input.habit);
  const date = checkDate(input.date);
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0)) throw new ToolError('The amount must be 0 or more.');
  if (h.kind === 'check' && input.amount !== undefined && input.amount !== 1 && input.amount !== 0) {
    throw new ToolError(`"${h.name}" is a yes/no habit: leave the amount out to mark it done.`);
  }
  const prev = getLog(h.id, date);
  const before = prev && !prev.skipped ? prev.value : 0;
  let value = h.target;
  if (h.kind !== 'check' && input.amount !== undefined) value = input.add ? before + input.amount : input.amount;
  setLog(h.id, date, { value: Math.min(1_000_000, Math.round(value * 10) / 10), skipped: false, ...(input.note !== undefined ? { note: input.note.slice(0, MAX_NOTE) } : {}) });
  return { result: checkInResult(h, date), touched: monthParts(date) } satisfies WriteResult<unknown>;
}

export function undoCheckIn(input: { habit: string; date?: string }) {
  const h = findHabit(input.habit, { archived: true });
  const date = checkDate(input.date);
  setLog(h.id, date, { value: 0, skipped: false });
  return { result: checkInResult(h, date), touched: monthParts(date) } satisfies WriteResult<unknown>;
}

export function skipHabit(input: { habit: string; date?: string; note?: string }) {
  const h = findHabit(input.habit);
  const date = checkDate(input.date);
  setLog(h.id, date, { value: 0, skipped: true, ...(input.note !== undefined ? { note: input.note.slice(0, MAX_NOTE) } : {}) });
  return { result: checkInResult(h, date), touched: monthParts(date) } satisfies WriteResult<unknown>;
}

// ── Creating and changing habits ──────────────────────────────────────────

export interface HabitFields {
  name?: string;
  type?: string;
  goal?: number;
  unit?: string;
  repeat?: 'every_day' | 'weekdays' | 'weekends' | 'days' | 'times_per_week';
  days?: string[];
  times_per_week?: number;
  time_of_day?: string;
  color?: string;
  icon?: string;
}

function scheduleFrom(f: HabitFields, current: Schedule): Schedule {
  switch (f.repeat) {
    case undefined:
      if (f.days?.length) return scheduleFrom({ ...f, repeat: 'days' }, current);
      if (f.times_per_week) return scheduleFrom({ ...f, repeat: 'times_per_week' }, current);
      return current;
    case 'every_day':
      return { type: 'daily' };
    case 'weekdays':
      return { type: 'days', days: [0, 1, 2, 3, 4] };
    case 'weekends':
      return { type: 'days', days: [5, 6] };
    case 'times_per_week': {
      const n = f.times_per_week ?? (current.type === 'weekly' ? current.times : 3);
      if (!Number.isInteger(n) || n < 1 || n > 7) throw new ToolError('times_per_week must be a whole number from 1 to 7.');
      return n === 7 ? { type: 'daily' } : { type: 'weekly', times: n };
    }
    case 'days': {
      const days = [...new Set((f.days ?? []).map((d) => DAY_NAMES.indexOf(d.toLowerCase().slice(0, 3))))];
      if (days.length === 0 || days.includes(-1)) throw new ToolError('Give the days as e.g. ["mon", "wed", "fri"].');
      return days.length === 7 ? { type: 'daily' } : { type: 'days', days: days.sort() };
    }
  }
}

/** A habit's fields with the changes asked for, checked. */
function applyFields(base: HabitInput, f: HabitFields): HabitInput {
  const out: HabitInput = { ...base };
  if (f.name !== undefined) {
    const name = f.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!name) throw new ToolError('The name cannot be empty.');
    out.name = name;
  }
  if (f.type !== undefined) {
    const kind = KIND_IN[f.type.toLowerCase()];
    if (!kind) throw new ToolError('type must be "yes_no", "count" or "timer".');
    if (kind !== out.kind) {
      out.kind = kind;
      out.target = kind === 'check' ? 1 : kind === 'timer' ? 20 : 1;
      out.unit = kind === 'timer' ? 'min' : kind === 'count' ? 'times' : '';
    }
  }
  if (f.goal !== undefined) {
    if (out.kind === 'check') throw new ToolError('A yes/no habit has no goal amount. Set type to "count" or "timer" too.');
    if (!(f.goal > 0) || f.goal > (out.kind === 'timer' ? 24 * 60 : 1_000_000)) throw new ToolError('The goal must be more than 0 (for timers, at most 1440 minutes).');
    out.target = out.kind === 'timer' ? Math.round(f.goal) : Math.round(f.goal * 10) / 10;
  }
  if (f.unit !== undefined && out.kind === 'count') out.unit = f.unit.trim().slice(0, 20);
  out.schedule = scheduleFrom(f, out.schedule);
  if (f.time_of_day !== undefined) {
    const t = f.time_of_day.toLowerCase() as TimeOfDay;
    if (!TIMES_OF_DAY.includes(t)) throw new ToolError('time_of_day must be anytime, morning, afternoon or evening.');
    out.time = t;
  }
  if (f.color !== undefined) {
    if (!HABIT_COLORS.includes(f.color as HabitColor)) throw new ToolError(`color must be one of: ${HABIT_COLORS.join(', ')}.`);
    out.color = f.color as HabitColor;
  }
  if (f.icon !== undefined) {
    if (!isIconId(f.icon)) throw new ToolError(`icon must be one of: ${HABIT_ICONS.map((i) => i.id).join(', ')}.`);
    out.icon = f.icon;
  }
  return out;
}

export function createHabitTool(input: HabitFields & { description?: string }) {
  const text = (input.description ?? '').trim();
  if (!text && !input.name?.trim()) throw new ToolError('Give a name, or a description like "Read 20 min every evening".');
  const parsed = parseHabit(text || input.name!);
  const base: HabitInput = {
    name: parsed.name,
    kind: parsed.kind,
    target: parsed.target,
    unit: parsed.unit,
    schedule: parsed.schedule,
    time: parsed.time,
    color: autoColor(parsed.name),
    icon: parsed.icon,
  };
  const fields = applyFields(base, input);
  // Unless given: the color the app would pick for the name, and an icon for the name (or, failing that, for how it's tracked).
  if (input.color === undefined) fields.color = autoColor(fields.name);
  if (input.icon === undefined && ['check', 'timer', 'plus'].includes(fields.icon)) fields.icon = guessIcon(fields.name, fields.kind, fields.unit);
  const same = boardHabits(getData()).find((h) => h.name.toLowerCase() === fields.name.toLowerCase());
  if (same) throw new ToolError(`There is already a habit called "${same.name}" (${same.id}). Use edit_habit to change it.`);
  const h = createHabit(fields, todayKey());
  return { result: { created: habitOut(h), due_today: isDueOn(h, todayKey(), h.start) }, touched: ['habits'] } satisfies WriteResult<unknown>;
}

export function editHabit(input: HabitFields & { habit: string; paused?: boolean }) {
  const h = findHabit(input.habit, { archived: true });
  const { habit: _ref, paused, ...fields } = input;
  const changes = Object.values(fields).some((v) => v !== undefined);
  if (!changes && paused === undefined) throw new ToolError('Nothing to change: give the fields to change, or paused.');
  if (changes) {
    const next = applyFields({ ...h }, fields);
    const other = boardHabits(getData()).find((x) => x.id !== h.id && x.name.toLowerCase() === next.name.toLowerCase());
    if (other) throw new ToolError(`There is already a habit called "${other.name}".`);
    updateHabit(h.id, { ...next, ...(next.kind === h.kind && next.target === h.target ? { step: h.step } : {}) });
  }
  if (paused === true && !currentPause(h)) pauseHabit(h.id, todayKey());
  if (paused === false && currentPause(h)) resumeHabit(h.id, todayKey());
  const updated = getData().habits.find((x) => x.id === h.id)!;
  return { result: { updated: habitOut(updated) }, touched: ['habits'] } satisfies WriteResult<unknown>;
}

export function archiveHabitTool(input: { habit: string; restore?: boolean }) {
  const h = findHabit(input.habit, { archived: true });
  if (input.restore) {
    if (!h.archivedAt) throw new ToolError(`"${h.name}" is not archived.`);
    restoreHabit(h.id);
  } else {
    if (h.archivedAt) throw new ToolError(`"${h.name}" is already archived.`);
    archiveHabit(h.id);
  }
  const updated = getData().habits.find((x) => x.id === h.id)!;
  return {
    result: { [input.restore ? 'restored' : 'archived']: habitOut(updated), note: input.restore ? 'It is back on the board.' : 'It is off the board; its history is kept.' },
    touched: ['habits'],
  } satisfies WriteResult<unknown>;
}
