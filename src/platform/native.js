// Thin wrappers over Capacitor plugins, with browser fallbacks so the same build runs in a desktop browser.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

/** Our own Android plugin (android/app/src/main/java/com/batwara/app/BatwaraSystemPlugin.java). */
const System = registerPlugin('BatwaraSystem', {
  web: () => ({
    insets: async () => ({ top: 0, bottom: 0, fontScale: 1, dark: null }),
    addListener: async () => ({ remove: async () => {} }),
    upiApps: async () => ({ apps: [] }),
    upiPay: async ({ url }) => {
      window.location.href = url;
      return { resultCode: 0, response: null };
    },
    pickContact: async () => ({ cancelled: true }),
  }),
});

// ---- haptics ------------------------------------------------------------------
let hapticsOn = true;
let selectionReady = false;
const quiet = () => {};
export const haptic = {
  enable(v) { hapticsOn = v; },
  selection() {
    if (!hapticsOn || !isNative) return;
    if (!selectionReady) { selectionReady = true; Haptics.selectionStart().catch(quiet); }
    Haptics.selectionChanged().catch(quiet);
  },
  light() { if (hapticsOn && isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(quiet); },
  medium() { if (hapticsOn && isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(quiet); },
  rigid() { if (hapticsOn && isNative) Haptics.impact({ style: ImpactStyle.Heavy }).catch(quiet); },
  success() { if (hapticsOn && isNative) Haptics.notification({ type: NotificationType.Success }).catch(quiet); },
  warning() { if (hapticsOn && isNative) Haptics.notification({ type: NotificationType.Warning }).catch(quiet); },
  error() { if (hapticsOn && isNative) Haptics.notification({ type: NotificationType.Error }).catch(quiet); },
};

// ---- system bars and insets ----------------------------------------------------
export async function setupSystemBars() {
  if (!isNative) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch { /* older devices */ }
  await refreshInsets();
}

/** null until the phone tells us; the browser build relies on prefers-color-scheme instead. */
export let nativeDark = null;

function applyFontScale(fontScale) {
  // Follow the phone's text size, within limits the layout can take.
  document.documentElement.style.fontSize = `${16 * Math.min(1.3, Math.max(0.85, fontScale || 1))}px`;
}

export async function refreshInsets() {
  const root = document.documentElement;
  let fontScale = 1;
  if (isNative) {
    try {
      const r = await System.insets();
      if (r.top > 0) root.style.setProperty('--sat', `${r.top}px`);
      if (r.bottom >= 0) root.style.setProperty('--sab', `${r.bottom}px`);
      fontScale = r.fontScale || 1;
      if (typeof r.dark === 'boolean') nativeDark = r.dark;
    } catch { /* keep CSS fallbacks */ }
  }
  applyFontScale(fontScale);
}

/** Dark mode or text size changed in Android settings while the app was open. */
export function onSystemChange(cb) {
  if (!isNative) return () => {};
  const p = System.addListener('systemChange', (d) => {
    if (typeof d.dark === 'boolean') nativeDark = d.dark;
    if (d.fontScale) applyFontScale(d.fontScale);
    cb(d);
  });
  return () => p.then((h) => h.remove());
}

/** lightContent = white status-bar icons (dark backgrounds, or while a sheet is up). */
let lastBar = null;
export function setStatusBarStyle(lightContent) {
  if (!isNative || lastBar === lightContent) return;
  lastBar = lightContent;
  StatusBar.setStyle({ style: lightContent ? Style.Dark : Style.Light }).catch(quiet);
}

// ---- app lifecycle ---------------------------------------------------------------
export function onBackButton(handler) {
  if (!isNative) return () => {};
  const p = App.addListener('backButton', handler);
  return () => p.then((h) => h.remove());
}

export function minimizeApp() {
  if (isNative) App.minimizeApp().catch(() => App.exitApp());
}

export function onAppResume(handler) {
  if (!isNative) {
    const f = () => document.visibilityState === 'visible' && handler();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }
  const p = App.addListener('appStateChange', ({ isActive }) => isActive && handler());
  return () => p.then((h) => h.remove());
}

export function onAppPause(handler) {
  if (!isNative) {
    const f = () => document.visibilityState === 'hidden' && handler();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }
  const p = App.addListener('appStateChange', ({ isActive }) => !isActive && handler());
  return () => p.then((h) => h.remove());
}

/** Files opened with "Open with Batwara" from WhatsApp, Files, Gmail… */
export function onOpenFile(handler) {
  if (!isNative) return () => {};
  const p = App.addListener('appUrlOpen', ({ url }) => url && handler(url));
  App.getLaunchUrl().then((r) => r?.url && handler(r.url)).catch(quiet);
  return () => p.then((h) => h.remove());
}

export async function readUriText(uri) {
  const r = await Filesystem.readFile({ path: uri, encoding: Encoding.UTF8 });
  return typeof r.data === 'string' ? r.data : await r.data.text();
}

// ---- keyboard --------------------------------------------------------------------
export function onKeyboard(cb) {
  if (isNative) {
    const a = Keyboard.addListener('keyboardWillShow', (i) => cb(true, i.keyboardHeight));
    const b = Keyboard.addListener('keyboardWillHide', () => cb(false, 0));
    return () => { a.then((h) => h.remove()); b.then((h) => h.remove()); };
  }
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const f = () => {
    const h = window.innerHeight - vv.height;
    cb(h > 120, h);
  };
  vv.addEventListener('resize', f);
  return () => vv.removeEventListener('resize', f);
}

// ---- sharing and files ---------------------------------------------------------------
export async function shareFile({ name, text, mime = 'application/json', title, message }) {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: `share/${name}`, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    try {
      await Share.share({ title, text: message, files: [res.uri], dialogTitle: title });
      return true;
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return false;
      throw e;
    }
  }
  const file = new File([text], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: message });
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

export async function shareText({ title, text }) {
  if (isNative) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return true;
    } catch {
      return false;
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return true;
    }
  } catch {
    return false;
  }
  return copyText(text);
}

