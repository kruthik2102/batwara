// Building blocks in the Apple idiom: large-title screens, inset grouped lists, glass buttons,
// switches, segmented controls, steppers, swipe actions.

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import { Icon, CheckMark } from './icons.jsx';
import { useScreen, nav, pop } from './nav.js';
import { Spring, project, rubberband } from './motion.js';
import { attachDrag } from './gesture.js';
import { haptic } from '../platform/native.js';
import { formatMoney } from '../core/money.js';
import { initials } from './format.js';
import { store } from '../store.js';

export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.subscribe(force), []);
  return store;
}

// ---- screens --------------------------------------------------------------------------------
export function Screen({ title, large = true, right, left, children, bottom, class: cls = '', header, onScrollY }) {
  const ctx = useScreen();
  const scroller = useRef(null);
  const bar = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (ctx.index === 0) nav.scrollers[ctx.tab] = el;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = el.scrollTop;
      bar.current?.classList.toggle('is-scrolled', y > 2);
      bar.current?.classList.toggle('show-title', !large || y > 40);
      onScrollY?.(y);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener('scroll', on, { passive: true });
    return () => { el.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, [large]);
  const back = ctx.index > 0 ? <GlassButton icon="chevronLeft" label="Back" onClick={() => pop(ctx.tab)} /> : null;
  return (
    <div class={'screen ' + cls}>
      <header class={'navbar' + (large ? '' : ' show-title')} ref={bar}>
        <div class="navbar-side">{left !== undefined ? left : back}</div>
        <div class="navbar-title">{title}</div>
        <div class="navbar-side is-right">{right}</div>
      </header>
      <div class="screen-scroll" ref={scroller}>
        {large && <h1 class="large-title">{title}</h1>}
        {header}
        {children}
        <div class="scroll-end" />
      </div>
      {bottom}
    </div>
  );
}

export function GlassButton({ icon, label, onClick, tint, disabled, text, badge, class: cls = '' }) {
  return (
    <button type="button" class={'glass-btn' + (tint ? ' is-tint' : '') + (text ? ' has-text' : '') + ' ' + cls} aria-label={label} title={label} onClick={onClick} disabled={disabled} data-press>
      {icon && <Icon name={icon} size={text ? 18 : 21} stroke={2} />}
      {text && <span>{text}</span>}
      {badge ? <span class="glass-badge">{badge}</span> : null}
    </button>
  );
}

// ---- sheets -----------------------------------------------------------------------------------
export function SheetHeader({ title, onCancel, onDone, doneDisabled, doneIcon = 'check', doneLabel = 'Done', cancelIcon = 'xmark', cancelLabel = 'Close', busy, subtitle }) {
  return (
    <div class="sheet-header">
      <div class="sheet-header-side">{onCancel && <GlassButton icon={cancelIcon} label={cancelLabel} onClick={onCancel} />}</div>
      <div class="sheet-header-title">
        <div>{title}</div>
        {subtitle && <div class="sheet-header-sub">{subtitle}</div>}
      </div>
      <div class="sheet-header-side is-right">
        {onDone && <GlassButton icon={busy ? null : doneIcon} label={doneLabel} tint onClick={onDone} disabled={doneDisabled || busy} text={busy ? '…' : undefined} />}
      </div>
    </div>
  );
}

export function SheetBody({ children, class: cls = '' }) {
  return <div class={'sheet-scroll ' + cls}>{children}<div class="scroll-end small" /></div>;
}

// ---- lists ---------------------------------------------------------------------------------------
export function Section({ header, footer, children, class: cls = '', plain, action }) {
  return (
    <section class={'section ' + cls}>
      {(header || action) && (
        <div class="section-header">
          <h2>{header}</h2>
          {action}
        </div>
      )}
      <div class={plain ? 'section-plain' : 'section-body'}>{children}</div>
      {footer && <p class="section-footer">{footer}</p>}
    </section>
  );
}

export function Row({ icon, title, subtitle, detail, chevron, onClick, destructive, tint, children, accessory, class: cls = '', label, multiline, disabled }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} class={'row' + (onClick ? ' is-button' : '') + (icon ? ' has-icon' : '') + ' ' + cls} onClick={onClick} data-press={onClick ? 'row' : undefined} aria-label={label} disabled={disabled}>
      {icon && <span class="row-icon">{icon}</span>}
      <span class={'row-main' + (multiline ? ' is-multiline' : '')}>
        <span class={'row-title' + (destructive ? ' is-destructive' : '') + (tint ? ' is-tint' : '')}>{title}</span>
        {subtitle && <span class="row-sub">{subtitle}</span>}
      </span>
      {children}
      {detail !== undefined && detail !== null && <span class="row-detail">{detail}</span>}
      {accessory}
      {chevron && <Icon name="chevronRight" class="row-chevron" size={15} stroke={2.4} />}
    </Tag>
  );
}

