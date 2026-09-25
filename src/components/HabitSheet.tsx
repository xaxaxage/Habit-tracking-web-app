import { useState } from 'preact/hooks';
import type { Habit } from '../lib/types';
import { amountLabel, fmt, isDone, isWeekly, streakOf, weekProgress } from '../lib/habits';
import { getData, getLog, setNote, setValue, toggleDone, toggleSkip, useData } from '../lib/store';
import { shortDate, shortWeekday, weekStartOf } from '../lib/dates';
import { href, navigate } from '../lib/router';
import { Sheet } from './Common';
import { Bars, Calendar, Check, HabitGlyph, Minus, Plus, Skip } from './Icons';

/** "3 of 4 this week · done today" */
function statusLine(h: Habit, date: string, today: string): string {
  const data = getData();
  const logs = data.logs[h.id];
  const log = logs?.[date];
  const when = date === today ? 'today' : `on ${shortWeekday(date)}`;
  let state = `not done ${date === today ? 'yet' : when}`;
  if (isDone(h, log)) state = `done ${when}`;
  else if (log?.skipped) state = `skipped ${when}`;
  else if (log && log.value > 0) state = `${amountLabel(h, log.value)} of ${amountLabel(h, h.target)} ${when}`;
  if (isWeekly(h)) {
    const w = weekProgress(h, logs, date, today, data.settings.weekStart);
    return `${w.done} of ${h.schedule.times} this week · ${state}`;
  }
  const streak = streakOf(h, logs, today, data.settings.weekStart).current;
  return streak > 0 ? `${streak}-day streak · ${state}` : state.charAt(0).toUpperCase() + state.slice(1);
}

/** Options for one habit on one day: done, skip, an exact amount, a note, and links to the week and its history. */
export function HabitSheet({ habit, date, today, onClose }: { habit: Habit; date: string; today: string; onClose: () => void }) {
  useData();
  const h = habit;
  const log = getLog(h.id, date);
  const done = isDone(h, log);
  const skipped = !!log?.skipped;
  const isToday = date === today;
  const value = log && !log.skipped ? log.value : 0;
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const titleId = `sheet-title-${h.id}`;

  const commitValue = (text: string) => {
    setDraftValue(null);
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) setValue(h, date, Math.min(n, 1_000_000));
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} class={`c-${h.color}`} initialFocus=".action">
      <div class="sheet-head">
        <span class="sheet-icon" aria-hidden="true">
          <HabitGlyph icon={h.icon} size={26} />
        </span>
        <div>
          <h2 id={titleId} class="sheet-title">
            {h.name}
          </h2>
          <span class="sheet-status">{statusLine(h, date, today)}</span>
        </div>
      </div>

      <div class="action-grid">
        <button type="button" class={`action${done ? ' on' : ''}`} aria-pressed={done} onClick={() => toggleDone(h, date)}>
          <Check size={22} strokeWidth={2.6} />
          <span>{done ? (isToday ? 'Done today' : 'Done') : 'Mark done'}</span>
        </button>
        <button type="button" class={`action skip${skipped ? ' on' : ''}`} aria-pressed={skipped} onClick={() => toggleSkip(h, date)}>
          <Skip size={22} strokeWidth={2.4} />
          <span class="action-text">
            <span>{skipped ? 'Skipped' : isToday ? 'Skip today' : 'Skip this day'}</span>
            <span class="action-sub">Streak stays</span>
          </span>
        </button>
        <a
          class="action"
          href={`#${href('/week', { start: weekStartOf(date, getData().settings.weekStart) })}`}
          onClick={(e) => {
            e.preventDefault();
            onClose();
            navigate(href('/week', { start: weekStartOf(date, getData().settings.weekStart) }));
          }}
        >
          <Calendar size={22} />
          Log another day
        </a>
        <a
          class="action"
          href={`#/habit/${h.id}`}
          onClick={(e) => {
            e.preventDefault();
            onClose();
            navigate(`/habit/${h.id}`);
          }}
        >
          <Bars size={22} />
          History &amp; stats
        </a>
      </div>

      {h.kind !== 'check' && (
        <div class="field">
          <label class="field-label" for={`amount-${h.id}`}>
            {h.kind === 'timer' ? 'Minutes' : h.unit ? h.unit.charAt(0).toUpperCase() + h.unit.slice(1) : 'Amount'}{' '}
            <span class="stepper-unit">· goal {fmt(h.target)}</span>
          </label>
          <div class="stepper">
            <button
              type="button"
              class="round-btn"
              aria-label={`${fmt(h.step)} less`}
              disabled={value <= 0}
              onClick={() => setValue(h, date, Math.max(0, value - h.step))}
            >
              <Minus size={22} />
            </button>
            <input
              id={`amount-${h.id}`}
              class="input num"
              inputMode="decimal"
              autoComplete="off"
              value={draftValue ?? fmt(value)}
              onInput={(e) => setDraftValue((e.target as HTMLInputElement).value)}
              onBlur={(e) => commitValue((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && commitValue((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="round-btn" aria-label={`${fmt(h.step)} more`} onClick={() => setValue(h, date, value + h.step)}>
              <Plus size={22} />
            </button>
          </div>
        </div>
      )}

      <div class="field">
        <label for={`note-${h.id}`} class="field-label">
          {isToday ? 'Note for today' : `Note for ${shortDate(date)}`}
        </label>
        <textarea
          id={`note-${h.id}`}
          class="textarea"
          rows={2}
          maxLength={500}
          placeholder="How did it go?"
          value={log?.note ?? ''}
          onInput={(e) => setNote(h, date, (e.target as HTMLTextAreaElement).value)}
        />
      </div>

      <button type="button" class="btn light" onClick={onClose}>
        Save
      </button>
    </Sheet>
  );
}
