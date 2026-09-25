import { describe, expect, it } from 'vitest';
import { autoColor, defaultStep, parseHabit } from '../src/lib/parse';

describe('new habit in one sentence', () => {
  it('reads the design examples', () => {
    expect(parseHabit('Read 20 min every evening')).toEqual({
      name: 'Read',
      kind: 'timer',
      target: 20,
      unit: 'min',
      schedule: { type: 'daily' },
      time: 'evening',
      icon: 'book',
    });
    expect(parseHabit('Drink 8 glasses of water')).toMatchObject({ name: 'Drink water', kind: 'count', target: 8, unit: 'glasses', icon: 'drop' });
    expect(parseHabit('Workout 3 times a week')).toMatchObject({ name: 'Workout', kind: 'check', schedule: { type: 'weekly', times: 3 }, icon: 'dumbbell' });
    expect(parseHabit('Meditate 10 min every morning')).toMatchObject({ name: 'Meditate', kind: 'timer', target: 10, time: 'morning', icon: 'lotus' });
    expect(parseHabit('No coffee after 14:00')).toMatchObject({ name: 'No coffee after 14:00', kind: 'check', schedule: { type: 'daily' } });
  });

  it('understands days, hours and big numbers', () => {
    expect(parseHabit('Walk 10,000 steps on weekdays')).toMatchObject({ name: 'Walk', kind: 'count', target: 10000, unit: 'steps', schedule: { type: 'days', days: [0, 1, 2, 3, 4] } });
    expect(parseHabit('Run 5 km on Monday, Wednesday and Friday')).toMatchObject({ name: 'Run', target: 5, unit: 'km', schedule: { type: 'days', days: [0, 2, 4] } });
    expect(parseHabit('Long walk at the weekend')).toMatchObject({ schedule: { type: 'days', days: [5, 6] } });
    expect(parseHabit('Practice guitar 1.5 hours')).toMatchObject({ name: 'Practice guitar', kind: 'timer', target: 90 });
    expect(parseHabit('Swim twice a week')).toMatchObject({ name: 'Swim', schedule: { type: 'weekly', times: 2 } });
    expect(parseHabit('10k steps')).toMatchObject({ name: 'Steps', target: 10000 });
    expect(parseHabit('Stretch every day at night')).toMatchObject({ name: 'Stretch', time: 'evening', schedule: { type: 'daily' } });
    expect(parseHabit('Yoga 7 times a week')).toMatchObject({ schedule: { type: 'daily' } });
  });

  it('does not mistake words for days', () => {
    expect(parseHabit('Sunscreen').schedule).toEqual({ type: 'daily' });
    expect(parseHabit('Save money').schedule).toEqual({ type: 'daily' });
    expect(parseHabit('Eat less fries').schedule).toEqual({ type: 'daily' });
  });

  it('always gives a usable habit', () => {
    expect(parseHabit('')).toMatchObject({ name: 'New habit', kind: 'check', target: 1 });
    expect(parseHabit('   ').name).toBe('New habit');
    expect(parseHabit('x'.repeat(200)).name.length).toBeLessThanOrEqual(60);
    expect(parseHabit('Read 0 pages')).toMatchObject({ kind: 'check', target: 1 });
  });

  it('picks sensible steps and stable colors', () => {
    expect(defaultStep('timer', 20)).toBe(5);
    expect(defaultStep('timer', 10)).toBe(5);
    expect(defaultStep('timer', 60)).toBe(15);
    expect(defaultStep('timer', 3)).toBe(1);
    expect(defaultStep('count', 8)).toBe(1);
    expect(defaultStep('count', 50)).toBe(10);
    expect(defaultStep('count', 10000)).toBe(2500);
    expect(autoColor('Read')).toBe(autoColor('Read'));
    // The design's pick for "Read".
    expect(autoColor('Read')).toBe('crimson');
  });
});
