/**
 * QA page of the glyph editor (not part of the site): GlyphEditor on a sample document — contours on
 * «a» and «O», «á» built from «a» + «´» by anchors, a picture layer on «R» (drawn on a canvas), a locked
 * «b» and an assistant's proposal «n» — with undo / redo, a character picker and a read-only switch.
 * window.qa exposes the store for the screenshot script.
 */
import '../src/landing/fonts';
import '../src/shared/fonts.css';
import '../src/glifos/ui/glifos.css';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { newDoc, type Contour, type GlyphDoc } from '../src/glifos/doc';
import { pictureInk } from '../src/glifos/compile';
import { openDoc, redo, setCurrent, undo, useGlifos } from '../src/glifos/state';
import { GlyphEditor } from '../src/glifos/ui/editor/GlyphEditor';
import { ellipseContour, rectContour } from '../src/glifos/ui/editor/shapes';

const rev = (c: Contour): Contour => ({
  closed: c.closed,
  nodes: [...c.nodes].reverse().map(n => ({ x: n.x, y: n.y, ...(n.smooth ? { smooth: true } : {}), ...(n.ho ? { hi: n.ho } : {}), ...(n.hi ? { ho: n.hi } : {}) })),
});

/* ---------- a picture for «R»: a dark letter on a light page, drawn on a canvas ---------- */
const IMG = '0123456789abcdef';
const pic = document.createElement('canvas');
pic.width = 200; pic.height = 260;
{
  const c = pic.getContext('2d')!;
  c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 200, 260);
  c.fillStyle = '#1a1714';
  c.font = '700 250px Georgia, "Times New Roman", serif';
  c.textBaseline = 'alphabetic';
  c.fillText('R', 18, 232);
}
const images = new Map<string, HTMLCanvasElement>([[IMG, pic]]);

function sampleDoc(): GlyphDoc {
  const d = newDoc({ mode: 'texto', name: 'Muestra del editor', now: 1_760_000_000_000, id: 'gl-qa-editor' });
  const G = d.glyphs;
  G.a = {
    ...G.a, status: 'dibujado', adv: 520,
    contours: [ellipseContour({ x0: 60, y0: -12, x1: 372, y1: 512 }), rev(ellipseContour({ x0: 142, y0: 74, x1: 300, y1: 428 })), rectContour({ x0: 336, y0: 0, x1: 420, y1: 500 })],
    anchors: [{ name: 'top', x: 240, y: 500 }],
  };
  G.O = { ...G.O, status: 'dibujado', adv: 720, contours: [ellipseContour({ x0: 50, y0: -12, x1: 670, y1: 712 }), rev(ellipseContour({ x0: 150, y0: 84, x1: 570, y1: 616 }))] };
  G['´'] = {
    ...G['´'], status: 'dibujado', adv: 260,
    contours: [{ closed: true, nodes: [{ x: 70, y: 560 }, { x: 140, y: 560 }, { x: 230, y: 720 }, { x: 140, y: 720 }] }],
    anchors: [{ name: '_top', x: 120, y: 520 }],
  };
  G['á'] = { ...G['á'], status: 'dibujado', origin: 'componentes', adv: 520, components: [{ of: 'a', dx: 0, dy: 0 }, { of: '´', dx: 120, dy: 0 }] };
  G.b = { ...G.b, status: 'bloqueado', adv: 540, contours: [rectContour({ x0: 70, y0: 0, x1: 150, y1: 760 }), ellipseContour({ x0: 100, y0: -12, x1: 480, y1: 512 }), rev(ellipseContour({ x0: 170, y0: 70, x1: 400, y1: 430 }))] };
  G.n = { ...G.n, status: 'propuesto', origin: 'asistente', adv: 540, contours: [rectContour({ x0: 70, y0: 0, x1: 150, y1: 500 }), rectContour({ x0: 390, y0: 0, x1: 470, y1: 420 }), { closed: true, nodes: [{ x: 150, y: 400, smooth: true, ho: { x: 210, y: 500 } }, { x: 430, y: 420, hi: { x: 430, y: 520 } }, { x: 390, y: 420 }, { x: 150, y: 330 }] }] };
  d.images[IMG] = { name: 'R-boceto.png', w: pic.width, h: pic.height };
  G.R = { ...G.R, adv: 640, raster: { img: IMG, crop: { x: 0, y: 0, w: 200, h: 260 }, x: 30, y: 760, s: 2.95, threshold: 0.5, read: 'oscuro', use: 'guia', visible: true } };
  d.guides.push({ axis: 'y', at: 250 });
  return d;
}

openDoc(sampleDoc());
const start = new URLSearchParams(location.search).get('ch');
setCurrent(start && useGlifos.getState().doc?.glyphs[start] ? start : 'a');

const image = (id: string) => images.get(id);
const inkOf = (id: string, crop: { x: number; y: number; w: number; h: number }, read: 'transparencia' | 'oscuro') => {
  const cv = images.get(id);
  if (!cv) return undefined;
  const data = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
  return pictureInk({ w: cv.width, h: cv.height, rgba: data.data }, read, crop);
};

const PICK = ['a', 'O', 'á', '´', 'R', 'n', 'b', 'e'];

function Harness() {
  const cur = useGlifos(s => s.current) ?? 'a';
  const canUndo = useGlifos(s => s.canUndo), canRedo = useGlifos(s => s.canRedo);
  const undoLabel = useGlifos(s => s.undoLabel), redoLabel = useGlifos(s => s.redoLabel);
  const ro = useGlifos(s => s.readOnly);
  const doc = useGlifos(s => s.doc);
  const btn: CSSProperties = { minHeight: 32, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(237,230,218,.18)', background: 'rgba(237,230,218,.055)', color: '#ede6da', font: '500 12.5px/1 system-ui', cursor: 'pointer' };
  return (
    <>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(237,230,218,.1)', background: '#141311' }}>
        <b style={{ fontSize: 13 }}>Editor de glifos · QA</b>
        <nav aria-label="Carácter" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PICK.map(c => (
            <button key={c} type="button" style={{ ...btn, minWidth: 34, fontFamily: 'Georgia, serif', fontSize: 16, background: c === cur ? '#ede6da' : btn.background, color: c === cur ? '#0c0b0a' : '#ede6da' }}
              aria-pressed={c === cur} title={doc?.glyphs[c]?.status} onClick={() => setCurrent(c)}>{c}</button>
          ))}
        </nav>
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button type="button" style={btn} disabled={!canUndo} onClick={() => undo()} title={undoLabel}>Deshacer{undoLabel ? ` · ${undoLabel}` : ''}</button>
          <button type="button" style={btn} disabled={!canRedo} onClick={() => redo()} title={redoLabel}>Rehacer</button>
          <button type="button" style={btn} aria-pressed={!!ro} onClick={() => useGlifos.setState({ readOnly: ro ? null : 'Otra pestaña está editando este proyecto.' })}>{ro ? 'Quitar solo lectura' : 'Solo lectura'}</button>
        </span>
      </header>
      <main style={{ minHeight: 0 }}>
        <GlyphEditor ch={cur} image={image} inkOf={inkOf} />
      </main>
    </>
  );
}

(window as unknown as { qa: unknown }).qa = { state: () => useGlifos.getState(), setCurrent, undo, redo };
createRoot(document.getElementById('root')!).render(<Harness />);
