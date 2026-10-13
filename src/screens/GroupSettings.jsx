import { useState } from 'preact/hooks';
import { useStore, Screen, Section, Row, Field, Switch, Empty, Money } from '../ui/kit.jsx';
import { Icon, PlusBadge } from '../ui/icons.jsx';
import { present, pop, useScreen, popToRoot } from '../ui/nav.js';
import { GROUP_KINDS, kindOf } from '../core/categories.js';
import { CURRENCIES, formatMoney } from '../core/money.js';
import { groupNets } from '../core/balances.js';
import { nextOccurrence, todayISO, FREQ_LABEL } from '../core/recurring.js';
import { formatPhone } from '../core/phone.js';
import { isVpa, normalizeVpa } from '../core/upi.js';
import { PersonAvatar, nameOf, shareGroupFlow } from './common.jsx';
import { menu, actionSheet, confirm, toast, notice } from '../ui/overlays.jsx';
import { ago, shortDate } from '../ui/format.js';
import { IconTile } from '../ui/kit.jsx';

export function GroupSettingsScreen({ gid }) {
  const s = useStore();
  const scr = useScreen();
  const st = s.state;
  const g = st.groups[gid];
  const [name, setName] = useState(g?.name || '');
  if (!g) return <Screen title="Settings" large={false}><Empty icon="people" title="This group is gone" /></Screen>;
  const me = s.me;
  const nets = groupNets(st, gid);
  const hasExpenses = Object.values(st.expenses).some((x) => x.gid === gid);
  const rules = Object.values(st.recurring).filter((r) => r.gid === gid);
  const sync = s.data.sync[gid] || {};
  const k = kindOf(g.kind);

  const saveName = () => {
    const n = name.trim();
    if (n && n !== g.name) s.updateGroup(gid, { name: n.slice(0, 60) });
    else setName(g.name);
  };

  const memberActions = async (uid) => {
    if (uid === me) return;
    const u = st.users[uid];
    const v = await actionSheet({
      title: nameOf(uid),
      message: [formatPhone(u?.phone), u?.vpa ? `UPI ${u.vpa}` : null].filter(Boolean).join(' · '),
      actions: [
        { label: u?.vpa ? 'Change UPI ID' : 'Add UPI ID', value: 'vpa', icon: 'at' },
        { label: 'Remove from Group', value: 'remove', destructive: true, icon: 'trash' },
      ],
    });
    if (v === 'vpa') present('upiFor', { gid, uid, detent: 'fit' });
    if (v === 'remove') {
      if (nets[uid]) return notice('Settle up first', `${nameOf(uid, { first: true })} still ${nets[uid] > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(nets[uid]), g.cur)}. Remove them once their balance is zero.`);
      if (await confirm({ title: `Remove ${nameOf(uid, { first: true })}?`, message: 'Their past expenses stay in the group.', confirm: 'Remove', destructive: true })) s.removeMember(gid, uid);
    }
  };

  return (
    <Screen title="Group Settings" large={false}>
      <div class="amount-hero">
        <IconTile icon={k.icon} color={k.color} size={64} />
        <div class="t-title2">{g.name}</div>
        <div class="t-foot muted">Created {shortDate(new Date(Number(g.hlc.slice(0, 15))).toISOString().slice(0, 10))} by {nameOf(g.by)}</div>
      </div>

      <Section header="Group">
        <Field label="Name" value={name} onInput={setName} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} maxLength={60} enterKeyHint="done" />
        <Row title="Type" detail={k.label} chevron onClick={async (e) => {
          const v = await menu(e.currentTarget, GROUP_KINDS.map((x) => ({ label: x.label, value: x.id, icon: x.icon, checked: x.id === g.kind })));
          if (v && v !== g.kind) s.updateGroup(gid, { kind: v });
        }} />
        <Row title="Currency" detail={g.cur} chevron={!hasExpenses} onClick={hasExpenses ? () => notice('Currency is set', 'The group already has expenses in this currency. Add expenses in other currencies from the expense screen; Batwara converts them.') : async (e) => {
          const v = await menu(e.currentTarget, Object.values(CURRENCIES).map((c) => ({ label: `${c.code} · ${c.name}`, value: c.code, checked: c.code === g.cur })));
          if (v && v !== g.cur) s.updateGroup(gid, { cur: v });
        }} />
      </Section>

      <Section footer="Combines debts across the group so fewer payments are needed. Nobody ends up paying more than they owe.">
        <Row title="Simplify debts" accessory={<Switch checked={g.simplify} label="Simplify debts" onChange={(v) => s.updateGroup(gid, { simplify: v })} />} />
      </Section>

      <Section header={`${g.members.length} ${g.members.length === 1 ? 'member' : 'members'}`}>
        {g.members.map((u) => {
          const v = nets[u] || 0;
          const user = st.users[u];
          return (
            <Row key={u} class="row-list" icon={<PersonAvatar uid={u} size={36} />} title={nameOf(u)}
              subtitle={[formatPhone(user?.phone || (u === me ? s.profile.phone : '')), user?.vpa ? 'UPI ✓' : null].filter(Boolean).join(' · ')}
              detail={v ? <Money v={v} cur={g.cur} tone="auto" /> : undefined}
              onClick={u === me ? undefined : () => memberActions(u)} />
          );
        })}
        <Row icon={<PlusBadge size={26} />} title="Add People" tint onClick={() => present('addMember', { gid, detent: 'fit' })} />
      </Section>

      {rules.length > 0 && (
        <Section header="Repeating expenses" footer="New copies are added on the due date, even if you haven’t opened the app.">
          {rules.map((r) => (
            <Row key={r.id} icon={<IconTile icon="repeat" color={r.active ? 'tint' : 'gray'} size={30} />}
              title={r.template.desc}
              subtitle={r.active ? `${FREQ_LABEL[r.freq]} · next ${shortDate(nextOccurrence(r, todayISO()))}` : 'Stopped'}
              detail={formatMoney(r.template.amt, r.template.cur)}
              onClick={r.active ? async () => {
                const v = await actionSheet({ title: r.template.desc, actions: [{ label: 'Stop Repeating', value: 'stop', destructive: true }] });
                if (v === 'stop') { await s.stopRecurring(gid, r.id); toast('Stopped repeating'); }
              } : undefined} />
          ))}
        </Section>
      )}

      <Section header="Sharing" footer={[
        sync.lastShared ? `You last sent ${sync.lastShared.invite ? 'an invite' : 'an update'} ${ago(sync.lastShared.at)}.` : 'You haven’t shared this group yet.',
        sync.lastImport ? `Last received from ${sync.lastImport.from || 'someone'} ${ago(sync.lastImport.at)}.` : '',
      ].filter(Boolean).join(' ')}>
        <Row icon={<IconTile icon="sync" color="tint" size={30} />} title="Send Update to Members" chevron onClick={() => shareGroupFlow(gid, 'update')} />
        <Row icon={<IconTile icon="person" color="green" size={30} />} title="Invite Someone" chevron onClick={() => shareGroupFlow(gid, 'invite')} />
        <Row icon={<IconTile icon="doc" color="gray" size={30} />} title="Export Spreadsheet (CSV)" chevron onClick={() => shareGroupFlow(gid, 'csv')} />
      </Section>

      {s.isSampleGroup(gid) && (
        <Section header="Sample group" footer="Pretends that a sample friend added an expense on their phone and sent you an update. It goes through the same checks as a real file.">
          <Row icon={<IconTile icon="sparkles" color="purple" size={30} />} title="Simulate an Update from a Friend" onClick={async () => {
            const r = await s.simulateFriendUpdate(gid);
            if (r) toast(`Merged ${r.added} change${r.added === 1 ? '' : 's'} from ${r.from}`, { icon: 'tray' });
          }} />
        </Section>
      )}

      <Section footer="Removes the group and its history from this phone only. Other members keep their copies.">
        <Row title="Remove Group from This Phone" destructive onClick={async () => {
          const owes = Object.values(nets).some((v) => v);
          const ok = await confirm({ title: `Remove “${g.name}”?`, message: owes ? 'Balances aren’t settled yet. You can get the group back later if a member sends you an invite.' : 'You can get it back later if a member sends you an invite.', confirm: 'Remove', destructive: true });
          if (!ok) return;
          popToRoot(scr.tab);
          setTimeout(() => s.forgetGroup(gid), 50);
          toast('Group removed', { icon: 'trash' });
        }} />
      </Section>
    </Screen>
  );
}

