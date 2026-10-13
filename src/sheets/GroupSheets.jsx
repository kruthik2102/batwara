import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, SheetHeader, SheetBody, Section, Row, Field, Switch, Button, IconTile } from '../ui/kit.jsx';
import { Icon, MinusBadge, PlusBadge } from '../ui/icons.jsx';
import { useSheet, push, goTo } from '../ui/nav.js';
import { GROUP_KINDS } from '../core/categories.js';
import { CURRENCIES } from '../core/money.js';
import { normalizePhone, formatPhone } from '../core/phone.js';
import { PersonAvatar, nameOf, shareGroupFlow, runImport } from '../screens/common.jsx';
import { menu, toast, notice } from '../ui/overlays.jsx';
import { canPickContacts, pickContact, haptic } from '../platform/native.js';
import { UserError } from '../store.js';
import { Avatar } from '../ui/kit.jsx';

/** Name + number entry with an optional contact picker. */
function PersonEntry({ onAdd, existing = [], myPhone, compact }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const nameRef = useRef(null);
  const add = (n = name, p = phone) => {
    const e164 = normalizePhone(p);
    if (!n.trim()) return setErr('Add their name.');
    if (!e164) return setErr('Enter a 10-digit Indian mobile number.');
    if (e164 === myPhone) return setErr('That’s your own number.');
    if (existing.includes(e164)) return setErr('They’re already in the list.');
    onAdd({ name: n.trim(), phone: e164 });
    setName('');
    setPhone('');
    setErr('');
    haptic.light();
  };
  return (
    <>
      <Section header={compact ? undefined : 'Add someone'} footer={err ? undefined : 'Their number is how their phone recognises the group when they open your invite.'}>
        {canPickContacts && (
          <Row icon={<Icon name="person" size={22} />} title="Choose from Contacts" tint onClick={async () => {
            try {
              const c = await pickContact();
              if (!c) return;
              const e164 = normalizePhone(c.phone);
              if (!e164) { setName(c.name); setPhone(c.phone); setErr('That contact’s number isn’t an Indian mobile number. Check it below.'); return; }
              add(c.name, c.phone);
            } catch (e) {
              notice('Contacts unavailable', e.message || 'Add the person by number instead.');
            }
          }} />
        )}
        <Field label="Name" value={name} onInput={(v) => { setName(v); setErr(''); }} placeholder="Their name" inputRef={nameRef} maxLength={60} autocomplete="off" enterKeyHint="next" />
        <Field label="Mobile" prefix="+91" value={phone} onInput={(v) => { setPhone(v.replace(/[^\d+ ]/g, '')); setErr(''); }} placeholder="98765 43210" type="tel" inputMode="tel" autocomplete="off" enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && add()}
          suffix={<Button size="small" variant="tinted" disabled={!name.trim() || !phone.trim()} onClick={() => add()}>Add</Button>} />
      </Section>
      {err && <p class="field-error" style={{ marginTop: '-14px', marginBottom: '14px' }}>{err}</p>}
    </>
  );
}

export function NewGroupSheet() {
  const s = useStore();
  const sh = useSheet();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('trip');
  const [cur, setCur] = useState('INR');
  const [simplify, setSimplify] = useState(true);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { sh.setDirty(!!(name.trim() || people.length)); }, [name, people.length]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const gid = await s.createGroup({ name, kind, cur, simplify, members: people });
      haptic.success();
      sh.close({ force: true });
      setTimeout(() => {
        goTo('groups', 'group', { gid });
        toast('Group created', { message: people.length ? 'Send the invite so they can join.' : undefined });
      }, 280);
    } catch (e) {
      setBusy(false);
      notice('Couldn’t create the group', e.message);
    }
  };

  return (
    <>
      <SheetHeader title="New Group" onCancel={() => sh.close()} cancelLabel="Cancel" onDone={create} doneLabel="Create" doneDisabled={!name.trim()} busy={busy} />
      <SheetBody>
        <Section>
          <Field value={name} onInput={setName} placeholder="Group name, like Goa trip" autoFocus maxLength={60} enterKeyHint="done" />
          <div class="kinds" role="radiogroup" aria-label="Group type">
            {GROUP_KINDS.map((k) => (
              <button type="button" role="radio" aria-checked={k.id === kind ? 'true' : 'false'} class={'kind' + (k.id === kind ? ' is-on' : '')} onClick={() => { haptic.selection(); setKind(k.id); }}>
                <IconTile icon={k.icon} color={k.color} size={36} />
                {k.label}
              </button>
            ))}
          </div>
        </Section>
        <Section>
          <Row title="Currency" detail={cur} chevron onClick={async (e) => {
            const v = await menu(e.currentTarget, Object.values(CURRENCIES).map((c) => ({ label: c.code, detail: c.name, value: c.code, checked: c.code === cur })), { title: 'Group currency' });
            if (v) setCur(v);
          }} />
          <Row title="Simplify debts" accessory={<Switch checked={simplify} onChange={setSimplify} label="Simplify debts" />} />
        </Section>
        <Section header="Members">
          <Row icon={<PersonAvatar uid={s.me} size={32} />} title={`${s.profile.name} (you)`} subtitle={formatPhone(s.profile.phone)} />
          {people.map((p) => (
            <Row key={p.phone} icon={<Avatar uid={p.phone} name={p.name} size={32} />} title={p.name} subtitle={formatPhone(p.phone)}
              accessory={<button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((x) => x.phone !== p.phone))}><MinusBadge /></button>} />
          ))}
        </Section>
        <PersonEntry onAdd={(p) => setPeople([...people, p])} existing={people.map((p) => p.phone)} myPhone={s.profile.phone} />
      </SheetBody>
    </>
  );
}

