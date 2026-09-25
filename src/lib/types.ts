/** How a habit is tracked: done or not, a number of things, or minutes. */
export type HabitKind = 'check' | 'count' | 'timer';

export const HABIT_KINDS: HabitKind[] = ['check', 'count', 'timer'];

export type TimeOfDay = 'anytime' | 'morning' | 'afternoon' | 'evening';

export const TIMES_OF_DAY: TimeOfDay[] = ['anytime', 'morning', 'afternoon', 'evening'];

/** The habit colors from the design; each palette derives its own shades of them. */
export type HabitColor = 'teal' | 'violet' | 'crimson' | 'orange' | 'ember';

export const HABIT_COLORS: HabitColor[] = ['teal', 'violet', 'crimson', 'orange', 'ember'];

/**
 * When a habit is due. Weekdays are numbered from Monday = 0 to Sunday = 6,
 * whatever day the week starts on in Settings.
 */
export type Schedule =
  | { type: 'daily' }
  | { type: 'days'; days: number[] }
  | { type: 'weekly'; times: number };

/** A stretch of days, both ends included, when a habit was paused. No end: still paused. */
export interface Pause {
  from: string;
  to?: string;
}

export interface Habit {
  id: string;
  name: string;
  kind: HabitKind;
  /** The goal for a day: 1 for yes/no habits, e.g. 8 (glasses) or 20 (minutes). */
  target: number;
  /** "glasses", "pages"; "min" for timers; "" for yes/no habits. */
  unit: string;
  /** Added with each tap on the board. */
  step: number;
  schedule: Schedule;
  time: TimeOfDay;
  color: HabitColor;
  icon: string;
  /** Position on the board, smallest first. */
  order: number;
  /** First day the habit counts (YYYY-MM-DD). */
  start: string;
  pauses: Pause[];
  /** When it was archived: off the board, history kept. */
  archivedAt?: number;
  createdAt: number;
  /** Last change, for merging between devices. */
  updatedAt: number;
}

/** What happened with a habit on one day. */
export interface Log {
  /** Yes/no: 1 when done. Count and timer: how many, or how many minutes. */
  value: number;
  skipped?: boolean;
  note?: string;
  /** Last change, for merging between devices. A log with nothing in it records an undo. */
  at: number;
}

export type WeekStart = 'mon' | 'sun';

export interface Settings {
  /** Synced between devices. */
  weekStart: WeekStart;
  /** Palette id (this device only). */
  theme: string;
  /** Gentle motion (this device only; also off when the system asks for reduced motion). */
  animations: boolean;
}

/** Bookkeeping that lets two devices merge their changes. */
export interface SyncMeta {
  /** Deleted habits: id → when. The deletion wins over edits made before it. */
  deletedHabits: Record<string, number>;
  /** When the synced settings last changed (0 = never). */
  settingsAt: number;
}

export interface AppData {
  version: 1;
  habits: Habit[];
  /** Habit id → day (YYYY-MM-DD) → what happened. */
  logs: Record<string, Record<string, Log>>;
  settings: Settings;
  meta: SyncMeta;
}
