import type { HabitKind } from './types';

/**
 * Habit icons: 24×24 line drawings (2px round strokes, like the design's).
 * The first ones are the design's own; the rest follow the same style.
 */

export interface HabitIcon {
  id: string;
  label: string;
  path: string;
  /** Words in a habit's name that suggest this icon. */
  words: RegExp;
}

export const HABIT_ICONS: HabitIcon[] = [
  { id: 'drop', label: 'Water', path: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', words: /water|drink|hydrat|glass/ },
  { id: 'stretch', label: 'Stretch', path: 'M12 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM4 9l8 2 8-2M12 11v4l-3 6M12 15l3 6', words: /stretch|yoga|mobility|posture/ },
  { id: 'dumbbell', label: 'Workout', path: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12', words: /work ?out|gym|lift|weights|strength|push.?ups?|pull.?ups?|squats?|plank|exercise|train/ },
  { id: 'book', label: 'Read', path: 'M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2a2 2 0 0 0 2 2h14', words: /read|book|pages?|study|learn/ },
  { id: 'pencil', label: 'Write', path: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', words: /journal|write|diary|writing|notes?|draw/ },
  { id: 'moon', label: 'Night', path: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', words: /screens?|night|evening|phone|lights? out/ },
  { id: 'bed', label: 'Sleep', path: 'M3 19V7M3 15h18v4M21 15v-2.5a3 3 0 0 0-3-3h-7V15M7 12.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3z', words: /sleep|bed|nap|wake/ },
  { id: 'lotus', label: 'Meditate', path: 'M12 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM12 9v5M6.5 12.5L12 14l5.5-1.5M4 19c2.2-1.4 5-2.2 8-2.2s5.8.8 8 2.2', words: /meditat|breath|mindful|calm|relax|pray/ },
  { id: 'run', label: 'Run', path: 'M14.5 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM6 11.5l3.5-3 3.5 1-2 4.5 3.5 2.5-1 4.5M10.5 14.5L7 20M13 9.5l2.5 2.5 3.5-.5', words: /run|jog|walk|steps|hike|km|miles/ },
  { id: 'bike', label: 'Cycle', path: 'M6 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM18 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM6 15l4-7h5l3 7M10 8l2 7H6M13 5h2.5', words: /bike|cycl|ride|spin/ },
  { id: 'swim', label: 'Swim', path: 'M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M16 7.5a1.8 1.8 0 1 1 0-3.6a1.8 1.8 0 1 1 0 3.6zM6 13l4-4 3 3 3-2', words: /swim|pool/ },
  { id: 'leaf', label: 'Eat well', path: 'M5 19c0-8 6-14 15-14c0 9-6 15-14 15zM5 19l7-7', words: /fruit|veg|salad|greens|eat|meal|cook|healthy|diet|sugar|snack/ },
  { id: 'cup', label: 'Coffee', path: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M12.5 3.5v2.5', words: /coffee|tea|caffeine|espresso/ },
  { id: 'no', label: 'Quit', path: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8', words: /^no |^stop |^quit |^avoid |^limit |alcohol|smok|beer|wine/ },
  { id: 'pill', label: 'Pills', path: 'M10.5 20.5a4.95 4.95 0 0 1-7-7l7-7a4.95 4.95 0 0 1 7 7zM7 10l7 7', words: /vitamin|pill|medic|supplement|tablet/ },
  { id: 'tooth', label: 'Teeth', path: 'M7 3.5c-2.5 0-4 2-4 4.5 0 3 1.5 4 2 7s1 5.5 2.5 5.5S9.5 17 12 17s3 3.5 4.5 3.5S18.5 18 19 15s2-4 2-7c0-2.5-1.5-4.5-4-4.5-2 0-3 1-5 1s-3-1-5-1z', words: /floss|teeth|tooth|brush/ },
  { id: 'music', label: 'Music', path: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z', words: /music|piano|guitar|sing|practi[cs]e|violin|drum/ },
  { id: 'chat', label: 'Language', path: 'M4 5h16v11H9l-5 4zM8.5 9.5h7M8.5 12.5h4.5', words: /language|spanish|french|german|italian|english|japanese|duolingo|call|talk/ },
  { id: 'code', label: 'Code', path: 'M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14', words: /code|coding|program|develop/ },
  { id: 'coin', label: 'Money', path: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11', words: /save|money|budget|spend|invest/ },
  { id: 'sun', label: 'Sun', path: 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4', words: /sun|outside|outdoor|morning|daylight|fresh air/ },
  { id: 'heart', label: 'Care', path: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z', words: /gratitude|grateful|love|kind|family|friend|heart|care/ },
  { id: 'broom', label: 'Tidy', path: 'M14 4l-4.5 8M6.5 12h6l2 8h-10zM8 16v4M11 16v4', words: /clean|tidy|chores|declutter|laundry|dishes/ },
  { id: 'timer', label: 'Timer', path: 'M12 8v4l2.5 2.5M9 2h6M12 21a8 8 0 1 0 0-16a8 8 0 1 0 0 16z', words: /timer|focus|pomodoro|deep work/ },
  { id: 'plus', label: 'Count', path: 'M5 12h14M12 5v14', words: /count/ },
  { id: 'check', label: 'Check', path: 'M5 12.5l4.5 4.5L19 7.5', words: /^$/ },
];

const BY_ID = new Map(HABIT_ICONS.map((i) => [i.id, i]));

/** Icon for a kind of habit when its name suggests nothing (as in the design). */
const KIND_ICON: Record<HabitKind, string> = { timer: 'timer', count: 'plus', check: 'check' };

export function iconPath(id: string): string {
  return (BY_ID.get(id) ?? BY_ID.get('check')!).path;
}

export function isIconId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Pick an icon from a habit's name, or from how it's tracked. */
export function guessIcon(name: string, kind: HabitKind, unit = ''): string {
  const text = `${name} ${unit}`.toLowerCase().trim();
  const hit = HABIT_ICONS.find((i) => i.words.test(text));
  return hit?.id ?? KIND_ICON[kind];
}
