import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyMerged, getData } from '../src/lib/store';
import { isValidPhrase, normalizePhrase } from '../src/lib/sync/crypto';
import { DEFAULT_RELAYS, isRelayUrl } from '../src/lib/sync/state';
import { HABIT_COLORS } from '../src/lib/types';
import { HABIT_ICONS } from '../src/lib/icons';
import { OfflineError, RelaySync, type DeviceInfo } from './relays';
import { addHabit, archiveHabitTool, checkHabit, getSummary, getToday, listHabits, ToolError, updateHabitTool, type WriteResult } from './tools';

/**
 * The Habit Tracker connector: tools for Claude that read and change the same
 * habits as the app, through the app's encrypted device sync. Runs in Claude
 * Desktop (server.ts, over stdio) or online for claude.ai and the Claude
 * phone apps (cloud.ts, over HTTP). Ported from the calorie tracker's.
 */

declare const __MCP_VERSION__: string;

export const INSTRUCTIONS = `These tools read and change the user's Habit Tracker: the same habits and check-ins as in the app on their phone, kept in sync.

Dates are YYYY-MM-DD in the user's local time; leave the date out for today. Call get_today or list_habits before changing anything by id. A habit can also be named by its name (or the start of it).

Habits are yes/no (done or not), a count (e.g. 8 glasses) or a timer (minutes). They repeat every day, on chosen weekdays, or a number of times a week, and can be in a group (e.g. Self-care, Education). A skipped day keeps the streak; today never breaks a streak until it's over.

To check a habit off ("I drank 3 glasses", "read for 25 minutes", "did my workout yesterday"), call check_habit. For counts and timers pass the amount; add: true adds it to what's already logged that day. Use status "skipped" when the user deliberately skips a day, and "not_done" to take a check-off back.

After a change, tell the user briefly what was logged and how the streak or the day stands.`;

/** Where the connector runs, for messages that say how to fix its setup. */
export type Host = 'desktop' | 'cloud';

const MESSAGES: Record<Host, { missing: string; invalid: string; retired: string; noData: string }> = {
  desktop: {
    missing:
      "The sync key is not set. In the app, open Settings → Sync between devices, turn sync on and copy the 12 words; then paste them into this extension's settings in Claude Desktop (Settings → Extensions → Habit Tracker), or set SYNC_KEY for this server.",
    invalid:
      "The sync key is not a valid 12-word key. Copy it again from the app (Settings → Sync between devices → Show sync key) and update this extension's settings in Claude Desktop.",
    retired:
      "The sync key was changed in the app, so the one set up here doesn't open the habits anymore. Copy the new 12 words (in the app: Settings → Sync between devices → Show sync key), paste them into this extension's settings in Claude Desktop (Settings → Extensions → Habit Tracker), and restart Claude Desktop.",
    noData:
      'No synced habits were found for this sync key. In the app, check that sync is on (Settings → Sync between devices) and that the 12 words match the ones set up in Claude Desktop.',
  },
  cloud: {
    missing:
      "This connector isn't set up yet. Whoever runs it needs to set CONNECTOR_SECRET in its Vercel project (Settings → Environment Variables) and redeploy.",
    invalid: 'This connector address is not valid. Copy your connector address from the app again (Settings → Use with Claude).',
    retired:
      "The sync key was changed in the app, so this connector address doesn't open the habits anymore. Copy the new address in the app (Settings → Use with Claude) and replace this connector's address in Claude (Customize → Connectors).",
    noData:
      'No synced habits were found for this connector address. In the app, check that sync is on (Settings → Sync between devices), then copy the address again (Settings → Use with Claude).',
  },
};

/** Relay addresses from a setting: separated by commas, spaces or new lines. */
export function relaysFrom(text: string | null | undefined): string[] {
  return (text ?? '').split(/[\s,]+/).filter(isRelayUrl);
}

