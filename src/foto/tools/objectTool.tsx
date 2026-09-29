/**
 * «Objeto» (J): assisted object selection with positive/negative points (src/cutout selectObject, a
 * point-prompted segmentation model that runs in this browser).
 *
 * Nothing is downloaded until the person agrees: the option bar shows the model's name, size, licences and the
 * privacy sentence (consentInfo), with progress and «Cancelar». Then the photo is analysed once (progress,
 * cancel) and each tap adds a point: a positive one (part of the object) or, with ⌥ + click, the ± switch or a
 * long press on touch, a negative one; dragging draws a box around the object. Points are listed and removable;
 * the mask updates a moment after each change. «Aceptar» stores the matte in the media store as a
 * MaskRasterPart { origin: 'object', points } on the target's mask (one undo step). Re-editing an existing
 * object part (from «Editar partes») reopens its points and «Aceptar» replaces it.
 */
import { useState } from 'react';
import type { Id, MaskOp, MaskRasterPart } from '../../project/types';
import { useProject } from '../../project/store';
import type { Matte, SelectSession } from '../../cutout';
import { dist, type Pt } from './geom';
import { ICONS } from './icons';
import * as draw from './overlay';
import { live, setObject, useLive, type ObjectPoint } from './state';
import {
  OP_NAME, addPart, canvasSize, editableTarget, layerById, layerPoint, partsOf, rasterPart, replacePart, screenOf, storeCoverage, tabCoverage,
} from './target';
import type { Tool, ToolHost } from './types';
import { Button, Note, Progress, Row, Switch } from './ui';

type Cut = typeof import('../../cutout');
let cutP: Promise<Cut> | null = null;
const cutout = () => (cutP ??= import('../../cutout'));

export interface ObjectTimings { encodeMs: number; decodeMs: number[]; lastDecodeMs: number; previewMs: number }

