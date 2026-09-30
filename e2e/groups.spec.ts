import { expect, test, type Page } from '@playwright/test';
import { groupedData, manyHabits, sampleData, STORAGE_KEY } from './fixtures';
import { openWith } from './helpers';

/** Groups (one per habit), and the views on Today: all, a time of day, a group. */

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });
const shown = (page: Page) => page.locator('.tiles .tile-name').allTextContents();
const chips = (page: Page) => page.getByRole('group', { name: 'Show' });
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);

test('put a habit in a new group, then show just that group on Today', async ({ page }) => {
  await openWith(page, sampleData(), '#/');
  // No groups and only a few habits: nothing to pick.
  await expect(chips(page)).toHaveCount(0);

  await page.goto('/#/habit/journal00001/edit');
  await page.getByRole('button', { name: /^Group: none/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Group' });
  await expect(sheet.getByRole('radio', { name: 'No group' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByLabel('New group').fill('  Self-care ');
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(sheet.getByRole('radio', { name: 'Self-care' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Group: Self-care/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await saved(page)).habits.find((h: { name: string }) => h.name === 'Journal').group).toBe('Self-care');

  await page.goto('/#/');
  await expect(chips(page).getByRole('button')).toHaveText(['All', /Self-care\s*0\/1/]);
  await expect(chips(page).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await chips(page).getByRole('button', { name: /^Self-care/ }).click();
  await expect(page).toHaveURL(/show=g%3ASelf-care/);
  await expect.poll(() => shown(page)).toEqual(['Journal']);

  // Another day keeps the view.
  await page.getByRole('button', { name: /Wednesday 23 September/ }).click();
  await expect(page.getByText('Editing 23 September')).toBeVisible();
  await expect.poll(() => shown(page)).toEqual(['Journal']);

  // + starts a habit in the group being shown.
  await page.getByRole('link', { name: 'New habit' }).click();
  await expect(page.getByRole('button', { name: /^Group: Self-care/ })).toBeVisible();
  await page.getByLabel('What do you want to do, and how often?').fill('Floss every day');
  await page.getByRole('button', { name: 'Add to my board' }).click();
  expect((await saved(page)).habits.find((h: { name: string }) => h.name === 'Floss').group).toBe('Self-care');
  await chips(page).getByRole('button', { name: /^Self-care/ }).click();
  await expect.poll(() => shown(page)).toEqual(['Journal', 'Floss']);

  // All again.
  await chips(page).getByRole('button', { name: 'All' }).click();
  await expect.poll(async () => (await shown(page)).length).toBe(7);
});

test('a group can be picked for another habit, and its name matches whatever the case', async ({ page }) => {
  await openWith(page, groupedData(), '#/habit/water000001/edit');
  await page.getByRole('button', { name: /^Group: Health/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Group' });
  await expect(sheet.getByRole('radio')).toHaveText(['No group', 'Education', 'Health', 'Self-care']);
  await sheet.getByLabel('New group').fill('self-CARE');
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(sheet.getByRole('radio', { name: 'Self-care' })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByRole('radio')).toHaveCount(4);
  await sheet.getByRole('radio', { name: 'No group' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await saved(page)).habits.find((h: { name: string }) => h.name === 'Water')).not.toHaveProperty('group');
});

test('rename and remove groups in Settings', async ({ page }) => {
  await openWith(page, groupedData(), '#/settings');
  const list = page.getByRole('list', { name: 'Groups' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('listitem').filter({ hasText: 'Health' })).toContainText('3 habits');

  await list.getByRole('button', { name: 'Rename Health' }).click();
  await list.getByLabel('New name for Health').fill('Fitness');
  await list.getByRole('button', { name: 'Save' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: 'Fitness' })).toContainText('3 habits');

  page.once('dialog', (d) => d.accept());
  await list.getByRole('button', { name: 'Remove the group Education' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const habits = (await saved(page)).habits as { name: string; group?: string }[];
  expect(Object.fromEntries(habits.map((h) => [h.name, h.group ?? null]))).toEqual({
    Water: 'Fitness',
    Stretch: 'Fitness',
    Workout: 'Fitness',
    Read: null,
    Journal: 'Self-care',
    'Screens off 23:00': 'Self-care',
  });

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(chips(page).getByRole('button')).toHaveText(['All', /Fitness/, /Self-care/]);
});

test('with many habits, the times of day are views too, with how many are done in each', async ({ page }) => {
  const data = manyHabits();
  await openWith(page, data, '#/');
  await expect(chips(page).getByRole('button')).toHaveText([
    'All',
    /^Morning/,
    /^Afternoon/,
    /^Evening/,
    /^Anytime/,
    /^Education/,
    /^Health/,
    /^Household chores and errands/,
    /^Self-care/,
  ]);
  const evening = chips(page).getByRole('button', { name: /^Evening/ });
  await evening.click();
  await expect(evening).toHaveAttribute('aria-pressed', 'true');
  const names = await shown(page);
  const evenings = data.habits.filter((h) => h.time === 'evening').map((h) => h.name);
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(evenings).toContain(n);
  await expect(evening).toHaveAccessibleName(/Evening, \d+ of \d+ done/);
  // Tiles can be moved within a view too.
  const first = names[0];
  await tile(page, names[1]).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => (await shown(page)).slice(0, 2)).toEqual([names[1], first]);
});

test('the week lists habits by group, each with its score, and can show one group', async ({ page }) => {
  await openWith(page, groupedData(), '#/week');
  await expect(page.locator('.week-group-head h2')).toHaveText(['Education', 'Health', 'Self-care']);
  const health = page.getByRole('region', { name: 'Health' });
  const rows = (where: typeof health) => where.locator('.week-row').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(await rows(health)).toEqual(['Water', 'Stretch', 'Workout']);
  // Water 4 of 5 days, Stretch 5 of 5, Workout 3 of its 4 times.
  await expect(health.locator('.week-group-score')).toHaveText(/^12 of 14 · 86% · last week \d+%$/);

  await chips(page).getByRole('button', { name: /^Self-care/ }).click();
  await expect(page).toHaveURL(/show=g%3ASelf-care/);
  await expect(page.locator('.week-group')).toHaveCount(0);
  expect(await rows(page.locator('main'))).toEqual(['Journal', 'Screens off 23:00']);
  await expect(page.getByRole('region', { name: 'Weekly score, Self-care' })).toBeVisible();
  // Earlier weeks keep the view, and + starts a habit in it.
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page).toHaveURL(/start=2026-09-14/);
  await expect(page).toHaveURL(/show=g%3ASelf-care/);
  await expect(page.locator('.week-row')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'New habit' })).toHaveAttribute('href', '#/new?group=Self-care');
});
