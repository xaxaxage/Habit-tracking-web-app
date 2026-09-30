import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  backupJson,
  clearAll,
  deleteHabit,
  parseData,
  renameGroup,
  restoreBackup,
  restoreHabit,
  updateSettings,
  useData,
} from '../lib/store';
import { todayKey } from '../lib/dates';
import { saveFile } from '../lib/files';
import { showToast } from '../lib/toast';
import { loadSyncConfig } from '../lib/sync/state';
import { SyncSettings } from './SyncSettings';
import { ClaudeSettings } from './ClaudeSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { groupsOf, matchGroup, MAX_GROUP, sameGroup } from '../lib/views';

export function Card({ title, id, children }: { title: string; id: string; children: ComponentChildren }) {
  return (
    <section class="card stack" aria-labelledby={id}>
      <h2 id={id} class="section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function exportBackup() {
  const name = `habit-tracker-backup-${todayKey()}.json`;
  await saveFile(new File([backupJson()], name, { type: 'application/json' }), 'Habit Tracker backup');
}

async function importBackup(file: File) {
  try {
    const next = parseData(JSON.parse(await file.text()));
    const checkIns = Object.values(next.logs).reduce((n, days) => n + Object.values(days).filter((l) => l.value > 0 || l.skipped).length, 0);
    const ok = confirm(
      `Replace the habits on this device with the backup (${next.habits.length} habits, ${checkIns} check-ins)?`,
    );
    if (!ok) return;
    restoreBackup(next);
    showToast(`Restored ${next.habits.length} ${next.habits.length === 1 ? 'habit' : 'habits'}`);
  } catch (err) {
    alert(err instanceof SyntaxError ? 'That file is not a valid backup.' : (err as Error).message);
  }
}

/** The groups habits are in: rename one, or take its habits out of it. */
function Groups() {
  const data = useData();
  const groups = groupsOf(data.habits);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const count = (g: string) => data.habits.filter((h) => sameGroup(h.group, g)).length;
  const save = (from: string) => {
    const to = matchGroup(draft, groups.filter((g) => g !== from));
    if (to && to !== from) {
      for (const spelling of new Set(data.habits.filter((h) => sameGroup(h.group, from)).map((h) => h.group!))) renameGroup(spelling, to);
      showToast(`Renamed to ${to}`);
    }
    setEditing(null);
  };
  return (
    <div class="field">
      <span class="field-label">Groups ({groups.length})</span>
      {groups.length === 0 ? (
        <p class="hint">Put habits in groups like Self-care or Education from a habit's edit screen (Group). Today and Week can then show one group at a time.</p>
      ) : (
        <ul class="list plain-list" aria-label="Groups">
          {groups.map((g) =>
            editing === g ? (
              <li class="settings-row" key={g}>
                <form
                  class="row-2 fixed-end grow"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(g);
                  }}
                >
                  <input
                    class="input"
                    aria-label={`New name for ${g}`}
                    maxLength={MAX_GROUP}
                    autoComplete="off"
                    enterKeyHint="done"
                    value={draft}
                    onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                    ref={(el) => el?.focus()}
                  />
                  <button type="submit" class="pill-btn" disabled={!draft.trim()}>
                    Save
                  </button>
                </form>
              </li>
            ) : (
              <li class="settings-row" key={g}>
                <span class="row-main">
                  <span class="row-title">{g}</span>
                  <span class="row-sub">
                    {count(g)} {count(g) === 1 ? 'habit' : 'habits'}
                  </span>
                </span>
                <button
                  type="button"
                  class="pill-btn"
                  aria-label={`Rename ${g}`}
                  onClick={() => {
                    setDraft(g);
                    setEditing(g);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  class="pill-btn danger-text"
                  aria-label={`Remove the group ${g}`}
                  onClick={() => {
                    if (!confirm(`Remove the group "${g}"? Its habits stay, without a group.`)) return;
                    for (const spelling of new Set(data.habits.filter((h) => sameGroup(h.group, g)).map((h) => h.group!))) renameGroup(spelling, '');
                    showToast(`Removed ${g}`);
                  }}
                >
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function HabitSettings() {
  const data = useData();
  const archived = data.habits.filter((h) => h.archivedAt).sort((a, b) => b.archivedAt! - a.archivedAt!);
  return (
    <Card title="Habits" id="habits-title">
      <div class="field">
        <span class="field-label" id="week-start-label">
          Weeks start on
        </span>
        <div class="segmented" role="group" aria-labelledby="week-start-label">
          <button type="button" aria-pressed={data.settings.weekStart === 'mon'} onClick={() => updateSettings({ weekStart: 'mon' })}>
            Monday
          </button>
          <button type="button" aria-pressed={data.settings.weekStart === 'sun'} onClick={() => updateSettings({ weekStart: 'sun' })}>
            Sunday
          </button>
        </div>
      </div>

      <Groups />

      <div class="field">
        <span class="field-label">Archived ({archived.length})</span>
        {archived.length === 0 ? (
          <p class="hint">Habits you archive leave the board and keep their history. They'll be listed here.</p>
        ) : (
          <ul class="list plain-list" aria-label="Archived habits">
            {archived.map((h) => (
              <li class="settings-row" key={h.id}>
                <a class="row-main" href={`#/habit/${h.id}`}>
                  <span class="row-title">{h.name}</span>
                  <span class="row-sub">Open its history</span>
                </a>
                <button
                  type="button"
                  class="pill-btn"
                  onClick={() => {
                    restoreHabit(h.id);
                    showToast(`${h.name} is back on your board`);
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  class="pill-btn danger-text"
                  aria-label={`Delete ${h.name}`}
                  onClick={() => {
                    if (!confirm(`Delete "${h.name}" and all its check-ins and notes? This can't be undone.`)) return;
                    deleteHabit(h.id);
                    showToast(`${h.name} deleted`);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DataSettings() {
  const data = useData();
  const checkIns = Object.values(data.logs).reduce((n, days) => n + Object.values(days).filter((l) => l.value > 0 || l.skipped).length, 0);
  return (
    <Card title="Your data" id="data-title">
      <p class="body-text">
        Everything is saved on this device as you go ({data.habits.length} {data.habits.length === 1 ? 'habit' : 'habits'},{' '}
        {checkIns} {checkIns === 1 ? 'check-in' : 'check-ins'}). Export a backup now and then and keep it in Files or iCloud
        Drive. Backups never contain your sync key.
      </p>
      <div class="button-pair">
        <button type="button" class="btn quiet" onClick={() => exportBackup()}>
          Export backup
        </button>
        <label class="btn quiet file-btn">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = '';
              if (file) importBackup(file);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        class="link-btn danger"
        onClick={() => {
          const synced = !!loadSyncConfig();
          const where = synced ? 'on this device and on every synced device' : 'on this device';
          if (!confirm(`Delete every habit, check-in and note ${where}? This can't be undone.`)) return;
          clearAll();
          showToast('Everything was deleted');
        }}
      >
        Delete everything
      </button>
    </Card>
  );
}

export function Settings() {
  useData();
  return (
    <main class="screen with-nav" aria-labelledby="settings-title">
      <header class="page-head">
        <div>
          <span class="eyebrow">Habit Tracker</span>
          <h1 id="settings-title" class="page-title">
            Settings
          </h1>
        </div>
      </header>

      <SyncSettings />

      <ClaudeSettings />

      <AppearanceSettings />

      <HabitSettings />

      <DataSettings />

      <Card title="On iPhone" id="iphone-title">
        <p class="body-text">
          In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. The app then opens full screen from
          its own icon and works offline. <strong>The Home Screen app keeps its own data, separate from Safari</strong>: habits
          you log in one don't show up in the other (unless sync is on), and removing the icon can delete its data. Export a
          backup first.
        </p>
      </Card>

      <p class="app-version">Version {__APP_VERSION__}</p>
    </main>
  );
}
