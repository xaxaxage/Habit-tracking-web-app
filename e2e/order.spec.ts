import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { sampleData, STORAGE_KEY } from './fixtures';
import { openWith } from './helpers';

/** The board's order: learned from when habits get done, and changed by holding and dragging a tile. */

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });
const dueOrder = (page: Page) => page.locator('.tiles').first().locator('.tile-name').allTextContents();
const SAMPLE = ['Water', 'Stretch', 'Workout', 'Read', 'Journal', 'Screens off 23:00'];

async function center(page: Page, name: string) {
  const b = (await tile(page, name).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A finger: down, held for `hold` ms, moved to `to` in `steps`, then lifted. */
async function touchDrag(cdp: CDPSession, page: Page, from: { x: number; y: number }, to: { x: number; y: number } | null, hold = 650, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  await page.waitForTimeout(hold);
  if (to) {
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
      await page.waitForTimeout(16);
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);

test('the board is in the order you usually get things done', async ({ page }) => {
  const data = sampleData();
  const screens = data.habits.find((h) => h.name.startsWith('Screens'))!;
  // Screens off has always been done at 6:30 in the morning; everything else at 22:00.
  for (const [date, log] of Object.entries(data.logs[screens.id])) log.at = Date.parse(`${date}T04:30:00Z`);
  await openWith(page, data, '#/');
  expect(await dueOrder(page)).toEqual(['Screens off 23:00', 'Water', 'Stretch', 'Workout', 'Read', 'Journal']);
  // The week lists them in the same order.
  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page.locator('.week-row').first()).toHaveAccessibleName('Screens off 23:00');
});

for (const layout of ['tiles', 'list'] as const) {
  test(`hold a tile and drag it somewhere else (${layout})`, async ({ page, context }) => {
    const data = sampleData();
    await openWith(page, { ...data, settings: { ...data.settings, layout } }, '#/');
    const cdp = await context.newCDPSession(page);
    expect(await dueOrder(page)).toEqual(SAMPLE);

    await touchDrag(cdp, page, await center(page, 'Journal'), await center(page, 'Water'));
    await expect.poll(() => dueOrder(page)).toEqual(['Journal', 'Water', 'Stretch', 'Workout', 'Read', 'Screens off 23:00']);
    // Moving it didn't log it or open its options.
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(tile(page, 'Journal')).toHaveAccessibleName(/not done/);
    const journal = (await saved(page)).habits.find((h: { name: string }) => h.name === 'Journal');
    expect(journal.placed).toMatchObject({ before: 'water000001' });

    // It stays there.
    await page.reload();
    expect(await dueOrder(page)).toEqual(['Journal', 'Water', 'Stretch', 'Workout', 'Read', 'Screens off 23:00']);

    // Down again, behind Read.
    await touchDrag(cdp, page, await center(page, 'Journal'), await center(page, 'Read'));
    await expect.poll(() => dueOrder(page)).toEqual(['Water', 'Stretch', 'Workout', 'Read', 'Journal', 'Screens off 23:00']);
  });
}

test('holding without moving opens the options, a quick swipe scrolls, and a tap still logs', async ({ page, context }) => {
  await openWith(page, sampleData(), '#/');
  const cdp = await context.newCDPSession(page);
  await touchDrag(cdp, page, await center(page, 'Water'), null);
  await expect(page.getByRole('dialog', { name: 'Water' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const from = await center(page, 'Read');
  await touchDrag(cdp, page, from, { x: from.x, y: from.y - 200 }, 0, 8);
  await page.waitForTimeout(600);
  expect(await dueOrder(page)).toEqual(SAMPLE);
  await expect(page.getByRole('dialog')).toBeHidden();

  await tile(page, 'Water').tap();
  await expect(tile(page, 'Water')).toContainText('6 / 8 glasses');
});

test('with a mouse: hold a tile, then drag it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  await openWith(page, sampleData(), '#/');
  const from = await center(page, 'Read');
  const to = await center(page, 'Water');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => dueOrder(page)).toEqual(['Read', 'Water', 'Stretch', 'Workout', 'Journal', 'Screens off 23:00']);
  // Not logged by the drag.
  await expect(tile(page, 'Read')).toContainText('10 / 20 min');
  await context.close();
});

test('with a keyboard: Alt+Up and Alt+Down move the focused tile', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  await tile(page, 'Journal').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => dueOrder(page)).toEqual(['Water', 'Stretch', 'Workout', 'Journal', 'Read', 'Screens off 23:00']);
  await expect(tile(page, 'Journal')).toBeFocused();
  await expect(page.locator('[aria-live="polite"].sr-only')).toHaveText('Journal moved to 4 of 6');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp'); // already first: nothing happens
  await expect.poll(() => dueOrder(page)).toEqual(['Journal', 'Water', 'Stretch', 'Workout', 'Read', 'Screens off 23:00']);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => dueOrder(page)).toEqual(['Water', 'Journal', 'Stretch', 'Workout', 'Read', 'Screens off 23:00']);
  await expect(tile(page, 'Journal')).toBeFocused();
  // Enter still logs, Shift+Enter still opens the options.
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByRole('dialog', { name: 'Journal' })).toBeVisible();
});
