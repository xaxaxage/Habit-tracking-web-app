import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { matchFilters, type Filter } from 'nostr-tools/filter';

/** Enough of a Nostr relay for the sync client: replaceable events, REQ with since/limit and live updates. */
export function startRelay() {
  const events = new Map<string, Event>();
  const subs = new Set<{ ws: WebSocket; id: string; filters: Filter[] }>();
  let refuse = false;
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (ws: WebSocket) => {
    ws.on('close', () => {
      for (const s of subs) if (s.ws === ws) subs.delete(s);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg[0] === 'EVENT') {
        const e: Event = msg[1];
        if (refuse || !verifyEvent(e)) return ws.send(JSON.stringify(['OK', e.id, false, 'blocked']));
        const key = `${e.pubkey}:${e.kind}:${e.tags.find((t) => t[0] === 'd')?.[1]}`;
        const old = events.get(key);
        if (!old || e.created_at > old.created_at) events.set(key, e);
        ws.send(JSON.stringify(['OK', e.id, true, '']));
        for (const s of subs) if (matchFilters(s.filters, e)) s.ws.send(JSON.stringify(['EVENT', s.id, e]));
      } else if (msg[0] === 'REQ') {
        const [, id, ...filters] = msg as [string, string, ...Filter[]];
        for (const e of events.values()) if (matchFilters(filters, e)) ws.send(JSON.stringify(['EVENT', id, e]));
        ws.send(JSON.stringify(['EOSE', id]));
        subs.add({ ws, id, filters });
      } else if (msg[0] === 'CLOSE') {
        for (const s of subs) if (s.ws === ws && s.id === msg[1]) subs.delete(s);
      }
    });
  });
  return {
    url: () => `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    events,
    refuse: (on: boolean) => (refuse = on),
    close: () => new Promise((r) => server.close(r)),
  };
}

/** Accepts TCP connections and never says anything, not even the WebSocket handshake. */
export async function startSilentTcp() {
  const sockets: Socket[] = [];
  const server = createServer((s) => sockets.push(s));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => {
      sockets.forEach((s) => s.destroy());
      return new Promise((r) => server.close(r));
    },
  };
}

/** Completes the WebSocket handshake, then never answers a message. */
export function startSilentRelay() {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  return {
    url: () => `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => {
      server.clients.forEach((c) => c.terminate());
      return new Promise((r) => server.close(r));
    },
  };
}
