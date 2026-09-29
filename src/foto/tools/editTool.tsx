/**
 * «Editar partes» (V): click selects the topmost part of the target's mask under the pointer (hit testing for
 * every kind, geom.ts), then its handles: shapes move/resize/rotate, polygons drag vertices (double-click an
 * edge to insert one, Retroceso deletes the selected vertex), gradients move their ends, strokes move, painted
 * or object pictures move (the picture is re-made) or open the brushes / the object's points; colour parts
 * change their colour settings. Supr deletes the part; the operation, strength and softness are in the
 * options. Keyboard: Tab / ⇧Tab walk through the parts, arrows move (⇧ × 10), ⌥ + arrows resize, [ ] rotate,
 * Esc drops the selection. Each change is one undo step.
 */
import type { Id, MaskOp, MaskPart } from '../../project/types';
import { putMedia } from '../../project/persist';
import { storeBlob } from '../../project/sources';
import { useProject } from '../../project/store';
import { colorStrength, fromHex } from './color';
import { dist, hitTop, insertVertex, nearestEdge, type HitContext, type Pt } from './geom';
import { PartEditor, drawPart } from './editor';
import { ICONS } from './icons';
import { objectTool } from './objectTool';
import { signal } from './state';
import { usePartDraft } from './draft';
import { canvasPixels, canvasSize, editableTarget, layerById, layerPoint, partsOf, removePart, replacePart, screenPerPx } from './target';
import type { Tool, ToolHost } from './types';
import { Button, Note, Segmented, Slider, Swatch, pct, px } from './ui';

export const PART_NAME = (p: MaskPart): string => {
  switch (p.kind) {
    case 'rect': return 'Rectángulo';
    case 'ellipse': return 'Elipse';
    case 'polygon': return 'Polígono';
    case 'stroke': return 'Trazo de pincel';
    case 'gradient': return p.shape === 'radial' ? 'Degradado circular' : 'Degradado';
    case 'color': return 'Color';
    case 'raster': return p.origin === 'object' ? 'Objeto' : p.origin === 'subject' ? 'Sujeto recortado' : p.origin === 'background' ? 'Fondo recortado' : p.origin === 'track' ? 'Seguimiento' : 'Máscara pintada';
  }
};

const OPS: Array<{ value: MaskOp; label: string }> = [{ value: 'add', label: 'Sumar' }, { value: 'subtract', label: 'Restar' }, { value: 'intersect', label: 'Intersecar' }];

/* ------------------------------------------------------------------ pixels for hit tests */

const rasters = new Map<string, { w: number; h: number; cov: Uint8ClampedArray } | 'loading' | 'missing'>();
let colorSrc: { key: string; data: Uint8ClampedArray; w: number; h: number } | null = null;

async function loadRaster(id: string) {
  if (rasters.has(id)) return;
  rasters.set(id, 'loading');
  try {
    const got = await storeBlob(id);
    if (!got) { rasters.set(id, 'missing'); return; }
    const bmp = await createImageBitmap(got.blob);
    const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const d = x.getImageData(0, 0, w, h).data;
    const cov = new Uint8ClampedArray(w * h);
    for (let i = 0; i < cov.length; i++) cov[i] = Math.round(((0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) * d[i * 4 + 3]) / 255);
    rasters.set(id, { w, h, cov });
  } catch { rasters.set(id, 'missing'); }
}

async function loadColors(host: ToolHost) {
  const key = `${host.target()}|${host.view().canvas.w}`;
  if (colorSrc?.key === key) return;
  const c = await host.sourcePixels();
  if (!c) return;
  const px = canvasPixels(c);
  colorSrc = { key, data: px.data, w: px.w, h: px.h };
}

const sample: HitContext['sample'] = (part, p) => {
  if (part.kind === 'raster') {
    const r = part.media.id ? rasters.get(part.media.id) : undefined;
    if (!r || typeof r === 'string') { if (part.media.id && !r) void loadRaster(part.media.id); return null; }
    const x = Math.floor(p.x * r.w), y = Math.floor(p.y * r.h);
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return 0;
    return (r.cov[y * r.w + x] / 255) * part.alpha;
  }
  if (part.kind === 'color') {
    if (!colorSrc) return null;
    const x = Math.floor(p.x * colorSrc.w), y = Math.floor(p.y * colorSrc.h);
    if (x < 0 || y < 0 || x >= colorSrc.w || y >= colorSrc.h) return 0;
    const o = (y * colorSrc.w + x) * 4, d = colorSrc.data;
    return colorStrength([d[o], d[o + 1], d[o + 2]], fromHex(part.color), part.tol, part.soft) * part.alpha;
  }
  return null;
};

