import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleData } from './fixtures';
import { openWith } from './helpers';

/** Palettes and animations. */

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('pick a palette: it applies at once, stays after a reload, and colors the status bar', async ({ page }) => {
  await openWith(page, sampleData(), '#/settings');
  expect(await bodyBackground(page)).toBe('rgb(14, 26, 29)'); // the design's Night
  await page.getByRole('radio', { name: 'Harbor' }).click();
  await expect(page.getByRole('radio', { name: 'Harbor' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => bodyBackground(page)).toBe('rgb(247, 243, 238)');
  expect(await page.locator('meta[name=theme-color]').getAttribute('content')).toBe('#f7f3ee');
  await page.reload();
  // Applied by index.html before the app's code runs, so there's no flash of the old colors.
  expect(await page.evaluate(() => !!document.getElementById('theme-vars'))).toBe(true);
  await expect.poll(() => bodyBackground(page)).toBe('rgb(247, 243, 238)');
});

test('Auto follows the device between Harbor and Night', async ({ page }) => {
  await openWith(page, { ...sampleData(), settings: { ...sampleData().settings, theme: 'auto' } }, '#/');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => bodyBackground(page)).toBe('rgb(247, 243, 238)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => bodyBackground(page)).toBe('rgb(14, 26, 29)');
});

test('animations: on by default, off with the switch, and off when the device asks for less motion', async ({ page }) => {
  const data = { ...sampleData(), settings: { ...sampleData().settings, animations: true } };
  await openWith(page, data, '#/settings');
  const motion = () => page.evaluate(() => document.documentElement.dataset.motion);
  const screenAnimation = () => page.evaluate(() => getComputedStyle(document.querySelector('.screen')!).animationName);
  expect(await motion()).toBe('on');
  expect(await screenAnimation()).toBe('screen-in');
  await page.getByRole('switch', { name: /Animations/ }).uncheck();
  expect(await motion()).toBe('off');
  expect(await screenAnimation()).toBe('none');
  await page.getByRole('switch', { name: /Animations/ }).check();
  expect(await motion()).toBe('on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(motion).toBe('off');
  await expect(page.getByText('Off while your device’s Reduce Motion setting is on.')).toBeVisible();
});

test('the sheet slides up and a full tile pops its check', async ({ page }) => {
  const data = { ...sampleData(), settings: { ...sampleData().settings, animations: true } };
  await openWith(page, data, '#/');
  await page.getByRole('button', { name: /^Journal,/ }).click();
  expect(await page.locator('.tile.full .tile-badge').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('pop');
  await page.getByRole('button', { name: /^Water,/ }).click({ button: 'right' });
  expect(await page.locator('.sheet').evaluate((el) => getComputedStyle(el).animationName)).toBe('sheet-up');
});

for (const theme of ['harbor', 'oled', 'matcha']) {
  for (const [name, hash] of [
    ['today', '#/'],
    ['week', '#/week'],
    ['history', '#/habit/read00000001'],
    ['new habit', '#/new?text=Walk%2010k%20steps'],
    ['settings', '#/settings'],
  ] as const) {
    test(`no accessibility problems in ${theme}: ${name}`, async ({ page }) => {
      await openWith(page, { ...sampleData(), settings: { ...sampleData().settings, theme } }, hash);
      await page.waitForTimeout(300);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary?.split('\n')[1]).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
}
