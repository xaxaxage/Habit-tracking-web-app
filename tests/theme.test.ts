import { describe, expect, it } from 'vitest';
import { AUTO_THEME, contrast, contrastPairs, deriveTokens, ensureContrast, mix, PALETTES, paletteTokens, themeOutput, TOKEN_NAMES } from '../src/lib/theme';

describe('palettes', () => {
  it('keep every text and control readable (WCAG AA) in every palette', () => {
    const problems: string[] = [];
    for (const p of PALETTES) {
      for (const pair of contrastPairs(paletteTokens(p))) {
        const ratio = contrast(pair.fg, pair.bg);
        if (ratio < pair.min) problems.push(`${p.name}: ${pair.what} ${ratio.toFixed(2)} < ${pair.min}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('match the design exactly in Night', () => {
    const night = paletteTokens(PALETTES[0]);
    expect(night).toMatchObject({ bg: '#0e1a1d', surface: '#172529', ink: '#f3eee8', accent: '#fb8b24', 'teal-lift': '#6fb3c2' });
  });

  it('include dark palettes, and Auto follows the device', () => {
    const dark = PALETTES.filter((p) => themeOutput(p.id).scheme === 'dark').map((p) => p.name);
    expect(dark).toEqual(['Night', 'Espresso', 'OLED black']);
    const auto = themeOutput(AUTO_THEME);
    expect(auto.scheme).toBe('light dark');
    expect(auto.css).toContain('@media (prefers-color-scheme: dark)');
    expect(auto.bar).toEqual(['#f7f3ee', '#0e1a1d']);
  });

  it('set every token', () => {
    for (const p of PALETTES) {
      const css = themeOutput(p.id).css;
      for (const name of TOKEN_NAMES) expect(css).toContain(`--${name}:`);
    }
    expect(themeOutput('no-such-palette').css).toBe(themeOutput('night').css);
  });

  it('fixes unreadable colors in any palette', () => {
    const t = deriveTokens({ bg: '#ffffff', surface: '#ffffff', ink: '#dddddd', accent: '#ffff00' });
    expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(t['accent-text'], t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ensureContrast('#777777', '#000000', 7), '#000000')).toBeGreaterThanOrEqual(7);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
