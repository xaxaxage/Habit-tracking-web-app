import type { Page } from '@playwright/test';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { AppData } from '../src/lib/types';
import type { SyncConfig } from '../src/lib/sync/state';
import { NOW, STORAGE_KEY } from './fixtures';

/** A sync setup as if this device had been syncing for a while, with other devices in the list. */
export function syncedConfig(): SyncConfig {
  const t = Date.parse(NOW);
  return {
    phrase: generateMnemonic(wordlist, 128),
    relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'],
    seen: {},
    lastSyncAt: t - 5 * 60_000,
    devices: {
      'phone-0000-0001': { kind: 'device', name: 'device:phone-0000-0001', id: 'phone-0000-0001', deviceName: 'iPhone · Home Screen app', type: 'phone', version: '2026-09-25 09:12 · 5c8290d', seenAt: t - 3600_000 },
      'claude-000-0001': { kind: 'device', name: 'device:claude-000-0001', id: 'claude-000-0001', deviceName: 'Claude Desktop · Windows', type: 'claude', version: '1.20260925.1200', seenAt: t - 86_400_000 },
      'laptop-000-0001': { kind: 'device', name: 'device:laptop-000-0001', id: 'laptop-000-0001', deviceName: "George's very long named work laptop in the office upstairs", type: 'computer', version: '2026-09-24 18:00 · 4033c2d', seenAt: t - 3 * 86_400_000 },
    },
  };
}

/** Open the app on the design's day with the given data already saved. */
export async function openWith(
  page: Page,
  data: AppData | null,
  hash = '#/',
  opts: { sync?: SyncConfig; ownRelays?: boolean } = {},
) {
  await page.clock.setFixedTime(new Date(NOW));
  // Never reach a real relay from a test; sync tests route their own stand-ins.
  if (!opts.ownRelays) await page.routeWebSocket(/.*/, (ws) => ws.close({ code: 1008, reason: 'offline in tests' }));
  const seed: [string, string][] = [];
  if (data) seed.push([STORAGE_KEY, JSON.stringify(data)]);
  if (opts.sync) seed.push(['habit-tracker:sync', JSON.stringify(opts.sync)]);
  if (seed.length) {
    await page.addInitScript((items) => {
      // Only on the first load: the app's own saves must survive reloads.
      if (!sessionStorage.getItem('seeded')) {
        for (const [key, json] of items) localStorage.setItem(key, json);
        sessionStorage.setItem('seeded', '1');
      }
    }, seed);
  }
  await page.goto(`./${hash}`);
  await page.locator('main').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
