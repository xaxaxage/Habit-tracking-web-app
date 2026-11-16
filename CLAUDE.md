# Habit Tracker — notes for Claude

The owner's general preferences (design, animations, sync, connector, testing, git) are in their **app-playbook**
skill. Read it first. This file holds what's specific to this app.

## What and where

- iPhone home-screen web app: https://xaxaxage.github.io/Habit-tracking-web-app/ (built from the Claude Design
  mockup in `design/`).
- Branch `claude/eager-knuth-uzpp19` is the default and deploy branch. Each push runs `.github/workflows/deploy.yml`
  (unit tests, build, `build:cloud`, mcpb check, Playwright, deploy to Pages). The build job is pinned to
  `ubuntu-24.04` for Playwright 1.56.
- Shared Claude connector: https://habits.xaxaxage.vercel.app (Vercel project built from `vercel.json`;
  `CONNECTOR_SECRET` set there). Its host is `SHARED_CONNECTOR_HOST` in `src/lib/connector.ts`.
- `src/screens/` screens, `src/components/` shared UI (Board = draggable tiles, Sheet, ViewChips), `src/lib/` store,
  habits (due days, streaks, stats), order (learned order), views (groups, chips), parse (one-sentence habits),
  icons, theme, motion, dates, router, connector.
- `src/lib/sync/` 12-word sync over Nostr. `mcp/` Claude connector: `tools.ts` and `connector.ts` tools,
  `server.ts` Desktop (stdio), `cloud.ts` and `seal.ts` online (HTTP), `tool-list.ts` for the manifest.
- `tests/` Vitest (`relay-server.ts` is a local Nostr relay with live subscriptions). `e2e/` Playwright, kept in the
  repo: visual diffs against the mockup, layout 1440→280 px, axe, flows, offline, sync, order, groups, Claude.

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` (app + Desktop extension in `dist/mcp/`) ·
`npm run build:cloud` (online connector in `.vercel/output/`) · `npm run test:e2e` (after both builds).

## Decisions for this app (newest first)

- Claude connector tools: `get_today`, `get_summary`, `check_habit` (done / skipped / not done, amounts for counts
  and timers), `list_habits`, `add_habit`, `update_habit`, `archive_habit`. Addresses are `/mcp/<sealed key>?tz=…`
  from `POST /link`; there is no `SYNC_KEY` single-person address. The Desktop extension is a fold in Use with Claude.
- A habit field, color or icon id this version doesn't know (from a newer version) is kept, shown as teal / a check
  mark. When the data model grows, tell people to download the Desktop extension again.
- Groups: one per habit, stored as its name on the habit; none to start with. Rename or remove in Settings → Habits.
- Views: chips above Today and Week: All (the main view), then Morning / Afternoon / Evening / Anytime (only with
  more than 8 habits at different times), then the groups, each with done/due. They wrap, never scroll sideways.
  The view is in the URL (`?show=`); + in a group view starts a habit in that group.
- Week lists habits under their group headings, each with its score and last week's.
- Order: Today shows habits in the order you usually finish them (weighted median of finish times over 8 weeks,
  half-life 21 days; days filled in later and today don't count; no history → time of day, "anytime" last).
- Reorder: hold a tile 450 ms until it lifts, then drag; letting go without moving opens its sheet; Alt+Up/Down
  with a keyboard. A moved habit stays right after the one it was dropped behind until done in the other order on
  7 days. There is no reorder list in Settings (rejected as too slow).
- Rejected: moving done habits into a folded "Done" section (breaks the design).
- Today layouts: tiles (the design), compact, list; per device in Settings → Appearance.
- 12 habit colors (the design's 5 kept exact, plus 7); 67 icons in 9 groups, guessed from the name, most specific
  word first ("Walk the dog" → paw).
- The hold-a-tile sheet closes with a swipe down and has an Edit button.
- Sync: HKDF salt `habit-tracker-sync`; parts `habits`, one per month of check-ins (`YYYY-MM`, split above 90 KB of
  JSON), `settings`, `device:<id>` and retired markers. Week start syncs; palette, animations and layout don't.
- Out of scope (iPhone limits): reminders, push notifications, widgets. The mockup's "Reminder" field is "Icon".

## Known gaps

- The look is the mockup's (dark Night palette by default), not the gym tracker's refined style; see the
  app-playbook skill before restyling.
- The visual tests compare with `design/Design.html` with per-screen thresholds; a deliberate design change needs
  its reason in `e2e/visual.spec.ts`, never a looser threshold.
