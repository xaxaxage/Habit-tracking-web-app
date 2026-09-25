import type { AbstractSimplePool } from 'nostr-tools/abstract-pool';
import type { Event } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';

/**
 * Reading and writing on several relays without waiting for the slowest.
 * Public relays can be down, slow, or accept a connection and then never
 * answer; every device writes to all of them, so one that answered is enough
 * to go on with, and the rest catch up on the next sync.
 */

export interface Fetched {
  events: Event[];
  /** Relays that sent everything they have (EOSE). 0 means none could be reached. */
  answered: string[];
}

/** Everything matching the filter: done when every relay answered, a moment after the first did, or at maxWait. */
export function fetchEvents(
  pool: AbstractSimplePool,
  relays: string[],
  filter: Filter,
  { maxWait = 10_000, grace = 1500 }: { maxWait?: number; grace?: number } = {},
): Promise<Fetched> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    const answered: string[] = [];
    const subs: { close: () => void }[] = [];
    let pending = relays.length;
    let finished = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(maxTimer);
      clearTimeout(graceTimer);
      for (const s of subs) {
        try {
          s.close();
        } catch {
          // already closed
        }
      }
      resolve({ events, answered });
    };
    const maxTimer = setTimeout(finish, maxWait);
    const settled = () => {
      if (--pending <= 0) finish();
    };
    if (relays.length === 0) finish();
    for (const url of relays) {
      pool
        .ensureRelay(url, { connectionTimeout: Math.min(maxWait, 6000) })
        .then((relay) => {
          if (finished) return;
          let done = false;
          const end = (ok: boolean) => {
            if (done) return;
            done = true;
            if (ok) {
              answered.push(url);
              if (answered.length === 1 && pending > 1) graceTimer = setTimeout(finish, grace);
            }
            settled();
          };
          subs.push(
            relay.subscribe([filter], {
              onevent: (e) => events.push(e),
              oneose: () => end(true),
              onclose: () => end(false),
              eoseTimeout: maxWait,
            }),
          );
        })
        .catch(() => settled());
    }
  });
}

/** Send an event to every relay; true as soon as one of them has stored it, false if none did. */
export function publishEvent(pool: AbstractSimplePool, relays: string[], event: Event, maxWait = 8000): Promise<boolean> {
  if (relays.length === 0) return Promise.resolve(false);
  return Promise.any(pool.publish(relays, event, { maxWait })).then(
    () => true,
    () => false,
  );
}
