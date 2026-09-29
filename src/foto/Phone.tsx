/**
 * The photo studio on a phone: immersive by default (only the art and four actions: anterior, Azar,
 * siguiente, «Herramientas»), and a bottom sheet with snap points (asomar · mitad · entera) that leaves the
 * art visible above it: drag its handle, or swipe it down to close. In a landscape phone the sheet is a
 * side drawer. Tabs: tools, layers, the selected layer, the timeline (compact), explore (dice, locks, versions).
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useProject } from '../project/store';
import { IDice, INext, IPrev, IClose, IDownload } from '../studio/icons';
import { azar, next, prev } from './actions';
import { Deck, OptionsBar, ToolRail } from './Chrome';
import { activeTool, host } from './host';
import { ILayers, ITools, IPlusMinus } from './icons';
import { Inspector } from './inspect/Inspector';
import { Layers } from './Layers';
import { PhoneTimeline } from './TimeSlot';
import { openSheet, setUI, useFoto, type MobileTab, type Snap } from './ui';
import { ExtrasList } from './extras/ExtrasMenu';
import { backToStart } from './session';

const TABS: Array<[MobileTab, string]> = [['herramientas', 'Herramientas'], ['capas', 'Capas'], ['capa', 'Ajustes'], ['tiempo', 'Tiempo'], ['explorar', 'Explorar']];

export function PhoneBar() {
  const versions = useProject(s => s.versions);
  const snap = useFoto(s => s.snap);
  return (
    <nav className="fphone-bar" aria-label="Acciones">
      <button type="button" className="pb" onClick={prev} disabled={versions.cursor <= 0} aria-label="Versión anterior"><IPrev /><span>Anterior</span></button>
      <button type="button" className="pb dice" onClick={() => azar()} aria-label="Azar"><IDice /><span>Azar</span></button>
      <button type="button" className="pb" onClick={next} aria-label="Siguiente (al final, azar)"><INext /><span>Siguiente</span></button>
      <button type="button" className="pb" aria-expanded={snap !== 'closed'} onClick={() => setUI({ snap: snap === 'closed' ? 'half' : 'closed' })} aria-label="Herramientas"><ITools /><span>Herramientas</span></button>
    </nav>
  );
}

/** Heights of the snap points (px) for a window height. */
export function snapHeight(s: Snap, vh: number, land: boolean): number {
  if (land) return s === 'closed' ? 0 : vh;
  switch (s) {
    case 'closed': return 0;
    case 'peek': return Math.min(150, Math.round(vh * 0.2));
    case 'half': return Math.round(vh * 0.48);
    default: return Math.round(vh * 0.86);
  }
}

