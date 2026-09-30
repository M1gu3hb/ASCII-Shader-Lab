import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { fontById } from '../engine/catalog';
import type { Recipe } from '../engine/recipe';
import { spaceById } from '../random/spaces';
import { TABS, TabContent } from './panels';
import { setUI, useRecipe, useStudio } from './store';
import { IClose, IPanelOff, SPACE_ICON, TAB_ICON } from './icons';
import { RecipeBrowser, RecipesLine, setBrowserOpen, useRecipesUI } from './recipes';
import { SPACE_LOOK, groupLook, lookVars } from './ui/sections';
import { exitGuide, useGuide } from './guide/state';
import { LoadBoundary } from './Boundary';
import { loadGuide } from './lazy';
import { ScrollRow } from './ui/ScrollRow';
import { HintBubble } from './ui/Help';
import { useScramble, useSwap } from './motion/hooks';
import { swap } from './motion/swap';
import { LAND_Q, useMatch, usePhone } from './ui/useMatch';
import { SNAP_NAME, cycle, setSnap, settle, snapHeights, step, useSheet, type Snap } from './ui/sheetSnap';
import { useImmersive } from './ui/Immersive';

// the guided paths load when one starts (the welcome itself is in the main bundle)
const Guide = lazy(() => loadGuide().then(m => ({ default: m.Guide })));

/**
 * The settings panel, an instrument in four parts: the space (its name, what it is for, and a way to put
 * the column away), its recipe (a line that names the recipe of the piece and opens every recipe of the space: recipes/),
 * the groups of settings (each with its icon, its own colour and name; all in view), and the group's
 * controls in modules, under a line that says what the group is for. A guided path takes its place while
 * it lasts. Content that changes here resolves out of glyphs: a group lightly, a new space more fully
 * (motion/swap.ts).
 *
 * Phones and tablets held upright: a sheet above the dock (Deck.tsx) with a handle and three rests
 * (ui/sheetSnap.ts): «peek» shows the recipe line and the groups, «half» leaves the upper part of the
 * screen to the piece, «full» the controls. Every group is in view at once (one tap). Phones on their
 * side: a column on the right, beside the piece.
 */