export function AddMemberSheet({ gid }) {
  const s = useStore();
  const sh = useSheet();
  const g = s.state.groups[gid];
  const [added, setAdded] = useState([]);
  const phones = g.members.map((u) => s.state.users[u]?.phone).filter(Boolean);
  return (
    <>
      <SheetHeader title="Add People" subtitle={g.name} onCancel={() => sh.close()} onDone={added.length ? () => { sh.close({ force: true }); setTimeout(() => shareGroupFlow(gid, 'invite'), 350); } : undefined} doneIcon="share" doneLabel="Send invite" />
      <SheetBody>
        <PersonEntry compact existing={phones} myPhone={s.profile.phone} onAdd={async (p) => {
          try {
            await s.addMember(gid, p);
            setAdded((a) => [...a, p]);
            toast(`${p.name} added`);
          } catch (e) {
            notice('Couldn’t add them', e instanceof UserError ? e.message : 'Something went wrong.');
          }
        }} />
        {added.length > 0 && (
          <>
            <Section header="Added">
              {added.map((p) => <Row key={p.phone} icon={<Avatar uid={p.phone} name={p.name} size={32} />} title={p.name} subtitle={formatPhone(p.phone)} />)}
            </Section>
            <div class="sheet-pad"><Button icon="share" onClick={() => { sh.close({ force: true }); setTimeout(() => shareGroupFlow(gid, 'invite'), 350); }}>Send Them the Invite</Button></div>
          </>
        )}
      </SheetBody>
    </>
  );
}

export function ImportSheet({ text, info }) {
  const sh = useSheet();
  const [state, setState] = useState({ busy: false, error: '', done: null });
  const invite = info.kind === 'invite';
  const run = async () => {
    setState({ busy: true, error: '', done: null });
    const r = await runImport(text);
    if (r.ok) setState({ busy: false, error: '', done: r.r });
    else setState({ busy: false, error: r.message, done: null });
  };
  if (state.done) {
    const d = state.done;
    return (
      <>
        <SheetHeader title={d.joined ? 'Joined' : 'Merged'} onDone={() => sh.close({ force: true })} />
        <div class="status-big" style={{ paddingBottom: '18px' }}>
          <IconTile icon="check" color="green" size={60} />
          <div class="t-title2">{d.joined ? `You’re in “${d.name}”` : `“${d.name}” is up to date`}</div>
          <p>{d.added ? `${d.added} new ${d.added === 1 ? 'change' : 'changes'} from ${d.from || 'the file'}.` : 'You already had everything in this file.'}{d.rejected ? ` ${d.rejected} ${d.rejected === 1 ? 'change was' : 'changes were'} skipped because the signature didn’t check out.` : ''}</p>
        </div>
        <div class="sheet-pad" style={{ paddingBottom: '18px' }}>
          <Button onClick={() => { sh.close({ force: true }); setTimeout(() => goTo('groups', 'group', { gid: d.gid }), 280); }}>Open Group</Button>
        </div>
      </>
    );
  }
  return (
    <>
      <SheetHeader title={invite ? 'Group Invite' : 'Group Update'} onCancel={() => sh.close()} />
      <div class="status-big" style={{ paddingBottom: '14px' }}>
        <IconTile icon={invite ? 'people' : 'sync'} color={invite ? 'green' : 'tint'} size={60} />
        <div class="t-title2">{info.name}</div>
        <p>{invite ? `${info.from} invited you to this group.` : `${info.from} sent changes to this group.`} The file has {info.count} {info.count === 1 ? 'change' : 'changes'}{invite ? ' and the key to read them.' : '.'}</p>
      </div>
      {state.error && <p class="field-error" style={{ padding: '0 24px' }}>{state.error}</p>}
      <div class="sheet-pad" style={{ paddingBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Button busy={state.busy} disabled={!info.canOpen} onClick={run}>{invite && !info.known ? 'Join Group' : 'Merge Changes'}</Button>
        {!info.canOpen && <p class="onb-note">This phone hasn’t joined “{info.name}” yet. Ask {info.from} for an invite instead.</p>}
      </div>
    </>
  );
}
