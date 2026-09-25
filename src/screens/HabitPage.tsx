import { useState } from 'preact/hooks';
import type { Habit } from '../lib/types';
import { amountLabel, currentPause, dayState, firstDay, fmt, habitSummary, isWeekly, statsOf, streakOf, WEEKDAY_LETTER } from '../lib/habits';
import { pauseHabit, restoreHabit, resumeHabit, useData } from '../lib/store';
import { addDays, dayMonth, dayOf, monthSpan, shortDate, weekStartOf } from '../lib/dates';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { ChevronLeft, HabitGlyph } from '../components/Icons';

const WEEKS = 18;

/** How full a day looks on the heatmap: 0 nothing, 1 some, 2 the goal, 3 well past it (or done). */
function level(h: Habit, value: number): number {
  if (value <= 0) return 0;
  if (h.kind === 'check') return 3;
  if (value < h.target) return 1;
  return value < h.target * 1.5 ? 2 : 3;
}

export function HabitPage({ habit, today }: { habit: Habit; today: string }) {
  const data = useData();
  const h = data.habits.find((x) => x.id === habit.id) ?? habit;
  const logs = data.logs[h.id];
  const ws = data.settings.weekStart;
  const [allNotes, setAllNotes] = useState(false);

  const first = firstDay(h, logs);
  const heatStart = addDays(weekStartOf(today, ws), -7 * (WEEKS - 1));
  const streak = streakOf(h, logs, today, ws);
  const stats = statsOf(h, logs, heatStart, today, today, ws);
  const young = first > heatStart;
  const pause = currentPause(h);

  const cells: { cls: string }[] = [];
  let hit = 0;
  let due = 0;
  for (let d = heatStart; cells.length < WEEKS * 7; d = addDays(d, 1)) {
    const state = dayState(h, logs, d, today, first);
    const log = logs?.[d];
    let cls = `sq l${level(h, log && !log.skipped ? log.value : 0)}`;
    if (state === 'future' || state === 'before') cls = 'sq none';
    else if (state === 'skipped') cls = 'sq skip';
    if (state === 'done') hit++;
    if (state === 'done' || state === 'open' || state === 'partial') due++;
    cells.push({ cls });
  }
  const labels = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? WEEKDAY_LETTER[(i + (ws === 'mon' ? 0 : 6)) % 7] : ''));

  const notes = Object.entries(logs ?? {})
    .filter(([, l]) => l.note)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const shownNotes = allNotes ? notes : notes.slice(0, 10);

  const third =
    isWeekly(h)
      ? { k: 'Avg week', v: fmt(stats.average), sub: stats.average === 1 ? 'time' : 'times' }
      : h.kind === 'timer'
        ? { k: 'Avg day', v: String(Math.round(stats.average)), sub: 'minutes' }
        : h.kind === 'count'
          ? { k: 'Avg day', v: fmt(stats.average), sub: h.unit || 'a day' }
          : { k: 'Done', v: String(stats.total), sub: stats.total === 1 ? 'day' : 'days' };

  return (
    <main class={`screen gap-18 c-${h.color}`} aria-labelledby="habit-title">
      <header class="topbar">
        <button type="button" class="round-btn lg" aria-label="Back" onClick={() => goBack('/')}>
          <ChevronLeft size={20} />
        </button>
        <a class="pill-btn" href={`#/habit/${h.id}/edit`}>
          Edit
        </a>
      </header>

      <div class="field" style={{ gap: '6px' }}>
        <span class="habit-kicker">
          <HabitGlyph icon={h.icon} size={18} />
          {habitSummary(h)}
        </span>
        <h1 id="habit-title" class="big-title">
          {h.name}
        </h1>
      </div>

      {h.archivedAt && (
        <div class="notice stack-notice">
          Archived on {dayMonth(dayOf(h.archivedAt))}. It's off your board, and its history is kept.
        </div>
      )}
      {!h.archivedAt && pause && (
        <div class="notice">
          Paused since {dayMonth(pause.from)}. It's off your board, and paused days don't count, so your streak is kept.
        </div>
      )}

      <div class="stat-grid">
        <div class="stat">
          <span class="k">Streak</span>
          <span class="v hot">{streak.current}</span>
          <span class="sub">
            {streak.unit === 'week' ? (streak.current === 1 ? 'week' : 'weeks') : streak.current === 1 ? 'day' : 'days'} · best {streak.best}
          </span>
        </div>
        <div class="stat">
          <span class="k">Hit rate</span>
          <span class="v">{stats.rate === null ? '–' : `${stats.rate}%`}</span>
          <span class="sub">{young ? `since ${dayMonth(first)}` : `last ${WEEKS} weeks`}</span>
        </div>
        <div class="stat">
          <span class="k">{third.k}</span>
          <span class="v">{third.v}</span>
          <span class="sub">{third.sub}</span>
        </div>
      </div>

      <section aria-labelledby="heat-title" class="heat-card">
        <header>
          <h2 id="heat-title" class="section-title">
            Last {WEEKS} weeks
          </h2>
          <span class="hint">{monthSpan(heatStart, today)}</span>
        </header>
        <div class="heat" role="img" aria-label={`Done on ${hit} of ${due} due days`} style={{ '--weeks': WEEKS }}>
          {labels.map((l) => (
            <span class="lab" aria-hidden="true">
              {l}
            </span>
          ))}
          {cells.map((c) => (
            <span class={c.cls} />
          ))}
        </div>
        <div class="heat-legend" aria-hidden="true">
          <span style={{ marginRight: '4px' }}>Less</span>
          <i class="sq" style={{ background: 'var(--raised)' }} />
          <i style={{ background: 'color-mix(in srgb, var(--c-lift) 35%, transparent)' }} />
          <i style={{ background: 'color-mix(in srgb, var(--c-lift) 65%, transparent)' }} />
          <i style={{ background: 'var(--c-lift)' }} />
          <span style={{ marginLeft: '4px' }}>More</span>
        </div>
      </section>

      <section aria-labelledby="notes-title" class="field">
        <h2 id="notes-title" class="section-title" style={{ padding: '0 4px' }}>
          Notes
        </h2>
        {notes.length === 0 ? (
          <p class="hint" style={{ padding: '0 4px' }}>
            No notes yet. Hold the tile on Today to add one for a day.
          </p>
        ) : (
          <div class="list notes">
            {shownNotes.map(([date, l]) => (
              <div class="note">
                <span class="note-when">
                  {shortDate(date)} · {l.skipped ? 'Skipped' : amountLabel(h, l.value)}
                </span>
                <span class="note-text">{l.note}</span>
              </div>
            ))}
          </div>
        )}
        {notes.length > shownNotes.length && (
          <button type="button" class="link-btn" onClick={() => setAllNotes(true)}>
            Show all {notes.length} notes
          </button>
        )}
      </section>

      {h.archivedAt ? (
        <button
          type="button"
          class="btn dashed"
          onClick={() => {
            restoreHabit(h.id);
            showToast(`${h.name} is back on your board`);
          }}
        >
          Put back on the board
        </button>
      ) : pause ? (
        <button
          type="button"
          class="btn dashed"
          onClick={() => {
            resumeHabit(h.id, today);
            showToast(`${h.name} is back on your board`);
          }}
        >
          Resume habit
        </button>
      ) : (
        <button
          type="button"
          class="btn dashed"
          onClick={() => {
            pauseHabit(h.id, today);
            showToast(`${h.name} paused`);
          }}
        >
          Pause habit · keeps your streak
        </button>
      )}
    </main>
  );
}
