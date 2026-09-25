import type { ComponentChildren } from 'preact';
import {
  backupJson,
  clearAll,
  deleteHabit,
  moveHabit,
  parseData,
  restoreBackup,
  restoreHabit,
  updateSettings,
  useData,
} from '../lib/store';
import { boardHabits } from '../lib/habits';
import { todayKey } from '../lib/dates';
import { saveFile } from '../lib/files';
import { showToast } from '../lib/toast';
import { ChevronDown, ChevronUp } from '../components/Icons';
import { loadSyncConfig } from '../lib/sync/state';
import { SyncSettings } from './SyncSettings';

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

function HabitSettings() {
  const data = useData();
  const active = boardHabits(data);
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

      {active.length > 1 && (
        <details class="fold">
          <summary>Order on the board</summary>
          <ul class="list plain-list" aria-label="Order on the board">
            {active.map((h, i) => (
              <li class="settings-row" key={h.id}>
                <span class="row-main">
                  <span class="row-title">{h.name}</span>
                </span>
                <button type="button" class="round-btn" aria-label={`Move ${h.name} up`} disabled={i === 0} onClick={() => moveHabit(h.id, -1)}>
                  <ChevronUp size={18} />
                </button>
                <button
                  type="button"
                  class="round-btn"
                  aria-label={`Move ${h.name} down`}
                  disabled={i === active.length - 1}
                  onClick={() => moveHabit(h.id, 1)}
                >
                  <ChevronDown size={18} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

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
