import { useEffect, useRef } from 'preact/hooks';
import type { Tile } from '../lib/habits';
import type { BoardLayout } from '../lib/types';
import { motionOn } from '../lib/motion';
import { neighboursAt } from '../lib/order';
import { TileView } from './Tile';

/** How long to hold a tile before it lifts (then: let go for its options, or drag it somewhere else). */
const HOLD_MS = 450;
/** Moving further than this before the tile lifts is a scroll, not a hold. */
const SLOP = 10;

export interface Move {
  id: string;
  after?: string;
  before?: string;
  /** Where it ended up in this group of tiles, from 0. */
  index: number;
}

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Press {
  id: string;
  el: HTMLElement;
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  phase: 'press' | 'lifted' | 'drag';
  timer: ReturnType<typeof setTimeout>;
  /** While dragging: the tiles, where each sat, the order shown now and where the dragged one is in it. */
  items?: HTMLElement[];
  ids?: string[];
  slots?: Slot[];
  order?: string[];
  index?: number;
  grab?: { x: number; y: number };
  frame?: number;
}

/**
 * A group of tiles you can rearrange: hold one until it lifts, then drag it;
 * let go without moving to get its options instead. With a keyboard,
 * Alt+Up and Alt+Down move the focused tile and Shift+Enter opens its
 * options; a right-click opens them too. Tapping still logs.
 */
