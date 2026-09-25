import type { Habit, Log } from '../lib/types';
import type { DayState } from '../lib/habits';
import { boardHabits, firstDay, fmt, isWeekly, WEEKDAY_LETTER, weekSummary } from '../lib/habits';
import { cycleDay, useData } from '../lib/store';
import { addDays, daysBetween, rangeLabelLong, weekday, weekdayIndex, weekStartOf } from '../lib/dates';
import { href, navigate } from '../lib/router';
import { Check, ChevronLeft, ChevronRight, Minus } from '../components/Icons';

const STATE_WORDS: Record<DayState, string> = {
  done: 'done',
  partial: 'partly done',
  skipped: 'skipped',
  open: 'open',
  rest: 'rest day',
  paused: 'paused',
  before: 'before it started',
  future: 'upcoming',
};

/** "7/8" or "10m" inside a partly done day. */
function partLabel(h: Habit, log: Log | undefined): string {
  const v = log?.value ?? 0;
  return h.kind === 'timer' ? `${fmt(v)}m` : `${fmt(v)}/${fmt(h.target)}`;
}

function weekTitle(first: string, current: string): string {
  const n = Math.round(daysBetween(first, current) / 7);
  return n === 0 ? 'This week' : n === 1 ? 'Last week' : `${n} weeks ago`;
}

export function Week({ start, today }: { start?: string; today: string }) {
  const data = useData();
  const ws = data.settings.weekStart;
  const current = weekStartOf(today, ws);
  const first = start && start <= today ? weekStartOf(start, ws) : current;
  const week = weekSummary(data, first, today);
  const last = weekSummary(data, addDays(first, -7), today);
  const habits = boardHabits(data);
  const earliest = habits.reduce((min, h) => {
    const f = firstDay(h, data.logs[h.id]);
    return f < min ? f : min;
  }, today);
  const canGoBack = first > weekStartOf(earliest, ws);
  const go = (d: string) => navigate(d === current ? '/week' : href('/week', { start: d }), { replace: true });
  const letters = week.days.map((d) => WEEKDAY_LETTER[weekdayIndex(d)]);

  return (
    <main class="screen with-nav" aria-labelledby="week-title">
      <header class="page-head center">
        <div>
          <span class="eyebrow">{rangeLabelLong(week.days[0], week.days[6], today)}</span>
          <h1 id="week-title" class="page-title">
            {weekTitle(first, current)}
          </h1>
        </div>
        <div class="week-nav">
          <button type="button" class="round-btn" aria-label="Previous week" disabled={!canGoBack} onClick={() => go(addDays(first, -7))}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" class="round-btn" aria-label="Next week" disabled={first >= current} onClick={() => go(addDays(first, 7))}>
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {habits.length === 0 ? (
        <section class="empty" aria-labelledby="week-empty">
          <h2 id="week-empty" class="empty-title">
            No habits yet
          </h2>
          <p class="body-text">Once you add a habit, each day of the week shows up here, and you can tap a day to change it.</p>
          <a class="btn primary" href="#/new">
            New habit
          </a>
        </section>
      ) : (
        <>
          <section aria-label="Weekly score" class="score-card">
            <span class="pct">{week.score === null ? '–' : `${week.score}%`}</span>
            <div>
              <strong>
                {week.done} of {week.due} check-ins
              </strong>
              <span>
                {last.score !== null && last.rows.length > 0 ? `Last week ${last.score}% · s` : 'S'}kipped days don't count against you
              </span>
            </div>
          </section>

          <div class="week-heads" aria-hidden="true">
            {letters.map((l, i) => (
              <span class={week.days[i] === today ? 'today' : week.days[i] > today ? 'later' : ''}>{l}</span>
            ))}
          </div>

          <div class="week-rows">
            {week.rows.length === 0 && <p class="notice">None of your habits had started yet in this week.</p>}
            {week.rows.map((r) => {
              const h = r.habit;
              return (
                <section class={`week-row c-${h.color}`} aria-label={h.name} key={h.id}>
                  <a class="week-row-head" href={`#/habit/${h.id}`}>
                    <span class="week-row-name">
                      <span class="dot" aria-hidden="true" />
                      <span>{h.name}</span>
                    </span>
                    <span class="week-row-count">
                      {r.done} / {r.due}
                      {isWeekly(h) ? ' this week' : ''}
                    </span>
                  </a>
                  <div role="group" aria-label={`${h.name} by day`} class="week-cells">
                    {r.days.map((c) => {
                      const state = c.state === 'open' && isWeekly(h) ? 'rest day' : STATE_WORDS[c.state];
                      const part = c.state === 'partial' ? partLabel(h, c.log) : '';
                      return (
                        <button
                          type="button"
                          class={`cell ${c.state}`}
                          disabled={c.state === 'future'}
                          aria-label={`${h.name}, ${weekday(c.date)}: ${state}${part ? `, ${part}` : ''}`}
                          onClick={() => cycleDay(h, c.date)}
                        >
                          {c.state === 'done' && <Check size={16} strokeWidth={3} />}
                          {c.state === 'skipped' && <Minus size={16} strokeWidth={2.6} />}
                          {part && <span class="cell-part">{part}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div class="legend">
            <span>
              <i class="swatch-sm" style={{ background: 'var(--ink)' }} />
              Done
            </span>
            <span>
              <i class="swatch-sm" style={{ border: '1.5px dashed var(--muted)' }} />
              Skipped
            </span>
            <span>
              <i class="swatch-sm" style={{ background: 'var(--raised)' }} />
              Open
            </span>
            <span>Tap a day to change it</span>
          </div>
        </>
      )}
    </main>
  );
}
