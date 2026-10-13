import { useStore, Screen, Section, Row, Empty, IconTile } from '../ui/kit.jsx';
import { push, useScreen } from '../ui/nav.js';
import { formatMoney } from '../core/money.js';
import { FREQ_LABEL } from '../core/recurring.js';
import { nameOf } from './common.jsx';
import { hlcDate, dayTitle, timeOf } from '../ui/format.js';
import { categoryOf } from '../core/categories.js';

const ICON = {
  group_created: ['people', 'blue'],
  member_added: ['person', 'green'],
  member_removed: ['person', 'gray'],
  expense_added: ['receipt', 'tint'],
  expense_edited: ['pencil', 'orange'],
  expense_deleted: ['trash', 'red'],
  expense_restored: ['receipt', 'green'],
  comment_added: ['message', 'blue'],
  settlement_proposed: ['banknote', 'green'],
  settlement_confirmed: ['check', 'green'],
  settlement_declined: ['xmark', 'red'],
  settlement_cancelled: ['xmark', 'gray'],
  recurring_set: ['repeat', 'purple'],
  recurring_stopped: ['repeat', 'gray'],
  import: ['tray', 'teal'],
};

function describe(st, e, me) {
  const g = st.groups[e.g];
  const who = nameOf(e.by);
  const gname = g?.name || 'a group';
  const x = e.x ? st.expenses[e.x] : null;
  const sp = e.s ? st.settlements[e.s] : null;
  const r = e.r ? st.recurring[e.r] : null;
  const effect = (xx) => {
    if (!xx) return '';
    const v = (xx.paid[me] || 0) - (xx.owed[me] || 0);
    return v > 0 ? `You get back ${formatMoney(v, g.cur)}` : v < 0 ? `You owe ${formatMoney(-v, g.cur)}` : 'Not involved';
  };
  switch (e.t) {
    case 'group_created': return { title: `${who} created “${gname}”` };
    case 'member_added': return { title: `${who} added ${nameOf(e.uid)} to “${gname}”` };
    case 'member_removed': return { title: `${who} removed ${nameOf(e.uid)} from “${gname}”` };
    case 'expense_added': return { title: `${who} added “${x?.desc}” in “${gname}”`, sub: effect(x), tone: x && (x.paid[me] || 0) - (x.owed[me] || 0) };
    case 'expense_edited': return { title: `${who} edited “${x?.desc}” in “${gname}”`, sub: effect(x) };
    case 'expense_deleted': return { title: `${who} deleted “${x?.desc}” from “${gname}”` };
    case 'expense_restored': return { title: `${who} restored “${x?.desc}” in “${gname}”` };
    case 'comment_added': {
      const c = (st.comments[e.x] || []).find((cc) => cc.id === e.id);
      return { title: `${who} commented on “${x?.desc}”`, sub: c ? `“${c.text}”` : '' };
    }
    case 'settlement_proposed': return { title: `${nameOf(sp?.from)} paid ${nameOf(sp?.to, { you: 'you' })} ${formatMoney(sp?.amt || 0, g?.cur)}`, sub: sp?.status === 'pending' ? 'Waiting for confirmation' : `In “${gname}”` };
    case 'settlement_confirmed': return { title: `${who} confirmed ${formatMoney(sp?.amt || 0, g?.cur)} from ${nameOf(sp?.from, { you: 'you' })}`, sub: `In “${gname}”` };
    case 'settlement_declined': return { title: `${who} didn’t receive ${formatMoney(sp?.amt || 0, g?.cur)} from ${nameOf(sp?.from, { you: 'you' })}`, sub: `In “${gname}”` };
    case 'settlement_cancelled': return { title: `${who} cancelled a payment of ${formatMoney(sp?.amt || 0, g?.cur)}`, sub: `In “${gname}”` };
    case 'recurring_set': return { title: `${who} set “${r?.template.desc}” to repeat`, sub: r ? FREQ_LABEL[r.freq] : '' };
    case 'recurring_stopped': return { title: `${who} stopped “${r?.template.desc}” repeating`, sub: `In “${gname}”` };
    default: return { title: e.t };
  }
}

export function ActivityScreen() {
  const s = useStore();
  const scr = useScreen();
  const st = s.state;
  const me = s.me;
  const imports = (s.data.syncLog || []).map((l, i) => ({ id: 'imp' + i + l.at, t: 'import', g: l.gid, at: l.at, l }));
  const items = [
    ...st.feed.filter((e) => st.groups[e.g]).map((e) => ({ ...e, at: hlcDate(e.hlc).getTime() })),
    ...imports.filter((i) => st.groups[i.g]),
  ].sort((a, b) => b.at - a.at).slice(0, 200);

  if (!items.length) {
    return (
      <Screen title="Activity">
        <Empty icon="clock" title="Nothing yet" message="Expenses, payments and updates from your groups show up here." />
      </Screen>
    );
  }
  const days = [];
  for (const it of items) {
    const label = dayTitle(new Date(it.at));
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(it);
  }
  return (
    <Screen title="Activity">
      {days.map((d) => (
        <Section key={d.label} header={d.label}>
          {d.items.map((it) => {
            const [icon, color] = ICON[it.t] || ['info', 'gray'];
            if (it.t === 'import') {
              const l = it.l;
              return (
                <Row key={it.id} icon={<IconTile icon={icon} color={color} size={34} />} multiline
                  title={l.joined ? `You joined “${st.groups[l.gid]?.name}”` : `Received ${l.added} ${l.added === 1 ? 'change' : 'changes'} from ${l.from || 'a file'}`}
                  subtitle={`${st.groups[l.gid]?.name} · ${timeOf(new Date(l.at))}`}
                  onClick={() => push('group', { gid: l.gid }, scr.tab)} />
              );
            }
            const dsc = describe(st, it, me);
            const x = it.x ? st.expenses[it.x] : null;
            const tileIcon = it.t === 'expense_added' && x ? categoryOf(x.cat).icon : icon;
            const tileColor = it.t === 'expense_added' && x ? categoryOf(x.cat).color : color;
            return (
              <Row key={it.id} icon={<IconTile icon={tileIcon} color={tileColor} size={34} />} multiline
                title={dsc.title}
                subtitle={<span>{dsc.sub ? <span class={dsc.tone > 0 ? 'money tone-pos' : dsc.tone < 0 ? 'money tone-neg' : ''}>{dsc.sub} · </span> : ''}{timeOf(new Date(it.at))}</span>}
                onClick={() => (x ? push('expense', { xid: x.id }, scr.tab) : push('group', { gid: it.g }, scr.tab))} />
            );
          })}
        </Section>
      ))}
    </Screen>
  );
}
