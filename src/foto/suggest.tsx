/**
 * The discreet «Quitar fondo» recommendation: src/cutout's suggestCutout (model-free, never downloads
 * anything) on the project's photo, shown at most once per photo (remembered in this browser), dismissible,
 * and gone by itself after a while (the same action is always in the tools). It is one of the studio's
 * notices (App.tsx Notices): on phones only one notice shows at a time, in one line.
 */
import { useEffect } from 'react';
import { useProject } from '../project/store';
import { viewCompositor } from './scheduler';
import { setUI, ui } from './ui';

const KEY = 'glyphos.foto.sugerencias';
/** How long the recommendation stays when nobody touches it (ms). */
export const HINT_MS = 16_000;

function seen(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
function remember(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([...seen().filter(x => x !== id), id].slice(-200))); } catch { /* storage unavailable: once per session */ }
}

let hideT = 0;
let held = false;
/** Keeps the recommendation while it is hovered or focused. */
export function holdHint(on: boolean) {
  held = on;
  if (!on && ui().hint) armHide();
}
function armHide() {
  clearTimeout(hideT);
  hideT = window.setTimeout(() => { if (held) armHide(); else setUI({ hint: null }); }, HINT_MS);
}
export function dismissHint() { clearTimeout(hideT); held = false; setUI({ hint: null }); }

/** Watches the project's photo and offers the recommendation once (call in the editor). */
export function useSuggestion(): void {
  const project = useProject(s => s.project);
  const src = project?.sources.find(s => s.kind === 'image' && s.media[0]?.id);
  const mid = src?.media[0]?.id;
  useEffect(() => {
    dismissHint();
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
        setUI({ hint: { id: mid, text: s.text } });
        armHide();
      } catch { /* the hint is optional */ }
    }, 1800);
    return () => { gone = true; clearTimeout(t); };
  }, [mid]);
}
