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
    // A new touch means any earlier gesture is over, even one whose end event never reached us
    // (its target was removed mid-drag), so it can't keep blocking the recognisers.
    owner = null;
    st = { x0: x, y0: y, px: x, py: y, claimed: false, dead: false, vt: new VelocityTracker(), lastDx: 0, lastDy: 0 };
    st.vt.add(t, x, y);
    cfg.down?.(e);
  };

  const track = (x, y, t, e) => {
    if (!st || st.dead) return false;
    st.vt.add(t, x, y);
    st.px = x;
    st.py = y;
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
      // Follow the finger from here, less the slop, so the content doesn't jump by the slop distance.
      // On a busy phone the first move can arrive far past the slop; that distance is kept.
      if (cfg.axis === 'x') {
        st.x0 += Math.sign(dx) * SLOP;
        st.y0 = y;
      } else {
        st.y0 += Math.sign(dy) * SLOP;
        st.x0 = x;
      }
      dx = x - st.x0;
      dy = y - st.y0;
      cfg.start?.(e);
    }
    st.lastDx = dx;
    st.lastDy = dy;
    cfg.move(dx, dy, e);
    return true;
  };

  /** (x, y, t) is where and when the finger lifted, when known. */
  const finish = (cancelled, x, y, t, e) => {
    if (!st) return;
    // The lift can land past the last move we saw (moves get merged when the phone is busy).
    if (!cancelled && x !== undefined && (x !== st.px || y !== st.py)) track(x, y, t, e);
    const s = st;
    st = null;
    if (owner === s) owner = null;
    if (!s.claimed) return;
    let { vx, vy } = s.vt.velocity();
    // A finger that rested before lifting has no velocity, whatever it was doing before.
    if (t !== undefined && t - s.vt.lastTime() > 50) vx = vy = 0;
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
  const te = (e) => {
    const t = e.changedTouches?.[0];
    if (e.type === 'touchcancel' || !t) finish(true);
    else finish(false, t.clientX, t.clientY, e.timeStamp, e);
  };

  // mouse (desktop testing)
  const md = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    begin(e.clientX, e.clientY, e.timeStamp, e);
    const mm = (ev) => {
      if (track(ev.clientX, ev.clientY, ev.timeStamp, ev)) ev.preventDefault();
    };
    const mu = (ev) => {
      window.removeEventListener('pointermove', mm);
      window.removeEventListener('pointerup', mu);
      finish(false, ev.clientX, ev.clientY, ev.timeStamp, ev);
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
