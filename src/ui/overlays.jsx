// Action sheets, alerts, pull-down menus and notification banners.

import { useEffect, useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { Spring, rubberband, project } from './motion.js';
import { attachDrag } from './gesture.js';
import { haptic } from '../platform/native.js';

const model = { items: [], banners: [] };
const subs = new Set();
let n = 0;
const emit = () => subs.forEach((f) => f());

function open(type, props) {
  return new Promise((resolve) => {
    model.items = [...model.items, { id: ++n, type, props, resolve, closing: false }];
    emit();
  });
}

function close(id, value) {
  const it = model.items.find((x) => x.id === id);
  if (!it || it.closing) return;
  it.closing = true;
  emit();
  setTimeout(() => {
    model.items = model.items.filter((x) => x.id !== id);
    emit();
    it.resolve(value);
  }, it.type === 'menu' ? 160 : 240);
}

/** actions: [{ label, value, destructive, icon }] → resolves with the value, or null for Cancel. */
export const actionSheet = (props) => open('sheet', props);
/** actions: [{ label, value, style: 'cancel' | 'destructive' | 'default' }] */
export const alertBox = (props) => open('alert', props);
export async function confirm({ title, message, confirm: ok = 'OK', destructive = false, cancel = 'Cancel' }) {
  if (destructive) haptic.warning();
  const v = await alertBox({ title, message, actions: [{ label: cancel, style: 'cancel', value: false }, { label: ok, style: destructive ? 'destructive' : 'default', value: true }] });
  return v === true;
}
export const notice = (title, message) => alertBox({ title, message, actions: [{ label: 'OK', style: 'default', value: true }] });

/** A pull-down menu that grows out of the button that opened it. items: [{ label, value, icon, checked, destructive, divider }] */
export function menu(anchor, items, props = {}) {
  haptic.light();
  return open('menu', { ...props, items, rect: anchor.getBoundingClientRect() });
}

export function closeTopOverlay() {
  const it = model.items[model.items.length - 1];
  if (!it) return false;
  close(it.id, it.type === 'alert' ? (it.props.actions.find((a) => a.style === 'cancel')?.value ?? null) : null);
  return true;
}

/** Notification-style banner from the top. { title, message, icon, tone, onTap, duration } */
export function banner(props) {
  const id = ++n;
  model.banners = [{ id, ...props }];
  emit();
  return id;
}
export const toast = (title, opts = {}) => banner({ title, icon: opts.icon || 'check', tone: opts.tone || 'ok', duration: 2200, ...opts });

function removeBanner(id) {
  model.banners = model.banners.filter((b) => b.id !== id);
  emit();
}

function ActionSheetView({ it }) {
  const { title, message, actions = [], cancel = 'Cancel' } = it.props;
  return (
    <div class={'ov-layer ov-sheet' + (it.closing ? ' is-closing' : '')}>
      <div class="ov-scrim" onClick={() => close(it.id, null)} />
      <div class="ov-sheet-card" role="dialog" aria-modal="true">
        <div class="ov-group">
          {(title || message) && (
            <div class="ov-sheet-head">
              {title && <div class="ov-sheet-title">{title}</div>}
              {message && <div class="ov-sheet-msg">{message}</div>}
            </div>
          )}
          {actions.map((a) => (
            <button type="button" data-press class={'ov-sheet-btn' + (a.destructive ? ' is-destructive' : '')} onClick={() => close(it.id, a.value)}>
              {a.icon && <Icon name={a.icon} size={22} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        <button type="button" data-press class="ov-sheet-btn ov-cancel" onClick={() => close(it.id, null)}>{cancel}</button>
      </div>
    </div>
  );
}

function AlertView({ it }) {
  const { title, message, actions = [] } = it.props;
  const stacked = actions.length > 2;
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('.ov-alert-btn:not(.is-cancel)')?.focus({ preventScroll: true }); }, []);
  return (
    <div class={'ov-layer ov-alert' + (it.closing ? ' is-closing' : '')}>
      <div class="ov-scrim" />
      <div class="ov-alert-card" role="alertdialog" aria-modal="true" ref={ref}>
        <div class="ov-alert-text">
          {title && <div class="ov-alert-title">{title}</div>}
          {message && <div class="ov-alert-msg">{message}</div>}
        </div>
        <div class={'ov-alert-actions' + (stacked ? ' is-stacked' : '')}>
          {actions.map((a) => (
            <button type="button" data-press class={'ov-alert-btn' + (a.style === 'destructive' ? ' is-destructive' : '') + (a.style === 'cancel' ? ' is-cancel' : '')} onClick={() => close(it.id, a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuView({ it }) {
  const { items, rect, title } = it.props;
  const W = Math.min(260, window.innerWidth - 24);
  const H = items.length * 46 + (title ? 34 : 0);
  const below = rect.bottom + 8 + H < window.innerHeight - 16 || rect.top < H + 24;
  const rightAligned = rect.left + rect.width / 2 > window.innerWidth / 2;
  const style = { width: W + 'px' };
  if (below) style.top = Math.min(rect.bottom + 8, window.innerHeight - H - 12) + 'px';
  else style.bottom = window.innerHeight - rect.top + 8 + 'px';
  if (rightAligned) style.right = Math.max(12, window.innerWidth - rect.right) + 'px';
  else style.left = Math.max(12, rect.left) + 'px';
  style.transformOrigin = `${rightAligned ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`;
  return (
    <div class={'ov-layer ov-menu' + (it.closing ? ' is-closing' : '')}>
      <div class="ov-catch" onClick={() => close(it.id, null)} />
      <div class="ov-menu-card" style={style} role="menu">
        {title && <div class="ov-menu-title">{title}</div>}
        {items.map((m) => (
          <button type="button" role="menuitemradio" aria-checked={m.checked ? 'true' : 'false'} data-press class={'ov-menu-item' + (m.destructive ? ' is-destructive' : '') + (m.divider ? ' has-divider' : '')} onClick={() => { haptic.selection(); close(it.id, m.value); }}>
            <span class="ov-menu-check">{m.checked && <Icon name="check" size={17} stroke={2.2} />}</span>
            <span class="ov-menu-label">{m.label}</span>
            {m.detail && <span class="ov-menu-detail">{m.detail}</span>}
            {m.icon && <Icon name={m.icon} size={20} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Banner({ b, index }) {
  const el = useRef(null);
  const spring = useRef(null);
  const y = useRef(-140);
  useLayoutEffect(() => {
    spring.current = new Spring({ value: -140, response: 0.45, damping: 0.82, onUpdate: (v) => { y.current = v; if (el.current) el.current.style.transform = `translate3d(0,${v}px,0)`; } });
    spring.current.set(-140);
    spring.current.to(0);
    if (b.tone === 'error') haptic.error();
    let timer = setTimeout(hide, b.duration || 4200);
    const off = attachDrag(el.current, {
      axis: 'y',
      claim: (dx, dy) => dy < 0,
      start: () => { clearTimeout(timer); spring.current.stop(); },
      move: (dx, dy) => { const v = dy > 0 ? rubberband(dy, 120) : dy; spring.current.value = v; y.current = v; el.current.style.transform = `translate3d(0,${v}px,0)`; },
      end: ({ vy }) => {
        if (y.current + project(vy) < -40) hide(vy);
        else { spring.current.to(0, { velocity: vy }); timer = setTimeout(hide, 2500); }
      },
    });
    function hide(velocity = 0) {
      clearTimeout(timer);
      spring.current.value = y.current;
      spring.current.to(-160, { velocity, damping: 1 }).then((done) => done && removeBanner(b.id));
    }
    b.hide = hide;
    return () => { clearTimeout(timer); off(); };
  }, []);
  return (
    <div class={'banner tone-' + (b.tone || 'info')} ref={el} style={{ zIndex: 400 + index, transform: 'translate3d(0,-140px,0)' }} role="status" aria-live="polite"
      onClick={() => { if (b.onTap) { b.onTap(); b.hide?.(); } }}>
      {b.icon && <span class="banner-icon"><Icon name={b.icon} size={20} stroke={2} /></span>}
      <span class="banner-text">
        {b.app && <span class="banner-app">{b.app}<span class="banner-when">now</span></span>}
        <span class="banner-title">{b.title}</span>
        {b.message && <span class="banner-msg">{b.message}</span>}
      </span>
    </div>
  );
}

export function OverlayHost() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => subs.delete(force);
  }, []);
  return (
    <>
      {model.items.map((it) => (it.type === 'sheet' ? <ActionSheetView key={it.id} it={it} /> : it.type === 'alert' ? <AlertView key={it.id} it={it} /> : <MenuView key={it.id} it={it} />))}
      <div class="banner-host">{model.banners.map((b, i) => <Banner key={b.id} b={b} index={i} />)}</div>
    </>
  );
}
