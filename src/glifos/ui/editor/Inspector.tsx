/**
 * The inspector beside the canvas: numbers for what is selected, the glyph's advance and side bearings,
 * its components, anchors, picture layer and the document's guides and metrics. Every change is one
 * undoable edit through the editor's API; arrow presses in a field coalesce (a stable key per field).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STATUS_NAMES, type Glyph, type GlyphDoc, type GlyphOrigin } from '../../doc';
import { glyphContours } from '../../compile';
import { bboxOf, scaleAbout } from '../../geom/ops';
import { traceBitmap } from '../../geom/trace';
import { moveSelection, touchedContours, transformSelection } from './actions';
import { ANCHOR_PRESETS, anchorExists, anchorPlacement, cleanAnchorName, componentCandidates, componentContours, componentProblem, defaultAnchorPos } from './components';
import { useEd, useEdStore, useEditorApi, type ActionName } from './editorStore';
import { ICONS } from './icons';
import { MetricsPanel } from './MetricsPanel';
import { NumField, fmtNum } from './NumField';
import { applyVectorized, tracePlace, type VectorizeMode } from './raster';
import { EMPTY_SEL, moveHandle, movedNodes, parseKey, sanitizeSel, selIsEmpty, selectionBox, toggleSmooth, wholeContours, type GlyphPart } from './selection';
import { advanceFollowsCell, effectiveAdvance, lsbEdit, rsbEdit, shiftGlyph, sidebearings } from './sidebearings';
import type { GlyphEditorProps } from './GlyphEditor';

const ORIGIN_NAMES: Record<GlyphOrigin, string> = {
  manual: 'Dibujado a mano', asistente: 'Propuesto por el asistente', svg: 'Importado de SVG', png: 'Importado de PNG',
  vectorizado: 'Vectorizado de una imagen', fuente: 'Importado de una fuente', componentes: 'Hecho de componentes',
};

/**
 * A collapsible part of the inspector. `initial` says whether it starts open; when `openOn` changes
 * (another glyph) a section that would start open opens again, so a glyph's components or anchors show.
 */
