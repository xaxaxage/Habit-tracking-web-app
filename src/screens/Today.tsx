import { useState } from 'preact/hooks';
import type { Tile } from '../lib/habits';
import { boardFor, currentPause, firstDay, isPaused, repeatLabel } from '../lib/habits';
import { boardOrder } from '../lib/order';
import { placeHabit, restoreLog, tapHabit, useData } from '../lib/store';
import { addDays, dayMonthLong, fromKey, longDate, shortWeekday, weekday } from '../lib/dates';
import { href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { HabitSheet } from '../components/HabitSheet';
import { Board, type Move } from '../components/Board';
import { ViewChips } from '../components/ViewChips';
import { ALL, inView, parseView, viewLabel, viewParam, viewsFor, type View } from '../lib/views';
import { BRIGHT_COLORS } from '../lib/theme';

export const EXAMPLES = ['Drink 8 glasses of water', 'Workout 3 times a week', 'Meditate 10 min every morning', 'No coffee after 14:00'];

/** Days shown in the strip: today and the four before it. */
const STRIP = 5;

function Empty() {
  return (
    <section class="empty" aria-labelledby="empty-title">
      <h2 id="empty-title" class="empty-title">
        Start with one habit
      </h2>
      <p class="body-text">
        Say what you want to do and how often, in your own words. Pick an example to try it:
      </p>
      <div class="chips" role="group" aria-label="Examples">
        {EXAMPLES.map((text) => (
          <a class="chip" href={`#${href('/new', { text })}`}>
            {text}
          </a>
        ))}
      </div>
      <a class="btn primary" href="#/new">
        New habit
      </a>
    </section>
  );
}

/** Why a habit isn't due on the day, unless something was logged anyway. */
function notDueMeta(t: Tile, date: string, first: string): string | undefined {
  const h = t.habit;
  if (isPaused(h, date)) return currentPause(h) ? 'Paused' : 'Paused then';
  if (t.status !== 'open') return undefined;
  if (date < first) return 'Not started yet';
  return `Not today · ${repeatLabel(h.schedule)}`;
}

/** Done and due among these tiles (skipped days don't count). */
function tally(tiles: Tile[]) {
  const counted = tiles.filter((t) => t.status !== 'skipped' && t.status !== 'met');
  return { done: counted.filter((t) => t.status === 'done').length, total: counted.length };
}

export function Today({ date, today, show }: { date: string; today: string; show?: string | null }) {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [said, say] = useState('');
  const habits = boardOrder(data, today);
  const board = boardFor(data, date, today, habits);
  const layout = data.settings.layout;
  const views = viewsFor(habits);
  const view = views.length > 1 ? parseView(show, habits) : ALL;
  const due = board.due.filter((t) => inView(t.habit, view));
  const other = board.other.filter((t) => inView(t.habit, view));
  const isToday = date === today;
  const openHabit = open ? data.habits.find((h) => h.id === open) : undefined;

  const go = (d: string, v: View) => navigate(href('/', { date: d === today ? undefined : d, show: viewParam(v) }), { replace: true });
  const pick = (d: string) => go(d, view);

  const tap = (t: Tile) => {
    const h = t.habit;
    const before = tapHabit(h, date);
    // Starting a count over loses progress: offer to take it back.
    if (h.kind !== 'check' && t.status === 'done') {
      showToast(`${h.name} reset to 0`, { label: 'Undo', run: () => restoreLog(h, date, before) });
    }
  };

  const move = (tiles: Tile[]) => (m: Move) => {
    const h = tiles.find((t) => t.habit.id === m.id)!.habit;
    placeHabit(m.id, m.after, m.before);
    say(`${h.name} moved to ${m.index + 1} of ${tiles.length}`);
  };

  const days = Array.from({ length: STRIP }, (_, i) => addDays(today, i - STRIP + 1));
  const seg = board.due;

  return (
    <main class="screen with-nav" aria-labelledby="today-title">
      <header class="page-head">
        <div>
          <span class="eyebrow">{isToday ? longDate(date) : `Editing ${dayMonthLong(date)}`}</span>
          <h1 id="today-title" class="page-title">
            {isToday ? 'Today' : weekday(date)}
          </h1>
        </div>
        {board.total > 0 && (
          <p class="left-count">
            <span class="n">{board.left === 0 ? 'All' : board.left}</span>{' '}
            <span class="label">{board.left === 0 ? 'done' : 'to go'}</span>
          </p>
        )}
      </header>

      {seg.length > 0 && (
        <div role="img" aria-label={`${board.done} of ${board.total} habits done`} class={`segments${seg.length > 16 ? ' tight' : ''}`}>
          {seg.map((t) => (
            <span
              class={`c-${t.habit.color} ${t.status === 'done' ? 'done' : t.status === 'skipped' || t.status === 'met' ? 'skipped' : ''}`}
              style={t.status === 'done' ? { '--seg': BRIGHT_COLORS.includes(t.habit.color) ? 'var(--c)' : 'var(--c-lift)' } : undefined}
            />
          ))}
        </div>
      )}

      {habits.length > 0 && (
        <div role="group" aria-label="Day" class="days">
          {days.map((d) => {
            const b = boardFor(data, d, today);
            const dayName = fromKey(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <button
                type="button"
                class="day"
                aria-pressed={d === date}
                aria-label={`${d === today ? 'Today, ' : ''}${dayName}, ${b.done} of ${b.total} done`}
                onClick={() => pick(d)}
              >
                <span class="dow">{d === today ? 'Today' : shortWeekday(d)}</span>
                <span class="date">{fromKey(d).getDate()}</span>
                <span class="score">
                  {b.done}/{b.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {views.length > 1 && <ViewChips views={views} current={view} count={(v) => tally(board.due.filter((t) => inView(t.habit, v)))} onPick={(v) => go(date, v)} />}

      {habits.length === 0 ? (
        <Empty />
      ) : (
        <>
          {due.length > 0 ? (
            <Board tiles={due} layout={layout} label={`Due ${isToday ? 'today' : 'this day'}`} onTap={tap} onOptions={setOpen} onMove={move(due)} />
          ) : view.kind === 'all' ? (
            <p class="notice">Nothing is due {isToday ? 'today' : 'on this day'}. Enjoy the rest day.</p>
          ) : (
            <p class="notice">
              Nothing {view.kind === 'group' ? 'in' : 'for'} {viewLabel(view)} is due {isToday ? 'today' : 'on this day'}.
            </p>
          )}
          <p id="board-hint" class="board-hint">
            <span class="touch-only">
              Tap to log · <u>hold a tile</u> to skip, add a note or open it · hold and drag to move it
            </span>
            <span class="mouse-only">
              Click to log · <u>right-click a tile</u> to skip, add a note or open it · hold and drag to move it
            </span>
            <span class="sr-only"> (with a keyboard: Shift+Enter for options, Alt+Up or Alt+Down to move)</span>
          </p>
          <p class="sr-only" aria-live="polite">
            {said}
          </p>
          {other.length > 0 && (
            <>
              <h2 class="section-label other-label">Not due {isToday ? 'today' : 'this day'}</h2>
              <Board
                tiles={other}
                layout={layout}
                label={`Not due ${isToday ? 'today' : 'this day'}`}
                quiet
                meta={(t) => notDueMeta(t, date, firstDay(t.habit, data.logs[t.habit.id]))}
                onTap={tap}
                onOptions={setOpen}
                onMove={move(other)}
              />
            </>
          )}
        </>
      )}

      {openHabit && <HabitSheet habit={openHabit} date={date} today={today} onClose={() => setOpen(null)} />}
    </main>
  );
}
