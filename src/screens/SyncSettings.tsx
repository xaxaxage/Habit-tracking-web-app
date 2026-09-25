import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_RELAYS, isRelayUrl, loadSyncConfig, useSyncStatus, type SyncStatus } from '../lib/sync/state';
import { deviceShown, type DevicePart, type DeviceType } from '../lib/sync/parts';
import { renameThisDevice, thisDevice } from '../lib/sync/device';
import { showToast } from '../lib/toast';
import { dayMonth, dayOf } from '../lib/dates';
import { Chat, ComputerIcon, Pencil, PhoneIcon, TabletIcon, Trash } from '../components/Icons';

type Mode = 'idle' | 'create' | 'join' | 'show' | 'change';

// The sync code (crypto and relays) loads only when it's needed.
const crypto = () => import('../lib/sync/crypto');
const engine = () => import('../lib/sync/engine');

function ago(ms: number | undefined): string {
  if (!ms) return 'not yet';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return dayMonth(dayOf(ms));
}

function statusText(s: SyncStatus): string {
  const relays = s.relaysTotal ? ` · ${s.relaysOk ?? 0} of ${s.relaysTotal} relays answered` : '';
  switch (s.state) {
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return `Synced ${ago(s.lastSyncAt)}${relays}`;
    case 'offline':
      return s.message ?? 'Offline. It will sync when connected.';
    case 'error':
      return s.message ?? 'Sync failed';
    default:
      return 'Off';
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Sync key copied');
  } catch {
    showToast("Couldn't copy. Select the words and copy them instead.");
  }
}

function Words({ phrase }: { phrase: string }) {
  return (
    <ol class="words" aria-label="Sync key">
      {phrase.split(' ').map((w) => (
        <li>{w}</li>
      ))}
    </ol>
  );
}

function SavedCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label class="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{children}</span>
    </label>
  );
}

const DEVICE_ICON: Record<DeviceType, typeof Chat> = { phone: PhoneIcon, tablet: TabletIcon, computer: ComputerIcon, claude: Chat };

/** Every device using the sync key, this one first, then by when they were last used. */
function DeviceList({ devices }: { devices: Record<string, DevicePart> }) {
  const me = thisDevice();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) nameInput.current?.select();
  }, [renaming]);
  const mine: DevicePart = {
    kind: 'device',
    name: `device:${me.id}`,
    id: me.id,
    deviceName: me.name,
    type: me.type,
    version: __APP_VERSION__,
    seenAt: Date.now(),
  };
  const others = Object.values(devices)
    .filter((d) => d.id !== me.id && deviceShown(d))
    .sort((a, b) => b.seenAt - a.seenAt);
  const list = [mine, ...others];

  const saveName = async (e: Event) => {
    e.preventDefault();
    renameThisDevice(name);
    setRenaming(false);
    const { announceNow } = await engine();
    await announceNow().catch(() => undefined);
  };

  const remove = async (d: DevicePart) => {
    const ok = confirm(
      `Remove "${d.deviceName}" from the list?\n\nThis only hides it: if it's still used with this sync key, it shows up again. To stop a device from syncing, change the sync key.`,
    );
    if (!ok) return;
    try {
      const { removeDevice } = await engine();
      await removeDevice(d.id);
      showToast(`Removed ${d.deviceName}`);
    } catch (err) {
      showToast((err as Error).message || 'Could not remove it. Try again.');
    }
  };

  return (
    <div class="field">
      <h3 id="devices-title" class="field-label">
        Devices ({list.length})
      </h3>
      <ul class="list plain-list" aria-labelledby="devices-title">
        {list.map((d) => {
          const Icon = DEVICE_ICON[d.type] ?? ComputerIcon;
          const isMe = d.id === me.id;
          return (
            <li key={d.id} class="settings-row device-row">
              <span class="device-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              {isMe && renaming ? (
                <form class="device-rename" onSubmit={saveName}>
                  <input
                    id="device-name"
                    class="input"
                    aria-label="Name for this device"
                    maxLength={60}
                    placeholder={me.name}
                    value={name}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                    ref={nameInput}
                  />
                  <button type="submit" class="pill-btn">
                    Save
                  </button>
                  <button type="button" class="pill-btn" onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <span class="row-main">
                  <span class="row-title">{d.deviceName}</span>
                  <span class="row-sub">
                    {isMe ? 'This device' : `Active ${ago(d.seenAt)}`}
                    {d.version ? ` · ${d.version}` : ''}
                  </span>
                </span>
              )}
              {isMe
                ? !renaming && (
                    <button
                      type="button"
                      class="round-btn"
                      aria-label="Rename this device"
                      onClick={() => {
                        setName(me.name);
                        setRenaming(true);
                      }}
                    >
                      <Pencil size={18} />
                    </button>
                  )
                : (
                    <button type="button" class="round-btn" aria-label={`Remove ${d.deviceName}`} onClick={() => remove(d)}>
                      <Trash size={18} />
                    </button>
                  )}
            </li>
          );
        })}
      </ul>
      <p class="hint">
        Each device shows up once it has synced. Removing one only hides it; to stop a device from syncing, change the sync
        key.
      </p>
    </div>
  );
}

