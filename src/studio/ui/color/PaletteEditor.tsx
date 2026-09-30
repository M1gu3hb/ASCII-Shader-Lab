import { useMemo, useState } from 'react';
import { CURATED } from '../../../random/palettes';
import { PALETTE_GALLERY, PALETTE_MOODS, type PaletteMood } from '../../../random/palette-gallery';
import { makePalette5, tune5, type Palette5Style } from '../../../random/palettes5';
import { Rng } from '../../../random/prng';
import { ILock, INext, IPlus, IPrev, ITrash, IUnlock } from '../../icons';
import { edit, toggleLock, useStudio } from '../../store';
import { ColorPicker } from './ColorPicker';
import { describe } from './color-math';
import { suggestions, type Pal } from './harmony';
import './color.css';

/**
 * The palette of the piece, edited in place (the «Color» section): its stops from the faintest glyphs to the
 * densest and its background, each one opening the studio's colour editor; reorder, add or remove stops; ideas
 * drawn from the palette itself (análoga, complementaria…); the forty palettes of the gallery by mood and the
 * classic ones; and «Fijar color», the dice's colour lock, right where the colours are. Every choice reaches the
 * piece at once and is one undo step.
 */
const MAX_STOPS = 6;
type Target = number | 'bg' | null;
type Shelf = PaletteMood | 'clasicas';
const SHELVES: Array<[Shelf, string]> = [...(Object.entries(PALETTE_MOODS) as Array<[PaletteMood, string]>), ['clasicas', 'Clásicas']];
/** Families the «otra al azar» button draws from (the dice's own, version 5). */
const RANDOM: Palette5Style[] = ['vivo', 'noche', 'duo', 'cartel', 'acento', 'triada', 'pastel5', 'papel5', 'mono5'];

const bar = (p: Pal) => ({
  background: `linear-gradient(90deg, ${p.bg} 0 22%, ${p.stops.length > 1 ? p.stops.map((s, i) => `${s} ${22 + (i / (p.stops.length - 1)) * 78}%`).join(', ') : `${p.stops[0]} 22%`})`,
});
const same = (a: Pal, b: Pal) => a.bg.toLowerCase() === b.bg.toLowerCase() && a.stops.length === b.stops.length && a.stops.every((s, i) => s.toLowerCase() === b.stops[i].toLowerCase());

