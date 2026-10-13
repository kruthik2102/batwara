import { useState } from 'preact/hooks';
import { useStore, Screen, Section, Row, GlassButton, Money, Empty, Button, Segmented, Switch, SearchField, Pill } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { push, present, pop, useScreen } from '../ui/nav.js';
import { groupExpenses, groupSettlements } from '../core/reduce.js';
import { groupNets, groupTransfers, pairwiseDebts, simplifyDebts, groupTotals, pendingFor } from '../core/balances.js';
import { formatMoney } from '../core/money.js';
import { categoryOf, CATEGORY } from '../core/categories.js';
import { ExpenseRow, PaymentRow, PersonAvatar, nameOf, shareGroupFlow, CategoryTile } from './common.jsx';
import { confirm, toast, notice } from '../ui/overlays.jsx';
import { monthTitle, hlcDate, ago } from '../ui/format.js';
import { haptic } from '../platform/native.js';

const TABS = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'totals', label: 'Totals' },
];

function GroupHeader({ g }) {
  const s = useStore();
  const st = s.state;
  const me = s.me;
  const nets = groupNets(st, g.id);
  const mine = nets[me] || 0;
  const lines = groupTransfers(st, g.id).filter((t) => t.from === me || t.to === me).slice(0, 3);
  return (
    <div class="hero-card">
      <span class="hero-label">Your balance</span>
      {mine === 0 ? (
        <span class="hero-amount is-zero">You’re settled up</span>
      ) : (
        <span class={'hero-amount money tone-' + (mine > 0 ? 'pos' : 'neg')}>
          {mine > 0 ? 'You’re owed ' : 'You owe '}
          {formatMoney(Math.abs(mine), g.cur)}
        </span>
      )}
      {lines.length > 0 && (
        <div class="hero-lines">
          {lines.map((t) =>
            t.to === me ? (
              <span key={t.from}>{nameOf(t.from)} owes you <b class="money tone-pos">{formatMoney(t.amt, g.cur)}</b></span>
            ) : (
              <span key={t.to}>You owe {nameOf(t.to)} <b class="money tone-neg">{formatMoney(t.amt, g.cur)}</b></span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function PendingCallouts({ g }) {
  const s = useStore();
  const me = s.me;
  const list = pendingFor(s.state, g.id).filter((p) => p.to === me || p.from === me);
  if (!list.length) return null;
  return list.map((p) =>
    p.to === me ? (
      <div class="callout tone-warn" key={p.id}>
        <PersonAvatar uid={p.from} size={36} />
        <div class="callout-text">
          <span class="callout-title">{nameOf(p.from, { first: true })} says they paid you {formatMoney(p.amt, g.cur)}</span>
          <span class="callout-msg">{p.method === 'upi' ? `By UPI${p.app ? ' with ' + p.app : ''}${p.ref ? ` · Ref ${p.ref}` : ''}. Check your bank app before confirming.` : 'In cash or another way.'}</span>
          <div class="callout-actions">
            <Button size="small" icon="check" onClick={async () => { await s.confirmPayment(g.id, p.id); haptic.success(); toast('Payment confirmed'); }}>Confirm</Button>
            <Button size="small" variant="gray" destructive onClick={async () => { if (await confirm({ title: 'Mark as not received?', message: `${nameOf(p.from, { first: true })} will see that you didn’t get this payment. Their balance stays as it was.`, confirm: 'Not Received', destructive: true })) await s.declinePayment(g.id, p.id); }}>Not Received</Button>
          </div>
        </div>
      </div>
    ) : (
      <div class="callout" key={p.id}>
        <span class="tile c-orange" style={{ width: '36px', height: '36px', borderRadius: '10px' }}><Icon name="clock" size={20} stroke={2} /></span>
        <div class="callout-text">
          <span class="callout-title">Waiting for {nameOf(p.to, { first: true })} to confirm {formatMoney(p.amt, g.cur)}</span>
          <span class="callout-msg">It counts once they confirm on their phone. Send them an update so they can.</span>
          <div class="callout-actions">
            <Button size="small" variant="tinted" icon="sync" onClick={() => shareGroupFlow(g.id, 'update')}>Send Update</Button>
            {s.isSampleUser(p.to) && <Button size="small" variant="gray" icon="sparkles" onClick={async () => { const r = await s.simulateConfirm(p.id); if (r) toast(`${nameOf(p.to, { first: true })} confirmed (sample)`); }}>Simulate</Button>}
            <Button size="small" variant="plain" destructive onClick={async () => { if (await confirm({ title: 'Cancel this payment?', message: 'It will be removed from the group.', confirm: 'Cancel Payment', destructive: true, cancel: 'Keep' })) await s.cancelPayment(g.id, p.id); }}>Cancel</Button>
          </div>
        </div>
      </div>
    ),
  );
}

function SyncCallout({ g }) {
  const s = useStore();
  const n = s.unsharedCount(g.id);
  const last = s.data.sync[g.id];
  if (!n || g.members.length < 2) return null;
  return (
    <div class="callout">
      <span class="tile c-tint" style={{ width: '36px', height: '36px', borderRadius: '10px' }}><Icon name="sync" size={20} stroke={2} /></span>
      <div class="callout-text">
        <span class="callout-title">{n === 1 ? '1 change' : `${n} changes`} not shared yet</span>
        <span class="callout-msg">{last?.lastShared ? `Last update sent ${ago(last.lastShared.at)}.` : 'Nobody else has these yet.'} Send an update so everyone’s balances match.</span>
        <div class="callout-actions">
          <Button size="small" icon="share" onClick={() => shareGroupFlow(g.id, 'update')}>Send Update</Button>
        </div>
      </div>
    </div>
  );
}

function ExpensesPane({ g }) {
  const s = useStore();
  const st = s.state;
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const items = [
    ...groupExpenses(st, g.id).map((x) => ({ kind: 'x', date: x.date, hlc: x.hlc, x })),
    ...groupSettlements(st, g.id).filter((p) => p.status !== 'cancelled').map((p) => ({ kind: 's', date: p.date || hlcDate(p.hlc).toISOString().slice(0, 10), hlc: p.hlc, p })),
  ]
    .filter((it) => {
      if (!query) return true;
      if (it.kind === 's') return `payment ${nameOf(it.p.from)} ${nameOf(it.p.to)}`.toLowerCase().includes(query);
      const x = it.x;
      return `${x.desc} ${categoryOf(x.cat).label} ${x.notes || ''} ${Object.keys(x.paid).map((u) => nameOf(u)).join(' ')}`.toLowerCase().includes(query);
    })
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.hlc < b.hlc ? 1 : -1));

  const months = [];
  for (const it of items) {
    const m = it.date.slice(0, 7);
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, items: [] });
    months[months.length - 1].items.push(it);
  }

  const del = async (x) => {
    if (await confirm({ title: `Delete “${x.desc}”?`, message: 'It will be removed for everyone once you send an update. You can restore it from Activity.', confirm: 'Delete', destructive: true })) {
      await s.deleteExpense(g.id, x.id);
      toast('Expense deleted', { icon: 'trash' });
    }
  };

  const total = groupExpenses(st, g.id).length;
  return (
    <>
      {total > 4 && <SearchField value={q} onInput={setQ} placeholder="Search expenses" />}
      {!items.length && (
        query ? (
          <Empty icon="search" title="No results" message={`Nothing in ${g.name} matches “${q}”.`} />
        ) : (
          <Empty icon="receipt" title="No expenses yet" message="Add the first one and Batwara works out who owes whom.">
            <Button icon="plus" onClick={() => present('expense', { gid: g.id })}>Add Expense</Button>
          </Empty>
        )
      )}
      {months.map((mo) => (
        <Section key={mo.m} header={monthTitle(mo.m)}>
          {mo.items.map((it) =>
            it.kind === 'x' ? (
              <ExpenseRow key={it.x.id} x={it.x} g={g} onDelete={() => del(it.x)} />
            ) : (
              <PaymentRow key={it.p.id} s={it.p} g={g} />
            ),
          )}
        </Section>
      ))}
    </>
  );
}

function BalancesPane({ g }) {
  const s = useStore();
  const st = s.state;
  const me = s.me;
  const nets = groupNets(st, g.id);
  const simple = simplifyDebts(nets);
  const pairs = pairwiseDebts(st, g.id);
  const list = g.simplify ? simple : pairs;
  return (
    <>
      <Section footer={g.simplify ? `Batwara combines debts so the group needs ${simple.length === 1 ? 'one payment' : simple.length + ' payments'} instead of ${pairs.length}. Nobody pays more than they owe.` : 'Everyone pays back the people they owe directly.'}>
        <Row icon={<span class="tile c-green" style={{ width: '30px', height: '30px', borderRadius: '8px' }}><Icon name="arrowsLR" size={18} stroke={2} /></span>} title="Simplify debts"
          accessory={<Switch checked={g.simplify} label="Simplify debts" onChange={(v) => s.updateGroup(g.id, { simplify: v })} />} />
      </Section>
      <Section header="Who pays whom">
        {!list.length && <Row title="Everyone is settled up" subtitle="Nothing to pay back right now." icon={<span class="tile c-green" style={{ width: '30px', height: '30px', borderRadius: '8px' }}><Icon name="check" size={18} stroke={2.4} /></span>} />}
        {list.map((t) => (
          <Row
            key={t.from + t.to}
            class="row-list"
            icon={<PersonAvatar uid={t.from} size={34} />}
            title={<span>{nameOf(t.from, { first: true })} <span class="muted">{t.from === me ? 'pay' : 'pays'}</span> {nameOf(t.to, { first: true, you: 'you' })}</span>}
            subtitle={<span class={'money tone-' + (t.to === me ? 'pos' : t.from === me ? 'neg' : 'zero')}>{formatMoney(t.amt, g.cur)}</span>}
            accessory={
              t.from === me ? (
                <Button size="small" onClick={() => present('settle', { gid: g.id, to: t.to, amount: t.amt })}>Pay</Button>
              ) : t.to === me ? (
                <Button size="small" variant="gray" onClick={() => present('settle', { gid: g.id, from: t.from, amount: t.amt })}>Record</Button>
              ) : null
            }
          />
        ))}
      </Section>
      <Section header="Everyone’s balance">
        {g.everMembers.filter((u) => g.members.includes(u) || nets[u]).map((u) => {
          const v = nets[u] || 0;
          return (
            <Row key={u} class="row-list" icon={<PersonAvatar uid={u} size={34} />} title={nameOf(u)}
              detail={<span class={'money tone-' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero')}>{v > 0 ? `gets back ${formatMoney(v, g.cur)}` : v < 0 ? `owes ${formatMoney(-v, g.cur)}` : 'settled'}</span>} />
          );
        })}
      </Section>
    </>
  );
}

function TotalsPane({ g }) {
  const s = useStore();
  const t = groupTotals(s.state, g.id, s.me);
  if (!t.total) return <Empty icon="chart" title="Nothing spent yet" message="Totals by category and month appear once there are expenses." />;
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const top = cats[0][1];
  const months = Object.entries(t.byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-6);
  const maxM = Math.max(...months.map((m) => m[1]));
  const lastM = months[months.length - 1]?.[0];
  return (
    <>
      <div class="stat-grid">
        <div class="stat"><span>Group spent</span><span class="money">{formatMoney(t.total, g.cur)}</span></div>
        <div class="stat"><span>Your share</span><span class="money">{formatMoney(t.myCost, g.cur)}</span></div>
        <div class="stat"><span>You paid</span><span class="money">{formatMoney(t.myPaid, g.cur)}</span></div>
      </div>
      <Section header="By category">
        <div class="bars">
          {cats.map(([id, v]) => {
            const c = categoryOf(id);
            return (
              <div class="bar-row" key={id}>
                <CategoryTile cat={id} size={26} />
                <div class="bar-label">
                  <span class="bar-top"><span>{c.label}</span><span class="bar-value">{formatMoney(v, g.cur)}</span></span>
                  <span class="bar-track"><span class={'bar-fill c-' + c.color} style={{ width: `${Math.max(2, (v / top) * 100)}%` }} /></span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      {months.length > 1 && (
        <Section header="By month">
          <div class="cols" role="img" aria-label={`Spending for the last ${months.length} months`}>
            {months.map(([m, v]) => (
              <div class={'col' + (m === lastM ? ' is-current' : '')} key={m}>
                <span class="col-value">{formatMoney(Math.round(v / 100) * 100, g.cur)}</span>
                <span class="col-bar" style={{ height: `${Math.max(3, (v / maxM) * 100)}%` }} />
                <span class="col-label">{monthTitle(m).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

export function GroupScreen({ gid }) {
  const s = useStore();
  const scr = useScreen();
  const g = s.state.groups[gid];
  const [tab, setTab] = useState('expenses');
  if (!g) {
    return (
      <Screen title="Group" large={false}>
        <Empty icon="people" title="This group is gone" message="It was removed from this phone." />
      </Screen>
    );
  }
  const solo = g.members.length < 2;
  return (
    <Screen
      title={g.name}
      class="has-fab"
      right={
        <>
          <GlassButton icon="share" label="Share group" onClick={() => shareGroupFlow(gid)} />
          <GlassButton icon="sliders" label="Group settings" onClick={() => push('groupSettings', { gid }, scr.tab)} />
        </>
      }
      bottom={scr.isTop && (
        <button type="button" class="fab" data-press onClick={() => present('expense', { gid })}>
          <Icon name="plus" size={20} stroke={2.4} />
          Add Expense
        </button>
      )}
    >
      <GroupHeader g={g} />
      <div class="action-row">
        <Button size="medium" icon="banknote" onClick={() => present('settle', { gid })} disabled={solo}>Settle Up</Button>
        <Button size="medium" variant="gray" icon="person" onClick={() => present('addMember', { gid, detent: 'fit' })}>Add People</Button>
      </div>
      {solo && (
        <div class="callout">
          <span class="tile c-blue" style={{ width: '36px', height: '36px', borderRadius: '10px' }}><Icon name="people" size={20} stroke={2} /></span>
          <div class="callout-text">
            <span class="callout-title">Add the people you’re splitting with</span>
            <span class="callout-msg">Add them by phone number, then send them the invite file.</span>
          </div>
        </div>
      )}
      <PendingCallouts g={g} />
      <SyncCallout g={g} />
      <div class="group-tabs"><Segmented options={TABS} value={tab} onChange={setTab} label="Group sections" /></div>
      {tab === 'expenses' && <ExpensesPane g={g} />}
      {tab === 'balances' && <BalancesPane g={g} />}
      {tab === 'totals' && <TotalsPane g={g} />}
    </Screen>
  );
}
