/**
 * «Color» (W): click (tap) a colour of the photo and everything close to it joins the mask (a sky, a wall, a
 * green screen): a MaskColorPart with a tolerance and a soft ramp (same meaning as the cutout's matteFromColor:
 * RGB distance / (255·√3)). A click replaces the colour this tool just made; ⇧ + click adds another colour. On
 * touch a loupe above the finger shows the pixel before it is lifted. Tolerance and softness update the part
 * live. Keyboard: arrows move a probe, Intro picks there (⇧ + Intro adds).
 */
import type { Id, MaskColorPart, MaskOp } from '../../project/types';
import { useProject } from '../../project/store';
import { colorShare, fromHex, pickColor, toHex } from './color';
import type { Pt } from './geom';
import { ICONS } from './icons';
import * as draw from './overlay';
import { setLive, setSettings, settings, useLive, useSettings } from './state';
import { OP_NAME, addPart, canvasPixels, editableTarget, layerById, layerPoint, opFor, partsOf, pixelSourceOf, replacePart, samePart, screenOf } from './target';
import { usePartDraft } from './draft';
import type { Tool, ToolHost } from './types';
import { Button, Note, Slider, Swatch, pct } from './ui';

export const colorTool: Tool & { pick(host: ToolHost, p: Pt, add?: boolean): Promise<boolean> } = (() => {
  let src: { canvas: HTMLCanvasElement; data: Uint8ClampedArray; w: number; h: number; key: string } | null = null;
  let loading: Promise<void> | null = null;
  /** The colour part this tool made last (a plain click replaces it). */
  let session: { layer: Id; index: number; part: MaskColorPart } | null = null;
  let press: { layer: Id; op: MaskOp; add: boolean; s: Pt; p: Pt; color: string | null; touch: boolean } | null = null;
  let probe: Pt | null = null;

  const keyOf = (host: ToolHost) => `${host.target()}|${host.view().canvas.w}x${host.view().canvas.h}`;

  const load = (host: ToolHost) => {
    if ((src && src.key === keyOf(host)) || loading) return loading;
    const key = keyOf(host);
    loading = host.sourcePixels().then(c => {
      if (!c) { src = null; return; }
      const px = canvasPixels(c);
      src = { canvas: c, data: px.data, w: px.w, h: px.h, key };
    }).catch(() => { src = null; }).finally(() => { loading = null; });
    return loading;
  };

  const colorAt = (p: Pt): string | null => {
    if (!src) return null;
    const c = pickColor(src.data, src.w, src.h, p.x * src.w, p.y * src.h, 1);
    return c ? toHex(c) : null;
  };

  const partFor = (layer: Id, color: string, op: MaskOp): MaskColorPart | null => {
    const source = pixelSourceOf(layerById(layer));
    if (!source) return null;
    const st = settings();
    return { kind: 'color', op, source, color, tol: st.colorTol, soft: st.colorSoft, alpha: 1 };
  };

  /** The session part if it is still in the mask (undo may have removed it). */
  const current = (host: ToolHost) => {
    if (!session || session.layer !== host.target()) return null;
    const parts = partsOf(layerById(session.layer));
    if (samePart(parts[session.index], session.part)) return session;
    const i = parts.findIndex(x => samePart(x, session!.part));
    if (i >= 0) { session.index = i; return session; }
    return null;
  };

  const share = (color: string) => {
    if (!src) return null;
    const st = settings();
    return colorShare(src.data, src.w, src.h, fromHex(color), st.colorTol, st.colorSoft, 6);
  };

  const commit = (host: ToolHost, layer: Id, part: MaskColorPart, add: boolean) => {
    const cur = current(host);
    const l = layerById(layer);
    const sh = share(part.color);
    const tail = sh !== null ? `; ${Math.round(sh * 100)} % de la imagen` : '';
    if (cur && !add && cur.part.op === part.op) {
      if (replacePart(layer, cur.index, part)) { cur.part = part; host.say(`Color ${part.color} en la máscara de «${l?.name}» (${OP_NAME[part.op]}${tail})`); }
    } else if (addPart(host, layer, part, `Color ${part.color} añadido a la máscara de «${l?.name}» (${OP_NAME[part.op]}${tail})`)) {
      const parts = partsOf(layerById(layer));
      session = { layer, index: parts.length - 1, part };
    }
    setLive({ color: part.color, colorShare: sh });
  };

  const tool: Tool & { pick(host: ToolHost, p: Pt, add?: boolean): Promise<boolean> } = {
    id: 'color',
    name: 'Color',
    hint: 'Haz clic en un color de la foto: todo lo parecido entra en la máscara. ⇧ + clic suma otro color; la tolerancia decide cuánto se parece. En teléfono: mantén el dedo y mira la lupa; al soltar se elige.',
    shortcut: 'W',
    group: 'seleccion',
    icon: ICONS.color,
    cursor: 'crosshair',
    draws: true,

    activate(host) { void load(host); setLive({ color: null, colorShare: null }); },
    deactivate(host) { press = null; probe = null; session = null; host.preview(null); },

    async pick(host, p, add = false) {
      const l = editableTarget(host);
      if (!l) return false;
      await load(host);
      const c = colorAt(layerPoint(host, p));
      if (!c) { host.say('No hay foto en ese punto.'); return false; }
      const part = partFor(l.id, c, host.op());
      if (!part) { host.say('Esta composición no tiene una foto de la que tomar colores.'); return false; }
      commit(host, l.id, part, add);
      host.redrawOverlay();
      return true;
    },

    down(e, host) {
      const l = editableTarget(host);
      if (!l) return;
      void load(host);
      const lp = layerPoint(host, e.p);
      // ⇧ here means «another colour» (not an operation); ⌥ subtracts, ⇧⌥ intersects
      press = { layer: l.id, op: e.alt ? opFor(e, host) : host.op(), add: e.shift && !e.alt, s: e.s, p: lp, color: colorAt(lp), touch: e.pointerType === 'touch' };
      if (press.color) {
        const part = partFor(l.id, press.color, press.op);
        const cur = current(host);
        if (part) host.preview(cur && !press.add && cur.part.op === part.op ? { layer: l.id, part, replace: cur.index } : { layer: l.id, part });
      }
      host.redrawOverlay();
    },

    move(e, host) {
      if (!press) { probe = e.pointerType === 'mouse' ? e.s : null; host.redrawOverlay(); return; }
      press.s = e.s;
      press.p = layerPoint(host, e.p);
      const c = colorAt(press.p);
      if (c && c !== press.color) {
        press.color = c;
        const part = partFor(press.layer, c, press.op);
        const cur = current(host);
        if (part) host.preview(cur && !press.add && cur.part.op === part.op ? { layer: press.layer, part, replace: cur.index } : { layer: press.layer, part });
      }
      host.redrawOverlay();
    },

    up(_e, host) {
      const pr = press;
      press = null;
      host.preview(null);
      if (!pr) return;
      if (!src) { host.say('Leyendo los colores de la foto… vuelve a tocar en un momento.'); return; }
      if (!pr.color) { host.say('No hay foto en ese punto.'); host.redrawOverlay(); return; }
      const part = partFor(pr.layer, pr.color, pr.op);
      if (!part) { host.say('Esta composición no tiene una foto de la que tomar colores.'); return; }
      commit(host, pr.layer, part, pr.add);
      host.redrawOverlay();
    },

    cancel(host) { press = null; host.preview(null); host.redrawOverlay(); },

    onKey(e, host) {
      if (e.metaKey || e.ctrlKey) return false;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const f = host.view().frame;
      if (e.key in arrows) {
        const [ax, ay] = arrows[e.key], step = e.shiftKey ? 20 : 2;
        probe ??= { x: f.x + f.w / 2, y: f.y + f.h / 2 };
        probe = { x: Math.min(f.x + f.w - 1, Math.max(f.x, probe.x + ax * step)), y: Math.min(f.y + f.h - 1, Math.max(f.y, probe.y + ay * step)) };
        host.redrawOverlay();
        return true;
      }
      if (e.key === 'Enter' && probe) {
        void tool.pick(host, { x: (probe.x - f.x) / f.w, y: (probe.y - f.y) / f.h }, e.shiftKey);
        return true;
      }
      if (e.key === 'Escape' && (probe || press)) { probe = null; tool.cancel!(host); return true; }
      return false;
    },

    overlay(ctx, host) {
      if (press) {
        const scr = screenOf(host);
        const at = scr(press.p);
        if (press.touch && src) draw.loupe(ctx, at, src.canvas, { x: press.p.x * src.w, y: press.p.y * src.h }, press.color ?? '#000000');
        else {
          draw.crosshair(ctx, at, 8, true);
          if (press.color) chip(ctx, at, press.color);
        }
        return;
      }
      if (probe) {
        draw.crosshair(ctx, probe, 8);
        const f = host.view().frame;
        const c = colorAt(layerPoint(host, { x: (probe.x - f.x) / f.w, y: (probe.y - f.y) / f.h }));
        if (c) chip(ctx, probe, c);
      }
    },

    Options: ({ host }) => <ColorOptions host={host} current={() => current(host)} />,
  };
  return tool;
})();

