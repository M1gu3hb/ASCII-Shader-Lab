import { useEffect, useMemo, useState } from 'react';
import { galleryPalette, PALETTE_MOODS, type PaletteMood } from '../../random/palette-gallery';
import type { SpaceId } from '../../random/spaces';
import { renderCrops } from '../guide/thumbs';
import { makeScene, sceneLine, scenesFor, type SceneSpec } from '../scenes';
import { applyRecipe, currentRecipe } from '../store';
import './scene-explorer.css';

/**
 * «Escenas» (from the pattern-library branch): the composed scenes of a space in pages of six, filtered by mood, with
 * small renders; choosing one applies it as a recipe (history entry «receta», editable, Imagen keeps the
 * person's photo). Not mounted yet: the recipe browser of the lab decides where it goes.
 *   <SceneExplorer space={space} onApplied={() => …} />
 * `defaultOpen` starts it open; `onApplied` is called after a scene is applied.
 */
export interface SceneExplorerProps { space: SpaceId; defaultOpen?: boolean; onApplied?: (scene: SceneSpec) => void }

const PAGE = 6;

/** The scene's palette as a gradient, shown while its render is on its way. */
function swatch(s: SceneSpec): string | undefined {
  const p = galleryPalette(s.palette);
  return p ? `radial-gradient(circle at 50% 45%, ${p.stops[p.stops.length - 1]}88, ${p.stops[0]} 44%, ${p.bg} 100%)` : undefined;
}

export function SceneExplorer({ space, defaultOpen = false, onApplied }: SceneExplorerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mood, setMood] = useState<PaletteMood | 'todas'>('todas');
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const all = useMemo(() => scenesFor(space), [space]);
  const list = useMemo(() => (mood === 'todas' ? all : all.filter(s => s.mood === mood)), [all, mood]);
  const moods = useMemo(() => (Object.keys(PALETTE_MOODS) as PaletteMood[]).filter(m => all.some(s => s.mood === m)), [all]);
  const last = Math.max(0, Math.ceil(list.length / PAGE) - 1);
  const at = Math.min(page, last);
  const shown = list.slice(at * PAGE, (at + 1) * PAGE);
  const shownKey = shown.map(s => s.id).join('|');

  useEffect(() => { setPage(0); setMood('todas'); }, [space]);
  useEffect(() => {
    if (!open || !shown.length) return;
    const sig = { cancelled: false };
    const items = shown;
    // with the person's own photo or words, as the scene would look applied
    const base = currentRecipe();
    setImages({});
    const timer = window.setTimeout(() => renderCrops(items.map(s => makeScene(s, base)), { w: 176, h: 110, zoom: 1 },
      (i, url) => { if (!sig.cancelled) setImages(old => ({ ...old, [items[i].id]: url })); }, sig), 80);
    return () => { sig.cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shownKey]);

  if (!all.length) return null;
  const pick = (s: SceneSpec) => {
    applyRecipe(makeScene(s, currentRecipe()), 'receta', s.name);
    onApplied?.(s);
  };
  return (
    <section className="sx-explorer" aria-label="Escenas compuestas">
      <button type="button" className="sx-explorer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Cerrar escenas' : `Escenas compuestas · ${all.length}`}
      </button>
      {open && <>
        <p className="sx-explorer-note">Varias capas que se mueven a su ritmo. Después puedes cambiar cada patrón, color, glifo y velocidad.</p>
        {moods.length > 1 && (
          <div className="sx-explorer-filters" role="group" aria-label="Ambiente de color">
            <button type="button" aria-pressed={mood === 'todas'} onClick={() => { setMood('todas'); setPage(0); }}>Todas</button>
            {moods.map(id => <button type="button" key={id} aria-pressed={mood === id} onClick={() => { setMood(id); setPage(0); }}>{PALETTE_MOODS[id]}</button>)}
          </div>
        )}
        <div className="sx-explorer-grid">
          {shown.map(s => (
            <button type="button" key={s.id} onClick={() => pick(s)} aria-label={`${s.name}, ${sceneLine(s)}`}>
              <span className="sx-explorer-image" style={{ background: swatch(s) }}>
                {images[s.id] && <img alt="" src={images[s.id]!} />}
              </span>
              <strong>{s.name}</strong><small>{sceneLine(s)}</small>
            </button>
          ))}
        </div>
        {list.length > PAGE && (
          <div className="sx-explorer-pages">
            <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)}>Anterior</button>
            <span aria-live="polite">{at + 1} de {last + 1}</span>
            <button type="button" disabled={at >= last} onClick={() => setPage(at + 1)}>Siguiente</button>
          </div>
        )}
      </>}
    </section>
  );
}
