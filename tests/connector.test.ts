import { describe, expect, it } from 'vitest';
import { connectorHost, connectorUrl, SHARED_CONNECTOR_HOST } from '../src/lib/connector';
import { DEFAULT_RELAYS } from '../src/lib/sync/state';

describe('connector address in the app', () => {
  it('takes a server address however it was pasted', () => {
    expect(connectorHost('habit-tracker-abc.vercel.app')).toBe('habit-tracker-abc.vercel.app');
    expect(connectorHost(' https://Habit-Tracker-abc.vercel.app/ ')).toBe('habit-tracker-abc.vercel.app');
    expect(connectorHost('https://habit-tracker-abc.vercel.app/mcp/123?tz=x')).toBe('habit-tracker-abc.vercel.app');
    expect(connectorHost('my-connector.example.com:8443')).toBe('my-connector.example.com:8443');
    expect(connectorHost('not an address')).toBe('');
    expect(connectorHost('localhost')).toBe('');
    expect(connectorHost('')).toBe('');
    expect(SHARED_CONNECTOR_HOST).toBe('habits.xaxaxage.vercel.app');
  });

  it('adds the time zone, and the relays only when they are not the default ones', () => {
    const token = 'A'.repeat(60);
    expect(connectorUrl('x.vercel.app', token, 'Europe/Kyiv')).toBe(`https://x.vercel.app/mcp/${token}?tz=Europe/Kyiv`);
    expect(connectorUrl('x.vercel.app', token, 'Europe/Kyiv', [...DEFAULT_RELAYS].reverse())).toBe(`https://x.vercel.app/mcp/${token}?tz=Europe/Kyiv`);
    // A "+" stays escaped, so the server reads the zone back correctly.
    expect(new URL(connectorUrl('x.vercel.app', token, 'Etc/GMT+12')).searchParams.get('tz')).toBe('Etc/GMT+12');
    const own = connectorUrl('x.vercel.app', token, undefined, ['wss://relay.example.com', 'wss://nos.lol']);
    expect(own).toBe(`https://x.vercel.app/mcp/${token}?r=wss://relay.example.com,wss://nos.lol`);
    expect(new URL(own).searchParams.get('r')).toBe('wss://relay.example.com,wss://nos.lol');
    expect(connectorUrl('x.vercel.app', token)).toBe(`https://x.vercel.app/mcp/${token}`);
  });
});
