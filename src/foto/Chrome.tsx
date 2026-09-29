/**
 * The photo studio's frame around the art: the top bar (with the «Laboratorio ⇄ Foto y video» switch),
 * the tool rail, the options bar of the active tool, the viewport's corner instruments and the deck
 * (dice and versions). The phone layout (PhoneBar, ToolSheet) lives in Phone.tsx.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { logoMark, wordmark } from '../shared/brand';
import { LOCK_NAMES, type LockGroup } from '../random/spaces';
import { setLocks, useProject } from '../project/store';
import type { MaskOp } from '../project/types';
import { IDice, IDownload, INext, IPrev, IRedo, IStar, IUndo, ILock, IUnlock } from '../studio/icons';
import { azar, favorite, next, prev, redo, saveVersion, toggleCompare, undo, zoomFit, zoomStep, zoomTo, goVersion } from './actions';
import { activeTool, host } from './host';
import { ICompare, IFit, IHand, IHelp, ILab, IMask, IScissors, ISettings, IZoomIn, IZoomOut, IFolder, ISave } from './icons';
import { selectTool } from './keys';
import { backToStart } from './session';
import { TOOLS } from './tools/index';
import type { Tool } from './tools/types';
import { openSheet, setQuality, setUI, useFoto } from './ui';
import { OPS } from './inspect/MaskSection';
import { orderVersions } from './tree';
export { orderVersions };
import './switch.css';

/* ------------------------------------------------------------------ the switch */

