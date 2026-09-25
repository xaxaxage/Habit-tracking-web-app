import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { sampleData, STORAGE_KEY } from './fixtures';
import { openWith } from './helpers';

/** What people do in the app, end to end, on the production build. */

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });

async function hold(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('add a habit from one sentence; it is saved at once', async ({ page }) => {
  await openWith(page, sampleData(), '#/new');
  await page.getByLabel('What do you want to do, and how often?').fill('Drink 8 glasses of water every morning');
  await expect(page.getByRole('button', { name: /^Name: Drink water/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Track as: Count/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Goal: 8 glasses/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Time of day: Morning/ })).toBeVisible();

  // Change what it understood: the name, and how often.
  await page.getByRole('button', { name: /^Name:/ }).click();
  await page.getByLabel("What you'll see on the tile").fill('Water, morning');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /^Repeat:/ }).click();
  await page.getByRole('radio', { name: 'Weekdays' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Repeat: Weekdays/ })).toBeVisible();
  await page.getByRole('button', { name: 'Spanish orange' }).click();
  await expect(page.getByRole('button', { name: 'Spanish orange' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add to my board' }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status')).toContainText('Water, morning is on your board');
  await expect(tile(page, 'Water, morning')).toContainText('0 / 8 glasses');
  await page.reload();
  await expect(tile(page, 'Water, morning')).toBeVisible();
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);
  expect(saved.habits.find((h: { name: string }) => h.name === 'Water, morning')).toMatchObject({
    kind: 'count',
    target: 8,
    unit: 'glasses',
    color: 'ember',
    time: 'morning',
    schedule: { type: 'days', days: [0, 1, 2, 3, 4] },
  });
});

test('tap to log: counts go up, a full tile starts over with an Undo', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  await expect(page.locator('.left-count')).toHaveText('4 to go');
  const water = tile(page, 'Water');
  await water.click();
  await water.click();
  await water.click();
  await expect(water).toContainText('8 / 8 glasses');
  await expect(page.locator('.left-count')).toHaveText('3 to go');
  await water.click();
  await expect(water).toContainText('0 / 8 glasses');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(water).toContainText('8 / 8 glasses');

  // Yes/no habits toggle.
  const journal = tile(page, 'Journal');
  await journal.click();
  await expect(journal).toContainText('Done');
  await expect(page.locator('.left-count')).toHaveText('2 to go');
  await page.reload();
  await expect(tile(page, 'Journal')).toContainText('Done');
  await expect(tile(page, 'Water')).toContainText('8 / 8 glasses');
});

test('hold a tile to skip, set an amount and add a note', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  await hold(page, tile(page, 'Journal'));
  const sheet = page.getByRole('dialog', { name: 'Journal' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /Skip today/ }).click();
  await expect(sheet.getByRole('button', { name: /Skipped/ })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByLabel('Note for today').fill('Too tired tonight');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(tile(page, 'Journal')).toContainText('Skipped');
  await expect(page.locator('.left-count')).toHaveText('3 to go');

  await hold(page, tile(page, 'Read'));
  const read = page.getByRole('dialog', { name: 'Read' });
  await read.getByRole('button', { name: '5 more' }).click();
  await expect(read.getByLabel(/Minutes/)).toHaveValue('15');
  await read.getByLabel(/Minutes/).fill('25');
  await read.getByLabel(/Minutes/).press('Enter');
  await expect(read.getByRole('button', { name: /Done today/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(tile(page, 'Read')).toContainText('25 / 20 min');
  await expect(tile(page, 'Read')).toHaveClass(/full/);

  await page.goto('./#/habit/journal00001');
  await expect(page.getByText('Too tired tonight')).toBeVisible();
  await expect(page.getByText('Fri 25 Sep · Skipped')).toBeVisible();
});

test('keyboard: Enter logs, Shift+Enter opens the options, Escape closes them and focus comes back', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  const screens = tile(page, 'Screens off 23:00');
  await screens.focus();
  await page.keyboard.press('Enter');
  await expect(screens).toContainText('Done');
  await page.keyboard.press('Shift+Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Done today' })).toBeFocused();
  // Focus stays inside the sheet.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(screens).toBeFocused();
});

