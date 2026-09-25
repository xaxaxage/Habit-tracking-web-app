import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { dismissToast, useToast } from '../lib/toast';
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
  const close = useRef(onClose);
  close.current = onClose;

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
      <div class="scrim" onClick={() => close.current()} />
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} class={`sheet ${cls}`}>
        <span class="grabber" aria-hidden="true" />
        {children}
      </section>
    </>,
    document.body,
  );
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