export interface ConnectorOptions {
  /** The 12 words, as pasted. */
  syncKey: string;
  /** Relays to use; the app's defaults when empty. */
  relays: string[];
  /** How it shows up in the app's device list. */
  device: Omit<DeviceInfo, 'version'>;
  host: Host;
  /**
   * Runs before each request's work, while it has the habits to itself: an online connector
   * serving several people puts this person's data (and time zone) in place here.
   */
  enter?: () => void;
}

export interface Connector {
  /** The sync key, normalized. */
  phrase: string;
  /** Why the connector can't work as set up, if it can't. */
  setupProblem: string | null;
  sync: RelaySync | null;
  /** A server with the tools, to connect to a transport. Every server shares the same habits. */
  newServer(): McpServer;
  /** Fetch the habits now, so the first question doesn't wait for them. */
  warmUp(): Promise<void>;
}

type Reply = { content: { type: 'text'; text: string }[]; isError?: boolean };

// One request at a time, even across people, so a write never races a pull and each request
// has the (one, shared) in-memory store to itself.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

const reply = (value: unknown): Reply => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 1) }] });
const failure = (message: string): Reply => ({ content: [{ type: 'text', text: message }], isError: true });

export function createConnector({ syncKey, relays, device, host, enter = () => {} }: ConnectorOptions): Connector {
  const say = MESSAGES[host];
  const phrase = normalizePhrase(syncKey);
  const setupProblem = !phrase ? say.missing : !isValidPhrase(phrase) ? say.invalid : null;
  const sync = setupProblem
    ? null
    : new RelaySync(phrase, relays.length ? relays : DEFAULT_RELAYS, { ...device, version: __MCP_VERSION__ });

  /** Parts no relay accepted yet; retried on the next request. */
  const pending = new Set<string>();

  const mine = <T>(task: () => Promise<T>) =>
    serial(() => {
      enter();
      return task();
    });

  async function retryPending(s: RelaySync) {
    if (pending.size === 0) return;
    const { failed } = await s.push([...pending]);
    pending.clear();
    failed.forEach((n) => pending.add(n));
  }

  /** Pull, finish earlier uploads, and keep this connector in the app's device list. */
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
    return mine(async (): Promise<Reply> => {
      if (!sync) return failure(setupProblem!);
      try {
        let note: string | undefined;
        try {
          await refresh(sync);
        } catch (err) {
          if (!(err instanceof OfflineError) || !sync.lastPullAt) throw err;
          note = `Offline: these are the habits as of ${new Date(sync.lastPullAt).toLocaleTimeString()}.`;
        }
        if (sync.retiredAt) return failure(say.retired);
        if (!note && sync.partCount === 0) note = say.noData;
        const value = run() as object;
        return reply(note ? { note, ...value } : value);
      } catch (err) {
        return explain(err, false);
      }
    });
  }

  function write(run: () => WriteResult<object>) {
    return mine(async (): Promise<Reply> => {
      if (!sync) return failure(setupProblem!);
      try {
        await refresh(sync);
        if (sync.retiredAt) return failure(`${say.retired} Nothing was changed.`);
        if (sync.partCount === 0) return failure(`${say.noData} Nothing was changed.`);
        const before = getData();
        const { result, touched } = run();
        const { sent, failed } = await sync.push(touched);
        if (failed.length > 0 && sent === 0) {
          // No relay has it, so no other device will: take it back rather than pretend it's saved.
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

  function newServer(): McpServer {
    const server = new McpServer({ name: 'habit-tracker', version: __MCP_VERSION__ }, { instructions: INSTRUCTIONS });
    registerTools(server, read, write);
    return server;
  }

  return {
    phrase,
    setupProblem,
    sync,
    newServer,
    warmUp: () => (sync ? mine(() => refresh(sync)) : Promise.resolve()),
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────

function registerTools(server: McpServer, read: (run: () => unknown) => Promise<Reply>, write: (run: () => WriteResult<object>) => Promise<Reply>) {
  const date = z.string().optional().describe("Day as YYYY-MM-DD in the user's local time. Leave out for today.");
  const habit = z.string().min(1).describe('The habit: its id from get_today or list_habits, or its name (or the start of it).');
  const group = z.string().optional().describe('Only the habits in this group (list_habits shows the groups).');
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
    group: z
      .string()
      .max(30)
      .optional()
      .describe('The group it belongs to, e.g. "Self-care" or "Education" (one per habit). A new name starts a group; "" takes it out of its group.'),
  };
  const annotations = (write: boolean, extra: { destructiveHint?: boolean; idempotentHint?: boolean } = {}) =>
    write
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...extra }
      : { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    'get_today',
    {
      title: 'Habits for today',
      description:
        'The habits due today (or on a given day), in the order the user usually does them: each done, skipped or pending, with progress for counts and timers ("5 of 8 glasses"), this week for "times a week" habits, the current streak and the note; plus which habits are not due and why.',
      inputSchema: { date, group },
      annotations: annotations(false),
    },
    (input) => read(() => getToday(input)),
  );

  server.registerTool(
    'get_summary',
    {
      title: 'Completion over a period',
      description:
        'Completion per habit and per day over a period (default: the last 7 days): days done out of the days due (weeks met for "times a week" habits), average amounts, current and best streaks, and day by day for up to a month (or for one habit); with groups, the completion of each group.',
      inputSchema: {
        from: z.string().optional().describe('First day, YYYY-MM-DD. Default: 6 days before "to".'),
        to: z.string().optional().describe('Last day, YYYY-MM-DD. Default: today.'),
        habit: habit.optional(),
        group,
      },
      annotations: annotations(false),
    },
    (input) => read(() => getSummary(input)),
  );

  server.registerTool(
    'check_habit',
    {
      title: 'Check a habit off',
      description:
        'Mark a habit done, skipped or not done on a day (default today). For count and timer habits give the amount (minutes for timers); without one, "done" means the full goal. add: true adds the amount to what is already logged that day. "skipped" keeps the streak; "not_done" takes a check-off back.',
      inputSchema: {
        habit,
        date,
        status: z.enum(['done', 'skipped', 'not_done']).optional().describe('Default: done.'),
        amount: z.number().min(0).max(1_000_000).optional(),
        add: z.boolean().optional(),
        note: z.string().max(500).optional().describe('A short note for that day.'),
      },
      annotations: annotations(true, { idempotentHint: false }),
    },
    (input) => write(() => checkHabit(input)),
  );

  server.registerTool(
    'list_habits',
    {
      title: 'All habits',
      description: 'Every habit (or those in one group) with its id, type, goal, schedule, time of day, color, icon, group and streak; archived ones on request.',
      inputSchema: { include_archived: z.boolean().optional().describe('Also list archived habits.'), group },
      annotations: annotations(false),
    },
    (input) => read(() => listHabits(input)),
  );

  server.registerTool(
    'add_habit',
    {
      title: 'Add a habit',
      description:
        'Add a habit to the board. Describe it in a sentence, as in the app ("Read 20 min every evening", "Workout 3 times a week", "Drink 8 glasses of water"), and/or give the fields, which win over what the sentence says.',
      inputSchema: { description: z.string().max(160).optional(), ...fields },
      annotations: annotations(true),
    },
    (input) => write(() => addHabit(input)),
  );

  server.registerTool(
    'update_habit',
    {
      title: 'Change a habit',
      description: "Change a habit's name, type, goal, unit, schedule, time of day, color, icon or group, or pause it (paused days keep the streak) and resume it.",
      inputSchema: { habit, ...fields, paused: z.boolean().optional().describe('true to pause from today, false to resume.') },
      annotations: annotations(true, { idempotentHint: true }),
    },
    (input) => write(() => updateHabitTool(input)),
  );

  server.registerTool(
    'archive_habit',
    {
      title: 'Archive a habit',
      description: 'Take a habit off the board, keeping its history (restore: true puts an archived habit back).',
      inputSchema: { habit, restore: z.boolean().optional() },
      annotations: annotations(true, { idempotentHint: true }),
    },
    (input) => write(() => archiveHabitTool(input)),
  );
}
