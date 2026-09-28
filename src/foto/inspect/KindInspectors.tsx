/**
 * Inspectors of the other layer kinds: real characters (GLYPH_PARAMS, described as data by src/glyphs),
 * photo (fit and adjustments), text and shapes (editorial elements).
 */
import { FONTS, fontById } from '../../engine/catalog';
import { GLYPH_PARAMS, type GlyphParamDef } from '../../glyphs/index';
import { SHAPE_KINDS } from '../../project/normalize';
import { updateLayer } from '../../project/store';
import type { Adjust, GlyphStyle, GlyphsLayer, LayerFit, PhotoLayer, Project, ShapeKind, ShapeLayer, TextLayer } from '../../project/types';
import { copyText } from '../../studio/download';
import { ColorInput, ColorStops, Note, Section, SegGroup, Select, Slider, TextField, Toggle } from '../controls';
import { replaceSource } from '../layerOps';
import { importMedia, MEDIA_ACCEPT, pickFiles } from '../media';
import { layerText } from '../textOut';
import { say } from '../ui';
import { sourceOptions } from './AsciiInspector';

const FITS: Array<[LayerFit, string]> = [['cover', 'Cubrir'], ['contain', 'Completa'], ['fill', 'Estirar']];

/* ------------------------------------------------------------------ glyphs */

function GlyphParam({ d, s, set }: { d: GlyphParamDef; s: GlyphStyle; set: (k: keyof GlyphStyle, v: unknown) => void }) {
  if (d.show && !d.show(s)) return null;
  const v = s[d.key];
  switch (d.type) {
    case 'range': return <Slider label={d.label} value={v as number} min={d.min} max={d.max} step={d.step} def={d.def} unit={d.unit} hint={d.help} onChange={x => set(d.key, x)} />;
    case 'select': return <Select label={d.label} value={v as string} options={d.options.map(([value, label]) => ({ value, label }))} minWidth={260} onChange={x => set(d.key, x)} />;
    case 'toggle': return <Toggle label={d.label} checked={!!v} hint={d.help} onChange={x => set(d.key, x)} />;
    case 'color': return <ColorInput label={d.label} value={v as string} onChange={x => set(d.key, x ?? d.def)} />;
    case 'paper': return <ColorInput label={d.label} value={v as string | null} allowNone onChange={x => set(d.key, x)} />;
    case 'text': return <TextField label={d.label} value={(v as string) ?? ''} area={d.max > 400} rows={2} mono max={d.max} hint={d.help} onChange={x => set(d.key, x)} />;
    case 'palette': return <ColorStops label={d.label} stops={v as string[]} min={d.min} max={d.max} onChange={x => set(d.key, x)} />;
    default: return null;
  }
}