export function Panel() {
  const space = useStudio(s => s.space);
  const tabSel = useStudio(s => s.ui.tab[s.space]);
  const shown = useStudio(s => s.ui.panel);
  const recipe = useRecipe();
  const phone = usePhone();
  const land = useMatch(LAND_Q);
  // the bottom sheet with rests (phones and tablets held upright)
  const sheet = phone && !land;
  const snap = useSheet(s => s.snap);
  const imm = useImmersive(s => s.on);
  // the recipe browser takes the settings' place while it is open (recipes/Browser.tsx)
  const recipesView = useRecipesUI(s => s.open);
  const tabs = TABS[space];
  const tab = tabs.find(t => t[0] === tabSel)?.[0] ?? tabs[0]?.[0];
  const guiding = useGuide(s => s.path !== null);
  // a guided path takes the column: the recipes it showed close (the settings come back after it)
  useEffect(() => { if (guiding) setBrowserOpen(false); }, [guiding]);
  const aside = useRef<HTMLElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const eyebrow = useScramble<HTMLSpanElement>(spaceById(space).name, { duration: 300 });
  useEffect(() => { pane.current?.scrollTo(0, 0); }, [tab, space]);
  // a new group: the pane lightly; a new space: the whole panel
  useSwap(pane, `${space}|${tab}`, (a, b) => (a.split('|')[0] !== b.split('|')[0] ? null : 'tab'));
  useSwap(aside, space, 'space');
  // the guide takes the settings' place (or gives it back); the panel appears
  useSwap(aside, guiding, 'panel');
  const wasShown = useRef(shown);
  useLayoutEffect(() => {
    // (phones: the sheet slides up from the dock, at half height; that is its motion)
    if (shown && !wasShown.current) {
      if (!matchMedia('(max-width: 900px)').matches) swap(aside.current, 'panel');
      else setSnap('half');
    }
    // closed with the focus inside (Escape, «Cerrar ajustes», the handle): it goes to the button that opens it
    if (!shown && wasShown.current && aside.current?.contains(document.activeElement)) {
      (document.querySelector<HTMLElement>('.imm-bar .imm-act[aria-pressed]') ?? document.querySelector<HTMLElement>('.ph-tools, .panel-btn'))?.focus();
    }
    // the settings put away: the recipes they showed too (they open again on the settings)
    if (!shown) setBrowserOpen(false);
    wasShown.current = shown;
  }, [shown]);
  useChoiceSwaps(pane);
  const heights = useSheetHeights(aside, head, sheet && !guiding, `${space}|${imm}|${tabs.length}|${recipesView}`);
  const drag = useSheetDrag(aside, heights);
  // a guided path takes the place of the settings while it lasts
  if (guiding) {
    return (
      <aside className="panel guide-panel" aria-labelledby="guide-title" ref={aside}>
        <LoadBoundary where="la guía" onClose={() => exitGuide('close')}><Suspense fallback={null}><Guide /></Suspense></LoadBoundary>
        <HintBubble />
      </aside>
    );
  }
  if (!tabs.length) return null;
  const setTab = (id: string) => {
    setUI({ tab: { ...useStudio.getState().ui.tab, [space]: id } });
    setBrowserOpen(false);
    // at the peek, choosing a section opens its controls
    if (sheet && useSheet.getState().snap === 'peek') setSnap('half');
  };
  const tabButtons = tabs.map(([id, name]) => (
    <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={!recipesView && tab === id} aria-controls="pane" className={'tab tab-' + id}
      style={lookVars(groupLook(id, space).accent) as CSSProperties} onClick={() => setTab(id)}>
      <GroupIcon id={id} recipe={recipe} /><span className="tab-name">{name}</span>
    </button>
  ));
  const peek = sheet && snap === 'peek';
  const look = tab ? groupLook(tab, space) : null;
  const SpaceIc = SPACE_ICON[space];
  // phones: the groups in rows of up to four (tablets upright: all in one row, css/layout.css)
  const cols = phone ? Math.min(4, Math.ceil(tabs.length / 2)) : tabs.length <= 4 ? tabs.length : Math.ceil(tabs.length / 2);
  return (
    <aside className={'panel' + (phone ? ' ph-sheet' : '') + (recipesView ? ' rx-open' : '')} aria-label="Ajustes de la pieza" ref={aside} data-snap={sheet ? snap : undefined}
      style={{ ...(sheet && heights ? { height: heights[snap] } : {}), '--sp-acc': SPACE_LOOK[space].accent } as CSSProperties}>
      {phone ? (
        <div className="ph-head" ref={head}>
          <div className="ph-grab-row">
            <RecipesLine compact />
            <button type="button" className="sheet-grab" {...drag.handlers} onClick={drag.onClick} onKeyDown={drag.onKeyDown}
              aria-label={`Tamaño de los ajustes: ${SNAP_NAME[snap]}`} title="Arrastra para cambiar el tamaño, o pulsa para alternarlo (↑ ↓)">
              <i aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn ph-close" aria-label="Cerrar ajustes" title="Cerrar ajustes (Esc)" onClick={() => setUI({ panel: false })}><IClose /></button>
          </div>
          {/* every group in view: one tap, never hidden past the edge (the recipes take their place while open) */}
          {!recipesView && (
            <ScrollRow role="tablist" aria-label="Secciones" className="ptabs ph-tabs" boxClassName="ptabs-box"
              style={{ '--cols': cols, '--n': tabs.length } as CSSProperties}>
              {tabButtons}
            </ScrollRow>
          )}
        </div>
      ) : (
        <>
          <div className="panel-head">
            <div className="panel-title">
              <SpaceIc className="pt-ic" />
              <p className="eyebrow"><span className="pt-name" ref={eyebrow}>{spaceById(space).name}</span><span className="pt-line">{SPACE_LOOK[space].line}</span></p>
              <button type="button" className="icon-btn panel-hide" aria-label="Ocultar ajustes" title="Ocultar los ajustes: la pieza a lo ancho (vuelven con el botón de ajustes de la barra)"
                onClick={() => setUI({ panel: false })}><IPanelOff /></button>
            </div>
            <RecipesLine />
          </div>
          {!recipesView && (
            <ScrollRow role="tablist" aria-label="Secciones" className="ptabs" boxClassName="ptabs-box"
              style={{ '--cols': cols } as CSSProperties}>
              {tabButtons}
            </ScrollRow>
          )}
        </>
      )}
      {recipesView && <RecipeBrowser where={phone ? 'sheet' : 'column'} away={peek} />}
      {/* at the peek the controls are out of sight: out of the focus order too */}
      <div className="pane" id="pane" role="tabpanel" aria-labelledby={'tab-' + tab} ref={pane} inert={peek || undefined} hidden={recipesView || undefined}>
        {tab && look && (
          <div className="pane-head" style={lookVars(look.accent) as CSSProperties}>
            <GroupIcon id={tab} recipe={recipe} />
            <div className="pane-say">
              <h2 className="pane-t">{tabs.find(t => t[0] === tab)?.[1]}</h2>
              <p className="pane-line">{look.line}</p>
            </div>
          </div>
        )}
        {tab && <TabContent tab={tab} space={space} />}
      </div>
      <HintBubble />
    </aside>
  );
}

