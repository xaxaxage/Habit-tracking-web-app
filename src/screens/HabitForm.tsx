import { useMemo, useState } from 'preact/hooks';
import type { Habit, HabitColor, HabitKind, Schedule, TimeOfDay } from '../lib/types';
import { HABIT_COLORS, TIMES_OF_DAY } from '../lib/types';
import { autoColor, defaultStep, parseHabit, type Draft } from '../lib/parse';
import { fmt, goalLabel, KIND_LABEL, repeatLabel, TIME_LABEL, WEEKDAY_SHORT } from '../lib/habits';
import { guessIcon, HABIT_ICONS } from '../lib/icons';
import { archiveHabit, createHabit, deleteHabit, MAX_NAME, restoreHabit, updateHabit } from '../lib/store';
import { goBack, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { Sheet } from '../components/Common';
import { ChevronLeft, Close, HabitGlyph } from '../components/Icons';
import { EXAMPLES } from './Today';

type FieldKey = 'name' | 'kind' | 'goal' | 'repeat' | 'time' | 'icon';

const COLOR_NAMES: Record<HabitColor, string> = {
  teal: 'Dark teal',
  violet: 'Crimson violet',
  crimson: 'Deep crimson',
  orange: 'Princeton orange',
  ember: 'Spanish orange',
};

const FIELD_TITLES: Record<FieldKey, string> = {
  name: 'Name',
  kind: 'Track as',
  goal: 'Goal',
  repeat: 'Repeat',
  time: 'Time of day',
  icon: 'Icon',
};

interface Form extends Draft {
  color: HabitColor;
}

function fromHabit(h: Habit): Form {
  return { name: h.name, kind: h.kind, target: h.target, unit: h.unit, schedule: h.schedule, time: h.time, icon: h.icon, color: h.color };
}

/** New habit from one sentence, or editing one; every detail can be changed with a tap. */
export function HabitForm({ habit, initialText = '' }: { habit?: Habit; initialText?: string }) {
  const editing = !!habit;
  const [text, setText] = useState(initialText);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const [field, setField] = useState<FieldKey | null>(null);

  const parsed = useMemo(() => parseHabit(text), [text]);
  const base: Form = habit ? fromHabit(habit) : { ...parsed, color: autoColor(parsed.name) };
  const form: Form = { ...base, ...edits };
  if (!habit && !edits.color) form.color = autoColor(form.name);
  // A name typed by hand suggests its own icon, until one is picked.
  if (!habit && !edits.icon && edits.name !== undefined) form.icon = guessIcon(form.name, form.kind, form.unit);
  const set = (patch: Partial<Form>) => setEdits({ ...edits, ...patch });

  const fields: { key: FieldKey; value: string; plain: boolean }[] = [
    { key: 'name', value: form.name, plain: !text && !editing && !edits.name },
    { key: 'kind', value: KIND_LABEL[form.kind], plain: false },
    { key: 'goal', value: goalLabel(form), plain: form.kind === 'check' },
    { key: 'repeat', value: repeatLabel(form.schedule), plain: false },
    { key: 'time', value: TIME_LABEL[form.time], plain: form.time === 'anytime' },
    { key: 'icon', value: HABIT_ICONS.find((i) => i.id === form.icon)?.label ?? 'Check', plain: false },
  ];

  const save = () => {
    const input = { ...form, name: form.name.trim().slice(0, MAX_NAME) || 'New habit' };
    if (habit) {
      const changedGoal = input.kind !== habit.kind || input.target !== habit.target;
      updateHabit(habit.id, { ...input, ...(changedGoal ? {} : { step: habit.step }) });
      showToast('Changes saved');
      goBack(`/habit/${habit.id}`);
    } else {
      createHabit(input);
      showToast(`${input.name} is on your board`);
      navigate('/', { replace: true });
    }
  };

  const preview = form.kind === 'check' ? 'Tap when done' : `0 / ${goalLabel(form)}`;

  return (
    <main class="screen gap-18 with-footer" aria-labelledby="form-title">
      <header class="topbar">
        <button type="button" class="round-btn lg" aria-label={editing ? 'Back' : 'Close'} onClick={() => goBack(habit ? `/habit/${habit.id}` : '/')}>
          {editing ? <ChevronLeft size={20} /> : <Close size={20} />}
        </button>
        <h1 id="form-title" class="topbar-title">
          {editing ? 'Edit habit' : 'New habit'}
        </h1>
        <span class="spacer-44" />
      </header>

      {!editing && (
        <div class="field" style={{ gap: '10px' }}>
          <label for="sentence" class="ask">
            What do you want to do, and how often?
          </label>
          <textarea
            id="sentence"
            class="sentence"
            rows={2}
            maxLength={160}
            placeholder="e.g. Read 20 min every evening"
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
          <div role="group" aria-label="Examples" class="chips">
            {EXAMPLES.map((ex) => (
              <button
                type="button"
                class="chip"
                onClick={() => {
                  setText(ex);
                  setEdits({});
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <section aria-labelledby="fields-title" class="field" style={{ gap: '10px' }}>
        <h2 id="fields-title" class="section-label">
          {editing ? 'Details · tap to change' : 'Understood as · tap to change'}
        </h2>
        <div class="fields">
          {fields.map((f) => (
            <button type="button" class="field-btn" aria-label={`${FIELD_TITLES[f.key]}: ${f.value}. Change`} onClick={() => setField(f.key)}>
              <span class="k">{FIELD_TITLES[f.key]}</span>
              <span class={`v${f.plain ? ' default' : ''}`}>{f.value}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="preview-title" class="field" style={{ gap: '10px' }}>
        <h2 id="preview-title" class="section-label">
          On your board
        </h2>
        <div class="preview">
          <div class={`tile c-${form.color}`} aria-hidden="true">
            <span class="fill" style={{ height: form.kind === 'check' ? '0%' : '30%' }} />
            <span class="tile-top">
              <HabitGlyph icon={form.icon} size={26} class="tile-icon" />
            </span>
            <span class="tile-text">
              <span class="tile-name">{form.name || 'New habit'}</span>
              <span class="tile-meta">
                {preview} · {repeatLabel(form.schedule).toLowerCase()}
              </span>
            </span>
          </div>
          <div role="group" aria-label="Color" class="swatches">
            {HABIT_COLORS.map((c) => (
              <button
                type="button"
                class={`swatch c-${c}`}
                aria-pressed={form.color === c}
                aria-label={COLOR_NAMES[c]}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </div>
      </section>

      {habit && (
        <section aria-label="Archive or delete" class="field" style={{ gap: '8px' }}>
          {habit.archivedAt ? (
            <button
              type="button"
              class="btn dashed"
              onClick={() => {
                restoreHabit(habit.id);
                showToast(`${habit.name} is back on your board`);
              }}
            >
              Put back on the board
            </button>
          ) : (
            <button
              type="button"
              class="btn dashed"
              onClick={() => {
                archiveHabit(habit.id);
                showToast(`${habit.name} archived. Find it in Settings.`);
                navigate('/', { replace: true });
              }}
            >
              Archive habit · keeps its history
            </button>
          )}
          <button
            type="button"
            class="link-btn danger"
            onClick={() => {
              if (!confirm(`Delete "${habit.name}" and all its check-ins and notes? This can't be undone.`)) return;
              deleteHabit(habit.id);
              showToast(`${habit.name} deleted`);
              navigate('/', { replace: true });
            }}
          >
            Delete habit
          </button>
        </section>
      )}

      <div class="footer-cta">
        <button type="button" class="btn primary" style={{ width: '100%' }} onClick={save}>
          {editing ? 'Save changes' : 'Add to my board'}
        </button>
      </div>

      {field && <FieldSheet field={field} form={form} onChange={set} onClose={() => setField(null)} />}
    </main>
  );
}

function FieldSheet({
  field,
  form,
  onChange,
  onClose,
}: {
  field: FieldKey;
  form: Form;
  onChange: (patch: Partial<Form>) => void;
  onClose: () => void;
}) {
  const titleId = 'field-sheet-title';
  const [goalText, setGoalText] = useState(form.kind === 'check' ? '' : fmt(form.target));
  const setKind = (kind: HabitKind) => {
    if (kind === form.kind) return;
    const target = kind === 'check' ? 1 : kind === 'timer' ? 20 : form.kind === 'count' ? form.target : 8;
    const unit = kind === 'timer' ? 'min' : kind === 'count' ? (form.unit && form.unit !== 'min' ? form.unit : 'times') : '';
    setGoalText(kind === 'check' ? '' : fmt(target));
    onChange({ kind, target, unit });
  };
  const setGoal = (value: string) => {
    setGoalText(value);
    const n = parseFloat(value.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) onChange({ target: form.kind === 'timer' ? Math.min(1440, Math.round(n)) : Math.min(1_000_000, n) });
  };
  const days = form.schedule.type === 'days' ? form.schedule.days : [0, 1, 2, 3, 4, 5, 6];
  const setSchedule = (schedule: Schedule) => onChange({ schedule });
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    if (next.length === 0) return;
    setSchedule(next.length === 7 ? { type: 'daily' } : { type: 'days', days: next });
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} class={`c-${form.color}`}>
      <h2 id={titleId} class="sheet-title">
        {FIELD_TITLES[field === 'goal' ? 'goal' : field]}
      </h2>

      {field === 'name' && (
        <div class="field">
          <label for="habit-name" class="field-label">
            What you'll see on the tile
          </label>
          <input
            id="habit-name"
            class="input"
            maxLength={MAX_NAME}
            autoComplete="off"
            value={form.name}
            onInput={(e) => onChange({ name: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => e.key === 'Enter' && onClose()}
          />
        </div>
      )}

      {(field === 'kind' || field === 'goal') && (
        <>
          <div role="radiogroup" aria-label="Track as" class="options" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {(['check', 'count', 'timer'] as HabitKind[]).map((k) => (
              <button type="button" role="radio" aria-checked={form.kind === k} class="option" onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {form.kind === 'check' ? (
            <p class="hint">Yes / No habits are done with one tap. Pick Count or Timer to set a goal for the day.</p>
          ) : (
            <div class="row-2">
              <div class="field">
                <label for="goal-amount" class="field-label">
                  {form.kind === 'timer' ? 'Minutes a day' : 'Goal a day'}
                </label>
                <input id="goal-amount" class="input num" inputMode="decimal" autoComplete="off" value={goalText} onInput={(e) => setGoal((e.target as HTMLInputElement).value)} />
              </div>
              {form.kind === 'count' && (
                <div class="field">
                  <label for="goal-unit" class="field-label">
                    Unit
                  </label>
                  <input
                    id="goal-unit"
                    class="input"
                    maxLength={20}
                    autoComplete="off"
                    placeholder="glasses, pages…"
                    value={form.unit}
                    onInput={(e) => onChange({ unit: (e.target as HTMLInputElement).value })}
                  />
                </div>
              )}
            </div>
          )}
          {form.kind !== 'check' && (
            <p class="hint">
              Each tap on the tile adds {form.kind === 'timer' ? `${defaultStep('timer', form.target)} min` : fmt(defaultStep('count', form.target))}.
            </p>
          )}
        </>
      )}

      {field === 'repeat' && (
        <>
          <div role="radiogroup" aria-label="Repeat" class="options">
            {[
              { label: 'Every day', s: { type: 'daily' } as Schedule },
              { label: 'Weekdays', s: { type: 'days', days: [0, 1, 2, 3, 4] } as Schedule },
              { label: 'Weekends', s: { type: 'days', days: [5, 6] } as Schedule },
              { label: 'Times a week', s: { type: 'weekly', times: form.schedule.type === 'weekly' ? form.schedule.times : 3 } as Schedule },
            ].map((o) => {
              const on =
                o.s.type === 'weekly' ? form.schedule.type === 'weekly' : repeatLabel(o.s) === repeatLabel(form.schedule);
              return (
                <button type="button" role="radio" aria-checked={on} class="option" onClick={() => setSchedule(o.s)}>
                  {o.label}
                </button>
              );
            })}
          </div>
          {form.schedule.type === 'weekly' ? (
            <div class="field">
              <span class="field-label" id="times-label">
                Times a week
              </span>
              <div role="radiogroup" aria-labelledby="times-label" class="options days">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.schedule.type === 'weekly' && form.schedule.times === n}
                    class="option"
                    onClick={() => setSchedule({ type: 'weekly', times: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p class="hint">Any days you like; a skipped day lowers that week's goal by one.</p>
            </div>
          ) : (
            <div class="field">
              <span class="field-label" id="days-label">
                On these days
              </span>
              <div role="group" aria-labelledby="days-label" class="options days">
                {WEEKDAY_SHORT.map((label, d) => (
                  <button type="button" aria-pressed={days.includes(d)} class="option" onClick={() => toggleDay(d)}>
                    {label.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {field === 'time' && (
        <div role="radiogroup" aria-label="Time of day" class="options">
          {TIMES_OF_DAY.map((t: TimeOfDay) => (
            <button type="button" role="radio" aria-checked={form.time === t} class="option" onClick={() => onChange({ time: t })}>
              {TIME_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {field === 'icon' && (
        <div role="radiogroup" aria-label="Icon" class="icon-grid">
          {HABIT_ICONS.map((i) => (
            <button type="button" role="radio" aria-checked={form.icon === i.id} aria-label={i.label} class="option" style={{ minHeight: '52px' }} onClick={() => onChange({ icon: i.id })}>
              <HabitGlyph icon={i.id} size={24} />
            </button>
          ))}
        </div>
      )}

      <button type="button" class="btn light" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
