import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { manyHabits, sampleData } from './fixtures';
import { openWith, syncedConfig } from './helpers';

/** axe-core (WCAG 2.1 A and AA: names, labels, roles, contrast) on every screen. */

const SCREENS: { name: string; hash: string; many?: boolean; empty?: boolean; synced?: boolean; open?: (page: Page) => Promise<void> }[] = [
  { name: 'today', hash: '#/' },
  { name: 'today, earlier day', hash: '#/?date=2026-09-22' },
  { name: 'today, crowded', hash: '#/', many: true },
  { name: 'today, empty', hash: '#/', empty: true },
  {
    name: 'hold a tile (count)',
    hash: '#/',
    open: async (page) => {
      await page.getByRole('button', { name: /^Water/ }).click({ button: 'right' });
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    name: 'hold a tile (skipped)',
    hash: '#/?date=2026-09-23',
    open: async (page) => {
      await page.getByRole('button', { name: /^Journal/ }).click({ button: 'right' });
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  { name: 'week', hash: '#/week' },
  { name: 'last week', hash: '#/week?start=2026-09-14' },
  { name: 'habit history', hash: '#/habit/read00000001' },
  { name: 'habit history, weekly', hash: '#/habit/workout00001' },
  { name: 'new habit', hash: '#/new?text=Drink%208%20glasses%20of%20water' },
  {
    name: 'new habit, icon picker',
    hash: '#/new?text=Read%2020%20min',
    open: async (page) => {
      await page.getByRole('button', { name: /^Icon/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    name: 'new habit, goal',
    hash: '#/new?text=Walk%2010k%20steps',
    open: async (page) => {
      await page.getByRole('button', { name: /^Goal/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  { name: 'edit habit', hash: '#/habit/journal00001/edit' },
  { name: 'settings', hash: '#/settings', many: true },
  {
    name: 'settings, sync key and relays',
    hash: '#/settings',
    synced: true,
    open: async (page) => {
      await page.getByRole('button', { name: 'Show sync key' }).click();
      await page.locator('summary', { hasText: 'Relays' }).click();
    },
  },
  {
    name: 'settings, joining with a key',
    hash: '#/settings',
    open: async (page) => {
      await page.getByRole('button', { name: 'I have a key' }).click();
      await page.getByLabel('Sync key from your other device').fill('apple banana');
    },
  },
  { name: 'missing page', hash: '#/nope' },
];

for (const s of SCREENS) {
  test(`no accessibility problems: ${s.name}`, async ({ page }) => {
    await openWith(page, s.empty ? null : s.many ? manyHabits() : sampleData(), s.hash, s.synced ? { sync: syncedConfig() } : {});
    await s.open?.(page);
    // Let animations settle so colors are final.
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const problems = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary?.split('\n')[1] ?? ''}`).slice(0, 4).join(' | ')}`);
    expect(problems).toEqual([]);
  });
}
