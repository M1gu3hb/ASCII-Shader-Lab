import { Suspense, lazy, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { spaceById } from '../random/spaces';
import { TABS, TabContent } from './panels';
import { presetsFor } from './presets';
import { applyRecipe, currentRecipe, setUI, useStudio } from './store';
import { IClose } from './icons';
import { exitGuide, useGuide } from './guide/state';
import { LoadBoundary } from './Boundary';
import { loadGuide } from './lazy';
import { ScrollRow } from './ui/ScrollRow';
import { HintBubble } from './ui/Help';

// the guided paths load when one starts (the welcome itself is in the main bundle)
const Guide = lazy(() => loadGuide().then(m => ({ default: m.Guide })));

export function Panel() {
  const space = useStudio(s => s.space);
  const tabSel = useStudio(s => s.ui.tab[s.space]);
  const entry = useStudio(s => s.entries[s.cursor]);
  const tabs = TABS[space];
  const tab = tabs.find(t => t[0] === tabSel)?.[0] ?? tabs[0]?.[0];
  const presets = presetsFor(space);
  // each recipe's colours, as a small swatch on its chip (the recipes' own palettes, not the current piece's)
  const swatches = useMemo(() => presetsFor(space).map(p => {
    const r = p.make();
    const stops = r.color.stops;
    return `linear-gradient(135deg, ${r.color.bg} 0 42%, ${stops[Math.floor(stops.length / 2)] ?? r.color.bg} 42% 70%, ${stops[stops.length - 1] ?? r.color.bg} 70%)`;
  }), [space]);
  const guiding = useGuide(s => s.path !== null);
  useEffect(() => { document.querySelector('.pane')?.scrollTo(0, 0); }, [tab, space]);
  const drag = useDragToClose();
  // a guided path takes the place of the settings while it lasts
  if (guiding) {
    return (
      <aside className="panel guide-panel" aria-labelledby="guide-title">
        <LoadBoundary where="la guía" onClose={() => exitGuide('close')}><Suspense fallback={null}><Guide /></Suspense></LoadBoundary>
        <HintBubble />
      </aside>
    );
  }
  if (!tabs.length) return null;
  const setTab = (id: string) => setUI({ tab: { ...useStudio.getState().ui.tab, [space]: id } });
  return (
    <aside className="panel" aria-label="Ajustes de la pieza" ref={drag.ref}>
      <div className="sheet-grab" aria-hidden="true" {...drag.handlers}><i /></div>
      <div className="panel-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="eyebrow">Recetas · {spaceById(space).name}</p>
          <button type="button" className="icon-btn mobile-only" aria-label="Cerrar ajustes" onClick={() => setUI({ panel: false })}><IClose /></button>
        </div>
        {/* wide screens: the recipes wrap and the sections form a grid; phones: rows that scroll and say so */}
        <ScrollRow className="recipes" aria-label="Recetas listas" more="más">
          {presets.map((p, i) => (
            <button key={p.id} type="button" className="chip"
              aria-pressed={!!entry && entry.label === p.name && !entry.edited && ['espacio', 'receta', 'inicio'].includes(entry.kind)}
              onClick={() => applyRecipe(p.make(currentRecipe()), 'receta', p.name)}>
              <span className="chip-sw" aria-hidden="true" style={{ background: swatches[i] }} />{p.name}
            </button>
          ))}
        </ScrollRow>
      </div>
      <ScrollRow role="tablist" aria-label="Secciones" className="ptabs" boxClassName="ptabs-box"
        style={{ '--cols': tabs.length <= 4 ? tabs.length : Math.ceil(tabs.length / 2) } as CSSProperties}>
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={tab === id} aria-controls="pane" className="tab" onClick={() => setTab(id)}>{name}</button>
        ))}
      </ScrollRow>
      <div className="pane" id="pane" role="tabpanel" aria-labelledby={'tab-' + tab}>
        {tab && <TabContent tab={tab} space={space} />}
      </div>
      <HintBubble />
    </aside>
  );
}

/**
 * Phones: the settings sheet has a handle at its top; dragging it down far enough closes the sheet
 * («Cerrar ajustes» does the same for keyboards and screen readers).
 */
function useDragToClose() {
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const move = (dy: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = dy ? 'none' : '';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const end = (e: React.PointerEvent, cancel = false) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dy = Math.max(0, e.clientY - s.y);
    const fast = dy > 30 && dy / Math.max(1, performance.now() - s.t) > 0.6;
    move(0);
    if (!cancel && (dy > 90 || fast)) setUI({ panel: false });
  };
  return {
    ref,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        // no text selection: dragging a selection would scroll the sheet's contents instead
        e.preventDefault();
        start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && s.id === e.pointerId) move(Math.max(0, e.clientY - s.y));
      },
      onPointerUp: (e: React.PointerEvent) => end(e),
      onPointerCancel: (e: React.PointerEvent) => end(e, true),
    },
  };
}
