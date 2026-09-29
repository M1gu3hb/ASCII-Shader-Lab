/**
 * «Más» in the editor's top bar (mounted by Chrome.tsx with one line): the extras for the open project —
 * «Aplicar plantilla de cartel», saved settings, depth and parallax, the photo sequence, words forming the
 * figure — and the print guides switch when the canvas has a known size.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { posterGuides } from '../../project/posters';
import { useProject } from '../../project/store';
import { IDepth, IExtras, IGuides, IPoster, IPreset, ISequence, IWords } from './icons';
import { openExtras, useExtras, type ExtrasSheet } from './state';

interface Item { sheet: ExtrasSheet; name: string; blurb: string; icon: ReactNode }

export function ExtrasMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useProject(s => s.project?.canvas);
  const seq = useProject(s => s.project?.sources.some(x => x.kind === 'sequence') ?? false);
  const guides = useExtras(s => s.guides);
  const g = canvas ? posterGuides(canvas) : null;
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', out, true);
    return () => document.removeEventListener('pointerdown', out, true);
  }, [open]);
  const items: Item[] = [
    { sheet: 'carteles', name: 'Aplicar plantilla de cartel…', blurb: 'Carteles para imprimir (A4, A3, Carta, Tabloide) o para redes, sobre esta foto.', icon: <IPoster /> },
    { sheet: 'ajustes', name: 'Ajustes guardados…', blurb: 'Guardar este estilo o aplicar uno guardado a esta foto.', icon: <IPreset /> },
    { sheet: 'paralaje', name: 'Profundidad y paralaje…', blurb: 'Separar sujeto y fondo y moverlos a distinta velocidad.', icon: <IDepth /> },
    { sheet: 'secuencia', name: seq ? 'Secuencia de fotos…' : 'Hacer una secuencia de fotos…', blurb: seq ? 'Orden, tiempo de cada foto y transiciones.' : 'Varias fotos, una tras otra, con transiciones.', icon: <ISequence /> },
    { sheet: 'palabras', name: 'Tus palabras forman la figura…', blurb: 'Tu texto llena la figura de la foto o del sujeto recortado.', icon: <IWords /> },
  ];
  const key = (e: KeyboardEvent) => {
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem],[role=menuitemcheckbox]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.xm-btn')?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };
  return (
    <div className="xm" ref={ref} onKeyDown={key}>
      <button type="button" className="ib ghost xm-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Carteles, ajustes guardados, paralaje, secuencias y palabras">
        <IExtras /><span className="lbl">Más</span>
      </button>
      {open && (
        <div className="xm-menu" role="menu" aria-label="Más herramientas">
          {items.map(it => (
            <button key={it.sheet} type="button" role="menuitem" onClick={() => { setOpen(false); openExtras(it.sheet, { mode: 'open' }); }}>
              {it.icon}<span><b>{it.name}</b><small>{it.blurb}</small></span>
            </button>
          ))}
          {g && (
            <>
              <span className="xm-sep" aria-hidden="true" />
              <button type="button" role="menuitemcheckbox" aria-checked={guides} onClick={() => useExtras.setState({ guides: !guides })}>
                <IGuides /><span><b>{guides ? 'Ocultar las guías' : 'Ver las guías'}</b><small>{g.label}: corte, sangrado y zona segura (no se exportan).</small></span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
