import { useEffect, useState } from 'preact/hooks';
import { useStore, Screen, Section, Row, GlassButton, Money, Empty, Button, Pill } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { present, pop, useScreen } from '../ui/nav.js';
import { categoryOf } from '../core/categories.js';
import { SPLIT_NAMES } from '../core/split.js';
import { formatMoney } from '../core/money.js';
import { FREQ_LABEL } from '../core/recurring.js';
import { PersonAvatar, nameOf, CategoryTile } from './common.jsx';
import { confirm, toast, actionSheet } from '../ui/overlays.jsx';
import { longDate, hlcDate, dayTitle, timeOf, ago } from '../ui/format.js';
import { haptic } from '../platform/native.js';

function Receipt({ id }) {
  const s = useStore();
  const [src, setSrc] = useState(null);
  const [full, setFull] = useState(false);
  useEffect(() => { s.attachment(id).then(setSrc); }, [id]);
  if (!src) return null;
  return (
    <>
      <Section header="Receipt">
        <div style={{ padding: '10px', background: 'var(--card)' }}>
          <button type="button" style={{ display: 'block', width: '100%' }} onClick={() => setFull(true)} aria-label="View receipt full screen">
            <img class="receipt-thumb" src={src} alt="Receipt photo" />
          </button>
        </div>
      </Section>
      {full && (
        <div class="receipt-full" onClick={() => setFull(false)}>
          <img src={src} alt="Receipt photo" />
          <GlassButton icon="xmark" label="Close" onClick={() => setFull(false)} />
        </div>
      )}
    </>
  );
}

function Comments({ x }) {
  const s = useStore();
  const [text, setText] = useState('');
  const list = s.state.comments[x.id] || [];
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await s.addComment(x.gid, x.id, t);
    haptic.light();
  };
  return (
    <Section header="Comments">
      {list.map((c) => (
        <div class="comment" key={c.id}>
          <PersonAvatar uid={c.by} size={34} />
          <div class="comment-body">
            <span class="comment-meta">{nameOf(c.by)} · {ago(hlcDate(c.hlc).getTime())}</span>
            <span class="comment-text">{c.text}</span>
          </div>
        </div>
      ))}
      <div class="compose">
        <textarea rows={1} value={text} maxLength={500} placeholder={list.length ? 'Reply' : 'Add a comment'} aria-label="Comment"
          onInput={(e) => { setText(e.currentTarget.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }} />
        <GlassButton icon="arrowRight" label="Post comment" tint disabled={!text.trim()} onClick={send} />
      </div>
    </Section>
  );
}

