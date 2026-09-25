import type { Tile } from '../lib/habits';
import { fmt, isWeekly, minutesLabel, TIME_LABEL } from '../lib/habits';
import { Check, Flame, HabitGlyph } from './Icons';
import { useLongPress } from './Common';

/** The small line under a habit's name on its tile. */
export function tileMeta(t: Tile): string {
  const h = t.habit;
  const v = t.log && !t.log.skipped ? t.log.value : 0;
  if (t.status === 'skipped') return 'Skipped';
  if (isWeekly(h)) return `${t.week!.done} of ${h.schedule.times} this week`;
  if (h.kind === 'count') return `${fmt(v)} / ${fmt(h.target)}${h.unit ? ` ${h.unit}` : ''}`;
  if (h.kind === 'timer') {
    const full = t.status === 'done';
    const amount = h.target >= 60 ? `${minutesLabel(v)} / ${minutesLabel(h.target)}` : `${v} / ${h.target} min`;
    return full ? amount : `${amount} · +${h.step}`;
  }
  if (t.status === 'done') return 'Done';
  return h.time !== 'anytime' ? TIME_LABEL[h.time] : 'Tap when done';
}

/** What a screen reader says for a tile, and what a tap will do. */
export function tileLabel(t: Tile): string {
  const h = t.habit;
  const full = t.status === 'done';
  const v = t.log && !t.log.skipped ? t.log.value : 0;
  const streak = t.streak.current > 0 ? `, ${t.streak.current}-${t.streak.unit} streak` : '';
  let text: string;
  if (t.status === 'skipped') text = `${h.name}, skipped${streak}. Tap to log it after all`;
  else if (isWeekly(h)) text = `${h.name}, ${tileMeta(t)}${full ? ', done today. Tap to undo' : '. Tap to mark done today'}${streak}`;
  else if (h.kind === 'count') text = `${h.name}, ${fmt(v)} of ${fmt(h.target)} ${h.unit}${streak}. ${full ? 'Tap to reset' : h.step === 1 ? 'Tap to add one' : `Tap to add ${fmt(h.step)}`}`;
  else if (h.kind === 'timer') text = `${h.name}, ${v} of ${h.target} minutes${streak}. ${full ? 'Tap to reset' : `Tap to add ${h.step} minutes`}`;
  else text = `${h.name}${full ? `, done${streak}. Tap to undo` : `, not done${streak}. Tap to complete`}`;
  return text;
}

export function TileView({
  tile,
  meta,
  onTap,
  onOptions,
  quiet,
}: {
  tile: Tile;
  meta?: string;
  onTap: () => void;
  onOptions: () => void;
  quiet?: boolean;
}) {
  const press = useLongPress(onOptions);
  const full = tile.status === 'done';
  const fill = full ? 1 : tile.status === 'skipped' ? 0 : tile.progress;
  const cls = ['tile', `c-${tile.habit.color}`, full && 'full', fill >= 0.7 && 'high', tile.status === 'skipped' && 'skipped', quiet && 'quiet']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      class={cls}
      aria-label={tileLabel(tile)}
      aria-describedby="board-hint"
      aria-keyshortcuts="Shift+Enter"
      onClick={onTap}
      {...press}
    >
      <span class="fill" aria-hidden="true" style={{ height: `${Math.round(fill * 100)}%` }} />
      <span class="tile-top">
        <HabitGlyph icon={tile.habit.icon} size={28} class="tile-icon" />
        {full ? (
          <span class="tile-badge">
            <Check size={16} strokeWidth={3} />
          </span>
        ) : (
          tile.streak.current > 0 && (
            <span class="streak">
              <Flame size={13} strokeWidth={2.4} />
              {tile.streak.current}
            </span>
          )
        )}
      </span>
      <span class="tile-text">
        <span class="tile-name">{tile.habit.name}</span>
        <span class="tile-meta">{meta ?? tileMeta(tile)}</span>
      </span>
    </button>
  );
}
