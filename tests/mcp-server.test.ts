// @vitest-environment node
import '../mcp/setup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getData, reload, replaceData } from '../src/lib/store';
import { buildParts } from '../src/lib/sync/parts';
import { decryptText, deriveKeys, newPhrase } from '../src/lib/sync/crypto';
import { RelaySync } from '../mcp/relays';
import { sampleData } from '../e2e/fixtures';
import { startRelay, startSilentRelay, startSilentTcp } from './relay-server';

/**
 * The Claude Desktop extension as Claude Desktop runs it: the built,
 * single-file server, started over stdio and driven with the MCP SDK's own
 * client. The relays run inside the test.
 */

const out = mkdtempSync(join(tmpdir(), 'habit-mcp-'));
const server = join(out, 'habit-tracker-mcp.mjs');
const relay = startRelay();
let silentTcp: Awaited<ReturnType<typeof startSilentTcp>>;
const silentWs = startSilentRelay();
const phrase = newPhrase();
const running: { client: Client; stderr: string[]; errors: Error[] }[] = [];

type Result = { content: { type: string; text: string }[]; isError?: boolean };

async function start(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { PATH: process.env.PATH ?? '', DEVICE_NAME: 'Claude Desktop · Test', ...env },
    stderr: 'pipe',
  });
  const stderr: string[] = [];
  transport.stderr?.on('data', (d) => stderr.push(String(d)));
  const client = new Client({ name: 'test', version: '1.0.0' });
  // Anything on stdout that isn't an MCP message ends up here.
  const errors: Error[] = [];
  client.onerror = (err) => errors.push(err);
  await client.connect(transport);
  const entry = { client, stderr, errors };
  running.push(entry);
  return entry;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as Result;
  const text = r.content.map((c) => c.text).join('\n');
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // an error message
  }
  return { text, json, isError: !!r.isError };
}

beforeAll(async () => {
  // Build the server the way `npm run build` does, into a folder of its own.
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.mcp.config.ts', '--outDir', out, '--logLevel', 'error'], {
    stdio: 'inherit',
  });
  silentTcp = await startSilentTcp();
  // The phone has synced the design's habits under the key.
  replaceData(sampleData());
  const phone = new RelaySync(phrase, [relay.url()]);
  await phone.pull();
  await phone.push(buildParts(getData()).keys());
  phone.close();
}, 120_000);

afterAll(async () => {
  for (const r of running) await r.client.close().catch(() => undefined);
  await relay.close();
  await silentWs.close();
  await silentTcp.close();
  rmSync(out, { recursive: true, force: true });
});

