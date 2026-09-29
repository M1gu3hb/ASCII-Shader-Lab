/**
 * The project's canvas: its size (the final render's pixels), background colour and transparency.
 * Layers are placed in frame units, so a new size re-frames them instead of breaking them.
 */
import { useState } from 'react';
import { edit, useProject } from '../../project/store';
import { ColorInput, Section, Select, Toggle } from '../controls';
import { say } from '../ui';

const SIZES: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: '1080x1350', label: 'Vertical 4:5 · 1080 × 1350', w: 1080, h: 1350 },
  { id: '1080x1920', label: 'Historia 9:16 · 1080 × 1920', w: 1080, h: 1920 },
  { id: '1080x1080', label: 'Cuadrado · 1080 × 1080', w: 1080, h: 1080 },
  { id: '1920x1080', label: 'Horizontal 16:9 · 1920 × 1080', w: 1920, h: 1080 },
  { id: '1200x630', label: 'Vista previa de enlace · 1200 × 630', w: 1200, h: 630 },
  { id: '2480x3508', label: 'A4 a 300 ppp · 2480 × 3508', w: 2480, h: 3508 },
];

export function CanvasSection() {
  const c = useProject(s => s.project?.canvas);
  const src = useProject(s => s.project?.sources[0]);
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  if (!c) return null;
  const setSize = (nw: number, nh: number) => {
    const W = Math.round(Math.min(8192, Math.max(16, nw))), H = Math.round(Math.min(8192, Math.max(16, nh)));
    edit(p => { p.canvas = { ...p.canvas, w: W, h: H }; });
    say(`Lienzo de ${W} × ${H} px: las capas se reencuadran solas.`);
  };
  const photo = src ? (() => { const k = Math.min(1, 4096 / Math.max(src.w, src.h)); return { w: Math.round(src.w * k), h: Math.round(src.h * k) }; })() : null;
  const opts = [
    { value: 'actual', label: `Actual · ${c.w} × ${c.h}` },
    ...(photo ? [{ value: 'foto', label: `Como la foto · ${photo.w} × ${photo.h}` }] : []),
    ...SIZES.map(s => ({ value: s.id, label: s.label })),
  ];
  return (
    <Section title="Lienzo" open={false} count={`${c.w}×${c.h}`}>
      <Select label="Tamaño" value="actual" options={opts} minWidth={280}
        onChange={v => { if (v === 'foto' && photo) setSize(photo.w, photo.h); else { const s = SIZES.find(x => x.id === v); if (s) setSize(s.w, s.h); } }} />
      <form className="fcanvas-wh" onSubmit={e => { e.preventDefault(); setSize(parseInt(w || String(c.w), 10) || c.w, parseInt(h || String(c.h), 10) || c.h); setW(''); setH(''); }}>
        <label>Ancho <input type="number" min={16} max={8192} placeholder={String(c.w)} value={w} onChange={e => setW(e.target.value)} /></label>
        <label>Alto <input type="number" min={16} max={8192} placeholder={String(c.h)} value={h} onChange={e => setH(e.target.value)} /></label>
        <button type="submit" className="mini">Aplicar</button>
      </form>
      <ColorInput label="Fondo" value={c.bg} onChange={v => edit(p => { p.canvas = { ...p.canvas, bg: v ?? '#0c0b0a' }; }, 'canvas.bg')} />
      <Toggle label="Fondo transparente" checked={c.transparent} onChange={v => edit(p => { p.canvas = { ...p.canvas, transparent: v }; })}
        hint="Donde ninguna capa dibuja queda transparente (el cuadriculado lo muestra); el PNG lo conserva." />
    </Section>
  );
}
