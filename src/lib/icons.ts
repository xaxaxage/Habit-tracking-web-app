import type { HabitKind } from './types';

/**
 * Habit icons: 24×24 line drawings (2px round strokes, like the design's).
 * The design's own (drop, stretch, dumbbell, book, pencil, moon, timer…)
 * come first in their groups; the rest follow the same style. Ids are stored
 * with each habit, so they never change.
 */

export interface HabitIcon {
  id: string;
  label: string;
  group: string;
  path: string;
  /** Words in a habit's name that suggest this icon. */
  words?: RegExp;
}

export const ICON_GROUPS = ['Health', 'Movement', 'Mind', 'Food and drink', 'Learning and work', 'Creative', 'Home and money', 'People', 'Basics'];

const icon = (group: string, id: string, label: string, path: string, words?: RegExp): HabitIcon => ({ id, label, group, path, ...(words ? { words } : {}) });

export const HABIT_ICONS: HabitIcon[] = [
  // Health
  icon('Health', 'drop', 'Water', 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', /water|drink|hydrat|glass/),
  icon('Health', 'bottle', 'Bottle', 'M10 2.5h4M10.5 2.5v2.8L8.5 8.2v11.8a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5V8.2l-2-2.9V2.5M8.5 11.5h7', /bottle|shake|smoothie/),
  icon('Health', 'pill', 'Pills', 'M10.5 20.5a4.95 4.95 0 0 1-7-7l7-7a4.95 4.95 0 0 1 7 7zM7 10l7 7', /vitamin|pill|medic|supplement|tablet/),
  icon('Health', 'tooth', 'Teeth', 'M7 3.5c-2.5 0-4 2-4 4.5 0 3 1.5 4 2 7s1 5.5 2.5 5.5S9.5 17 12 17s3 3.5 4.5 3.5S18.5 18 19 15s2-4 2-7c0-2.5-1.5-4.5-4-4.5-2 0-3 1-5 1s-3-1-5-1z', /floss|teeth|tooth/),
  icon('Health', 'bed', 'Sleep', 'M3 19V7M3 15h18v4M21 15v-2.5a3 3 0 0 0-3-3h-7V15M7 12.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3z', /sleep|\bbed\b|\bnap/),
  icon('Health', 'alarm', 'Wake up', 'M12 20.5a7.5 7.5 0 1 0 0-15a7.5 7.5 0 0 0 0 15zM12 9.5v3.5l2 2M3.5 6.5l3-3M20.5 6.5l-3-3', /alarm|wake|early|get up/),
  icon('Health', 'sunrise', 'Sunrise', 'M3 19h18M6.5 19a5.5 5.5 0 0 1 11 0M12 4v6M9.5 6.5L12 4l2.5 2.5M4.6 11.6l1.5 1.5M19.4 11.6l-1.5 1.5M2.5 15.5H4M20 15.5h1.5', /sunrise|morning (light|routine)/),
  icon('Health', 'shower', 'Shower', 'M12 3v3M5.5 12a6.5 6.5 0 0 1 13 0zM8 15l-1 2M12 15v2.5M16 15l1 2M7.5 19.5L7 21M12 19.5V21M16.5 19.5L17 21', /shower|\bbath|skin ?care|\bface\b/),
  icon('Health', 'heart', 'Care', 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z', /gratitude|grateful|love|kind|care/),
  icon('Health', 'pulse', 'Heart rate', 'M2.5 12h4L9 5.5l5 13 2.5-6.5h5', /cardio|heart rate|pulse|blood pressure/),
  icon('Health', 'scale', 'Weigh in', 'M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM8 9.5a4 4 0 0 1 8 0zM12 9.5l1.5-2', /weigh|scale/),
  icon('Health', 'smile', 'Mood', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5v.5M15 9.5v.5', /mood|smile|happy|laugh|joy/),

  // Movement
  icon('Movement', 'dumbbell', 'Workout', 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12', /work ?out|gym|lift|weights|strength|push.?ups?|pull.?ups?|squats?|plank|exercise|train/),
  icon('Movement', 'run', 'Run', 'M14.5 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM6 11.5l3.5-3 3.5 1-2 4.5 3.5 2.5-1 4.5M10.5 14.5L7 20M13 9.5l2.5 2.5 3.5-.5', /\brun|jog|\bkm\b|miles|marathon/),
  icon('Movement', 'walk', 'Walk', 'M8.5 3c1.5 0 2.5 1.8 2.5 4s-1 3.5-2.5 3.5S6 9.2 6 7s1-4 2.5-4zM6.5 13.5l4 .5-.3 2a2 2 0 0 1-4-.5zM15.5 7c1.5 0 2.5 1.8 2.5 4s-1 3.5-2.5 3.5S13 13.2 13 11s1-4 2.5-4zM13.5 17.5l4 .5-.3 2a2 2 0 0 1-4-.5z', /walk|steps\b|stroll/),
  icon('Movement', 'stretch', 'Stretch', 'M12 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM4 9l8 2 8-2M12 11v4l-3 6M12 15l3 6', /stretch|mobility|posture/),
  icon('Movement', 'yoga', 'Yoga', 'M12 1.9a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 1 1 0-3.4zM7 4l5 5 5-5M12 9v4.5M12 13.5l4 3V21M12 13.5L7.5 21', /yoga|pilates/),
  icon('Movement', 'bike', 'Cycle', 'M6 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM18 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM6 15l4-7h5l3 7M10 8l2 7H6M13 5h2.5', /bike|cycl|ride|spin/),
  icon('Movement', 'swim', 'Swim', 'M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M16 7.5a1.8 1.8 0 1 1 0-3.6a1.8 1.8 0 1 1 0 3.6zM6 13l4-4 3 3 3-2', /swim|pool/),
  icon('Movement', 'ball', 'Ball games', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 7.8l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.8M15.8 10.6l4.7-1.5M14.3 15l2.9 4M9.7 15l-2.9 4M8.2 10.6L3.5 9.1', /football|soccer|tennis|basketball|\bball|volley|padel|golf/),
  icon('Movement', 'mountain', 'Hike', 'M2.5 19.5L9.5 7.5l4 6.5 2-3 6 8.5zM7.4 11.1l2.1 1.4 1.8-1.5', /hike|hiking|mountain|climb/),
  icon('Movement', 'stairs', 'Stairs', 'M3 20.5h5V16h4.5v-4.5H17V7h4', /stairs/),
  icon('Movement', 'bolt', 'Energy', 'M13.5 2.5L4.5 14h7l-1 7.5 9-11.5h-7z', /energy|hiit|sprint|power/),

  // Mind
  icon('Mind', 'lotus', 'Meditate', 'M12 3.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM12 9v5M6.5 12.5L12 14l5.5-1.5M4 19c2.2-1.4 5-2.2 8-2.2s5.8.8 8 2.2', /meditat|mindful|calm|relax|pray/),
  icon('Mind', 'wind', 'Breathe', 'M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12.5h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16.5h8', /breath/),
  icon('Mind', 'moon', 'Night', 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', /screens?\b|night|evening|lights? out|bedtime/),
  icon('Mind', 'sun', 'Sun', 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4', /\bsun|outside|outdoor|daylight|fresh air/),
  icon('Mind', 'brain', 'Think', 'M12 5.5a3 3 0 0 0-5.8-1 3 3 0 0 0-2.4 4.4 3.5 3.5 0 0 0 .5 5.9 3.2 3.2 0 0 0 3.2 4.2A2.8 2.8 0 0 0 12 20zM12 5.5a3 3 0 0 1 5.8-1 3 3 0 0 1 2.4 4.4 3.5 3.5 0 0 1-.5 5.9 3.2 3.2 0 0 1-3.2 4.2A2.8 2.8 0 0 1 12 20M12 5.5V20', /think|brain|memory|puzzle|chess|sudoku/),
  icon('Mind', 'bulb', 'Ideas', 'M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v1.5h5V16c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z', /idea|brainstorm|creative/),
  icon('Mind', 'target', 'Goal', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9a4.5 4.5 0 0 0 0 9zM12 12.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1z', /goal|focus|priorit/),
  icon('Mind', 'star', 'Star', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z', /\bstar\b|highlight/),

  // Food and drink
  icon('Food and drink', 'leaf', 'Eat well', 'M5 19c0-8 6-14 15-14c0 9-6 15-14 15zM5 19l7-7', /salad|greens|healthy|diet|plant.?based|vegan|vegetarian|sugar|snack/),
  icon('Food and drink', 'apple', 'Fruit', 'M12 7.5c-1.3-1.2-5.5-1.8-6.8 1.7-1.2 3.3.3 8.3 2.8 10.2 1.3 1 2.6.9 4 .2 1.4.7 2.7.8 4-.2 2.5-1.9 4-6.9 2.8-10.2-1.3-3.5-5.5-2.9-6.8-1.7zM12 7.5c0-2 .8-3.5 2.5-4.5', /apple|fruit/),
  icon('Food and drink', 'carrot', 'Vegetables', 'M4 20l6.5-11a3.8 3.8 0 0 1 5.3-.7 3.8 3.8 0 0 1 .7 5.3zM15.5 8.5l3-3M14.5 7.5l.5-3.5M16.5 9.5l3.5-.5M8 15.5l1.5 1M9.5 12.5l1.5 1', /veg|carrot/),
  icon('Food and drink', 'plate', 'Meal', 'M12 17a5 5 0 1 0 0-10a5 5 0 0 0 0 10zM3.5 3.5V8a1.5 1.5 0 0 0 3 0V3.5M5 9.5v11M20.5 3.5c-1.2 0-2 1.8-2 4.5 0 2 .8 3 2 3v9.5', /meal|cook|dinner|lunch|breakfast|\beat\b|eating|fast(ing)?\b/),
  icon('Food and drink', 'cup', 'Coffee', 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M12.5 3.5v2.5', /coffee|\btea\b|caffeine|espresso/),
  icon('Food and drink', 'wine', 'Alcohol', 'M7.5 3h9l-.3 4.5a4.2 4.2 0 0 1-8.4 0zM12 11.7v8.8M8.5 20.5h7M7.9 7h8.2', /wine|beer|alcohol|booze|cocktail/),
  icon('Food and drink', 'no', 'Quit', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8', /^(no|stop|quit|avoid|limit|less|cut) /),
  icon('Food and drink', 'smoke', 'No smoking', 'M2.5 13.5h13V17h-13zM18.5 13.5V17M21 13.5V17M3.5 4l17 16', /smok|cigar|vape|nicotine/),

  // Learning and work
  icon('Learning and work', 'book', 'Read', 'M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2a2 2 0 0 0 2 2h14', /read|book|pages?|chapter/),
  icon('Learning and work', 'pencil', 'Write', 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', /journal|write|diary|writing|notes?/),
  icon('Learning and work', 'cap', 'Study', 'M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5V16c1.5 1.3 3.5 2 5.5 2s4-.7 5.5-2v-4.5M21.5 9.5v5', /study|course|class|homework|exam|lesson|learn/),
  icon('Learning and work', 'globe', 'Language', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z', /travel|language|spanish|french|german|italian|english|japanese|chinese|duolingo/),
  icon('Learning and work', 'chat', 'Talk', 'M4 5h16v11H9l-5 4zM8.5 9.5h7M8.5 12.5h4.5', /talk|conversation|speak/),
  icon('Learning and work', 'code', 'Code', 'M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14', /code|coding|program|develop/),
  icon('Learning and work', 'laptop', 'Computer', 'M5.5 5h13a1 1 0 0 1 1 1v9.5h-15V6a1 1 0 0 1 1-1zM2.5 18.5h19', /laptop|computer|side project/),
  icon('Learning and work', 'list', 'To-do', 'M10 6.5h10.5M10 12h10.5M10 17.5h10.5M3.5 6.5L5 8l2.5-3M3.5 12L5 13.5l2.5-3M3.5 17.5L5 19l2.5-3', /to.?do|tasks?\b|\blist/),
  icon('Learning and work', 'calendar', 'Plan', 'M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5zM3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4', /plan|calendar|schedule|review/),
  icon('Learning and work', 'mail', 'Inbox', 'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5zM3.5 7l8.5 6.5L20.5 7', /mail|inbox|letter/),
  icon('Learning and work', 'timer', 'Timer', 'M12 8v4l2.5 2.5M9 2h6M12 21a8 8 0 1 0 0-16a8 8 0 1 0 0 16z', /timer|pomodoro|deep work/),

  // Creative
  icon('Creative', 'music', 'Music', 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z', /music|piano|violin|drum|practi[cs]e/),
  icon('Creative', 'guitar', 'Guitar', 'M20 4l-6 6M18 2.5L21.5 6M12.2 10.2c-1.4-.6-3-.4-3.7 1-.3.6-.8.9-1.6 1-1.7.3-3 1.4-3 3.3 0 2.5 2.1 4.6 4.6 4.6 1.9 0 3-1.3 3.3-3 .1-.8.4-1.3 1-1.6 1.4-.7 1.6-2.3 1-3.7zM8 14l2 2', /guitar|ukulele|\bbass\b/),
  icon('Creative', 'mic', 'Sing', 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7', /\bsing|vocal|record/),
  icon('Creative', 'headphones', 'Listen', 'M4 17v-4a8 8 0 0 1 16 0v4M4 15h2a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 6 20.5h-.5A1.5 1.5 0 0 1 4 19zM20 15h-2a1.5 1.5 0 0 0-1.5 1.5V19a1.5 1.5 0 0 0 1.5 1.5h.5A1.5 1.5 0 0 0 20 19z', /podcast|audiobook|listen/),
  icon('Creative', 'brush', 'Paint', 'M19 3.5a1.8 1.8 0 0 1 2.5 2.5L13 14.5 10.5 12zM10 13c-2 0-4 1.2-4 3.5 0 1.5-.8 2.8-3 3.5 3 1.5 7.5.5 8.5-2.5.5-1.5.2-2.8-1.5-4.5z', /paint|draw|sketch|\bart\b|brush/),
  icon('Creative', 'camera', 'Photo', 'M4 7.5h3l1.5-2.5h7L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5zM12 16.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z', /photo|camera/),

  // Home and money
  icon('Home and money', 'broom', 'Tidy', 'M14 4l-4.5 8M6.5 12h6l2 8h-10zM8 16v4M11 16v4', /clean|tidy|chores|declutter|laundry|dishes/),
  icon('Home and money', 'sprout', 'Plants', 'M12 21v-8.5M12 12.5C12 8.5 9 6 4.5 6c0 4.5 3 6.5 7.5 6.5zM12 14.5c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6zM7.5 21h9', /garden|\bplants\b/),
  icon('Home and money', 'paw', 'Pet', 'M12 13c-2.8 0-5.5 3-5.5 5.2 0 1.4 1 2.3 2.4 2.3 1.2 0 1.9-.7 3.1-.7s1.9.7 3.1.7c1.4 0 2.4-.9 2.4-2.3C17.5 16 14.8 13 12 13zM5 12.5a1.7 2.2 0 1 0 0-4.4a1.7 2.2 0 0 0 0 4.4zM9.2 8.5a1.7 2.3 0 1 0 0-4.6a1.7 2.3 0 0 0 0 4.6zM14.8 8.5a1.7 2.3 0 1 0 0-4.6a1.7 2.3 0 0 0 0 4.6zM19 12.5a1.7 2.2 0 1 0 0-4.4a1.7 2.2 0 0 0 0 4.4z', /\bdog|\bcat\b|\bpets?\b/),
  icon('Home and money', 'coin', 'Money', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11', /money|invest|finance/),
  icon('Home and money', 'wallet', 'Spending', 'M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6.5A1.5 1.5 0 0 1 5 5h11.5v2.5M16 13.5h1.5', /spend|budget|wallet|expense/),
  icon('Home and money', 'piggy', 'Save', 'M19 10.5c.8.7 1.4 1.5 1.7 2.5H22v3h-1.6a7 7 0 0 1-2.4 2.5v2h-3v-1.2a9.5 9.5 0 0 1-4 0v1.2H8v-2A6.5 6.5 0 0 1 4.5 13c0-3.9 3.6-6.5 7.5-6.5 1.5 0 3 .3 4.2.9l2.8-1.9zM2.5 10.5c0 1.4 1 2.5 2.3 2.5M15.5 10.5h.01', /\bsave|saving|piggy/),

  // People
  icon('People', 'people', 'Friends', 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.2.8 3.5 2.9 3.5 5.7', /friend|family|social|people|volunteer/),
  icon('People', 'call', 'Call', 'M8.8 3.5l2 4.6-2.4 1.6a11.5 11.5 0 0 0 5.9 5.9l1.6-2.4 4.6 2v3.2a1.8 1.8 0 0 1-1.9 1.8C10.3 19.8 4.2 13.7 3.8 5.4A1.8 1.8 0 0 1 5.6 3.5z', /\bcall/),
  icon('People', 'phone', 'Phone', 'M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 18.5h3', /phone|screen time|social media|instagram|tiktok|scroll/),

  // Basics
  icon('Basics', 'check', 'Check', 'M5 12.5l4.5 4.5L19 7.5'),
  icon('Basics', 'plus', 'Count', 'M5 12h14M12 5v14'),
];

const BY_ID = new Map(HABIT_ICONS.map((i) => [i.id, i]));

/**
 * Which icon a name suggests, most specific first ("No smoking" before "No …",
 * "Walk the dog" is a pet, "Brush teeth" is teeth).
 */
const GUESS_ORDER = [
  'smoke', 'no', 'paw', 'sprout', 'lotus', 'wind', 'brain', 'walk', 'yoga', 'stretch', 'dumbbell', 'run', 'bike', 'swim', 'stairs',
  'mountain', 'ball', 'bolt', 'tooth', 'wine', 'cup', 'drop', 'bottle', 'apple', 'carrot', 'leaf', 'plate', 'pill', 'shower', 'alarm',
  'sunrise', 'bed', 'scale', 'pulse', 'guitar', 'mic', 'headphones', 'music', 'brush', 'camera', 'globe', 'cap', 'chat', 'code', 'laptop', 'mail',
  'calendar', 'list', 'book', 'pencil', 'phone', 'moon', 'sun', 'bulb', 'target', 'star', 'broom', 'piggy', 'wallet', 'coin',
  'people', 'call', 'heart', 'smile', 'timer',
].map((id) => BY_ID.get(id)!);

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
  const hit = GUESS_ORDER.find((i) => i.words?.test(text));
  return hit?.id ?? KIND_ICON[kind];
}