/** Moves a stored mask picture by (dx, dy) frame units: a new picture, same size (what leaves the frame is lost). */
async function shiftRaster(host: ToolHost, layer: Id, index: number, dx: number, dy: number) {
  const part = partsOf(layerById(layer))[index];
  if (part?.kind !== 'raster' || !part.media.id) return;
  const got = await storeBlob(part.media.id);
  if (!got) { host.say('Falta la imagen de esta parte en el navegador.'); return; }
  const bmp = await createImageBitmap(got.blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, Math.round(dx * c.width), Math.round(dy * c.height));
  bmp.close();
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  if (!blob) return;
  const { stored: _s, ...media } = await putMedia(blob, { kind: 'image', name: part.media.name ?? 'mascara.png', w: part.media.w, h: part.media.h });
  // the part may have been edited meanwhile: only replace the one we moved
  const now = partsOf(layerById(layer))[index];
  if (JSON.stringify(now) !== JSON.stringify(part)) return;
  const next = { ...part, media, ...(part.origin === 'object' && part.points ? { points: part.points.map(q => ({ ...q, x: q.x + dx, y: q.y + dy })) } : {}) };
  if (replacePart(layer, index, next)) {
    editTool.editor.select(layer, index, next);
    host.say('Máscara movida');
    host.redrawOverlay();
  }
}

/* ------------------------------------------------------------------ the tool */

export const editTool: Tool & { editor: PartEditor; select(host: ToolHost, index: number): void } = (() => {
  const editor = new PartEditor();
  const changed = signal();
  editor.onChange = () => changed.bump();
  editor.sample = sample;
  let lastDown: { t: number; s: Pt } | null = null;
  let current: ToolHost | null = null;
  editor.onRasterMove = (sel, dx, dy) => { if (current) void shiftRaster(current, sel.layer, sel.index, dx, dy); };

  const preload = (host: ToolHost) => {
    for (const p of partsOf(layerById(host.target()))) {
      if (p.kind === 'raster' && p.media.id) void loadRaster(p.media.id);
      if (p.kind === 'color') void loadColors(host);
    }
  };

  const selectIndex = (host: ToolHost, i: number) => {
    const l = layerById(host.target());
    const parts = partsOf(l);
    if (!l || i < 0 || i >= parts.length) { editor.clear(); host.redrawOverlay(); return; }
    editor.select(l.id, i, parts[i]);
    host.say(`${PART_NAME(parts[i])} (${i + 1} de ${parts.length}) seleccionado`);
    host.redrawOverlay();
  };

  const tool: Tool & { editor: PartEditor; select(host: ToolHost, index: number): void } = {
    id: 'editar-partes',
    name: 'Editar partes',
    hint: 'Haz clic en una zona de la máscara para elegirla y ajústala con sus asas; Supr la borra. Tab recorre las partes con el teclado. En teléfono: toca una zona y arrastra sus asas.',
    shortcut: 'V',
    group: 'seleccion',
    icon: ICONS.edit,
    cursor: 'default',
    draws: true,
    editor,
    select: selectIndex,

    activate(host) { current = host; preload(host); },
    deactivate(host) { current = null; editor.cancel(host); editor.clear(); host.preview(null); },

    down(e, host) {
      current = host;
      const l = editableTarget(host);
      if (!l) return;
      editor.touch = e.pointerType === 'touch';
      preload(host);
      const dbl = !!lastDown && e.time - lastDown.t < 400 && dist(lastDown.s, e.s) < 8;
      lastDown = { t: e.time, s: e.s };
      const sel = editor.current(host);
      // double-click on a polygon's edge: a new vertex there
      if (dbl && sel?.part.kind === 'polygon') {
        const s = canvasSize(host), k = screenPerPx(host);
        const lp = layerPoint(host, e.p);
        const edge = nearestEdge(sel.part.pts, lp, true, s.w, s.h);
        if (edge.d * k <= (editor.touch ? 22 : 8)) {
          const next = { ...sel.part, pts: insertVertex(sel.part.pts, edge.i, lp).map(v => Math.round(v * 1e5) / 1e5) };
          if (replacePart(sel.layer, sel.index, next)) {
            editor.select(sel.layer, sel.index, next);
            editor.vertex = edge.i + 1;
            host.say(`Vértice añadido (${next.pts.length >> 1} en total)`);
            host.redrawOverlay();
          }
          return;
        }
      }
      const grab = editor.grabAt(host, e);
      if (grab) { editor.down(host, e, grab); return; }
      const s = canvasSize(host), k = screenPerPx(host);
      const i = hitTop(partsOf(l), layerPoint(host, e.p), { size: s, tol: (editor.touch ? 18 : 6) / k, sample });
      if (i < 0) { if (editor.sel) { editor.clear(); host.say('Ninguna parte seleccionada'); } host.redrawOverlay(); return; }
      selectIndex(host, i);
      editor.down(host, e);
    },

    move(e, host) { editor.move(host, e); },
    up(_e, host) { editor.up(host); },
    cancel(host) { editor.cancel(host); },

    onKey(e, host) {
      if (e.metaKey || e.ctrlKey) return false;
      const parts = partsOf(layerById(host.target()));
      if (e.key === 'Tab' && parts.length && !(editor.current(host)?.part.kind === 'gradient' && e.altKey)) {
        const cur = editor.current(host)?.index ?? (e.shiftKey ? parts.length : -1);
        selectIndex(host, (cur + (e.shiftKey ? -1 : 1) + parts.length) % parts.length);
        return true;
      }
      return editor.key(host, e, { allowDelete: true });
    },

    overlay(ctx, host) {
      const l = layerById(host.target());
      const sel = editor.current(host);
      partsOf(l).forEach((p, i) => { if (i !== sel?.index) drawPart(ctx, host, p, { dash: [3, 4] }); });
      editor.draw(ctx, host);
    },

    Options: ({ host }) => <EditOptions host={host} editor={editor} use={changed.use} />,
  };
  return tool;
})();

