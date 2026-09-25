import { useState } from 'preact/hooks';
import type { Tile } from '../lib/habits';
import { boardFor, boardHabits, currentPause, firstDay, isPaused, repeatLabel } from '../lib/habits';
import { restoreLog, tapHabit, useData } from '../lib/store';
import { addDays, dayMonthLong, fromKey, longDate, shortWeekday, weekday } from '../lib/dates';
import { href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { HabitSheet } from '../components/HabitSheet';
import { TileView } from '../components/Tile';

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

export function Today({ date, today }: { date: string; today: string }) {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);
  const board = boardFor(data, date, today);
  const habits = boardHabits(data);
  const isToday = date === today;
  const openHabit = open ? data.habits.find((h) => h.id === open) : undefined;

  const pick = (d: string) => navigate(d === today ? '/' : href('/', { date: d }), { replace: true });

  const tap = (t: Tile) => {
    const h = t.habit;
    const before = tapHabit(h, date);
    // Starting a count over loses progress: offer to take it back.
    if (h.kind !== 'check' && t.status === 'done') {
      showToast(`${h.name} reset to 0`, { label: 'Undo', run: () => restoreLog(h, date, before) });
    }
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
              style={t.status === 'done' ? { '--seg': t.habit.color === 'orange' || t.habit.color === 'ember' ? 'var(--c)' : 'var(--c-lift)' } : undefined}
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

      {habits.length === 0 ? (
        <Empty />
      ) : (
        <>
          {board.due.length > 0 ? (
            <div class="tiles">
              {board.due.map((t) => (
                <TileView key={t.habit.id} tile={t} onTap={() => tap(t)} onOptions={() => setOpen(t.habit.id)} />
              ))}
            </div>
          ) : (
            <p class="notice">Nothing is due {isToday ? 'today' : 'on this day'}. Enjoy the rest day.</p>
          )}
          <p id="board-hint" class="board-hint">
            Tap to log · <u>hold a tile</u> to skip, add a note or open it<span class="sr-only"> (with a keyboard: Shift+Enter)</span>
          </p>
          {board.other.length > 0 && (
            <>
              <h2 class="section-label other-label">Not due {isToday ? 'today' : 'this day'}</h2>
              <div class="tiles">
                {board.other.map((t) => (
                  <TileView
                    key={t.habit.id}
                    tile={t}
                    quiet
                    meta={notDueMeta(t, date, firstDay(t.habit, data.logs[t.habit.id]))}
                    onTap={() => tap(t)}
                    onOptions={() => setOpen(t.habit.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {openHabit && <HabitSheet habit={openHabit} date={date} today={today} onClose={() => setOpen(null)} />}
    </main>
  );
}
