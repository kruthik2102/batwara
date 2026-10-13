// Where the event log lives: app-private storage on the phone (Android sandbox, encrypted at rest by the OS),
// or localStorage when running in a desktop browser.

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isNative } from './native.js';

const DIR = 'batwara';
const MAIN = `${DIR}/data.json`;
const BACKUP = `${DIR}/data.prev.json`;
const LS_MAIN = 'batwara.data';
const LS_ATT = 'batwara.att.';

let saves = 0;

async function readNative(path) {
  try {
    const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  } catch {
    return null;
  }
}

function parse(text) {
  if (!text) return null;
  try {
    const d = JSON.parse(text);
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

export async function loadData() {
  if (isNative) return parse(await readNative(MAIN)) || parse(await readNative(BACKUP));
  try {
    return parse(localStorage.getItem(LS_MAIN));
  } catch {
    return null;
  }
}

export async function saveData(data) {
  const text = JSON.stringify(data);
  if (isNative) {
    await Filesystem.writeFile({ path: MAIN, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    // A second copy, refreshed every few saves, in case the main file is ever cut short.
    if (saves++ % 8 === 0) {
      await Filesystem.writeFile({ path: BACKUP, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true }).catch(() => {});
    }
    return;
  }
  try {
    localStorage.setItem(LS_MAIN, text);
  } catch { /* storage full or blocked */ }
}

const attCache = new Map();

export async function saveAttachment(id, dataUrl) {
  attCache.set(id, dataUrl);
  if (isNative) {
    await Filesystem.writeFile({ path: `${DIR}/att/${id}.txt`, data: dataUrl, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    return;
  }
  try {
    localStorage.setItem(LS_ATT + id, dataUrl);
  } catch { /* keep in memory only */ }
}

export async function loadAttachment(id) {
  if (attCache.has(id)) return attCache.get(id);
  let v = null;
  if (isNative) v = await readNative(`${DIR}/att/${id}.txt`);
  else {
    try { v = localStorage.getItem(LS_ATT + id); } catch { v = null; }
  }
  if (v) attCache.set(id, v);
  return v;
}

export async function wipeAll() {
  attCache.clear();
  if (isNative) {
    await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
    return;
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('batwara.')) localStorage.removeItem(k);
  } catch { /* nothing to clear */ }
}
