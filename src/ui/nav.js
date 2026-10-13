// Navigation model: one push/pop stack per tab (like a tab bar of navigation controllers),
// a stack of modal sheets on top, and overlays above everything. Components render from this model;
// animations are run by NavStack and SheetHost, which then commit the change here.

import { createContext } from 'preact';
import { useEffect, useReducer, useContext } from 'preact/hooks';

export const TABS = ['groups', 'friends', 'activity', 'account'];
let seq = 0;
const route = (name, params = {}) => ({ key: 'r' + ++seq, name, params });
const listeners = new Set();

export const nav = {
  tab: 'groups',
  stacks: { groups: [route('groups')], friends: [route('friends')], activity: [route('activity')], account: [route('account')] },
  sheets: [],
  stackHandlers: {},
  sheetHandler: null,
  scrollers: {},
  lastPush: { key: '', at: 0 },
};

export const screens = {};
export const sheetViews = {};
export const registerScreens = (m) => Object.assign(screens, m);
export const registerSheets = (m) => Object.assign(sheetViews, m);

function emit() {
  for (const fn of [...listeners]) fn();
}
export function subscribeNav(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useNavState() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeNav(force), []);
  return nav;
}

export function push(name, params = {}, tab = nav.tab) {
  const sig = tab + name + JSON.stringify(params);
  const now = Date.now();
  if (nav.lastPush.key === sig && now - nav.lastPush.at < 600) return; // a double tap shouldn't push twice
  nav.lastPush = { key: sig, at: now };
  nav.stacks[tab] = [...nav.stacks[tab], route(name, params)];
  emit();
}

export function pop(tab = nav.tab) {
  if (nav.stacks[tab].length < 2) return false;
  const h = nav.stackHandlers[tab];
  if (h) h.animatePop();
  else commitPop(tab);
  return true;
}

export function commitPop(tab) {
  if (nav.stacks[tab].length < 2) return;
  nav.stacks[tab] = nav.stacks[tab].slice(0, -1);
  emit();
}

export function popToRoot(tab = nav.tab) {
  if (nav.stacks[tab].length < 2) return;
  if (nav.stacks[tab].length === 2) return pop(tab);
  nav.stacks[tab] = nav.stacks[tab].slice(0, 1);
  emit();
}

export function setTab(t) {
  if (t === nav.tab) {
    if (nav.stacks[t].length > 1) popToRoot(t);
    else nav.scrollers[t]?.scrollTo?.({ top: 0, behavior: 'smooth' });
    return;
  }
  nav.tab = t;
  emit();
}

/** Switch to a tab and show a screen there in one go (used for deep links between tabs). */
export function goTo(tab, name, params) {
  nav.tab = tab;
  nav.stacks[tab] = [nav.stacks[tab][0], route(name, params)];
  emit();
}

export function present(name, params = {}) {
  const id = 's' + ++seq;
  nav.sheets = [...nav.sheets, { id, name, params, dirty: false }];
  emit();
  return id;
}

export function dismiss(id, opts = {}) {
  const s = id ? nav.sheets.find((x) => x.id === id) : nav.sheets[nav.sheets.length - 1];
  if (!s) return;
  if (nav.sheetHandler) nav.sheetHandler.dismiss(s.id, opts);
  else removeSheet(s.id);
}

export function removeSheet(id) {
  const s = nav.sheets.find((x) => x.id === id);
  nav.sheets = nav.sheets.filter((x) => x.id !== id);
  emit();
  s?.params?.onClose?.();
}

export function setSheetDirty(id, v) {
  const s = nav.sheets.find((x) => x.id === id);
  if (s) s.dirty = !!v;
}

export const ScreenCtx = createContext({ index: 0, tab: 'groups', isTop: true });
export const SheetCtx = createContext(null);
export const useScreen = () => useContext(ScreenCtx);
export const useSheet = () => useContext(SheetCtx);