/**
 * A group's picture: its icon, except where the piece itself says it better: Color shows the piece's
 * palette as a strip, Glifos a few of its characters in its own font (they change with the piece).
 */
function GroupIcon({ id, recipe }: { id: string; recipe?: Recipe }) {
  if (id === 'color' && recipe) {
    const stops = recipe.color.stops.slice(0, 5);
    return (
      <span className="tab-ic tab-sw" aria-hidden="true">
        {stops.map((c, i) => <i key={i} style={{ background: c }} />)}
      </span>
    );
  }
  if (id === 'glifos' && recipe) {
    const solid = [...new Set([...recipe.glyph.charset])].filter(c => c.trim());
    const pick = solid.length ? [solid[Math.floor((solid.length - 1) * 0.5)], solid[Math.floor((solid.length - 1) * 0.78)], solid[solid.length - 1]] : ['#'];
    return <span className="tab-ic tab-gl" aria-hidden="true" style={{ fontFamily: fontById(recipe.glyph.font).stack }}>{pick.join('')}</span>;
  }
  const Ic = TAB_ICON[id];
  return Ic ? <Ic className="tab-ic" /> : null;
}


/**
 * Choices that unfold other controls under them (what becomes characters, how glyphs are chosen):
 * when the person changes one, what it unfolds resolves in. Not when the dice change it.
 */
function useChoiceSwaps(pane: React.RefObject<HTMLElement | null>) {
  const sig = useStudio(s => {
    const r = s.entries[s.cursor]?.recipe;
    return r ? `${r.source}|${r.glyph.mode}|${r.msg.on}|${r.interact.mode === 'none'}` : '';
  });
  const kind = useStudio(s => s.change.kind);
  useSwap(pane, sig, () => (kind === 'edit' ? 'choice' : null));
}

/**
 * The heights of the sheet's rests: the room between the dock (the sheet's own CSS bottom) and the top
 * bar, and the height of its handle with the sections (the peek). Measured again when the window, the
 * dock or the sections change.
 */
