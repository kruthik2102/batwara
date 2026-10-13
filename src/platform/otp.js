// Phone verification. Two providers behind one interface:
//  • demo  – the code is generated on the phone and shown as an on-screen message (no SMS is sent).
//  • relay – set VITE_OTP_RELAY_URL at build time to a small stateless relay that sends real SMS
//            (see relay/README.md). The relay only ever sees the phone number and the code.

const RELAY = (import.meta.env?.VITE_OTP_RELAY_URL || '').replace(/\/$/, '');
export const otpMode = RELAY ? 'sms' : 'demo';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
const MAX_TRIES = 3;
const MAX_SENDS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

export class OtpError extends Error {
  constructor(message, code, triesLeft) {
    super(message);
    this.code = code;
    this.triesLeft = triesLeft;
  }
}

const demo = { requests: new Map(), sends: new Map() };

function demoSend(phone, now) {
  const sent = (demo.sends.get(phone) || []).filter((t) => now - t < SEND_WINDOW_MS);
  if (sent.length >= MAX_SENDS) throw new OtpError('Too many codes sent to this number. Try again in 15 minutes.', 'rate');
  sent.push(now);
  demo.sends.set(phone, sent);
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  const code = String(100000 + (buf[0] % 900000));
  const requestId = 'r' + now.toString(36) + buf[0].toString(36);
  demo.requests.set(requestId, { phone, code, expires: now + OTP_TTL_MS, tries: 0 });
  return { requestId, expiresAt: now + OTP_TTL_MS, resendAt: now + RESEND_AFTER_MS, demoCode: code };
}

function demoVerify(requestId, code, now) {
  const r = demo.requests.get(requestId);
  if (!r) throw new OtpError('That code has expired. Send a new one.', 'expired');
  if (now > r.expires) throw new OtpError('That code has expired. Send a new one.', 'expired');
  if (r.tries >= MAX_TRIES) throw new OtpError('Too many wrong tries. Send a new code.', 'locked', 0);
  if (code !== r.code) {
    r.tries += 1;
    const left = MAX_TRIES - r.tries;
    throw new OtpError(left ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Send a new code.', left ? 'wrong' : 'locked', left);
  }
  demo.requests.delete(requestId);
  return { phone: r.phone };
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(RELAY + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new OtpError('Couldn’t reach the verification service. Check your connection and try again.', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OtpError(data.message || 'Verification failed. Try again.', data.code || 'error', data.triesLeft);
  return data;
}

export async function sendCode(phone, now = Date.now()) {
  if (!RELAY) return demoSend(phone, now);
  const d = await post('/v1/otp/send', { phone });
  return { requestId: d.requestId, expiresAt: now + (d.ttl || 300) * 1000, resendAt: now + (d.resendAfter || 30) * 1000 };
}

export async function verifyCode(requestId, code, now = Date.now()) {
  if (!RELAY) return demoVerify(requestId, code, now);
  return post('/v1/otp/verify', { requestId, code });
}
