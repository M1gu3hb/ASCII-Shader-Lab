import { useEffect } from 'react';
import { ComponentsSpace } from './ComponentsSpace';
import { Deck, copyLink, dice, favorite } from './Deck';
import { ExportSheet } from './ExportSheet';
import { Panel } from './Panel';
import { CollectionSheet, ExploreSheet, SeedSheet, ShortcutsSheet } from './Sheets';
import { Stage } from './Stage';
import { TopBar, toggleFullscreen } from './TopBar';
import { SPACES } from '../random/spaces';
import { back, forward, redo, setPlaying, setSpace, setUI, undo, useStudio, vary } from './store';
import { useToasts } from './toast';

export function App() {
  const space = useStudio(s => s.space);
  const panel = useStudio(s => s.ui.panel);
  const hideUI = useStudio(s => s.ui.hideUI);
  useKeys();
  const comps = space === 'componentes';
  return (
    <div className={'app' + (panel && !comps ? '' : ' panel-off') + (hideUI ? ' ui-off' : '')}>
      <TopBar />
      <main className="stage-wrap" aria-label="Escenario">
        {comps ? <ComponentsSpace /> : <Stage />}
      </main>
      {!comps && <Panel />}
      {!comps && <Deck />}
      <ExportSheet />
      <CollectionSheet />
      <ExploreSheet />
      <ShortcutsSheet />
      <SeedSheet />
      <Toasts />
      {hideUI && <button type="button" className="sr-only" onClick={() => setUI({ hideUI: false })}>Mostrar la interfaz</button>}
    </div>
  );
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
      if (s.ui.sheet !== 'none') return;
      if (s.ui.hideUI && e.key !== 'h' && e.key !== 'H' && e.key !== 'Escape') { setUI({ hideUI: false }); return; }
      const comps = s.space === 'componentes';
      const k = e.key;
      if (k >= '1' && k <= '6') { setSpace(SPACES[+k - 1].id); return; }
      if (k === '?') { setUI({ sheet: 'shortcuts' }); return; }
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
