import type { HabitColor, HabitKind, Schedule, TimeOfDay } from './types';
import { guessIcon } from './icons';

/**
 * "Read 20 min every evening" → a habit. Built on the design's own parser:
 * pull out the times, amounts and repeats it recognises, and what's left is
 * the name. Anything it gets wrong can be changed with one tap.
 */

export interface Draft {
  name: string;
  kind: HabitKind;
  target: number;
  unit: string;
  schedule: Schedule;
  time: TimeOfDay;
  icon: string;
}

const DAY_WORDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY = '(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?';
const NUMBER_WORDS: Record<string, number> = { once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** "10,000" and "10k" → 10000; "1.5" stays. */
function number(text: string): number {
  const t = text.toLowerCase().replace(/,(?=\d{3}\b)/g, '');
  const k = t.endsWith('k');
  const n = parseFloat(k ? t.slice(0, -1) : t);
  return k ? n * 1000 : n;
}

export function parseHabit(input: string): Draft {
  let s = ` ${(input || '').replace(/\s+/g, ' ')} `;
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (m) s = s.replace(m[0], ' ');
    return m;
  };

  let kind: HabitKind = 'check';
  let target = 1;
  let unit = '';
  let schedule: Schedule = { type: 'daily' };
  let time: TimeOfDay = 'anytime';

  // How often.
  let m = take(/\b(\d+|once|twice|one|two|three|four|five|six|seven)\s*(?:x|×|times)?\s*(?:a|per|each|every)\s*week\b/i);
  if (m) {
    const times = NUMBER_WORDS[m[1].toLowerCase()] ?? parseInt(m[1], 10);
    schedule = times >= 7 ? { type: 'daily' } : { type: 'weekly', times: Math.max(1, times) };
  } else if (take(/\b(?:on\s+|every\s+)?weekdays\b/i)) schedule = { type: 'days', days: [0, 1, 2, 3, 4] };
  else if (take(/\b(?:on\s+|every\s+)?weekends?\b/i)) schedule = { type: 'days', days: [5, 6] };
  else if ((m = take(new RegExp(`\\b(?:on\\s+|every\\s+)?(${DAY}(?:\\s*(?:,|and|&|\\+)\\s*${DAY})*)\\b`, 'i')))) {
    const days = [...new Set(m[1].toLowerCase().match(/[a-z]+/g)!.map((w) => DAY_WORDS.indexOf(w.slice(0, 3))).filter((d) => d >= 0))];
    schedule = days.length === 7 ? { type: 'daily' } : { type: 'days', days: days.sort() };
  }

  // When.
  m = take(/\b(?:every|each|in the|at)\s+(morning|evening|night|afternoon)\b/i) ?? take(/\b(morning|evening|tonight|night|afternoon)\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    time = w === 'morning' ? 'morning' : w === 'afternoon' ? 'afternoon' : 'evening';
  }
  take(/\b(?:every\s*day|daily|each day|a day|per day|every)\b/i);

  // How much.
  m = take(
    /\b(\d[\d,.]*k?)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b|glass(?:es)?|cups?|pages?|chapters?|km|kilometers?|miles?|steps|reps|push-?ups|pull-?ups|squats|litres?|liters?|l\b|times)/i,
  );
  if (m) {
    const n = number(m[1]);
    const u = m[2].toLowerCase();
    if (/^m(in|$)/.test(u)) [kind, target, unit] = ['timer', n, 'min'];
    else if (/^h/.test(u)) [kind, target, unit] = ['timer', n * 60, 'min'];
    else {
      kind = 'count';
      target = n;
      unit = u === 'times' ? 'times' : u.replace(/^l$/, 'litres').replace(/^liters?$/, 'litres').replace(/^litre$/, 'litres');
      if (/^glass$|^cup$|^page$|^chapter$|^mile$|^kilometer$/.test(unit) && n !== 1) unit += unit.endsWith('s') ? '' : unit === 'glass' ? 'es' : 's';
      if (/push/.test(unit)) unit = 'push-ups';
      if (/pull/.test(unit)) unit = 'pull-ups';
    }
  }
  if (!Number.isFinite(target) || target <= 0) [kind, target, unit] = ['check', 1, ''];
  target = Math.min(kind === 'timer' ? 24 * 60 : 1_000_000, Math.round(target * 10) / 10);
  if (kind === 'timer') target = Math.max(1, Math.round(target));

  s = s.replace(/\bof\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!s && kind === 'count' && unit !== 'times') s = unit;
  const name = s ? (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 60) : 'New habit';
  return { name, kind, target, unit, schedule, time, icon: guessIcon(name, kind, unit) };
}

/** Taps per goal: 5 minutes of 20, 1 glass of 8, 2,500 of 10,000 steps. */
export function defaultStep(kind: HabitKind, target: number): number {
  if (kind === 'check') return 1;
  if (kind === 'timer') return target <= 5 ? 1 : Math.max(5, Math.round(target / 4 / 5) * 5);
  if (target <= 12) return 1;
  const rough = target / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const nice = [1, 2, 2.5, 5, 10].map((f) => f * pow).reduce((best, v) => (Math.abs(v - rough) < Math.abs(best - rough) ? v : best));
  return nice;
}

/** The design's color pick for a new habit: stable for a name, one of the first four colors. */
export function autoColor(name: string): HabitColor {
  const colors: HabitColor[] = ['teal', 'violet', 'crimson', 'orange'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}
