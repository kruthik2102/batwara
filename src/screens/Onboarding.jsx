import { useEffect, useRef, useState } from 'preact/hooks';
import { Button, GlassButton, Field, Section } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { AppIcon } from './AppIcon.jsx';
import { normalizePhone, formatPhone } from '../core/phone.js';
import { isVpa, normalizeVpa } from '../core/upi.js';
import { sendCode, verifyCode, otpMode, OtpError } from '../platform/otp.js';
import { banner } from '../ui/overlays.jsx';
import { haptic } from '../platform/native.js';
import { store } from '../store.js';
import { scanUpiFromImage } from './common.jsx';

const FEATURES = [
  ['lock', 'Private by design', 'No account server. Your groups live on this phone and the phones of the people in them.'],
  ['sync', 'Sync without a server', 'Send an encrypted update over WhatsApp, Quick Share or Bluetooth. Everyone’s copy merges.'],
  ['wallet', 'Settle with UPI', 'Pay from PhonePe, Google Pay, Paytm or BHIM with the amount already filled in.'],
];

export let onboardingBack = null;

export function Onboarding({ onDone }) {
  const [step, setStep] = useState('welcome');
  const [digits, setDigits] = useState('');
  const [req, setReq] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [phone, setPhone] = useState(null);
  const [name, setName] = useState('');
  const [vpa, setVpa] = useState('');
  const [suggest, setSuggest] = useState(null);
  const otpRef = useRef(null);
  const phoneRef = useRef(null);

  const back = { phone: 'welcome', otp: 'phone', name: null }[step];
  onboardingBack = back ? () => go(back) : null;

  function go(s) {
    setErr('');
    setStep(s);
  }

  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    const el = step === 'phone' ? phoneRef.current : step === 'otp' ? otpRef.current : null;
    if (el) setTimeout(() => el.focus({ preventScroll: true }), 350);
  }, [step]);

  async function send() {
    const e164 = normalizePhone(digits);
    if (!e164) {
      setErr('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.');
      haptic.error();
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await sendCode(e164);
      setReq({ ...r, phone: e164 });
      setCode('');
      setSuggest(null);
      go('otp');
      if (r.demoCode) {
        setTimeout(() => {
          setSuggest(r.demoCode);
          banner({
            app: 'Messages',
            icon: 'message',
            tone: 'sms',
            title: 'BW-BATWRA',
            message: `${r.demoCode} is your Batwara verification code. It expires in 5 minutes. Don’t share it with anyone.`,
            duration: 7000,
            onTap: () => fill(r.demoCode),
          });
        }, 1100);
      }
    } catch (e) {
      setErr(e instanceof OtpError ? e.message : 'Couldn’t send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function fill(c) {
    setCode(c);
    verify(c);
  }

  async function verify(c) {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    try {
      await verifyCode(req.requestId, c);
      haptic.success();
      setPhone(req.phone);
      go('name');
    } catch (e) {
      haptic.error();
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErr(e instanceof OtpError ? e.message : 'That didn’t work. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const n = name.trim();
    if (!n) return setErr('Add your name so friends recognise you.');
    const v = normalizeVpa(vpa);
    if (v && !isVpa(v)) return setErr('That doesn’t look like a UPI ID. It should look like name@bank. You can also leave it empty.');
    setBusy(true);
    await store.signIn({ phone, name: n, vpa: v });
    haptic.success();
    onDone();
  }

  const top = back ? (
    <div class="onb-top"><GlassButton icon="chevronLeft" label="Back" onClick={() => go(back)} /></div>
  ) : (
    <div class="onb-top" />
  );

  if (step === 'welcome') {
    return (
      <div class="onb" key="welcome">
        <div class="onb-body onb-step">
          <AppIcon size={92} class="onb-icon" />
          <h1 class="onb-title">Batwara</h1>
          <p class="onb-lede">Split bills with friends. Everything stays on your phone.</p>
          <div class="features">
            {FEATURES.map(([icon, t, m]) => (
              <div class="feature" key={t}>
                <span class="feature-icon"><Icon name={icon} size={30} stroke={1.7} /></span>
                <span class="feature-text"><span class="feature-title">{t}</span><span class="feature-msg">{m}</span></span>
              </div>
            ))}
          </div>
        </div>
        <div class="onb-foot">
          <Button onClick={() => go('phone')}>Continue</Button>
        </div>
      </div>
    );
  }

  if (step === 'phone') {
    const valid = !!normalizePhone(digits);
    return (
      <div class="onb" key="phone">
        {top}
        <div class="onb-body onb-step">
          <h1 class="onb-title is-left">Your mobile number</h1>
          <p class="onb-lede is-left">Friends add you to groups by this number. We’ll send a code to confirm it’s yours.</p>
          <label class="phone-field">
            <span class="phone-cc">+91</span>
            <input ref={phoneRef} class="phone-input" type="tel" inputMode="numeric" autocomplete="tel-national" placeholder="98765 43210" aria-label="Mobile number"
              value={digits} maxLength={14}
              onInput={(e) => {
                let d = e.currentTarget.value.replace(/\D/g, '');
                if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
                if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
                setDigits(d.slice(0, 10));
                setErr('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && send()} />
          </label>
          <p class="field-error" role="alert">{err}</p>
        </div>
        <div class="onb-foot">
          <Button disabled={!valid} busy={busy} onClick={send}>Send Code</Button>
          <p class="onb-note">{otpMode === 'demo' ? 'Demo build: no SMS is sent. The code appears on screen as a message.' : 'Standard SMS rates may apply.'}</p>
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    const left = Math.max(0, Math.ceil((req.resendAt - now) / 1000));
    const expired = now > req.expiresAt;
    return (
      <div class="onb" key="otp">
        {top}
        <div class="onb-body onb-step">
          <h1 class="onb-title is-left">Enter the code</h1>
          <p class="onb-lede is-left">Sent to {formatPhone(req.phone)}.</p>
          <div class={'otp' + (shake ? ' is-shaking' : '')} onClick={() => otpRef.current?.focus()}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} class={'otp-box' + (i === code.length ? ' is-active' : '') + (err && !code ? ' is-error' : '')}>
                {code[i] || (i === code.length ? <span class="otp-caret" /> : '')}
              </div>
            ))}
            <input ref={otpRef} class="otp-input" type="text" inputMode="numeric" autocomplete="one-time-code" maxLength={6} value={code} aria-label="6-digit code"
              onInput={(e) => {
                const c = e.currentTarget.value.replace(/\D/g, '').slice(0, 6);
                setCode(c);
                setErr('');
                if (c.length === 6) verify(c);
              }} />
          </div>
          <p class="field-error" role="alert">{err || (expired ? 'This code has expired. Send a new one.' : '')}</p>
          {suggest && code.length < 6 && (
            <div class="suggest">
              <button type="button" onClick={() => fill(suggest)}>
                <Icon name="message" size={17} />
                From Messages <b>{suggest}</b>
              </button>
            </div>
          )}
        </div>
        <div class="onb-foot">
          <Button variant="plain" disabled={left > 0 || busy} onClick={send}>{left > 0 ? `Send a new code in 0:${String(left).padStart(2, '0')}` : 'Send a New Code'}</Button>
        </div>
      </div>
    );
  }

  return (
    <div class="onb" key="name">
      {top}
      <div class="onb-body onb-step">
        <h1 class="onb-title is-left">What should friends call you?</h1>
        <p class="onb-lede is-left">Your name shows up in their groups. Your UPI ID lets them pay you back in one tap.</p>
        <div style={{ marginTop: '26px', marginLeft: '-16px', marginRight: '-16px' }}>
          <Section>
            <Field label="Name" value={name} onInput={(v) => { setName(v); setErr(''); }} placeholder="Your name" autoFocus maxLength={60} autocomplete="name" enterKeyHint="next" />
            <Field label="UPI ID" value={vpa} onInput={(v) => { setVpa(v); setErr(''); }} placeholder="Optional · name@bank" autocomplete="off" inputMode="email" enterKeyHint="done" />
          </Section>
          <div style={{ padding: '0 16px' }}>
            <Button variant="gray" size="medium" icon="qr" onClick={async () => { const r = await scanUpiFromImage(); if (r) { setVpa(r.vpa); if (!name && r.name) setName(r.name); } }}>Read UPI ID from a QR Code</Button>
          </div>
        </div>
        <p class="field-error" role="alert">{err}</p>
      </div>
      <div class="onb-foot">
        <Button disabled={!name.trim()} busy={busy} onClick={finish}>Get Started</Button>
        <p class="onb-note">Verified {formatPhone(phone)}</p>
      </div>
    </div>
  );
}
