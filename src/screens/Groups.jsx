import { useStore, Screen, Section, Row, GlassButton, Money, Empty, Button } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { push, present } from '../ui/nav.js';
import { groupList } from '../core/reduce.js';
import { groupNets, myTotals } from '../core/balances.js';
import { formatMoney } from '../core/money.js';
import { GroupTile, balanceText, importFlow, nameOf } from './common.jsx';
import { toast } from '../ui/overlays.jsx';
import { useState } from 'preact/hooks';

function OverallCard({ totals }) {
  const owed = totals.owed.INR || 0;
  const owe = totals.owe.INR || 0;
  const net = owed - owe;
  const others = [...new Set([...Object.keys(totals.owed), ...Object.keys(totals.owe)])].filter((c) => c !== 'INR');
  return (
    <div class="hero-card">
      <span class="hero-label">{net > 0 ? 'Overall, you’re owed' : net < 0 ? 'Overall, you owe' : 'Overall'}</span>
      {net === 0 && !owed ? (
        <span class="hero-amount is-zero">You’re all settled up</span>
      ) : (
        <Money v={Math.abs(net)} tone={net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero'} class="hero-amount" />
      )}
      {(owed > 0 || owe > 0) && (
        <div class="hero-split">
          <div class="hero-chip"><span>Owed to you</span><span class="money tone-pos">{formatMoney(owed)}</span></div>
          <div class="hero-chip"><span>You owe</span><span class="money tone-neg">{formatMoney(owe)}</span></div>
        </div>
      )}
      {others.length > 0 && (
        <div class="hero-lines">
          {others.map((c) => (
            <span key={c}>
              In {c}: owed <b class="money tone-pos">{formatMoney(totals.owed[c] || 0, c)}</b>, you owe <b class="money tone-neg">{formatMoney(totals.owe[c] || 0, c)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupsScreen() {
  const s = useStore();
  const st = s.state;
  const me = s.me;
  const [loading, setLoading] = useState(false);
  const groups = groupList(st).filter((g) => g.everMembers.includes(me));
  const pending = Object.values(st.settlements).filter((p) => p.status === 'pending' && p.to === me && st.groups[p.gid]);

  const right = (
    <>
      <GlassButton icon="tray" label="Open a group file" onClick={importFlow} />
      <GlassButton icon="plus" label="New group" onClick={() => present('newGroup')} />
    </>
  );

  if (!groups.length) {
    return (
      <Screen title="Groups" right={right}>
        <Empty icon="people" title="No groups yet" message="Make a group for a trip, your flat, or anyone you share costs with. Friends join by opening the invite file you send them.">
          <Button icon="plus" onClick={() => present('newGroup')}>Create a Group</Button>
          <Button variant="gray" icon="tray" onClick={importFlow}>Open an Invite</Button>
          <Button variant="plain" busy={loading} onClick={async () => { setLoading(true); try { await s.loadSample(); toast('Sample groups added', { icon: 'sparkles' }); } finally { setLoading(false); } }}>
            Try with sample groups
          </Button>
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen title="Groups" right={right}>
      <OverallCard totals={myTotals(st, me)} />
      {pending.length > 0 && (
        <Section>
          <Row
            icon={<span class="tile c-orange" style={{ width: '36px', height: '36px', borderRadius: '10px' }}><Icon name="bell" size={20} stroke={2} /></span>}
            title={pending.length === 1 ? 'Confirm a payment' : `Confirm ${pending.length} payments`}
            subtitle={pending.length === 1 ? `${nameOf(pending[0].from, { first: true })} says they paid you ${formatMoney(pending[0].amt, st.groups[pending[0].gid].cur)}` : 'People say they’ve paid you'}
            chevron
            onClick={() => push('group', { gid: pending[0].gid })}
          />
        </Section>
      )}
      <Section>
        {groups.map((g) => {
          const v = groupNets(st, g.id)[me] || 0;
          const b = balanceText(v, g.cur);
          return (
            <Row
              key={g.id}
              class="row-lg"
              icon={<GroupTile g={g} size={42} />}
              title={g.name}
              subtitle={<span class={'money tone-' + b.tone}>{b.text}</span>}
              chevron
              onClick={() => push('group', { gid: g.id })}
            />
          );
        })}
      </Section>
      <p class="hint">Groups live on this phone. To keep everyone’s copy in step, open a group and send an update.</p>
    </Screen>
  );
}