export function Board({
  tiles,
  layout,
  label,
  quiet,
  meta,
  onTap,
  onOptions,
  onMove,
}: {
  tiles: Tile[];
  layout: BoardLayout;
  label: string;
  quiet?: boolean;
  meta?: (t: Tile) => string | undefined;
  onTap: (t: Tile) => void;
  onOptions: (id: string) => void;
  onMove: (move: Move) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const eatClick = useRef(false);
  const handlers = useRef({ onOptions, onMove });
  handlers.current = { onOptions, onMove };

  useEffect(() => {
    // The tiles rise in when the screen opens; after that, moving one around shouldn't replay it.
    const settle = setTimeout(() => box.current?.classList.add('settled'), 700);
    // A lifted tile follows the finger instead of the page scrolling.
    const noScroll = (e: TouchEvent) => {
      if (press.current && press.current.phase !== 'press' && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', noScroll, { passive: false });
    return () => {
      clearTimeout(settle);
      document.removeEventListener('touchmove', noScroll);
      if (press.current) finish(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tileOf = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest<HTMLElement>('[data-id]');
    return el && el.parentElement === box.current ? el : null;
  };

  function lift() {
    const p = press.current;
    if (!p || p.phase !== 'press') return;
    p.phase = 'lifted';
    p.x0 = p.x;
    p.y0 = p.y;
    p.el.classList.add('lifted');
    p.el.style.transform = 'scale(1.04)';
    navigator.vibrate?.(10);
  }

  function startDrag(p: Press) {
    const container = box.current!;
    const items = [...container.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.id);
    p.items = items;
    p.ids = items.map((i) => i.dataset.id!);
    p.order = [...p.ids];
    p.index = p.ids.indexOf(p.id);
    p.slots = items.map((i) => ({ x: i.offsetLeft, y: i.offsetTop, w: i.offsetWidth, h: i.offsetHeight }));
    const r = p.el.getBoundingClientRect();
    p.grab = { x: p.x - r.left, y: p.y - r.top };
    p.phase = 'drag';
    p.el.style.transition = 'none';
    p.el.classList.add('dragging');
    container.classList.add('sorting');
    const scroll = () => {
      // Near the top or the bottom bar, the page scrolls along.
      const top = 90;
      const bottom = window.innerHeight - 140;
      const speed = p.y < top ? -((top - p.y) / top) * 16 : p.y > bottom ? ((p.y - bottom) / 140) * 16 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        follow(p);
      }
      p.frame = requestAnimationFrame(scroll);
    };
    p.frame = requestAnimationFrame(scroll);
    follow(p);
  }

  /** Put the dragged tile under the finger, and the others where they'd go. */
  function follow(p: Press) {
    const container = box.current!;
    const rect = container.getBoundingClientRect();
    const x = p.x - rect.left;
    const y = p.y - rect.top;
    let best = p.index!;
    let bestDistance = Infinity;
    p.slots!.forEach((s, i) => {
      const inside = x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
      const d = inside ? -1 : Math.hypot(x - (s.x + s.w / 2), y - (s.y + s.h / 2));
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    if (best !== p.index) rearrange(p, best);
    p.el.style.transform = `translate(${x - p.grab!.x - p.el.offsetLeft}px, ${y - p.grab!.y - p.el.offsetTop}px) scale(1.04)`;
  }

  function rearrange(p: Press, index: number) {
    const order = p.order!.filter((id) => id !== p.id);
    order.splice(index, 0, p.id);
    const animate = motionOn();
    const others = p.items!.filter((el) => el !== p.el);
    const before = animate ? others.map((el) => el.getBoundingClientRect()) : [];
    p.items!.forEach((el) => (el.style.order = String(order.indexOf(el.dataset.id!))));
    if (animate) {
      others.forEach((el, i) => {
        const now = el.getBoundingClientRect();
        const dx = before[i].left - now.left;
        const dy = before[i].top - now.top;
        if (!dx && !dy) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)';
          el.style.transform = '';
        });
      });
    }
    p.order = order;
    p.index = index;
  }

  /** Let go: drop it where it is (or put everything back). */
  function finish(drop: boolean) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.frame) cancelAnimationFrame(p.frame);
    const reset = () => {
      p.el.classList.remove('lifted', 'dragging');
      box.current?.classList.remove('sorting');
      for (const el of p.items ?? [p.el]) {
        el.style.order = '';
        el.style.transform = '';
        el.style.transition = '';
      }
    };
    if (p.phase !== 'drag') return reset();
    const place = drop ? neighboursAt(p.ids!, p.id, p.index!) : undefined;
    const done = () => {
      reset();
      if (place) handlers.current.onMove({ id: p.id, ...place, index: p.index! });
    };
    if (!motionOn()) return done();
    // Settle into its new place first.
    p.el.style.transition = 'transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)';
    p.el.style.transform = '';
    setTimeout(done, 160);
  }

  const moveBy = (el: HTMLElement, step: -1 | 1) => {
    const ids = [...box.current!.children].map((c) => (c as HTMLElement).dataset.id).filter(Boolean) as string[];
    const id = el.dataset.id!;
    const index = ids.indexOf(id) + step;
    if (index < 0 || index >= ids.length) return;
    const place = neighboursAt(ids, id, index);
    if (!place) return;
    handlers.current.onMove({ id, ...place, index });
    // The tiles are redrawn in their new order; keep the keyboard on this one.
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus());
  };

  return (
    <div
      ref={box}
      class={`tiles ${layout}`}
      role="group"
      aria-label={label}
      onPointerDown={(e) => {
        eatClick.current = false;
        if (e.button !== 0 || !e.isPrimary) return;
        const el = tileOf(e.target);
        if (!el) return;
        if (press.current) finish(false);
        press.current = {
          id: el.dataset.id!,
          el,
          pointerId: e.pointerId,
          touch: e.pointerType !== 'mouse',
          x0: e.clientX,
          y0: e.clientY,
          x: e.clientX,
          y: e.clientY,
          phase: 'press',
          timer: setTimeout(lift, HOLD_MS),
        };
        if (e.pointerType === 'mouse') el.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || e.pointerId !== p.pointerId) return;
        p.x = e.clientX;
        p.y = e.clientY;
        const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
        if (p.phase === 'press') {
          if (moved > SLOP) finish(false);
        } else if (p.phase === 'lifted') {
          if (moved > 6) startDrag(p);
        } else {
          follow(p);
        }
      }}
      onPointerUp={(e) => {
        const p = press.current;
        if (!p || e.pointerId !== p.pointerId) return;
        if (p.phase === 'press') return finish(false);
        eatClick.current = true;
        if (p.phase === 'lifted') {
          finish(false);
          handlers.current.onOptions(p.id);
        } else finish(true);
      }}
      onPointerCancel={() => finish(false)}
      onClickCapture={(e) => {
        if (!eatClick.current) return;
        eatClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        const el = tileOf(e.target);
        if (!el) return;
        e.preventDefault();
        // A long touch is handled above (Android also calls it a context menu).
        if (press.current?.touch) return;
        if (press.current) finish(false);
        handlers.current.onOptions(el.dataset.id!);
      }}
      onKeyDown={(e) => {
        const el = tileOf(e.target);
        if (!el) return;
        if ((e.key === 'Enter' || e.key === 'F10') && e.shiftKey) {
          e.preventDefault();
          handlers.current.onOptions(el.dataset.id!);
        } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          moveBy(el, e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      {tiles.map((t) => (
        <TileView key={t.habit.id} tile={t} layout={layout} quiet={quiet} meta={meta?.(t)} onTap={() => onTap(t)} />
      ))}
    </div>
  );
}
