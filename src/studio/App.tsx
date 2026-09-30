import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Deck, copyLink, dice, favorite, usePhoneDock } from './Deck';
import { ImmersiveBar, setImmersive, toggleImmersive, useImmersive } from './ui/Immersive';
import { useSheet } from './ui/sheetSnap';
import { isPhone } from './ui/useMatch';
import { IDice, INext, IPrev, ITune } from './icons';
import { Panel } from './Panel';
import { ShareSheet } from './ShareSheet';
import { Stage } from './Stage';
import { TopBar, toggleFullscreen } from './TopBar';
import { SPACES } from '../random/spaces';
import { back, forward, redo, setPlaying, setSpace, setUI, undo, useStudio, vary, type UIState } from './store';
import { Welcome } from './guide/Welcome';
import { TabAway } from './Keeping';
import { openWelcome, useGuide } from './guide/state';
import { loadComponents, loadExportSheet, loadSheets, warmCodeExporter } from './lazy';
import { LoadBoundary } from './Boundary';
import { LiveLine, Toasts } from './Notices';
import { syncMotionAttr } from './motion/level';
import { playIntro } from './motion/intro';
import { useSwap } from './motion/hooks';
import './css/perf.css';
// the studio's look, last: it refines what the parts' own stylesheets set
import './css/loom.css';
// phones (and «inmersivo» everywhere): after the look, which it adapts
import './css/phone.css';

syncMotionAttr();

// not needed for the first piece: loaded when first opened (and prefetched once the studio is idle, see lazy.ts)
const ExportSheet = lazy(() => loadExportSheet().then(m => ({ default: m.ExportSheet })));
const CollectionSheet = lazy(() => loadSheets().then(m => ({ default: m.CollectionSheet })));
const ExploreSheet = lazy(() => loadSheets().then(m => ({ default: m.ExploreSheet })));
const ShortcutsSheet = lazy(() => loadSheets().then(m => ({ default: m.ShortcutsSheet })));
const SeedSheet = lazy(() => loadSheets().then(m => ({ default: m.SeedSheet })));
const ComponentsSpace = lazy(() => loadComponents().then(m => ({ default: m.ComponentsSpace })));

export function App() {
  const space = useStudio(s => s.space);
  const panel = useStudio(s => s.ui.panel);
  const hideUI = useStudio(s => s.ui.hideUI);
  const cursor = useStudio(s => s.cursor);
  const guide = useGuide(s => (s.path ? `guide-on guide-${s.path}-${s.step}` : ''));
  const imm = useImmersive(s => s.on);
  const strip = usePhoneDock(s => s.strip);
  const snap = useSheet(s => s.snap);
  useKeys();
  useIntro();
  const comps = space === 'componentes';
  const immersive = imm && !comps && !guide;
  useImmersivePanel(immersive);
  // the stage and the components gallery give way to each other: a richer swap than a tab
  const main = useRef<HTMLElement>(null);
  useSwap(main, comps, 'space');
  const cls = [
    'app', panel && !comps ? '' : 'panel-off', hideUI ? 'ui-off' : '', guide, immersive ? 'imm-on' : '', strip ? 'ph-strip-on' : '', 'snap-' + snap,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {/* the studio's one main heading (Piezas has a visible one of its own) */}
      {!comps && <h1 className="sr-only">GLYPHOS, estudio de arte ASCII</h1>}
      <TopBar />
      <main className="stage-wrap" aria-label="Escenario" ref={main}>
        {comps
          ? <LoadBoundary where="el espacio de piezas"><Suspense fallback={<Wait label="Cargando las piezas…" />}><ComponentsSpace /></Suspense></LoadBoundary>
          : <Stage />}
      </main>
      <Toasts />
      {!comps && <Panel />}
      {!comps && <Deck />}
      <ImmersiveBar active={immersive} actions={[
        { id: 'prev', label: 'Resultado anterior', icon: <IPrev />, onClick: back, disabled: cursor <= 0, title: 'Anterior (←)' },
        { id: 'dice', label: 'Azar', icon: <IDice />, onClick: dice, main: true, showLabel: true, title: 'Nueva combinación al azar (R)' },
        { id: 'next', label: 'Resultado siguiente', icon: <INext />, onClick: forward, title: 'Siguiente (→)' },
        // the lab's word for its tools: the same button as in the dock
        { id: 'tools', label: 'Ajustes', icon: <ITune />, onClick: () => setUI({ panel: !panel }), pressed: panel, showLabel: true, title: 'Ajustes de la pieza' },
      ]} />
      <OnDemand sheet="export" label="Cargando la exportación…" onFirstOpen={warmCodeExporter}><ExportSheet /></OnDemand>
      <OnDemand sheet="collection" label="Cargando la colección…"><CollectionSheet /></OnDemand>
      <OnDemand sheet="explore" label="Cargando el explorador…"><ExploreSheet /></OnDemand>
      <OnDemand sheet="shortcuts" label="Cargando los atajos…"><ShortcutsSheet /></OnDemand>
      <OnDemand sheet="seed" label="Cargando…"><SeedSheet /></OnDemand>
      <ShareSheet />
      <Welcome />
      <TabAway />
      <LiveLine />
      {hideUI && <button type="button" className="sr-only" onClick={() => setUI({ hideUI: false })}>Mostrar la interfaz</button>}
    </div>
  );
}

