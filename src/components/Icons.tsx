import type { ComponentChildren } from 'preact';
import { iconPath } from '../lib/icons';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  class?: string;
}

function Svg({ size = 24, strokeWidth = 2, class: cls, children }: IconProps & { children: ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class={cls}
    >
      {children}
    </svg>
  );
}

/** A habit's own icon. */
export function HabitGlyph({ icon, ...p }: IconProps & { icon: string }) {
  return (
    <Svg {...p}>
      <path d={iconPath(icon)} />
    </Svg>
  );
}

const path = (d: string) => (p: IconProps) => (
  <Svg {...p}>
    <path d={d} />
  </Svg>
);

export const Check = path('M5 12.5l4.5 4.5L19 7.5');
export const Plus = path('M12 5v14M5 12h14');
export const Minus = path('M5 12h14');
export const Close = path('M18 6L6 18M6 6l12 12');
export const ChevronLeft = path('M15 18l-6-6 6-6');
export const ChevronRight = path('M9 18l6-6-6-6');
export const ChevronUp = path('M6 15l6-6 6 6');
export const ChevronDown = path('M6 9l6 6 6-6');
export const Flame = path('M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .5 2 1.5 3 2.5 3 0-3-1-5 0-8z');
export const Skip = path('M5 12h14M13 6l6 6-6 6');
export const Bars = path('M5 20V11M12 20V4M19 20v-6');
export const Pencil = path('M4 20h4L19 9l-4-4L4 16zM13 7l4 4');
export const Trash = path('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3');

export function Grid(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </Svg>
  );
}

export function Calendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  );
}

export function Gear(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

export function PhoneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Svg>
  );
}

export function TabletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M10.5 18h3" />
    </Svg>
  );
}

export function ComputerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Svg>
  );
}

export function Chat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  );
}
