/**
 * The discreet «Quitar fondo» recommendation: src/cutout's suggestCutout (model-free, never downloads
 * anything) on the project's photo, shown at most once per photo (remembered in this browser) and
 * dismissible.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useProject } from '../project/store';
import { IClose } from '../studio/icons';
import { viewCompositor } from './scheduler';

const KEY = 'glyphos.foto.sugerencias';

function seen(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
function remember(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([...seen().filter(x => x !== id), id].slice(-200))); } catch { /* storage unavailable: once per session */ }
}

export function useSuggestion(open: () => void): ReactNode {
  const project = useProject(s => s.project);
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null);
  const src = project?.sources.find(s => s.kind === 'image' && s.media[0]?.id);
  const mid = src?.media[0]?.id;
  useEffect(() => {
    setHint(null);
    if (!src || !mid || seen().includes(mid)) return;
    let gone = false;
    const t = window.setTimeout(async () => {
      const prov = viewCompositor().provider;
      if (!(await prov.prepare(src, 0)) || gone) return;
      const img = prov.frame(src, 0);
      if (!img || gone) return;
      try {
        const { suggestCutout } = await import('../cutout/index');
        const s = suggestCutout(img);
        if (gone || !s.likely) return;
        remember(mid);
        setHint({ id: mid, text: s.text });
      } catch { /* the hint is optional */ }
    }, 1800);
    return () => { gone = true; clearTimeout(t); };
  }, [mid]);
  if (!hint) return null;
  return (
    <div className="fsuggest" role="status">
      <span>{hint.text}</span>
      <button type="button" className="mini" onClick={() => { setHint(null); open(); }}>Quitar fondo</button>
      <button type="button" className="fsg-x" aria-label="Descartar la sugerencia" onClick={() => setHint(null)}><IClose /></button>
    </div>
  );
}
