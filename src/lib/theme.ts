import type { HabitColor } from './types';
import { HABIT_COLORS } from './types';

/**
 * Color palettes, ported from the calorie tracker. A palette is four base
 * colors (background, cards, text, accent); every other shade the app uses
 * is derived from them, and text shades are nudged until they are readable
 * (WCAG AA). The habit colors keep their hue in every palette; their lighter
 * "lift" shade and the text on them are worked out per palette.
 *
 * "Night" is the design itself, with its exact shades.
 */

export interface ThemeBase {
  bg: string;
  surface: string;
  ink: string;
  accent: string;
}

export const TOKEN_NAMES = [
  'bg', 'surface', 'raised', 'line', 'line-strong', 'line-dashed', 'line-faint',
  'ink', 'ink-soft', 'muted', 'faint', 'disabled', 'on-ink',
  'accent', 'accent-text', 'on-accent', 'focus', 'flame', 'danger', 'scrim', 'shadow',
  'teal', 'teal-lift', 'teal-ink', 'violet', 'violet-lift', 'violet-ink', 'crimson', 'crimson-lift', 'crimson-ink',
  'orange', 'orange-lift', 'orange-ink', 'ember', 'ember-lift', 'ember-ink',
  'soft-fill',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export interface Palette {
  id: string;
  name: string;
  base: ThemeBase;
  /** Exact shades, where a palette was tuned by hand. */
  tokens?: Partial<Tokens>;
}

/** The habit colors from the design (fills); the same in every palette. */
export const HABIT_FILLS: Record<HabitColor, string> = {
  teal: '#0f4c5c',
  violet: '#5f0f40',
  crimson: '#9a031e',
  orange: '#fb8b24',
  ember: '#e36414',
};

/** The design's own shades (src/styles.css has the same as defaults). */
const NIGHT_TOKENS: Tokens = {
  bg: '#0e1a1d',
  surface: '#172529',
  raised: '#22363b',
  line: '#2a3d42',
  'line-strong': '#3a4f55',
  'line-dashed': '#6e8186',
  'line-faint': '#1c2c31',
  ink: '#f3eee8',
  'ink-soft': '#c9d3d5',
  muted: '#9fb0b4',
  faint: '#7f9195',
  disabled: '#52666b',
  'on-ink': '#0e1a1d',
  accent: '#fb8b24',
  'accent-text': '#fb8b24',
  'on-accent': '#1a0b02',
  focus: '#fb8b24',
  flame: '#f0a56a',
  danger: '#f0616f',
  scrim: 'rgba(5, 12, 14, 0.6)',
  shadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
  teal: '#0f4c5c',
  'teal-lift': '#6fb3c2',
  'teal-ink': '#ffffff',
  violet: '#5f0f40',
  'violet-lift': '#d07bae',
  'violet-ink': '#ffffff',
  crimson: '#9a031e',
  'crimson-lift': '#f0616f',
  'crimson-ink': '#ffffff',
  orange: '#fb8b24',
  'orange-lift': '#fb8b24',
  'orange-ink': '#1a0b02',
  ember: '#e36414',
  'ember-lift': '#f08a4b',
  'ember-ink': '#1a0b02',
  'soft-fill': '45%',
};

export const DEFAULT_THEME = 'night';
/** Harbor by day, Night when the device is in dark mode. */
export const AUTO_THEME = 'auto';

export const PALETTES: Palette[] = [
  { id: 'night', name: 'Night', base: { bg: '#0e1a1d', surface: '#172529', ink: '#f3eee8', accent: '#fb8b24' }, tokens: NIGHT_TOKENS },
  { id: 'harbor', name: 'Harbor', base: { bg: '#f7f3ee', surface: '#ffffff', ink: '#16262b', accent: '#fb8b24' } },
  { id: 'matcha', name: 'Matcha', base: { bg: '#f1f4ec', surface: '#ffffff', ink: '#1b2a1e', accent: '#e9a23b' } },
  { id: 'ocean', name: 'Ocean', base: { bg: '#eef3f8', surface: '#ffffff', ink: '#122238', accent: '#ff6f59' } },
  { id: 'lavender', name: 'Lavender', base: { bg: '#f5f3fa', surface: '#ffffff', ink: '#221d33', accent: '#f2a65a' } },
  { id: 'graphite', name: 'Graphite', base: { bg: '#f2f2f0', surface: '#ffffff', ink: '#151515', accent: '#ffb000' } },
  { id: 'espresso', name: 'Espresso', base: { bg: '#17120f', surface: '#231c18', ink: '#f2e9e1', accent: '#ff7b54' } },
  { id: 'oled', name: 'OLED black', base: { bg: '#000000', surface: '#121212', ink: '#f2f2f2', accent: '#fdd663' } },
];

const NIGHT = PALETTES[0];
const HARBOR = PALETTES[1];

// ── Color math ────────────────────────────────────────────────────────────

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** "#ABC", "abc" or "#aabbcc" → "#aabbcc". */
export function normalizeHex(value: string): string {
  let h = value.trim().replace(/^#/, '').toLowerCase();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return `#${h}`;
}

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix `b` into `a` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Darken or lighten `fg` just enough to reach `min` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return normalizeHex(fg);
  const lightBg = luminance(bg) > 0.18;
  for (const target of lightBg ? ['#000000', '#ffffff'] : ['#ffffff', '#000000']) {
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      const c = mix(fg, target, t);
      if (contrast(c, bg) >= min) return c;
    }
  }
  return lightBg ? '#000000' : '#ffffff';
}

