import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

/** Shown in Settings, so it's easy to tell which version a device is running. */
function appVersion(): string {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'local';
    }
  }
  return `${when} · ${commit}`;
}

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [preact()],
  build: {
    target: ['es2020', 'safari15'],
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
