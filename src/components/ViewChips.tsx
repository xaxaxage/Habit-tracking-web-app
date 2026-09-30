import { sameView, viewLabel, viewParam, type View } from '../lib/views';

/** The views above a board: All, then times of day, then groups (wrapping onto more lines when there are many). */
export function ViewChips({
  views,
  current,
  count,
  onPick,
}: {
  views: View[];
  current: View;
  /** Done and due in a view, when worth showing. */
  count?: (v: View) => { done: number; total: number } | undefined;
  onPick: (v: View) => void;
}) {
  return (
    <div class="view-chips" role="group" aria-label="Show">
      {views.map((v) => {
        const c = v.kind === 'all' ? undefined : count?.(v);
        return (
          <button
            type="button"
            class="chip view-chip"
            aria-pressed={sameView(v, current)}
            aria-label={c && c.total > 0 ? `${viewLabel(v)}, ${c.done} of ${c.total} done` : undefined}
            key={viewParam(v) ?? 'all'}
            onClick={() => onPick(v)}
          >
            <span class="chip-text">{viewLabel(v)}</span>
            {c && c.total > 0 && (
              <span class="chip-count">
                {c.done}/{c.total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
