/**
 * «Degradado» (G): graded photo ↔ characters zones. Drag from where the layer should be fully on to where it
 * should fade out (strengths and shape in the options): a MaskGradientPart, in the mask when the drag ends
 * (one undo step), then editable by its two ends (⇧ snaps the direction to 45°) or moved by its line.
 * Keyboard: Intro drops a vertical gradient through the centre; arrows move it, ⌥ + arrows move its active end,
 * Tab switches the end, Intro applies, Esc discards. ⇧/⌥ at the start of a drag choose the operation.
 */
import type { Ease, Id, MaskGradientPart, MaskOp } from '../../project/types';
import { useProject } from '../../project/store';
import { dist, type Pt } from './geom';
import { PartEditor, drawPart } from './editor';
import { ICONS } from './icons';
import * as draw from './overlay';
import { setSettings, settings, signal, useSettings, type ToolSettings } from './state';
import { Mods, OP_NAME, addPart, canvasSize, editableTarget, layerById, layerPoint, opFor, partsOf, removePart, replacePart } from './target';
import { usePartDraft } from './draft';
import type { Tool, ToolHost } from './types';
import { Button, Note, Segmented, Slider, pct } from './ui';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

function newGradient(op: MaskOp, a: Pt, b: Pt): MaskGradientPart {
  const st = settings();
  const g: MaskGradientPart = { kind: 'gradient', op, shape: st.gradShape, x0: r6(a.x), y0: r6(a.y), x1: r6(b.x), y1: r6(b.y), alpha0: st.gradFrom, alpha1: st.gradTo, alpha: 1 };
  if (st.gradEase !== 'linear') g.ease = { kind: st.gradEase } as Ease;
  return g;
}

export const gradientTool: Tool & { editor: PartEditor } = (() => {
  const editor = new PartEditor();
  const changed = signal();
  editor.onChange = () => changed.bump();
  let drawing: { layer: Id; op: MaskOp; a: Pt; b: Pt; s0: Pt; touch: boolean; mods: Mods } | null = null;
  let pending: { layer: Id; part: MaskGradientPart; end: 0 | 1 } | null = null;

  const draft = () => (drawing ? newGradient(drawing.op, drawing.a, drawing.b) : null);

  const commit = (host: ToolHost, layer: Id, part: MaskGradientPart) => {
    const l = layerById(layer);
    const what = part.shape === 'radial' ? 'Degradado circular' : 'Degradado';
    if (!addPart(host, layer, part, `${what} añadido a la máscara de «${l?.name ?? 'la capa'}» (${OP_NAME[part.op]}, ${Math.round(part.alpha0 * 100)} % → ${Math.round(part.alpha1 * 100)} %).`)) return;
    const parts = partsOf(layerById(layer));
    editor.select(layer, parts.length - 1, parts[parts.length - 1]);
  };

  const tool: Tool & { editor: PartEditor } = {
    id: 'degradado',
    name: 'Degradado',
    hint: 'Arrastra desde donde la capa se ve entera hasta donde desaparece: una transición gradual entre foto y caracteres. Arrastra sus extremos para ajustarla. En teléfono: arrastra con un dedo.',
    shortcut: 'G',
    group: 'dibujo',
    icon: ICONS.gradient,
    cursor: 'crosshair',
    draws: true,
    editor,

    deactivate(host) {
      if (pending) { const p = pending; pending = null; commit(host, p.layer, p.part); }
      drawing = null;
      editor.clear();
      host.preview(null);
    },

    down(e, host) {
      const l = editableTarget(host);
      if (!l) return;
      editor.touch = e.pointerType === 'touch';
      if (pending) { const p = pending; pending = null; host.preview(null); commit(host, p.layer, p.part); }
      const grab = editor.grabAt(host, e);
      if (grab && !e.shift && !e.alt) { editor.down(host, e, grab); return; }
      editor.clear();
      const a = layerPoint(host, e.p);
      drawing = { layer: l.id, op: opFor(e, host), a, b: a, s0: e.s, touch: e.pointerType === 'touch', mods: new Mods(e) };
      host.redrawOverlay();
    },

    move(e, host) {
      if (editor.move(host, e)) return;
      if (!drawing) return;
      let b = layerPoint(host, e.p);
      if (drawing.mods.update(e).square) {
        // ⇧ during the drag: horizontal, vertical or 45°
        const s = canvasSize(host);
        const dx = (b.x - drawing.a.x) * s.w, dy = (b.y - drawing.a.y) * s.h;
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
        b = { x: drawing.a.x + (Math.cos(a) * l) / s.w, y: drawing.a.y + (Math.sin(a) * l) / s.h };
      }
      drawing.b = b;
      if (dist(e.s, drawing.s0) > 3) host.preview({ layer: drawing.layer, part: draft()! });
      host.redrawOverlay();
    },

    up(e, host) {
      if (editor.up(host)) return;
      if (!drawing) return;
      const d = draft()!, dr = drawing;
      drawing = null;
      host.preview(null);
      if (dist(e.s, dr.s0) < 4) { host.redrawOverlay(); return; }
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
        const s = canvasSize(host), step = e.shiftKey ? 10 : 1;
        const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const g = pending.part;
        if (e.key in arrows) {
          const [ax, ay] = arrows[e.key], dx = (ax * step) / s.w, dy = (ay * step) / s.h;
          pending.part = e.altKey
            ? (pending.end ? { ...g, x1: r6(g.x1 + dx), y1: r6(g.y1 + dy) } : { ...g, x0: r6(g.x0 + dx), y0: r6(g.y0 + dy) })
            : { ...g, x0: r6(g.x0 + dx), y0: r6(g.y0 + dy), x1: r6(g.x1 + dx), y1: r6(g.y1 + dy) };
        } else if (e.key === 'Tab') {
          pending.end = pending.end ? 0 : 1;
          host.say(pending.end ? 'Final del degradado' : 'Inicio del degradado');
        } else if (e.key === 'Enter') {
          const p = pending; pending = null; host.preview(null); commit(host, p.layer, p.part); host.redrawOverlay();
          return true;
        } else if (e.key === 'Escape') {
          pending = null; host.preview(null); host.say('Degradado descartado'); host.redrawOverlay();
          return true;
        } else return false;
        host.preview({ layer: pending.layer, part: pending.part });
        host.redrawOverlay();
        return true;
      }
      const sel = editor.current(host);
      if (sel) {
        if (e.key === 'Enter') { editor.clear(); host.say('Degradado listo'); host.redrawOverlay(); return true; }
        return editor.key(host, e, { allowDelete: true });
      }
      if (e.key === 'Enter') {
        const l = editableTarget(host);
        if (!l) return true;
        const c = layerPoint(host, { x: 0.5, y: 0.5 });
        pending = { layer: l.id, part: newGradient(host.op(), { x: c.x, y: c.y - 0.3 }, { x: c.x, y: c.y + 0.3 }), end: 1 };
        host.preview({ layer: l.id, part: pending.part });
        host.say('Degradado vertical en el centro: flechas para moverlo, ⌥ y flechas para mover un extremo, Tab cambia de extremo, Intro lo aplica, Esc lo descarta.');
        host.redrawOverlay();
        return true;
      }
      return false;
    },

    overlay(ctx, host) {
      if (pending && pending.layer === host.target()) drawPart(ctx, host, pending.part, { handles: true, end: pending.end, touch: editor.touch, dash: [5, 4] });
      editor.draw(ctx, host);
      const d = draft();
      if (d && drawing) {
        drawPart(ctx, host, d, { handles: true, dragging: true, touch: drawing.touch, grab: { kind: 'end', end: 1 } });
        draw.tag(ctx, { x: drawing.s0.x + 12, y: drawing.s0.y + 16 }, OP_NAME[drawing.op]);
      }
    },

    Options: ({ host }) => <GradientOptions host={host} use={changed.use} />,
  };
  return tool;
})();