export function GlyphsInspector({ l, p }: { l: GlyphsLayer; p: Project }) {
  const set = (k: keyof GlyphStyle, v: unknown) => updateLayer(l.id, x => { ((x as GlyphsLayer).glyphs as unknown as Record<string, unknown>)[k] = v; }, 'glyphs.' + k);
  const copy = async () => {
    const t = await layerText(l.id, 'txt');
    if (!t) { say('No se pudo leer la imagen de esta capa.'); return; }
    await copyText(t.text, 'Caracteres copiados como texto');
  };
  return (
    <>
      <p className="kind-badge text"><b>Caracteres reales:</b> se pueden copiar y exportar como texto (TXT, ANSI, HTML, SVG).</p>
      <button type="button" className="btn" onClick={() => void copy()}>Copiar como texto</button>
      <Section title="Fuente">
        <Select label="Qué se escribe con caracteres" value={l.source} options={sourceOptions(p, false)} minWidth={280} onChange={v => updateLayer(l.id, { source: v } as never)} />
        {l.source !== 'below' && <SegGroup label="Encaje de la foto" value={l.fit ?? 'cover'} opts={FITS} onPick={v => updateLayer(l.id, { fit: v } as never)} />}
      </Section>
      <Section title="Caracteres y color">
        {GLYPH_PARAMS.map((d, i) => <GlyphParam key={d.key + i} d={d} s={l.glyphs} set={set} />)}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ photo */

const ADJ: Array<{ k: keyof Adjust; label: string; min: number; max: number; step?: number; def: number; fmt?: (v: number) => string }> = [
  { k: 'bright', label: 'Brillo', min: -1, max: 1, def: 0 },
  { k: 'contrast', label: 'Contraste', min: 0, max: 3, def: 1 },
  { k: 'gamma', label: 'Tonos medios (gamma)', min: 0.2, max: 3, def: 1 },
  { k: 'sat', label: 'Saturación', min: 0, max: 3, def: 1 },
  { k: 'hue', label: 'Tono', min: -180, max: 180, step: 1, def: 0, fmt: v => Math.round(v) + '°' },
  { k: 'temp', label: 'Temperatura (frío ↔ cálido)', min: -1, max: 1, def: 0 },
  { k: 'blur', label: 'Desenfoque', min: 0, max: 40, step: 0.5, def: 0, fmt: v => v.toFixed(1) + ' px' },
  { k: 'sharpen', label: 'Nitidez', min: 0, max: 1, def: 0 },
];

export function PhotoInspector({ l, p }: { l: PhotoLayer; p: Project }) {
  const src = p.sources.find(s => s.id === l.source);
  const setA = (k: keyof Adjust, v: number | boolean) => updateLayer(l.id, x => { ((x as PhotoLayer).adjust as unknown as Record<string, unknown>)[k] = v; }, 'adjust.' + k);
  const change = async () => {
    const [file] = await pickFiles(MEDIA_ACCEPT);
    if (!file) return;
    say('Abriendo la foto…');
    const r = await importMedia(file);
    if (!r.ok) { say(r.message); return; }
    replaceSource(l.id, r.ref, r.kind === 'video' ? { duration: r.duration, fps: r.fps } : {});
  };
  return (
    <>
      <Section title="Foto">
        <p className="src-line">{src ? <><b>{src.name}</b> · {src.w}×{src.h} px{src.kind === 'video' ? ` · ${(src.duration ?? 0).toFixed(1)} s` : ''}</> : 'Sin foto'}</p>
        {p.sources.length > 1 && <Select label="Qué foto muestra" value={l.source} options={sourceOptions(p, false).filter(o => o.value !== 'below')} onChange={v => updateLayer(l.id, { source: v } as never)} />}
        <button type="button" className="btn" onClick={() => void change()}>Cambiar foto…</button>
        <SegGroup label="Encaje" value={l.fit} opts={FITS} onPick={v => updateLayer(l.id, { fit: v } as never)} />
      </Section>
      <Section title="Ajustes">
        {ADJ.map(a => <Slider key={a.k} label={a.label} value={l.adjust[a.k] as number} min={a.min} max={a.max} step={a.step ?? 0.01} def={a.def} fmt={a.fmt} onChange={v => setA(a.k, v)} />)}
        <Toggle label="Invertir" checked={l.adjust.invert} onChange={v => setA('invert', v)} />
        <Toggle label="Blanco y negro" checked={l.adjust.mono} onChange={v => setA('mono', v)} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ text */

const FONT_OPTS = FONTS.filter(f => f.display || f.id === 'jetbrains').map(f => ({ value: f.id, label: f.name }));
type PathKind = 'none' | 'arc' | 'circle' | 'spiral';

export function TextInspector({ l }: { l: TextLayer }) {
  const set = (patch: Partial<TextLayer>, key: string) => updateLayer(l.id, patch as never, key);
  const font = fontById(l.font);
  const path: PathKind = l.path?.kind ?? 'none';
  const setPath = (patch: Partial<NonNullable<TextLayer['path']>>, key: string) =>
    updateLayer(l.id, x => { const t = x as TextLayer; t.path = { ...(t.path ?? { kind: 'arc', cx: 0.5, cy: 0.5, r: 0.3, start: 0 }), ...patch }; }, 'path.' + key);
  return (
    <>
      <Section title="Texto">
        <TextField label="Texto" value={l.text} area rows={3} max={5000} onChange={v => set({ text: v }, 'text')} />
        <Select label="Tipografía" value={font.id} options={FONT_OPTS} onChange={v => set({ font: v }, 'font')} />
        {font.weights.length > 1 && <Slider label="Grosor" value={l.weight} min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} onChange={v => set({ weight: v }, 'weight')} />}
        <Slider label="Tamaño" value={l.size} min={0.005} max={0.4} step={0.001} fmt={v => (v * 100).toFixed(1) + ' % del alto'} onChange={v => set({ size: v }, 'size')} />
        <ColorInput label="Color" value={l.color} onChange={v => set({ color: v ?? '#ede6da' }, 'color')} />
        <SegGroup label="Alineación" value={l.align} opts={[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} onPick={v => set({ align: v }, 'align')} />
        <Slider label="Espacio entre letras" value={l.tracking} min={-0.2} max={1} def={0} fmt={v => v.toFixed(2) + ' em'} onChange={v => set({ tracking: v }, 'tracking')} />
        <Slider label="Interlineado" value={l.leading} min={0.6} max={3} def={1.1} fmt={v => v.toFixed(2) + '×'} onChange={v => set({ leading: v }, 'leading')} />
        <Toggle label="Cursiva" checked={l.italic} onChange={v => set({ italic: v }, 'italic')} />
        <Toggle label="Mayúsculas" checked={l.upper} onChange={v => set({ upper: v }, 'upper')} />
      </Section>
      <Section title="Posición" open={false}>
        {path === 'none' && (
          <>
            <Slider label="Izquierda" value={l.box.x} min={-0.5} max={1} def={0.08} fmt={v => Math.round(v * 100) + ' %'} onChange={v => set({ box: { ...l.box, x: v } }, 'bx')} />
            <Slider label="Arriba" value={l.box.y} min={-0.5} max={1} def={0.08} fmt={v => Math.round(v * 100) + ' %'} onChange={v => set({ box: { ...l.box, y: v } }, 'by')} />
            <Slider label="Ancho de la caja" value={l.box.w} min={0.05} max={1.5} def={0.84} fmt={v => Math.round(v * 100) + ' %'} onChange={v => set({ box: { ...l.box, w: v } }, 'bw')} />
          </>
        )}
        <SegGroup label="Trayecto" value={path} opts={[['none', 'Recto'], ['arc', 'Arco'], ['circle', 'Círculo'], ['spiral', 'Espiral']]}
          onPick={v => updateLayer(l.id, x => { const t = x as TextLayer; if (v === 'none') delete t.path; else t.path = { ...(t.path ?? { cx: 0.5, cy: 0.5, r: 0.3, start: 0 }), kind: v, ...(v === 'spiral' ? { turns: t.path?.turns ?? 2 } : {}) }; })} />
        {l.path && (
          <>
            <Slider label="Centro horizontal" value={l.path.cx} min={0} max={1} fmt={v => Math.round(v * 100) + ' %'} onChange={v => setPath({ cx: v }, 'cx')} />
            <Slider label="Centro vertical" value={l.path.cy} min={0} max={1} fmt={v => Math.round(v * 100) + ' %'} onChange={v => setPath({ cy: v }, 'cy')} />
            <Slider label="Radio" value={l.path.r} min={0.01} max={1} fmt={v => Math.round(v * 100) + ' % del alto'} onChange={v => setPath({ r: v }, 'r')} />
            <Slider label="Empieza en" value={l.path.start} min={-180} max={180} step={1} fmt={v => Math.round(v) + '°'} onChange={v => setPath({ start: v }, 'start')} />
            {l.path.kind === 'spiral' && <Slider label="Vueltas" value={l.path.turns ?? 2} min={0.5} max={8} step={0.1} onChange={v => setPath({ turns: v }, 'turns')} />}
          </>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ shapes */

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectángulo', ellipse: 'Elipse', line: 'Línea', polyline: 'Trazo de varios puntos', bracket: 'Corchetes de encuadre', crosshair: 'Mira', callout: 'Llamada con etiqueta',
};
const BOX = new Set<ShapeKind>(['rect', 'ellipse', 'bracket', 'crosshair']);
const DASHES: Array<[string, string]> = [['none', 'Continua'], ['4 4', 'Guiones'], ['1 5', 'Puntos'], ['12 6', 'Largos']];

export function ShapeInspector({ l }: { l: ShapeLayer }) {
  const set = (patch: Partial<ShapeLayer>, key: string) => updateLayer(l.id, patch as never, key);
  const setPt = (i: number, v: number) => updateLayer(l.id, x => { (x as ShapeLayer).pts[i] = v; }, 'pt' + i);
  const dash = l.dash ? l.dash.join(' ') : 'none';
  const box = BOX.has(l.shape);
  const pct = (v: number) => Math.round(v * 100) + ' %';
  return (
    <>
      <Section title="Forma">
        <Select label="Tipo" value={l.shape} options={SHAPE_KINDS.map(k => ({ value: k, label: SHAPE_NAMES[k] }))}
          onChange={v => updateLayer(l.id, x => {
            const s = x as ShapeLayer;
            const wasBox = BOX.has(s.shape);
            s.shape = v;
            if (BOX.has(v) !== wasBox) s.pts = BOX.has(v) ? [0.25, 0.25, 0.5, 0.5] : v === 'callout' ? [0.4, 0.5, 0.6, 0.3, 0.8, 0.3] : [0.2, 0.5, 0.8, 0.5];
          })} />
        {box ? (
          <>
            <Slider label="Izquierda" value={l.pts[0]} min={-0.2} max={1.2} fmt={pct} onChange={v => setPt(0, v)} />
            <Slider label="Arriba" value={l.pts[1]} min={-0.2} max={1.2} fmt={pct} onChange={v => setPt(1, v)} />
            <Slider label="Ancho" value={l.pts[2]} min={0} max={1.5} fmt={pct} onChange={v => setPt(2, v)} />
            <Slider label="Alto" value={l.pts[3]} min={0} max={1.5} fmt={pct} onChange={v => setPt(3, v)} />
          </>
        ) : (
          <div className="pts">
            {Array.from({ length: l.pts.length / 2 }, (_, i) => (
              <div key={i} className="pt-row">
                <span className="pt-n">{i === 0 && l.shape === 'callout' ? 'Apunta a' : `Punto ${i + 1}`}</span>
                <label>x <input type="number" step={0.01} min={-1} max={2} value={l.pts[i * 2]} onChange={e => setPt(i * 2, parseFloat(e.target.value) || 0)} /></label>
                <label>y <input type="number" step={0.01} min={-1} max={2} value={l.pts[i * 2 + 1]} onChange={e => setPt(i * 2 + 1, parseFloat(e.target.value) || 0)} /></label>
              </div>
            ))}
            {l.shape !== 'line' && <button type="button" className="mini" onClick={() => updateLayer(l.id, x => { const s = x as ShapeLayer; s.pts.push(s.pts[s.pts.length - 2] + 0.05, s.pts[s.pts.length - 1] + 0.05); })}>Añadir punto</button>}
          </div>
        )}
      </Section>
      <Section title="Trazo y relleno">
        <ColorInput label="Trazo" value={l.stroke} allowNone noneLabel="Sin trazo" onChange={v => set({ stroke: v }, 'stroke')} />
        <Slider label="Grosor" value={l.width} min={0} max={40} step={0.5} def={2} fmt={v => v + ' px'} onChange={v => set({ width: v }, 'width')} />
        <SegGroup label="Línea" value={dash} opts={DASHES} onPick={v => set({ dash: v === 'none' ? null : v.split(' ').map(Number) }, 'dash')} />
        <ColorInput label="Relleno" value={l.fill} allowNone noneLabel="Sin relleno" onChange={v => set({ fill: v }, 'fill')} />
      </Section>
      <Section title="Etiqueta" open={!!l.label}>
        <TextField label="Texto de la etiqueta" value={l.label?.text ?? ''} placeholder="FL33" max={400}
          onChange={v => updateLayer(l.id, x => { const s = x as ShapeLayer; if (!v) { delete s.label; return; } s.label = { ...(s.label ?? { font: 'jetbrains', size: 0.022, color: s.stroke ?? '#ede6da' }), text: v }; }, 'label')} />
        {l.label && (
          <>
            <Slider label="Tamaño" value={l.label.size} min={0.005} max={0.12} step={0.001} fmt={v => (v * 100).toFixed(1) + ' %'} onChange={v => updateLayer(l.id, x => { const s = x as ShapeLayer; if (s.label) s.label.size = v; }, 'lsize')} />
            <ColorInput label="Color" value={l.label.color} onChange={v => updateLayer(l.id, x => { const s = x as ShapeLayer; if (s.label) s.label.color = v ?? '#ede6da'; }, 'lcolor')} />
          </>
        )}
        {!l.label && <Note>Las notas editoriales («FL33», «PW33») van junto a la forma, en su fuente mono.</Note>}
      </Section>
    </>
  );
}
