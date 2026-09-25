import './setup';
import { createHash } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { applyMerged, getData } from '../src/lib/store';
import { isValidPhrase, normalizePhrase } from '../src/lib/sync/crypto';
import { DEFAULT_RELAYS, isRelayUrl } from '../src/lib/sync/state';
import { HABIT_COLORS } from '../src/lib/types';
import { HABIT_ICONS } from '../src/lib/icons';
import { OfflineError, RelaySync } from './relays';
import {
  archiveHabitTool,
  checkIn,
  createHabitTool,
  editHabit,
  getProgress,
  listHabits,
  skipHabit,
  ToolError,
  undoCheckIn,
  type WriteResult,
} from './tools';

/**
 * Habit Tracker for Claude Desktop: a local MCP server that reads and writes
 * the same habits as the app, through the app's encrypted device sync. Set
 * SYNC_KEY to the 12 words from the app (Settings → Sync). Ported from the
 * calorie tracker's extension.
 */

declare const __MCP_VERSION__: string;

const INSTRUCTIONS = `These tools read and change the user's Habit Tracker: the same habits and check-ins as in the app on their phone, kept in sync.

Dates are YYYY-MM-DD in the user's local time; leave the date out for today. A habit can be named by its name (or the start of it) or by its id from list_habits.

Habits are yes/no (done or not), a count (e.g. 8 glasses) or a timer (minutes). They repeat every day, on chosen weekdays, or a number of times a week. A skipped day keeps the streak; today never breaks a streak until it's over.

To log something ("I drank 3 glasses", "read for 25 minutes", "did my workout yesterday"), call check_in. For counts and timers pass the amount; add: true adds to what's already logged that day. Use skip_habit when the user deliberately skips a day, and undo_check_in to take one back.

After a change, tell the user briefly what was logged and how the streak or the day stands.`;

// ── Configuration ─────────────────────────────────────────────────────────

const phrase = normalizePhrase(process.env.SYNC_KEY ?? '');
const relays = (process.env.RELAYS ?? '').split(/[\s,]+/).filter(isRelayUrl);
const setupProblem = !phrase
  ? 'The sync key is not set. In the app, open Settings → Sync between devices, turn sync on and copy the 12 words; then paste them into this extension\'s settings in Claude Desktop (Settings → Extensions → Habit Tracker), or set SYNC_KEY for this server.'
  : !isValidPhrase(phrase)
    ? 'The sync key is not a valid 12-word key. Copy it again from the app (Settings → Sync between devices → Show sync key) and update this extension\'s settings in Claude Desktop.'
    : null;

const PLATFORM: Record<string, string> = { win32: 'Windows', darwin: 'Mac', linux: 'Linux' };
const deviceName = (process.env.DEVICE_NAME ?? '').trim().slice(0, 60) || `Claude Desktop · ${PLATFORM[process.platform] ?? process.platform}`;

/** The same id every time on this computer, so restarting doesn't add another device to the app's list. */
function deviceId(): string {
  let user = '';
  try {
    user = userInfo().username;
  } catch {
    // no user name available
  }
  return createHash('sha256').update(`habit-tracker-mcp|${hostname()}|${user}|${deviceName}`).digest('hex').slice(0, 32);
}

const sync = setupProblem
  ? null
  : new RelaySync(phrase, relays.length ? relays : DEFAULT_RELAYS, { id: deviceId(), name: deviceName, version: __MCP_VERSION__ });

const RETIRED =
  "The sync key was changed in the app, so the one set up here doesn't open the habits anymore. Copy the new 12 words (in the app: Settings → Sync between devices → Show sync key), paste them into this extension's settings in Claude Desktop (Settings → Extensions → Habit Tracker), and restart Claude Desktop.";

const NO_DATA =
  'No synced habits were found for this sync key. In the app, check that sync is on (Settings → Sync between devices) and that the 12 words match the ones set up in Claude Desktop.';

/** Parts no relay accepted yet; retried on the next request. */
const pending = new Set<string>();

// ── Running tools ─────────────────────────────────────────────────────────