function useSheetHeights(aside: RefObject<HTMLElement | null>, head: RefObject<HTMLElement | null>, on: boolean, key: string) {
  const [m, setM] = useState<{ room: number; peek: number } | null>(null);
  useLayoutEffect(() => {
    const el = aside.current, hd = head.current;
    const app = el?.closest<HTMLElement>('.app');
    if (!on || !el || !hd || !app) return;
    const measure = () => {
      const bottom = parseFloat(getComputedStyle(el).bottom) || 0;
      const bar = app.querySelector<HTMLElement>('.topbar');
      const top = bar && bar.offsetHeight && getComputedStyle(bar).visibility !== 'hidden' ? bar.offsetTop + bar.offsetHeight : 0;
      const room = Math.max(0, app.clientHeight - bottom - top - 8);
      const peek = hd.offsetHeight + 2;
      setM(p => (p && p.room === room && p.peek === peek ? p : { room, peek }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(app);
    ro.observe(hd);
    const dock = app.querySelector('.ph-dock');
    if (dock) ro.observe(dock);
    return () => ro.disconnect();
  }, [aside, head, on, key]);
  // tablets upright (a sheet 600 px wide or more): two columns of controls, so the half rest leaves more to the piece
  const wide = useMatch('(min-width: 600px)');
  return useMemo(() => (on && m ? snapHeights(m.room, m.peek, wide ? 0.46 : 0.54) : null), [on, m, wide]);
}

/**
 * Phones: the sheet's handle. Dragging it resizes the sheet with the finger and, let go, it rests at the
 * nearest height (a flick goes one step its way; down past the peek it closes). A press cycles the rests
 * and ↑ ↓ step through them, so a keyboard or a screen reader reaches every one («Cerrar ajustes» closes).
 */
function useSheetDrag(aside: RefObject<HTMLElement | null>, heights: Record<Snap, number> | null) {
  const st = useRef<{ y: number; h: number; id: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const rest = (to: Snap | 'closed') => {
    const el = aside.current;
    if (to === 'closed') {
      // it slides away from the rest it had
      if (el && heights) el.style.height = heights[useSheet.getState().snap] + 'px';
      setUI({ panel: false });
      return;
    }
    if (el && heights) el.style.height = heights[to] + 'px';
    setSnap(to);
  };
  const end = (e: PointerEvent, cancel: boolean) => {
    const s = st.current, el = aside.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (!s.moved || !el || !heights) return;
    dragged.current = true;
    el.style.transition = '';
    useSheet.setState({ dragging: false });
    const dy = e.clientY - s.y;
    const h = Math.max(0, Math.min(heights.full, s.h - dy));
    // a finger that rested before letting go does not flick
    const v = performance.now() - s.lastT > 90 ? 0 : s.v;
    rest(cancel ? useSheet.getState().snap : settle(h, dy, v, heights));
  };
  return {
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        dragged.current = false;
        if (e.button !== 0 || !heights || !aside.current) return;
        // no text selection: dragging a selection would scroll the sheet's contents instead
        e.preventDefault();
        const now = performance.now();
        st.current = { y: e.clientY, h: aside.current.offsetHeight, id: e.pointerId, lastY: e.clientY, lastT: now, v: 0, moved: false };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: PointerEvent) => {
        const s = st.current, el = aside.current;
        if (!s || s.id !== e.pointerId || !el || !heights) return;
        const dy = e.clientY - s.y;
        if (!s.moved && Math.abs(dy) < 4) return;
        if (!s.moved) { s.moved = true; useSheet.setState({ dragging: true }); el.style.transition = 'none'; }
        const now = performance.now();
        s.v = 0.7 * ((e.clientY - s.lastY) / Math.max(1, now - s.lastT)) + 0.3 * s.v;
        s.lastY = e.clientY; s.lastT = now;
        el.style.height = Math.max(0, Math.min(heights.full, s.h - dy)) + 'px';
      },
      onPointerUp: (e: PointerEvent) => end(e, false),
      onPointerCancel: (e: PointerEvent) => end(e, true),
    },
    onClick: () => {
      // the click that ends a drag is not a press
      if (dragged.current) { dragged.current = false; return; }
      rest(cycle(useSheet.getState().snap));
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      rest(step(useSheet.getState().snap, e.key === 'ArrowUp' ? 1 : -1));
    },
  };
}
