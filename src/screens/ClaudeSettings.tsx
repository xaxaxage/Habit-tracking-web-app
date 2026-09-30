import { useEffect, useRef, useState } from 'preact/hooks';
import { loadSyncConfig, useSyncStatus } from '../lib/sync/state';
import {
  connectorHost,
  connectorUrl,
  fetchConnectorToken,
  ownConnectorHost,
  saveOwnConnectorHost,
  SHARED_CONNECTOR_HOST,
  timeZone,
} from '../lib/connector';
import { copy } from './SyncSettings';

type Address = { state: 'idle' } | { state: 'loading' } | { state: 'done'; url: string } | { state: 'error'; message: string };

/** The person's own connector address, fetched when asked for (the server seals their sync key into it). */
function ConnectorAddress({ phrase, relays, host }: { phrase: string; relays: string[]; host: string }) {
  const [address, setAddress] = useState<Address>({ state: 'idle' });
  const abort = useRef<AbortController | null>(null);

  // A different server or sync key means a different address.
  useEffect(() => {
    abort.current?.abort();
    setAddress({ state: 'idle' });
  }, [host, phrase]);
  useEffect(() => () => abort.current?.abort(), []);

  const load = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAddress({ state: 'loading' });
    try {
      const token = await fetchConnectorToken(host, phrase, controller.signal);
      if (!controller.signal.aborted) setAddress({ state: 'done', url: connectorUrl(host, token, timeZone(), relays) });
    } catch (err) {
      if (!controller.signal.aborted) setAddress({ state: 'error', message: (err as Error).message });
    }
  };

  return (
    <>
      <ol class="steps">
        <li>
          Get your connector address:
          <div class="stack-form connector-step">
            {address.state === 'done' ? (
              <>
                <code class="connector-url mono" aria-label="Your connector address">
                  {address.url}
                </code>
                <button type="button" class="btn primary" onClick={() => copy(address.url, 'Connector address', 'Select the address and copy it instead.')}>
                  Copy the address
                </button>
              </>
            ) : (
              <>
                {address.state === 'error' && (
                  <div class="notice" role="alert">
                    {address.message}
                  </div>
                )}
                <button type="button" class="btn primary" disabled={address.state === 'loading'} onClick={load}>
                  {address.state === 'loading' ? 'Getting your address…' : address.state === 'error' ? 'Try again' : 'Show my connector address'}
                </button>
              </>
            )}
          </div>
        </li>
        <li>
          In Claude on a computer (claude.ai or Claude Desktop): <strong>Customize → Connectors → + → Add custom connector</strong>.
          Name it Habit Tracker, paste the address and click <strong>Add</strong>.
        </li>
        <li>That's it: it works in the Claude app on your phone too. Try “what's left for today?” or “I read for 25 minutes”.</li>
      </ol>
      <p class="hint">
        The address is yours alone, like a password: it lets Claude read and change your habits, so don't share it. Friends get
        their own here, in their app. It runs on <strong>{host}</strong>, which opens your habits to answer Claude, so whoever
        runs that server could see them.
      </p>
    </>
  );
}

/** Connecting Claude to the habits: online for claude.ai and the phone apps, or the Claude Desktop extension. */
export function ClaudeSettings() {
  const status = useSyncStatus();
  const config = loadSyncConfig();
  const syncing = status.state !== 'off' && !!config && !config.retiredAt;
  const [ownHost, setOwnHost] = useState(ownConnectorHost);
  const [hostText, setHostText] = useState(ownHost);
  const host = ownHost || SHARED_CONNECTOR_HOST;
  const typedHost = connectorHost(hostText);

  return (
    <section class="card stack claude-settings" aria-labelledby="claude-title">
      <h2 id="claude-title" class="section-title">
        Use with Claude
      </h2>
      <p class="body-text">
        Ask Claude how your habits are going, or check them off by just saying it, on claude.ai and in the Claude app on your
        phone.
      </p>

      {syncing && config ? (
        <ConnectorAddress phrase={config.phrase} relays={config.relays} host={host} />
      ) : (
        <div class="notice">
          Turn on <strong>Sync between devices</strong> first (above): Claude reaches your habits through it.
        </div>
      )}

      <details class="fold">
        <summary>Claude Desktop extension (runs on your computer)</summary>
        <div class="stack-form">
          <p class="hint">
            Instead of the online connector, Claude Desktop can run the connector on your computer, so your habits are opened
            only there. It works only in Claude Desktop, not on your phone.
          </p>
          <ol class="steps">
            <li>Download the extension below.</li>
            <li>Open the file with Claude Desktop (double-click it, or drag it into Settings → Extensions) and install.</li>
            <li>When it asks for the sync key, paste your 12 words.</li>
          </ol>
          <a class="btn quiet" href="./mcp/habit-tracker.mcpb" download="habit-tracker.mcpb">
            Download the Claude Desktop extension
          </a>
          {syncing && config && (
            <button type="button" class="btn quiet" onClick={() => copy(config.phrase)}>
              Copy the 12 words
            </button>
          )}
        </div>
      </details>

      <details class="fold" open={!!ownHost}>
        <summary>Use your own connector server</summary>
        <form
          class="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveOwnConnectorHost(typedHost);
            setOwnHost(typedHost);
          }}
        >
          <p class="hint">
            For a connector only you use, run your own copy (free on Vercel: see “Host the connector” in the app's README) and
            enter its address. Leave it empty to use {SHARED_CONNECTOR_HOST}.
          </p>
          <label for="connector-host" class="field-label">
            Your connector server
          </label>
          <div class="row-2 fixed-end">
            <input
              id="connector-host"
              class="input mono"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellcheck={false}
              placeholder={SHARED_CONNECTOR_HOST}
              value={hostText}
              onInput={(e) => setHostText((e.target as HTMLInputElement).value)}
            />
            <button type="submit" class="pill-btn" disabled={(!!hostText.trim() && !typedHost) || typedHost === ownHost}>
              Use
            </button>
          </div>
          {hostText.trim() && !typedHost && (
            <p class="hint danger-text" role="alert">
              That doesn't look like an address.
            </p>
          )}
        </form>
      </details>
    </section>
  );
}
