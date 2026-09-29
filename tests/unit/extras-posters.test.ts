import { describe, expect, it } from 'vitest';
import type { MediaRef } from '../../src/engine/recipe';
import { normalizeProject, projectFromImage, uid } from '../../src/project/normalize';
import {
  applyPoster, blockHeight, estimateWidth, fieldOf, POSTER_SIZES, POSTERS, posterFields, posterFieldText, posterFrame, posterGuides, posterProject,
  setPosterField, truncate, wrapLines, type PosterFormat,
} from '../../src/project/posters';
import type { Project, ShapeLayer, TextLayer } from '../../src/project/types';

const photo = (w: number, h: number): MediaRef => ({ id: 'a'.repeat(16), kind: 'image', name: 'foto.jpg', w, h });

const FORMATS: PosterFormat[] = [
  ...POSTER_SIZES.map(s => ({ size: s.id })),
  { size: 'a4', orient: 'horizontal' }, { size: 'a3', bleed: true }, { size: 'tabloide', orient: 'horizontal', bleed: true },
];

const LONG = {
  kicker: 'Un antetítulo bastante más largo de lo que la plantilla esperaba al principio',
  title: 'Un título larguísimo que no cabe de ninguna manera en una sola línea del cartel',
  subtitle: 'Un subtítulo extenso, con varias frases. Sigue y sigue para ver si el bloque se sale de su sitio o se corta con puntos suspensivos donde debe.',
  caption: 'Pie '.repeat(120),
  labels: ['ETIQUETA-LARGA-1', 'ETIQUETA-LARGA-2', 'ETIQUETA-LARGA-3', 'ETIQUETA-LARGA-4'],
};

const EPS = 0.002;

/** Every text block fits its lines and stays inside the frame (the trimmed page for print sizes). */
function checkText(p: Project, l: TextLayer, inside: { x: number; y: number; w: number; h: number }) {
  if (l.path || l.xf.rot) return;
  const W = p.canvas.w, H = p.canvas.h, px = l.size * H;
  const lines = wrapLines(l.text || ' ', { font: l.font, weight: l.weight, italic: l.italic, upper: l.upper, tracking: l.tracking }, px, l.box.w * W).length;
  const f = fieldOf(l.id);
  if (f) expect(lines, `${l.name}: ${lines} líneas`).toBeLessThanOrEqual(f.lines);
  const bottom = l.box.y + blockHeight(px, lines, l.leading) / H;
  expect(l.box.x, l.name).toBeGreaterThanOrEqual(inside.x - EPS);
  expect(l.box.x + l.box.w, l.name).toBeLessThanOrEqual(inside.x + inside.w + EPS);
  expect(l.box.y, l.name).toBeGreaterThanOrEqual(inside.y - EPS);
  expect(bottom, `${l.name} baja hasta ${bottom.toFixed(3)}`).toBeLessThanOrEqual(inside.y + inside.h + EPS);
}

function checkShape(p: Project, l: ShapeLayer) {
  if (l.xf.rot || l.mask) return;
  const box = ['rect', 'ellipse', 'bracket', 'crosshair'].includes(l.shape);
  if (box) {
    const [x, y, w, h] = l.pts;
    expect(x, l.name).toBeGreaterThanOrEqual(-EPS);
    expect(y, l.name).toBeGreaterThanOrEqual(-EPS);
    expect(x + w, l.name).toBeLessThanOrEqual(1 + EPS);
    expect(y + h, l.name).toBeLessThanOrEqual(1 + EPS);
  } else for (const v of l.pts) { expect(v, l.name).toBeGreaterThanOrEqual(-EPS); expect(v, l.name).toBeLessThanOrEqual(1 + EPS); }
  if (l.shape === 'callout' && l.label?.text) {
    // the boxed label opens away from the frame's centre and stays inside it
    const W = p.canvas.w, px = l.label.size * p.canvas.h;
    const bw = (estimateWidth(l.label.text, l.label.font, 500, false, px) + px * 0.8) / W;
    const lx = l.pts[l.pts.length - 2];
    if (lx > 0.5) expect(lx - bw).toBeGreaterThanOrEqual(-EPS); else expect(lx + bw).toBeLessThanOrEqual(1 + EPS);
  }
}

