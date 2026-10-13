import { setStatusBarStyle, isNative, nativeDark } from '../platform/native.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function systemIsDark() {
  // On the phone, ask Android (the WebView doesn't always pick up a dark-mode switch while running).
  return isNative && nativeDark !== null ? nativeDark : !!mq?.matches;
}

export function isDarkNow() {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && systemIsDark());
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref;
  else if (isNative && nativeDark !== null) root.dataset.theme = nativeDark ? 'dark' : 'light';
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDarkNow() ? '#000000' : '#F2F2F7';
  if (!document.querySelector('.shell.is-pushed')) setStatusBarStyle(isDarkNow());
}

export function onSystemThemeChange(fn) {
  mq?.addEventListener?.('change', fn);
  return () => mq?.removeEventListener?.('change', fn);
}
