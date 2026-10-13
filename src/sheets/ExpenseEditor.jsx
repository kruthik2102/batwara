import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, SheetHeader, SheetBody, Section, Row, Field, Segmented, Stepper, Check, Button } from '../ui/kit.jsx';
import { Icon, PlusBadge } from '../ui/icons.jsx';
import { useSheet } from '../ui/nav.js';
import { SPLIT_TYPES, buildExpense, computeOwed, draftFromExpense, itemsTotal, parseWeight } from '../core/split.js';
import { CURRENCIES, formatMoney, parseAmount, toInput, currencySymbol } from '../core/money.js';
import { CATEGORIES, categoryOf, guessCategory } from '../core/categories.js';
import { rateBetween } from '../core/fx.js';
import { todayISO, FREQ_LABEL } from '../core/recurring.js';
import { newId } from '../core/crypto.js';
import { PersonAvatar, nameOf, CategoryTile, pickReceipt } from '../screens/common.jsx';
import { menu, confirm, toast, notice } from '../ui/overlays.jsx';
import { haptic } from '../platform/native.js';

let itemSeq = 0;
const newItem = (who) => ({ key: 'i' + ++itemSeq, name: '', price: '', who: [...who] });

export function ExpenseEditorSheet({ gid, xid }) {
  const s = useStore();
  const sh = useSheet();
  const g = s.state.groups[gid];
  const x = xid ? s.state.expenses[xid] : null;
  const me = s.me;
  const members = useMemo(() => (x ? [...new Set([...g.members, ...Object.keys(x.paid), ...Object.keys(x.owed)])] : g.members.slice()), []);

  const initial = useMemo(() => {
    if (x) {
      const d = draftFromExpense(x, members);
      if (!d.items.length) d.items = [newItem(members)];
      return { ...d, repeat: 'never', catTouched: true };
    }
    return {
      id: null, desc: '', cat: 'general', catTouched: false, date: todayISO(), cur: g.cur, fx: '', amount: '',
      pay: { mode: 'single', payer: members.includes(me) ? me : members[0], values: {} },
      type: 'equal', include: Object.fromEntries(members.map((u) => [u, true])), values: {},
      items: [newItem(members)], extra: '', notes: '', rc: null, rid: null, repeat: 'never',
    };
  }, []);

  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const baseline = useRef(JSON.stringify(initial));
  const descRef = useRef(null);

  useEffect(() => { sh.setDirty(JSON.stringify(d) !== baseline.current); }, [d]);
  useEffect(() => { if (d.rc) s.attachment(d.rc).then(setReceipt); else setReceipt(null); }, [d.rc]);
  useEffect(() => { if (!x) setTimeout(() => descRef.current?.focus({ preventScroll: true }), 450); }, []);

  const up = (patch) => setD((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  const fmt = (m) => formatMoney(m, d.cur);
  const amt = d.type === 'items' ? itemsTotal(d) : parseAmount(d.amount) || 0;
  const payer = d.pay.mode === 'multi' ? null : d.pay.payer;
  const preview = amt > 0 ? computeOwed(amt, d, members, payer, fmt) : null;
  const res = buildExpense({ ...d, id: x?.id || 'draft' }, members, g.cur);
  const foreign = d.cur !== g.cur;

  const setCur = (cur) => up({ cur, fx: cur === g.cur ? '' : String(rateBetween(s.fxTable(), cur, g.cur) ?? '') });

  const pickCategory = async (e) => {
    const v = await menu(e.currentTarget, CATEGORIES.map((c) => ({ label: c.label, value: c.id, icon: c.icon, checked: c.id === d.cat })), { title: 'Category' });
    if (v) up({ cat: v, catTouched: true });
  };

  const pickCurrency = async (e) => {
    const v = await menu(e.currentTarget, Object.values(CURRENCIES).map((c) => ({ label: c.code, detail: c.name, value: c.code, checked: c.code === d.cur })), { title: 'Currency' });
    if (v) setCur(v);
  };

  const pickPayer = async (e) => {
    const items = members.map((u) => ({ label: nameOf(u), value: u, checked: d.pay.mode === 'single' && d.pay.payer === u }));
    items.push({ label: 'Several people', value: '__multi', icon: 'people', checked: d.pay.mode === 'multi', divider: true });
    const v = await menu(e.currentTarget, items, { title: 'Paid by' });
    if (!v) return;
    if (v === '__multi') up((p) => ({ pay: { ...p.pay, mode: 'multi', values: p.pay.mode === 'multi' ? p.pay.values : { [p.pay.payer]: p.type === 'items' ? toInput(itemsTotal(p)) : p.amount } } }));
    else up((p) => ({ pay: { ...p.pay, mode: 'single', payer: v } }));
  };

  const setType = (type) =>
    up((p) => {
      const values = {};
      if (type === 'shares') for (const u of members) values[u] = p.include[u] ? '1' : '0';
      if (type === 'percent') {
        const on = members.filter((u) => p.include[u]);
        const each = on.length ? Math.floor(10000 / on.length) : 0;
        on.forEach((u, i) => { values[u] = String((i === 0 ? 10000 - each * (on.length - 1) : each) / 100); });
      }
      if (type === 'exact' && amt > 0 && preview?.ok) for (const u of members) values[u] = preview.owed[u] ? toInput(preview.owed[u]) : '';
      if (type === 'items' && p.amount && !p.items.some((it) => it.price)) return { type, values, items: [{ ...p.items[0], price: p.amount }] };
      return { type, values };
    });

  const toggle = (u) => up((p) => ({ include: { ...p.include, [u]: !p.include[u] } }));
  const setValue = (u, v) => up((p) => ({ values: { ...p.values, [u]: v } }));
  const setItem = (key, patch) => up((p) => ({ items: p.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));

  const save = async () => {
    setTried(true);
    const r = buildExpense({ ...d, id: x?.id || newId('x') }, members, g.cur);
    if (!r.ok) {
      haptic.error();
      if (r.field === 'desc') descRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (x) await s.editExpense(gid, r.expense);
      else await s.addExpense(gid, r.expense, d.repeat);
      haptic.success();
      sh.close({ force: true });
      toast(x ? 'Changes saved' : d.repeat !== 'never' ? `Added · repeats ${FREQ_LABEL[d.repeat].toLowerCase()}` : 'Expense added');
    } catch (e) {
      setBusy(false);
      notice('Couldn’t save', e.message);
    }
  };

  const err = !res.ok ? res : null;
  const showErr = (fields) => err && fields.includes(err.field) && (tried || (amt > 0 && err.field !== 'desc'));
  const multiSum = d.pay.mode === 'multi' ? members.reduce((a, u) => a + (parseAmount(d.pay.values[u] ?? '') || 0), 0) : 0;

  return (
    <>
      <SheetHeader title={x ? 'Edit Expense' : 'Add Expense'} subtitle={g.name} onCancel={() => sh.close()} cancelLabel="Cancel" onDone={save} doneLabel="Save" busy={busy} />
      <SheetBody>
        <Section>
          <div class="desc-row">
            <button type="button" class="cat-btn" data-press aria-label={`Category: ${categoryOf(d.cat).label}`} onClick={pickCategory}>
              <CategoryTile cat={d.cat} size={40} />
            </button>
            <input ref={descRef} class="desc-input" value={d.desc} maxLength={80} placeholder="What was it for?" aria-label="Description" enterKeyHint="next"
              onInput={(e) => {
                const desc = e.currentTarget.value;
                up((p) => ({ desc, cat: p.catTouched ? p.cat : guessCategory(desc) || 'general' }));
              }} />
          </div>
          <div class="amount-input-row">
            <button type="button" class="cur-btn" data-press onClick={pickCurrency} aria-label={`Currency: ${d.cur}`}>
              {d.cur} <Icon name="chevronUpDown" size={14} stroke={2.2} />
            </button>
            {d.type === 'items' ? (
              <input class="amount-input" value={amt ? toInput(amt) : ''} placeholder="0" readOnly aria-label="Total from items" />
            ) : (
              <input class="amount-input" value={d.amount} inputMode="decimal" placeholder="0.00" aria-label="Amount"
                onInput={(e) => up({ amount: e.currentTarget.value.replace(/[^\d.,]/g, '') })} />
            )}
          </div>
          {foreign && (
            <Field label={`1 ${d.cur} =`} prefix={currencySymbol(g.cur)} value={d.fx} inputMode="decimal" onInput={(v) => up({ fx: v.replace(/[^\d.]/g, '') })}
              suffix={<span class="t-foot muted">{amt > 0 && res.ok ? `≈ ${formatMoney(res.expense.base, g.cur)}` : ''}</span>} />
          )}
        </Section>
        {showErr(['desc', 'amount', 'fx']) && <p class="field-error" style={{ marginTop: '-14px', marginBottom: '12px' }}>{err.error}</p>}
        {foreign && (
          <p class="hint">
            {s.data.fx ? `Rates updated ${new Date(s.data.fx.at).toLocaleDateString('en-IN')}.` : 'Approximate rate built into the app.'}{' '}
            <button type="button" class="btn-plain" style={{ color: 'var(--tint)', fontWeight: 600 }} onClick={async () => {
              try { await s.updateRates(); setCur(d.cur); toast('Rates updated'); } catch (e2) { notice('Rates not updated', e2.message); }
            }}>Update rates</button>
          </p>
        )}

        <Section header="Paid by">
          <Row icon={d.pay.mode === 'single' ? <PersonAvatar uid={d.pay.payer} size={32} /> : <span class="tile c-gray" style={{ width: '32px', height: '32px', borderRadius: '50%' }}><Icon name="people" size={18} stroke={2} /></span>}
            title={d.pay.mode === 'single' ? nameOf(d.pay.payer) : 'Several people'} chevron onClick={pickPayer} />
          {d.pay.mode === 'multi' && members.map((u) => (
            <Row key={u} class="row-list" icon={<PersonAvatar uid={u} size={32} />} title={nameOf(u)}
              accessory={<input class="prow-input" inputMode="decimal" placeholder="0" value={d.pay.values[u] ?? ''} aria-label={`${nameOf(u)} paid`}
                onInput={(e) => { const v = e.currentTarget.value; up((p) => ({ pay: { ...p.pay, values: { ...p.pay.values, [u]: v } } })); }} />} />
          ))}
        </Section>
        {d.pay.mode === 'multi' && (
          <div class={'split-status ' + (multiSum === amt && amt ? 'is-ok' : 'is-bad')} style={{ marginTop: '-16px', marginBottom: '16px', padding: '0 32px' }}>
            <span>{multiSum === amt && amt ? 'Payments match the total' : showErr(['payer']) ? err.error : `Paid so far ${fmt(multiSum)}`}</span>
            <span class="money">{fmt(amt)}</span>
          </div>
        )}

        <Section header="Split">
          <div style={{ padding: '12px 12px 10px', background: 'var(--card)' }}>
            <Segmented options={SPLIT_TYPES} value={d.type} onChange={setType} label="How to split" />
          </div>
          {d.type !== 'items' && members.map((u) => {
            const on = !!d.include[u];
            const share = preview?.ok ? preview.owed[u] || 0 : null;
            const value = d.values[u] ?? '';
            return (
              <Row key={u} class="row-list" icon={<span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Check on={on} onClick={() => toggle(u)} label={`Include ${nameOf(u)}`} /><PersonAvatar uid={u} size={32} /></span>}
                title={nameOf(u)} subtitle={d.type !== 'equal' && d.type !== 'exact' && on && share !== null ? fmt(share) : undefined}
                accessory={
                  d.type === 'equal' ? <span class="prow-share">{on && share !== null ? fmt(share) : '—'}</span>
                  : d.type === 'shares' ? <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span class="prow-share" style={{ minWidth: '22px' }}>{on ? (parseWeight(value || '0') / 100) : 0}</span><Stepper value={on ? value || '0' : '0'} label={`Shares for ${nameOf(u)}`} onChange={(v) => { if (!on) toggle(u); setValue(u, v); }} /></span>
                  : <input class="prow-input" inputMode="decimal" disabled={!on} value={on ? value : ''} placeholder={d.type === 'percent' ? '0 %' : d.type === 'adjust' ? '± 0' : '0'}
                      aria-label={`${d.type === 'percent' ? 'Percent' : d.type === 'adjust' ? 'Adjustment' : 'Amount'} for ${nameOf(u)}`}
                      onInput={(e) => setValue(u, e.currentTarget.value.replace(d.type === 'adjust' ? /[^\d.\-]/g : /[^\d.]/g, ''))} />
                }
              />
            );
          })}
          {d.type === 'items' && (
            <>
              {d.items.map((it, i) => (
                <div class="item-card" key={it.key}>
                  <div class="item-head">
                    <input class="item-name" value={it.name} placeholder={`Item ${i + 1}`} aria-label={`Item ${i + 1} name`} onInput={(e) => setItem(it.key, { name: e.currentTarget.value })} />
                    <input class="item-price" value={it.price} inputMode="decimal" placeholder="0.00" aria-label={`Item ${i + 1} price`} onInput={(e) => setItem(it.key, { price: e.currentTarget.value.replace(/[^\d.]/g, '') })} />
                    {d.items.length > 1 && (
                      <button type="button" class="icon-btn" data-press aria-label={`Remove item ${i + 1}`} onClick={() => up((p) => ({ items: p.items.filter((y) => y.key !== it.key) }))}>
                        <Icon name="xmark" size={16} stroke={2.4} />
                      </button>
                    )}
                  </div>
                  <div class="item-who" data-hscroll>
                    {members.map((u) => {
                      const on = it.who.includes(u);
                      return (
                        <button type="button" class={'chip' + (on ? ' is-on' : '')} aria-pressed={on ? 'true' : 'false'} onClick={() => { haptic.selection(); setItem(it.key, { who: on ? it.who.filter((w) => w !== u) : [...it.who, u] }); }}>
                          <PersonAvatar uid={u} size={24} />
                          {nameOf(u, { first: true })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Row icon={<PlusBadge size={24} />} title="Add Item" tint onClick={() => up((p) => ({ items: [...p.items, newItem(members)] }))} />
              <Field label="Tax & tip" value={d.extra} inputMode="decimal" placeholder="0" onInput={(v) => up({ extra: v.replace(/[^\d.]/g, '') })} />
            </>
          )}
        </Section>
        <div class={'split-status ' + (preview?.ok ? 'is-ok' : 'is-bad')} style={{ marginTop: '-16px', marginBottom: '18px', padding: '0 32px' }}>
          {amt > 0 && preview && (preview.ok ? <span>✓ Adds up to {fmt(amt)}</span> : <span>{preview.error}</span>)}
          {!(amt > 0) && <span class="muted">Enter an amount to see each share.</span>}
        </div>

        <Section>
          <Field label="Date" type="date" value={d.date} onInput={(v) => v && up({ date: v })} />
          {!x && (
            <Row title="Repeat" detail={d.repeat === 'never' ? 'Never' : FREQ_LABEL[d.repeat]} chevron onClick={async (e) => {
              const v = await menu(e.currentTarget, [
                { label: 'Never', value: 'never', checked: d.repeat === 'never' },
                { label: 'Every week', value: 'weekly', checked: d.repeat === 'weekly' },
                { label: 'Every month', value: 'monthly', checked: d.repeat === 'monthly' },
              ], { title: 'Repeat' });
              if (v) up({ repeat: v });
            }} />
          )}
          <Field label="Notes" value={d.notes} multiline placeholder="Optional" onInput={(v) => up({ notes: v })} maxLength={1000} />
          {receipt ? (
            <div class="item-card">
              <img class="receipt-thumb" src={receipt} alt="Receipt photo" style={{ maxHeight: '180px' }} />
              <Button variant="plain" size="small" destructive onClick={() => up({ rc: null })}>Remove Photo</Button>
            </div>
          ) : (
            <Row icon={<Icon name="camera" size={22} />} title="Add Receipt Photo" tint onClick={async () => { const id = await pickReceipt(); if (id) up({ rc: id }); }} />
          )}
        </Section>
        {d.repeat !== 'never' && !x && <p class="hint">Batwara adds a copy {d.repeat === 'weekly' ? 'every week' : 'every month'} from {d.date}. You can stop it from the expense or the group’s settings.</p>}

        {x && (
          <Section>
            <Row title="Delete Expense" destructive onClick={async () => {
              if (await confirm({ title: `Delete “${x.desc}”?`, message: 'It stops counting towards balances.', confirm: 'Delete', destructive: true })) {
                await s.deleteExpense(gid, x.id);
                sh.close({ force: true });
                toast('Expense deleted', { icon: 'trash' });
              }
            }} />
          </Section>
        )}
      </SheetBody>
    </>
  );
}
