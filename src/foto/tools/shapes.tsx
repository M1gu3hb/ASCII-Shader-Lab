/**
 * «Rectángulo» (M) and «Elipse» (O): drag to draw a MaskShapePart on the target's mask.
 *
 * Modifiers (documented rule): held when the drag STARTS they choose the operation — ⇧ add, ⌥ subtract,
 * ⇧⌥ intersect — otherwise the options bar's (touch). Pressed once the drag is under way (or released and
 * pressed again) they shape the figure: ⇧ square/circle, ⌥ from the centre.
 *
 * The shape is in the mask when the drag ends (one undo step) and stays selected with handles: drag a handle
 * to resize (⇧ keeps proportions, ⌥ from the centre), the round handle to rotate (⇧ 15° steps), the inside to
 * move it; each drag is one undo step. Keyboard: Intro drops a centred shape, arrows move it (⇧ × 10), ⌥ +
 * arrows resize it, [ ] rotate it, Intro applies it, Esc discards it; the same keys edit the selected shape.
 */
import type { Id, MaskShapePart } from '../../project/types';
import { useProject } from '../../project/store';
import { boxFromDrag, boxPoint, fromPx, normDeg, toPx, withBox, type PxBox, type Pt } from './geom';
import { PartEditor, drawPart } from './editor';
import { ICONS } from './icons';
import * as draw from './overlay';
import { settings, setSettings, signal, useSettings } from './state';
import { Mods, OP_NAME, addPart, canvasSize, editableTarget, layerById, layerPoint, opFor, partsOf, removePart, screenPerPx } from './target';
import { usePartDraft } from './draft';
import type { Tool, ToolHost } from './types';
import { Button, Note, Row, Slider, pct, px } from './ui';

type Kind = 'rect' | 'ellipse';
const NAME: Record<Kind, string> = { rect: 'Rectángulo', ellipse: 'Elipse' };
/** Spanish agreement: el rectángulo … añadido / la elipse … añadida. */
const ADDED: Record<Kind, string> = { rect: 'añadido', ellipse: 'añadida' };
const THIS: Record<Kind, string> = { rect: 'lo', ellipse: 'la' };

