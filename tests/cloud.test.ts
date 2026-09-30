// @vitest-environment node
import { MemoryStorage } from '../mcp/setup';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHabit, getData, reload, setLog } from '../src/lib/store';
import { decryptText, deriveKeys, newPhrase } from '../src/lib/sync/crypto';
import { buildParts } from '../src/lib/sync/parts';
import { RelaySync } from '../mcp/relays';
import { seal, sealKeys, unseal } from '../mcp/seal';
import { startRelay } from './relay-server';

/**
 * The shared online connector (mcp/cloud.ts) over HTTP, driven with the MCP
 * SDK's own client, with relays inside the test. Everyone's phone syncs its
 * own habits; the connector answers each person from theirs.
 */

vi.stubGlobal('__MCP_VERSION__', '1.0.0-test');

const SECRET = 'correct-horse-battery-staple-and-more-random-text';

/** "Today" in a time zone, as YYYY-MM-DD. */
const todayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

/** A fresh copy of the connector (it reads its settings when loaded), served on a local port. */
async function startConnector(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const { default: handler } = await import('../mcp/cloud');
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const clients: Client[] = [];
  return {
    base,
    async connect(path: string) {
      const client = new Client({ name: 'test', version: '1' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}${path}`)));
      clients.push(client);
      return client;
    },
    link: (syncKey: string, path = '/link') =>
      fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ syncKey }) }),
    async stop() {
      await Promise.all(clients.map((c) => c.close()));
      await new Promise((r) => server.close(r));
      for (const k of Object.keys(env)) delete process.env[k];
      delete process.env.TZ;
    },
  };
}

/** Someone's phone: their own storage and sync, like the app, in their own time zone. */
function phone(phrase: string, relays: string[], zone: string) {
  const storage = new MemoryStorage();
  const sync = new RelaySync(phrase, relays);
  const on = async <T,>(work: () => Promise<T>): Promise<T> => {
    const before = globalThis.localStorage;
    globalThis.localStorage = storage as unknown as Storage;
    reload();
    try {
      return await work();
    } finally {
      globalThis.localStorage = before;
    }
  };
  return {
    /** A new yes/no habit, done today if asked. */
    add: (name: string, done = false) =>
      on(async () => {
        await sync.pull();
        const today = todayIn(zone);
        const h = createHabit({ name, kind: 'check', target: 1, unit: '', schedule: { type: 'daily' }, time: 'anytime', color: 'teal', icon: 'check' }, today);
        if (done) setLog(h.id, today, { value: 1 });
        await sync.push(buildParts(getData()).keys());
      }),
    data: () =>
      on(async () => {
        await sync.pull();
        return getData();
      }),
    /** Drop the phone's relay connections (it opens them again when it syncs). */
    disconnect: () => sync.disconnect(),
    close: () => sync.close(),
  };
}

type Called = { error: boolean; text: string; json: any };

const call = async (client: Client, name: string, args: Record<string, unknown> = {}): Promise<Called> => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const text = r.content.map((c) => c.text).join('\n');
  return { error: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
};

const names = (today: { habits: { name: string }[] }) => today.habits.map((h) => h.name);

describe('sealed addresses', () => {
  it('seal a sync key so only the same secret opens it, always to the same 60 characters', async () => {
    const keys = await sealKeys(SECRET);
    const phrase = newPhrase();
    const token = await seal(keys, phrase);
    expect(token).toMatch(/^[A-Za-z0-9_-]{60}$/);
    // The same key (however it was typed) always gets the same address.
    expect(await seal(keys, `  ${phrase.toUpperCase()} `)).toBe(token);
    expect(await seal(await sealKeys(SECRET), phrase)).toBe(token);
    expect(await unseal(keys, token)).toBe(phrase);
    expect(await seal(keys, newPhrase())).not.toBe(token);
    // Another secret can't open it.
    expect(await unseal(await sealKeys(`${SECRET}!`), token)).toBeNull();
    // Nor can anything altered.
    for (let i = 0; i < 60; i += 7) {
      const altered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      expect(await unseal(keys, altered), `character ${i}`).toBeNull();
    }
    expect(await unseal(keys, 'x'.repeat(60))).toBeNull();
    expect(await unseal(keys, token.slice(1))).toBeNull();
    await expect(seal(keys, 'not twelve words')).rejects.toThrow(/sync key/);
  });
});

describe('shared online connector', () => {
  const relay = startRelay();
  const other = startRelay();
  const ana = newPhrase();
  const ben = newPhrase();
  const cleo = newPhrase();
  const phones: Record<string, ReturnType<typeof phone>> = {};
  let app: Awaited<ReturnType<typeof startConnector>>;
  const address: Record<string, string> = {};

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 50));
    // Ana is in the first time zone of the day, Ben in the last: their "today" is never the same date.
    phones.ana = phone(ana, [relay.url()], 'Pacific/Kiritimati');
    phones.ben = phone(ben, [relay.url()], 'Etc/GMT+12');
    phones.cleo = phone(cleo, [other.url()], 'UTC');
    await phones.ana.add('Meditate', true);
    await phones.ana.add('Floss');
    await phones.ben.add('Run');
    await phones.cleo.add('Read');
    app = await startConnector({ CONNECTOR_SECRET: SECRET, RELAYS: relay.url() });
    for (const [who, phrase] of Object.entries({ ana, ben, cleo })) {
      const res = await app.link(phrase);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      address[who] = `/mcp/${(await res.json()).token}`;
    }
  });

  afterAll(async () => {
    await app.stop();
    Object.values(phones).forEach((p) => p.close());
    await relay.close();
    await other.close();
  });

  it('says it is running and whether it is set up, without giving anything away', async () => {
    const text = await (await fetch(`${app.base}/`)).text();
    expect(text).toMatch(/Habit Tracker connector for Claude, version 1.0.0-test, is running/);
    expect(text).toMatch(/ready \(CONNECTOR_SECRET is set\)/);
    expect(text).not.toContain(SECRET);
    expect(await (await fetch(`${app.base}/mcp`)).text()).toMatch(/is running/);
    expect(await (await fetch(`${app.base}/health`)).text()).toMatch(/is running/);
  });

  it('makes addresses for the app, and turns away anything that is not a sync key', async () => {
    expect((await app.link('twelve words that are not a sync key at all no no no no')).status).toBe(400);
    const bad = await fetch(`${app.base}/link`, { method: 'POST', body: 'not json' });
    expect(bad.status).toBe(400);
    expect((await app.link(ana, '/mcp?action=link')).status).toBe(200);
    const again = await (await app.link(ana)).json();
    expect(`/mcp/${again.token}`).toBe(address.ana);
    const preflight = await fetch(`${app.base}/link`, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect((await fetch(`${app.base}/link`)).status).toBe(405);
  });

  it('answers only at addresses it made, and only to POST', async () => {
    const token = address.ana.slice(5);
    const altered = token.slice(0, 20) + (token[20] === 'a' ? 'b' : 'a') + token.slice(21);
    for (const path of [`/mcp/${altered}`, `/mcp/${'0'.repeat(32)}`, `/mcp/${'A'.repeat(60)}`, `/mcp?token=${altered}`, '/sse', `/x/${token}`]) {
      const res = await fetch(`${app.base}${path}`, { method: 'POST', body: '{}' });
      expect(res.status, path).toBe(404);
    }
    // No long-lived streams, no sessions to end.
    expect((await fetch(`${app.base}${address.ana}`, { headers: { accept: 'text/event-stream' } })).status).toBe(405);
    expect((await fetch(`${app.base}${address.ana}`, { method: 'DELETE' })).status).toBe(405);
  });

  it('gives each person their own habits and their own "today", even when they ask at the same moment', async () => {
    const a = await app.connect(`${address.ana}?tz=Pacific/Kiritimati`);
    const b = await app.connect(`${address.ben}?tz=Etc/GMT%2B12`);
    const { tools } = await a.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['add_habit', 'archive_habit', 'check_habit', 'get_summary', 'get_today', 'list_habits', 'update_habit']);
    expect(a.getInstructions()).toMatch(/YYYY-MM-DD in the user's local time/);
    expect(a.getInstructions()).toMatch(/Call get_today or list_habits before changing anything by id/);

    for (let round = 0; round < 3; round++) {
      const [dayA, dayB, listA, listB] = await Promise.all([call(a, 'get_today'), call(b, 'get_today'), call(a, 'list_habits'), call(b, 'list_habits')]);
      expect(dayA.json.date).toBe(todayIn('Pacific/Kiritimati'));
      expect(dayB.json.date).toBe(todayIn('Etc/GMT+12'));
      expect(dayA.json.date).not.toBe(dayB.json.date);
      expect(names(dayA.json)).toEqual(['Meditate', 'Floss']);
      expect(dayA.json.habits[0]).toMatchObject({ status: 'done' });
      expect(names(dayB.json)).toEqual(['Run']);
      expect(names(listA.json)).toEqual(['Meditate', 'Floss']);
      expect(names(listB.json)).toEqual(['Run']);
    }
  });

  it("checks a habit off only in that person's habits, which their phone then gets", async () => {
    const b = await app.connect(`${address.ben}?tz=Etc/GMT%2B12`);
    const done = await call(b, 'check_habit', { habit: 'Run', note: 'Five easy kilometres' });
    expect(done.error, done.text).toBe(false);
    expect(done.json).toMatchObject({ name: 'Run', status: 'done', date: todayIn('Etc/GMT+12') });

    const benData = await phones.ben.data();
    const run = benData.habits.find((h) => h.name === 'Run')!;
    expect(benData.logs[run.id][todayIn('Etc/GMT+12')]).toMatchObject({ value: 1, note: 'Five easy kilometres' });
    const anaData = await phones.ana.data();
    expect(anaData.habits.map((h) => h.name)).toEqual(['Meditate', 'Floss']);
    expect(JSON.stringify(anaData.logs)).not.toContain('Five easy');

    const a = await app.connect(`${address.ana}?tz=Pacific/Kiritimati`);
    const dayA = (await call(a, 'get_today')).json;
    expect(dayA.summary).toEqual({ done: 1, pending: 1, skipped: 0, due: 2 });
  });

  it('shows up in the device list as "Claude (online connector)", with the same id every time', async () => {
    const keys = await deriveKeys(ana);
    const parts = await Promise.all(
      [...relay.events.values()].filter((e) => e.pubkey === keys.pubkey).map(async (e) => JSON.parse(await decryptText(keys.encKey, e.content))),
    );
    const devices = parts.filter((p) => p.kind === 'device');
    expect(devices).toEqual([expect.objectContaining({ deviceName: 'Claude (online connector)', type: 'claude', version: '1.0.0-test' })]);
    // A new instance (or another person's) uses the same id.
    const benKeys = await deriveKeys(ben);
    const benParts = await Promise.all(
      [...relay.events.values()].filter((e) => e.pubkey === benKeys.pubkey).map(async (e) => JSON.parse(await decryptText(benKeys.encKey, e.content))),
    );
    expect(benParts.find((p) => p.kind === 'device').id).toBe(devices[0].id);
  });

  it('uses the relays named in the address', async () => {
    const without = await app.connect(address.cleo);
    expect((await call(without, 'get_today')).json.note).toMatch(/No synced habits were found/);
    const withRelay = await app.connect(`${address.cleo}?r=${encodeURIComponent(other.url())}`);
    expect(names((await call(withRelay, 'get_today')).json)).toEqual(['Read']);
  });

  it('also answers with the address as a query (as Vercel may pass it)', async () => {
    const query = await app.connect(`/mcp?token=${address.ana.slice(5)}&tz=Pacific/Kiritimati`);
    expect(names((await call(query, 'get_today')).json)).toEqual(['Meditate', 'Floss']);
  });

  it('closes its relay connections once no request is being answered', async () => {
    // (Only the connector's count: the phones let go of theirs first.)
    Object.values(phones).forEach((p) => p.disconnect());
    await expect.poll(() => relay.connections(), { timeout: 3000 }).toBe(0);
    const a = await app.connect(`${address.ana}?tz=Pacific/Kiritimati`);
    await call(a, 'get_today');
    await expect.poll(() => relay.connections(), { timeout: 3000 }).toBe(0);
    // And opens them again for the next question.
    expect(names((await call(a, 'get_today')).json)).toEqual(['Meditate', 'Floss']);
  });

  it('never shows the sync key, the address or the secret to Claude', async () => {
    const a = await app.connect(`${address.ana}?tz=Pacific/Kiritimati`);
    const replies = [
      await call(a, 'get_today'),
      await call(a, 'get_summary', { from: todayIn('Pacific/Kiritimati') }),
      await call(a, 'list_habits', { include_archived: true }),
      await call(a, 'check_habit', { habit: 'nothing like this' }),
      await call(a, 'update_habit', { habit: 'Floss', name: 'Floss' }),
    ];
    const all = replies.map((r) => r.text).join(' ').toLowerCase();
    const words = ana.split(' ');
    for (let i = 0; i + 3 <= words.length; i++) expect(all).not.toContain(words.slice(i, i + 3).join(' '));
    expect(all).not.toContain(address.ana.slice(5).toLowerCase());
    expect(all).not.toContain(SECRET);
  });
});

describe('shared online connector, not set up', () => {
  it('without a long enough CONNECTOR_SECRET, explains the setup instead of answering', async () => {
    const app = await startConnector({ CONNECTOR_SECRET: 'too short' });
    try {
      const text = await (await fetch(`${app.base}/`)).text();
      expect(text).toMatch(/not set up/);
      expect(text).toMatch(/too short/);
      expect(text).not.toContain('too short to use (too short');
      const link = await app.link(newPhrase());
      expect(link.status).toBe(503);
      expect((await link.json()).error).toMatch(/CONNECTOR_SECRET/);
      expect((await fetch(`${app.base}/mcp/${'A'.repeat(60)}`, { method: 'POST' })).status).toBe(503);
    } finally {
      await app.stop();
    }
  });

  it('without any, says so', async () => {
    const app = await startConnector({ CONNECTOR_SECRET: undefined });
    try {
      expect(await (await fetch(`${app.base}/`)).text()).toMatch(/Connector addresses: not set up: set CONNECTOR_SECRET/);
    } finally {
      await app.stop();
    }
  });
});