type Reply = { content: { type: 'text'; text: string }[]; isError?: boolean };

const reply = (value: unknown): Reply => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 1) }] });
const failure = (message: string): Reply => ({ content: [{ type: 'text', text: message }], isError: true });

// One request at a time, so a write never races a pull.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function retryPending(s: RelaySync) {
  if (pending.size === 0) return;
  const { failed } = await s.push([...pending]);
  pending.clear();
  failed.forEach((n) => pending.add(n));
}

/** Pull, finish earlier uploads, and keep this computer in the app's device list. */
async function refresh(s: RelaySync) {
  await s.pull();
  if (s.retiredAt) return;
  await retryPending(s);
  await s.announce().catch((err) => console.error('Could not update the device list:', (err as Error).message));
}

function explain(err: unknown, writing: boolean): Reply {
  if (err instanceof ToolError) return failure(err.message);
  if (err instanceof OfflineError) return failure(writing ? `${err.message} Nothing was changed.` : err.message);
  console.error(err);
  return failure(`Something went wrong: ${(err as Error)?.message ?? String(err)}`);
}

function read(run: () => unknown) {
  return serial(async (): Promise<Reply> => {
    if (!sync) return failure(setupProblem!);
    try {
      let note: string | undefined;
      try {
        await refresh(sync);
      } catch (err) {
        if (!(err instanceof OfflineError) || !sync.lastPullAt) throw err;
        note = `Offline: these are the habits as of ${new Date(sync.lastPullAt).toLocaleTimeString()}.`;
      }
      if (sync.retiredAt) return failure(RETIRED);
      if (!note && sync.partCount === 0) note = NO_DATA;
      const value = run() as object;
      return reply(note ? { note, ...value } : value);
    } catch (err) {
      return explain(err, false);
    }
  });
}

function write(run: () => WriteResult<object>) {
  return serial(async (): Promise<Reply> => {
    if (!sync) return failure(setupProblem!);
    try {
      await refresh(sync);
      if (sync.retiredAt) return failure(`${RETIRED} Nothing was changed.`);
      if (sync.partCount === 0) return failure(`${NO_DATA} Nothing was changed.`);
      const before = getData();
      const { result, touched } = run();
      const { sent, failed } = await sync.push(touched);
      if (failed.length > 0 && sent === 0) {
        applyMerged(before);
        return failure("Couldn't reach any of the sync relays, so nothing was saved. Check the internet connection and try again.");
      }
      failed.forEach((n) => pending.add(n));
      const note = failed.length ? 'Saved, but not every change reached the relays yet; it will finish uploading on the next request.' : undefined;
      return reply(note ? { note, ...result } : result);
    } catch (err) {
      return explain(err, true);
    }
  });
}

// ── Tools ─────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'habit-tracker', version: __MCP_VERSION__ }, { instructions: INSTRUCTIONS });

const date = z.string().optional().describe("Day as YYYY-MM-DD in the user's local time. Leave out for today.");
const habit = z.string().min(1).describe('The habit: its name (or the start of it) or its id from list_habits.');
const note = z.string().max(500).optional().describe('A short note for that day.');
const fields = {
  name: z.string().min(1).max(60).optional().describe('Name shown on the tile, e.g. "Read".'),
  type: z.enum(['yes_no', 'count', 'timer']).optional().describe('yes_no: done or not. count: a number of things. timer: minutes.'),
  goal: z.number().positive().optional().describe('Daily goal for count (e.g. 8) and timer (minutes, e.g. 20) habits.'),
  unit: z.string().max(20).optional().describe('What a count counts, e.g. "glasses", "pages".'),
  repeat: z.enum(['every_day', 'weekdays', 'weekends', 'days', 'times_per_week']).optional(),
  days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7).optional().describe('With repeat "days".'),
  times_per_week: z.number().int().min(1).max(7).optional().describe('With repeat "times_per_week".'),
  time_of_day: z.enum(['anytime', 'morning', 'afternoon', 'evening']).optional(),
  color: z.enum(HABIT_COLORS as [string, ...string[]]).optional(),
  icon: z.enum(HABIT_ICONS.map((i) => i.id) as [string, ...string[]]).optional(),
};