/** «Laboratorio ⇄ Foto y video»: the same control in both studios' top bars. */
export function StudioSwitch({ current }: { current: 'lab' | 'foto' }) {
  return (
    <nav className="sw" aria-label="Estudios de GLYPHOS">
      <a className="sw-seg" href="/studio/" aria-current={current === 'lab' ? 'page' : undefined} aria-label="Laboratorio" title="Laboratorio: patrones, fondos, texto y terminal"
        onClick={e => {
          // what is waiting to be saved goes first (a page being left may not finish its writes)
          if (current !== 'foto' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          void import('../project/store').then(s => s.saveNow()).finally(() => { location.href = '/studio/'; });
        }}>
        <span className="sw-long">Laboratorio</span><span className="sw-short">Lab</span>
      </a>
      <a className="sw-seg" href="/studio/foto/" aria-current={current === 'foto' ? 'page' : undefined} aria-label="Foto y video" title="Foto y video: capas, máscaras y recortes sobre tu foto">
        <span className="sw-long">Foto y video</span><span className="sw-short">Foto</span>
      </a>
    </nav>
  );
}

/* ------------------------------------------------------------------ top bar */

export function TopBar({ editing }: { editing: boolean }) {
  const name = useProject(s => s.project?.name ?? '');
  const storage = useProject(s => s.storage);
  const saving = useFoto(s => s.saving);
  const canUndo = useProject(s => s.canUndo);
  const canRedo = useProject(s => s.canRedo);
  const [editName, setEditName] = useState(false);
  return (
    <header className="topbar ftop">
      <a className="brand" href="/" aria-label="GLYPHOS, volver a la portada" dangerouslySetInnerHTML={{ __html: logoMark(24) + wordmark(14, { className: 'brand-word' }) + '<span class="brand-sub">foto y video</span>' }} />
      <StudioSwitch current="foto" />
      {editing && (
        <div className="fproj">
          <button type="button" className="ib ghost" onClick={() => void backToStart()} title="Tus proyectos, plantillas y archivos" aria-label="Proyectos"><IFolder /><span className="lbl">Proyectos</span></button>
          {editName ? (
            <input className="fproj-in" defaultValue={name} aria-label="Nombre del proyecto" autoFocus maxLength={120}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== name) void import('../project/store').then(s => s.edit(p => { p.name = v.slice(0, 120); })); setEditName(false); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditName(false); }} />
          ) : (
            <button type="button" className="fproj-name" onClick={() => setEditName(true)} title="Cambiar el nombre">{name}</button>
          )}
          <span className={'fsave ' + storage} role="status" title={storage === 'ok' ? 'Guardado en este navegador' : storage === 'full' ? 'No queda espacio en el navegador: descarga el proyecto' : storage === 'unavailable' ? 'El navegador no deja guardar: descarga el proyecto' : 'Se guarda solo'}>
            {saving && storage !== 'full' && storage !== 'unavailable' ? 'guardando…' : storage === 'ok' ? 'guardado' : storage === 'full' ? 'sin espacio' : storage === 'unavailable' ? 'sin guardar' : ''}
          </span>
        </div>
      )}
      <div className="tb-right">
        {editing && (
          <div className="tb-group">
            <button type="button" className="ib ghost" disabled={!canUndo} onClick={undo} title="Deshacer (Z o Ctrl+Z)" aria-label="Deshacer"><IUndo /></button>
            <button type="button" className="ib ghost" disabled={!canRedo} onClick={redo} title="Rehacer (⇧Ctrl+Z)" aria-label="Rehacer"><IRedo /></button>
          </div>
        )}
        <div className="tb-group">
          <button type="button" className="ib ghost hide-sm" onClick={() => openSheet('settings')} title="Ajustes: calidad de la vista y modelos descargados" aria-label="Ajustes del estudio"><ISettings /></button>
          <button type="button" className="ib ghost hide-sm" onClick={() => openSheet('help')} title="Atajos y ayuda (?)" aria-label="Atajos y ayuda"><IHelp /></button>
        </div>
        {editing && (
          <>
            <button type="button" className="ib hide-xs" onClick={() => openSheet('saveas')} title="Guardar como, descargar el proyecto" aria-label="Guardar"><ISave /><span className="lbl">Guardar</span></button>
            <button type="button" className="ib primary" onClick={() => openSheet('export')} title="Exportar: PNG, JPEG, WebP, máscaras, capas, texto"><IDownload /><span className="lbl">Exportar</span></button>
          </>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ tool rail */

const GROUP_NAMES: Record<Tool['group'], string> = { seleccion: 'Selección', pincel: 'Pinceles', objeto: 'Objeto', dibujo: 'Dibujo' };

export function ToolIcon({ t }: { t: Tool }) {
  return <span className="t-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.icon }} />;
}

/** The palette: the built-in hand, then TOOLS grouped (empty today: it fills when the tools arrive). */
export function ToolRail({ onCutout, vertical = true }: { onCutout: () => void; vertical?: boolean }) {
  const tool = useFoto(s => s.tool);
  useFoto(s => s.toolsV);
  const groups = (['seleccion', 'pincel', 'objeto', 'dibujo'] as const).map(g => [g, TOOLS.filter(t => t.group === g)] as const).filter(([, l]) => l.length);
  return (
    <div className={'frail' + (vertical ? '' : ' horiz')} role="toolbar" aria-label="Herramientas" aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      <button type="button" className="tbtn" aria-pressed={tool === 'mano'} title="Mano: mover la vista (H, o espacio + arrastrar)" aria-label="Mano (H)" onClick={() => selectTool('mano')}><IHand /><kbd>H</kbd></button>
      {groups.map(([g, list]) => (
        <div key={g} className="trail-g" role="group" aria-label={GROUP_NAMES[g]}>
          {list.map(t => (
            <button key={t.id} type="button" className="tbtn" aria-pressed={tool === t.id} title={`${t.name}${t.shortcut ? ` (${t.shortcut.toUpperCase()})` : ''}: ${t.hint}`}
              aria-label={`${t.name}${t.shortcut ? ` (${t.shortcut.toUpperCase()})` : ''}`} onClick={() => selectTool(t.id)}>
              <ToolIcon t={t} />{t.shortcut && <kbd>{t.shortcut.toUpperCase()}</kbd>}
            </button>
          ))}
        </div>
      ))}
      {!TOOLS.length && <p className="trail-empty" title="Rectángulo, elipse, lazo, pinceles, color y objeto: llegan en la próxima actualización del estudio">Selección y pinceles: pronto</p>}
      <span className="trail-sep" aria-hidden="true" />
      <button type="button" className="tbtn" title="Quitar fondo: recorta el sujeto en tu equipo" aria-label="Quitar fondo" onClick={onCutout}><IScissors /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ options bar */

export function OptionsBar() {
  const toolId = useFoto(s => s.tool);
  const op = useFoto(s => s.op);
  const t = activeTool();
  if (!toolId) return null;
  if (toolId === 'mano') {
    return (
      <div className="fopts" role="region" aria-label="Opciones de Mano">
        <span className="fo-name"><IHand width={16} height={16} /> Mano</span>
        <span className="fo-hint">Arrastra para mover la vista; rueda o pellizco para acercar.</span>
        <button type="button" className="mini" onClick={() => selectTool(null)}>Soltar</button>
      </div>
    );
  }
  if (!t) return null;
  const Opts = t.Options;
  return (
    <div className="fopts" role="region" aria-label={`Opciones de ${t.name}`}>
      <span className="fo-name"><ToolIcon t={t} /> {t.name}</span>
      <span className="fo-hint">{t.hint}</span>
      {(t.group === 'seleccion' || t.group === 'objeto' || t.group === 'pincel') && (
        <div className="seg fo-op" role="radiogroup" aria-label="Operación de la máscara">
          {OPS.map(([v, name, title]) => (
            <button key={v} type="button" role="radio" aria-checked={op === v} title={title} onClick={() => host.setOp(v as MaskOp)}>{name}</button>
          ))}
        </div>
      )}
      {Opts && <div className="fo-tool"><Opts host={host} /></div>}
      <button type="button" className="mini" onClick={() => selectTool(null)} title="Soltar la herramienta (Esc)">Listo</button>
    </div>
  );
}

/* ------------------------------------------------------------------ corner instruments */

export function ViewTools() {
  const zoom = useFoto(s => s.zoom);
  const compare = useFoto(s => s.compare);
  const render = useFoto(s => s.render);
  const quality = useFoto(s => s.quality);
  const k = useFoto(s => s.zk);
  const hold = (on: boolean) => setUI({ holding: on });
  return (
    <div className="fvt">
      <div className="fvt-g" role="group" aria-label="Zoom">
        <button type="button" className="ib ghost" onClick={() => zoomStep(-1, k)} aria-label="Alejar (−)" title="Alejar (−)"><IZoomOut /></button>
        <button type="button" className="fvt-z" onClick={() => (zoom === 'fit' ? zoomTo(1) : zoomFit())} title={zoom === 'fit' ? 'Ver al 100 % (1)' : 'Ajustar a la ventana (0)'}
          aria-label={`Zoom ${Math.round(k * 100)} %${zoom === 'fit' ? ', ajustado' : ''}. Cambiar a ${zoom === 'fit' ? '100 %' : 'ajustar'}`}>{Math.round(k * 100)}%</button>
        <button type="button" className="ib ghost" onClick={() => zoomStep(1, k)} aria-label="Acercar (+)" title="Acercar (+)"><IZoomIn /></button>
        <button type="button" className="ib ghost" aria-pressed={zoom === 'fit'} onClick={zoomFit} aria-label="Ajustar a la ventana (0)" title="Ajustar a la ventana (0)"><IFit /></button>
      </div>
      <MaskViewButton />
      <div className="fvt-g" role="group" aria-label="Comparar con el original">
        <button type="button" className="ib ghost" aria-pressed={compare} onClick={toggleCompare} title="Antes y después: divisor arrastrable (C)" aria-label="Antes y después (C)"><ICompare /></button>
        <button type="button" className="ib ghost fvt-hold" title="Mantén pulsado para ver el original"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); hold(true); }} onPointerUp={() => hold(false)} onPointerCancel={() => hold(false)}
          onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); hold(true); } }}
          onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); hold(false); } }} onBlur={() => hold(false)}>
          <span className="lbl">Mantén para ver el original</span><span className="lbl-s" aria-hidden="true">Original</span>
        </button>
      </div>
      <button type="button" className={'fq' + (render.light ? ' light' : '')} onClick={() => setQuality(quality === 'ligera' ? 'auto' : 'ligera')}
        title={quality === 'ligera' ? 'Vista ligera siempre (equipos lentos). Pulsa para volver a la automática.' : 'Automática: ligera sólo mientras cambias algo y la composición tarda; final al soltar. Pulsa para dejar la ligera siempre.'}
        aria-label={`${render.light ? 'Vista ligera' : 'Calidad final'}, ${render.ms} ms. ${quality === 'ligera' ? 'Ligera siempre' : 'Automática'}`}>
        <i className="q-live on" aria-hidden="true" />{render.light ? 'Vista ligera' : 'Calidad final'}<span className="fq-ms">{render.ms} ms</span>
      </button>
      {render.basic && (
        <span className="fq basic" title="Este navegador no da WebGL 2 (o se pidió el motor básico): las capas ASCII se dibujan en Canvas 2D, más lento pero con el mismo resultado.">
          Motor básico
        </span>
      )}
    </div>
  );
}

