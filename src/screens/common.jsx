// Pieces shared by several screens: names, expense rows, and the share / import / photo flows.

import jsQR from 'jsqr';
import { store, UserError } from '../store.js';
import { Avatar, IconTile, Money, Row, Pill, SwipeRow } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { actionSheet, confirm, notice, toast, banner } from '../ui/overlays.jsx';
import { present, push, goTo, nav } from '../ui/nav.js';
import { categoryOf, kindOf } from '../core/categories.js';
import { myShare, isInvolved } from '../core/balances.js';
import { formatMoney } from '../core/money.js';
import { groupCsv } from '../core/csv.js';
import { parseUpiUri } from '../core/upi.js';
import { BundleError, bundleFileName } from '../core/sync.js';
import { shareFile, pickFile, haptic } from '../platform/native.js';
import { dateParts, firstName, hlcDate } from '../ui/format.js';

export const meId = () => store.me;

export function nameOf(uid, { first = false, you = 'You' } = {}) {
  if (uid === store.me) return you;
  const u = store.state.users[uid];
  const n = u?.name || u?.phone || 'Someone';
  return first ? firstName(n) : n;
}

export function PersonAvatar({ uid, size = 36 }) {
  return <Avatar uid={uid} name={uid === store.me ? store.profile?.name : store.state.users[uid]?.name || '?'} size={size} me={uid === store.me} />;
}

export function GroupTile({ g, size = 40 }) {
  const k = kindOf(g.kind);
  return <IconTile icon={k.icon} color={k.color} size={size} />;
}

export function CategoryTile({ cat, size = 36 }) {
  const c = categoryOf(cat);
  return <IconTile icon={c.icon} color={c.color} size={size} />;
}

/** "You're owed ₹1,200" / "You owe ₹400" / "Settled up" */
export function balanceText(v, cur) {
  if (v > 0) return { tone: 'pos', text: `You’re owed ${formatMoney(v, cur)}` };
  if (v < 0) return { tone: 'neg', text: `You owe ${formatMoney(-v, cur)}` };
  return { tone: 'zero', text: 'Settled up' };
}

export function ExpenseRow({ x, g, onDelete }) {
  const me = store.me;
  const d = dateParts(x.date);
  const payers = Object.keys(x.paid);
  const who = payers.length > 1 ? `${payers.length} people paid` : `${nameOf(payers[0], { first: true })} paid`;
  const share = myShare(x, me);
  const involved = isInvolved(x, me);
  const cur = g.cur;
  const row = (
    <Row
      class="xrow"
      onClick={() => push('expense', { xid: x.id })}
      icon={<span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span class="xrow-date"><span>{d.mon}</span><span>{d.d}</span></span><CategoryTile cat={x.cat} size={36} /></span>}
      title={x.desc}
      subtitle={`${who} ${formatMoney(x.amt, x.cur)}${x.rid ? ' · repeats' : ''}`}
      accessory={
        !involved ? (
          <span class="xrow-effect is-none"><span>not involved</span></span>
        ) : share === 0 ? (
          <span class="xrow-effect is-none"><span>no balance</span></span>
        ) : (
          <span class="xrow-effect">
            <span>{share > 0 ? 'you lent' : 'you borrowed'}</span>
            <Money v={share > 0 ? share : -share} cur={cur} tone={share > 0 ? 'pos' : 'neg'} />
          </span>
        )
      }
    />
  );
  if (!onDelete) return row;
  return (
    <SwipeRow actions={[{ label: 'Delete', icon: 'trash', color: 'red', onAction: onDelete }]} onFullSwipe={onDelete}>
      {row}
    </SwipeRow>
  );
}

export function PaymentRow({ s, g, onClick }) {
  const me = store.me;
  const d = dateParts(s.date || hlcDate(s.hlc).toISOString().slice(0, 10));
  const title = `${nameOf(s.from, { first: true })} paid ${nameOf(s.to, { first: true, you: 'you' })}`;
  const status = s.status === 'confirmed' ? null : s.status === 'pending' ? <Pill tone="warn">Waiting</Pill> : s.status === 'declined' ? <Pill tone="bad">Not received</Pill> : <Pill>Cancelled</Pill>;
  const mine = s.from === me ? -1 : s.to === me ? 1 : 0;
  return (
    <Row
      onClick={onClick}
      icon={<span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span class="xrow-date"><span>{d.mon}</span><span>{d.d}</span></span><IconTile icon="banknote" color="green" size={36} /></span>}
      title={title}
      subtitle={(s.method === 'upi' ? `UPI${s.app ? ' · ' + s.app : ''}` : s.method === 'cash' ? 'Cash' : 'Payment') + ''}
      accessory={
        <span class="xrow-effect">
          {status || <span>{mine ? (mine > 0 ? 'you received' : 'you paid') : 'payment'}</span>}
          <Money v={s.amt} cur={g.cur} tone={s.status !== 'confirmed' ? 'zero' : mine > 0 ? 'pos' : mine < 0 ? 'neg' : 'zero'} />
        </span>
      }
    />
  );
}