function GradientOptions({ host, use }: { host: ToolHost; use: () => number }) {
  use();
  useProject(s => s.project);
  const st = useSettings();
  const editor = gradientTool.editor;
  const sel = editor.current(host);
  const d = usePartDraft(host, sel?.part.kind === 'gradient' ? sel : null, p => { if (editor.sel) editor.sel.part = p; host.redrawOverlay(); });
  const g = sel?.part.kind === 'gradient' ? (d.part as MaskGradientPart) : null;
  const set = (patch: Partial<Pick<ToolSettings, 'gradShape' | 'gradFrom' | 'gradTo' | 'gradEase'>>, now = false) => {
    setSettings(patch);
    if (sel && g) {
      const next: MaskGradientPart = { ...g };
      if (patch.gradShape) next.shape = patch.gradShape;
      if (patch.gradFrom !== undefined) next.alpha0 = patch.gradFrom;
      if (patch.gradTo !== undefined) next.alpha1 = patch.gradTo;
      if (patch.gradEase) { if (patch.gradEase === 'linear') delete next.ease; else next.ease = { kind: patch.gradEase }; }
      if (now) { d.flush(); if (replacePart(sel.layer, sel.index, next)) { sel.part = next; host.redrawOverlay(); } }
      else { d.set(next); }
    }
  };
  const ease = (g?.ease?.kind ?? (g ? 'linear' : st.gradEase)) as ToolSettings['gradEase'];
  return (
    <div className="tl-opts" data-tool="degradado">
      <span className="tl-title">Degradado</span>
      <Segmented label="Forma" value={g ? g.shape : st.gradShape} options={[{ value: 'linear', label: 'Lineal' }, { value: 'radial', label: 'Circular' }]} onChange={v => set({ gradShape: v }, true)} />
      <Slider label="Inicio" value={g ? g.alpha0 : st.gradFrom} min={0} max={1} step={0.05} format={pct} onChange={v => set({ gradFrom: v })} onCommit={(_v, how) => d.commit(how)} hint="Cuánto se ve la capa donde empieza el degradado" />
      <Slider label="Final" value={g ? g.alpha1 : st.gradTo} min={0} max={1} step={0.05} format={pct} onChange={v => set({ gradTo: v })} onCommit={(_v, how) => d.commit(how)} hint="Cuánto se ve la capa donde termina" />
      <Segmented label="Curva" value={['linear', 'inOut', 'in', 'out'].includes(ease) ? ease : 'linear'} options={[{ value: 'linear', label: 'Recta' }, { value: 'inOut', label: 'Suave' }, { value: 'in', label: 'Lenta al inicio' }, { value: 'out', label: 'Rápida al inicio' }]} onChange={v => set({ gradEase: v }, true)} />
      {sel ? (
        <>
          <Button onClick={() => { editor.clear(); host.redrawOverlay(); }} kbd="Intro">Listo</Button>
          <Button danger onClick={() => { if (removePart(sel.layer, sel.index)) { editor.clear(); host.say('Degradado borrado de la máscara'); host.redrawOverlay(); } }} kbd="Supr">Borrar</Button>
        </>
      ) : <Note tone="quiet">Arrastra sobre la imagen; con teclado, Intro coloca uno en el centro.</Note>}
    </div>
  );
}
