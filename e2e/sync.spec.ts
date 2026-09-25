import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { sampleData } from './fixtures';
import { openWith } from './helpers';
import { MockRelay, routeRelays } from './relays';

/**
 * Two devices (two browser contexts) syncing through relays that run inside
 * the test: one relay works, one works too, one accepts the connection and
 * never answers, and one refuses. Nothing reaches a real relay.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });

async function device(browser: Browser, relays: [MockRelay, MockRelay], withData: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block',
  });
  (context as unknown as { _tag: string })._tag = withData ? 'A' : 'B';
  await routeRelays(context, relays);
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('console', (m) => process.env.DEBUG_SYNC && console.log(withData ? 'A:' : 'B:', m.type(), m.text().slice(0, 300)));
  await openWith(page, withData ? sampleData() : null, '#/settings', { ownRelays: true });
  return { context, page };
}

async function words(page: Page): Promise<string> {
  const list = page.getByRole('list', { name: 'Sync key' });
  await expect(list.getByRole('listitem')).toHaveCount(12);
  return (await list.getByRole('listitem').allTextContents()).join(' ');
}

const syncStatus = (page: Page) => page.locator('.sync-status');

test('two devices share habits live, catch up after being offline, and part ways with a new key', async ({ browser }) => {
  const relays: [MockRelay, MockRelay] = [new MockRelay(), new MockRelay()];
  const phone = await device(browser, relays, true);
  const laptop = await device(browser, relays, false);
  const [a, b] = [phone.page, laptop.page];

  // ── The phone creates a sync key ──────────────────────────────────────
  await a.getByRole('button', { name: 'Create sync key' }).click();
  const phrase = await words(a);
  await a.getByLabel("I've saved my sync key").check();
  const started = Date.now();
  await a.getByRole('button', { name: 'Start syncing' }).click();
  await expect(syncStatus(a)).toContainText('Synced', { timeout: 15_000 });
  // A relay that never answers doesn't hold things up.
  expect(Date.now() - started).toBeLessThan(8000);
  await expect(syncStatus(a)).toContainText('2 of 4 relays answered');

  // The relays only ever see ciphertext and opaque labels.
  const stored = [...relays[0].events.values()];
  expect(stored.length).toBeGreaterThanOrEqual(8); // habits, 5 months, settings, this device
  expect(stored.every((e) => e.kind === 30078 && e.tags.length === 1 && /^[0-9a-f]{32}$/.test(e.tags[0][1]))).toBe(true);
  const everything = JSON.stringify(stored);
  for (const secret of ['Water', 'Journal', 'glasses', 'Started a new book', '2026-09', phrase.split(' ')[0]]) {
    expect(everything).not.toContain(secret);
  }

  // ── The laptop joins with the same words ──────────────────────────────
  await b.getByRole('button', { name: 'I have a key' }).click();
  await b.getByLabel('Sync key from your other device').fill(phrase.toUpperCase());
  await b.getByRole('button', { name: 'Connect' }).click();
  await expect(b.getByRole('status').filter({ hasText: 'Sync is on' })).toContainText('arrived from your other devices', { timeout: 15_000 });
  await expect(b.getByRole('list', { name: /Devices/ }).getByRole('listitem')).toHaveCount(2);
  await b.getByRole('link', { name: 'Today' }).click();
  await expect(tile(b, 'Water')).toContainText('5 / 8 glasses');
  await expect(tile(b, 'Read')).toContainText('10 / 20 min');
  await b.goto('./#/habit/read00000001');
  await expect(b.getByText('Finished part two.')).toBeVisible();

  // ── Live: a check-in on one shows up on the other ─────────────────────
  await a.getByRole('link', { name: 'Today' }).click();
  await b.getByRole('link', { name: 'Back' }).or(b.getByRole('button', { name: 'Back' })).first().click();
  await tile(b, 'Journal').click();
  await expect(tile(a, 'Journal')).toContainText('Done', { timeout: 15_000 });
  await tile(a, 'Water').click();
  await expect(tile(b, 'Water')).toContainText('6 / 8 glasses', { timeout: 15_000 });

  // ── The laptop goes offline, keeps working, and catches up ────────────
  for (const r of relays) r.block(laptop.context, true);
  await laptop.context.setOffline(true);
  await tile(b, 'Screens off 23:00').click();
  await expect(tile(b, 'Screens off 23:00')).toContainText('Done');
  await b.getByRole('link', { name: 'Settings' }).click();
  await expect(syncStatus(b)).toContainText(/Couldn't reach any relay|online/, { timeout: 20_000 });
  await b.getByRole('link', { name: 'Today' }).click();
  for (const r of relays) r.block(laptop.context, false);
  await laptop.context.setOffline(false);
  await expect(tile(a, 'Screens off 23:00')).toContainText('Done', { timeout: 20_000 });

  // ── Devices: rename, and remove from the list ─────────────────────────
  await b.getByRole('link', { name: 'Settings' }).click();
  await b.getByRole('button', { name: 'Rename this device' }).click();
  await b.getByLabel('Name for this device').fill('Work laptop');
  await b.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByRole('link', { name: 'Settings' }).click();
  const aDevices = a.getByRole('list', { name: /Devices/ });
  await expect(aDevices).toContainText('Work laptop', { timeout: 15_000 });
  await a.getByRole('button', { name: 'Remove Work laptop' }).click();
  await expect(aDevices).not.toContainText('Work laptop');
  await expect(aDevices.getByRole('listitem')).toHaveCount(1);

  // ── The phone changes the key: the laptop stops and asks for it ───────
  await a.getByRole('button', { name: 'Change sync key' }).click();
  const newPhrase = await words(a);
  expect(newPhrase).not.toBe(phrase);
  await a.getByLabel("I've saved the new key").check();
  await a.getByRole('button', { name: 'Switch to the new key' }).click();
  await expect(a.getByRole('status').filter({ hasText: 'Sync key changed' })).toBeVisible({ timeout: 20_000 });
  await expect(syncStatus(a)).toContainText('Synced', { timeout: 15_000 });

  await expect(b.getByText(/The sync key was changed on another device/)).toBeVisible({ timeout: 20_000 });
  // Nothing on the laptop was lost.
  await b.getByRole('link', { name: 'Today' }).click();
  await expect(tile(b, 'Screens off 23:00')).toContainText('Done');
  await b.getByRole('link', { name: 'Settings' }).click();
  await b.getByRole('button', { name: 'Enter the new key' }).click();
  await b.getByLabel('Sync key from your other device').fill(newPhrase);
  await b.getByRole('button', { name: 'Connect' }).click();
  await expect(syncStatus(b)).toContainText('Synced', { timeout: 20_000 });
  await b.getByRole('link', { name: 'Today' }).click();
  await tile(b, 'Stretch').click(); // undo Stretch on the laptop, under the new key
  await a.getByRole('link', { name: 'Today' }).click();
  await expect(tile(a, 'Stretch')).not.toContainText('Done', { timeout: 15_000 });

  // Under the old key, every part now reads "retired".
  const oldAuthor = stored[0].pubkey;
  const old = [...relays[0].events.values()].filter((e) => e.pubkey === oldAuthor);
  expect(old.length).toBeGreaterThanOrEqual(stored.length);
  expect(new Set(old.map((e) => e.content)).size).toBe(old.length); // each one freshly encrypted

  await phone.context.close();
  await laptop.context.close();
});

test('the sync code loads only when a device uses sync', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
  await openWith(page, sampleData(), '#/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Sync between devices' })).toBeVisible();
  expect(scripts.some((u) => /engine|crypto/.test(u))).toBe(false);
});