export function Field({ label, value, onInput, placeholder, type = 'text', inputMode, autoFocus, maxLength, id, prefix, suffix, multiline, autocomplete, enterKeyHint, onBlur, onKeyDown, inputRef, class: cls = '', readOnly }) {
  const ref = useRef(null);
  useEffect(() => {
    if (inputRef) inputRef.current = ref.current;
    if (autoFocus) setTimeout(() => ref.current?.focus({ preventScroll: true }), 420);
  }, []);
  const props = {
    id, ref, value, placeholder, maxLength, inputMode, autocomplete, enterKeyHint, onBlur, onKeyDown, readOnly,
    onInput: (e) => onInput?.(e.currentTarget.value),
    'aria-label': label,
    class: 'field-input',
  };
  return (
    <label class={'field' + (multiline ? ' is-multiline' : '') + ' ' + cls}>
      {label && <span class="field-label">{label}</span>}
      {prefix && <span class="field-prefix">{prefix}</span>}
      {multiline ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
      {suffix}
    </label>
  );
}

export function SearchField({ value, onInput, placeholder = 'Search' }) {
  return (
    <label class="search">
      <Icon name="search" size={17} stroke={2.2} />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder} onInput={(e) => onInput(e.currentTarget.value)} enterKeyHint="search" />
      {value && (
        <button type="button" class="search-clear" aria-label="Clear search" onClick={() => onInput('')}>
          <Icon name="xmark" size={12} stroke={3} />
        </button>
      )}
    </label>
  );
}

// ---- controls --------------------------------------------------------------------------------------
export function Button({ children, onClick, variant = 'filled', size = 'large', icon, disabled, destructive, type = 'button', class: cls = '', busy, label }) {
  return (
    <button type={type} class={`btn btn-${variant} btn-${size}${destructive ? ' is-destructive' : ''} ${cls}`} onClick={onClick} disabled={disabled || busy} aria-label={label} data-press>
      {busy ? <span class="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'small' ? 16 : 19} stroke={2.1} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Switch({ checked, onChange, label, id }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked ? 'true' : 'false'} aria-label={label} class={'switch' + (checked ? ' is-on' : '')}
      onClick={(e) => { e.stopPropagation(); haptic.selection(); onChange(!checked); }}>
      <span class="switch-thumb" />
    </button>
  );
}

/** Segmented control whose selection pill glides between segments on a spring. */
export function Segmented({ options, value, onChange, label, class: cls = '' }) {
  const host = useRef(null);
  const ind = useRef(null);
  const sx = useRef(null);
  const sw = useRef(null);
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const place = (animate) => {
    const btn = host.current?.querySelectorAll('.segmented-btn')[idx];
    if (!btn || !btn.offsetWidth) return;
    if (!sx.current) {
      sx.current = new Spring({ value: btn.offsetLeft, response: 0.34, damping: 0.92, onUpdate: (v) => { if (ind.current) ind.current.style.transform = `translate3d(${v}px,0,0)`; } });
      sw.current = new Spring({ value: btn.offsetWidth, response: 0.34, damping: 0.92, onUpdate: (v) => { if (ind.current) ind.current.style.width = `${v}px`; } });
      animate = false;
    }
    if (animate) {
      sx.current.to(btn.offsetLeft);
      sw.current.to(btn.offsetWidth);
    } else {
      sx.current.set(btn.offsetLeft);
      sw.current.set(btn.offsetWidth);
    }
  };
  useLayoutEffect(() => place(true), [idx, options.length]);
  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, [idx]);
  return (
    <div class={'segmented ' + cls} ref={host} role="tablist" aria-label={label}>
      <span class="segmented-ind" ref={ind} aria-hidden="true" />
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.id === value ? 'true' : 'false'} class={'segmented-btn' + (o.id === value ? ' is-on' : '')}
          onClick={() => { if (o.id !== value) { haptic.selection(); onChange(o.id); } }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }) {
  const v = Number(value) || 0;
  const set = (n) => { haptic.selection(); onChange(String(Math.max(min, Math.min(max, n)))); };
  return (
    <span class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Fewer" disabled={v <= min} onClick={() => set(v - 1)} data-press><Icon name="minus" size={16} stroke={2.4} /></button>
      <span class="stepper-sep" />
      <button type="button" aria-label="More" disabled={v >= max} onClick={() => set(v + 1)} data-press><Icon name="plus" size={16} stroke={2.4} /></button>
    </span>
  );
}