/** Text for a filled button or tile: white, or a very dark tint of the fill. */
export function textOn(fill: string): string {
  const dark = mix(fill, '#000000', 0.9);
  return contrast('#ffffff', fill) >= 4.5 || contrast('#ffffff', fill) >= contrast(dark, fill) ? '#ffffff' : dark;
}

export function isDark(base: ThemeBase): boolean {
  return luminance(base.bg) < 0.2;
}

/** Every shade the app uses, from a palette's base colors. */
export function deriveTokens(input: ThemeBase): Tokens {
  const base = cleanBase(input);
  const dark = isDark(base);
  const { bg, surface } = base;
  const ink = ensureContrast(ensureContrast(base.ink, surface, 7), bg, 7);
  const shade = (t: number) => mix(surface, ink, t);
  // Text sits on the page, on cards and on raised buttons, so it must read on all three.
  const raised = shade(dark ? 0.08 : 0.05);
  const readable = (fg: string, min: number) => ensureContrast(ensureContrast(ensureContrast(fg, surface, min), bg, min), raised, min);
  const accent = base.accent;

  const tokens: Partial<Tokens> = {
    bg,
    surface,
    raised,
    line: shade(dark ? 0.12 : 0.11),
    'line-strong': shade(dark ? 0.2 : 0.2),
    'line-dashed': readable(shade(0.42), 3),
    'line-faint': mix(bg, ink, dark ? 0.05 : 0.06),
    ink,
    'ink-soft': readable(mix(ink, surface, 0.15), 7),
    muted: readable(mix(ink, surface, 0.35), 4.6),
    faint: readable(mix(ink, surface, 0.45), 4.5),
    disabled: mix(ink, surface, 0.62),
    'on-ink': contrast(bg, ink) >= 7 ? bg : textOn(ink),
    accent,
    'accent-text': readable(accent, 4.6),
    'on-accent': textOn(accent),
    focus: ensureContrast(ensureContrast(accent, bg, 3), surface, 3),
    flame: readable(dark ? mix(accent, '#ffffff', 0.25) : mix(accent, '#000000', 0.2), 4.6),
    danger: readable(dark ? '#f0616f' : '#b3261e', 4.6),
    scrim: dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(14, 26, 29, 0.45)',
    shadow: dark ? '0 10px 30px rgba(0, 0, 0, 0.45)' : '0 10px 30px rgba(14, 26, 29, 0.18)',
    'soft-fill': dark ? '45%' : '28%',
  };
  for (const c of HABIT_COLORS) {
    const fill = HABIT_FILLS[c];
    tokens[c] = fill;
    // Lines, icons and small text in the habit's color, on cards: lighter in the dark, deeper in the light.
    tokens[`${c}-lift`] = readable(dark ? mix(fill, '#ffffff', 0.35) : fill, 4.6);
    tokens[`${c}-ink`] = textOn(fill);
  }
  return tokens as Tokens;
}

export function paletteTokens(p: Pick<Palette, 'base' | 'tokens'>): Tokens {
  return { ...deriveTokens(p.base), ...(p.tokens ?? {}) };
}

export function cleanBase(raw: any, fallback: ThemeBase = NIGHT.base): ThemeBase {
  const out = { ...fallback };
  for (const key of ['bg', 'surface', 'ink', 'accent'] as const) if (isHex(raw?.[key])) out[key] = normalizeHex(raw[key]);
  return out;
}

// ── Choosing and applying ─────────────────────────────────────────────────

export function findPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

function block(tokens: Tokens, dark: boolean): string {
  const vars = TOKEN_NAMES.map((n) => `--${n}:${tokens[n]};`).join('');
  return `${vars}color-scheme:${dark ? 'dark' : 'light'};`;
}

/** Beats the stylesheet's own :root defaults, which may load after this. */
const ROOT = 'html:root';