/**
 * «Ver la máscara» of the selected layer, when it has one: pins the mask view on (tint or grey, as chosen in
 * the inspector) or lets it show only while you work on the mask.
 */
function MaskViewButton() {
  const view = useFoto(s => s.maskView);
  const pin = useFoto(s => s.maskPin);
  const has = useProject(s => { const l = s.project?.layers.find(x => x.id === s.selection[0]); return !!l?.mask?.parts.length; });
  if (!has) return null;
  const on = pin && view !== 'off';
  const mode = view === 'grey' ? 'sólo máscara' : 'tinte';
  return (
    <div className="fvt-g">
      <button type="button" className="ib ghost" aria-pressed={on} onClick={() => setUI(on ? { maskPin: false } : { maskPin: true, maskView: view === 'off' ? 'tint' : view })}
        title={on ? 'Ocultar la máscara (se ve sólo mientras la editas)' : `Ver la máscara de la capa (${mode})`} aria-label="Ver la máscara">
        <IMask /><span className="lbl fvt-mv">Máscara</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ the deck: dice and versions */

const LOCKS: LockGroup[] = ['forma', 'color', 'glifos', 'movimiento', 'efectos'];

export function Deck({ compact }: { compact?: boolean }) {
  const versions = useProject(s => s.versions);
  const locks = useProject(s => s.locks);
  const keep = useProject(s => s.keep);
  const scope = useFoto(s => s.diceScope);
  const [pop, setPop] = useState(false);
  const cur = versions.list[versions.cursor];
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => { strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [versions.cursor, versions.list.length]);
  const toggleLock = (g: LockGroup) => setLocks(locks.includes(g) ? locks.filter(x => x !== g) : [...locks, g]);
  const toggleKeep = (k: 'seleccion' | 'paleta') => setLocks(locks, keep.includes(k) ? keep.filter(x => x !== k) : [...keep, k]);
  // roots first, each followed by its linked variants (children), as a grouped strip
  const ordered = orderVersions(versions.list);
  return (
    <div className={'fdeck' + (compact ? ' compact' : '')} role="region" aria-label="Explorar: azar y versiones">
      <div className="fd-nav">
        <button type="button" onClick={prev} disabled={versions.cursor <= 0} aria-label="Versión anterior (←)" title="Versión anterior (←)"><IPrev /></button>
        <button type="button" onClick={next} aria-label="Siguiente (→: al final tira el dado)" title="Siguiente (→); al final, azar"><INext /></button>
      </div>
      <ol className="fd-strip" ref={strip} aria-label={`Versiones: ${versions.list.length}`}>
        {ordered.map(({ v, depth }) => {
          const i = versions.list.indexOf(v);
          return (
            <li key={v.id} className={depth ? 'child' : ''}>
              <button type="button" className="fthumb" aria-current={i === versions.cursor} onClick={() => goVersion(v.id)}
                style={v.thumb ? { backgroundImage: `url(${JSON.stringify(v.thumb)})` } : undefined}
                aria-label={`Versión ${i + 1}: ${KIND_NAMES[v.kind] ?? v.kind}${v.fav ? ', favorita' : ''}${depth ? ', variante' : ''}`} title={`${i + 1} · ${KIND_NAMES[v.kind] ?? v.kind}${v.parent ? ` (de la ${versions.list.findIndex(x => x.id === v.parent) + 1})` : ''}`}>
                <span className="n">{i + 1}</span>{v.fav && <span className="star" aria-hidden="true">★</span>}
              </button>
            </li>
          );
        })}
        {!versions.list.length && <li className="fd-empty">Tira el dado: cada resultado queda aquí.</li>}
      </ol>
      <div className="fd-acts">
        <button type="button" className="act fav" aria-pressed={!!cur?.fav} onClick={favorite} title="Favorita (F)" aria-label="Favorita (F)"><IStar filled={!!cur?.fav} /></button>
        <button type="button" className="act ghost hide-md" onClick={() => saveVersion()} title="Guardar esta versión y seguir editando (una rama nueva)">Guardar versión</button>
        <button type="button" className="act ghost hide-md" onClick={() => openSheet('versions')} title="Todas las versiones: árbol de variantes y comparar dos">Versiones</button>
        <div className="pop-anchor">
          <button type="button" className="act ghost" aria-expanded={pop} onClick={() => setPop(!pop)} title="Qué cambia el dado: capa o todo, y candados" aria-label="Opciones del dado">
            {locks.length || keep.length ? <ILock /> : <IUnlock />}<span className="lbl">{scope === 'capa' ? 'Capa' : 'Todo'}</span>
          </button>
          {pop && (
            <DicePop onClose={() => setPop(false)}>
              <h3>El dado cambia</h3>
              <div className="seg" role="radiogroup" aria-label="Alcance del dado">
                <button type="button" role="radio" aria-checked={scope === 'capa'} onClick={() => setUI({ diceScope: 'capa' })}>La capa elegida</button>
                <button type="button" role="radio" aria-checked={scope === 'todo'} onClick={() => setUI({ diceScope: 'todo' })}>Toda la composición</button>
              </div>
              <h3>Candados: se quedan como están</h3>
              <div className="locks">
                {LOCKS.map(g => (
                  <button key={g} type="button" aria-pressed={locks.includes(g)} onClick={() => toggleLock(g)}>{locks.includes(g) ? <ILock /> : <IUnlock />}{LOCK_NAMES[g]}</button>
                ))}
                <button type="button" aria-pressed={keep.includes('seleccion')} onClick={() => toggleKeep('seleccion')}>{keep.includes('seleccion') ? <ILock /> : <IUnlock />}Selección y máscaras</button>
                <button type="button" aria-pressed={keep.includes('paleta')} onClick={() => toggleKeep('paleta')}>{keep.includes('paleta') ? <ILock /> : <IUnlock />}Paleta</button>
              </div>
              <p className="note">Las capas con candado propio (en la lista de capas) nunca cambian.</p>
            </DicePop>
          )}
        </div>
        <button type="button" className="act dice" onClick={() => azar()} title="Azar (espacio o →)"><IDice /><span className="lbl">Azar</span></button>
      </div>
    </div>
  );
}

export const KIND_NAMES: Record<string, string> = { inicio: 'inicio', azar: 'azar', 'variación': 'variación', 'edición': 'edición', guardado: 'guardada', importado: 'importada', restaurado: 'restaurada' };

function DicePop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.pop-anchor')) onClose(); };
    document.addEventListener('pointerdown', out, true);
    return () => document.removeEventListener('pointerdown', out, true);
  }, [onClose]);
  return <div className="pop fpop" ref={ref} role="dialog" aria-label="Opciones del dado" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>{children}</div>;
}

export { ILab };