/** Small sheet to save someone else's UPI ID (so you can pay them). */
export function UpiForSheet({ gid, uid }) {
  const s = useStore();
  const u = s.state.users[uid];
  const [v, setV] = useState(u?.vpa || '');
  const [err, setErr] = useState('');
  return (
    <UpiEditor
      title={`${nameOf(uid, { first: true })}’s UPI ID`}
      value={v}
      onInput={(x) => { setV(x); setErr(''); }}
      error={err}
      footer={`Saved for everyone in this group. ${nameOf(uid, { first: true })} can replace it with their own from their phone.`}
      onSave={async (close) => {
        const n = normalizeVpa(v);
        if (!isVpa(n)) return setErr('That doesn’t look like a UPI ID. It should look like name@bank.');
        await s.setVpaFor(gid, uid, n);
        toast('UPI ID saved');
        close();
      }}
    />
  );
}

import { SheetHeader, SheetBody, Button } from '../ui/kit.jsx';
import { useSheet } from '../ui/nav.js';
import { scanUpiFromImage } from './common.jsx';

export function UpiEditor({ title, value, onInput, error, footer, onSave }) {
  const sh = useSheet();
  return (
    <>
      <SheetHeader title={title} onCancel={() => sh.close()} onDone={() => onSave(() => sh.close({ force: true }))} doneDisabled={!value.trim()} />
      <SheetBody>
        <Section footer={footer}>
          <Field value={value} onInput={onInput} placeholder="name@bank" autoFocus autocomplete="off" inputMode="email" enterKeyHint="done" />
        </Section>
        {error && <p class="field-error" style={{ marginTop: '-10px', marginBottom: '14px' }}>{error}</p>}
        <div class="sheet-pad">
          <Button variant="gray" icon="qr" onClick={async () => { const r = await scanUpiFromImage(); if (r) onInput(r.vpa); }}>Read from a QR Code Image</Button>
        </div>
      </SheetBody>
    </>
  );
}
