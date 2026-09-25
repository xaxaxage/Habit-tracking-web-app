import { render } from 'preact';
import './styles.css';
import './screens.css';
import './motion.css';
import { App } from './app';
import { initRouter } from './lib/router';
import { getData, subscribe } from './lib/store';
import { applyTheme } from './lib/theme';
import { watchMotion } from './lib/motion';
import { showToast } from './lib/toast';
import { loadSyncConfig } from './lib/sync/state';

// Keep the color palette in step with Settings.
let shownTheme = '';
function syncTheme() {
  const { theme } = getData().settings;
  if (theme === shownTheme) return;
  shownTheme = theme;
  applyTheme(theme);
}
syncTheme();
subscribe(syncTheme);
watchMotion(subscribe);

initRouter();
render(<App />, document.getElementById('app')!);

// Resume device sync if this device has a sync key (the sync code loads only then).
if (loadSyncConfig()) {
  import('./lib/sync/engine').then((m) => m.startSync()).catch((err) => console.warn('Sync could not start', err));
}

// Ask the browser not to evict saved habits when storage runs low.
navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Home Screen apps can stay open for days: look for a new version
        // whenever the app comes back into view, and every hour.
        const check = () => registration.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
        setInterval(check, 60 * 60 * 1000);
      })
      .catch((err) => console.warn('Service worker failed', err));
  });

  // A new version has taken over: switch to it. Straight away if the app is in the
  // background; otherwise offer a reload, and do it the next time the app is hidden.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing old to replace
    if (document.visibilityState === 'hidden') return reload();
    showToast('A new version of the app is ready', { label: 'Reload', run: reload }, { sticky: true });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && reload());
  });
}
