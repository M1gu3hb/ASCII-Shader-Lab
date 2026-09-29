/**
 * The inspector of the selected layer: its own settings by kind, its placement, its mask and its
 * finishes. Everything edits the open project through src/project/store (one undo step per gesture).
 */
import { forwardRef } from 'react';
import { useProject, updateLayer } from '../../project/store';
import type { Layer, Project } from '../../project/types';
import { Section, Slider } from '../controls';
import { KindIcon } from '../icons';
import { KIND_LABEL } from '../layerOps';
import { AnimSection } from './AnimSection';
import { AsciiInspector } from './AsciiInspector';
import { Finishes } from './Finishes';
import { GlyphsInspector, PhotoInspector, ShapeInspector, TextInspector } from './KindInspectors';
import { MaskSection } from './MaskSection';
import { PresetSection } from '../extras/PresetSection';

const pct = (v: number) => Math.round(v * 100) + ' %';

function Placement({ l }: { l: Layer }) {
  const set = (k: 'x' | 'y' | 'scale' | 'rot', v: number) => updateLayer(l.id, x => { x.xf = { ...x.xf, [k]: v }; }, 'xf.' + k);
  return (
    <Section title="Posición y profundidad" open={false}>
      <Slider label="Mover horizontal" value={l.xf.x} min={-1} max={1} def={0} fmt={pct} onChange={v => set('x', v)} />
      <Slider label="Mover vertical" value={l.xf.y} min={-1} max={1} def={0} fmt={pct} onChange={v => set('y', v)} />
      <Slider label="Escala" value={l.xf.scale} min={0.1} max={4} def={1} fmt={v => v.toFixed(2) + '×'} onChange={v => set('scale', v)} />
      <Slider label="Giro" value={l.xf.rot} min={-180} max={180} step={1} def={0} fmt={v => Math.round(v) + '°'} onChange={v => set('rot', v)} />
      <Slider label="Profundidad (paralaje)" value={l.depth ?? 0} min={-10} max={10} step={0.1} def={0} fmt={v => v.toFixed(1)}
        onChange={v => updateLayer(l.id, x => { x.depth = v; }, 'depth')} hint="Para los movimientos de cámara de las animaciones: 0 está en el plano del cuadro." />
    </Section>
  );
}

export const Inspector = forwardRef<HTMLDivElement, { maskFirst?: boolean }>(function Inspector(_props, ref) {
  const project = useProject(s => s.project);
  const sel = useProject(s => s.selection[0]);
  if (!project) return null;
  const l = project.layers.find(x => x.id === sel);
  if (!l) {
    return (
      <div className="finsp empty" ref={ref}>
        <p className="note">Elige una capa en la lista para ver sus ajustes, su máscara y sus acabados.</p>
      </div>
    );
  }
  return (
    <div className="finsp" ref={ref} aria-label={`Ajustes de «${l.name}»`} role="region">
      <h2 className="finsp-h"><KindIcon kind={l.kind} /><span>{l.name}</span><small>{KIND_LABEL[l.kind]}</small></h2>
      {l.locked && <p className="warn">Capa bloqueada: el dado no la cambia. Sus ajustes siguen disponibles.</p>}
      <KindBody l={l} p={project} />
      <MaskSection l={l} p={project} />
      <Finishes l={l} />
      <AnimSection l={l} />
      <Placement l={l} />
      <PresetSection l={l} />
    </div>
  );
});

function KindBody({ l, p }: { l: Layer; p: Project }) {
  switch (l.kind) {
    case 'ascii': return <AsciiInspector l={l} p={p} />;
    case 'glyphs': return <GlyphsInspector l={l} p={p} />;
    case 'photo': return <PhotoInspector l={l} p={p} />;
    case 'text': return <TextInspector l={l} />;
    case 'shape': return <ShapeInspector l={l} />;
  }
}
