import { useStore, Screen, Section, Row, Money, Empty, Button } from '../ui/kit.jsx';
import { push, present, useScreen } from '../ui/nav.js';
import { friendBalances } from '../core/balances.js';
import { formatMoney } from '../core/money.js';
import { formatPhone } from '../core/phone.js';
import { PersonAvatar, nameOf, GroupTile } from './common.jsx';
import { shareText } from '../platform/native.js';
import { firstName } from '../ui/format.js';

function summary(f) {
  const parts = Object.entries(f.byCur).filter(([, v]) => v);
  if (!parts.length) return { tone: 'zero', text: 'Settled up' };
  if (parts.length === 1) {
    const [cur, v] = parts[0];
    return v > 0 ? { tone: 'pos', text: `owes you ${formatMoney(v, cur)}` } : { tone: 'neg', text: `you owe ${formatMoney(-v, cur)}` };
  }
  return { tone: 'zero', text: parts.map(([c, v]) => `${v > 0 ? '+' : '−'}${formatMoney(Math.abs(v), c)}`).join(' · ') };
}

export function FriendsScreen() {
  const s = useStore();
  const me = s.me;
  const fb = friendBalances(s.state, me);
  const list = Object.entries(fb)
    .map(([uid, f]) => ({ uid, f, sum: summary(f), weight: Object.values(f.byCur).reduce((a, v) => a + Math.abs(v), 0) }))
    .sort((a, b) => b.weight - a.weight || nameOf(a.uid).localeCompare(nameOf(b.uid)));
  if (!list.length) {
    return (
      <Screen title="Friends">
        <Empty icon="person" title="No friends yet" message="Everyone you share a group with shows up here, with what you owe each other across all groups.">
          <Button icon="plus" onClick={() => present('newGroup')}>Create a Group</Button>
        </Empty>
      </Screen>
    );
  }
  const owing = list.filter((x) => x.sum.tone !== 'zero');
  const settled = list.filter((x) => x.sum.tone === 'zero');
  return (
    <Screen title="Friends">
      {owing.length > 0 && (
        <Section>
          {owing.map(({ uid, f, sum }) => (
            <Row key={uid} icon={<PersonAvatar uid={uid} size={42} />} title={nameOf(uid)} subtitle={`${f.shared.size} shared ${f.shared.size === 1 ? 'group' : 'groups'}`}
              accessory={<span class={'money tone-' + sum.tone} style={{ fontWeight: 600, fontSize: '0.9375rem', textAlign: 'right' }}>{sum.text}</span>} chevron
              onClick={() => push('friend', { uid })} />
          ))}
        </Section>
      )}
      {settled.length > 0 && (
        <Section header="Settled up">
          {settled.map(({ uid, f }) => (
            <Row key={uid} icon={<PersonAvatar uid={uid} size={42} />} title={nameOf(uid)} subtitle={`${f.shared.size} shared ${f.shared.size === 1 ? 'group' : 'groups'}`} chevron onClick={() => push('friend', { uid })} />
          ))}
        </Section>
      )}
    </Screen>
  );
}

export function FriendScreen({ uid }) {
  const s = useStore();
  const scr = useScreen();
  const me = s.me;
  const f = friendBalances(s.state, me)[uid];
  const u = s.state.users[uid];
  if (!f) return <Screen title={nameOf(uid)} large={false}><Empty icon="person" title="No shared groups" /></Screen>;
  const sum = summary(f);
  const groups = [...f.shared].map((gid) => s.state.groups[gid]).filter(Boolean);
  const owesMe = Object.entries(f.byCur).filter(([, v]) => v > 0);
  const iOwe = Object.entries(f.groups).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const theyOwe = Object.entries(f.groups).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <Screen title={nameOf(uid)} large={false}>
      <div class="amount-hero">
        <PersonAvatar uid={uid} size={76} />
        <div class="t-title2">{nameOf(uid)}</div>
        <div class="t-sub muted">{[formatPhone(u?.phone), u?.vpa].filter(Boolean).join(' · ')}</div>
        <div class={'t-title3 money tone-' + sum.tone} style={{ marginTop: '6px' }}>{sum.tone === 'zero' ? 'You’re settled up' : sum.text[0].toUpperCase() + sum.text.slice(1)}</div>
      </div>
      {(iOwe.length > 0 || theyOwe.length > 0) && (
        <div class="action-row">
          {iOwe.length > 0 && <Button size="medium" icon="banknote" onClick={() => present('settle', { gid: iOwe[0][0], to: uid, amount: -iOwe[0][1] })}>Settle Up</Button>}
          {theyOwe.length > 0 && (
            <Button size="medium" variant="gray" icon="message" onClick={() => shareText({
              title: 'Payment reminder',
              text: `Hi ${firstName(nameOf(uid))}, a reminder from Batwara: you owe me ${owesMe.map(([c, v]) => formatMoney(v, c)).join(' and ')}.${s.profile.vpa ? ` You can pay me on UPI at ${s.profile.vpa}.` : ''}`,
            })}>Remind</Button>
          )}
        </div>
      )}
      <Section header="Shared groups">
        {groups.map((g) => {
          const v = f.groups[g.id] || 0;
          return (
            <Row key={g.id} icon={<GroupTile g={g} size={36} />} title={g.name}
              detail={v ? <Money v={Math.abs(v)} cur={g.cur} tone={v > 0 ? 'pos' : 'neg'} /> : <span class="muted">settled</span>}
              subtitle={v > 0 ? `${firstName(nameOf(uid))} owes you` : v < 0 ? `You owe ${firstName(nameOf(uid))}` : undefined}
              chevron onClick={() => push('group', { gid: g.id }, scr.tab)} />
          );
        })}
      </Section>
    </Screen>
  );
}
