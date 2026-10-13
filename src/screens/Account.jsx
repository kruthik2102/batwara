import { useState } from 'preact/hooks';
import { useStore, Screen, Section, Row, Switch, IconTile, Avatar, Field, Button } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { push, present, useScreen, useSheet } from '../ui/nav.js';
import { formatPhone } from '../core/phone.js';
import { isVpa, normalizeVpa } from '../core/upi.js';
import { menu, confirm, toast, notice } from '../ui/overlays.jsx';
import { importFlow } from './common.jsx';
import { UpiEditor } from './GroupSettings.jsx';
import { applyTheme } from '../ui/theme.js';
import { notificationPermission, isNative } from '../platform/native.js';
import { otpMode } from '../platform/otp.js';
import { AppIcon } from './AppIcon.jsx';

const THEMES = [
  { id: 'system', label: 'Automatic' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function AccountScreen() {
  const s = useStore();
  const scr = useScreen();
  const p = s.profile;
  const prefs = s.prefs;
  const groups = Object.values(s.state.groups).length;
  const events = s.data.events.length;
  return (
    <Screen title="Account">
      <Section>
        <Row icon={<Avatar name={p.name} size={60} me />} title={<span class="t-title3">{p.name}</span>} subtitle={formatPhone(p.phone)} chevron onClick={() => present('profile', { detent: 'fit' })} />
      </Section>

      <Section header="Payments" footer="People in your groups use this to pay you from PhonePe, Google Pay, Paytm or BHIM.">
        <Row icon={<IconTile icon="at" color="tint" size={30} />} title="Your UPI ID" detail={p.vpa || 'Add'} chevron onClick={() => present('myUpi', { detent: 'fit' })} />
      </Section>

      <Section header="Sync" footer="There’s no server. Each group travels as an encrypted file that you send with any app; opening it merges the changes. If you lose this phone, verify your number on the new one and ask anyone in each group for an invite.">
        <Row icon={<IconTile icon="tray" color="teal" size={30} />} title="Open a Group File" chevron onClick={importFlow} />
        <Row icon={<IconTile icon="shield" color="green" size={30} />} title="How Batwara Works" chevron onClick={() => push('about', {}, scr.tab)} />
      </Section>

      <Section header="Preferences">
        <Row icon={<IconTile icon="moon" color="indigo" size={30} />} title="Appearance" detail={THEMES.find((t) => t.id === prefs.theme)?.label} chevron onClick={async (e) => {
          const v = await menu(e.currentTarget, THEMES.map((t) => ({ label: t.label, value: t.id, checked: t.id === prefs.theme })));
          if (v) { s.setPref('theme', v); applyTheme(v); }
        }} />
        <Row icon={<IconTile icon="bell" color="red" size={30} />} title="Repeating expense reminders" accessory={<Switch checked={!!prefs.reminders} label="Repeating expense reminders" onChange={async (v) => {
          if (v && isNative && !(await notificationPermission(true))) return notice('Notifications are off', 'Allow notifications for Batwara in Android Settings to get reminders.');
          s.setPref('reminders', v);
        }} />} />
        <Row icon={<IconTile icon="sparkles" color="pink" size={30} />} title="Haptics" accessory={<Switch checked={prefs.haptics !== false} label="Haptics" onChange={(v) => s.setPref('haptics', v)} />} />
      </Section>

      {s.data.demo && (
        <Section header="Sample data" footer="The sample groups and people only exist on this phone.">
          <Row title="Remove Sample Groups" destructive onClick={async () => {
            if (await confirm({ title: 'Remove sample groups?', message: 'Goa trip and Flat 4B are removed from this phone.', confirm: 'Remove', destructive: true })) {
              await s.removeSample();
              toast('Sample groups removed', { icon: 'trash' });
            }
          }} />
        </Section>
      )}

      <Section header="This phone" footer={`Phone verification: ${otpMode === 'sms' ? 'SMS' : 'demo mode, code shown on screen'}. Version ${__APP_VERSION__}.`}>
        <Row title="Groups" detail={String(groups)} />
        <Row title="Changes stored" detail={String(events)} />
        <Row title="Device ID" detail={<span class="code">{s.data.device.id}</span>} />
      </Section>

      <Section footer="Deletes every group, payment and key from this phone. Other members keep their copies.">
        <Row title="Sign Out and Erase This Phone" destructive onClick={async () => {
          const ok = await confirm({ title: 'Erase everything?', message: 'All groups and history on this phone are deleted. You can get groups back only if a member sends you an invite.', confirm: 'Erase', destructive: true });
          if (!ok) return;
          await s.eraseEverything();
          location.reload();
        }} />
      </Section>
    </Screen>
  );
}

export function ProfileSheet() {
  const s = useStore();
  const sh = useSheet();
  const [name, setName] = useState(s.profile.name);
  return (
    <>
      <div class="sheet-header" style={{ gridTemplateColumns: '56px 1fr 56px' }}>
        <div />
        <div class="sheet-header-title">Your Name</div>
        <div />
      </div>
      <div class="sheet-scroll">
        <Section footer="Shown to people in your groups. Changes reach them with your next update.">
          <Field value={name} onInput={setName} placeholder="Your name" autoFocus maxLength={60} enterKeyHint="done" />
        </Section>
        <div class="sheet-pad" style={{ display: 'flex', gap: '10px', paddingBottom: '16px' }}>
          <Button variant="gray" onClick={() => sh.close()}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={async () => { await s.updateProfile({ name }); sh.close({ force: true }); toast('Name updated'); }}>Save</Button>
        </div>
      </div>
    </>
  );
}

export function MyUpiSheet() {
  const s = useStore();
  const [v, setV] = useState(s.profile.vpa || '');
  const [err, setErr] = useState('');
  return (
    <UpiEditor
      title="Your UPI ID"
      value={v}
      onInput={(x) => { setV(x); setErr(''); }}
      error={err}
      footer="Find it in your UPI app under your profile, for example yourname@okhdfcbank."
      onSave={async (close) => {
        const n = normalizeVpa(v);
        if (n && !isVpa(n)) return setErr('That doesn’t look like a UPI ID. It should look like name@bank.');
        await s.updateProfile({ vpa: n });
        toast('UPI ID saved');
        close();
      }}
    />
  );
}

export function AboutScreen() {
  const steps = [
    ['lock', 'tint', 'Your phone holds the data', 'Every expense, edit and payment is saved on this phone as a change that can’t be altered later. Balances are worked out from those changes, so there’s nothing to get out of step.'],
    ['key', 'orange', 'Every change is signed', 'This phone has its own signing key. Each change carries a signature, and other phones check it before accepting it. Edited or forged changes are rejected.'],
    ['sync', 'green', 'Sync without a server', 'Sending an update packs the group’s changes into one encrypted file (AES-256). Members open it with Batwara and their copy merges. Files can arrive in any order, twice, or late; everyone ends up with the same balances.'],
    ['phone', 'blue', 'Your number is your identity', 'Groups recognise you by your verified mobile number. That’s why someone has to add your number before their invite works for you.'],
    ['wallet', 'purple', 'Money never touches Batwara', 'Settling up opens your UPI app with the amount filled in. A payment counts once the person who received it confirms it, because UPI apps don’t reliably report back.'],
    ['person', 'teal', 'Lost your phone?', 'Install Batwara on the new phone, verify the same number, and ask anyone in each group to send you an invite. Your history comes back from their copy.'],
  ];
  return (
    <Screen title="How Batwara Works" large={false}>
      <div class="amount-hero">
        <AppIcon size={72} />
        <div class="t-title2">Private by design</div>
        <p class="t-callout muted" style={{ maxWidth: '32ch', textWrap: 'pretty' }}>No accounts, no server, no tracking. Your groups live on the phones of the people in them.</p>
      </div>
      <Section>
        {steps.map(([icon, color, title, msg]) => (
          <Row key={title} icon={<IconTile icon={icon} color={color} size={34} />} multiline title={<span class="t-headline">{title}</span>} subtitle={<span style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>{msg}</span>} />
        ))}
      </Section>
      <Section header="Technical details" footer="Hybrid logical clocks order changes made on different phones, so a later edit always wins in the same way everywhere.">
        <Row title="Change log" detail="Signed events" />
        <Row title="Signatures" detail="ECDSA P-256" />
        <Row title="Group files" detail="AES-256-GCM" />
        <Row title="Ordering" detail="Hybrid clock" />
      </Section>
    </Screen>
  );
}