function chip(ctx: CanvasRenderingContext2D, at: Pt, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(at.x + 12, at.y + 10, 18, 18, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = draw.BONE;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(at.x + 11, at.y + 9, 20, 20, 5);
  ctx.strokeStyle = draw.INK;
  ctx.stroke();
  ctx.restore();
  draw.tag(ctx, { x: at.x + 36, y: at.y + 19 }, color);
}

function ColorOptions({ host, current }: { host: ToolHost; current: () => { layer: Id; index: number; part: MaskColorPart } | null }) {
  const st = useSettings();
  const color = useLive(s => s.color);
  const sh = useLive(s => s.colorShare);
  useProject(s => s.project);
  const cur = current();
  // a slider gesture is one undo step: previewed while it moves, the part replaced once when let go
  const d = usePartDraft(host, cur, p => { const c = current(); if (c) c.part = p as MaskColorPart; });
  const part = cur ? (d.part as MaskColorPart) : null;
  const set = (patch: { tol?: number; soft?: number }) => {
    setSettings({ ...(patch.tol !== undefined ? { colorTol: patch.tol } : {}), ...(patch.soft !== undefined ? { colorSoft: patch.soft } : {}) });
    if (cur) d.set(patch);
  };
  return (
    <div className="tool-opts" data-tool="color">
      <span className="tool-title">Color</span>
      {color ? <Swatch color={color} label={`Color elegido ${color}`} /> : null}
      {color ? <span className="tool-mono">{color}{sh !== null ? ` · ${Math.round(sh * 100)} %` : ''}</span> : <Note tone="quiet">Toca o haz clic en un color de la foto.</Note>}
      <Slider label="Tolerancia" value={part ? part.tol : st.colorTol} min={0} max={0.6} step={0.005} format={pct} onChange={v => set({ tol: v })} onCommit={(_v, how) => d.commit(how)} hint="Cuánto puede alejarse un color del elegido y seguir dentro" />
      <Slider label="Suavidad" value={part ? part.soft : st.colorSoft} min={0} max={0.4} step={0.005} format={pct} onChange={v => set({ soft: v })} onCommit={(_v, how) => d.commit(how)} hint="Una rampa después de la tolerancia: bordes menos duros" />
      <Button disabled={!cur} onClick={() => { host.say('El próximo clic añade otro color'); setLive({ color: null, colorShare: null }); (colorTool as unknown as { deactivate(h: ToolHost): void }).deactivate(host); }}>Otro color</Button>
    </div>
  );
}