export function makeShapeTool(kind: Kind): Tool & { editor: PartEditor } {
  const editor = new PartEditor();
  const changed = signal();
  editor.onChange = () => changed.bump();
  let drawing: { layer: Id; a: Pt; b: Pt; op: MaskShapePart['op']; mods: Mods; sq: boolean; ctr: boolean; touch: boolean } | null = null;
  /** A shape placed with the keyboard, not in the mask until Intro. */
  let pending: { layer: Id; part: MaskShapePart } | null = null;

  const pxOf = (host: ToolHost, p: Pt): Pt => { const l = layerPoint(host, p), s = canvasSize(host); return { x: l.x * s.w, y: l.y * s.h }; };

  const newPart = (op: MaskShapePart['op'], b: PxBox, host: ToolHost): MaskShapePart => {
    const st = settings();
    return withBox({ kind, op, x: 0, y: 0, w: 0, h: 0, rot: 0, soft: st.shapeSoft, alpha: st.shapeAlpha }, fromPx(b, canvasSize(host)));
  };

  const draftOf = (host: ToolHost) => (drawing ? newPart(drawing.op, boxFromDrag(drawing.a, drawing.b, { square: drawing.sq, centre: drawing.ctr }), host) : null);

  const commit = (host: ToolHost, layer: Id, part: MaskShapePart) => {
    const l = layerById(layer);
    if (!addPart(host, layer, part, `${NAME[kind]} ${ADDED[kind]} a la máscara de «${l?.name ?? 'la capa'}» (${OP_NAME[part.op]}). Arrastra sus asas para ajustar${THIS[kind]}.`)) return;
    const parts = partsOf(layerById(layer));
    editor.select(layer, parts.length - 1, parts[parts.length - 1]);
  };

  const commitPending = (host: ToolHost) => {
    if (!pending) return;
    const p = pending;
    pending = null;
    host.preview(null);
    commit(host, p.layer, p.part);
  };

  const tool: Tool & { editor: PartEditor } = {
    id: kind === 'rect' ? 'rectangulo' : 'elipse',
    name: NAME[kind],
    hint: kind === 'rect'
      ? 'Arrastra para marcar una zona rectangular. ⇧ al empezar suma, ⌥ resta; ⇧ durante el trazo la hace cuadrada, ⌥ la dibuja desde el centro. Intro coloca una en el centro. En teléfono: arrastra con un dedo; el botón ± elige sumar o restar.'
      : 'Arrastra para marcar una zona ovalada. ⇧ al empezar suma, ⌥ resta; ⇧ durante el trazo la hace círculo, ⌥ la dibuja desde el centro. Intro coloca una en el centro. En teléfono: arrastra con un dedo; el botón ± elige sumar o restar.',
    shortcut: kind === 'rect' ? 'M' : 'O',
    group: 'seleccion',
    icon: kind === 'rect' ? ICONS.rect : ICONS.ellipse,
    cursor: 'crosshair',
    draws: true,
    editor,

    activate(host) { host.redrawOverlay(); },
    deactivate(host) {
      commitPending(host);
      drawing = null;
      editor.clear();
      host.preview(null);
    },

    down(e, host) {
      const l = editableTarget(host);
      if (!l) return;
      editor.touch = e.pointerType === 'touch';
      commitPending(host);
      const sel = editor.current(host);
      const grab = editor.grabAt(host, e);
      const interiorMoves = !!sel && !e.shift && !e.alt && opFor(e, host) === sel.part.op;
      if (grab && (grab.kind !== 'box' || grab.handle !== 'move' || interiorMoves)) { editor.down(host, e, grab); return; }
      editor.clear();
      const a = pxOf(host, e.p);
      drawing = { layer: l.id, a, b: a, op: opFor(e, host), mods: new Mods(e), sq: false, ctr: false, touch: e.pointerType === 'touch' };
      host.redrawOverlay();
    },

    move(e, host) {
      if (editor.move(host, e)) return;
      if (!drawing) return;
      drawing.b = pxOf(host, e.p);
      const m = drawing.mods.update(e);
      drawing.sq = m.square; drawing.ctr = m.centre;
      const d = draftOf(host);
      if (d && d.w > 0 && d.h > 0) host.preview({ layer: drawing.layer, part: d });
      host.redrawOverlay();
    },

    up(e, host) {
      if (editor.up(host)) return;
      if (!drawing) return;
      const d = draftOf(host), dr = drawing;
      drawing = null;
      host.preview(null);
      const k = screenPerPx(host);
      const b = boxFromDrag(dr.a, dr.b, { square: dr.sq, centre: dr.ctr });
      if (!d || b.hw * 2 * k < 3 || b.hh * 2 * k < 3) {
        // a click: nothing drawn (and the previous selection is gone)
        host.redrawOverlay();
        void e;
        return;
      }
      commit(host, dr.layer, d);
      host.redrawOverlay();
    },

    cancel(host) {
      editor.cancel(host);
      if (drawing) { drawing = null; host.preview(null); host.redrawOverlay(); }
    },

    onKey(e, host) {
      if (e.metaKey || e.ctrlKey) return false;
      if (pending) {
        const s = canvasSize(host);
        const b = toPx(pending.part, s);
        const step = e.shiftKey ? 10 : 1;
        const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        let nb: PxBox | null = null;
        if (e.key in arrows) {
          const [ax, ay] = arrows[e.key];
          if (e.altKey) {
            const hw = Math.max(2, b.hw + (ax * step) / 2), hh = Math.max(2, b.hh - (ay * step) / 2);
            const c = boxPoint(b, hw - b.hw, hh - b.hh);
            nb = { ...b, hw, hh, cx: c.x, cy: c.y };
          } else nb = { ...b, cx: b.cx + ax * step, cy: b.cy + ay * step };
        } else if (e.key === '[' || e.key === ']') {
          nb = { ...b, a: b.a + ((e.key === ']' ? 1 : -1) * (e.shiftKey ? 15 : 1) * Math.PI) / 180 };
          host.say(`Giro ${Math.round(normDeg((nb.a * 180) / Math.PI))}°`);
        } else if (e.key === 'Enter') {
          commitPending(host);
          host.redrawOverlay();
          return true;
        } else if (e.key === 'Escape') {
          pending = null;
          host.preview(null);
          host.say(`${NAME[kind]} ${kind === 'rect' ? 'descartado' : 'descartada'}`);
          host.redrawOverlay();
          return true;
        }
        if (!nb) return false;
        pending = { ...pending, part: withBox(pending.part, fromPx(nb, s)) };
        host.preview({ layer: pending.layer, part: pending.part });
        host.redrawOverlay();
        return true;
      }
      const sel = editor.current(host);
      if (sel) {
        if (e.key === 'Enter') { editor.clear(); host.say(`${NAME[kind]} ${kind === 'rect' ? 'listo' : 'lista'}`); host.redrawOverlay(); return true; }
        return editor.key(host, e, { allowDelete: true });
      }
      if (e.key === 'Enter') {
        const l = editableTarget(host);
        if (!l) return true;
        const s = canvasSize(host);
        const side = Math.min(s.w, s.h) * 0.3;
        const c = layerPoint(host, { x: 0.5, y: 0.5 });
        pending = { layer: l.id, part: newPart(host.op(), { cx: c.x * s.w, cy: c.y * s.h, hw: side / 2, hh: side / 2, a: 0 }, host) };
        host.preview({ layer: l.id, part: pending.part });
        host.say(`${NAME[kind]} en el centro (${OP_NAME[host.op()]}): flechas para mover${THIS[kind]}, ⌥ y flechas para su tamaño, [ y ] para girar${THIS[kind]}, Intro para aplicar${THIS[kind]}, Esc para descartar${THIS[kind]}.`);
        host.redrawOverlay();
        return true;
      }
      return false;
    },

    overlay(ctx, host) {
      if (pending && pending.layer === host.target()) drawPart(ctx, host, pending.part, { handles: true, touch: editor.touch, dash: [5, 4] });
      editor.draw(ctx, host);
      const d = draftOf(host);
      if (d && drawing) {
        drawPart(ctx, host, d, { touch: drawing.touch });
        const b = boxFromDrag(drawing.a, drawing.b, { square: drawing.sq, centre: drawing.ctr });
        const v = host.view(), s = canvasSize(host);
        const at = v.toScreen({ x: (b.cx) / s.w, y: (b.cy + b.hh) / s.h });
        draw.tag(ctx, { x: at.x, y: at.y + 16 }, `${Math.round(b.hw * 2)} × ${Math.round(b.hh * 2)} px · ${OP_NAME[drawing.op]}`, { align: 'center' });
      }
    },

    Options: ({ host }) => <ShapeOptions host={host} kind={kind} editor={editor} use={changed.use} />,
  };
  return tool;
}

