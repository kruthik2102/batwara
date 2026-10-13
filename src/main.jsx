import '@fontsource-variable/inter/opsz.css';
import './styles/app.css';
import { render } from 'preact';
import { App } from './app.jsx';
import { store } from './store.js';
import { setupSystemBars } from './platform/native.js';
import { installPressFeedback } from './ui/gesture.js';
import { applyTheme } from './ui/theme.js';

async function boot() {
  const root = document.getElementById('root');
  try {
    await setupSystemBars();
    await store.init();
    applyTheme(store.prefs.theme);
    installPressFeedback();
    render(<App />, root);
    await store.materializeRecurring();
    store.refreshReminders();
  } catch (e) {
    console.error(e);
    root.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'boot-error';
    div.textContent = 'Batwara couldn’t start: ' + (e?.message || e);
    root.appendChild(div);
  }
}

boot();
