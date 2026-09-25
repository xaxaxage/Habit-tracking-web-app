import { render } from 'preact';
import './styles.css';
import './screens.css';
import { App } from './app';
import { initRouter } from './lib/router';

initRouter();
render(<App />, document.getElementById('app')!);

// Ask the browser not to evict saved habits when storage runs low.
navigator.storage?.persist?.().catch(() => undefined);
