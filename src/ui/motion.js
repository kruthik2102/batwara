// Springs, momentum projection and rubber-banding, after Apple's "Designing Fluid Interfaces".
// A spring is described the way Apple's designers describe it: damping ratio (1 = no bounce)
// and response (seconds to reach the target, roughly). It always animates from its current
// value and velocity, so it can be grabbed and redirected at any moment.

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEP = 1 / 240;

export class Spring {
  constructor({ value = 0, response = 0.4, damping = 1, onUpdate, precision = 0.25 } = {}) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
    this.response = response;
    this.damping = damping;
    this.onUpdate = onUpdate;
    this.precision = precision;
    this.raf = 0;
    this.resolve = null;
  }

  get running() {
    return this.raf !== 0;
  }

  /** Animate to `target`. Optional initial `velocity` (units/s) hands off a gesture's speed. */
  to(target, opts = {}) {
    if (opts.response) this.response = opts.response;
    if (opts.damping) this.damping = opts.damping;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    this.until = opts.until || null;
    this.target = target;
    this.finish(false);
    if (reducedMotion()) {
      this.set(target);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this.resolve = resolve;
      let last = performance.now();
      const frame = (now) => {
        let dt = Math.min(0.064, (now - last) / 1000);
        last = now;
        const w = (2 * Math.PI) / this.response;
        const k = w * w;
        const c = 2 * this.damping * w;
        while (dt > 0) {
          const h = Math.min(STEP, dt);
          const a = -k * (this.value - this.target) - c * this.velocity;
          this.velocity += a * h;
          this.value += this.velocity * h;
          dt -= h;
        }
        if ((this.until && this.until(this.value)) || (Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 20)) {
          this.value = this.target;
          this.velocity = 0;
          this.raf = 0;
          this.onUpdate?.(this.value);
          this.finish(true);
          return;
        }
        this.onUpdate?.(this.value);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  finish(done) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const r = this.resolve;
    this.resolve = null;
    r?.(done);
  }

  /** Jump without animating (also cancels any motion in flight). */
  set(v) {
    this.finish(false);
    this.value = v;
    this.target = v;
    this.velocity = 0;
    this.onUpdate?.(v);
  }

  /** Grab: stop where it is, keep the value, drop velocity. */
  stop() {
    this.finish(false);
    this.velocity = 0;
    return this.value;
  }
}

/** Where a flick would come to rest, using UIScrollView's deceleration (Apple's sample code). */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot, dimension, c = 0.55) {
  const o = Math.abs(overshoot);
  return Math.sign(overshoot) * ((o * dimension * c) / (dimension + c * o));
}

export class VelocityTracker {
  constructor() {
    this.samples = [];
  }
  add(t, x, y) {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }
  velocity() {
    const s = this.samples;
    if (s.length < 2) return { vx: 0, vy: 0 };
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
