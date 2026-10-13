// UPI deep links (NPCI "upi://pay" intent spec) and payment-app responses.

export const VPA_RE = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;

export function normalizeVpa(s) {
  return String(s || '').trim().replace(/\s+/g, '').toLowerCase();
}

export function isVpa(s) {
  return VPA_RE.test(normalizeVpa(s));
}

function cleanNote(s) {
  return String(s || '').replace(/[^\p{L}\p{N} .,'&()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
}

/** Person-to-person payment link. amount is in paise. */
export function upiUrl({ vpa, name, amount, note }) {
  const q = [`pa=${encodeURIComponent(normalizeVpa(vpa)).replace(/%40/g, '@')}`, `pn=${encodeURIComponent((name || '').slice(0, 50))}`];
  if (amount) q.push(`am=${(amount / 100).toFixed(2)}`);
  q.push('cu=INR');
  const tn = cleanNote(note);
  if (tn) q.push(`tn=${encodeURIComponent(tn)}`);
  return 'upi://pay?' + q.join('&');
}

/** Read a UPI QR payload ("upi://pay?pa=…&pn=…"). Returns null when it is not a UPI payment code. */
export function parseUpiUri(text) {
  const t = String(text || '').trim();
  if (!/^upi:\/\/pay\?/i.test(t)) return null;
  const params = new URLSearchParams(t.slice(t.indexOf('?') + 1));
  const vpa = normalizeVpa(params.get('pa'));
  if (!isVpa(vpa)) return null;
  return { vpa, name: (params.get('pn') || '').trim(), amount: params.get('am') || '' };
}

/** The response string a UPI app returns, e.g. "txnId=…&responseCode=00&Status=SUCCESS&txnRef=…". */
export function parseUpiResponse(resp) {
  if (!resp) return { status: 'unknown' };
  const p = {};
  for (const part of String(resp).split('&')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    let v = part.slice(i + 1);
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    p[part.slice(0, i).trim().toLowerCase()] = v;
  }
  const s = (p.status || '').toUpperCase();
  const status = s === 'SUCCESS' ? 'success' : s === 'SUBMITTED' ? 'submitted' : s.startsWith('FAIL') ? 'failure' : 'unknown';
  return { status, txnId: p.txnid || '', ref: p.approvalrefno || p.txnref || '', code: p.responsecode || '' };
}