describe('the built extension', () => {
  it('is packed with a manifest that lists every tool it has, and asks for the sync key', async () => {
    const zip = unzipSync(readFileSync(join(out, 'habit-tracker.mcpb')));
    expect(Object.keys(zip).sort()).toEqual(['icon.png', 'manifest.json', 'server/index.mjs']);
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    expect(manifest).toMatchObject({ name: 'habit-tracker', display_name: 'Habit Tracker', server: { entry_point: 'server/index.mjs' } });
    expect(manifest.user_config.sync_key).toMatchObject({ sensitive: true, required: true });
    expect(manifest.server.mcp_config.env).toEqual({ SYNC_KEY: '${user_config.sync_key}' });

    const { client } = await start({ SYNC_KEY: phrase, RELAYS: relay.url() });
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(manifest.tools.map((t: { name: string }) => t.name).sort());
  }, 30_000);

  it('reads and writes the habits through the relays, and only MCP goes to stdout', async () => {
    const { client, stderr, errors } = await start({ SYNC_KEY: phrase, RELAYS: `${relay.url()} ${silentTcp.url} ${silentWs.url()}` });
    const list = await call(client, 'list_habits', { date: '2026-09-25' });
    expect(list.isError).toBe(false);
    expect(list.json.habits.map((h: { name: string }) => h.name)).toEqual(['Water', 'Stretch', 'Workout', 'Read', 'Journal', 'Screens off 23:00']);
    expect(list.json.habits[0]).toMatchObject({ status: 'partly done', amount: '5 glasses' });

    const started = Date.now();
    const done = await call(client, 'check_in', { habit: 'journal', date: '2026-09-25', note: 'Wrote about the trip' });
    expect(done.isError).toBe(false);
    expect(done.json).toMatchObject({ habit: 'Journal', status: 'done', note: 'Wrote about the trip' });
    // Relays that never answer don't hold a request up.
    expect(Date.now() - started).toBeLessThan(5000);
    const created = await call(client, 'create_habit', { description: 'Stretch 10 min every morning', name: 'Morning stretch' });
    expect(created.json.created).toMatchObject({ name: 'Morning stretch', type: 'timer', goal: '10 min' });

    // The phone sees both.
    localStorage.clear();
    reload();
    const phone = new RelaySync(phrase, [relay.url()]);
    await phone.pull();
    phone.close();
    expect(getData().logs.journal00001['2026-09-25']).toMatchObject({ value: 1, note: 'Wrote about the trip' });
    expect(getData().habits.map((h) => h.name)).toContain('Morning stretch');

    // Claude Desktop shows up in the app's device list.
    const keys = await deriveKeys(phrase);
    const parts = await Promise.all(
      [...relay.events.values()].filter((e) => e.pubkey === keys.pubkey).map(async (e) => JSON.parse(await decryptText(keys.encKey, e.content))),
    );
    expect(parts.filter((p) => p.kind === 'device')).toEqual([expect.objectContaining({ deviceName: 'Claude Desktop · Test', type: 'claude' })]);

    expect(stderr.join('')).toMatch(/Habit Tracker MCP server .* is running/);
    expect(errors).toEqual([]);
  }, 60_000);

  it('never shows the sync key to Claude', async () => {
    const { client } = await start({ SYNC_KEY: phrase, RELAYS: relay.url() });
    const replies = [
      await call(client, 'list_habits', { include_archived: true }),
      await call(client, 'get_progress', { from: '2026-09-01', to: '2026-09-25' }),
      await call(client, 'check_in', { habit: 'nothing like this' }),
      await call(client, 'edit_habit', { habit: 'Water', name: 'Water' }),
    ];
    const all = replies.map((r) => r.text).join(' ').toLowerCase();
    const words = phrase.split(' ');
    // Not the key, and not even three of its words in a row.
    for (let i = 0; i + 3 <= words.length; i++) expect(all).not.toContain(words.slice(i, i + 3).join(' '));
    for (const r of running) expect(r.stderr.join('')).not.toContain(phrase);
  }, 30_000);

  it('undoes a change no relay accepted, and says so', async () => {
    const { client } = await start({ SYNC_KEY: phrase, RELAYS: relay.url() });
    await call(client, 'list_habits');
    relay.refuse(true);
    try {
      const r = await call(client, 'skip_habit', { habit: 'Water', date: '2026-09-24' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/nothing was saved/);
    } finally {
      relay.refuse(false);
    }
    const after = await call(client, 'list_habits', { date: '2026-09-24' });
    expect(after.json.habits.find((h: { name: string }) => h.name === 'Water')).toMatchObject({ status: 'done' });
  }, 30_000);

  it('explains a missing, mistyped or unused key, and keeps running', async () => {
    const none = await start({ RELAYS: relay.url() });
    expect((await call(none.client, 'list_habits')).text).toMatch(/sync key is not set/);
    const typo = await start({ SYNC_KEY: 'apple banana cherry', RELAYS: relay.url() });
    const t = await call(typo.client, 'check_in', { habit: 'Water' });
    expect(t.isError).toBe(true);
    expect(t.text).toMatch(/not a valid 12-word key/);
    expect(t.text).not.toContain('apple banana cherry');

    const before = relay.events.size;
    const unused = await start({ SYNC_KEY: newPhrase(), RELAYS: relay.url() });
    expect((await call(unused.client, 'list_habits')).text).toMatch(/No synced habits were found/);
    const w = await call(unused.client, 'create_habit', { name: 'Floss' });
    expect(w.isError).toBe(true);
    expect(w.text).toMatch(/Nothing was changed/);
    // Nothing was written under the unused key, not even this computer in a device list.
    expect(relay.events.size).toBe(before);
    // Still answering.
    expect((await unused.client.listTools()).tools.length).toBe(8);
  }, 60_000);

  it('says when the relays cannot be reached, without crashing', async () => {
    const { client } = await start({ SYNC_KEY: phrase, RELAYS: `${silentTcp.url} ws://127.0.0.1:1` });
    const r = await call(client, 'list_habits');
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Couldn't reach any of the sync relays/);
    const w = await call(client, 'check_in', { habit: 'Water' });
    expect(w.text).toMatch(/Nothing was changed/);
    expect((await client.listTools()).tools.length).toBe(8);
  }, 60_000);
});