export function ExpenseScreen({ xid }) {
  const s = useStore();
  const scr = useScreen();
  const st = s.state;
  const x = st.expenses[xid];
  if (!x) return <Screen title="Expense" large={false}><Empty icon="receipt" title="Expense not found" message="It may have been removed from this phone." /></Screen>;
  const g = st.groups[x.gid];
  const c = categoryOf(x.cat);
  const foreign = x.cur !== g.cur;
  const rule = x.rid ? st.recurring[x.rid] : null;
  const owed = Object.entries(x.owed).sort((a, b) => b[1] - a[1]);
  const paid = Object.entries(x.paid);
  const me = s.me;
  const mine = (x.paid[me] || 0) - (x.owed[me] || 0);

  return (
    <Screen title={x.desc} large={false} right={!x.deleted && <GlassButton text="Edit" label="Edit expense" onClick={() => present('expense', { gid: x.gid, xid: x.id })} />}>
      <div class="amount-hero">
        <CategoryTile cat={x.cat} size={60} />
        <div class="t-title2">{x.desc}</div>
        <div class="amount-hero-value">{formatMoney(x.amt, x.cur)}</div>
        {foreign && <div class="t-sub muted">{formatMoney(x.base, g.cur)} at {formatMoney(Math.round(x.fx * 100), g.cur)} per {x.cur}</div>}
        <div class="t-foot muted">{longDate(x.date)} · {g.name}</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill icon={c.icon}>{c.label}</Pill>
          {x.deleted && <Pill tone="bad">Deleted</Pill>}
          {rule && <Pill tone="tint" icon="repeat">{rule.active ? FREQ_LABEL[rule.freq] : 'Stopped repeating'}</Pill>}
        </div>
      </div>

      {x.deleted && (
        <div class="callout tone-warn">
          <Icon name="trash" size={22} />
          <div class="callout-text">
            <span class="callout-title">Deleted by {nameOf(x.deletedBy)}</span>
            <span class="callout-msg">It no longer counts towards anyone’s balance.</span>
            <div class="callout-actions"><Button size="small" variant="tinted" onClick={async () => { await s.restoreExpense(x.gid, x.id); toast('Expense restored'); }}>Restore</Button></div>
          </div>
        </div>
      )}

      {mine !== 0 && !x.deleted && (
        <div class="callout">
          <PersonAvatar uid={me} size={34} />
          <div class="callout-text">
            <span class="callout-title">{mine > 0 ? 'You lent ' : 'You borrowed '}<Money v={Math.abs(mine)} cur={g.cur} tone={mine > 0 ? 'pos' : 'neg'} /></span>
            <span class="callout-msg">{mine > 0 ? 'Others owe you this for this expense.' : 'Your share of this expense, paid by someone else.'}</span>
          </div>
        </div>
      )}

      <Section header={paid.length > 1 ? 'Paid by' : 'Paid by'}>
        {paid.map(([u, v]) => (
          <Row key={u} class="row-list" icon={<PersonAvatar uid={u} size={34} />} title={nameOf(u)} detail={<span class="money">{formatMoney(foreign ? x.paidX?.[u] ?? v : v, x.cur)}</span>} />
        ))}
      </Section>

      <Section header={SPLIT_NAMES[x.split?.type] || 'Split'} footer={foreign ? `Shares in ${g.cur}: ${owed.map(([u, v]) => `${nameOf(u, { first: true })} ${formatMoney(v, g.cur)}`).join(', ')}.` : undefined}>
        {owed.map(([u, v]) => (
          <Row key={u} class="row-list" icon={<PersonAvatar uid={u} size={34} />} title={nameOf(u)}
            subtitle={x.split?.type === 'percent' ? `${x.split.values?.[u] || 0}%` : x.split?.type === 'shares' ? `${x.split.values?.[u] || 0} ${x.split.values?.[u] === '1' ? 'share' : 'shares'}` : undefined}
            detail={<span class="money">{formatMoney(foreign ? x.owedX?.[u] ?? v : v, x.cur)}</span>} />
        ))}
      </Section>

      {x.split?.type === 'items' && (
        <Section header="Items">
          {x.split.items.map((it, i) => (
            <Row key={i} title={it.name || `Item ${i + 1}`} subtitle={it.who.map((u) => nameOf(u, { first: true })).join(', ')} detail={formatMoney(it.price, x.cur)} />
          ))}
          {x.split.extra > 0 && <Row title="Tax, tip and charges" subtitle="Shared in proportion to each person’s items" detail={formatMoney(x.split.extra, x.cur)} />}
        </Section>
      )}

      {x.notes && (
        <Section header="Notes">
          <div class="row"><span class="row-main is-multiline"><span class="row-title selectable" style={{ whiteSpace: 'pre-wrap' }}>{x.notes}</span></span></div>
        </Section>
      )}

      {x.rc && <Receipt id={x.rc} />}

      {rule?.active && (
        <Section footer="Stopping keeps the copies already added.">
          <Row title="Stop Repeating" tint onClick={async () => {
            const v = await actionSheet({ title: `${x.desc} repeats ${FREQ_LABEL[rule.freq].toLowerCase()}`, actions: [{ label: 'Stop Repeating', value: 'stop', destructive: true }] });
            if (v === 'stop') { await s.stopRecurring(x.gid, rule.id); toast('Stopped repeating'); }
          }} />
        </Section>
      )}

      <Comments x={x} />

      <Section header="History">
        {x.history.slice().reverse().map((h, i) => {
          const d = hlcDate(h.hlc);
          return <Row key={i} title={`${h.t[0].toUpperCase() + h.t.slice(1)} by ${nameOf(h.by)}`} subtitle={`${dayTitle(d)}, ${timeOf(d)}`} />;
        })}
      </Section>

      {!x.deleted && (
        <Section>
          <Row title="Delete Expense" destructive onClick={async () => {
            if (await confirm({ title: `Delete “${x.desc}”?`, message: 'It stops counting towards balances. You can restore it from this screen.', confirm: 'Delete', destructive: true })) {
              await s.deleteExpense(x.gid, x.id);
              toast('Expense deleted', { icon: 'trash' });
            }
          }} />
        </Section>
      )}
    </Screen>
  );
}
