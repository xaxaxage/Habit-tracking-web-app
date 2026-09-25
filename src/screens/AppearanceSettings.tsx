import { updateSettings, useData } from '../lib/store';
import { AUTO_THEME, HABIT_FILLS, PALETTES, type ThemeBase } from '../lib/theme';
import { useReducedMotion } from '../lib/motion';
import { Check } from '../components/Icons';

/** A tiny picture of the app in a palette: the page, a card with a line of text, the accent and two habit colors. */
function Swatch({ base }: { base: ThemeBase }) {
  return (
    <span class="swatch-preview" style={{ background: base.bg }} aria-hidden="true">
      <span class="swatch-card" style={{ background: base.surface }}>
        <span class="swatch-text" style={{ background: base.ink }} />
        <span class="swatch-dots">
          <i style={{ background: base.accent }} />
          <i style={{ background: HABIT_FILLS.teal }} />
          <i style={{ background: HABIT_FILLS.crimson }} />
        </span>
      </span>
    </span>
  );
}

function AutoSwatch() {
  const [night, harbor] = [PALETTES[0], PALETTES[1]];
  return (
    <span class="swatch-split" aria-hidden="true">
      <Swatch base={harbor.base} />
      <Swatch base={night.base} />
    </span>
  );
}

export function AppearanceSettings() {
  const { theme, animations } = useData().settings;
  const reduced = useReducedMotion();
  const options = [
    { id: PALETTES[0].id, name: PALETTES[0].name, swatch: <Swatch base={PALETTES[0].base} /> },
    { id: AUTO_THEME, name: 'Auto', swatch: <AutoSwatch /> },
    ...PALETTES.slice(1).map((p) => ({ id: p.id, name: p.name, swatch: <Swatch base={p.base} /> })),
  ];
  const selected = options.some((o) => o.id === theme) ? theme : PALETTES[0].id;
  return (
    <section class="card stack" aria-labelledby="look-title">
      <h2 id="look-title" class="section-title">
        Appearance
      </h2>
      <div class="palette-grid" role="radiogroup" aria-label="Color palette">
        {options.map((o) => (
          <button
            type="button"
            role="radio"
            aria-checked={o.id === selected}
            class="palette-option"
            onClick={() => updateSettings({ theme: o.id })}
          >
            {o.swatch}
            <span class="palette-name">
              {o.id === selected && <Check size={14} strokeWidth={3} />}
              {o.name}
            </span>
          </button>
        ))}
      </div>
      <p class="hint">
        {selected === AUTO_THEME
          ? 'Auto uses Harbor by day and Night when your device is in dark mode.'
          : 'Night is the original design. Palettes apply to this device only.'}
      </p>

      <label class="switch-row">
        <input
          type="checkbox"
          role="switch"
          class="switch"
          checked={animations}
          onChange={(e) => updateSettings({ animations: (e.target as HTMLInputElement).checked })}
        />
        <span>
          <strong>Animations</strong>
          <span class="hint">
            {reduced
              ? 'Off while your device’s Reduce Motion setting is on.'
              : animations
                ? 'On: screens, tiles and sheets move gently when things change.'
                : 'Off: everything appears instantly.'}
          </span>
        </span>
      </label>
    </section>
  );
}
