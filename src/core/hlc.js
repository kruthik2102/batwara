// Hybrid logical clock. Encoded so that plain string comparison gives causal-ish order:
//   "000001760000000000-00000-dk3m9x2q"  → wall-clock ms, counter, device id.

const MS_W = 15;
const C_W = 5;

export function encodeHlc(ms, c, dev) {
  return `${String(ms).padStart(MS_W, '0')}-${String(c).padStart(C_W, '0')}-${dev}`;
}

export function decodeHlc(s) {
  const [ms, c, dev] = String(s).split('-');
  return { ms: Number(ms), c: Number(c), dev };
}

export function createClock(dev, saved) {
  return { dev, ms: saved?.ms || 0, c: saved?.c || 0 };
}

/** Next timestamp for a local event. */
export function tick(clock, now = Date.now()) {
  if (now > clock.ms) {
    clock.ms = now;
    clock.c = 0;
  } else {
    clock.c += 1;
  }
  return encodeHlc(clock.ms, clock.c, clock.dev);
}

/** Fold in a timestamp seen on another device so later local events sort after it. */
export function observe(clock, hlc, now = Date.now()) {
  const r = decodeHlc(hlc);
  if (!Number.isFinite(r.ms) || !Number.isFinite(r.c)) return;
  const ms = Math.max(clock.ms, r.ms, now);
  if (ms === clock.ms && ms === r.ms) clock.c = Math.max(clock.c, r.c) + 1;
  else if (ms === clock.ms) clock.c += 1;
  else if (ms === r.ms) clock.c = r.c + 1;
  else clock.c = 0;
  clock.ms = ms;
}

export function hlcTime(hlc) {
  return decodeHlc(hlc).ms;
}