test('log an earlier day from the day strip', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  await page.getByRole('button', { name: /Wednesday 23 September/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wednesday');
  await expect(page.getByText('Editing 23 September')).toBeVisible();
  await expect(tile(page, 'Journal')).toContainText('Skipped');
  await tile(page, 'Screens off 23:00').click();
  await expect(page.getByRole('button', { name: /Wednesday 23 September, 5 of 5 done/ })).toBeVisible();
  await page.getByRole('button', { name: /Today, Friday/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
});

test('week: tap a day to change it; move between weeks', async ({ page }) => {
  await openWith(page, sampleData(), '#/week');
  await expect(page.locator('.score-card')).toContainText('79%');
  const cell = page.getByRole('button', { name: 'Screens off 23:00, Wednesday: open' });
  await cell.click();
  await expect(page.getByRole('button', { name: 'Screens off 23:00, Wednesday: done' })).toBeVisible();
  await page.getByRole('button', { name: 'Screens off 23:00, Wednesday: done' }).click();
  await expect(page.getByRole('button', { name: 'Screens off 23:00, Wednesday: skipped' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Screens off 23:00' })).toContainText('3 / 4');
  await expect(page.getByRole('button', { name: 'Screens off 23:00, Saturday: upcoming' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled();

  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Last week');
  await expect(page.getByText('14 – 20 September')).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This week');

  await page.getByRole('link', { name: /Workout/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workout');
  await expect(page.locator('.stat').first()).toContainText('3');
  await expect(page.locator('.stat').first()).toContainText('weeks');
});

test('pause and archive keep the history; restore brings it back', async ({ page }) => {
  await openWith(page, sampleData(), '#/habit/read00000001');
  await page.getByRole('button', { name: 'Pause habit · keeps your streak' }).click();
  await expect(page.getByText(/Paused since 25 Sep/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(tile(page, 'Read')).toContainText('Paused');
  await expect(page.locator('.left-count')).toHaveText('3 to go');

  await page.goto('./#/habit/read00000001');
  await page.getByRole('button', { name: 'Resume habit' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('button', { name: /^Goal:/ }).click();
  await page.getByLabel('Minutes a day').fill('30');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('30 min a day · Evening')).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Archive habit · keeps its history' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(tile(page, 'Read')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('list', { name: 'Archived habits' })).toContainText('Read');
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(tile(page, 'Read')).toBeVisible();
});

test('a full storage shows a warning and keeps the change on screen', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await tile(page, 'Journal').click();
  await expect(page.getByRole('alert')).toContainText("Couldn't save your last change: this device's storage is full");
  await expect(tile(page, 'Journal')).toContainText('Done');
});

test('backups: export, delete everything, import, and it is all back', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await openWith(page, sampleData(), '#/settings');
  await page.evaluate(() => localStorage.setItem('habit-tracker:sync', JSON.stringify({ phrase: 'secret words never in backups' })));
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await (await download).path();
  const text = readFileSync(file, 'utf8');
  expect(text).not.toContain('secret words');
  expect((await download).suggestedFilename()).toMatch(/^habit-tracker-backup-2026-09-25\.json$/);

  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('status')).toContainText('Everything was deleted');
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'Start with one habit' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Restored 6 habits');
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);
  expect(after.logs).toEqual(before.logs);
  expect(after.habits.map((h: { name: string }) => h.name)).toEqual(before.habits.map((h: { name: string }) => h.name));
  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page.locator('.score-card')).toContainText('79%');
});

test('empty board: an example opens New habit ready to add', async ({ page }) => {
  await openWith(page, null, '#/');
  await page.getByRole('link', { name: 'Workout 3 times a week' }).click();
  await expect(page.getByLabel('What do you want to do, and how often?')).toHaveValue('Workout 3 times a week');
  await expect(page.getByRole('button', { name: /^Repeat: 3× a week/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add to my board' }).click();
  await expect(tile(page, 'Workout')).toContainText('0 of 3 this week');
});

test('swipe the sheet down to close it; a short swipe springs back; scrolling and text fields still work', async ({ page, context }) => {
  await openWith(page, sampleData(), '#/');
  const cdp = await context.newCDPSession(page);
  /** A finger moving from one point to another over `steps` moves, `ms` apart. */
  const swipe = async (x: number, y0: number, y1: number, steps = 10, ms = 16) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
      await page.waitForTimeout(ms);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const water = tile(page, 'Water');
  await water.click({ button: 'right' });
  const sheet = page.getByRole('dialog', { name: 'Water' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400); // the sheet has slid up
  const box = (await sheet.boundingBox())!;

  // A short, slow pull springs back.
  await swipe(box.x + box.width / 2, box.y + 30, box.y + 70, 10, 40);
  await page.waitForTimeout(400);
  await expect(sheet).toBeVisible();
  expect((await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);

  // Pulling inside the note field doesn't move the sheet.
  const note = (await sheet.getByLabel('Note for today').boundingBox())!;
  await swipe(note.x + 40, note.y + 10, note.y + 300);
  await page.waitForTimeout(400);
  await expect(sheet).toBeVisible();

  // A proper swipe from the top closes it, and focus goes back to the tile.
  await swipe(box.x + box.width / 2, box.y + 30, box.y + 330);
  await expect(sheet).toBeHidden();
  await expect(water).toBeFocused();

  // On a short screen the sheet scrolls: a pull while it's scrolled down scrolls it back instead of closing.
  await page.setViewportSize({ width: 375, height: 520 });
  await water.click({ button: 'right' });
  await page.waitForTimeout(400);
  await sheet.evaluate((el) => (el.scrollTop = 200));
  const small = (await sheet.boundingBox())!;
  await swipe(small.x + small.width / 2, small.y + 150, small.y + 330);
  await page.waitForTimeout(400);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.scrollTop)).toBeLessThan(200);
  // Back at the top, the same swipe closes it.
  await sheet.evaluate((el) => (el.scrollTop = 0));
  await swipe(small.x + small.width / 2, small.y + 20, small.y + 300);
  await expect(sheet).toBeHidden();
});

test('with a mouse, drag the grabber down to close the sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  await openWith(page, sampleData(), '#/');
  await tile(page, 'Read').click({ button: 'right' });
  const sheet = page.getByRole('dialog', { name: 'Read' });
  await page.waitForTimeout(400);
  const grab = (await sheet.locator('.grabber-zone').boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 300, { steps: 12 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await context.close();
});

test('choose how Today lays out the habits: tiles, compact or a list', async ({ page }) => {
  await openWith(page, sampleData(), '#/settings');
  await expect(page.getByRole('radio', { name: 'Tiles' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.locator('.tiles').first()).toHaveClass(/list/);
  // Rows are full width, and a row fills from the left as you log.
  const water = tile(page, 'Water');
  const row = (await water.boundingBox())!;
  expect(row.width).toBeGreaterThan(340);
  await water.click();
  await expect(water).toContainText('6 / 8 glasses');
  const fill = (await water.locator('.fill').boundingBox())!;
  expect(fill.width / row.width).toBeCloseTo(0.75, 1);
  // Options still open on hold.
  await water.click({ button: 'right' });
  await expect(page.getByRole('dialog', { name: 'Water' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Compact' }).click();
  await page.reload();
  await page.getByRole('link', { name: 'Today' }).click();
  const tiles = page.locator('.tiles.compact .tile');
  await expect(tiles).toHaveCount(6);
  // Three in a row on an iPhone.
  const ys = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(ys.filter((y) => y === ys[0])).toHaveLength(3);
  await expect(tile(page, 'Workout')).toContainText('3/4 this week');
});