function Section({ title, count, initial = true, openOn, children }: { title: string; count?: number; initial?: boolean; openOn?: string; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  const seen = useRef(openOn);
  useEffect(() => {
    if (openOn === seen.current) return;
    seen.current = openOn;
    if (initial) setOpen(true);
  }, [openOn, initial]);
  return (
    <details className="ge-sec" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary><span className="ge-sec-t">{title}</span>{count !== undefined && <span className="ge-count">{count}</span>}</summary>
      <div className="ge-sec-body">{children}</div>
    </details>
  );
}

const ActBtn = ({ id, label, onClick, disabled, keys, title }: { id?: string; label: string; onClick: () => void; disabled?: boolean; keys?: string; title?: string }) => (
  <button type="button" className="ge-btn" disabled={disabled} aria-keyshortcuts={keys} title={title ?? label} onClick={onClick}>
    {id && ICONS[id]}<span>{label}</span>
  </button>
);

export function Inspector({ doc, g, inkOf }: { doc: GlyphDoc; g: Glyph; inkOf?: GlyphEditorProps['inkOf'] }) {
  const comps = useMemo(() => g.components.map(k => componentContours(doc, k)), [doc, g]);
  return (
    <div className="ge-insp">
      <GlyphHead doc={doc} g={g} />
      <Section title="Selección"><SelectionPanel g={g} comps={comps} /></Section>
      <Section title="Glifo"><GlyphPanel doc={doc} g={g} /></Section>
      <Section title="Componentes" count={g.components.length} initial={g.components.length > 0} openOn={g.ch}><ComponentsPanel doc={doc} g={g} /></Section>
      <Section title="Anclas" count={g.anchors.length} initial={g.anchors.length > 0} openOn={g.ch}><AnchorsPanel doc={doc} g={g} /></Section>
      {g.raster && <Section title="Imagen" openOn={g.ch}><RasterPanel doc={doc} g={g} inkOf={inkOf} /></Section>}
      <Section title="Guías" count={doc.guides.length} initial={false}><GuidesPanel doc={doc} g={g} /></Section>
      <Section title="Métricas" initial={false}><MetricsPanel doc={doc} /></Section>
    </div>
  );
}

function GlyphHead({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const cp = 'U+' + g.ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
  return (
    <div className="ge-head">
      <span className="ge-head-ch" aria-hidden="true">{g.ch}</span>
      <div className="ge-head-txt">
        <p className="ge-head-t">Glifo «{g.ch}» <span className="ge-mono">{cp}</span></p>
        <p className="ge-head-s">
          <span className="ge-status" data-st={g.status}>{STATUS_NAMES[g.status]}</span>
          {g.status !== 'vacio' && <span>{ORIGIN_NAMES[g.origin]}</span>}
          {g.corrected && <span className="ge-tag" title="El asistente no lo reemplaza sin preguntarte">Corregido</span>}
          {doc.refs.includes(g.ch) && <span className="ge-tag">Referencia</span>}
        </p>
      </div>
    </div>
  );
}

/* ---------------- selection ---------------- */

function SelectionPanel({ g, comps }: { g: Glyph; comps: ReturnType<typeof componentContours>[] }) {
  const api = useEditorApi();
  const store = useEdStore();
  const part: GlyphPart = { contours: g.contours, components: g.components, anchors: g.anchors };
  // right after another glyph opens, the store may still hold the previous glyph's selection for a render
  const sel = sanitizeSel(useEd(s => s.sel), part);
  const [ratio, setRatio] = useState(true);
  const [rot, setRot] = useState(15);
  const [pct, setPct] = useState(110);
  const ro = !api.editable;
  if (selIsEmpty(sel)) {
    return (
      <div>
        <p className="ge-empty">Nada seleccionado. Haz clic en un nodo o en un contorno, o arrastra para elegir varios. Con el lienzo enfocado, Tab recorre los nodos.</p>
        <div className="ge-acts"><ActBtn label="Seleccionar todo" keys="Control+A" onClick={() => api.run('todo')} disabled={!g.contours.length && !g.components.length} /></div>
      </div>
    );
  }
  const moved = movedNodes(sel, g.contours);
  const whole = wholeContours(sel, g.contours);
  const touched = touchedContours(sel, g.contours);
  const box = selectionBox(part, sel, i => comps[i] ?? []);
  const apply = (p: GlyphPart, label: string, key?: string) => api.editPart(gg => { gg.contours = p.contours; gg.components = p.components; gg.anchors = p.anchors; }, label, key);
  const single = moved.size === 1 && sel.nodes.length === 1 && !sel.contours.length ? parseKey(sel.nodes[0]) : null;
  const node = single ? g.contours[single[0]]?.nodes[single[1]] : undefined;
  const parts: string[] = [];
  if (moved.size) parts.push(`${moved.size} ${moved.size === 1 ? 'nodo' : 'nodos'}`);
  if (whole.length) parts.push(`${whole.length} ${whole.length === 1 ? 'contorno' : 'contornos'}`);
  if (sel.components.length) parts.push(`${sel.components.length} ${sel.components.length === 1 ? 'componente' : 'componentes'}`);
  if (sel.anchors.length) parts.push(`${sel.anchors.length} ${sel.anchors.length === 1 ? 'ancla' : 'anclas'}`);
  const run = (a: ActionName) => () => api.run(a);
  const anyOpen = touched.some(ci => !g.contours[ci].closed && g.contours[ci].nodes.length > 1), anyClosed = touched.some(ci => g.contours[ci].closed);
  const w = box ? box.x1 - box.x0 : 0, h = box ? box.y1 - box.y0 : 0;
  return (
    <div>
      <p className="ge-summary">{parts.join(' · ')}</p>
      {node && single && (
        <>
          <div className="ge-grid2">
            <NumField inline label="X" value={node.x} disabled={ro} onCommit={v => api.editPart(gg => {
              const n = gg.contours[single[0]].nodes[single[1]], d = v - n.x;
              n.x = v; if (n.hi) n.hi.x += d; if (n.ho) n.ho.x += d;
            }, 'Mover nodo', 'insp-node-x')} />
            <NumField inline label="Y" value={node.y} disabled={ro} onCommit={v => api.editPart(gg => {
              const n = gg.contours[single[0]].nodes[single[1]], d = v - n.y;
              n.y = v; if (n.hi) n.hi.y += d; if (n.ho) n.ho.y += d;
            }, 'Mover nodo', 'insp-node-y')} />
          </div>
          <div className="ge-seg" role="radiogroup" aria-label="Tipo de nodo">
            {([[false, 'Esquina'], [true, 'Suave']] as const).map(([sm, name]) => (
              <button key={name} type="button" role="radio" aria-checked={!!node.smooth === sm} disabled={ro}
                onClick={() => { if (!!node.smooth !== sm) { const c = toggleSmooth(g.contours[single[0]], single[1]); api.editPart(gg => { gg.contours[single[0]] = c; }, sm ? 'Nodo suave' : 'Nodo de esquina'); } }}>{name}</button>
            ))}
          </div>
          {(['hi', 'ho'] as const).map(which => {
            const hp = node[which];
            if (!hp) return null;
            const setH = (axis: 'x' | 'y') => (v: number) => {
              const c = moveHandle(g.contours[single[0]], single[1], which, { ...hp, [axis]: v }, false);
              api.editPart(gg => { gg.contours[single[0]] = c; }, 'Mover asa', `insp-${which}-${axis}`);
            };
            return (
              <div key={which}>
                <p className="ge-sub">{which === 'hi' ? 'Asa de entrada' : 'Asa de salida'}</p>
                <div className="ge-grid2">
                  <NumField inline label="X" value={hp.x} disabled={ro} onCommit={setH('x')} />
                  <NumField inline label="Y" value={hp.y} disabled={ro} onCommit={setH('y')} />
                </div>
              </div>
            );
          })}
        </>
      )}
      {box && !single && (
        <>
          <div className="ge-grid2">
            <NumField inline label="X" value={box.x0} disabled={ro} onCommit={v => apply(moveSelection(part, sel, v - box.x0, 0), 'Mover', 'insp-box-x')} title="Borde izquierdo de la selección" />
            <NumField inline label="Y" value={box.y0} disabled={ro} onCommit={v => apply(moveSelection(part, sel, 0, v - box.y0), 'Mover', 'insp-box-y')} title="Borde inferior de la selección" />
            <NumField inline label="An" value={w} min={1} disabled={ro || w < 1e-6} title="Ancho de la selección"
              onCommit={v => { const sx = v / w; apply(transformSelection(part, sel, scaleAbout(sx, ratio ? sx : 1, box.x0, box.y0)), 'Escalar', 'insp-box-w'); }} />
            <NumField inline label="Al" value={h} min={1} disabled={ro || h < 1e-6} title="Alto de la selección"
              onCommit={v => { const sy = v / h; apply(transformSelection(part, sel, scaleAbout(ratio ? sy : 1, sy, box.x0, box.y0)), 'Escalar', 'insp-box-h'); }} />
          </div>
          <label className="ge-chk"><input type="checkbox" checked={ratio} onChange={e => setRatio(e.target.checked)} />Mantener proporción</label>
          <div className="ge-grid2 ge-apply">
            <div className="ge-applyrow">
              <NumField label="Rotar" suffix="°" value={rot} min={-360} max={360} onCommit={setRot} disabled={ro} title="Grados; positivo: en contra de las agujas del reloj" />
              <button type="button" className="ge-btn" disabled={ro} onClick={() => api.rotate(rot)}>Rotar</button>
            </div>
            <div className="ge-applyrow">
              <NumField label="Escala" suffix="%" value={pct} min={1} max={1000} onCommit={setPct} disabled={ro} />
              <button type="button" className="ge-btn" disabled={ro} onClick={() => api.scale(pct / 100, pct / 100)}>Escalar</button>
            </div>
          </div>
        </>
      )}
      <div className="ge-acts ge-acts2">
        <ActBtn id="duplicar" label="Duplicar" keys="Control+D" title="Duplicar (Ctrl+D)" onClick={run('duplicar')} disabled={ro} />
        <ActBtn id="eliminar" label="Eliminar" keys="Delete" title="Eliminar (Supr)" onClick={run('eliminar')} disabled={ro} />
        <ActBtn id="reflejar-h" label="Reflejar horizontal" onClick={run('reflejar-h')} disabled={ro || !box} />
        <ActBtn id="reflejar-v" label="Reflejar vertical" onClick={run('reflejar-v')} disabled={ro || !box} />
        {anyOpen && <ActBtn id="cerrar" label="Cerrar trazo" onClick={run('cerrar')} disabled={ro} />}
        {anyClosed && <ActBtn id="abrir" label="Abrir trazo" onClick={run('abrir')} disabled={ro} />}
        <ActBtn id="invertir" label="Invertir dirección" onClick={run('invertir')} disabled={ro || !touched.length} />
        <ActBtn label="Deseleccionar" keys="Escape" onClick={() => store.setState({ sel: EMPTY_SEL })} />
      </div>
    </div>
  );
}

/* ---------------- glyph: advance and side bearings ---------------- */

function GlyphPanel({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const api = useEditorApi();
  const ro = !api.editable;
  const adv = effectiveAdvance(doc, g);
  const follows = advanceFollowsCell(doc, g);
  const box = useMemo(() => bboxOf(glyphContours(doc, g.ch)), [doc, g]);
  const sb = sidebearings(box, adv);
  const u = doc.metrics.upm;
  return (
    <div>
      <div className="ge-grid2">
        <NumField label="Avance" value={adv} min={0} max={u * 8} disabled={ro || follows} hint={follows ? 'Sigue a la celda' : undefined}
          onCommit={v => api.editPart(gg => { gg.adv = v; }, 'Avance', 'insp-adv')} />
        <span />
        <NumField label="Margen izquierdo" value={sb ? sb.lsb : null} min={-u} max={u * 4} disabled={ro || !sb} hint={sb ? undefined : 'Sin dibujo'}
          onCommit={v => { if (!box) return; const e = lsbEdit(box, adv, v, follows); api.editPart(gg => { shiftGlyph(gg, e.dx); if (!follows) gg.adv = e.adv; }, 'Margen izquierdo', 'insp-lsb'); }} />
        <NumField label="Margen derecho" value={sb ? sb.rsb : null} min={-u} max={u * 4} disabled={ro || !sb || follows} hint={!sb ? 'Sin dibujo' : follows ? 'Activa «Avance propio»' : undefined}
          onCommit={v => { if (!box) return; api.editPart(gg => { gg.adv = rsbEdit(box, v); }, 'Margen derecho', 'insp-rsb'); }} />
      </div>
      {doc.mode === 'ascii' && (
        <label className="ge-chk">
          <input type="checkbox" checked={!!g.ownAdv} disabled={ro}
            onChange={e => { const on = e.target.checked; api.editPart(gg => { if (on) { gg.ownAdv = true; gg.adv = doc.metrics.cell; } else delete gg.ownAdv; }, on ? 'Avance propio' : 'Avance de la celda'); }} />
          Avance propio
        </label>
      )}
    </div>
  );
}

/* ---------------- components ---------------- */

function ComponentsPanel({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const api = useEditorApi();
  const store = useEdStore();
  const sel = useEd(s => s.sel);
  const ro = !api.editable;
  const cands = useMemo(() => componentCandidates(doc, g.ch), [doc, g.ch]);
  const [pick, setPick] = useState('');
  const chosen = cands.includes(pick) ? pick : cands[0] ?? '';
  const add = () => {
    const prob = componentProblem(doc, g.ch, chosen);
    if (prob) { api.say(prob); return; }
    const ok = api.editPart(gg => {
      const ref = { of: chosen, dx: 0, dy: 0 };
      gg.components.push(ref);
      const place = anchorPlacement(doc, gg, gg.components.length - 1);
      if (place) { ref.dx = place.dx; ref.dy = place.dy; }
    }, 'Añadir componente');
    if (ok) { store.setState({ sel: { ...EMPTY_SEL, components: [g.components.length] } }); api.say(`Componente «${chosen}» añadido`); }
  };
  return (
    <div>
      {g.components.length === 0 && <p className="ge-empty">Usa otro glifo dentro de este (una letra y su acento): se dibuja con su forma actual.</p>}
      <ul className="ge-list">
        {g.components.map((k, i) => {
          const place = anchorPlacement(doc, g, i);
          const on = sel.components.includes(i);
          return (
            <li key={i} className={'ge-item' + (on ? ' on' : '')}>
              <div className="ge-item-head">
                <button type="button" className="ge-pickch" aria-pressed={on} title="Seleccionar en el lienzo" onClick={() => store.setState({ sel: { ...EMPTY_SEL, components: [i] } })}>{k.of}</button>
                <span className="ge-item-t">{k.manual ? 'Colocado a mano' : 'Colocado por anclas'}</span>
                <button type="button" className="ge-mini" disabled={ro} onClick={() => api.editPart(gg => { gg.components.splice(i, 1); }, 'Quitar componente')} aria-label={`Quitar el componente ${k.of}`}>Quitar</button>
              </div>
              <div className="ge-grid3">
                <NumField inline label="X" value={k.dx} disabled={ro} onCommit={v => api.editPart(gg => { gg.components[i].dx = v; gg.components[i].manual = true; }, 'Mover componente', `insp-comp-${i}-x`)} />
                <NumField inline label="Y" value={k.dy} disabled={ro} onCommit={v => api.editPart(gg => { gg.components[i].dy = v; gg.components[i].manual = true; }, 'Mover componente', `insp-comp-${i}-y`)} />
                <NumField inline label="%" value={(k.s ?? 1) * 100} min={5} max={2000} disabled={ro} title="Escala del componente"
                  onCommit={v => api.editPart(gg => { const c = gg.components[i]; if (Math.abs(v - 100) < 1e-9) delete c.s; else c.s = v / 100; }, 'Escalar componente', `insp-comp-${i}-s`)} />
              </div>
              <button type="button" className="ge-btn ge-wide" disabled={ro || !place}
                title={place ? `Pone su ancla «_${place.anchor}» sobre «${place.anchor}»` : 'Hace falta un ancla «_top» en este componente y «top» en la base'}
                onClick={() => { if (!place) return; api.editPart(gg => { const c = gg.components[i]; c.dx = place.dx; c.dy = place.dy; delete c.manual; }, 'Colocar por anclas'); }}>
                Colocar por anclas
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ge-addrow">
        <label className="ge-nf-lbl" htmlFor={'ge-comp-' + g.ch.codePointAt(0)}>Carácter</label>
        <select id={'ge-comp-' + g.ch.codePointAt(0)} className="ge-select" value={chosen} disabled={ro || !cands.length} onChange={e => setPick(e.target.value)}>
          {cands.length ? cands.map(c => <option key={c} value={c}>{c === ' ' ? 'espacio' : c}</option>) : <option value="">Ninguno con dibujo</option>}
        </select>
        <button type="button" className="ge-btn" disabled={ro || !chosen} onClick={add}>Añadir componente</button>
      </div>
    </div>
  );
}

/* ---------------- anchors ---------------- */

function AnchorName({ name, onRename, disabled, taken }: { name: string; onRename: (n: string) => void; disabled: boolean; taken: (n: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const commit = () => {
    if (draft === null) return;
    const r = cleanAnchorName(draft);
    if (typeof r !== 'string') { setErr(r.error); return; }
    if (r !== name && taken(r)) { setErr('Ya hay un ancla con ese nombre.'); return; }
    setDraft(null); setErr('');
    if (r !== name) onRename(r);
  };
  return (
    <span className={'ge-aname' + (err ? ' ge-nf-bad' : '')}>
      <input type="text" aria-label="Nombre del ancla" value={draft ?? name} disabled={disabled} maxLength={20} spellCheck={false}
        aria-invalid={!!err || undefined} onChange={e => { setDraft(e.target.value); setErr(''); }} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { setDraft(null); setErr(''); } }} />
      {err && <span className="ge-nf-msg" role="status">{err}</span>}
    </span>
  );
}

function AnchorsPanel({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const api = useEditorApi();
  const store = useEdStore();
  const sel = useEd(s => s.sel);
  const ro = !api.editable;
  const [preset, setPreset] = useState<string>('top');
  const [custom, setCustom] = useState('');
  const [err, setErr] = useState('');
  const own = useMemo(() => bboxOf(g.contours), [g.contours]);
  const add = () => {
    const raw = preset === 'otra' ? custom : preset;
    const r = cleanAnchorName(raw);
    if (typeof r !== 'string') { setErr(r.error); return; }
    if (anchorExists(g.anchors, r)) { setErr('Ya hay un ancla con ese nombre.'); return; }
    setErr('');
    const p = defaultAnchorPos(r, own, effectiveAdvance(doc, g), doc.metrics.xh);
    if (api.editPart(gg => { gg.anchors.push({ name: r, x: p.x, y: p.y }); }, 'Añadir ancla')) store.setState({ sel: { ...EMPTY_SEL, anchors: [g.anchors.length] } });
  };
  return (
    <div>
      {g.anchors.length === 0 && <p className="ge-empty">Las anclas dicen dónde va un acento: «top» en la letra base, «_top» en el acento.</p>}
      <ul className="ge-list">
        {g.anchors.map((a, i) => (
          <li key={i} className={'ge-item ge-item-row' + (sel.anchors.includes(i) ? ' on' : '')}>
            <AnchorName name={a.name} disabled={ro} taken={n => anchorExists(g.anchors, n, i)} onRename={n => api.editPart(gg => { gg.anchors[i].name = n; }, 'Renombrar ancla')} />
            <NumField inline label="X" value={a.x} disabled={ro} onCommit={v => api.editPart(gg => { gg.anchors[i].x = v; }, 'Mover ancla', `insp-anchor-${i}-x`)} />
            <NumField inline label="Y" value={a.y} disabled={ro} onCommit={v => api.editPart(gg => { gg.anchors[i].y = v; }, 'Mover ancla', `insp-anchor-${i}-y`)} />
            <button type="button" className="ge-mini" disabled={ro} aria-label={`Quitar el ancla ${a.name}`} onClick={() => api.editPart(gg => { gg.anchors.splice(i, 1); }, 'Quitar ancla')}>Quitar</button>
          </li>
        ))}
      </ul>
      <div className="ge-addrow">
        <label className="ge-nf-lbl" htmlFor={'ge-anc-' + g.ch.codePointAt(0)}>Nueva ancla</label>
        <select id={'ge-anc-' + g.ch.codePointAt(0)} className="ge-select" value={preset} disabled={ro} onChange={e => { setPreset(e.target.value); setErr(''); }}>
          {ANCHOR_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
          <option value="otra">Otra…</option>
        </select>
        {preset === 'otra' && <input type="text" className="ge-text" aria-label="Nombre de la nueva ancla" value={custom} maxLength={20} disabled={ro} onChange={e => { setCustom(e.target.value); setErr(''); }} />}
        <button type="button" className="ge-btn" disabled={ro} onClick={add}>Añadir ancla</button>
      </div>
      {err && <p className="ge-nf-msg" role="status">{err}</p>}
    </div>
  );
}

/* ---------------- picture layer ---------------- */

function RasterPanel({ doc, g, inkOf }: { doc: GlyphDoc; g: Glyph; inkOf?: GlyphEditorProps['inkOf'] }) {
  const api = useEditorApi();
  const store = useEdStore();
  const moveImage = useEd(s => s.moveImage);
  const ro = !api.editable;
  const r = g.raster!;
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const setR = (fn: (rr: NonNullable<Glyph['raster']>) => void, label: string, key?: string) => api.editPart(gg => { if (gg.raster) fn(gg.raster); }, label, key);
  const vectorize = (mode: VectorizeMode) => {
    setAsk(false);
    if (!inkOf) { setNote({ text: 'Vectorizar no está disponible aquí.', bad: true }); return; }
    const ink = inkOf(r.img, r.crop, r.read);
    if (!ink) { setNote({ text: 'La imagen no está en este navegador: vuelve a importarla.', bad: true }); return; }
    const res = traceBitmap(ink.ink, ink.w, ink.h, { threshold: r.threshold, place: tracePlace(r, ink) });
    if (!res.contours.length) { setNote({ text: 'No se encontró tinta con este umbral. Prueba otro umbral u otra lectura.', bad: true }); return; }
    if (api.editPart(gg => applyVectorized(gg, res.contours, mode), 'Vectorizar')) {
      const n = res.contours.length;
      setNote({ text: `${n} ${n === 1 ? 'contorno' : 'contornos'}. La imagen queda como guía.${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}`, bad: false });
      api.say(`Vectorizado: ${n} ${n === 1 ? 'contorno' : 'contornos'}`);
    }
  };
  const name = doc.images[r.img]?.name;
  return (
    <div>
      {name && <p className="ge-kv"><span>Archivo</span><span className="ge-mono ge-ellip" title={name}>{name}</span></p>}
      <label className="ge-chk"><input type="checkbox" checked={r.visible} disabled={ro} onChange={e => { const on = e.target.checked; setR(rr => { rr.visible = on; }, on ? 'Mostrar imagen' : 'Ocultar imagen'); }} />Visible (45 %)</label>
      <p className="ge-sub" id={'ge-uso-' + g.ch.codePointAt(0)}>Uso</p>
      <div className="ge-seg" role="radiogroup" aria-labelledby={'ge-uso-' + g.ch.codePointAt(0)}>
        {([['guia', 'Guía'], ['glifo', 'Glifo']] as const).map(([u, n]) => (
          <button key={u} type="button" role="radio" aria-checked={r.use === u} disabled={ro} onClick={() => setR(rr => { rr.use = u; }, u === 'guia' ? 'Imagen como guía' : 'Imagen como glifo')}>{n}</button>
        ))}
      </div>
      <p className="ge-hint">{r.use === 'guia' ? 'Solo se ve debajo del dibujo.' : 'El glifo son estos píxeles hasta que lo vectorices.'}</p>
      <div className="ge-range">
        <label htmlFor={'ge-umbral-' + g.ch.codePointAt(0)} className="ge-nf-lbl">Umbral</label>
        <input id={'ge-umbral-' + g.ch.codePointAt(0)} type="range" min={0} max={1} step={0.01} value={r.threshold} disabled={ro}
          aria-valuetext={fmtNum(r.threshold, 2)} onChange={e => { const t = Number(e.target.value); setR(rr => { rr.threshold = t; }, 'Umbral', 'raster-umbral'); }} />
        <output className="ge-val">{fmtNum(r.threshold, 2)}</output>
      </div>
      <p className="ge-sub" id={'ge-lec-' + g.ch.codePointAt(0)}>Lectura</p>
      <div className="ge-seg" role="radiogroup" aria-labelledby={'ge-lec-' + g.ch.codePointAt(0)}>
        {([['transparencia', 'Transparencia'], ['oscuro', 'Oscuro']] as const).map(([u, n]) => (
          <button key={u} type="button" role="radio" aria-checked={r.read === u} disabled={ro} onClick={() => setR(rr => { rr.read = u; }, 'Lectura de la imagen')}>{n}</button>
        ))}
      </div>
      <div className="ge-grid3">
        <NumField inline label="X" value={r.x} disabled={ro} onCommit={v => setR(rr => { rr.x = v; }, 'Mover imagen', 'raster-x')} />
        <NumField inline label="Y" value={r.y} disabled={ro} onCommit={v => setR(rr => { rr.y = v; }, 'Mover imagen', 'raster-y')} />
        <NumField inline label="Esc" value={r.s} min={0.01} max={1000} digits={3} step={0.1} disabled={ro} title="Unidades por píxel" onCommit={v => setR(rr => { rr.s = v; }, 'Escala de la imagen', 'raster-s')} />
      </div>
      <label className="ge-chk"><input type="checkbox" checked={moveImage} disabled={ro} onChange={e => store.setState({ moveImage: e.target.checked, tool: 'seleccionar' })} />Mover imagen con Seleccionar</label>
      {!ask && <button type="button" className="ge-btn ge-primary ge-wide" disabled={ro || !inkOf} title={inkOf ? 'Convierte la imagen en contornos' : 'No disponible aquí'}
        onClick={() => { setNote(null); if (g.contours.length) setAsk(true); else vectorize('reemplazar'); }}>Vectorizar</button>}
      {ask && (
        <div className="ge-confirm" role="group" aria-label="Este glifo ya tiene contornos">
          <p>Este glifo ya tiene {g.contours.length} {g.contours.length === 1 ? 'contorno' : 'contornos'}. ¿Qué hago con lo vectorizado?</p>
          <div className="ge-acts">
            <button type="button" className="ge-btn ge-primary" onClick={() => vectorize('reemplazar')} autoFocus>Reemplazar contornos</button>
            <button type="button" className="ge-btn" onClick={() => vectorize('anadir')}>Añadir a los contornos</button>
            <button type="button" className="ge-btn" onClick={() => setAsk(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {note && <p className={'ge-note-line' + (note.bad ? ' bad' : '')} role="status">{note.text}</p>}
    </div>
  );
}

/* ---------------- guides ---------------- */

function GuidesPanel({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const api = useEditorApi();
  const ro = !api.docEditable;
  const adv = effectiveAdvance(doc, g);
  return (
    <div>
      {doc.guides.length === 0 && <p className="ge-empty">Las guías se comparten entre todos los glifos. Arrastra desde las reglas del lienzo o usa la herramienta Guía.</p>}
      <ul className="ge-list">
        {doc.guides.map((gd, i) => (
          <li key={i} className="ge-item ge-item-row">
            <span className="ge-item-t">{gd.axis === 'x' ? 'Vertical' : 'Horizontal'}</span>
            <NumField inline label={gd.axis === 'x' ? 'X' : 'Y'} value={gd.at} disabled={ro} onCommit={v => api.editDoc(d => { if (d.guides[i]) d.guides[i].at = v; }, 'Mover guía', `guide-${i}`)} />
            <button type="button" className="ge-mini" disabled={ro} aria-label={`Quitar la guía ${i + 1}`} onClick={() => api.editDoc(d => { d.guides.splice(i, 1); }, 'Quitar guía')}>Quitar</button>
          </li>
        ))}
      </ul>
      <div className="ge-acts">
        <button type="button" className="ge-btn" disabled={ro} onClick={() => api.editDoc(d => { d.guides.push({ axis: 'y', at: Math.round(doc.metrics.xh / 2) }); }, 'Añadir guía horizontal')}>Añadir horizontal</button>
        <button type="button" className="ge-btn" disabled={ro} onClick={() => api.editDoc(d => { d.guides.push({ axis: 'x', at: Math.round(adv / 2) }); }, 'Añadir guía vertical')}>Añadir vertical</button>
      </div>
    </div>
  );
}