// ---- flows -----------------------------------------------------------------------------------------
export async function shareGroupFlow(gid, preset) {
  const g = store.state.groups[gid];
  if (!g) return;
  const v = preset || (await actionSheet({
    title: `Share “${g.name}”`,
    message: 'Send the group file over WhatsApp, Quick Share or any app. Opening it merges the changes into their copy.',
    actions: [
      { label: 'Send Update to Members', value: 'update', icon: 'sync' },
      { label: 'Invite Someone', value: 'invite', icon: 'person' },
      { label: 'Export Spreadsheet (CSV)', value: 'csv', icon: 'doc' },
    ],
  }));
  if (!v) return;
  try {
    if (v === 'csv') {
      const csv = groupCsv(store.state, gid);
      await shareFile({ name: bundleFileName(g.name, 'expenses').replace(/\.json$/, '.csv'), text: csv, mime: 'text/csv', title: `${g.name} expenses` });
      return;
    }
    if (v === 'invite') {
      const ok = await confirm({
        title: 'Send an invite?',
        message: 'Anyone who opens the invite file can read this group. Send it only to people in the group, and add them as members first.',
        confirm: 'Send Invite',
      });
      if (!ok) return;
    }
    const f = await store.exportGroup(gid, v === 'invite');
    const msg = v === 'invite'
      ? `Join “${g.name}” on Batwara: open this file with the Batwara app.`
      : `Update for “${g.name}” on Batwara: open this file with the Batwara app to merge it.`;
    const sent = await shareFile({ name: f.name, text: f.text, title: v === 'invite' ? `Invite to ${g.name}` : `Update for ${g.name}`, message: msg });
    if (sent) toast(v === 'invite' ? 'Invite ready to send' : 'Update ready to send', { icon: 'share' });
  } catch (e) {
    notice('Couldn’t share', e.message || 'Something went wrong while preparing the file.');
  }
}

export async function importFlow() {
  const f = await pickFile('');
  if (!f) return;
  if (f.size > 25_000_000) return notice('File too large', 'That file is bigger than any Batwara group file. Check you picked the right one.');
  handleImportText(await f.text());
}

export function handleImportText(text) {
  let info;
  try {
    info = store.peekBundle(text);
  } catch (e) {
    notice('Can’t open this file', e instanceof BundleError ? e.message : 'This file isn’t a Batwara group file.');
    return;
  }
  present('importFile', { text, info, detent: 'fit', label: 'Import group file' });
}

export async function runImport(text) {
  try {
    const r = await store.importBundle(text);
    haptic.success();
    return { ok: true, r };
  } catch (e) {
    haptic.error();
    return { ok: false, message: e instanceof UserError || e instanceof BundleError ? e.message : 'Something went wrong while merging this file.' };
  }
}

/** Downscale a photo for storing alongside an expense. */
export async function imageToDataUrl(file, max = 1280, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', quality), canvas: c };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function pickReceipt() {
  const v = await actionSheet({ actions: [{ label: 'Take Photo', value: 'camera', icon: 'camera' }, { label: 'Choose Photo', value: 'library', icon: 'photo' }] });
  if (!v) return null;
  const f = await pickFile('image/*', v === 'camera' ? 'environment' : undefined);
  if (!f) return null;
  const { dataUrl } = await imageToDataUrl(f);
  return store.saveReceipt(dataUrl);
}

/** Read a UPI QR code from a screenshot or photo. */
export async function scanUpiFromImage() {
  const f = await pickFile('image/*');
  if (!f) return null;
  const { canvas } = await imageToDataUrl(f, 1400, 0.9);
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
  if (!code) {
    notice('No QR code found', 'Use a clear screenshot or photo of a UPI QR code, like the one in PhonePe, Google Pay or Paytm under “Receive money”.');
    return null;
  }
  const upi = parseUpiUri(code.data);
  if (!upi) {
    notice('Not a UPI code', 'That QR code isn’t a UPI payment code.');
    return null;
  }
  return upi;
}

export function openGroup(gid) {
  goTo('groups', 'group', { gid });
}

export function openExpense(xid) {
  push('expense', { xid }, nav.tab);
}

export { banner, toast };
