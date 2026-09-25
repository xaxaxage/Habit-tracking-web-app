import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { dismissToast, useToast } from '../lib/toast';
import { motionOn } from '../lib/motion';
import { Calendar, Gear, Grid, Plus } from './Icons';

export type Tab = 'today' | 'week' | 'settings';

export function BottomNav({ current }: { current: Tab | null }) {
  return (
    <nav aria-label="Main" class="nav">
      <div class="nav-inner">
        <div class="nav-pill">
          <a href="#/" class="nav-link" aria-current={current === 'today' ? 'page' : undefined}>
            <Grid size={20} />
            <span class="label">Today</span>
          </a>
          <a href="#/week" class="nav-link" aria-current={current === 'week' ? 'page' : undefined}>
            <Calendar size={20} />
            <span class="label">Week</span>
          </a>
          <a href="#/settings" class="nav-link icon-only" aria-label="Settings" aria-current={current === 'settings' ? 'page' : undefined}>
            <Gear size={20} />
          </a>
        </div>
        <a href="#/new" class="fab" aria-label="New habit">
          <Plus size={26} strokeWidth={2.6} />
        </a>
      </div>
    </nav>
  );
}

export function ToastHost({ low }: { low: boolean }) {
  const toast = useToast();
  if (!toast) return null;
  return (
    <div class={`toast-wrap${low ? ' low' : ''}`} role="status" aria-live="polite">
      <div class={`toast${toast.action ? '' : ' no-action'}`} key={toast.id}>
        <span>{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.run();
              dismissToast();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A sheet that slides up from the bottom, over a dimmed screen. It keeps
 * keyboard focus inside while open, closes with Escape or a tap outside, and
 * gives focus back to whatever opened it.
 */
export function Sheet({
  labelledBy,
  onClose,
  class: cls = '',
  initialFocus,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  class?: string;
  /** Selector for the control to focus first (default: the first one). */
  initialFocus?: string;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useSwipeDown(ref, scrim, () => close.current());

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const app = document.getElementById('app');
    app?.setAttribute('inert', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const box = ref.current!;
    const first = (initialFocus && box.querySelector<HTMLElement>(initialFocus)) || box.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      } else if (e.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      app?.removeAttribute('inert');
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      <div ref={scrim} class="scrim" onClick={() => close.current()} />
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} class={`sheet ${cls}`}>
        <span class="grabber-zone" aria-hidden="true">
          <span class="grabber" />
        </span>
        {children}
      </section>
    </>,
    document.body,
  );
}

/**
 * Swipe a sheet down to close it, like on iPhone: it follows the finger from
 * the top, closes past a quarter of its height (or on a quick flick) and
 * springs back otherwise. Swiping starts only when the sheet is scrolled to
 * the top (so its content still scrolls) and not from inside a text field
 * (so text can still be selected); the grabber at the top always works, with
 * a mouse too.
 */
function useSwipeDown(box: { current: HTMLElement | null }, scrim: { current: HTMLElement | null }, onClose: () => void) {
  useEffect(() => {
    const sheet = box.current!;
    let drag: { x0: number; y0: number; lastY: number; lastT: number; v: number; dy: number; state: 'maybe' | 'dragging' | 'no' } | null = null;

    const move = (dy: number) => {
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
      if (scrim.current) scrim.current.style.opacity = String(Math.max(0, 1 - dy / sheet.offsetHeight));
    };
    const settle = (closing: boolean) => {
      const animate = motionOn();
      sheet.style.transition = animate ? `transform ${closing ? 0.2 : 0.28}s cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none';
      if (scrim.current) scrim.current.style.transition = animate ? 'opacity 0.2s ease' : 'none';
      if (closing) {
        sheet.style.transform = 'translateY(100%)';
        if (scrim.current) scrim.current.style.opacity = '0';
        if (animate) setTimeout(onClose, 180);
        else onClose();
      } else {
        sheet.style.transform = '';
        if (scrim.current) scrim.current.style.opacity = '';
      }
    };
    const begin = (x: number, y: number, t: number, target: EventTarget | null) => {
      const el = target as Element | null;
      const fromGrabber = !!el?.closest('.grabber-zone');
      if (!fromGrabber && (el?.closest('input, textarea, select') || sheet.scrollTop > 0)) drag = null;
      else drag = { x0: x, y0: y, lastY: y, lastT: t, v: 0, dy: 0, state: 'maybe' };
    };
    /** Returns true while the sheet is being dragged (the gesture is ours). */
    const follow = (x: number, y: number, t: number): boolean => {
      if (!drag || drag.state === 'no') return false;
      const dy = y - drag.y0;
      if (drag.state === 'maybe') {
        if (Math.abs(dy) < 6 && Math.abs(x - drag.x0) < 6) return false;
        if (dy <= 0 || Math.abs(dy) < Math.abs(x - drag.x0) || sheet.scrollTop > 0) {
          drag.state = 'no';
          return false;
        }
        drag.state = 'dragging';
      }
      drag.v = (y - drag.lastY) / Math.max(1, t - drag.lastT);
      drag.lastY = y;
      drag.lastT = t;
      drag.dy = Math.max(0, dy);
      move(drag.dy);
      return true;
    };
    const end = () => {
      if (drag?.state === 'dragging') settle(drag.dy > Math.min(140, sheet.offsetHeight / 4) || drag.v > 0.6);
      drag = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return void (drag = null);
      begin(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (follow(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp)) e.preventDefault();
    };
    // A mouse can drag the grabber.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !(e.target as Element).closest('.grabber-zone')) return;
      begin(e.clientX, e.clientY, e.timeStamp, e.target);
      const onMove = (m: PointerEvent) => follow(m.clientX, m.clientY, m.timeStamp);
      const onUp = () => {
        end();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
    sheet.addEventListener('pointerdown', onPointerDown);
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', end);
      sheet.removeEventListener('touchcancel', end);
      sheet.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Long press (touch), right-click, or Shift+Enter / the menu key (keyboard):
 * all open the same options. A normal tap still clicks.
 */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        start.current = null;
        navigator.vibrate?.(10);
        onLong();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!fired.current) onLong();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if ((e.key === 'Enter' && e.shiftKey) || e.key === 'F10' && e.shiftKey) {
        e.preventDefault();
        onLong();
      }
    },
  };
}
