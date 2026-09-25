import { describe, expect, it } from 'vitest';
import { guessIcon, HABIT_ICONS, ICON_GROUPS, iconPath, isIconId } from '../src/lib/icons';

describe('habit icons', () => {
  it('keeps every id stored by earlier versions', () => {
    const before = ['drop', 'stretch', 'dumbbell', 'book', 'pencil', 'moon', 'bed', 'lotus', 'run', 'bike', 'swim', 'leaf', 'cup', 'no', 'pill', 'tooth', 'music', 'chat', 'code', 'coin', 'sun', 'heart', 'broom', 'timer', 'plus', 'check'];
    for (const id of before) expect(isIconId(id), id).toBe(true);
  });

  it('has unique ids and labels, each in a known group, no group empty', () => {
    expect(new Set(HABIT_ICONS.map((i) => i.id)).size).toBe(HABIT_ICONS.length);
    expect(new Set(HABIT_ICONS.map((i) => i.label)).size).toBe(HABIT_ICONS.length);
    for (const i of HABIT_ICONS) expect(ICON_GROUPS, i.id).toContain(i.group);
    for (const g of ICON_GROUPS) expect(HABIT_ICONS.some((i) => i.group === g), g).toBe(true);
  });

  it('draws only inside the 24×24 box', () => {
    for (const i of HABIT_ICONS) {
      expect(i.path, i.id).toMatch(/^M[\d\s.,MmLlHhVvCcSsQqTtAaZz-]+$/);
      // Absolute coordinates after M, L, H and V commands stay within the box.
      for (const [, n] of i.path.matchAll(/[MLHV]\s*(-?[\d.]+)/g)) expect(Number(n), i.id).toBeGreaterThanOrEqual(0), expect(Number(n), i.id).toBeLessThanOrEqual(24);
    }
  });

  it('falls back to the check mark for an unknown id', () => {
    expect(iconPath('nope')).toBe(iconPath('check'));
    expect(isIconId('nope')).toBe(false);
  });

  it('guesses an icon from the name, most specific first', () => {
    const cases: [string, string][] = [
      ['Read', 'book'],
      ['Drink water', 'drop'],
      ['Workout', 'dumbbell'],
      ['Meditate', 'lotus'],
      ['Run', 'run'],
      ['Floss', 'tooth'],
      ['Brush teeth', 'tooth'],
      ['Walk the dog', 'paw'],
      ['Walk', 'walk'],
      ['Water the plants', 'sprout'],
      ['Quit smoking', 'smoke'],
      ['No coffee after 14:00', 'no'],
      ['Green tea', 'cup'],
      ['Eat fruit', 'apple'],
      ['Eat healthy', 'leaf'],
      ['Cook dinner', 'plate'],
      ['Learn Spanish', 'globe'],
      ['Study for the exam', 'cap'],
      ['Yoga', 'yoga'],
      ['Stretch', 'stretch'],
      ['Wake up at 6', 'alarm'],
      ['Sleep by 23:00', 'bed'],
      ['Breathing exercise', 'wind'],
      ['Practice guitar', 'guitar'],
      ['Piano practice', 'music'],
      ['Sketch', 'brush'],
      ['Call mom', 'call'],
      ['Less phone', 'no'],
      ['Screen time under 2 h', 'phone'],
      ['Save money', 'piggy'],
      ['Track spending', 'wallet'],
      ['Weigh in', 'scale'],
      ['Take the stairs', 'stairs'],
      ['Hike', 'mountain'],
      ['Tennis', 'ball'],
      ['Journal', 'pencil'],
      ['Tidy the desk', 'broom'],
    ];
    for (const [name, icon] of cases) expect(guessIcon(name, 'check'), name).toBe(icon);
  });

  it('uses the kind when the name suggests nothing', () => {
    expect(guessIcon('Something', 'check')).toBe('check');
    expect(guessIcon('Something', 'count')).toBe('plus');
    expect(guessIcon('Something', 'timer')).toBe('timer');
  });
});