function ShapeOptions({ host, kind, editor, use }: { host: ToolHost; kind: Kind; editor: PartEditor; use: () => number }) {
  use();
  useProject(s => s.project);
  const st = useSettings();
  const sel = editor.current(host);
  const d = usePartDraft(host, sel?.part.kind === kind ? sel : null, p => { if (editor.sel) editor.sel.part = p; host.redrawOverlay(); });
  const part = sel?.part.kind === kind ? (d.part as MaskShapePart) : null;
  const set = (patch: { soft?: number; alpha?: number }) => {
    setSettings({ ...(patch.soft !== undefined ? { shapeSoft: patch.soft } : {}), ...(patch.alpha !== undefined ? { shapeAlpha: patch.alpha } : {}) });
    if (part) d.set(patch);
  };
  return (
    <div className="tool-opts" data-tool={kind}>
      <span className="tool-title">{NAME[kind]}</span>
      <Slider label="Borde suave" value={part ? part.soft : st.shapeSoft} min={0} max={80} step={1} format={px} onChange={v => set({ soft: v })} onCommit={(_v, how) => d.commit(how)} hint="Difumina el borde de esta forma (px de la imagen final)" />
      <Slider label="Intensidad" value={part ? part.alpha : st.shapeAlpha} min={0.05} max={1} step={0.05} format={pct} onChange={v => set({ alpha: v })} onCommit={(_v, how) => d.commit(how)} hint="Menos de 100 % mezcla la foto y los caracteres dentro de la forma" />
      {sel ? (
        <Row label="Forma seleccionada">
          <Button onClick={() => { editor.clear(); host.redrawOverlay(); }} kbd="Intro">Listo</Button>
          <Button danger onClick={() => { if (removePart(sel.layer, sel.index)) { editor.clear(); host.say('Forma borrada de la máscara'); host.redrawOverlay(); } }} kbd="Supr">Borrar forma</Button>
        </Row>
      ) : (
        <Note tone="quiet">Arrastra sobre la imagen. Con teclado: Intro coloca una forma en el centro.</Note>
      )}
    </div>
  );
}

export const rectangleTool = makeShapeTool('rect');
export const ellipseTool = makeShapeTool('ellipse');
