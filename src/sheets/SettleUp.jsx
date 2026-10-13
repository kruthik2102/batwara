import { useEffect, useState } from 'preact/hooks';
import { useStore, SheetHeader, SheetBody, Section, Row, Field, Button, Money, Segmented, IconTile } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { useSheet } from '../ui/nav.js';
import { groupTransfers } from '../core/balances.js';
import { formatMoney, parseAmount, toInput } from '../core/money.js';
import { upiUrl, parseUpiResponse, isVpa, normalizeVpa } from '../core/upi.js';
import { PersonAvatar, nameOf, scanUpiFromImage, shareGroupFlow } from '../screens/common.jsx';
import { menu, toast, notice } from '../ui/overlays.jsx';
import { isNative, listUpiApps, launchUpi, copyText, shareText, haptic } from '../platform/native.js';
import { firstName } from '../ui/format.js';

/**
 * Settle up. Money never passes through Batwara: we open the payer's UPI app with the amount filled in,
 * then record the payment. It only counts once the person who received it confirms on their phone.
 */
export function SettleUpSheet({ gid, to, from, amount }) {
  const s = useStore();
  const sh = useSheet();
  const g = s.state.groups[gid];
  const me = s.me;
  const [step, setStep] = useState(to ? 'pay' : from ? 'receive' : 'choose');
  const [peer, setPeer] = useState(to || from || null);
  const [amt, setAmt] = useState(amount ? toInput(amount) : '');
  const [vpaDraft, setVpaDraft] = useState('');
  const [vpaErr, setVpaErr] = useState('');
  const [apps, setApps] = useState(null);
  const [result, setResult] = useState(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ from: me, to: g.members.find((u) => u !== me) || me });

  useEffect(() => { if (isNative) listUpiApps().then(setApps); else setApps([]); }, []);

  const transfers = groupTransfers(s.state, gid);
  const iOwe = transfers.filter((t) => t.from === me);
  const owedMe = transfers.filter((t) => t.to === me);
  const minor = parseAmount(amt) || 0;
  const peerUser = peer ? s.state.users[peer] : null;
  const vpa = peerUser?.vpa || '';
  const upiOk = g.cur === 'INR';

  const goPay = (t) => { setPeer(t.to); setAmt(toInput(t.amt)); setStep('pay'); };
  const goReceive = (t) => { setPeer(t.from); setAmt(toInput(t.amt)); setStep('receive'); };

  const link = vpa && minor > 0 ? upiUrl({ vpa, name: peerUser?.name || '', amount: minor, note: `Batwara ${g.name}` }) : '';

  async function payWith(app) {
    if (!(minor > 0)) return notice('Enter an amount', 'How much are you paying?');
    if (!vpa) return notice('UPI ID needed', `Add ${firstName(nameOf(peer))}’s UPI ID first.`);
    haptic.light();
    try {
      const r = await launchUpi(link, app?.packageName);
      const parsed = parseUpiResponse(r?.response);
      setResult({ app: app?.label || 'your UPI app', ...parsed, launched: true });
      setStep('confirm');
    } catch (e) {
      notice('Couldn’t open a UPI app', /no upi app|not found|activity/i.test(String(e?.message)) ? 'No UPI app is installed on this phone. Copy the UPI ID and pay from any app.' : String(e?.message || e));
    }
  }

  async function record(methodUsed, extra = {}) {
    setBusy(true);
    try {
      await s.proposePayment({ gid, from: extra.from || me, to: extra.to || peer, amt: minor, method: methodUsed, vpa, app: result?.app && methodUsed === 'upi' ? result.app : '', ref: result?.txnId || result?.ref || '' });
      haptic.success();
      setStep(extra.to === me || (step === 'receive') ? 'recorded' : 'sent');
    } finally {
      setBusy(false);
    }
  }

  const saveVpa = async () => {
    const n = normalizeVpa(vpaDraft);
    if (!isVpa(n)) return setVpaErr('That doesn’t look like a UPI ID. It should look like name@bank.');
    await s.setVpaFor(gid, peer, n);
    setVpaErr('');
    toast('UPI ID saved');
  };

  // ---- steps ---------------------------------------------------------------------------------------------
  if (step === 'choose') {
    return (
      <>
        <SheetHeader title="Settle Up" subtitle={g.name} onCancel={() => sh.close()} />
        <SheetBody>
          {!iOwe.length && !owedMe.length && (
            <div class="status-big">
              <IconTile icon="check" color="green" size={64} />
              <div class="t-title2">You’re settled up</div>
              <p>Nobody owes you and you don’t owe anyone in {g.name}.</p>
            </div>
          )}
          {iOwe.length > 0 && (
            <Section header="You pay">
              {iOwe.map((t) => (
                <Row key={t.to} class="row-list" icon={<PersonAvatar uid={t.to} size={36} />} title={nameOf(t.to)} subtitle={s.state.users[t.to]?.vpa ? 'UPI ID saved' : 'No UPI ID yet'}
                  detail={<Money v={t.amt} cur={g.cur} tone="neg" />} chevron onClick={() => goPay(t)} />
              ))}
            </Section>
          )}
          {owedMe.length > 0 && (
            <Section header="Pays you">
              {owedMe.map((t) => (
                <Row key={t.from} class="row-list" icon={<PersonAvatar uid={t.from} size={36} />} title={nameOf(t.from)} subtitle="Record a payment or send a reminder"
                  detail={<Money v={t.amt} cur={g.cur} tone="pos" />} chevron onClick={() => goReceive(t)} />
              ))}
            </Section>
          )}
          <Section footer="For payments between two other people, or amounts that don’t match a suggestion.">
            <Row icon={<IconTile icon="banknote" color="gray" size={30} />} title="Record Another Payment" chevron onClick={() => { setAmt(''); setStep('custom'); }} />
          </Section>
        </SheetBody>
      </>
    );
  }

  if (step === 'pay') {
    return (
      <>
        <SheetHeader title={`Pay ${firstName(nameOf(peer))}`} subtitle={g.name} onCancel={() => sh.close()} cancelIcon={to ? 'xmark' : 'chevronLeft'} cancelLabel={to ? 'Close' : 'Back'} />
        <SheetBody>
          <div class="amount-hero">
            <PersonAvatar uid={peer} size={64} />
            <div class="t-headline">{nameOf(peer)}</div>
            <label class="pay-amount">
              <span>{g.cur === 'INR' ? '₹' : g.cur}</span>
              <input value={amt} style={{ width: `${Math.max(1, amt.length) * 0.64}em` }} inputMode="decimal" placeholder="0" aria-label="Amount to pay" onInput={(e) => setAmt(e.currentTarget.value.replace(/[^\d.]/g, ''))} />
            </label>
          </div>
          {!upiOk && (
            <Section footer={`UPI only works in rupees. This group uses ${g.cur}, so pay another way and record it here.`}>
              <Row icon={<IconTile icon="banknote" color="green" size={30} />} title="Record Payment" chevron onClick={() => record('other')} />
            </Section>
          )}
          {upiOk && (vpa ? (
            <Section header="UPI ID" footer="Check the name your UPI app shows before you pay.">
              <Row icon={<IconTile icon="at" color="tint" size={30} />} title={vpa} subtitle={nameOf(peer)} accessory={
                <Button size="small" variant="gray" onClick={async () => { if (await copyText(vpa)) toast('UPI ID copied', { icon: 'copy' }); }}>Copy</Button>
              } />
            </Section>
          ) : (
            <Section header={`${firstName(nameOf(peer))}’s UPI ID`} footer="A phone number can’t be turned into a UPI ID, so ask them for it once. It’s saved for the whole group.">
              <Field value={vpaDraft} onInput={(v) => { setVpaDraft(v); setVpaErr(''); }} placeholder="name@bank" autocomplete="off" inputMode="email"
                suffix={<Button size="small" variant="tinted" disabled={!vpaDraft.trim()} onClick={saveVpa}>Save</Button>} />
              <Row icon={<Icon name="qr" size={22} />} title="Read from a QR Code Image" tint onClick={async () => { const r = await scanUpiFromImage(); if (r) { setVpaDraft(r.vpa); setVpaErr(''); } }} />
            </Section>
          ))}
          {vpaErr && <p class="field-error" style={{ marginTop: '-14px', marginBottom: '12px' }}>{vpaErr}</p>}
          {upiOk && vpa && (
            <Section header="Pay with" footer="Your UPI app asks for your PIN. Batwara never sees it or your bank details.">
              {apps && apps.length > 0 ? (
                <div class="upi-apps">
                  {apps.map((a) => (
                    <button type="button" class="upi-app" data-press onClick={() => payWith(a)} key={a.packageName}>
                      {a.icon ? <img src={a.icon} alt="" /> : <IconTile icon="wallet" color="tint" size={48} />}
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <Row icon={<IconTile icon="arrowUpRight" color="tint" size={30} />} title={apps?.length ? 'Choose Another App' : 'Open UPI App'} chevron onClick={() => payWith(null)} />
              {!isNative && link && <div class="upi-link">{link}</div>}
            </Section>
          )}
          <Section>
            <Row icon={<IconTile icon="banknote" color="green" size={30} />} title="I Paid in Cash" chevron onClick={() => record('cash')} />
          </Section>
        </SheetBody>
      </>
    );
  }

  if (step === 'confirm') {
    const r = result || {};
    const said = r.status === 'success' ? `${r.app} says the payment went through.` : r.status === 'failure' ? `${r.app} says the payment failed.` : r.status === 'submitted' ? `${r.app} says the payment is still processing.` : `Did the payment of ${formatMoney(minor, g.cur)} go through?`;
    return (
      <>
        <SheetHeader title="Payment" onCancel={() => setStep('pay')} cancelIcon="chevronLeft" cancelLabel="Back" />
        <SheetBody>
          <div class="status-big">
            <IconTile icon={r.status === 'failure' ? 'warning' : r.status === 'success' ? 'check' : 'clock'} color={r.status === 'failure' ? 'red' : r.status === 'success' ? 'green' : 'orange'} size={64} />
            <div class="t-title2">{formatMoney(minor, g.cur)} to {firstName(nameOf(peer))}</div>
            <p>{said}{r.txnId ? ` Reference ${r.txnId}.` : ''} Only mark it paid if the money left your account.</p>
          </div>
          <div class="sheet-pad" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Button busy={busy} onClick={() => record('upi')} disabled={r.status === 'failure'}>Yes, I Paid</Button>
            <Button variant="gray" onClick={() => setStep('pay')}>{r.status === 'failure' ? 'Try Again' : 'No, Go Back'}</Button>
          </div>
        </SheetBody>
      </>
    );
  }

  if (step === 'sent' || step === 'recorded') {
    const confirmed = step === 'recorded';
    return (
      <>
        <SheetHeader title={confirmed ? 'Recorded' : 'Marked as Paid'} onDone={() => sh.close({ force: true })} doneLabel="Done" />
        <SheetBody>
          <div class="status-big">
            <IconTile icon="check" color="green" size={64} />
            <div class="t-title2">{confirmed ? 'Payment recorded' : `Waiting for ${firstName(nameOf(peer))}`}</div>
            <p>{confirmed ? 'Balances are updated. Send an update so everyone’s copy shows it.' : `${firstName(nameOf(peer))} confirms it on their phone, then it counts. Send an update so it reaches them.`}</p>
          </div>
          <div class="sheet-pad" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Button icon="share" onClick={() => { sh.close({ force: true }); setTimeout(() => shareGroupFlow(gid, 'update'), 350); }}>Send Update</Button>
            <Button variant="gray" onClick={() => sh.close({ force: true })}>Later</Button>
          </div>
        </SheetBody>
      </>
    );
  }

  if (step === 'receive') {
    const myVpa = s.profile.vpa;
    return (
      <>
        <SheetHeader title={`From ${firstName(nameOf(peer))}`} subtitle={g.name} onCancel={() => (from ? sh.close() : setStep('choose'))} cancelIcon={from ? 'xmark' : 'chevronLeft'} cancelLabel={from ? 'Close' : 'Back'} />
        <SheetBody>
          <div class="amount-hero">
            <PersonAvatar uid={peer} size={64} />
            <div class="t-headline">{nameOf(peer)} pays you</div>
            <label class="pay-amount">
              <span>{g.cur === 'INR' ? '₹' : g.cur}</span>
              <input value={amt} style={{ width: `${Math.max(1, amt.length) * 0.64}em` }} inputMode="decimal" placeholder="0" aria-label="Amount received" onInput={(e) => setAmt(e.currentTarget.value.replace(/[^\d.]/g, ''))} />
            </label>
          </div>
          <Section header="Got the money?" footer="You’re the one receiving it, so recording it here confirms it straight away.">
            <div style={{ padding: '12px', background: 'var(--card)' }}>
              <Segmented options={[{ id: 'upi', label: 'UPI' }, { id: 'cash', label: 'Cash' }, { id: 'other', label: 'Other' }]} value={method} onChange={setMethod} label="Payment method" />
            </div>
            <Row icon={<IconTile icon="check" color="green" size={30} />} title="Record Payment Received" disabled={!(minor > 0) || busy} onClick={() => record(method, { from: peer, to: me })} />
          </Section>
          <Section header="Not yet?">
            <Row icon={<IconTile icon="message" color="blue" size={30} />} title="Send a Reminder" chevron onClick={() => shareText({
              title: 'Payment reminder',
              text: `Hi ${firstName(nameOf(peer))}, a reminder from Batwara: you owe me ${formatMoney(minor, g.cur)} for ${g.name}.${myVpa ? ` You can pay me on UPI at ${myVpa}.` : ''}`,
            })} />
          </Section>
        </SheetBody>
      </>
    );
  }

  // custom: any member pays any member
  const fromName = nameOf(custom.from);
  const toName = nameOf(custom.to);
  const pickPerson = async (e, key) => {
    const v = await menu(e.currentTarget, g.members.map((u) => ({ label: nameOf(u), value: u, checked: custom[key] === u })));
    if (v) setCustom((c) => ({ ...c, [key]: v }));
  };
  const valid = custom.from !== custom.to && minor > 0;
  return (
    <>
      <SheetHeader title="Record Payment" subtitle={g.name} onCancel={() => setStep('choose')} cancelIcon="chevronLeft" cancelLabel="Back" />
      <SheetBody>
        <Section>
          <Row icon={<PersonAvatar uid={custom.from} size={32} />} title="From" detail={fromName} chevron onClick={(e) => pickPerson(e, 'from')} />
          <Row icon={<PersonAvatar uid={custom.to} size={32} />} title="To" detail={toName} chevron onClick={(e) => pickPerson(e, 'to')} />
          <Field label="Amount" prefix={g.cur === 'INR' ? '₹' : g.cur} value={amt} inputMode="decimal" placeholder="0" onInput={(v) => setAmt(v.replace(/[^\d.]/g, ''))} />
          <div style={{ padding: '12px', background: 'var(--card)' }}>
            <Segmented options={[{ id: 'upi', label: 'UPI' }, { id: 'cash', label: 'Cash' }, { id: 'other', label: 'Other' }]} value={method} onChange={setMethod} label="Payment method" />
          </div>
        </Section>
        {custom.from === custom.to && <p class="field-error" style={{ marginTop: '-12px' }}>Choose two different people.</p>}
        <p class="hint">{custom.to === me ? 'You’re receiving it, so it counts straight away.' : `It counts once ${firstName(toName)} confirms it.`}</p>
        <div class="sheet-pad">
          <Button disabled={!valid} busy={busy} onClick={async () => {
            setBusy(true);
            try {
              await s.proposePayment({ gid, from: custom.from, to: custom.to, amt: minor, method });
              haptic.success();
              setPeer(custom.to);
              setStep(custom.to === me ? 'recorded' : 'sent');
            } finally { setBusy(false); }
          }}>Record Payment</Button>
        </div>
      </SheetBody>
    </>
  );
}
