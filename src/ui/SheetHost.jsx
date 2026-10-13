import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { nav, sheetViews, SheetCtx, removeSheet, setSheetDirty, useNavState, dismiss } from './nav.js';
import { Spring, project, rubberband } from './motion.js';
import { attachDrag, scrolledAbove } from './gesture.js';
import { actionSheet } from './overlays.jsx';
import { setStatusBarStyle } from '../platform/native.js';
import { isDarkNow } from './theme.js';

const PRESENT = { response: 0.4, damping: 1 };
const RETURN = { response: 0.32, damping: 0.86 };
const frames = new Map();
let shellEl = null;

function sat() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
}

/** Push the screens behind page sheets back, the way iOS does: scale down, round the corners, dim. */
function updateBackdrop() {
  const list = nav.sheets.map((s) => frames.get(s.id)).filter(Boolean);
  let shellP = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const above = list[i + 1];
    const push = above && above.page ? above.progress() : 0;
    f.applyPush(push);
    if (f.page && i === 0) shellP = f.progress();
  }
  if (list.length > 1 && list[0].page) shellP = 1;
  if (shellEl) {
    const top = Math.max(sat(), 12) - 2;
    if (shellP > 0) {
      shellEl.style.transform = `translate3d(0,${top * shellP}px,0) scale(${1 - 0.07 * shellP})`;
      shellEl.style.borderRadius = `${14 * shellP}px`;
    } else {
      shellEl.style.transform = '';
      shellEl.style.borderRadius = '';
    }
    const dim = shellEl.querySelector(':scope > .shell-dim');
    if (dim) dim.style.opacity = String(shellP);
    shellEl.classList.toggle('is-pushed', shellP > 0);
  }
  setStatusBarStyle(shellP > 0.5 || isDarkNow());
}

function SheetFrame({ sheet, index }) {
  const View = sheetViews[sheet.name];
  const page = sheet.params.detent !== 'fit';
  const card = useRef(null);
  const scrim = useRef(null);
  const st = useRef(null);

  if (!st.current) {
    st.current = {
      y: 10000,
      push: 0,
      closing: false,
      height: () => (card.current ? card.current.offsetHeight : window.innerHeight),
    };
  }
  const f = st.current;

  function paint() {
    if (card.current) card.current.style.transform = `translate3d(0,${f.y}px,0)` + (f.push ? ` scale(${1 - 0.05 * f.push})` : '');
  }
  function apply(y) {
    f.y = y;
    paint();
    if (scrim.current) scrim.current.style.opacity = String((page ? 0.32 : 0.36) * f.progress());
    updateBackdrop();
  }
  f.progress = () => Math.max(0, Math.min(1, 1 - f.y / f.height()));
  f.applyPush = (p) => {
    if (p === f.push) return;
    f.push = p;
    paint();
  };
  f.page = page;

  if (!f.spring) f.spring = new Spring({ ...PRESENT, value: 10000, onUpdate: apply });

  f.close = async (velocity = 0) => {
    if (f.closing) return;
    f.closing = true;
    f.spring.value = f.y;
    const h = f.height();
    await f.spring.to(h + 24, { ...PRESENT, velocity, until: (v) => v >= h + 2 });
    frames.delete(sheet.id);
    removeSheet(sheet.id);
    updateBackdrop();
  };
  f.settle = (velocity = 0) => {
    f.spring.value = f.y;
    return f.spring.to(0, { ...RETURN, velocity });
  };

  useLayoutEffect(() => {
    frames.set(sheet.id, f);
    const h = f.height();
    f.spring.set(h);
    f.spring.to(0, PRESENT);
    return () => frames.delete(sheet.id);
  }, []);

  useEffect(() => {
    let base = 0;
    return attachDrag(card.current, {
      axis: 'y',
      preClaim: (dx, dy, e) => dy > 0 && !scrolledAbove(e.target, card.current),
      claim: (dx, dy, e) => dy > 0 && !scrolledAbove(e.target, card.current) && !e.target.closest('[data-nodrag]'),
      start: () => { base = f.spring.running ? f.spring.stop() : f.y; },
      move: (dx, dy) => {
        const v = base + dy;
        apply(v < 0 ? rubberband(v, f.height(), 0.3) : v);
      },
      end: ({ vy, cancelled }) => {
        const h = f.height();
        const projected = f.y + project(vy);
        const wantsClose = !cancelled && (vy > 700 || (vy > -300 && projected > h * 0.45));
        if (wantsClose) requestClose(sheet.id, vy);
        else f.settle(vy);
      },
    });
  }, []);

  const ctx = {
    id: sheet.id,
    close: (opts) => dismiss(sheet.id, opts),
    setDirty: (v) => setSheetDirty(sheet.id, v),
  };

  return (
    <div class={'sheet-layer' + (page ? ' is-page' : ' is-fit')} style={{ zIndex: 100 + index * 2 }}>
      <div class="sheet-scrim" ref={scrim} onClick={() => requestClose(sheet.id, 0)} />
      <div class="sheet-card" ref={card} role="dialog" aria-modal="true" aria-label={sheet.params.label || undefined}>
        <div class="sheet-grabber" aria-hidden="true" />
        <SheetCtx.Provider value={ctx}>{View ? <View {...sheet.params} /> : null}</SheetCtx.Provider>
      </div>
    </div>
  );
}

/** Close a sheet, asking first when it holds unsaved changes. */
async function requestClose(id, velocity = 0, force = false) {
  const s = nav.sheets.find((x) => x.id === id);
  const f = frames.get(id);
  if (!s) return;
  if (!f) return removeSheet(id);
  if (s.dirty && !force) {
    f.settle(velocity);
    const v = await actionSheet({
      message: 'You have changes that aren’t saved.',
      actions: [{ label: 'Discard Changes', destructive: true, value: 'discard' }],
      cancel: 'Keep Editing',
    });
    if (v === 'discard') requestClose(id, 0, true);
    return;
  }
  f.close(velocity);
}

export function SheetHost({ shell }) {
  useNavState();
  useEffect(() => {
    shellEl = shell.current;
    nav.sheetHandler = { dismiss: (id, opts = {}) => requestClose(id, opts.velocity || 0, !!opts.force) };
    return () => { nav.sheetHandler = null; };
  }, []);
  useEffect(() => { updateBackdrop(); });
  return (
    <div class="sheet-host">
      {nav.sheets.map((s, i) => <SheetFrame key={s.id} sheet={s} index={i} />)}
    </div>
  );
}