/**
 * Mounts a sheet the first time it is asked for, then keeps it mounted, so its dialog opens, closes and
 * returns focus exactly as when it was part of the startup bundle.
 */
function OnDemand({ sheet, label, onFirstOpen, children }: { sheet: UIState['sheet']; label: string; onFirstOpen?: () => void; children: ReactNode }) {
  const open = useStudio(s => s.ui.sheet === sheet);
  const [wanted, setWanted] = useState(open);
  if (open && !wanted) setWanted(true);
  useEffect(() => { if (wanted) onFirstOpen?.(); }, [wanted, onFirstOpen]);
  if (!wanted) return null;
  // a part that cannot be fetched says so and closes; the rest of the studio stays
  return (
    <LoadBoundary hidden={!open} onClose={() => setUI({ sheet: 'none' })}>
      <Suspense fallback={open ? <Wait label={label} /> : null}>{children}</Suspense>
    </LoadBoundary>
  );
}

/**
 * Immersive: the settings step aside as it starts (they open again with «Ajustes» in its bar), and come
 * back as they were when it ends.
 */
function useImmersivePanel(on: boolean) {
  const before = useRef<boolean | null>(null);
  useEffect(() => {
    if (on) {
      before.current = useStudio.getState().ui.panel;
      if (before.current) setUI({ panel: false });
    } else if (before.current !== null) {
      if (before.current !== useStudio.getState().ui.panel) setUI({ panel: before.current });
      before.current = null;
    }
  }, [on]);
}

/** What shows while an on-demand part arrives (only on a first open before the idle prefetch finished). */
function Wait({ label }: { label: string }) {
  return <p className="lazy-wait mt-spin" role="status">{label}</p>;
}

/**
 * The opening (motion/intro.ts): once per browser session, as the studio first shows. On a first visit the
 * welcome dialog comes first: the interface forms when it closes.
 */
function useIntro() {
  useLayoutEffect(() => {
    if (!useGuide.getState().welcome) { playIntro(); return; }
    return useGuide.subscribe(g => { if (!g.welcome) playIntro(); });
  }, []);
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStudio.getState();
      const t = e.target as HTMLElement;
      const field = t.closest('input, textarea, select, [contenteditable="true"]') as HTMLInputElement | null;
      // sliders, switches and buttons don't take letters: let shortcuts through
      const typing = field && !['range', 'checkbox', 'radio', 'color', 'button'].includes(field.type);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) { if (!typing) { e.preventDefault(); redo(); } return; }
      if (mod || e.altKey || typing) return;
      if (s.ui.sheet !== 'none' || document.querySelector('dialog[open]')) return;
      if (s.ui.hideUI && e.key !== 'h' && e.key !== 'H' && e.key !== 'Escape') { setUI({ hideUI: false }); return; }
      const comps = s.space === 'componentes';
      const k = e.key;
      if (k >= '1' && k <= '6') { setSpace(SPACES[+k - 1].id); return; }
      if (k === '?') { setUI({ sheet: 'shortcuts' }); return; }
      if (k === 'g' || k === 'G') { openWelcome(); return; }
      if (k === 'Escape') {
        if (s.ui.hideUI) setUI({ hideUI: false });
        // phones: the settings sheet first, then the immersive mode
        else if (s.ui.panel && isPhone() && !comps) setUI({ panel: false });
        else if (useImmersive.getState().on) setImmersive(false);
        return;
      }
      if (comps) return;
      switch (k) {
        case 'i': case 'I': toggleImmersive(); break;
        // a new result from a slider that had the focus: the arrows go back to moving through the history
        // (left on the slider, the next ← would change the new piece and mark it «editado»)
        case 'r': case 'R': if (t.closest('input[type=range], [role=slider]')) (t as HTMLElement).blur(); dice(); break;
        case 'ArrowRight': if (t.closest('input[type=range], [role=slider]')) return; e.preventDefault(); forward(); break;
        case 'ArrowLeft': if (t.closest('input[type=range], [role=slider]')) return; e.preventDefault(); back(); break;
        case 'v': case 'V': if (t.closest('input[type=range], [role=slider]')) (t as HTMLElement).blur(); vary(); break;
        case 'x': case 'X': setUI({ sheet: 'explore' }); break;
        case 's': case 'S': void favorite(); break;
        case 'e': case 'E': setUI(isPhone() ? { panel: false, sheet: 'export' } : { sheet: 'export' }); break;
        case 'l': case 'L': void copyLink(); break;
        case 'h': case 'H': setUI({ hideUI: !s.ui.hideUI }); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case ' ': if (t.closest('button')) return; e.preventDefault(); setPlaying(!s.playing); break;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