describe('posters', () => {
  it('there are at least ten distinct layouts', () => {
    expect(POSTERS.length).toBeGreaterThanOrEqual(10);
    const sigs = new Set(POSTERS.map(d => {
      const p = posterProject(d.id, photo(1200, 1500));
      return p.layers.map(l => `${l.kind}:${l.name}`).join('|');
    }));
    expect(sigs.size).toBe(POSTERS.length);
  });

  for (const def of POSTERS) {
    it(`«${def.name}» fits every print and social size, with its texts and with long ones`, () => {
      for (const format of FORMATS) {
        for (const fields of [undefined, LONG]) {
          for (const src of [photo(1024, 858), photo(900, 1600)]) {
            const p = posterProject(def.id, src, { format, ...(fields ? { fields } : {}) });
            const fr = posterFrame(format);
            expect([p.canvas.w, p.canvas.h]).toEqual([fr.w, fr.h]);
            expect(p.layers.length).toBeLessThanOrEqual(48);
            const inside = fr.size.group === 'impresion' ? fr.trim : { x: 0, y: 0, w: 1, h: 1 };
            for (const l of p.layers) {
              if (l.kind === 'text') checkText(p, l, inside);
              if (l.kind === 'shape') checkShape(p, l);
              if (l.xf.scale !== 1 && l.mask) {
                // a panel: its visible rectangle lands inside the frame
                const part = l.mask.parts[0];
                if (part.kind === 'rect') {
                  const x0 = 0.5 + l.xf.x + l.xf.scale * (part.x - 0.5), x1 = 0.5 + l.xf.x + l.xf.scale * (part.x + part.w - 0.5);
                  const y0 = 0.5 + l.xf.y + l.xf.scale * (part.y - 0.5), y1 = 0.5 + l.xf.y + l.xf.scale * (part.y + part.h - 0.5);
                  expect(x0, l.name).toBeGreaterThanOrEqual(-EPS); expect(x1, l.name).toBeLessThanOrEqual(1 + EPS);
                  expect(y0, l.name).toBeGreaterThanOrEqual(-EPS); expect(y1, l.name).toBeLessThanOrEqual(1 + EPS);
                }
              }
            }
          }
        }
      }
    });

    it(`«${def.name}» stays editable: separate layers, a valid project, texts findable and refittable`, () => {
      const p = posterProject(def.id, photo(1200, 1500));
      // never one flattened picture: the picture layers read the photo, the texts are text layers
      expect(p.layers.some(l => (l.kind === 'photo' || l.kind === 'glyphs' || l.kind === 'ascii') && l.source === p.sources[0].id)).toBe(true);
      expect(p.layers.some(l => l.kind === 'text')).toBe(true);
      // the project survives a save and a reload exactly
      expect(normalizeProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
      const refs = posterFields(p);
      expect(refs.some(r => r.field === 'title')).toBe(true);
      const d = structuredClone(p);
      expect(setPosterField(d, 'title', 'Otro título muchísimo más largo que el original para ver si se ajusta a su caja')).toBe(true);
      expect(posterFieldText(d, 'title')).toMatch(/^Otro título/);
      const t = d.layers.find(l => fieldOf(l.id)?.field === 'title') as TextLayer;
      if (!t.path) {
        const f = fieldOf(t.id)!;
        const lines = wrapLines(t.text, { font: t.font, weight: t.weight, italic: t.italic, upper: t.upper, tracking: t.tracking }, t.size * d.canvas.h, t.box.w * d.canvas.w).length;
        expect(lines).toBeLessThanOrEqual(f.lines);
        expect(t.size).toBeLessThanOrEqual(f.maxSize + 1e-4);
      }
    });
  }

  it('applies to an open project: sources kept, layers and keyframes replaced, the cut-out read by the subject', () => {
    const p = projectFromImage(photo(1024, 858));
    const cut = { id: uid(), kind: 'cutout' as const, name: 'Recorte', media: [{ ...photo(1024, 858), id: 'b'.repeat(16) }], w: 1024, h: 858, cutout: { from: p.sources[0].id, matte: { ...photo(1024, 858), id: 'c'.repeat(16) } } };
    p.sources.push(cut);
    p.tracks.push({ layer: p.layers[0].id, path: 'opacity', keys: [{ t: 0, v: 1, ease: { kind: 'linear' } }] });
    const r = applyPoster(p, 'anotado', { format: { size: 'a4', bleed: true } })!;
    expect(r.project.sources.map(s => s.id)).toEqual(p.sources.map(s => s.id));
    expect(r.project.tracks).toEqual([]);
    expect(r.project.id).toBe(p.id);
    expect(r.notes).toEqual([]);
    const subject = r.project.layers.find(l => l.name === 'Sujeto en caracteres');
    expect(subject && 'source' in subject && subject.source).toBe(cut.id);
    // without a cut-out the subject is an oval, and the poster says how to do better
    const q = projectFromImage(photo(1024, 858));
    expect(applyPoster(q, 'anotado')!.notes.join(' ')).toMatch(/Quitar fondo/);
  });

  it('guides are found for the known sizes (with and without bleed) and not for others', () => {
    const a4b = posterFrame({ size: 'a4', bleed: true });
    expect([a4b.w, a4b.h]).toEqual([2480 + 70, 3508 + 70]);
    const g = posterGuides({ w: a4b.w, h: a4b.h })!;
    expect(g.label).toMatch(/A4 vertical a 300 ppp · sangrado de 3 mm/);
    expect(g.trim.x).toBeCloseTo(35 / a4b.w);
    expect(g.safe.x).toBeGreaterThan(g.trim.x);
    expect(posterGuides({ w: 3508, h: 2480 })!.orient).toBe('horizontal');
    expect(posterGuides({ w: 1080, h: 1920 })!.zones.length).toBe(2);
    expect(posterGuides({ w: 1000, h: 1000 })).toBeNull();
  });

  it('a text that cannot fit is cut at a word with an ellipsis', () => {
    const st = { font: 'jetbrains', weight: 400 };
    const t = truncate('uno dos tres cuatro cinco seis siete ocho nueve diez', st, 20, 200, 1);
    expect(t.endsWith('…')).toBe(true);
    expect(wrapLines(t, st, 20, 200).length).toBe(1);
  });
});
