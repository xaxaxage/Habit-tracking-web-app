import type { BrowserContext, WebSocketRoute } from '@playwright/test';
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { matchFilters, type Filter } from 'nostr-tools/filter';

/**
 * Stand-ins for the app's public relays, inside the test: the browser's
 * WebSockets to them are routed here, so tests never touch a real relay.
 */

/** The app's default relays (src/lib/sync/state.ts). */
export const RELAYS = {
  damus: /^wss:\/\/relay\.damus\.io\/?$/,
  nos: /^wss:\/\/nos\.lol\/?$/,
  primal: /^wss:\/\/relay\.primal\.net\/?$/,
  mom: /^wss:\/\/nostr\.mom\/?$/,
};

interface Sub {
  ws: WebSocketRoute;
  id: string;
  filters: Filter[];
}

/** Enough of a Nostr relay for the app: replaceable events (NIP-78), REQ with live updates, CLOSE. */
export class MockRelay {
  readonly events = new Map<string, Event>();
  private subs = new Set<Sub>();
  private blocked = new Set<BrowserContext>();
  private sockets = new Map<WebSocketRoute, BrowserContext>();

  async attach(context: BrowserContext, url: RegExp) {
    await context.routeWebSocket(url, (ws) => this.connect(ws, context));
  }

  /** Cut one browser off (its sockets close and new ones are refused), or let it back. */
  block(context: BrowserContext, on: boolean) {
    if (on) {
      this.blocked.add(context);
      for (const [ws, ctx] of this.sockets) if (ctx === context) ws.close({ code: 1001, reason: 'going away' });
    } else this.blocked.delete(context);
  }

  private connect(ws: WebSocketRoute, context: BrowserContext) {
    if (this.blocked.has(context)) return void ws.close({ code: 1011, reason: 'unreachable' });
    this.sockets.set(ws, context);
    ws.onMessage((raw) => this.handle(ws, String(raw)));
    ws.onClose(() => {
      this.sockets.delete(ws);
      for (const s of this.subs) if (s.ws === ws) this.subs.delete(s);
    });
  }

  private handle(ws: WebSocketRoute, raw: string) {
    const msg = JSON.parse(raw);
    if (process.env.DEBUG_SYNC) {
      const who = (this.sockets.get(ws) as unknown as { _tag?: string })?._tag ?? '?';
      console.log(`relay<-${who}`, msg[0], msg[1]?.id?.slice?.(0, 6) ?? msg[1], msg[0] === 'EVENT' ? msg[1].created_at : JSON.stringify(msg.slice(2)).slice(0, 120), 'subs', this.subs.size);
    }
    if (msg[0] === 'EVENT') {
      const e: Event = msg[1];
      if (!verifyEvent(e)) return ws.send(JSON.stringify(['OK', e.id, false, 'invalid: bad signature']));
      const key = `${e.pubkey}:${e.kind}:${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
      const old = this.events.get(key);
      if (old && (old.created_at > e.created_at || (old.created_at === e.created_at && old.id < e.id))) {
        return ws.send(JSON.stringify(['OK', e.id, true, 'duplicate: have a newer version']));
      }
      this.events.set(key, e);
      ws.send(JSON.stringify(['OK', e.id, true, '']));
      for (const s of this.subs) if (matchFilters(s.filters, e)) s.ws.send(JSON.stringify(['EVENT', s.id, e]));
    } else if (msg[0] === 'REQ') {
      const [, id, ...filters] = msg as [string, string, ...Filter[]];
      for (const e of this.events.values()) if (matchFilters(filters, e)) ws.send(JSON.stringify(['EVENT', id, e]));
      ws.send(JSON.stringify(['EOSE', id]));
      this.subs.add({ ws, id, filters });
    } else if (msg[0] === 'CLOSE') {
      for (const s of this.subs) if (s.ws === ws && s.id === msg[1]) this.subs.delete(s);
    }
  }
}

/**
 * Route every relay the app might use: two that work, one that accepts the
 * connection and then never says a word, one that refuses. Anything else is
 * closed, so nothing reaches the internet.
 */
export async function routeRelays(context: BrowserContext, working: [MockRelay, MockRelay]) {
  await context.routeWebSocket(/.*/, (ws) => ws.close({ code: 1008, reason: 'not in this test' }));
  await working[0].attach(context, RELAYS.damus);
  await working[1].attach(context, RELAYS.nos);
  await context.routeWebSocket(RELAYS.primal, () => {
    // Connected, and silent forever.
  });
  await context.routeWebSocket(RELAYS.mom, (ws) => ws.close({ code: 1011, reason: 'down' }));
}
