import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { defineConfig, type Plugin } from 'vite';
import { TOOLS } from './mcp/tool-list';

/**
 * Builds the Claude Desktop connector (mcp/server.ts, the same tools as the
 * online connector in mcp/cloud.ts) into one file with
 * everything included, and packs it as a Claude Desktop extension (.mcpb):
 * a zip with a manifest, the server and an icon. Claude Desktop runs it with
 * its own Node.js, so nothing else needs installing.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Semver that grows with every build, so Claude Desktop sees a new download as an update. */
export function version(): string {
  const d = new Date();
  return `1.${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}.${d.getUTCHours() * 100 + d.getUTCMinutes()}`;
}

const VERSION = version();
const ENTRY = 'habit-tracker-mcp.mjs';


export function manifest() {
  return {
    manifest_version: '0.3',
    name: 'habit-tracker',
    display_name: 'Habit Tracker',
    version: VERSION,
    description: 'Check off your habits, see your streaks and manage your habits in Habit Tracker, synced with the app on your phone.',
    long_description:
      'Ask Claude how your habits are going, log a check-in by just saying it ("I read for 25 minutes", "skip the workout today"), see streaks and progress over any period, and create or change habits. Uses the app\'s end-to-end encrypted device sync: paste the 12-word sync key from the app (Settings → Sync between devices → Show sync key). Your habits stay encrypted on the relays; only your devices can read them.',
    author: { name: 'xaxaxage', url: 'https://github.com/xaxaxage' },
    homepage: 'https://xaxaxage.github.io/Habit-tracking-web-app/',
    repository: { type: 'git', url: 'https://github.com/xaxaxage/Habit-tracking-web-app' },
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/index.mjs',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/index.mjs'],
        env: { SYNC_KEY: '${user_config.sync_key}' },
      },
    },
    tools: TOOLS,
    keywords: ['habits', 'habit tracker', 'streaks', 'check-in'],
    compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=20.0.0' } },
    user_config: {
      sync_key: {
        type: 'string',
        title: 'Sync key (12 words)',
        description: 'In the app: Settings → Sync between devices → Show sync key. Turn sync on there first if it is off.',
        sensitive: true,
        required: true,
      },
    },
  };
}

function extension(): Plugin {
  return {
    name: 'habit-tracker-mcpb',
    apply: 'build',
    generateBundle(_options, bundle) {
      const server = bundle[ENTRY];
      if (!server || server.type !== 'chunk') throw new Error(`${ENTRY} was not built`);
      const zip = zipSync(
        {
          'manifest.json': strToU8(JSON.stringify(manifest(), null, 2)),
          'server/index.mjs': strToU8(server.code),
          'icon.png': readFileSync('public/icons/icon-512.png'),
        },
        { level: 9 },
      );
      this.emitFile({ type: 'asset', fileName: 'habit-tracker.mcpb', source: zip });
    },
  };
}

export default defineConfig({
  define: { __MCP_VERSION__: JSON.stringify(VERSION) },
  plugins: [extension()],
  // No browser code here: keep the web app's public/ folder out of this build.
  publicDir: false,
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'dist/mcp',
    emptyOutDir: true,
    target: 'node20',
    minify: true,
    rollupOptions: { output: { format: 'es', entryFileNames: ENTRY, codeSplitting: false } },
  },
  ssr: { noExternal: true, target: 'node' },
});
