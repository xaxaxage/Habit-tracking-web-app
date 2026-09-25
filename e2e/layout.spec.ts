import { expect, test, type Page } from '@playwright/test';
import { manyHabits, sampleData } from './fixtures';
import { openWith, syncedConfig } from './helpers';

/**
 * Layout rules for every screen: nothing ever scrolls or sticks out
 * sideways (1440 px down to 280 px), every control is at least 44 × 44 px on
 * iPhone sizes, focus is always visible, and the scrollbar gutter is stable.
 */

interface Screen {
  name: string;
  hash: string;
  data?: 'sample' | 'many' | 'empty';
  synced?: boolean;
  open?: (page: Page) => Promise<void>;
}

const SCREENS: Screen[] = [
  { name: 'today', hash: '#/' },
  { name: 'today, an earlier day', hash: '#/?date=2026-09-23' },
  { name: 'today, 34 habits with long names', hash: '#/', data: 'many' },
  { name: 'today, no habits', hash: '#/', data: 'empty' },
  {
    name: 'hold a tile',
    hash: '#/',
    open: async (page) => {
      await page.getByRole('button', { name: /^Water/ }).click({ button: 'right' });
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  { name: 'week', hash: '#/week' },
  { name: 'week, 34 habits', hash: '#/week', data: 'many' },
  { name: 'week, no habits', hash: '#/week', data: 'empty' },
  { name: 'habit history', hash: '#/habit/read00000001' },
  { name: 'habit history, long name', hash: '#/habit/extra0000000', data: 'many' },
  { name: 'new habit', hash: '#/new' },
  { name: 'new habit from a sentence', hash: '#/new?text=Walk%2010%2C000%20steps%20on%20weekdays%20in%20the%20morning' },
  {
    name: 'new habit, repeat options',
    hash: '#/new?text=Workout%203%20times%20a%20week',
    open: async (page) => {
      await page.getByRole('button', { name: /^Repeat/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  { name: 'edit habit', hash: '#/habit/water000001/edit' },
  { name: 'settings', hash: '#/settings' },
  { name: 'settings, 34 habits', hash: '#/settings', data: 'many' },
  { name: 'settings, syncing with other devices', hash: '#/settings', synced: true },
  {
    name: 'settings, sync key shown and relays open',
    hash: '#/settings',
    synced: true,
    open: async (page) => {
      await page.getByRole('button', { name: 'Show sync key' }).click();
      await page.locator('summary', { hasText: 'Relays' }).click();
    },
  },
  {
    name: 'settings, new sync key',
    hash: '#/settings',
    open: async (page) => {
      await page.getByRole('button', { name: 'Create sync key' }).click();
      await expect(page.getByRole('list', { name: 'Sync key' }).getByRole('listitem')).toHaveCount(12);
    },
  },
  { name: 'missing page', hash: '#/nothing-here' },
];

async function open(page: Page, s: Screen) {
  const data = s.data === 'empty' ? null : s.data === 'many' ? manyHabits() : sampleData();
  await openWith(page, data, s.hash, s.synced ? { sync: syncedConfig() } : {});
  await s.open?.(page);
}

/** Elements whose box reaches past the left or right edge of the window, or out of the button, link or label they're in. */
function overflowing(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} "${el.textContent?.trim().slice(0, 30)}"`;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
      if (r.right > width + 0.5 || r.left < -0.5) out.push(`${name(el)} ${r.left.toFixed(0)}–${r.right.toFixed(0)} of ${width}`);
      const control = el.parentElement?.closest('button, a, label, summary');
      if (control) {
        const c = control.getBoundingClientRect();
        if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1) {
          out.push(`${name(el)} sticks out of ${name(control)}`);
        }
      }
    }
    return { scroll: document.documentElement.scrollWidth - width, out: out.slice(0, 8) };
  });
}

for (const s of SCREENS) {
  test(`${s.name}: never wider than the window, 1440 px down to 280 px`, async ({ page }) => {
    await open(page, s);
    for (const width of [1440, 1024, 768, 480, 390, 375, 360, 320, 280]) {
      await page.setViewportSize({ width, height: 800 });
      const { scroll, out } = await overflowing(page);
      expect(out, `at ${width} px`).toEqual([]);
      expect(scroll, `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test(`${s.name}: controls are at least 44 × 44 px on iPhones`, async ({ page }) => {
    await open(page, s);
    for (const size of [
      { width: 390, height: 844 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(size);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const sel = 'a[href], button, input:not([type=file]), textarea, select, summary, [role=button], [tabindex]:not([tabindex="-1"])';
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          // A checkbox inside its label: the whole label is what you tap.
          const target = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') ?? el : el;
          const r = target.getBoundingClientRect();
          if (r.width === 0 || el.closest('[inert]')) continue;
          if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}" ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
        }
        return out;
      });
      expect(small, `at ${size.width}×${size.height}`).toEqual([]);
    }
  });
}

test('the scrollbar keeps its space, so screens never shift sideways', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toBe('stable');
});

test('keyboard: every stop on Today shows where focus is', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openWith(page, sampleData(), '#/');
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (el === document.body) return null;
      const own = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const visible = (own.outlineStyle !== 'none' && own.outlineWidth !== '0px') || (before.outlineStyle !== 'none' && before.outlineWidth !== '0px');
      return { id: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, visible };
    });
    if (!info || seen.has(info.id)) break; // past the last control
    expect(info.visible, `focus ring on "${info.id}"`).toBe(true);
    seen.add(info.id);
  }
  // 5 days, 6 tiles, 4 links in the bottom bar.
  expect(seen.size).toBe(15);
});

test.describe('with a mouse', () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 800 } });
  test('the board says click and right-click, and right-click opens the options', async ({ page }) => {
    await openWith(page, sampleData(), '#/');
    await expect(page.getByText('Click to log · right-click a tile to skip, add a note or open it')).toBeVisible();
    await expect(page.getByText('Tap to log')).toBeHidden();
    await page.getByRole('button', { name: /^Read,/ }).click({ button: 'right' });
    await expect(page.getByRole('dialog', { name: 'Read' })).toBeVisible();
  });
});
