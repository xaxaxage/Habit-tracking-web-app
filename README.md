# Habit Tracker

A habit tracker for iPhone and the computer, built as an installable web app from the design in
[`design/`](design/). Tap a tile to check in, see your week and your streaks. No server and no account: your
habits stay on your devices, and sync between them end-to-end encrypted with a 12-word key. A Claude Desktop
extension lets you ask Claude how your habits are going and check in by just saying it.

**App:** https://xaxaxage.github.io/Habit-tracking-web-app/

Built the same way as the [calorie tracker](https://github.com/xaxaxage/Calorie-tracking-web-app), reusing its
tested sync, service worker, palettes, animations, Claude Desktop extension and deploy workflow.

## What it does

- **Today** – your habits as tiles. Tap to log: yes/no habits toggle, counts go up by one (8 glasses of water),
  timers by a few minutes (20 minutes of reading); a full tile starts over, with **Undo**. The tile fills as you
  go, shows your streak, and gets a check when it's done. The number top right is how many are still to do, and
  the strip below it shows the last five days: tap one to log an earlier day. Habits that aren't due today
  (weekend-only, paused) are listed below the board.
- **Hold a tile** (or right-click, or Shift+Enter with a keyboard) – mark done or skip the day (the streak stays),
  set an exact amount, add a note, or go to its week or its history.
- **Week** – every habit day by day. Tap a day to change it: open → done → skipped → open. A score for the week
  (skipped days don't count against you) against last week's; step back through earlier weeks.
- **Habit history** – current and best streak, hit rate and average over the last 18 weeks, an 18-week heatmap,
  your notes, and **Pause** (paused days don't count, so the streak is kept).
- **New habit in one sentence** – "Read 20 min every evening", "Workout 3 times a week", "Drink 8 glasses of
  water", "Run 5 km on Monday and Thursday". The app shows what it understood; tap any part to change it, pick a
  color, and see the tile as it will look. The same screen edits a habit, archives it (off the board, history
  kept) or deletes it.
- **Kinds of habits** – yes/no, a count, or minutes; every day, on chosen weekdays, or N times a week (judged per
  week: a skipped day lowers that week's goal by one); a time of day; one of five colors and 26 icons.
- **Settings** – sync between devices (with the device list and Claude Desktop), appearance, weeks starting on
  Monday or Sunday, the order on the board, archived habits, backups, delete everything, and the app's version.
- **Appearance** – eight palettes: Night (the design), Harbor, Matcha, Ocean, Lavender, Graphite, and the dark
  Espresso and OLED black, plus Auto (Harbor by day, Night in dark mode). Text colors are adjusted until they are
  readable in every palette.
- **Today layout** – the design's big tiles (two in a row), **Compact** tiles (three or more in a row) or a
  **List** (one row per habit, filling from the left): **Settings → Appearance → Today layout**, per device.
- **Animations** – quiet motion that shows what changed: screens fade in, tiles fill, checks pop, the sheet slides
  up, buttons give a little under your finger. **Settings → Appearance → Animations** turns it off; it's also off
  while the device's Reduce Motion setting is on.
- **Works offline** once loaded, and updates itself (see below).

Not included, because a web app can't do them on an iPhone without a server: reminders or push notifications,
and Home Screen widgets. (The design's "Widgets & reminders" board is the one part left out.)

## Install it

**iPhone:** open the app's address in **Safari**, tap **Share** → **Add to Home Screen**, and open it from the new
icon. It runs full screen and works offline.

> On iPhone the Home Screen app keeps its **own data, separate from Safari**: habits logged in a Safari tab don't
> show up in the Home Screen app (unless sync is on). Removing the icon can delete its data, so export a backup
> first. Always use the icon.

**Windows PC:** open the address in Edge or Chrome and choose **Install Habit Tracker** (the install icon in the
address bar, or **⋯ → Apps → Install this site as an app**). Or just keep it in a tab.

**Updates** arrive by themselves: the app looks for a new version when it comes back into view and every hour,
and offers **Reload** when one is ready (or reloads the next time it's in the background). **Settings** shows the
version at the bottom: when it was built and from which commit.

## Sync between devices

Your devices are linked by a **12-word sync key**, not an account.

1. On the first device: **Settings → Sync between devices → Create sync key**. Save the 12 words somewhere safe
   (a password manager or Notes), tick the box, and tap **Start syncing**.
2. On each other device: **Settings → Sync between devices → I have a key**, enter the words and tap **Connect**.
   What's already on that device is combined with what's synced; nothing is overwritten.

From then on every change goes to your other devices within seconds while the app is open. It also syncs fully
when the app starts, when it comes back into view, when the device is back online, and again a little later if the
relays couldn't be reached, so a device that was offline catches up by itself.

- **Devices** lists every device using the key, this one first, with when each was last active and which version
  it runs (Claude Desktop shows up too). Rename this device with the pencil; the bin hides another device from the
  list on every device (it comes back if it's used again).
- **Change sync key** cuts off a device you no longer trust (a lost phone, a computer you don't use anymore, or
  someone who saw your words). Everything moves to a new key first (if that fails, nothing changes); then every
  part stored under the old key is replaced with a "retired" note, so the old words open nothing and devices still
  using them stop syncing and ask for the new key, keeping what they have.
- **Turn off sync on this device** stops syncing and keeps the habits on this device.

### How it works, and what the relays see

- The key is a standard BIP-39 phrase. On the device it's turned (PBKDF2 → HKDF) into a signing key, an
  AES-256-GCM encryption key and a key for naming the data. Everything is compressed and encrypted **before** it
  leaves the device.
- The encrypted parts go to free public [Nostr](https://nostr.com) relays as app-data events (NIP-78, kind
  30078) on four relays at once (`relay.damus.io`, `nos.lol`, `relay.primal.net`, `nostr.mom`; editable under
  **Relays**). A relay sees a random public key, opaque labels and ciphertext: no habit names, dates, amounts or
  notes.
- The data is split into small parts: one for the habits, one per month of check-ins, one for the settings that
  sync (the week's first day). Each stays far below the relays' 64 KB limit, and only parts that changed are sent
  again. (An extremely full month, say long notes on dozens of habits every day, is shared out over several parts.)
- Every device keeps its full copy and merges what it receives, habit by habit and day by day: the newest edit
  wins, and an undo or a deletion wins over older edits. Every device writes a part exactly the same way, so the
  same data always gives the same bytes, and an edit is always stamped later than what it replaced, even when
  another device's clock runs ahead. A part's timestamp on the relays never goes backwards.
- A relay that is down, or that accepts the connection and then never answers, doesn't hold anything up: a sync
  finishes shortly after the first relay answers, and a change counts as saved once any relay has it.
- **Separate from the calorie tracker.** The keys are derived with this app's own salt (`habit-tracker-sync`), so
  the same 12 words used in both apps give completely different keys: neither app can find, read or overwrite
  the other's data.
- The palette and the Animations switch stay per device (a dark phone, a light laptop). Backups never contain the
  sync key.

Public relays are run by volunteers and can be slow or go away, which is why several are used and why each device
keeps a full copy; export a backup now and then. Anyone with the 12 words can read and change your habits.
**Delete everything** deletes on every synced device.

## Use with Claude Desktop

Ask Claude *"how are my habits going this week?"*, *"what's my reading streak?"*, or just tell it *"I drank 3
glasses of water"*, *"skip the workout today"*, *"add a habit: stretch 10 minutes every morning"*. The change
shows up in the app within seconds.

It's a small local MCP server that uses the same encrypted sync as your devices, so turn on **Sync between
devices** first.

**Install (Windows or Mac):**

1. Download the extension: in the app, **Settings → Sync between devices → Use with Claude Desktop → Download**,
   or directly:
   [`habit-tracker.mcpb`](https://xaxaxage.github.io/Habit-tracking-web-app/mcp/habit-tracker.mcpb).
2. Open the file with Claude Desktop: double-click it, or drag it into **Settings → Extensions**. Click
   **Install**.
3. When it asks for the **sync key**, paste your 12 words (**Show sync key** or **Copy the 12 words** in the app).
4. Start a new chat and ask about your habits. (If Claude doesn't use it, check that **Habit Tracker** is turned on
   in **Settings → Extensions**.)

Claude Desktop runs it with its own built-in Node.js; nothing else needs installing. To update, download and open
the file again. It appears in the app's device list as **Claude Desktop · Windows**. If you change the sync key,
paste the new words into the extension's settings too (**Settings → Extensions → Habit Tracker**).

**What Claude can do:**

| Tool | |
| --- | --- |
| `list_habits` | Every habit and how today (or any day) is going: done, amount, skipped, note, streak |
| `get_progress` | Progress and streaks over a period, per habit and day by day |
| `check_in` | Log a habit as done, or an amount (`add` adds to the day's total), on any day, by name or id |
| `undo_check_in` | Take back a check-in or a skip |
| `skip_habit` | Skip a day; the streak stays |
| `create_habit` | Add a habit from a sentence ("Read 20 min every evening") and/or fields |
| `edit_habit` | Change the name, type, goal, schedule, time of day, color or icon; pause or resume |
| `archive_habit` | Take a habit off the board keeping its history, or put it back |

**Privacy:** the extension runs on your computer and talks only to the sync relays. What it reads goes into your
conversation with Claude, like anything else you share there. The sync key is stored by Claude Desktop, marked as
sensitive, and never shown to Claude. With a key that has no habits (a typo), it writes nothing at all, not even
itself into a device list.

<details>
<summary>Without the extension (other MCP apps, Claude Code, manual setup on Windows)</summary>

The same server as a single file, for any MCP client. It needs [Node.js](https://nodejs.org) 20 or newer.

1. Download
   [`habit-tracker-mcp.mjs`](https://xaxaxage.github.io/Habit-tracking-web-app/mcp/habit-tracker-mcp.mjs)
   (right-click → **Save link as**), e.g. to `C:\Users\<you>\habit-tracker-mcp.mjs`.
2. Claude Desktop: **Settings → Developer → Edit Config** opens `%APPDATA%\Claude\claude_desktop_config.json`
   (for example `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`; on a Mac
   `~/Library/Application Support/Claude/claude_desktop_config.json`). Add:

   ```json
   {
     "mcpServers": {
       "habit-tracker": {
         "command": "node",
         "args": ["C:\\Users\\<you>\\habit-tracker-mcp.mjs"],
         "env": { "SYNC_KEY": "your twelve words here" }
       }
     }
   }
   ```

   Then quit Claude Desktop completely (also from the tray icon next to the clock) and open it again. Its logs
   are in `%APPDATA%\Claude\logs\mcp-server-habit-tracker.log`.
3. Claude Code: `claude mcp add habit-tracker -e SYNC_KEY="your twelve words here" -- node C:\Users\<you>\habit-tracker-mcp.mjs`

Optional: `RELAYS` (space- or comma-separated `wss://` URLs) to use other relays than the app's defaults, and
`DEVICE_NAME` for its name in the app's device list.

</details>

## Your data

Everything lives in the browser storage (`localStorage`) of the app on each device, as one JSON record under
`habit-tracker:v1`: your habits (name, kind, goal, schedule, color, icon, pauses) and, per habit and day, what
happened (the amount, a skip, a note). Every change is saved the moment you make it. If the device's storage is
ever full, a red banner says so and the change stays on screen until it can be saved.

- **Backups:** **Settings → Export backup** opens the share sheet on iPhone (save to Files or iCloud Drive) or
  downloads a JSON file on a computer. **Import backup** restores it exactly, also on a new phone; habits you had
  deleted since come back. Backups never contain the sync key.
- **Capacity:** a check-in takes about 45 bytes: ten habits every day for a year is about 165 KB, and browsers
  allow a few MB per site.
- The calorie tracker lives on the same web address; the two apps use different storage keys and caches and never
  touch each other's data.

## Decisions and assumptions

States and screens the design doesn't show were designed in the same style:

- **Name:** the design had none, so the app is "Habit Tracker" ("Habits" on the Home Screen).
- **Settings** is new, in the design's cards; it's the gear in the bottom bar, next to Today and Week.
- **Empty board:** "Start with one habit" with the design's example sentences; the week and a new habit's history
  say what will show up there. A day with nothing due says so.
- **Crowded boards and long names** (tested with 34 habits and 60-character names): tiles show two lines of the
  name, rows cut off with "…", and everything scrolls; the progress segments get thinner gaps.
- **Not due today:** weekend-only, paused or not-yet-started habits are listed under the board, still tappable.
- **Errors:** a full storage shows a red banner; sync problems show in Settings with what to do; a missing habit
  or page says so with a way back.
- **Loading:** there is nothing to wait for (the data is on the device); sync shows "Syncing…" in Settings.
- **Touch targets** are at least 44 × 44 px: the week grid's days and the example chips have a 44 px tap area
  around the design's 40 px and 36 px shapes, and each week row is 3 px taller than in the mockup.
- **Reminders** are out of scope, so the New habit screen's "Reminder" field became **Icon**, and a habit's page
  says "Evening" instead of "reminder 21:30". A fifth habit color (Spanish orange, used by the design's Journal)
  can be picked too.

## Development

Requires Node.js 22.

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest), including the built Claude Desktop server over stdio
npm run build        # type-check, build the app to dist/ and the extension to dist/mcp/
npm run test:e2e     # Playwright against the production build (after npm run build), at iPhone size
npm run preview      # serve the production build
```

Playwright uses its Chromium (in the cloud container, the preinstalled one); the first time elsewhere run
`npx playwright install chromium`. The end-to-end tests cover:

- **the design** – side-by-side screenshots of each screen next to the mockup (`design/Design.html`) on the
  mockup's own data, written to `test-results/visual/`, failing when they drift apart;
- **layout** – no screen is ever wider than the window from 1440 px down to 280 px, controls are at least 44 px
  at 390 × 844 and 375 × 667, focus is always visible, the scrollbar gutter is stable;
- **accessibility** – axe (WCAG 2.1 AA) on every screen and sheet, in dark and light palettes; a unit test checks
  the contrast of every color pair in every palette;
- **what people do** – adding habits from a sentence, tapping and undoing, the hold sheet, the week grid,
  earlier days, keyboard use, pausing and archiving, a full storage, backup round trips, palettes and animations;
- **offline and updates** – against a copy of the build served from a sub-folder like GitHub Pages;
- **sync** – two browser contexts and relays that run inside the test (two that work, one that accepts the
  connection and never answers, one that refuses); tests never contact a public relay.

To check the extension's manifest with the official tool without adding it to the project:

```bash
mkdir -p /tmp/mcpb/ext && cd /tmp/mcpb && npm install @anthropic-ai/mcpb@2
cd ext && unzip -o /path/to/dist/mcp/habit-tracker.mcpb && ../node_modules/.bin/mcpb validate manifest.json
```

Stack: [Vite](https://vite.dev) + [Preact](https://preactjs.com) + TypeScript, hash routes, no backend. The
sync and crypto code ([`nostr-tools`](https://github.com/nbd-wtf/nostr-tools),
[`@scure/bip39`](https://github.com/paulmillr/scure-bip39)) loads only on devices that use sync. A service worker
generated at build time loads the page from the network first, keeps a copy for offline use, never caches
downloads, and caches only HTML as the app page.

```
src/
  app.tsx            routes → screens
  screens/           Today, Week, HabitPage (history), HabitForm (new/edit), Settings, SyncSettings, AppearanceSettings
  components/        tiles, the hold-a-tile sheet, icons, bottom bar, toast, sheets
  lib/               store (localStorage), habits (due days, streaks, stats), parse (one-sentence habits),
                     theme (palettes), motion, dates, router
  lib/sync/          sync key and encryption, parts and merging, relay engine, devices
mcp/                 Claude Desktop extension: MCP tools and sync without a browser (built by vite.mcp.config.ts)
design/              the design mockup (Design.html) and its boards, readable
tests/               unit tests; e2e/  Playwright tests
scripts/             make-icons.mjs draws the app icons
```

## Deploy

`.github/workflows/deploy.yml` runs the unit and Playwright tests, builds, checks the extension's manifest and
publishes to GitHub Pages on every push to `main` (and to this feature branch).

One-time setup: in the repository, **Settings → Pages → Source: GitHub Actions**. Any static host works too:
upload `dist/`. The app uses relative paths and hash routes, so it can live in a sub-folder.

## Credits

- Fonts: [Onest](https://fonts.google.com/specimen/Onest) and [Unbounded](https://fonts.google.com/specimen/Unbounded),
  SIL Open Font License, self-hosted.
- Sync over [Nostr](https://nostr.com) relays run by volunteers.