export const objectTool: Tool & { timings: ObjectTimings; reedit(layer: Id, index: number): void; matte(): Matte | null } = (() => {
  let session: SelectSession | null = null;
  let sessionKey = '';
  let abort: AbortController | null = null;
  let matte: Matte | null = null;
  let edgeCanvas: HTMLCanvasElement | null = null;
  let layerId: Id | null = null;
  let op: MaskOp = 'add';
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let decodeGen = 0;
  let press: { s: Pt; p: Pt; touch: boolean; negative: boolean; timer: ReturnType<typeof setTimeout> | null; moved: boolean; layer: Id } | null = null;
  let pendingReedit: { layer: Id; index: number } | null = null;
  let hostRef: ToolHost | null = null;
  const timings: ObjectTimings = { encodeMs: 0, decodeMs: [], lastDecodeMs: 0, previewMs: 0 };

  const obj = () => live().object;

  const keyOf = (host: ToolHost) => `${host.target()}|${host.view().canvas.w}x${host.view().canvas.h}`;

  async function checkModel(host: ToolHost) {
    const cut = await cutout();
    const info = await cut.consentInfo('select');
    if (!info.available) { setObject({ phase: 'error', error: info.why ?? 'Este equipo no puede ejecutar la selección de objetos.', consent: null }); return false; }
    const state = await cut.modelState('select');
    if (state === 'absent' || state === 'error') {
      setObject({ phase: 'consent', consent: { name: info.name, size: info.size, text: info.text, licence: info.licence, note: info.note, from: info.from }, error: state === 'error' ? 'La descarga anterior falló. Puedes intentarlo de nuevo.' : null });
      host.say(`Para seleccionar objetos hace falta descargar el modelo «${info.name}» (${info.size}). Nada se descarga sin tu permiso.`);
      return false;
    }
    return true;
  }

  async function prepare(host: ToolHost) {
    if (session && sessionKey === keyOf(host)) { if (obj().phase !== 'busy') setObject({ phase: 'ready' }); return; }
    if (!(await checkModel(host))) return;
    await encode(host);
  }

  async function encode(host: ToolHost) {
    const cut = await cutout();
    session?.dispose();
    session = null;
    abort?.abort();
    const ac = new AbortController();
    abort = ac;
    setObject({ phase: 'encoding', progress: null, label: 'Analizando la foto…', error: null });
    host.say('Analizando la foto para seleccionar objetos…');
    try {
      const src = await host.sourcePixels();
      if (!src) throw new Error('Esta capa no tiene una foto que analizar.');
      const t0 = performance.now();
      const s = await cut.selectObject(src, { signal: ac.signal, onProgress: p => setObject({ progress: p.p, label: p.label }) });
      if (ac.signal.aborted) { s.dispose(); return; }
      timings.encodeMs = Math.round(performance.now() - t0);
      session = s;
      sessionKey = keyOf(host);
      setObject({ phase: 'ready', progress: null, label: '' });
      host.say('Listo: toca el objeto. ⌥ + clic (o el interruptor «Quitar») marca lo que no es.');
      if (obj().points.length || obj().box) schedule(host, 0);
    } catch (e) {
      if (ac.signal.aborted || (e as { code?: string })?.code === 'aborted') { setObject({ phase: 'idle', progress: null, label: '' }); host.say('Análisis cancelado'); return; }
      setObject({ phase: 'error', error: (e as Error)?.message || 'No se pudo analizar la foto.', progress: null });
    } finally {
      if (abort === ac) abort = null;
    }
  }

  async function download(host: ToolHost) {
    const cut = await cutout();
    const ac = new AbortController();
    abort = ac;
    setObject({ phase: 'downloading', progress: 0, label: 'Empezando la descarga…', error: null });
    try {
      await cut.downloadModel('select', { signal: ac.signal, onProgress: p => setObject({ progress: p.p, label: p.label }) });
      setObject({ consent: null });
      await encode(host);
    } catch (e) {
      if (ac.signal.aborted || (e as { code?: string })?.code === 'aborted') {
        setObject({ phase: 'consent', progress: null, label: '' });
        host.say('Descarga cancelada: no se guardó nada.');
      } else setObject({ phase: 'consent', error: (e as Error)?.message || 'La descarga falló.', progress: null });
    } finally {
      if (abort === ac) abort = null;
    }
  }

  /** Mask update a moment after the last change of points (a burst of taps decodes once). */
  function schedule(host: ToolHost, wait = 140) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = null; void decode(host); }, wait);
  }

  async function decode(host: ToolHost) {
    const s = session, o = obj();
    if (!s || !layerId) return;
    const gen = ++decodeGen;
    if (!o.points.length && !o.box) { matte = null; edgeCanvas = null; host.preview(null); host.redrawOverlay(); return; }
    const size = canvasSize(host);
    const toPx = (p: { x: number; y: number }) => ({ x: p.x * s.w, y: p.y * s.h });
    setObject({ phase: 'busy' });
    try {
      const t0 = performance.now();
      const m = await s.mask(o.points.map(p => ({ ...toPx(p), positive: p.positive })), o.box ? { x: o.box.x * s.w, y: o.box.y * s.h, w: o.box.w * s.w, h: o.box.h * s.h } : undefined);
      if (gen !== decodeGen) return;
      timings.lastDecodeMs = Math.round(performance.now() - t0);
      timings.decodeMs.push(timings.lastDecodeMs);
      matte = m;
      edgeCanvas = edges(m);
      const t1 = performance.now();
      const ref = await tabCoverage(m.alpha, m.w, m.h, 'seleccion-objeto.png');
      if (gen !== decodeGen) return;
      timings.previewMs = Math.round(performance.now() - t1);
      const o2 = obj();
      host.preview({ layer: layerId, part: rasterPart(ref, op, { origin: 'object' }), ...(o2.editing !== null ? { replace: o2.editing } : {}) });
      void size;
      host.redrawOverlay();
    } catch (e) {
      if (gen === decodeGen) setObject({ error: (e as Error)?.message || 'No se pudo calcular la selección.' });
    } finally {
      if (gen === decodeGen) setObject({ phase: session ? 'ready' : 'idle' });
    }
  }

  const setPoints = (host: ToolHost, points: ObjectPoint[], box = obj().box) => {
    setObject({ points, box });
    schedule(host);
    host.redrawOverlay();
  };

  async function accept(host: ToolHost) {
    const o = obj();
    if (!matte || !layerId) { host.say('Toca el objeto primero.'); return; }
    if (debounce || o.phase === 'busy') { await decode(host); }
    const m = matte;
    if (!m) return;
    const ref = await storeCoverage(m.alpha, m.w, m.h, 'objeto.png');
    const part: MaskRasterPart = rasterPart(ref, op, { origin: 'object', points: o.points.map(p => ({ x: round(p.x), y: round(p.y), positive: p.positive })) });
    const l = layerById(layerId);
    host.preview(null);
    let ok: boolean;
    if (o.editing !== null) {
      ok = replacePart(layerId, o.editing, part);
      if (ok) host.say(`Objeto actualizado en la máscara de «${l?.name}»`);
    } else ok = addPart(host, layerId, part, `Objeto añadido a la máscara de «${l?.name}» (${OP_NAME[op]}, ${o.points.length} ${o.points.length === 1 ? 'punto' : 'puntos'}).`);
    if (ok) reset(host, false);
  }

  function reset(host: ToolHost, say = true) {
    if (debounce) { clearTimeout(debounce); debounce = null; }
    decodeGen++;
    matte = null;
    edgeCanvas = null;
    setObject({ points: [], box: null, editing: null, error: null, ...(session ? { phase: 'ready' as const } : {}) });
    host.preview(null);
    if (say) host.say('Puntos borrados');
    host.redrawOverlay();
  }

  const round = (v: number) => Math.round(v * 1e5) / 1e5;

  function loadReedit(host: ToolHost) {
    if (!pendingReedit || pendingReedit.layer !== host.target()) return;
    const part = partsOf(layerById(pendingReedit.layer))[pendingReedit.index];
    if (part?.kind === 'raster' && part.origin === 'object') {
      layerId = pendingReedit.layer;
      op = part.op;
      setObject({ points: (part.points ?? []).map(p => ({ ...p })), box: null, editing: pendingReedit.index });
      host.say(`Editando el objeto: ${part.points?.length ?? 0} puntos. Añade o quita puntos y pulsa «Aceptar».`);
    }
    pendingReedit = null;
  }

  const tool: Tool & { timings: ObjectTimings; reedit(layer: Id, index: number): void; matte(): Matte | null } = {
    id: 'objeto',
    name: 'Objeto',
    hint: 'Toca el objeto que quieres transformar: la selección se ajusta sola. ⌥ + clic marca lo que no es parte; arrastra para encerrarlo en un recuadro. En teléfono: toca; mantén pulsado (o el interruptor «Quitar») para marcar lo que no es.',
    shortcut: 'J',
    group: 'objeto',
    icon: ICONS.object,
    cursor: 'crosshair',
    draws: true,
    timings,
    matte: () => matte,

    reedit(layer, index) {
      pendingReedit = { layer, index };
      if (hostRef) loadReedit(hostRef);
    },

    activate(host) {
      hostRef = host;
      const l = editableTarget(host, true);
      layerId = l?.id ?? null;
      loadReedit(host);
      void prepare(host);
    },

    deactivate(host) {
      abort?.abort();
      if (debounce) clearTimeout(debounce);
      debounce = null;
      decodeGen++;
      host.preview(null);
      matte = null;
      edgeCanvas = null;
      setObject({ points: [], box: null, editing: null, phase: 'idle', progress: null, label: '' });
      // the analysed photo stays for a moment if the person comes back; the worker frees it on release
      hostRef = null;
    },

    down(e, host) {
      const l = editableTarget(host);
      if (!l) return;
      if (layerId !== l.id) { reset(host, false); layerId = l.id; }
      const o = obj();
      if (o.phase === 'consent' || o.phase === 'downloading' || o.phase === 'error') { host.say('Primero descarga el modelo de selección (en las opciones).'); return; }
      if (!session || sessionKey !== keyOf(host)) { void prepare(host); if (!session || sessionKey !== keyOf(host)) { host.say('Analizando la foto de esta capa… toca de nuevo en un momento.'); return; } }
      // the operation is the options bar's (⌥ is taken: it marks a negative point)
      if (!o.points.length && !o.box && o.editing === null) op = host.op();
      const touch = e.pointerType === 'touch';
      press = { s: e.s, p: layerPoint(host, e.p), touch, negative: e.alt || !o.positive, timer: null, moved: false, layer: l.id };
      if (touch) {
        press.timer = setTimeout(() => {
          if (press && !press.moved) { press.negative = true; host.say('Punto negativo: lo que no es parte del objeto'); host.redrawOverlay(); }
        }, 520);
      }
      host.redrawOverlay();
    },

    move(e, host) {
      if (!press) return;
      if (!press.moved && dist(e.s, press.s) > (press.touch ? 12 : 6)) { press.moved = true; if (press.timer) clearTimeout(press.timer); }
      if (press.moved) {
        const b = layerPoint(host, e.p);
        const a = press.p;
        setObject({ box: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) } });
        host.redrawOverlay();
      }
    },

    up(_e, host) {
      const pr = press;
      press = null;
      if (!pr) return;
      if (pr.timer) clearTimeout(pr.timer);
      if (pr.moved) {
        const b = obj().box;
        if (b && b.w * canvasSize(host).w > 6 && b.h * canvasSize(host).h > 6) { host.say('Recuadro marcado'); schedule(host); }
        else setObject({ box: null });
        host.redrawOverlay();
        return;
      }
      const pts = [...obj().points, { x: round(pr.p.x), y: round(pr.p.y), positive: !pr.negative }];
      host.say(pr.negative ? `Punto ${pts.length}: no es parte del objeto` : `Punto ${pts.length}: parte del objeto`);
      setPoints(host, pts);
    },

    cancel(host) {
      if (press?.timer) clearTimeout(press.timer);
      press = null;
      host.redrawOverlay();
    },

    onKey(e, host) {
      if (e.key === 'Enter' && (obj().points.length || obj().box)) { void accept(host); return true; }
      if (e.key === 'Escape') {
        if (abort) { abort.abort(); return true; }
        if (obj().points.length || obj().box) { reset(host); return true; }
        return false;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && obj().points.length) { setPoints(host, obj().points.slice(0, -1)); host.say('Último punto quitado'); return true; }
      return false;
    },

    overlay(ctx, host) {
      if (layerId !== host.target()) return;
      const f = host.view().frame;
      if (edgeCanvas && matte) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(edgeCanvas, f.x, f.y, f.w, f.h);
        ctx.restore();
      }
      const scr = screenOf(host);
      const o = obj();
      if (o.box) {
        const a = scr({ x: o.box.x, y: o.box.y }), b = scr({ x: o.box.x + o.box.w, y: o.box.y + o.box.h });
        draw.quad(ctx, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], { dash: [5, 4] });
      }
      o.points.forEach((p, i) => pointMark(ctx, scr(p), p.positive, i + 1));
      if (press && !press.moved) pointMark(ctx, scr(press.p), !press.negative, o.points.length + 1, true);
      if (o.phase === 'encoding' || o.phase === 'downloading') draw.tag(ctx, { x: f.x + f.w / 2, y: f.y + 24 }, o.label || 'Preparando…', { align: 'center' });
    },

    Options: ({ host }) => <ObjectOptions host={host} actions={{ download: () => download(host), cancel: () => abort?.abort(), accept: () => accept(host), reset: () => reset(host), remove: (i: number) => setPoints(host, obj().points.filter((_, k) => k !== i)), retry: () => prepare(host) }} />,
  };
  return tool;
})();