/** Opens the system file picker. Resolves with a File, or null if the person backs out. */
export function pickFile(accept, capture) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    let done = false;
    const finish = (f) => {
      if (done) return;
      done = true;
      resolve(f);
      setTimeout(() => input.remove(), 0);
    };
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// ---- contacts and UPI (native plugin) -----------------------------------------------------
export const canPickContacts = isNative && platform === 'android';

export async function pickContact() {
  const r = await System.pickContact();
  if (!r || r.cancelled) return null;
  return { name: r.name || '', phone: r.phone || '' };
}

export async function listUpiApps() {
  try {
    const r = await System.upiApps();
    return Array.isArray(r?.apps) ? r.apps : [];
  } catch {
    return [];
  }
}

/** Opens a UPI app (or the system chooser) and resolves when the person comes back. */
export async function launchUpi(url, packageName) {
  return System.upiPay({ url, packageName: packageName || null });
}

// ---- reminders ---------------------------------------------------------------------------
export async function notificationPermission(ask) {
  if (!isNative) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}

/** Replace all scheduled reminders. items: [{ id: number, title, body, at: Date }] */
export async function scheduleReminders(items) {
  if (!isNative) return;
  try {
    if (!(await notificationPermission(false))) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!items.length) return;
    await LocalNotifications.schedule({
      notifications: items.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at }, smallIcon: 'ic_stat_batwara', iconColor: '#5856D6' })),
    });
  } catch { /* reminders are best-effort */ }
}

// ---- exchange rates (public reference data, no personal data leaves the phone) ----------------
export async function fetchReferenceRates() {
  const urls = ['https://api.frankfurter.dev/v1/latest?base=INR', 'https://api.frankfurter.app/latest?from=INR'];
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(u, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return await r.json();
    } catch { /* try the next one */ }
  }
  return null;
}
