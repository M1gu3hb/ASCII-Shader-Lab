import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Deck, copyLink, dice, favorite } from './Deck';
import { Panel } from './Panel';
import { ShareSheet } from './ShareSheet';
import { Stage } from './Stage';
import { TopBar, toggleFullscreen } from './TopBar';
import { SPACES } from '../random/spaces';
import { back, forward, redo, setPlaying, setSpace, setUI, undo, useStudio, vary, type UIState } from './store';
import { useToasts } from './toast';
import { Welcome } from './guide/Welcome';
import { openWelcome, useGuide } from './guide/state';
import { loadComponents, loadExportSheet, loadSheets, warmCodeExporter } from './lazy';
import './css/perf.css';

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
  const guide = useGuide(s => (s.path ? `guide-on guide-${s.path}-${s.step}` : ''));
  useKeys();
  const comps = space === 'componentes';
  return (
    <div className={'app' + (panel && !comps ? '' : ' panel-off') + (hideUI ? ' ui-off' : '') + (guide ? ' ' + guide : '')}>
      <TopBar />
      <main className="stage-wrap" aria-label="Escenario">
        {comps ? <Suspense fallback={<Wait label="Cargando las piezas…" />}><ComponentsSpace /></Suspense> : <Stage />}
      </main>
      {!comps && <Panel />}
      {!comps && <Deck />}
      <OnDemand sheet="export" label="Cargando la exportación…" onFirstOpen={warmCodeExporter}><ExportSheet /></OnDemand>
      <OnDemand sheet="collection" label="Cargando la colección…"><CollectionSheet /></OnDemand>
      <OnDemand sheet="explore" label="Cargando el explorador…"><ExploreSheet /></OnDemand>
      <OnDemand sheet="shortcuts" label="Cargando los atajos…"><ShortcutsSheet /></OnDemand>
      <OnDemand sheet="seed" label="Cargando…"><SeedSheet /></OnDemand>
      <ShareSheet />
      <Welcome />
      <Toasts />
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
  return wanted ? <Suspense fallback={open ? <Wait label={label} /> : null}>{children}</Suspense> : null;
}

/** What shows while an on-demand part arrives (only on a first open before the idle prefetch finished). */
function Wait({ label }: { label: string }) {
  return <p className="lazy-wait" role="status">{label}</p>;
}

function Toasts() {
  const list = useToasts(s => s.list);
  const live = useToasts(s => s.live);
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className="toast">{t.msg}{t.action && <button type="button" onClick={t.action.run}>{t.action.label}</button>}</div>
        ))}
      </div>
      <div className="sr-only" aria-live="polite">{live}</div>
    </>
  );
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
      if (k === 'Escape') { if (s.ui.hideUI) setUI({ hideUI: false }); return; }
      if (comps) return;
      switch (k) {
        case 'r': case 'R': dice(); break;
        case 'ArrowRight': if (t.closest('input[type=range]')) return; e.preventDefault(); forward(); break;
        case 'ArrowLeft': if (t.closest('input[type=range]')) return; e.preventDefault(); back(); break;
        case 'v': case 'V': vary(); break;
        case 'x': case 'X': setUI({ sheet: 'explore' }); break;
        case 's': case 'S': favorite(); break;
        case 'e': case 'E': setUI({ sheet: 'export' }); break;
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