export interface ThemeOutput {
  css: string;
  /** Status bar color: [light mode, dark mode]. */
  bar: [string, string];
  scheme: 'light' | 'dark' | 'light dark';
}

export function themeOutput(themeId: string): ThemeOutput {
  if (themeId === AUTO_THEME) {
    const light = paletteTokens(HARBOR);
    const dark = paletteTokens(NIGHT);
    return {
      css: `${ROOT}{${block(light, false)}}@media (prefers-color-scheme: dark){${ROOT}{${block(dark, true)}}}`,
      bar: [light.bg, dark.bg],
      scheme: 'light dark',
    };
  }
  const palette = findPalette(themeId) ?? NIGHT;
  const tokens = paletteTokens(palette);
  const dark = isDark(palette.base);
  return { css: `${ROOT}{${block(tokens, dark)}}`, bar: [tokens.bg, tokens.bg], scheme: dark ? 'dark' : 'light' };
}

/** Where index.html finds the theme before the app loads, so it doesn't flash the default colors. */
export const THEME_CACHE_KEY = 'habit-tracker:theme';

let mediaListener: (() => void) | null = null;

export function applyThemeOutput(out: ThemeOutput) {
  let style = document.getElementById('theme-vars') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'theme-vars';
    document.head.appendChild(style);
  }
  if (style.textContent !== out.css) style.textContent = out.css;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', out.scheme);

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const setBar = () => {
    const color = media?.matches ? out.bar[1] : out.bar[0];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  };
  setBar();
  if (mediaListener) media?.removeEventListener?.('change', mediaListener);
  mediaListener = out.bar[0] !== out.bar[1] ? setBar : null;
  if (mediaListener) media?.addEventListener?.('change', mediaListener);
}

export function applyTheme(themeId: string) {
  const out = themeOutput(themeId);
  applyThemeOutput(out);
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(out));
  } catch {
    // The theme still applies; it just may flash on the next launch.
  }
}

/**
 * Pairs of colors the app actually draws, with the contrast each needs:
 * 4.5:1 for text, 3:1 for icons, borders and the focus ring. Checked for
 * every palette in the tests.
 */
export function contrastPairs(t: Tokens): { what: string; fg: string; bg: string; min: number }[] {
  const pairs: { what: string; fg: string; bg: string; min: number }[] = [];
  const grounds = [
    ['page', t.bg],
    ['card', t.surface],
  ] as const;
  for (const [where, bg] of [...grounds, ['button', t.raised] as const]) {
    pairs.push(
      { what: `text on ${where}`, fg: t.ink, bg, min: 7 },
      { what: `muted text on ${where}`, fg: t.muted, bg, min: 4.5 },
    );
    for (const c of HABIT_COLORS) pairs.push({ what: `${c} icon on ${where}`, fg: t[`${c}-lift`], bg, min: 3 });
  }
  for (const [where, bg] of grounds) {
    pairs.push(
      { what: `soft text on ${where}`, fg: t['ink-soft'], bg, min: 4.5 },
      { what: `faint text on ${where}`, fg: t.faint, bg, min: 4.5 },
      { what: `accent text on ${where}`, fg: t['accent-text'], bg, min: 4.5 },
      { what: `streak on ${where}`, fg: t.flame, bg, min: 4.5 },
      { what: `danger text on ${where}`, fg: t.danger, bg, min: 4.5 },
      { what: `dashed border on ${where}`, fg: t['line-dashed'], bg, min: 3 },
      { what: `focus ring on ${where}`, fg: t.focus, bg, min: 3 },
    );
    for (const c of HABIT_COLORS) pairs.push({ what: `${c} text on ${where}`, fg: t[`${c}-lift`], bg, min: 4.5 });
  }
  pairs.push(
    { what: 'selected text', fg: t['on-ink'], bg: t.ink, min: 4.5 },
    { what: 'text on accent', fg: t['on-accent'], bg: t.accent, min: 4.5 },
  );
  const soft = parseFloat(t['soft-fill']) / 100;
  for (const c of HABIT_COLORS) {
    pairs.push({ what: `text on a done ${c} tile`, fg: t[`${c}-ink`], bg: t[c], min: 4.5 });
    pairs.push({ what: `small line on a done ${c} tile`, fg: mix(t[c], t[`${c}-ink`], 0.85), bg: t[c], min: 4.5 });
    // A partly done tile: text over the fill mixed into the card, and at 85% opacity for the small line.
    const partly = mix(t.surface, t[c], soft);
    pairs.push({ what: `text on a partly done ${c} tile`, fg: t.ink, bg: partly, min: 4.5 });
    pairs.push({ what: `small line on a partly done ${c} tile`, fg: mix(partly, t.ink, 0.85), bg: partly, min: 4.5 });
  }
  return pairs;
}
