/**
 * The editor's toolbar (one Tab stop, arrows move between its buttons) and the options bar under it:
 * the tool's own options, «Ajustar a» and «Relleno».
 */
import type { KeyboardEvent } from 'react';
import type { Contour, GlyphDoc } from '../../doc';
import { PATH_OP_NAMES } from './actions';
import { useEd, useEdStore, useEditorApi, TOOLS, type ActionName, type ToolId } from './editorStore';
import { ICONS } from './icons';
import { NumField } from './NumField';
import { sanitizeSel, wholeContours } from './selection';

const OPS: Array<{ id: ActionName; name: string; hint: string }> = [
  { id: 'unir', name: PATH_OP_NAMES.unir, hint: 'une los contornos seleccionados en uno' },
  { id: 'restar', name: PATH_OP_NAMES.restar, hint: 'al primer contorno elegido le quita los demás' },
  { id: 'intersecar', name: PATH_OP_NAMES.intersecar, hint: 'deja solo lo que los contornos comparten' },
  { id: 'excluir', name: PATH_OP_NAMES.excluir, hint: 'deja lo que no comparten' },
];

function roving(e: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-rove]')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
  items.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
  items[j].focus();
}

export function Toolbar({ contours }: { contours: Contour[] }) {
  const api = useEditorApi();
  const store = useEdStore();
  const tool = useEd(s => s.tool);
  const zoom = useEd(s => s.zoom);
  const sel = sanitizeSel(useEd(s => s.sel), { contours, components: [], anchors: [] });
  const canTool = (t: ToolId) => (t === 'seleccionar' ? true : t === 'guia' ? api.docEditable : api.editable);
  const why = !api.docEditable ? 'Solo lectura: no se puede editar.' : 'Este glifo está bloqueado: desbloquéalo para editar.';
  const closed = contours.filter(c => c.closed && c.nodes.length > 1).length;
  const picked = wholeContours(sel, contours).filter(ci => contours[ci].closed && contours[ci].nodes.length > 1).length;
  const opsWhy = !api.editable ? why : 'Selecciona al menos dos contornos cerrados.';
  // one Tab stop: the pressed tool
  const stop = TOOLS.findIndex(t => t.id === tool);
  return (
    <div className="ge-bar" role="toolbar" aria-label="Herramientas del editor" aria-orientation="horizontal" onKeyDown={roving}>
      <div className="ge-group" role="group" aria-label="Herramientas">
        {TOOLS.map((t, i) => {
          const ok = canTool(t.id);
          return (
            <button
              key={t.id} type="button" data-rove="" tabIndex={i === stop ? 0 : -1} className="ge-tb ge-tool"
              aria-pressed={tool === t.id} aria-keyshortcuts={t.key} aria-disabled={!ok || undefined}
              title={`${t.name} (${t.key}) · ${t.hint}`} aria-label={t.name}
              onClick={() => { if (ok) store.setState({ tool: t.id }); else api.say(why); }}
            >
              {ICONS[t.id]}<span className="ge-tl">{t.name}</span><kbd className="ge-kbd" aria-hidden="true">{t.key}</kbd>
            </button>
          );
        })}
      </div>
      <span className="ge-sep" aria-hidden="true" />
      <div className="ge-group" role="group" aria-label="Operaciones de trazo">
        {OPS.map(o => {
          const ok = api.editable && picked >= 2;
          return (
            <button
              key={o.id} type="button" data-rove="" tabIndex={-1} className="ge-tb" aria-disabled={!ok || undefined}
              title={ok ? `${o.name}: ${o.hint}` : `${o.name}: ${opsWhy}`} aria-label={o.name}
              onClick={() => (ok ? api.run(o.id) : api.say(`${o.name}: ${opsWhy}`))}
            >{ICONS[o.id]}</button>
          );
        })}
        <button
          type="button" data-rove="" tabIndex={-1} className="ge-tb" aria-disabled={!(api.editable && closed > 1) || undefined}
          title={api.editable && closed > 1 ? 'Quitar solapamientos: une los contornos del glifo que se pisan' : `Quitar solapamientos: ${api.editable ? 'hacen falta dos contornos cerrados o más.' : why}`}
          aria-label="Quitar solapamientos"
          onClick={() => (api.editable && closed > 1 ? api.run('solapamientos') : api.say(`Quitar solapamientos: ${api.editable ? 'hacen falta dos contornos cerrados o más.' : why}`))}
        >{ICONS.solapamientos}</button>
      </div>
      <span className="ge-sep" aria-hidden="true" />
      <div className="ge-group ge-zoom" role="group" aria-label="Vista">
        <button type="button" data-rove="" tabIndex={-1} className="ge-tb" title="Alejar (Ctrl −)" aria-label="Alejar" aria-keyshortcuts="Control+-" onClick={() => api.canvas.current?.zoomBy(-1)}>{ICONS.menos}</button>
        <output className="ge-zoomval" aria-label="Zoom">{Math.round(zoom * 100)}%</output>
        <button type="button" data-rove="" tabIndex={-1} className="ge-tb" title="Acercar (Ctrl +)" aria-label="Acercar" aria-keyshortcuts="Control+=" onClick={() => api.canvas.current?.zoomBy(1)}>{ICONS.mas}</button>
        <button type="button" data-rove="" tabIndex={-1} className="ge-tb ge-txt" title="Ver el glifo entero (Ctrl 0)" aria-keyshortcuts="Control+0" onClick={() => api.canvas.current?.fit()}>{ICONS.ajustar}<span className="ge-tl">Ajustar</span></button>
      </div>
    </div>
  );
}