server.registerTool(
  'list_habits',
  {
    title: 'Habits and how today is going',
    description:
      "Every habit with its id, goal and schedule, and how it stands on a day (default today): done, partly done (with the amount), skipped, not done or not due, the note, the streak, and for 'times a week' habits the week so far.",
    inputSchema: { date, include_archived: z.boolean().optional().describe('Also list archived habits.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  (input) => read(() => listHabits(input)),
);

server.registerTool(
  'get_progress',
  {
    title: 'Progress and streaks over a period',
    description:
      'For each habit (or one habit) over a period (default: the last 7 days): days done out of the days due (weeks met for "times a week" habits), hit rate, average amount, current and best streak, and day by day for up to a month or for one habit.',
    inputSchema: {
      from: z.string().optional().describe('First day, YYYY-MM-DD. Default: 6 days before "to".'),
      to: z.string().optional().describe('Last day, YYYY-MM-DD. Default: today.'),
      habit: habit.optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  (input) => read(() => getProgress(input)),
);

server.registerTool(
  'check_in',
  {
    title: 'Check in',
    description:
      'Log a habit as done on a day (default today). For count and timer habits give the amount (minutes for timers); without one it counts as the full goal. add: true adds the amount to what is already logged that day.',
    inputSchema: {
      habit,
      date,
      amount: z.number().min(0).max(1_000_000).optional(),
      add: z.boolean().optional(),
      note,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  (input) => write(() => checkIn(input)),
);

server.registerTool(
  'undo_check_in',
  {
    title: 'Undo a check-in',
    description: 'Take back what was logged for a habit on a day (default today): done, an amount or a skip. A note stays.',
    inputSchema: { habit, date },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => undoCheckIn(input)),
);

server.registerTool(
  'skip_habit',
  {
    title: 'Skip a day',
    description: "Mark a habit as skipped on a day (default today): it doesn't count against the user and the streak stays.",
    inputSchema: { habit, date, note },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => skipHabit(input)),
);

server.registerTool(
  'create_habit',
  {
    title: 'Create a habit',
    description:
      'Add a habit to the board. Describe it in a sentence, as in the app ("Read 20 min every evening", "Workout 3 times a week", "Drink 8 glasses of water"), and/or give the fields, which win over what the sentence says.',
    inputSchema: { description: z.string().max(160).optional(), ...fields },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  (input) => write(() => createHabitTool(input)),
);

server.registerTool(
  'edit_habit',
  {
    title: 'Change a habit',
    description: 'Change a habit\'s name, type, goal, unit, schedule, time of day, color or icon, or pause it (paused days keep the streak) and resume it.',
    inputSchema: { habit, ...fields, paused: z.boolean().optional().describe('true to pause from today, false to resume.') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => editHabit(input)),
);

server.registerTool(
  'archive_habit',
  {
    title: 'Archive a habit',
    description: 'Take a habit off the board, keeping its history (restore: true puts an archived habit back).',
    inputSchema: { habit, restore: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => archiveHabitTool(input)),
);

// ── Start ─────────────────────────────────────────────────────────────────

// A stray error in a library must not end the server: Claude Desktop would show it as
// disconnected until restarted. Log it (it lands in Claude Desktop's log) and carry on.
process.on('uncaughtException', (err) => console.error('Unexpected error, still running:', err));
process.on('unhandledRejection', (err) => console.error('Unexpected error, still running:', err));

async function main() {
  if (setupProblem) console.error(setupProblem);
  const transport = new StdioServerTransport();
  const stop = () => {
    sync?.close();
    process.exit(0);
  };
  transport.onclose = stop;
  process.stdin.on('end', stop);
  await server.connect(transport);
  console.error(`Habit Tracker MCP server ${__MCP_VERSION__} is running.`);
  // Fetch the habits now, so the first question doesn't wait for them.
  if (sync) serial(() => refresh(sync)).catch((err) => console.error('First sync failed:', (err as Error).message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
