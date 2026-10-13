import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { NavStack } from './ui/NavStack.jsx';
import { SheetHost } from './ui/SheetHost.jsx';
import { OverlayHost, closeTopOverlay } from './ui/overlays.jsx';
import { nav, TABS, setTab, pop, dismiss, useNavState, registerScreens, registerSheets } from './ui/nav.js';
import { Icon } from './ui/icons.jsx';
import { Spring } from './ui/motion.js';
import { useStore } from './ui/kit.jsx';
import { applyTheme, onSystemThemeChange } from './ui/theme.js';
import { onBackButton, minimizeApp, onKeyboard, onOpenFile, readUriText, onAppResume, onAppPause, refreshInsets } from './platform/native.js';
import { store } from './store.js';

import { Onboarding, onboardingBack } from './screens/Onboarding.jsx';
import { GroupsScreen } from './screens/Groups.jsx';
import { GroupScreen } from './screens/Group.jsx';
import { GroupSettingsScreen, UpiForSheet } from './screens/GroupSettings.jsx';
import { ExpenseScreen } from './screens/Expense.jsx';
import { FriendsScreen, FriendScreen } from './screens/Friends.jsx';
import { ActivityScreen } from './screens/Activity.jsx';
import { AccountScreen, AboutScreen, ProfileSheet, MyUpiSheet } from './screens/Account.jsx';
import { ExpenseEditorSheet } from './sheets/ExpenseEditor.jsx';
import { SettleUpSheet } from './sheets/SettleUp.jsx';
import { NewGroupSheet, AddMemberSheet, ImportSheet } from './sheets/GroupSheets.jsx';
import { handleImportText } from './screens/common.jsx';
import { notice } from './ui/overlays.jsx';

registerScreens({
  groups: GroupsScreen,
  group: GroupScreen,
  groupSettings: GroupSettingsScreen,
  expense: ExpenseScreen,
  friends: FriendsScreen,
  friend: FriendScreen,
  activity: ActivityScreen,
  account: AccountScreen,
  about: AboutScreen,
});

registerSheets({
  newGroup: NewGroupSheet,
  addMember: AddMemberSheet,
  expense: ExpenseEditorSheet,
  settle: SettleUpSheet,
  importFile: ImportSheet,
  upiFor: UpiForSheet,
  myUpi: MyUpiSheet,
  profile: ProfileSheet,
});

const TAB_ITEMS = [
  { id: 'groups', label: 'Groups', icon: 'people' },
  { id: 'friends', label: 'Friends', icon: 'person' },
  { id: 'activity', label: 'Activity', icon: 'clock' },
  { id: 'account', label: 'Account', icon: 'personCircle' },
];

/** Floating glass tab bar; the selection lens glides to the chosen tab on a spring. */
function TabBar() {
  useNavState();
  const s = useStore();
  const bar = useRef(null);
  const lens = useRef(null);
  const spring = useRef(null);
  const idx = TABS.indexOf(nav.tab);
  const pending = Object.values(s.state.settlements).filter((p) => p.status === 'pending' && p.to === s.me && s.state.groups[p.gid]).length;

  const place = (animate) => {
    const el = bar.current;
    if (!el || !el.offsetWidth) return;
    const w = (el.clientWidth - 10) / 4;
    lens.current.style.width = `${w}px`;
    const x = 5 + w * idx;
    if (!spring.current) {
      spring.current = new Spring({ value: x, response: 0.38, damping: 0.8, onUpdate: (v) => { lens.current.style.transform = `translate3d(${v}px,0,0)`; } });
      spring.current.set(x);
    } else if (animate) spring.current.to(x);
    else spring.current.set(x);
  };
  useLayoutEffect(() => place(true), [idx]);
  useEffect(() => {
    const f = () => place(false);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [idx]);

  return (
    <nav class="tabbar" ref={bar} aria-label="Main">
      <span class="tab-lens" ref={lens} aria-hidden="true" />
      {TAB_ITEMS.map((t) => (
        <button type="button" class="tab" aria-current={nav.tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)} key={t.id}>
          <Icon name={t.icon} size={25} stroke={nav.tab === t.id ? 2.1 : 1.8} />
          {t.label}
          {t.id === 'groups' && pending > 0 && <span class="tab-badge">{pending}</span>}
        </button>
      ))}
    </nav>
  );
}

let pendingUri = null;

async function openUri(uri) {
  if (!store.profile) {
    pendingUri = uri;
    return;
  }
  try {
    handleImportText(await readUriText(uri));
  } catch {
    notice('Can’t open this file', 'Batwara couldn’t read the file. Save it to your phone, then use Open a Group File.');
  }
}

export function App() {
  const s = useStore();
  useNavState();
  const shell = useRef(null);

  useEffect(() => {
    const offs = [
      onBackButton(() => {
        if (closeTopOverlay()) return;
        if (nav.sheets.length) return dismiss();
        if (!store.profile) return onboardingBack ? onboardingBack() : minimizeApp();
        if (pop()) return;
        if (nav.tab !== 'groups') return setTab('groups');
        minimizeApp();
      }),
      onKeyboard((open) => {
        document.documentElement.classList.toggle('kb-open', open);
        if (open) setTimeout(() => document.activeElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 120);
      }),
      onOpenFile(openUri),
      onAppResume(() => { store.materializeRecurring(); refreshInsets(); }),
      onAppPause(() => store.saveNow()),
      onSystemThemeChange(() => applyTheme(store.prefs.theme)),
    ];
    return () => offs.forEach((f) => f && f());
  }, []);

  if (!s.profile) {
    return (
      <>
        <Onboarding onDone={() => {
          store.materializeRecurring();
          if (pendingUri) { const u = pendingUri; pendingUri = null; setTimeout(() => openUri(u), 400); }
        }} />
        <OverlayHost />
      </>
    );
  }

  return (
    <>
      <div class="shell" ref={shell}>
        {TABS.map((t) => <NavStack key={t} tab={t} active={nav.tab === t} />)}
        <TabBar />
        <div class="shell-dim" />
      </div>
      <SheetHost shell={shell} />
      <OverlayHost />
    </>
  );
}