/** A positive point: bone disc with an ink ring and «+»; a negative one: ink disc with a bone ring and «−». */
function pointMark(ctx: CanvasRenderingContext2D, p: Pt, positive: boolean, n: number, active = false) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = positive ? draw.BONE : draw.INK;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = active ? draw.SIGNAL : positive ? draw.INK : draw.BONE;
  ctx.stroke();
  ctx.strokeStyle = positive ? draw.INK : draw.BONE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - 3.5, p.y); ctx.lineTo(p.x + 3.5, p.y);
  if (positive) { ctx.moveTo(p.x, p.y - 3.5); ctx.lineTo(p.x, p.y + 3.5); }
  ctx.stroke();
  ctx.restore();
  draw.tag(ctx, { x: p.x + 10, y: p.y - 12 }, String(n));
}

/** The matte's outline (and a faint veil inside it) as a picture for the overlay, at ≤ 640 px. */
function edges(m: Matte): HTMLCanvasElement {
  const k = Math.min(1, 640 / Math.max(m.w, m.h));
  const w = Math.max(1, Math.round(m.w * k)), h = Math.max(1, Math.round(m.h * k));
  const at = (x: number, y: number) => m.alpha[Math.min(m.h - 1, Math.floor(y / k)) * m.w + Math.min(m.w - 1, Math.floor(x / k))] >= 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let xx = 0; xx < w; xx++) {
      const o = (y * w + xx) * 4;
      const on = at(xx, y);
      const edge = on && (!at(xx - 1, y) || !at(xx + 1, y) || !at(xx, y - 1) || !at(xx, y + 1) || xx === 0 || y === 0 || xx === w - 1 || y === h - 1);
      if (edge) { d[o] = 237; d[o + 1] = 230; d[o + 2] = 218; d[o + 3] = 255; }
      else if (on) { d[o] = 237; d[o + 1] = 230; d[o + 2] = 218; d[o + 3] = 34; }
      else if (at(xx - 1, y) || at(xx + 1, y) || at(xx, y - 1) || at(xx, y + 1)) { d[o] = 12; d[o + 1] = 11; d[o + 2] = 10; d[o + 3] = 150; }
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function ObjectOptions({ host, actions }: { host: ToolHost; actions: { download(): void; cancel(): void; accept(): void; reset(): void; remove(i: number): void; retry(): void } }) {
  const o = useLive(s => s.object);
  const [later, setLater] = useState(false);
  useProject(s => s.project);
  if (o.phase === 'consent' && o.consent) {
    const c = o.consent;
    if (later) {
      return (
        <div className="tl-opts" data-tool="objeto">
          <span className="tl-title">Objeto</span>
          <Note tone="quiet">Seleccionar objetos necesita un modelo de {c.size} que todavía no está en este navegador.</Note>
          <Button onClick={() => setLater(false)}>Descargar…</Button>
        </div>
      );
    }
    return (
      <div className="tl-opts" data-tool="objeto">
        <section className="tl-consent wide" aria-labelledby="tl-consent-h">
          <h3 id="tl-consent-h">¿Descargar «{c.name}» ({c.size})?</h3>
          <p>Para seleccionar objetos con puntos hace falta este modelo. Se descarga una sola vez desde {c.from} y queda guardado aquí. {c.text.replace(/\. El modelo se descarga.*$/, '.').replace('el recorte ocurre', 'la selección ocurre')}</p>
          <Note tone="quiet">Licencia: {c.licence}.{c.note ? ` ${c.note}` : ''}</Note>
          {o.error ? <Note tone="warn">{o.error}</Note> : null}
          <Row>
            <Button onClick={() => { setLater(true); host.say('Sin descarga. Puedes seleccionar con las otras herramientas.'); }}>Ahora no</Button>
            <Button primary onClick={actions.download}>Descargar {c.size}</Button>
          </Row>
        </section>
      </div>
    );
  }
  return (
    <div className="tl-opts" data-tool="objeto">
      <span className="tl-title">Objeto</span>
      {o.phase === 'downloading' || o.phase === 'encoding' ? (
        <>
          <Progress value={o.progress} label={o.label || (o.phase === 'downloading' ? 'Descargando…' : 'Analizando la foto…')} />
          <Button onClick={actions.cancel} kbd="Esc">Cancelar</Button>
        </>
      ) : o.phase === 'error' ? (
        <>
          <Note tone="warn">{o.error}</Note>
          <Button onClick={actions.retry}>Reintentar</Button>
        </>
      ) : (
        <>
          <Switch label={o.positive ? 'Añadir' : 'Quitar'} checked={!o.positive} onChange={v => setObject({ positive: !v })} hint="Qué marca el próximo toque: parte del objeto (añadir) o lo que no es (quitar)" />
          {o.points.length ? (
            <ul className="tl-points" aria-label="Puntos">
              {o.points.map((p, i) => (
                <li key={i}>
                  <span className={p.positive ? 'pos' : 'neg'}>{i + 1} {p.positive ? '+' : '−'}</span>
                  <Button label={`Quitar el punto ${i + 1}`} title={`Quitar el punto ${i + 1}`} onClick={() => actions.remove(i)}>×</Button>
                </li>
              ))}
            </ul>
          ) : <Note tone="quiet">{o.box ? 'Recuadro marcado.' : 'Toca el objeto en la foto.'}</Note>}
          {o.phase === 'busy' ? <span className="tl-mono" aria-live="polite">calculando…</span> : null}
          <Button primary disabled={!o.points.length && !o.box} onClick={actions.accept} kbd="Intro">{o.editing !== null ? 'Actualizar' : 'Aceptar'}</Button>
          <Button disabled={!o.points.length && !o.box} onClick={actions.reset} kbd="Esc">Borrar puntos</Button>
          {host.openCutout ? <Button onClick={() => host.openCutout!()} title="Recorte automático del sujeto, con refinado de bordes y PNG transparente">Quitar fondo…</Button> : null}
          <Note tone="quiet">El modelo acierta mejor con objetos claros; en bordes finos (pelo, ramas) ajusta después con los pinceles.</Note>
        </>
      )}
    </div>
  );
}
