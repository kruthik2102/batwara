import { setStatusBarStyle } from '../platform/native.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function isDarkNow() {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && !!mq?.matches);
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref;
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDarkNow() ? '#000000' : '#F2F2F7';
  if (!document.querySelector('.shell.is-pushed')) setStatusBarStyle(isDarkNow());
}

export function onSystemThemeChange(fn) {
  mq?.addEventListener?.('change', fn);
  return () => mq?.removeEventListener?.('change', fn);
}