export function PaletteEditor({ isMedia }: { isMedia: boolean }) {
  const stops = useStudio(s => s.entries[s.cursor]?.recipe.color.stops) ?? [];
  const bg = useStudio(s => s.entries[s.cursor]?.recipe.color.bg) ?? '#000000';
  const locked = useStudio(s => s.locks.includes('color'));
  const [target, setTarget] = useState<Target>(null);
  const [shelf, setShelf] = useState<Shelf>('calma');
  const [spin, setSpin] = useState(0);
  const pal: Pal = { stops, bg };
  const key = stops.join() + bg;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ideas = useMemo(() => (stops.length ? suggestions(pal) : []), [key]);
  const shelfList: Array<Pal & { name: string; id: string }> = shelf === 'clasicas'
    ? CURATED.map(p => ({ id: p.name, name: p.name, stops: p.stops, bg: p.bg }))
    : PALETTE_GALLERY.filter(p => p.mood === shelf);

  const apply = (p: Pal) => edit(r => {
    r.color.stops = p.stops.slice();
    r.color.bg = p.bg;
    if (r.color.mode === 'source' && !isMedia) r.color.mode = 'ramp';
  }, 'pal' + Date.now());
  const setStop = (i: number, hex: string) => edit(r => { r.color.stops[i] = hex; }, 'stop' + i);
  const setBg = (hex: string) => edit(r => { r.color.bg = hex; }, 'color.bg');
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    edit(r => { const s = r.color.stops; [s[i], s[j]] = [s[j], s[i]]; }, 'move' + Date.now());
    setTarget(j);
  };
  const remove = (i: number) => {
    if (stops.length <= 1) return;
    edit(r => { r.color.stops.splice(i, 1); }, 'rmstop' + Date.now());
    setTarget(stops.length - 2 >= 0 ? Math.min(i, stops.length - 2) : null);
  };
  const add = () => {
    if (stops.length >= MAX_STOPS) return;
    // a new stop halfway between the last two (or a lighter copy of the only one): something to start from
    edit(r => { const s = r.color.stops; s.push(s[s.length - 1] ?? '#ffffff'); }, 'addstop' + Date.now());
    setTarget(stops.length);
  };
  const random = () => {
    const n = spin + 1;
    setSpin(n);
    const rng = new Rng(`paleta|${Date.now()}|${n}`);
    const p = tune5(makePalette5(rng.pick(RANDOM), rng));
    apply(p);
  };

  const sel = target === 'bg' ? 'bg' : typeof target === 'number' && target < stops.length ? target : null;
  const label = sel === 'bg' ? 'Fondo' : sel !== null ? `Color ${sel + 1} de ${stops.length}` : '';
  return (
    <div className="pe">
      <div className="pe-bar" style={bar(pal)} aria-hidden="true" />
      <p className="note">De las celdas más vacías (izquierda) a las más llenas (derecha), sobre el fondo. Toca un color para cambiarlo.</p>
      <div className="pe-stops" role="group" aria-label="Colores de la paleta">
        <button type="button" className="pe-sw pe-bg" aria-pressed={sel === 'bg'} style={{ background: bg }}
          aria-label={`Fondo: ${bg.toUpperCase()}, ${describe(bg)}`} title="Fondo" onClick={() => setTarget(sel === 'bg' ? null : 'bg')}>
          <span>Fondo</span>
        </button>
        <span className="pe-sep" aria-hidden="true" />
        {stops.map((c, i) => (
          <button key={i} type="button" className="pe-sw" aria-pressed={sel === i} style={{ background: c }}
            aria-label={`Color ${i + 1} de ${stops.length}: ${c.toUpperCase()}, ${describe(c)}`} title={`Color ${i + 1}: ${c.toUpperCase()}`}
            onClick={() => setTarget(sel === i ? null : i)}>
            <span>{i + 1}</span>
          </button>
        ))}
        <button type="button" className="pe-add" onClick={add} disabled={stops.length >= MAX_STOPS} aria-label="Añadir un color"
          title={stops.length >= MAX_STOPS ? 'Hasta seis colores' : 'Añadir un color'}><IPlus width={16} height={16} /></button>
      </div>
      {sel !== null && (
        <div className="pe-edit">
          {sel !== 'bg' && (
            <div className="pe-acts" role="group" aria-label={`Acciones de ${label}`}>
              <button type="button" className="mini" disabled={sel === 0} onClick={() => move(sel, -1)} aria-label={`Mover ${label} a la izquierda`}><IPrev width={14} height={14} /> Mover</button>
              <button type="button" className="mini" disabled={sel === stops.length - 1} onClick={() => move(sel, 1)} aria-label={`Mover ${label} a la derecha`}>Mover <INext width={14} height={14} /></button>
              <button type="button" className="mini" disabled={stops.length <= 1} onClick={() => remove(sel)} aria-label={`Quitar ${label}`}
                title={stops.length <= 1 ? 'Una paleta necesita al menos un color' : undefined}><ITrash width={14} height={14} /> Quitar</button>
              <button type="button" className="mini" onClick={() => edit(r => { r.color.stops.reverse(); }, 'rev' + Date.now())}>⇄ Invertir orden</button>
            </div>
          )}
          <ColorPicker key={String(sel)} value={sel === 'bg' ? bg : stops[sel]} label={label}
            onChange={hex => (sel === 'bg' ? setBg(hex) : setStop(sel, hex))}
            swatches={[...stops, bg].filter((s, i, a) => a.indexOf(s) === i)} />
        </div>
      )}
      <div className="pe-lock">
        <button type="button" className={'pe-lockbtn' + (locked ? ' on' : '')} aria-pressed={locked} onClick={() => toggleLock('color')}>
          {locked ? <ILock width={16} height={16} /> : <IUnlock width={16} height={16} />} {locked ? 'Color fijo al tirar el dado' : 'Fijar color al tirar el dado'}
        </button>
        <p className="note">{locked
          ? 'El dado cambia forma, glifos, movimiento y efectos, y deja estos colores. Pulsa otra vez para soltarlos.'
          : 'Si te gustan estos colores, fíjalos: el dado cambiará lo demás y los respetará.'}</p>
      </div>

      <h3 className="sub">Ideas para esta paleta</h3>
      <div className="pe-grid" role="group" aria-label="Ideas para esta paleta">
        {ideas.map(p => (
          <button key={p.id} type="button" className="pe-pal" onClick={() => apply(p)} title={p.hint} aria-label={`${p.name}: ${p.hint}`}>
            <span className="pe-pbar" style={bar(p)} aria-hidden="true" />
            <span className="pe-name">{p.name}</span>
          </button>
        ))}
        <button type="button" className="pe-pal pe-dice" onClick={random} aria-label="Otra paleta al azar, de las del dado">
          <span className="pe-pbar pe-dicebar" aria-hidden="true">⚄</span>
          <span className="pe-name">Otra al azar</span>
        </button>
      </div>

      <h3 className="sub">Biblioteca de paletas</h3>
      <div className="pe-shelves" role="group" aria-label="Estados de ánimo">
        {SHELVES.map(([id, name]) => (
          <button key={id} type="button" className="chip" aria-pressed={shelf === id} onClick={() => setShelf(id)}>{name}</button>
        ))}
      </div>
      <div className="pe-grid" role="group" aria-label={`Paletas: ${SHELVES.find(s => s[0] === shelf)![1]}`}>
        {shelfList.map(p => (
          <button key={p.id} type="button" className="pe-pal" aria-pressed={same(p, pal)} onClick={() => apply(p)} aria-label={`Paleta ${p.name}`}>
            <span className="pe-pbar" style={bar(p)} aria-hidden="true" />
            <span className="pe-name">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
