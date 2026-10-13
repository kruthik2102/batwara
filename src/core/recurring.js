// Recurring expenses. Each occurrence gets a deterministic id ("<rule>.<date>"), so two phones
// that both fill in the same month create the same event id and the merge keeps only one.

const pad = (n) => String(n).padStart(2, '0');
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function todayISO(now = new Date()) {
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function parts(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(s, n) {
  const { y, m, d } = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** k-th monthly occurrence; the 31st falls back to the last day of shorter months. */
export function monthlyAt(start, k) {
  const { y, m, d } = parts(start);
  const mm = m - 1 + k;
  const yy = y + Math.floor(mm / 12);
  const m2 = (((mm % 12) + 12) % 12) + 1;
  return fmt(yy, m2, Math.min(d, daysInMonth(yy, m2)));
}

export function occurrenceAt(rule, k) {
  return rule.freq === 'weekly' ? addDays(rule.start, 7 * k) : monthlyAt(rule.start, k);
}

/** Occurrences from the start date up to and including `today`, newest `keep` only. */
export function occurrencesUntil(rule, today, keep = 12) {
  const out = [];
  for (let k = 0; k < 2000; k++) {
    const d = occurrenceAt(rule, k);
    if (d > today) break;
    out.push(d);
  }
  return out.slice(-keep);
}

export function nextOccurrence(rule, today) {
  for (let k = 0; k < 2000; k++) {
    const d = occurrenceAt(rule, k);
    if (d > today) return d;
  }
  return null;
}

export const occurrenceId = (rid, date) => `${rid}.${date}`;

/** Occurrences that are due but not yet in the log (deleted ones count as present). */
export function dueOccurrences(st, today) {
  const out = [];
  for (const r of Object.values(st.recurring)) {
    if (!r.active || !st.groups[r.gid]) continue;
    for (const date of occurrencesUntil(r, today)) {
      const id = occurrenceId(r.id, date);
      if (!st.expenses[id]) out.push({ rule: r, date, id });
    }
  }
  return out;
}

export const FREQ_LABEL = { weekly: 'Every week', monthly: 'Every month' };
