import type { Habit, TimeOfDay } from './types';
import { TIMES_OF_DAY } from './types';
import { TIME_LABEL } from './habits';

/**
 * Groups and views. A habit can be in one group (Self-care, Education…),
 * stored as the group's name. Today and Week can show everything (the main
 * view) or only one time of day or one group, picked with a row of chips.
 */

export const MAX_GROUP = 30;

/** A group name as stored: single spaces, no control characters, at most 30 characters ("" for none). */
export function cleanGroup(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_GROUP)
    .trim();
}

export const sameGroup = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** The groups these habits are in, A to Z. */
export function groupsOf(habits: Habit[]): string[] {
  const out: string[] = [];
  for (const h of habits) if (h.group && !out.some((g) => sameGroup(g, h.group))) out.push(h.group);
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** An existing group's spelling for a typed name ("self care" → "Self care"), or the name as typed. */
export function matchGroup(name: string, groups: string[]): string {
  const clean = cleanGroup(name);
  return groups.find((g) => sameGroup(g, clean)) ?? clean;
}

export type View = { kind: 'all' } | { kind: 'time'; time: TimeOfDay } | { kind: 'group'; group: string };

export const ALL: View = { kind: 'all' };

/** The view in a link ("evening", "g:Self-care"); anything unknown is the main view. */
export function parseView(raw: string | null | undefined, habits: Habit[]): View {
  if (!raw) return ALL;
  if ((TIMES_OF_DAY as string[]).includes(raw)) return { kind: 'time', time: raw as TimeOfDay };
  if (raw.startsWith('g:')) {
    const group = groupsOf(habits).find((g) => sameGroup(g, raw.slice(2)));
    if (group) return { kind: 'group', group };
  }
  return ALL;
}

export function viewParam(v: View): string | undefined {
  return v.kind === 'time' ? v.time : v.kind === 'group' ? `g:${v.group}` : undefined;
}

export function viewLabel(v: View): string {
  return v.kind === 'time' ? TIME_LABEL[v.time] : v.kind === 'group' ? v.group : 'All';
}

export function sameView(a: View, b: View): boolean {
  return viewParam(a) === viewParam(b);
}

export function inView(h: Habit, v: View): boolean {
  if (v.kind === 'time') return h.time === v.time;
  if (v.kind === 'group') return sameGroup(h.group, v.group);
  return true;
}

/** More habits than this, and the times of day become views too. */
export const MANY = 8;

/** Times of day as the day goes, "anytime" last. */
const DAY_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

/**
 * The views worth offering for these habits: all of them, then each time of
 * day in use (once there are more than MANY habits at different times), then
 * each group. Just the main view means there's nothing to pick.
 */
export function viewsFor(habits: Habit[]): View[] {
  const times = DAY_ORDER.filter((t) => habits.some((h) => h.time === t));
  const byTime: View[] = habits.length > MANY && times.length > 1 ? times.map((time) => ({ kind: 'time', time })) : [];
  return [ALL, ...byTime, ...groupsOf(habits).map((group): View => ({ kind: 'group', group }))];
}