export function Check({ on, onClick, label }) {
  return (
    <button type="button" class="check-btn" role="checkbox" aria-checked={on ? 'true' : 'false'} aria-label={label} onClick={(e) => { e.stopPropagation(); haptic.selection(); onClick(); }}>
      <CheckMark on={on} />
    </button>
  );
}

// ---- identity & money ---------------------------------------------------------------------------------
const AV = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'indigo', 'red', 'mint', 'cyan', 'brown'];
function hue(s) {
  let h = 0;
  for (const c of s || '') h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}

export function Avatar({ uid, name, size = 40, me }) {
  return (
    <span class={'avatar c-' + (me ? 'tint' : hue(name || uid))} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function IconTile({ icon, color = 'gray', size = 30 }) {
  return (
    <span class={'tile c-' + color} style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.28)}px` }} aria-hidden="true">
      <Icon name={icon} size={Math.round(size * 0.6)} stroke={2} />
    </span>
  );
}

export function Money({ v, cur = 'INR', tone, plus, fixed, class: cls = '' }) {
  const t = tone === 'auto' ? (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero') : tone;
  return <span class={'money' + (t ? ' tone-' + t : '') + ' ' + cls}>{formatMoney(v, cur, { plus, fixed })}</span>;
}

export function Pill({ tone = 'gray', children, icon }) {
  return (
    <span class={'pill tone-' + tone}>
      {icon && <Icon name={icon} size={12} stroke={2.6} />}
      {children}
    </span>
  );
}

export function Empty({ icon, title, message, children }) {
  return (
    <div class="empty">
      {icon && <span class="empty-icon"><Icon name={icon} size={44} stroke={1.5} /></span>}
      <h3 class="empty-title">{title}</h3>
      {message && <p class="empty-msg">{message}</p>}
      {children && <div class="empty-actions">{children}</div>}
    </div>
  );
}

// ---- swipe actions ------------------------------------------------------------------------------------------
let openRow = null;

/** A row that reveals actions when swiped left; a long swipe runs the first action. */
export function SwipeRow({ children, actions, onFullSwipe }) {
  const el = useRef(null);
  const content = useRef(null);
  const tray = useRef(null);
  const st = useRef({ x: 0, armed: false });
  const actionW = 80 * actions.length;

  useEffect(() => {
    const s = st.current;
    const width = () => el.current.offsetWidth;
    const paint = (v) => {
      s.x = v;
      content.current.style.transform = v ? `translate3d(${v}px,0,0)` : '';
      tray.current.style.width = `${Math.max(0, -v)}px`;
      el.current.classList.toggle('is-open', v < -2);
      el.current.classList.toggle('is-armed', s.armed);
    };
    s.spring = new Spring({ value: 0, response: 0.34, damping: 1, onUpdate: paint });
    s.close = () => { s.armed = false; s.spring.value = s.x; s.spring.to(0); if (openRow === s) openRow = null; };
    let base = 0;
    const off = attachDrag(el.current, {
      axis: 'x',
      claim: (dx) => dx < 0 || s.x < 0,
      start: () => {
        if (openRow && openRow !== s) openRow.close();
        base = s.spring.running ? s.spring.stop() : s.x;
      },
      move: (dx) => {
        let v = base + dx;
        if (v > 0) v = rubberband(v, width(), 0.3);
        const armed = !!onFullSwipe && v < -width() * 0.6;
        if (armed !== s.armed) { s.armed = armed; haptic.medium(); }
        paint(v);
      },
      end: ({ vx }) => {
        s.spring.value = s.x;
        if (s.armed && onFullSwipe) {
          s.spring.to(-width(), { velocity: vx }).then(() => onFullSwipe());
          return;
        }
        const projected = s.x + project(vx, 0.99);
        if (projected < -actionW / 2) { s.spring.to(-actionW, { velocity: vx }); openRow = s; }
        else s.close();
      },
    });
    const outside = (e) => { if (s.x < 0 && !el.current.contains(e.target)) s.close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => { off(); document.removeEventListener('pointerdown', outside, true); if (openRow === s) openRow = null; };
  }, [actions.length]);

  return (
    <div class="swipe-row" ref={el}>
      <div class="swipe-tray" ref={tray}>
        {actions.map((a) => (
          <button type="button" class={'swipe-action c-' + (a.color || 'red')} onClick={() => { st.current.close(); a.onAction(); }}>
            {a.icon && <Icon name={a.icon} size={20} stroke={2} />}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div class="swipe-content" ref={content} onClickCapture={(e) => { if (st.current.x < -2) { e.stopPropagation(); e.preventDefault(); st.current.close(); } }}>
        {children}
      </div>
    </div>
  );
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { return await fn(); } finally { setBusy(false); }
  };
  return [busy, run];
}
