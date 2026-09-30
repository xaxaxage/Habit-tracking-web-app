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
  fmt,
  goalLabel,
  isDueOn,
  isWeekly,
  repeatLabel,
  statsOf,
  streakOf,
  tileFor,
  TIME_LABEL,
  type DayState,
  type Tile,
} from '../src/lib/habits';
import { addDays, daysBetween, isDateKey, monthKey, todayKey } from '../src/lib/dates';
import { autoColor, parseHabit } from '../src/lib/parse';
import { guessIcon, HABIT_ICONS, isIconId } from '../src/lib/icons';
import { buildParts } from '../src/lib/sync/parts';
import { boardOrder } from '../src/lib/order';
import { cleanGroup, groupsOf, matchGroup, sameGroup } from '../src/lib/views';

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
    ...(h.group ? { group: h.group } : {}),
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

/** The group asked for, spelled as in the app, or an error listing the groups there are. */
function checkGroup(name: string): string {
  const groups = groupsOf(getData().habits);
  const found = groups.find((g) => sameGroup(g, cleanGroup(name)));
  if (found) return found;
  throw new ToolError(`There is no group "${name}".${groups.length ? ` The groups are: ${groups.join(', ')}.` : ' No habit is in a group yet.'}`);
}

// ── Reading ───────────────────────────────────────────────────────────────

/** "5 of 8 glasses", "10 min of 20 min". */
function progressLabel(h: Habit, value: number): string {
  return h.kind === 'timer' ? `${amountLabel(h, value)} of ${amountLabel(h, h.target)}` : `${fmt(value)} of ${amountLabel(h, h.target)}`;
}

/** How a habit stands on a day, for get_today: done, skipped or pending, and how far along. */
function todayOut(t: Tile, date: string, today: string) {
  const h = t.habit;
  const log = t.log;
  const logs = getData().logs[h.id];
  const value = log && !log.skipped ? log.value : 0;
  const w = t.week;
  return {
    id: h.id,
    name: h.name,
    status: t.status === 'done' ? 'done' : t.status === 'skipped' ? 'skipped' : 'pending',
    ...(h.kind !== 'check' ? { amount: value, goal: h.target, unit: h.unit, progress: progressLabel(h, value) } : {}),
    ...(w && isWeekly(h) ? { this_week: `${w.done} of ${h.schedule.times}`, ...(t.status === 'met' ? { week_goal_met: true } : {}) } : {}),
    streak: streakOut(h, today),
    time_of_day: TIME_LABEL[h.time],
    ...(h.group ? { group: h.group } : {}),
    ...(log?.note ? { note: log.note } : {}),
    ...(date !== today && dayState(h, logs, date, today) === 'future' ? { upcoming: true } : {}),
  };
}

/** Why a habit isn't due on a day. */
function notDueReason(h: Habit, date: string): string {
  const first = firstDay(h, getData().logs[h.id]);
  if (currentPause(h) || h.pauses.some((p) => date >= p.from && (!p.to || date <= p.to))) return 'paused';
  if (date < first) return 'not started yet';
  return `not scheduled (${repeatLabel(h.schedule).toLowerCase()})`;
}

export function getToday(input: { date?: string; group?: string } = {}) {
  const today = todayKey();
  const date = checkDate(input.date);
  const data = getData();
  const group = input.group ? checkGroup(input.group) : undefined;
  const board = boardFor(data, date, today, boardOrder(data, today).filter((h) => !group || sameGroup(h.group, group)));
  const skipped = board.due.filter((t) => t.status === 'skipped').length;
  const groups = groupsOf(boardHabits(data));
  return {
    date,
    today,
    ...(group ? { group } : {}),
    summary: { done: board.done, pending: board.left, skipped, due: board.total },
    order: 'In the order the user usually gets them done (as on the board in the app).',
    habits: board.due.map((t) => todayOut(t, date, today)),
    ...(board.other.length ? { not_due: board.other.map((t) => ({ id: t.habit.id, name: t.habit.name, why: notDueReason(t.habit, date) })) } : {}),
    ...(groups.length && !group ? { groups } : {}),
  };
}

export function listHabits(input: { include_archived?: boolean; group?: string } = {}) {
  const today = todayKey();
  const data = getData();
  const group = input.group ? checkGroup(input.group) : undefined;
  const inGroup = (h: Habit) => !group || sameGroup(h.group, group);
  const groups = groupsOf(boardHabits(data));
  return {
    today,
    ...(group ? { group } : {}),
    habits: boardOrder(data, today)
      .filter(inGroup)
      .map((h) => ({ ...habitOut(h), streak: streakOut(h, today) })),
    ...(groups.length && !group ? { groups } : {}),
    ...(input.include_archived ? { archived: data.habits.filter((h) => h.archivedAt && inGroup(h)).map(habitOut) } : {}),
  };
}

