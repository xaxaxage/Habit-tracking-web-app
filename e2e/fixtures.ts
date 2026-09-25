import type { AppData, Habit, Log } from '../src/lib/types';

/**
 * The design's sample data: six habits on Friday 25 September 2026, with
 * histories that give the streaks the design shows (Water 12, Stretch 7,
 * Workout 3 weeks, Read 21, Journal 3, Screens off 1). Read's last 18 weeks
 * use the design's own random numbers, so its heatmap matches the mockup.
 */

export const TODAY = '2026-09-25';
/** Noon on the design's day, in the test browser's time zone. */
export const NOW = '2026-09-25T12:00:00';
export const TIME_ZONE = 'Europe/Berlin';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 4, 1);

function key(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(k: string, n: number): string {
  return key(new Date(Date.parse(`${k}T00:00:00Z`) + n * DAY));
}
function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function habit(id: string, fields: Partial<Habit> & Pick<Habit, 'name' | 'kind' | 'color' | 'icon' | 'order'>): Habit {
  return {
    id,
    target: 1,
    unit: '',
    step: 1,
    schedule: { type: 'daily' },
    time: 'anytime',
    start: '2026-05-01',
    pauses: [],
    createdAt: T0,
    updatedAt: T0,
    ...fields,
  };
}

const at = (date: string) => Date.parse(`${date}T20:00:00Z`);
const done = (date: string, value = 1, extra: Partial<Log> = {}): [string, Log] => [date, { value, at: at(date), ...extra }];

export function sampleData(): AppData {
  const water = habit('water000001', { name: 'Water', kind: 'count', target: 8, unit: 'glasses', color: 'teal', icon: 'drop', order: 1 });
  const stretch = habit('stretch00001', { name: 'Stretch', kind: 'check', color: 'violet', icon: 'stretch', order: 2 });
  const workout = habit('workout00001', {
    name: 'Workout',
    kind: 'check',
    schedule: { type: 'weekly', times: 4 },
    color: 'crimson',
    icon: 'dumbbell',
    order: 3,
  });
  const read = habit('read00000001', { name: 'Read', kind: 'timer', target: 20, unit: 'min', step: 5, time: 'evening', color: 'orange', icon: 'book', order: 4 });
  const journal = habit('journal00001', { name: 'Journal', kind: 'check', time: 'evening', color: 'ember', icon: 'pencil', order: 5 });
  const screens = habit('screens00001', { name: 'Screens off 23:00', kind: 'check', time: 'evening', color: 'violet', icon: 'moon', order: 6 });

  // Water: 12 days in a row up to yesterday, 5 of 8 glasses today.
  const waterLogs = Object.fromEntries([...range('2026-09-13', '2026-09-24').map((d) => done(d, 8)), done(TODAY, 5)]);
  // Stretch: 7 days in a row, today included.
  const stretchLogs = Object.fromEntries(range('2026-09-19', TODAY).map((d) => done(d)));
  // Workout, 4 times a week: three full weeks before this one, 3 of 4 this week (Mon, Wed, Fri).
  const workoutDays = ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09', '2026-09-10', '2026-09-12'];
  workoutDays.push('2026-09-14', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-21', '2026-09-23', TODAY);
  const workoutLogs = Object.fromEntries(workoutDays.map((d) => done(d)));

  // Read: the design's heatmap, 18 weeks from Monday 25 May; 20+ minutes for 21 days, 10 today.
  const readLogs: Record<string, Log> = {};
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let w = 0; w < 18; w++) {
    for (let d = 0; d < 7; d++) {
      const last = w === 17;
      if (last && d > 4) continue;
      let m: number;
      if (last && d === 4) m = 10;
      else if (w * 7 + d >= 102) m = 20 + Math.round(rnd() * 15);
      else if (w * 7 + d === 101) m = 0;
      else m = rnd() < 0.18 ? 0 : 12 + Math.round(rnd() * 28);
      const date = addDays('2026-05-25', w * 7 + d);
      if (m > 0) readLogs[date] = { value: m, at: at(date) };
    }
  }
  readLogs['2026-09-21'] = { value: 20, note: 'Started a new book.', at: at('2026-09-21') };
  readLogs['2026-09-24'] = { value: 30, note: 'Finished part two.', at: at('2026-09-24') };

  // Journal: Mon, Tue, (Wed skipped), Thu; missed last Sunday.
  const journalLogs = Object.fromEntries([
    ...range('2026-09-01', '2026-09-19').map((d) => done(d)),
    done('2026-09-21'),
    done('2026-09-22'),
    done('2026-09-23', 0, { skipped: true }),
    done('2026-09-24'),
  ]);
  // Screens off: Mon, Tue, Thu.
  const screensLogs = Object.fromEntries([done('2026-09-21'), done('2026-09-22'), done('2026-09-24')]);

  return {
    version: 1,
    habits: [water, stretch, workout, read, journal, screens],
    logs: {
      [water.id]: waterLogs,
      [stretch.id]: stretchLogs,
      [workout.id]: workoutLogs,
      [read.id]: readLogs,
      [journal.id]: journalLogs,
      [screens.id]: screensLogs,
    },
    settings: { weekStart: 'mon', theme: 'night', animations: false, layout: 'tiles' },
    meta: { deletedHabits: {}, settingsAt: 0 },
  };
}

export const STORAGE_KEY = 'habit-tracker:v1';

/** 34 habits, some with very long names, for crowded-board tests. */
export function manyHabits(): AppData {
  const data = sampleData();
  const long = [
    'Practice the piano for at least half an hour after dinner',
    'Call mum',
    'Floss',
    'No sugar in coffee, tea or anything else I drink today',
    'Walk 10,000 steps',
  ];
  const colors = ['teal', 'violet', 'crimson', 'orange', 'ember'] as const;
  for (let i = 0; i < 28; i++) {
    const id = `extra${String(i).padStart(7, '0')}`;
    data.habits.push({
      ...data.habits[i % 6],
      id,
      name: `${long[i % long.length]}${i >= long.length ? ` ${i}` : ''}`.slice(0, 60),
      color: colors[i % 5],
      order: 10 + i,
      schedule: i % 7 === 3 ? { type: 'days', days: [5, 6] } : data.habits[i % 6].schedule,
    });
    data.logs[id] = { [TODAY]: { value: i % 3 === 0 ? data.habits[i % 6].target : 0, at: Date.parse(`${TODAY}T08:00:00Z`) } };
  }
  return data;
}
