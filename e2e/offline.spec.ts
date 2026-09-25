import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { sampleData, STORAGE_KEY } from './fixtures';

/**
 * The service worker, against a copy of the build served from a sub-folder
 * like GitHub Pages: works offline, loads the page from the network first,
 * never caches downloads, and offers a reload when a new version is ready.
 */

test.use({ serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial' });

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mcpb': 'application/zip',
};
const BASE = '/Habit-tracking-web-app/';

let dir: string;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'habit-site-'));
  cpSync(resolve('dist'), dir, { recursive: true });
  mkdirSync(join(dir, 'mcp'), { recursive: true });
  writeFileSync(join(dir, 'mcp', 'test.mcpb'), 'PK fake extension');
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (!path.startsWith(BASE)) return void res.writeHead(404).end();
    let file = join(dir, path.slice(BASE.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) return void res.writeHead(404).end('Not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}${BASE}`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

/** Open the app and wait until the service worker controls the page. */
async function openControlled(page: Page) {
  await page.addInitScript(
    ([key, json]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, json);
    },
    [STORAGE_KEY, JSON.stringify(sampleData())] as const,
  );
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('works offline, on every screen', async ({ page, context }) => {
  await openControlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Water,/ })).toBeVisible();
  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page.getByText('check-ins')).toBeVisible();
  await page.goto(`${origin}#/settings`);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // Fonts come from the cache too.
  expect(await page.evaluate(() => document.fonts.check('700 28px Unbounded'))).toBe(true);
  await context.setOffline(false);
});

test('loads the page from the network first, and keeps the newest copy for offline', async ({ page, context }) => {
  await openControlled(page);
  const index = join(dir, 'index.html');
  const original = readFileSync(index, 'utf8');
  try {
    writeFileSync(index, original.replace('<title>', '<meta name="edition" content="two" /><title>'));
    await page.reload();
    await expect(page.locator('meta[name=edition]')).toHaveAttribute('content', 'two');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('meta[name=edition]')).toHaveAttribute('content', 'two');
  } finally {
    writeFileSync(index, original);
    await context.setOffline(false);
  }
});

test('never caches downloads, and only HTML becomes the app page', async ({ page, context }) => {
  await openControlled(page);
  const ok = await page.evaluate(async () => (await fetch('./mcp/test.mcpb')).ok);
  expect(ok).toBe(true);
  // Opening a file that isn't a page must not replace the cached app.
  await page.goto(`${origin}manifest.webmanifest`);
  await page.goto(origin);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    const page = await caches.match('./');
    return { urls, pageType: page?.headers.get('content-type') ?? '' };
  });
  expect(cached.urls.some((u) => u.includes('/mcp/'))).toBe(false);
  expect(cached.pageType).toContain('text/html');
  expect((await page.evaluate(() => caches.keys())).every((k) => k.startsWith('habit-tracker-'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Water,/ })).toBeVisible();
  await context.setOffline(false);
});

test('offers a reload when a new version is ready, and shows the version in Settings', async ({ page }) => {
  await openControlled(page);
  await page.goto(`${origin}#/settings`);
  await expect(page.getByText(/^Version \d{4}-\d{2}-\d{2} \d{2}:\d{2} · ([0-9a-f]{7}|local)$/)).toBeVisible();

  const sw = join(dir, 'sw.js');
  const original = readFileSync(sw, 'utf8');
  try {
    writeFileSync(sw, original.replace(/const VERSION = '([^']+)';/, "const VERSION = '$1-next';"));
    // Coming back into view looks for a new version.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const toast = page.getByRole('status');
    await expect(toast).toContainText('A new version of the app is ready', { timeout: 15_000 });
    // It stays while you move around.
    await page.getByRole('link', { name: 'Today' }).click();
    await expect(toast).toContainText('A new version of the app is ready');
    await Promise.all([page.waitForEvent('load'), toast.getByRole('button', { name: 'Reload' }).click()]);
    await expect(page.getByRole('button', { name: /^Water,/ })).toBeVisible();
  } finally {
    writeFileSync(sw, original);
  }
});