/** Under the toolbar: what the tool needs, «Ajustar a», «Relleno». */
export function OptionsBar({ doc, hasRaster }: { doc: GlyphDoc; hasRaster: boolean }) {
  const api = useEditorApi();
  const store = useEdStore();
  const tool = useEd(s => s.tool);
  const snap = useEd(s => s.snap);
  const fill = useEd(s => s.fill);
  const pencilWidth = useEd(s => s.pencilWidth);
  const pencilClosed = useEd(s => s.pencilClosed);
  const moveImage = useEd(s => s.moveImage);
  const penActive = useEd(s => s.penActive);
  const setSnap = (p: Partial<typeof snap>) => store.setState({ snap: { ...snap, ...p } });
  return (
    <div className="ge-opts" role="group" aria-label="Opciones de la herramienta y de la vista">
      <div className="ge-opts-tool">
        {tool === 'lapiz' && (
          <>
            <NumField inline label="Grosor" value={pencilWidth ?? doc.style.weight} min={2} max={doc.metrics.upm} step={1} digits={0}
              onCommit={v => store.setState({ pencilWidth: v })} className="ge-w-sm" title="Grosor del trazo del lápiz (unidades)" />
            <label className="ge-chk"><input type="checkbox" checked={pencilClosed} onChange={e => store.setState({ pencilClosed: e.target.checked })} />Contorno cerrado</label>
          </>
        )}
        {tool === 'pluma' && (
          <>
            <span className="ge-tip">{penActive ? 'Clic en el primer nodo: cerrar · Esc o Intro: terminar' : 'Clic: esquina · Arrastrar: curva · Clic en un segmento: insertar nodo · Alt+clic en un nodo: quitar asas'}</span>
            {penActive && <button type="button" className="ge-btn" onClick={() => api.canvas.current?.endPen()}>Terminar trazo</button>}
          </>
        )}
        {tool === 'seleccionar' && (
          <>
            <span className="ge-tip">Doble clic en un nodo: suave o esquina · Alt al arrastrar un asa: romper la curva</span>
            {hasRaster && <label className="ge-chk"><input type="checkbox" checked={moveImage} disabled={!api.editable} onChange={e => store.setState({ moveImage: e.target.checked })} />Mover imagen</label>}
          </>
        )}
        {(tool === 'rectangulo' || tool === 'elipse') && <span className="ge-tip">Arrastra · Mayús: {tool === 'rectangulo' ? 'cuadrado' : 'círculo'} · Alt: desde el centro</span>}
        {tool === 'guia' && <span className="ge-tip">Clic: guía horizontal · Alt+clic: vertical · Arrástrala fuera del lienzo para quitarla</span>}
      </div>
      <div className="ge-opts-view">
        <span className="ge-opts-lbl" id={'ge-snap-' + api.ch.codePointAt(0)}>Ajustar a</span>
        <div className="ge-chips" role="group" aria-labelledby={'ge-snap-' + api.ch.codePointAt(0)}>
          <button type="button" className="ge-chip" aria-pressed={snap.grid} onClick={() => setSnap({ grid: !snap.grid })}>Rejilla</button>
          {snap.grid && <NumField inline label="Paso" value={snap.step} min={1} max={500} digits={0} onCommit={v => setSnap({ step: v })} className="ge-w-xs" title="Paso de la rejilla (unidades)" />}
          <button type="button" className="ge-chip" aria-pressed={snap.lines} onClick={() => setSnap({ lines: !snap.lines })}>Guías y métricas</button>
          <button type="button" className="ge-chip" aria-pressed={snap.nodes} onClick={() => setSnap({ nodes: !snap.nodes })}>Nodos</button>
        </div>
        <span className="ge-sep" aria-hidden="true" />
        <button type="button" className="ge-chip" aria-pressed={fill} onClick={() => store.setState({ fill: !fill })}>Relleno</button>
      </div>
    </div>
  );
}
