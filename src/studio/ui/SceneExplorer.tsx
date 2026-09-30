import { useEffect, useMemo, useState } from 'react';
import type { SpaceId } from '../../random/spaces';
import { PALETTE_MOODS, type PaletteMood } from '../../random/palette-gallery';
import { renderCrops } from '../guide/thumbs';
import { SCENES, makeScene } from '../scenes';
import { CURATED } from '../../random/palettes';
import { PALETTE_GALLERY } from '../../random/palette-gallery';
import { applyRecipe, currentRecipe } from '../store';
import './scene-explorer.css';

const PAGE_SIZE = 6;
export function SceneExplorer({ space }: { space: SpaceId }) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<PaletteMood | 'todas'>('todas');
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const list = useMemo(() => SCENES.filter(s => s.space === (space === 'componentes' ? 'fondos' : space) && (mood === 'todas' || s.mood === mood)), [space, mood]);
  const last = Math.max(0, Math.ceil(list.length / PAGE_SIZE) - 1);
  const shown = list.slice(Math.min(page, last) * PAGE_SIZE, (Math.min(page, last) + 1) * PAGE_SIZE);
  useEffect(() => {
    if (!open || !shown.length) return;
    const sig = { cancelled: false };
    setImages({});
    const timer = setTimeout(() => renderCrops(shown.map(s => makeScene(s)), { w: 176, h: 110, zoom: 1 },
      (i, url) => { if (!sig.cancelled) setImages(old => ({ ...old, [shown[i].id]: url })); }, sig), 80);
    return () => { sig.cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, space, mood, page]);
  return <section className="scene-explorer" aria-label="Escenas compuestas">
    <button type="button" className="scene-explorer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Cerrar escenas' : `Explorar escenas · ${SCENES.filter(s => s.space === (space === 'componentes' ? 'fondos' : space)).length}`}
    </button>
    {open && <>
      <p>Composiciones de varias capas: puedes cambiar cada patrón, color, glifo y velocidad después.</p>
      <div className="scene-explorer-filters" role="group" aria-label="Ambiente de la escena">
        <button type="button" aria-pressed={mood === 'todas'} onClick={() => { setMood('todas'); setPage(0); }}>Todas</button>
        {(Object.keys(PALETTE_MOODS) as PaletteMood[]).map(id => <button type="button" key={id} aria-pressed={mood === id} onClick={() => { setMood(id); setPage(0); }}>{PALETTE_MOODS[id]}</button>)}
      </div>
      <div className="scene-explorer-grid">
        {shown.map(s => <button type="button" key={s.id} onClick={() => { applyRecipe(makeScene(s, currentRecipe()), 'receta', s.name); setOpen(false); }}>
          <span className="scene-explorer-image" style={{ background: (() => { const p = [...CURATED, ...PALETTE_GALLERY].find(x => x.name === s.palette); return p ? `radial-gradient(circle at 50% 45%, ${p.stops[p.stops.length - 1]}88, ${p.stops[0]} 44%, ${p.bg} 100%)` : undefined; })() }}>
            {images[s.id] ? <img alt="" src={images[s.id]!} /> : <span className="scene-explorer-fallback">{s.layers.map(l => l.pattern.replaceAll('_', ' ')).join(' · ')}</span>}
          </span>
          <strong>{s.name}</strong><small>{PALETTE_MOODS[s.mood]} · {s.layers.length} capas</small>
        </button>)}
      </div>
      {!list.length && <p>No hay escenas de este ambiente en este taller.</p>}
      {list.length > PAGE_SIZE && <div className="scene-explorer-pages">
        <button type="button" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Anterior</button><span>{Math.min(page, last) + 1} / {last + 1}</span>
        <button type="button" disabled={page >= last} onClick={() => setPage(n => n + 1)}>Siguiente</button>
      </div>}
    </>}
  </section>;
}
