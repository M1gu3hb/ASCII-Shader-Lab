/**
 * Everything the extras show outside the start screen, the inspector and the top bar, mounted once by the
 * studio's App: their sheets (posters, saved settings, photo sequences, depth and parallax, words forming a
 * figure) loaded on demand, and the guides over the viewport for canvases of a known print or social size.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { GuidesOverlay } from './guides';
import { installExtrasQA } from './qa';
import { useExtras } from './state';
import './extras.css';

const Sheets = lazy(() => import('./sheets').then(m => ({ default: m.ExtrasSheets })));

export function ExtrasRoot() {
  const sheet = useExtras(s => s.sheet);
  // once wanted, the sheets stay mounted (their dialogs close themselves; unmounting would skip that)
  const [wanted, setWanted] = useState(false);
  if (sheet && !wanted) setWanted(true);
  useEffect(() => { if (new URLSearchParams(location.search).has('qa')) installExtrasQA(); }, []);
  return (
    <>
      <GuidesOverlay />
      {wanted && <Suspense fallback={sheet ? <p className="lazy-wait mt-spin" role="status">Cargando…</p> : null}><Sheets /></Suspense>}
    </>
  );
}
