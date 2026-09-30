import type { AppData, Habit, Log, TimeOfDay } from './types';
import { addDays, dayOf, daysBetween } from './dates';
import { boardHabits, isDone } from './habits';

/**
 * The order of the board: the order you usually get your habits done in,
 * learned from when you finished each one, plus the places you moved habits to.
 *
 * - A habit's usual time is the weighted median of the times you finished it
 *   over the last eight weeks, recent weeks counting more. Days you filled in
 *   afterwards (from the week or the history) don't count, and neither does
 *   today, so tiles never jump around while you tap them.
 * - A habit with no such history yet goes by its time of day (morning 9:00,
 *   afternoon 14:00, evening 20:00); an "anytime" one goes last.
 * - A habit you moved sits right after the habit it was dropped behind (or
 *   right before the one it was dropped in front of, at the top), until you've
 *   done the two in the other order on PLACEMENT_DAYS days.
 */

const WINDOW_DAYS = 56;
const HALF_LIFE_DAYS = 21;
/** A moved habit keeps its place until you've done it in a different order on this many days. */
export const PLACEMENT_DAYS = 7;
/** Finishing something shortly after midnight still belongs to the day before (a late "Screens off"). */
const SMALL_HOURS = 4 * 60;

const TIME_HINT: Record<TimeOfDay, number> = { morning: 9 * 60, afternoon: 14 * 60, evening: 20 * 60, anytime: Infinity };

type Logs = Record<string, Log> | undefined;

/** Minutes after midnight on `date` when `at` happened, if it was on that day (or in the small hours after). */
function minuteOn(date: string, at: number): number | undefined {
  const d = new Date(at);
  const minute = d.getHours() * 60 + d.getMinutes();
  const day = dayOf(at);
  if (day === date) return minute;
  if (day === addDays(date, 1) && minute < SMALL_HOURS) return minute + 24 * 60;
  return undefined;
}

/** When the habit was finished on each day it was finished on that same day, before today. */
function finishes(h: Habit, logs: Logs, from: string, today: string): { date: string; at: number; minute: number }[] {
  const out: { date: string; at: number; minute: number }[] = [];
  if (!logs) return out;
  for (const [date, log] of Object.entries(logs)) {
    if (date < from || date >= today || !isDone(h, log)) continue;
    const minute = minuteOn(date, log.at);
    if (minute !== undefined) out.push({ date, at: log.at, minute });
  }
  return out;
}

/** When a habit usually gets done, in minutes after midnight (undefined without any history). */
export function usualMinute(h: Habit, logs: Logs, today: string): number | undefined {
  const samples = finishes(h, logs, addDays(today, -WINDOW_DAYS), today)
    .map((f) => ({ minute: f.minute, weight: 0.5 ** (daysBetween(f.date, today) / HALF_LIFE_DAYS) }))
    .sort((a, b) => a.minute - b.minute);
  if (samples.length === 0) return undefined;
  let left = samples.reduce((sum, s) => sum + s.weight, 0) / 2;
  for (const s of samples) {
    left -= s.weight;
    if (left <= 1e-9) return s.minute;
  }
  return samples[samples.length - 1].minute;
}

/** Days since a habit was moved on which it was done in a different order than where it was put. */
export function daysAgainst(h: Habit, data: AppData, today: string): number {
  const placed = h.placed;
  if (!placed) return 0;
  const from = dayOf(placed.at);
  const mine = new Map(finishes(h, data.logs[h.id], from, today).filter((f) => f.at > placed.at).map((f) => [f.date, f.at]));
  const against = new Set<string>();
  const compare = (otherId: string | undefined, wrong: (mineAt: number, otherAt: number) => boolean) => {
    const other = otherId && data.habits.find((x) => x.id === otherId);
    if (!other) return;
    for (const f of finishes(other, data.logs[other.id], from, today)) {
      const at = mine.get(f.date);
      if (at !== undefined && f.at > placed.at && wrong(at, f.at)) against.add(f.date);
    }
  };
  compare(placed.after, (mineAt, otherAt) => mineAt < otherAt);
  compare(placed.before, (mineAt, otherAt) => mineAt > otherAt);
  return against.size;
}

const cache = new WeakMap<AppData, { today: string; habits: Habit[] }>();

/** The habits on the board (not archived), in board order. */
export function boardOrder(data: AppData, today: string): Habit[] {
  const hit = cache.get(data);
  if (hit && hit.today === today) return hit.habits;

  const habits = boardHabits(data);
  const rank = new Map(habits.map((h, i) => [h.id, i]));
  const when = new Map(habits.map((h) => [h.id, usualMinute(h, data.logs[h.id], today) ?? TIME_HINT[h.time]]));
  const key = (h: Habit) => when.get(h.id)!;
  let order = [...habits].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    if (x !== y) return x < y ? -1 : 1;
    return rank.get(a.id)! - rank.get(b.id)!;
  });

  // Then the habits you moved, in the order you moved them.
  const moved = habits.filter((h) => h.placed && daysAgainst(h, data, today) < PLACEMENT_DAYS).sort((a, b) => a.placed!.at - b.placed!.at);
  for (const h of moved) {
    const rest = order.filter((x) => x.id !== h.id);
    const after = rest.findIndex((x) => x.id === h.placed!.after);
    const before = rest.findIndex((x) => x.id === h.placed!.before);
    const at = after >= 0 ? after + 1 : before;
    if (at >= 0) order = [...rest.slice(0, at), h, ...rest.slice(at)];
  }

  cache.set(data, { today, habits: order });
  return order;
}

/**
 * Where a habit goes when moved to `index` in a list shown on screen (maybe
 * only part of the board): right after the one before it there, or right
 * before the first one. Undefined when that's where it already is.
 */
export function neighboursAt(list: string[], id: string, index: number): { after?: string; before?: string } | undefined {
  const rest = list.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  if (list.indexOf(id) === at) return undefined;
  return at > 0 ? { after: rest[at - 1] } : { before: rest[0] };
}
