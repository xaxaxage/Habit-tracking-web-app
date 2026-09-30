import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AppData } from '../src/lib/types';
import { sampleData, STORAGE_KEY } from './fixtures';
import { startRelay } from '../tests/relay-server';

/**
 * Claude on two people's phones: each turns on sync with their own key, copies
 * their connector address from Settings → Use with Claude, and a real MCP
 * client connects with it to the shared online connector (the built Vercel
 * function, running here) as claude.ai would. A habit checked off through
 * Claude reaches only that person's phone. The relay runs inside the test; the
 * phones use today's real date, like the connector.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const CONNECTOR = '.vercel/output/functions/mcp.func/index.mjs';
const SECRET = 'e2e-connector-secret-that-is-long-enough-to-use';

let relay: ReturnType<typeof startRelay>;
let connector: ChildProcess;
let base = '';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise((r) => server.close(r));
  return port;
}

test.beforeAll(async () => {
  expect(existsSync(CONNECTOR), 'Build the connector first: npm run build:cloud').toBe(true);
  relay = startRelay();
  const port = await freePort();
  connector = spawn(process.execPath, [CONNECTOR], { env: { PATH: process.env.PATH, CONNECTOR_SECRET: SECRET, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  base = `http://127.0.0.1:${port}`;
  await expect.poll(async () => (await fetch(`${base}/`).catch(() => null))?.status ?? 0, { timeout: 15_000 }).toBe(200);
});

test.afterAll(async () => {
  connector?.kill();
  await relay?.close();
});

/** "Today" in a time zone, as YYYY-MM-DD. */
const todayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

/** A phone in a time zone, with its habits and sync (through the test's relay) already on. */
async function phone(browser: Browser, zone: string, data: AppData): Promise<{ context: BrowserContext; page: Page; phrase: string }> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: zone, serviceWorkers: 'block' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The app asks the shared connector for the address; here that's the connector running in the test.
  await context.route(/^https:\/\/[^/]+\/link$/, async (route) => route.fulfill({ response: await route.fetch({ url: `${base}/link` }) }));
  const phrase = generateMnemonic(wordlist, 128);
  const sync = { phrase, relays: [relay.url()], seen: {}, lastSyncAt: 0, devices: {} };
  await context.addInitScript(
    ([key, json, config]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, json);
        localStorage.setItem('habit-tracker:sync', config);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [STORAGE_KEY, JSON.stringify(data), JSON.stringify(sync)],
  );
  const page = await context.newPage();
  await page.goto('./#/settings');
  await expect(page.locator('.sync-status')).toContainText(/Synced/, { timeout: 30_000 });
  return { context, page, phrase };
}

/** Settings → Use with Claude → Show my connector address → Copy the address. */
async function copyAddress(page: Page): Promise<string> {
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Use with Claude' }) });
  await card.getByRole('button', { name: 'Show my connector address' }).click();
  await card.getByRole('button', { name: 'Copy the address' }).click();
  await expect(page.locator('.toast')).toContainText('Connector address copied');
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Claude connecting with an address (to the connector running here, where the address says habits.xaxaxage.vercel.app). */
async function claude(address: string) {
  const url = new URL(address);
  const client = new Client({ name: 'claude-e2e', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}${url.pathname}${url.search}`)));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    const text = r.content.map((c) => c.text).join('\n');
    expect(r.isError, text).toBeFalsy();
    return JSON.parse(text);
  };
  return { client, call };
}

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });

test('each phone gets its own address, and a habit checked off through Claude reaches only that phone', async ({ browser }) => {
  // Ana has the design's habits, in Kyiv; Ben has one of his own, in New York.
  const benData = sampleData();
  const piano = { ...benData.habits[1], id: 'piano0000001', name: 'Piano', icon: 'music' };
  const ana = await phone(browser, 'Europe/Kyiv', sampleData());
  const ben = await phone(browser, 'America/New_York', { ...benData, habits: [piano], logs: {} });
  expect(ana.phrase).not.toBe(ben.phrase);

  const anaAddress = await copyAddress(ana.page);
  const benAddress = await copyAddress(ben.page);
  // Personal, sealed (the key isn't in it), with the phone's time zone (Chromium calls Kyiv by its old name) and its relays.
  expect(anaAddress).toMatch(/^https:\/\/habits\.xaxaxage\.vercel\.app\/mcp\/[A-Za-z0-9_-]{60}\?tz=Europe\/Kiev&r=ws:\/\/127\.0\.0\.1:\d+$/);
  expect(benAddress).toMatch(/\?tz=America\/New_York&r=/);
  expect(anaAddress).not.toBe(benAddress);
  for (const word of ana.phrase.split(' ')) expect(anaAddress).not.toContain(word);

  const anaClaude = await claude(anaAddress);
  const benClaude = await claude(benAddress);
  const [anaToday, benToday] = await Promise.all([anaClaude.call('get_today'), benClaude.call('get_today')]);
  expect(anaToday.date).toBe(todayIn('Europe/Kyiv'));
  expect(benToday.date).toBe(todayIn('America/New_York'));
  expect(anaToday.habits.map((h: { name: string }) => h.name)).toContain('Journal');
  expect(benToday.habits.map((h: { name: string }) => h.name)).toEqual(['Piano']);

  // Ana's phone shows Today; Claude checks Journal off; it arrives on her phone by itself.
  await ana.page.getByRole('link', { name: 'Today' }).click();
  await expect(tile(ana.page, 'Journal')).toHaveAccessibleName(/not done/);
  const done = await anaClaude.call('check_habit', { habit: 'Journal', note: 'Written with Claude' });
  expect(done).toMatchObject({ name: 'Journal', status: 'done', date: todayIn('Europe/Kyiv') });
  await expect(tile(ana.page, 'Journal')).toHaveAccessibleName(/Journal, done/, { timeout: 20_000 });

  // Ben's phone and Ben's Claude never see it.
  await ben.page.getByRole('link', { name: 'Today' }).click();
  await expect(tile(ben.page, 'Piano')).toBeVisible();
  await expect(tile(ben.page, 'Journal')).toHaveCount(0);
  const benStored = await ben.page.evaluate((k) => localStorage.getItem(k)!, STORAGE_KEY);
  expect(benStored).not.toContain('Journal');
  expect(benStored).not.toContain('Written with Claude');
  expect((await benClaude.call('get_today')).habits.map((h: { name: string }) => h.name)).toEqual(['Piano']);

  // The connector shows up in Ana's device list.
  await ana.page.getByRole('link', { name: 'Settings' }).click();
  await expect(ana.page.getByRole('list', { name: /^Devices/ })).toContainText('Claude (online connector)', { timeout: 20_000 });

  await anaClaude.client.close();
  await benClaude.client.close();
  await ana.context.close();
  await ben.context.close();
});

test('without sync, the card says to turn it on first', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('./#/settings');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Use with Claude' }) });
  await expect(card).toContainText('Turn on Sync between devices first');
  await expect(card.getByRole('button', { name: 'Show my connector address' })).toHaveCount(0);
  await context.close();
});