export function ToolSheet({ land, onCutout }: { land: boolean; onCutout: () => void }) {
  const snap = useFoto(s => s.snap);
  const tab = useFoto(s => s.mtab);
  const box = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number; id: number } | null>(null);
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const h = snapHeight(snap, vh, land);
  useLayoutEffect(() => {
    setUI({ sheetH: land ? 0 : h });
    // notices sit above the sheet, over the art, instead of over the controls
    document.documentElement.style.setProperty('--fsheet-h', (land ? 0 : h) + 'px');
  }, [h, land]);
  useEffect(() => () => { setUI({ sheetH: 0 }); document.documentElement.style.removeProperty('--fsheet-h'); }, []);
  useEffect(() => { if (snap !== 'closed') box.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus({ preventScroll: true }); }, [snap === 'closed']);
  if (snap === 'closed') return null;
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: box.current?.offsetHeight ?? h, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    const nh = Math.max(40, Math.min(vh * 0.92, d.h + (d.y - e.clientY)));
    box.current.style.height = nh + 'px';
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !box.current) return;
    const nh = d.h + (d.y - e.clientY);
    box.current.style.height = '';
    if (Math.abs(d.y - e.clientY) < 6) { setUI({ snap: snap === 'half' ? 'full' : snap === 'full' ? 'peek' : 'half' }); return; }
    // the nearest snap point; a swipe well below the smallest one closes the sheet
    const cands: Snap[] = ['peek', 'half', 'full'];
    if (nh < snapHeight('peek', vh, false) * 0.6) { setUI({ snap: 'closed' }); return; }
    let best: Snap = 'half', bd = Infinity;
    for (const c of cands) { const dd = Math.abs(snapHeight(c, vh, false) - nh); if (dd < bd) { bd = dd; best = c; } }
    setUI({ snap: best });
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const order: Snap[] = ['closed', 'peek', 'half', 'full'];
    const i = order.indexOf(snap);
    if (e.key === 'ArrowUp') { e.preventDefault(); setUI({ snap: order[Math.min(3, i + 1)] }); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setUI({ snap: order[Math.max(0, i - 1)] }); }
  };
  return (
    <section ref={box} className={'fsheet' + (land ? ' land' : '')} style={land ? undefined : { height: h }} aria-label="Herramientas y capas" data-snap={snap}>
      {!land && (
        <div className="fsheet-grab" role="slider" tabIndex={0} aria-label="Altura de la hoja" aria-valuemin={0} aria-valuemax={3}
          aria-valuenow={['closed', 'peek', 'half', 'full'].indexOf(snap)} aria-valuetext={snap === 'peek' ? 'asomada' : snap === 'half' ? 'a media pantalla' : 'entera'}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={key}><i /></div>
      )}
      <div className="fsheet-head">
        <div className="fsheet-tabs" role="tablist" aria-label="Secciones">
          {TABS.map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} id={'ft-' + id} aria-controls="fsheet-body"
              onClick={() => setUI({ mtab: id, snap: snap === 'peek' ? 'half' : snap })}>{name}</button>
          ))}
        </div>
        <button type="button" className="close" onClick={() => setUI({ snap: 'closed' })} aria-label="Cerrar la hoja"><IClose /></button>
      </div>
      <div className={'fsheet-body' + (tab === 'tiempo' ? ' fsheet-tl' : '')} id="fsheet-body" role="tabpanel" aria-labelledby={'ft-' + tab}>
        {tab === 'herramientas' && <ToolsTab onCutout={onCutout} />}
        {tab === 'capas' && <Layers onOpenMask={() => setUI({ mtab: 'capa' })} />}
        {tab === 'capa' && <Inspector />}
        {tab === 'tiempo' && <PhoneTimeline />}
        {tab === 'explorar' && <ExploreTab />}
      </div>
    </section>
  );
}

function ToolsTab({ onCutout }: { onCutout: () => void }) {
  return (
    <>
      <ToolRail vertical={false} onCutout={onCutout} />
      <OptionsBar />
      <p className="note">Un dedo dibuja con la herramienta; dos dedos mueven y acercan la vista.</p>
      {/* (the top bar's «Más» on wider screens) */}
      <ExtrasList />
    </>
  );
}

function ExploreTab() {
  return (
    <>
      <Deck compact />
      <div className="row2 btns">
        <button type="button" className="btn" onClick={() => openSheet('versions')}>Versiones</button>
        <button type="button" className="btn" onClick={() => openSheet('export')}><IDownload width={16} height={16} /> Exportar</button>
      </div>
      <div className="row2 btns">
        <button type="button" className="btn ghost" onClick={() => openSheet('saveas')}>Guardar</button>
        {/* (the top bar's «Proyectos» on wider screens) */}
        <button type="button" className="btn ghost" onClick={() => void backToStart()} title="Tus proyectos, plantillas y archivos">Proyectos</button>
      </div>
      <button type="button" className="btn ghost" onClick={() => setUI({ immersive: false, snap: 'closed' })}>Ver la barra superior</button>
    </>
  );
}

/** The floating ± (touch): add or subtract zones without modifier keys, while a selection tool is active. */
export function PlusMinus() {
  const op = useFoto(s => s.op);
  const tool = useFoto(s => s.tool);
  const t = activeTool();
  if (!tool || !t || (t.group !== 'seleccion' && t.group !== 'objeto' && t.group !== 'pincel')) return null;
  const nextOp = op === 'add' ? 'subtract' : 'add';
  return (
    <button type="button" className={'fpm ' + op} onClick={() => host.setOp(nextOp)} aria-label={op === 'add' ? 'Sumando zonas: pulsa para restar' : 'Restando zonas: pulsa para sumar'}
      title="Sumar o restar zonas">
      <IPlusMinus /><span>{op === 'add' ? 'Sumar' : op === 'subtract' ? 'Restar' : 'Intersecar'}</span>
    </button>
  );
}

export function ImmersiveExit({ children }: { children?: ReactNode }) {
  return (
    <button type="button" className="fimm-exit" onClick={() => setUI({ immersive: false })} aria-label="Mostrar la barra superior (proyectos, exportar)" title="Mostrar la barra superior">
      {children ?? <ILayers />}
    </button>
  );
}