function EditOptions({ host, editor, use }: { host: ToolHost; editor: PartEditor; use: () => number }) {
  use();
  useProject(s => s.project);
  const sel = editor.current(host);
  const parts = partsOf(layerById(host.target()));
  const d = usePartDraft(host, sel, p => { if (editor.sel) editor.sel.part = p; host.redrawOverlay(); });
  if (!sel) {
    return (
      <div className="tl-opts" data-tool="editar-partes">
        <span className="tl-title">Editar partes</span>
        <Note tone="quiet">{parts.length ? `La máscara tiene ${parts.length} ${parts.length === 1 ? 'parte' : 'partes'}: haz clic en una (o pulsa Tab).` : 'Esta capa todavía no tiene máscara: dibuja una zona con otra herramienta.'}</Note>
        {parts.length ? <Button onClick={() => editTool.select(host, parts.length - 1)} kbd="Tab">Elegir la última</Button> : null}
      </div>
    );
  }
  const p = d.part ?? sel.part;
  /** Sliders: previewed, one undo step when let go. Choices (op, shape): at once. */
  const set = (patch: Partial<MaskPart>, now = false) => {
    if (!now) { d.set(patch); return; }
    d.flush();
    const next = { ...sel.part, ...patch } as MaskPart;
    if (replacePart(sel.layer, sel.index, next)) { sel.part = next; host.redrawOverlay(); }
  };
  const commit = (_v: number, how: 'pointer' | 'key') => d.commit(how);
  return (
    <div className="tl-opts" data-tool="editar-partes">
      <span className="tl-title">{PART_NAME(p)} · {sel.index + 1}/{parts.length}</span>
      <Segmented label="Operación" value={p.op} options={OPS} onChange={v => { set({ op: v }, true); host.say(`La parte ahora ${v === 'add' ? 'suma' : v === 'subtract' ? 'resta' : 'interseca'}`); }} />
      <Slider label="Intensidad" value={p.alpha} min={0} max={1} step={0.05} format={pct} onChange={v => set({ alpha: v })} onCommit={commit} />
      {'soft' in p && p.kind !== 'color' ? <Slider label="Borde suave" value={p.soft} min={0} max={80} step={1} format={px} onChange={v => set({ soft: v } as Partial<MaskPart>)} onCommit={commit} /> : null}
      {p.kind === 'stroke' ? <Slider label="Dureza" value={p.hardness} min={0} max={1} step={0.05} format={pct} onChange={v => set({ hardness: v } as Partial<MaskPart>)} onCommit={commit} /> : null}
      {p.kind === 'color' ? (
        <>
          <Swatch color={p.color} label={`Color ${p.color}`} />
          <Slider label="Tolerancia" value={p.tol} min={0} max={0.6} step={0.005} format={pct} onChange={v => set({ tol: v } as Partial<MaskPart>)} onCommit={commit} />
          <Slider label="Suavidad" value={p.soft} min={0} max={0.4} step={0.005} format={pct} onChange={v => set({ soft: v } as Partial<MaskPart>)} onCommit={commit} />
        </>
      ) : null}
      {p.kind === 'gradient' ? (
        <>
          <Segmented label="Forma" value={p.shape} options={[{ value: 'linear', label: 'Lineal' }, { value: 'radial', label: 'Circular' }]} onChange={v => set({ shape: v } as Partial<MaskPart>, true)} />
          <Slider label="Inicio" value={p.alpha0} min={0} max={1} step={0.05} format={pct} onChange={v => set({ alpha0: v } as Partial<MaskPart>)} onCommit={commit} />
          <Slider label="Final" value={p.alpha1} min={0} max={1} step={0.05} format={pct} onChange={v => set({ alpha1: v } as Partial<MaskPart>)} onCommit={commit} />
        </>
      ) : null}
      {p.kind === 'raster' && p.origin === 'object' ? (
        <Button onClick={() => { objectTool.reedit(sel.layer, sel.index); if (host.setTool) host.setTool('objeto'); }} disabled={!host.setTool}>Editar puntos</Button>
      ) : null}
      {(p.kind === 'raster' || p.kind === 'color') && host.setTool ? (
        <Button onClick={() => host.setTool!('pasar-a-ascii')} title="Pinta encima para añadir o quitar: los trazos se combinan con esta parte">Editar con pinceles</Button>
      ) : null}
      {p.kind === 'polygon' ? <Note tone="quiet">Doble clic en un borde añade un vértice; Retroceso borra el elegido.</Note> : null}
      <Button danger onClick={() => { if (removePart(sel.layer, sel.index)) { editor.clear(); host.say('Parte borrada de la máscara'); host.redrawOverlay(); } }} kbd="Supr">Borrar parte</Button>
    </div>
  );
}