export function getSummary(input: { from?: string; to?: string; habit?: string; group?: string } = {}) {
  const today = todayKey();
  const to = checkDate(input.to);
  const from = input.from ? checkDate(input.from) : addDays(to, -6);
  const span = daysBetween(from, to);
  if (span < 0) throw new ToolError('"from" must not be after "to".');
  if (span > 365) throw new ToolError('Ask for at most 366 days at a time.');
  const data = getData();
  const group = input.group ? checkGroup(input.group) : undefined;
  const habits = input.habit
    ? [findHabit(input.habit, { archived: true })]
    : boardOrder(data, today).filter((h) => !group || sameGroup(h.group, group));
  const withDays = !!input.habit || span <= 31;
  let hit = 0;
  let due = 0;
  const byGroup = new Map<string, { hit: number; due: number }>();
  // Per day: habits done out of those that counted (weekly ones on the days they were done; today only what's done so far).
  const perDay = new Map<string, { done: number; due: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) perDay.set(d, { done: 0, due: 0 });
  const out = habits.map((h) => {
    const logs = data.logs[h.id];
    const s = statsOf(h, logs, from, to, today, data.settings.weekStart);
    hit += s.hit;
    due += s.due;
    if (h.group) {
      const g = byGroup.get(h.group) ?? { hit: 0, due: 0 };
      byGroup.set(h.group, { hit: g.hit + s.hit, due: g.due + s.due });
    }
    const first = firstDay(h, logs);
    const days: { date: string; status: string; amount?: string; note?: string }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d < first) continue;
      const state = dayState(h, logs, d, today, first);
      const tally = perDay.get(d)!;
      if (state === 'done') {
        tally.done++;
        tally.due++;
      } else if ((state === 'partial' || state === 'open') && d < today && !isWeekly(h)) tally.due++;
      if (withDays) days.push({ date: d, ...dayOut(h, d, today) });
    }
    return {
      id: h.id,
      name: h.name,
      ...(h.group ? { group: h.group } : {}),
      repeat: repeatLabel(h.schedule),
      [isWeekly(h) ? 'weeks_met' : 'days_done']: `${s.hit} of ${s.due}`,
      completion: s.rate === null ? null : `${s.rate}%`,
      ...(h.kind !== 'check' && !isWeekly(h) ? { average_per_day: amountLabel(h, Math.round(s.average * 10) / 10) } : {}),
      streak: streakOut(h, today),
      ...(withDays ? { days } : {}),
    };
  });
  const rate = (x: { hit: number; due: number }) => (x.due ? `${Math.round((x.hit / x.due) * 100)}%` : null);
  return {
    from,
    to,
    today,
    ...(group ? { group } : {}),
    completion: rate({ hit, due }),
    ...(byGroup.size > 1 && !group && !input.habit
      ? { by_group: groupsOf(habits).map((g) => ({ group: g, completion: rate(byGroup.get(g) ?? { hit: 0, due: 0 }) })) }
      : {}),
    ...(withDays && !input.habit ? { per_day: [...perDay].map(([date, t]) => ({ date, done: t.done, of: t.due })) } : {}),
    note: 'Skipped days, days a habit is paused or not scheduled, and today until it is done do not count against completion. "Times a week" habits count per week.',
    habits: out,
  };
}

// ── Checking off ──────────────────────────────────────────────────────────

/** The habit as it is now, after a change. */
const getHabitNow = (h: Habit) => getData().habits.find((x) => x.id === h.id) ?? h;

function checkResult(h: Habit, date: string) {
  const today = todayKey();
  const data = getData();
  const board = boardFor(data, date, today);
  return {
    ...todayOut(tileFor(data, getHabitNow(h), date, today), date, today),
    date,
    day: { done: board.done, pending: board.left, due: board.total },
  };
}

/** Mark a habit done (a count or timer: an amount of it), skipped or not done on a day. */
export function checkHabit(input: { habit: string; date?: string; status?: 'done' | 'skipped' | 'not_done'; amount?: number; add?: boolean; note?: string }) {
  const h = findHabit(input.habit);
  const date = checkDate(input.date);
  const status = input.status ?? 'done';
  const note = input.note !== undefined ? { note: input.note.slice(0, MAX_NOTE) } : {};
  if (input.amount !== undefined) {
    if (status !== 'done') throw new ToolError('Give an amount only with status "done".');
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new ToolError('The amount must be 0 or more.');
    if (h.kind === 'check' && input.amount !== 1 && input.amount !== 0) {
      throw new ToolError(`"${h.name}" is a yes/no habit: leave the amount out to mark it done.`);
    }
  }
  if (status === 'skipped') setLog(h.id, date, { value: 0, skipped: true, ...note });
  else if (status === 'not_done') setLog(h.id, date, { value: 0, skipped: false, ...note });
  else {
    const prev = getLog(h.id, date);
    const before = prev && !prev.skipped ? prev.value : 0;
    let value = h.target;
    if (h.kind !== 'check' && input.amount !== undefined) value = input.add ? before + input.amount : input.amount;
    if (h.kind === 'check' && input.amount === 0) value = 0;
    setLog(h.id, date, { value: Math.min(1_000_000, Math.round(value * 10) / 10), skipped: false, ...note });
  }
  return { result: checkResult(h, date), touched: monthParts(date) } satisfies WriteResult<unknown>;
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
  /** A group name; "" takes it out of its group. */
  group?: string;
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
  // An existing group keeps its spelling ("self care" → "Self care"); a new name starts a group.
  if (f.group !== undefined) out.group = matchGroup(f.group, groupsOf(getData().habits));
  return out;
}

export function addHabit(input: HabitFields & { description?: string }) {
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

export function updateHabitTool(input: HabitFields & { habit: string; paused?: boolean }) {
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
