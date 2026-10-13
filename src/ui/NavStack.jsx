import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { nav, screens, ScreenCtx, commitPop, useNavState } from './nav.js';
import { Spring, project, rubberband } from './motion.js';
import { attachDrag, insideHorizontalControl } from './gesture.js';

const NAV_SPRING = { response: 0.42, damping: 1 };

/**
 * A navigation stack. The top screen slides over the one below it (which drifts left by 30% and dims),
 * and can be dragged back to the right at any point, including mid-animation.
 */
export function NavStack({ tab, active }) {
  useNavState();
  const routes = nav.stacks[tab];
  const host = useRef(null);
  const els = useRef(new Map());
  const prev = useRef(routes.map((r) => r.key));
  const x = useRef(0);
  const transitioning = useRef(false);
  const spring = useRef(null);

  const width = () => host.current?.clientWidth || window.innerWidth;

  function layout(v) {
    x.current = v;
    const list = nav.stacks[tab];
    const n = list.length;
    const w = width();
    const p = Math.min(1, Math.max(0, v / w));
    const top = els.current.get(list[n - 1]?.key);
    const under = els.current.get(list[n - 2]?.key);
    if (top) top.style.transform = v ? `translate3d(${v}px,0,0)` : '';
    if (under) {
      const moving = v > 0.5 || transitioning.current;
      under.style.visibility = moving ? 'visible' : '';
      under.style.transform = moving ? `translate3d(${-0.3 * w * (1 - p)}px,0,0)` : '';
      const dim = under.lastElementChild;
      if (dim) dim.style.opacity = moving ? String(1 - p) : '0';
    }
  }

  if (!spring.current) spring.current = new Spring({ ...NAV_SPRING, onUpdate: (v) => layout(v) });

  async function animateTo(target, velocity, until) {
    transitioning.current = true;
    spring.current.value = x.current;
    const done = await spring.current.to(target, { ...NAV_SPRING, velocity, until });
    if (done) transitioning.current = false;
    return done;
  }

  async function animatePop(velocity = 0) {
    const w = width();
    const done = await animateTo(w, velocity, (v) => v >= w - 0.5);
    if (!done) return;
    commitPop(tab);
  }

  useEffect(() => {
    nav.stackHandlers[tab] = { animatePop: () => animatePop(0) };
    return () => { delete nav.stackHandlers[tab]; };
  }, []);

  // Push: slide the new screen in from the right edge.
  useLayoutEffect(() => {
    const keys = routes.map((r) => r.key);
    const before = prev.current;
    if (keys.length === before.length && keys.every((k, i) => k === before[i])) return;
    prev.current = keys;
    if (keys.length > before.length && before.every((k, i) => keys[i] === k) && active) {
      x.current = width();
      transitioning.current = true;
      layout(x.current);
      animateTo(0, 0).then((done) => done && layout(0));
    } else {
      transitioning.current = false;
      spring.current.set(0);
      // Anything left over from an interrupted transition goes back to rest.
      for (const el of els.current.values()) {
        el.style.transform = '';
        el.style.visibility = '';
        if (el.lastElementChild) el.lastElementChild.style.opacity = '0';
      }
    }
  });

  // Interactive pop: drag right anywhere on a pushed screen.
  useEffect(() => {
    let base = 0;
    return attachDrag(host.current, {
      axis: 'x',
      claim: (dx, dy, e) => dx > 0 && nav.stacks[tab].length > 1 && !nav.sheets.length && !insideHorizontalControl(e.target),
      start: () => {
        transitioning.current = true;
        base = spring.current.running ? spring.current.stop() : x.current;
      },
      move: (dx) => {
        const v = base + dx;
        layout(v < 0 ? rubberband(v, width()) : v);
      },
      end: ({ vx, cancelled }) => {
        const w = width();
        const projected = x.current + project(vx);
        const commit = !cancelled && (vx > 400 || (vx > -400 && projected > w / 2));
        if (commit) animatePop(vx);
        else animateTo(0, vx).then((done) => { if (done) { transitioning.current = false; layout(0); } });
      },
    });
  }, []);

  return (
    <div class={'navstack' + (active ? '' : ' is-inactive')} ref={host} inert={active ? undefined : true}>
      {routes.map((r, i) => {
        const Comp = screens[r.name];
        const depth = routes.length - 1 - i;
        return (
          <div
            key={r.key}
            class="screen-host"
            data-depth={depth > 1 ? 2 : depth}
            inert={depth ? true : undefined}
            ref={(el) => (el ? els.current.set(r.key, el) : els.current.delete(r.key))}
          >
            <ScreenCtx.Provider value={{ route: r, tab, index: i, isTop: depth === 0 }}>
              {Comp ? <Comp {...r.params} /> : null}
            </ScreenCtx.Provider>
            <div class="screen-dim" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