export function SyncSettings() {
  const status = useSyncStatus();
  const retiredAt = loadSyncConfig()?.retiredAt;
  const enabled = status.state !== 'off' && !retiredAt;
  const [mode, setMode] = useState<Mode>('idle');
  const [phrase, setPhrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [input, setInput] = useState('');
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [relayText, setRelayText] = useState('');

  // Fill the relay list once sync is on (not when the section opens, which could overwrite typing).
  useEffect(() => {
    if (enabled) setRelayText((loadSyncConfig()?.relays ?? DEFAULT_RELAYS).join('\n'));
  }, [enabled]);

  useEffect(() => {
    if (mode !== 'join') return;
    let live = true;
    crypto().then(({ isValidPhrase }) => live && setValid(isValidPhrase(input)));
    return () => {
      live = false;
    };
  }, [mode, input]);

  const start = async (words: string, joining: boolean) => {
    setBusy(true);
    setError('');
    try {
      const { enableSync } = await engine();
      const { added } = await enableSync(words);
      setMode('idle');
      setPhrase('');
      setInput('');
      showToast(joining && added > 0 ? `Sync is on: ${added} habits and check-ins arrived from your other devices` : 'Sync is on');
    } catch (err) {
      setError((err as Error).message || 'Could not start sync.');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = async () => {
    const { newPhrase } = await crypto();
    setPhrase(newPhrase());
    setSaved(false);
    setMode('create');
  };

  const openChange = async () => {
    const { newPhrase } = await crypto();
    setPhrase(newPhrase());
    setSaved(false);
    setError('');
    setMode('change');
  };

  const changeKey = async () => {
    setBusy(true);
    setError('');
    try {
      const { changeSyncKey } = await engine();
      await changeSyncKey(phrase);
      setPhrase('');
      setMode('show');
      showToast('Sync key changed. Enter the new key on your other devices.');
    } catch (err) {
      setError((err as Error).message || 'Could not change the sync key.');
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <section class="card stack" aria-labelledby="sync-title">
        <h2 id="sync-title" class="section-title">
          Sync between devices
        </h2>

        {mode === 'idle' && retiredAt && (
          <>
            <div class="notice" role="status">
              The sync key was changed on another device on {dayMonth(dayOf(retiredAt))}, so this device
              stopped syncing. Enter the new key to continue. What's on this device is kept and combined with the synced
              habits.
            </div>
            <button type="button" class="btn light" onClick={() => setMode('join')}>
              Enter the new key
            </button>
            <button
              type="button"
              class="link-btn danger"
              onClick={async () => {
                const { disableSync } = await engine();
                disableSync();
                showToast('Sync turned off on this device');
              }}
            >
              Turn off sync on this device
            </button>
          </>
        )}

        {mode === 'idle' && !retiredAt && (
          <>
            <p class="body-text">
              Use the same habits on your iPhone and your computer: a <strong>12-word sync key</strong> links them. Your
              habits, check-ins and notes are encrypted on this device before they're sent, and only devices with the key
              can read them. No account needed.
            </p>
            <div class="button-pair">
              <button type="button" class="btn quiet" onClick={() => setMode('join')}>
                I have a key
              </button>
              <button type="button" class="btn light small" onClick={openCreate}>
                Create sync key
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <p class="body-text">
              This is your sync key. <strong>Save it somewhere safe</strong> (a password manager or Notes): you'll type it on
              your other devices. Anyone with these words can read your habits.
            </p>
            <Words phrase={phrase} />
            <button type="button" class="btn quiet" onClick={() => copy(phrase)}>
              Copy the 12 words
            </button>
            <SavedCheck checked={saved} onChange={setSaved}>
              I've saved my sync key
            </SavedCheck>
            {error && <div class="notice">{error}</div>}
            <div class="button-pair">
              <button type="button" class="btn quiet" disabled={busy} onClick={() => setMode('idle')}>
                Cancel
              </button>
              <button type="button" class="btn light small" disabled={!saved || busy} onClick={() => start(phrase, false)}>
                {busy ? 'Starting…' : 'Start syncing'}
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <form
            class="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) start(input, true);
            }}
          >
            <label for="sync-phrase" class="field-label">
              Sync key from your other device
            </label>
            <textarea
              id="sync-phrase"
              class="textarea mono"
              rows={3}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              placeholder="12 words, separated by spaces"
              value={input}
              onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            />
            {input.trim() && !valid && <span class="hint">That's not a complete sync key yet. Check all 12 words.</span>}
            <p class="hint">What's on this device is combined with what's already synced. Nothing gets overwritten.</p>
            {error && <div class="notice">{error}</div>}
            <div class="button-pair">
              <button type="button" class="btn quiet" disabled={busy} onClick={() => setMode('idle')}>
                Cancel
              </button>
              <button type="submit" class="btn light small" disabled={!valid || busy}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  const config = loadSyncConfig();
  return (
    <section class="card stack" aria-labelledby="sync-title">
      <h2 id="sync-title" class="section-title">
        Sync between devices
      </h2>
      <div class={`sync-status ${status.state}`} role="status">
        <span class="sync-dot" aria-hidden="true" />
        <span>{statusText(status)}</span>
      </div>
      <div class="button-pair">
        <button type="button" class="btn quiet" onClick={() => setMode(mode === 'show' ? 'idle' : 'show')}>
          {mode === 'show' ? 'Hide sync key' : 'Show sync key'}
        </button>
        <button
          type="button"
          class="btn light small"
          disabled={status.state === 'syncing'}
          onClick={async () => {
            const { syncNow } = await engine();
            const { added } = await syncNow();
            if (added > 0) showToast(`${added} habits and check-ins arrived from your other devices`);
          }}
        >
          Sync now
        </button>
      </div>

      {mode === 'show' && config && (
        <>
          <p class="body-text">
            To add a device: open the app there, go to <strong>Settings → Sync between devices → I have a key</strong>, and
            enter these words.
          </p>
          <Words phrase={config.phrase} />
          <button type="button" class="btn quiet" onClick={() => copy(config.phrase)}>
            Copy the 12 words
          </button>
        </>
      )}

      <DeviceList devices={config?.devices ?? {}} />

      <details class="fold">
        <summary>Use with Claude Desktop</summary>
        <div class="stack-form">
          <p class="hint">
            Ask Claude on your computer how your habits are going, or check in by just saying it ("I read for 25 minutes").
            It uses these same habits, through sync.
          </p>
          <ol class="steps">
            <li>Download the extension below.</li>
            <li>Open the file with Claude Desktop (double-click it, or drag it into Settings → Extensions) and install.</li>
            <li>When it asks for the sync key, paste your 12 words.</li>
          </ol>
          <a class="btn quiet" href="./mcp/habit-tracker.mcpb" download="habit-tracker.mcpb">
            Download the Claude Desktop extension
          </a>
          {config && (
            <button type="button" class="btn quiet" onClick={() => copy(config.phrase)}>
              Copy the 12 words
            </button>
          )}
        </div>
      </details>

      <details class="fold">
        <summary>Relays ({config?.relays.length ?? 0})</summary>
        <div class="stack-form">
          <p class="hint">
            Free public Nostr relays pass the encrypted data between your devices. One per line; every device needs at
            least one relay in common.
          </p>
          <label for="relays" class="sr-only">
            Relays
          </label>
          <textarea
            id="relays"
            class="textarea mono"
            rows={4}
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            value={relayText}
            onInput={(e) => setRelayText((e.target as HTMLTextAreaElement).value)}
          />
          <div class="button-pair">
            <button type="button" class="btn quiet" onClick={() => setRelayText(DEFAULT_RELAYS.join('\n'))}>
              Defaults
            </button>
            <button
              type="button"
              class="btn light small"
              onClick={async () => {
                const relays = relayText.split(/\s+/).filter(isRelayUrl);
                if (relays.length === 0) return showToast('Add at least one wss:// relay');
                const { setRelays } = await engine();
                await setRelays(relays);
                showToast('Relays saved');
              }}
            >
              Save relays
            </button>
          </div>
        </div>
      </details>

      {mode === 'change' ? (
        <div class="stack-form change-key">
          <h3 class="field-label">Change sync key</h3>
          <p class="body-text">
            This is your <strong>new sync key</strong>. Your habits move to it, and the old key stops working: devices still
            using it stop syncing until you enter the new key there. Use this if a device is lost or someone else has seen
            your words. <strong>Save the new words</strong>: you'll enter them on each device you keep (and in Claude
            Desktop, if you use it).
          </p>
          <Words phrase={phrase} />
          <button type="button" class="btn quiet" onClick={() => copy(phrase)}>
            Copy the 12 words
          </button>
          <SavedCheck checked={saved} onChange={setSaved}>
            I've saved the new key
          </SavedCheck>
          {error && <div class="notice">{error}</div>}
          <div class="button-pair">
            <button type="button" class="btn quiet" disabled={busy} onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button type="button" class="btn light small" disabled={!saved || busy} onClick={changeKey}>
              {busy ? 'Switching…' : 'Switch to the new key'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="link-btn" onClick={openChange}>
          Change sync key
        </button>
      )}

      <button
        type="button"
        class="link-btn danger"
        onClick={async () => {
          if (!confirm('Stop syncing on this device? Your habits stay here, and your other devices keep theirs.')) return;
          const { disableSync } = await engine();
          disableSync();
          setMode('idle');
          showToast('Sync turned off on this device');
        }}
      >
        Turn off sync on this device
      </button>
    </section>
  );
}
