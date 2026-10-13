// One drag recogniser for touch and mouse. It waits for a few pixels of movement (hysteresis),
// decides the direction, and then tracks the finger 1:1 from that point. Only one recogniser can own
// a touch: nested ones (a swipeable row inside a screen that swipes back) negotiate through `owner`.

import { VelocityTracker } from './motion.js';

let owner = null;
const SLOP = 7;

/**
 * cfg: {
 *   axis: 'x' | 'y',
 *   claim(dx, dy, event) → boolean   — decide whether this drag is ours once direction is known
 *   preClaim?(dx, dy, event) → boolean — return true to block native scrolling before the slop is crossed
 *   start?(event), move(dx, dy, event), end({ dx, dy, vx, vy, cancelled }), down?(event)
 * }
 */
export function attachDrag(el, cfg) {
  let st = null;

  const begin = (x, y, t, e) => {
    st = { x0: x, y0: y, claimed: false, dead: false, vt: new VelocityTracker(), lastDx: 0, lastDy: 0 };
    st.vt.add(t, x, y);
    cfg.down?.(e);
  };

  const track = (x, y, t, e) => {
    if (!st || st.dead) return false;
    st.vt.add(t, x, y);
    let dx = x - st.x0;
    let dy = y - st.y0;
    if (!st.claimed) {
      if (owner && owner !== st) {
        st.dead = true;
        return false;
      }
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) {
        return !!cfg.preClaim?.(dx, dy, e);
      }
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const along = cfg.axis === 'x' ? horizontal : !horizontal;
      if (!along || !cfg.claim(dx, dy, e)) {
        st.dead = true;
        return false;
      }
      st.claimed = true;
      owner = st;
      // Track 1:1 from here on, so the content doesn't jump by the slop distance.
      st.x0 = x;
      st.y0 = y;
      dx = 0;
      dy = 0;
      cfg.start?.(e);
    }
    st.lastDx = dx;
    st.lastDy = dy;
    cfg.move(dx, dy, e);
    return true;
  };

  const finish = (cancelled) => {
    if (!st) return;
    const s = st;
    st = null;
    if (owner === s) owner = null;
    if (!s.claimed) return;
    const { vx, vy } = s.vt.velocity();
    cfg.end({ dx: s.lastDx, dy: s.lastDy, vx, vy, cancelled });
  };

  // touch
  const ts = (e) => {
    if (e.touches.length !== 1) return finish(true);
    const t = e.touches[0];
    begin(t.clientX, t.clientY, e.timeStamp, e);
  };
  const tm = (e) => {
    if (!st) return;
    const t = e.touches[0];
    if (track(t.clientX, t.clientY, e.timeStamp, e) && e.cancelable) e.preventDefault();
  };
  const te = (e) => finish(e.type === 'touchcancel');

  // mouse (desktop testing)
  const md = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    begin(e.clientX, e.clientY, e.timeStamp, e);
    const mm = (ev) => {
      if (track(ev.clientX, ev.clientY, ev.timeStamp, ev)) ev.preventDefault();
    };
    const mu = () => {
      window.removeEventListener('pointermove', mm);
      window.removeEventListener('pointerup', mu);
      finish(false);
    };
    window.addEventListener('pointermove', mm);
    window.addEventListener('pointerup', mu);
  };

  el.addEventListener('touchstart', ts, { passive: true });
  el.addEventListener('touchmove', tm, { passive: false });
  el.addEventListener('touchend', te);
  el.addEventListener('touchcancel', te);
  el.addEventListener('pointerdown', md);
  return () => {
    el.removeEventListener('touchstart', ts);
    el.removeEventListener('touchmove', tm);
    el.removeEventListener('touchend', te);
    el.removeEventListener('touchcancel', te);
    el.removeEventListener('pointerdown', md);
  };
}

/** True when the touch started inside something that scrolls and isn't at its top. */
export function scrolledAbove(target, root) {
  let n = target;
  while (n && n !== root) {
    if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
    n = n.parentElement;
  }
  return false;
}

/** Elements that should keep their own horizontal gestures (inputs, sliders, chips rows). */
export function insideHorizontalControl(target) {
  return !!target?.closest?.('input, textarea, select, [data-hscroll], .swipe-row.is-open');
}

// Instant press feedback (on touch-down, not on release), with a short delay inside scroll views so a
// scroll doesn't flash every row it passes over.
export function installPressFeedback() {
  let pressed = null;
  let timer = 0;
  const clear = () => {
    clearTimeout(timer);
    if (pressed) pressed.classList.remove('is-pressed');
    pressed = null;
  };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('[data-press]');
    if (!el || el.disabled) return;
    clear();
    pressed = el;
    const delay = el.dataset.press === 'row' ? 70 : 0;
    if (delay) timer = setTimeout(() => el.classList.add('is-pressed'), delay);
    else el.classList.add('is-pressed');
  }, { passive: true });
  for (const t of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(t, clear, { passive: true });
  document.addEventListener('scroll', clear, { passive: true, capture: true });
}
