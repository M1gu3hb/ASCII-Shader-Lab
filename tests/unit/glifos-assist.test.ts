import { describe, expect, it } from 'vitest';
import { CHAR_GROUPS, MARKS, newDoc, type Contour, type Glyph, type GlyphDoc, type StyleKey } from '../../src/glifos/doc';
import { glyphContours, glyphInk } from '../../src/glifos/compile';
import { bboxOf, signedArea, skewX, transformContours } from '../../src/glifos/geom/ops';
import { SKELETONS, composeAccents, skeletonChars } from '../../src/glifos/assist/skeletons';
import { estimateStyle, styleHash } from '../../src/glifos/assist/style';
import { compareVariants, generateGlyph, lockReferences, proposeGlyphs } from '../../src/glifos/assist/generate';

/**
 * The local assistant of «Crea tus GLYPHOS»: skeletons for every character of the board, a style measured on
 * the person's references that visibly drives the result, and proposals that never touch their work.
 */

const doc0 = () => newDoc({ mode: 'texto', now: 0, id: 'gl-prueba' });
const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({ closed: true, nodes: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
/** An H made of rectangles: stems `w` thick, `h` tall, the bar a little thinner. */
const H = (w: number, h = 700, width = 560): Contour[] => [rect(60, 0, 60 + w, h), rect(60 + width - w, 0, 60 + width, h), rect(60 + w, h / 2 - w * 0.4, 60 + width - w, h / 2 + w * 0.4)];
function withRef(cs: Contour[], ch = 'H'): GlyphDoc {
  const d = doc0();
  d.glyphs[ch] = { ...d.glyphs[ch], status: 'dibujado', contours: cs, adv: 700 };
  d.refs = [ch];
  return d;
}
const inkOf = (d: GlyphDoc, g: Glyph) => { const x = structuredClone(d); x.glyphs[g.ch] = g; return glyphInk(x, g.ch); };
const finite = (cs: Contour[]) => cs.every(c => c.nodes.every(n => [n.x, n.y, n.hi?.x ?? 0, n.hi?.y ?? 0, n.ho?.x ?? 0, n.ho?.y ?? 0].every(Number.isFinite)));

describe('esqueletos', () => {
  it('cada carácter del tablero (salvo el espacio) tiene esqueleto o se compone con acentos', () => {
    const missing = CHAR_GROUPS.flatMap(g => g.chars).filter(c => c !== ' ' && !SKELETONS[c] && !MARKS[c]);
    expect(missing).toEqual([]);
    expect(skeletonChars()).toContain('ı');
    for (const c of skeletonChars()) expect(SKELETONS[c].width).toBeGreaterThan(0);
  });

  it('todo glifo generado (estilo predeterminado) es cerrado, con tinta, dentro de las métricas y con números finitos', () => {
    const d = doc0();
    const chars = [...skeletonChars(), ...Object.keys(MARKS)];
    for (const ch of chars) {
      const g = generateGlyph(d, ch, d.style)!;
      expect(g, ch).not.toBeNull();
      expect(g.contours.filter(c => c.closed && c.nodes.length > 1).length, ch).toBeGreaterThan(0);
      expect(finite(g.contours), ch).toBe(true);
      expect(inkOf(d, g), ch).toBeGreaterThan(0);
      const b = bboxOf(g.contours)!;
      const top = MARKS[ch] ? d.metrics.upm : d.metrics.asc + 50;
      expect(b.y0, ch).toBeGreaterThanOrEqual(d.metrics.desc - 50);
      expect(b.y1, ch).toBeLessThanOrEqual(top);
      expect(g.status).toBe('propuesto');
      expect(g.origin).toBe('asistente');
      expect(g.gen).toEqual({ style: styleHash(d.style), variant: 0 });
      if (MARKS[ch]) {
        // an accented letter keeps its base's advance (the mark may overhang a narrow base such as ı)
        expect(g.adv, ch).toBe(generateGlyph(d, MARKS[ch].base, d.style)!.adv);
      } else {
        expect(g.adv, ch).toBe(Math.round(b.x1 - b.x0 + 120));
        expect(b.x0, ch).toBeCloseTo(60, 0);
      }
    }
  });

  it('la o tiene un agujero, las letras se apoyan en sus alturas y la ı ancla el acento en su asta', () => {
    const d = doc0();
    const o = generateGlyph(d, 'o', d.style)!;
    expect(o.contours).toHaveLength(2);
    const [a, b] = o.contours.map(signedArea);
    expect(Math.sign(a)).toBe(-Math.sign(b));
    const box = (ch: string) => bboxOf(generateGlyph(d, ch, d.style)!.contours)!;
    expect(box('x').y1).toBeCloseTo(500, 0);
    expect(box('x').y0).toBeCloseTo(0, 0);
    expect(box('H').y1).toBeCloseTo(700, 0);
    expect(box('n').y0).toBeCloseTo(0, 0);
    expect(box('o').y1).toBeGreaterThan(500);
    expect(box('o').y1).toBeLessThan(520);
    for (const c of 'gjpqy') expect(box(c).y0, c).toBeLessThan(-150);
    const dotless = generateGlyph(d, 'ı', d.style)!;
    const top = dotless.anchors.find(p => p.name === 'top')!;
    const stem = bboxOf(dotless.contours)!;
    expect(top.x).toBeCloseTo((stem.x0 + stem.x1) / 2, 0);
  });

  it('compone los acentos con anclas (í sobre ı)', () => {
    const d = doc0();
    const comps = composeAccents(d);
    expect(Object.keys(comps).sort()).toEqual(Object.keys(MARKS).sort());
    expect(comps['í'][0].of).toBe('ı');
    expect(comps['í'][1].of).toBe('´');
    expect(comps['Ñ'][1].dy).toBeGreaterThan(comps['ñ'][1].dy);
  });

  it('un documento ASCII centra cada símbolo en su celda', () => {
    const d = newDoc({ mode: 'ascii', now: 0, id: 'gl-ascii' });
    for (const ch of ['W', '@', 'i', '#']) {
      const g = generateGlyph(d, ch, d.style)!;
      expect(g.adv).toBe(d.metrics.cell);
      const b = bboxOf(g.contours)!;
      expect(b.x0).toBeGreaterThan(0);
      expect(b.x1).toBeLessThan(d.metrics.cell);
      expect(b.x0 + b.x1).toBeCloseTo(d.metrics.cell, 0);
    }
  });

  it('generar todos los caracteres tarda menos de 3 s', () => {
    const d = doc0();
    const t0 = performance.now();
    for (const ch of [...skeletonChars(), ...Object.keys(MARKS)]) generateGlyph(d, ch, d.style, 1);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('estilo medido en referencias', () => {
  it('una H gruesa da una n con más tinta que una H delgada', () => {
    const heavy = estimateStyle(withRef(H(160)), ['H']).style, thin = estimateStyle(withRef(H(40)), ['H']).style;
    expect(heavy.weight).toBeCloseTo(160, -1);
    expect(thin.weight).toBeCloseTo(40, -1);
    const d = doc0();
    const nh = generateGlyph(d, 'n', heavy)!, nt = generateGlyph(d, 'n', thin)!;
    expect(inkOf(d, nh)).toBeGreaterThan(inkOf(d, nt) * 1.5);
    expect(heavy.source.weight).toBe('medido en H');
  });

  it('una H inclinada da una inclinación positiva (±3°) y una l que se inclina igual', () => {
    const sheared = transformContours(H(90), skewX(10, 0));
    const { style } = estimateStyle(withRef(sheared), ['H']);
    expect(Math.abs(style.slant - 10)).toBeLessThanOrEqual(3);
    expect(style.weight).toBeCloseTo(90, -1);
    const l = generateGlyph(doc0(), 'l', style)!;
    // the stem's centre at the top is to the right of its centre at the bottom by height · tan(slant)
    const pts = l.contours[0].nodes;
    const at = (y: number) => { const xs = pts.filter(n => Math.abs(n.y - y) < 1).map(n => n.x); return (Math.min(...xs) + Math.max(...xs)) / 2; };
    const b = bboxOf(l.contours)!;
    const lean = Math.atan((at(b.y1) - at(b.y0)) / (b.y1 - b.y0)) * (180 / Math.PI);
    expect(lean).toBeGreaterThan(0);
    expect(Math.abs(lean - style.slant)).toBeLessThan(1);
  });

  it('la altura de mayúsculas medida (650 o 750) cambia la altura de la E generada', () => {
    const d = doc0();
    for (const h of [650, 750]) {
      const { style } = estimateStyle(withRef(H(90, h)), ['H']);
      expect(style.cap).toBe(h);
      const e = bboxOf(generateGlyph(d, 'E', style)!.contours)!;
      expect(e.y1).toBeCloseTo(h, 0);
      expect(e.y0).toBeCloseTo(0, 0);
    }
  });

  it('con una sola H, lo que no se puede medir queda predeterminado y lo dice', () => {
    const { style, notes } = estimateStyle(withRef(H(90)), ['H']);
    expect(style.source.xh).toMatch(/no estimado/);
    expect(style.source.round).toMatch(/^predeterminado \(no estimado/);
    expect(style.source.angle).toMatch(/^predeterminado/);
    expect(style.source.cap).toBe('medido en H');
    expect(style.source.contrast).toBe('medido en H');
    expect(style.contrast).toBeCloseTo(0.8, 1);
    expect(style.terminal).toBe('recto');
    expect(style.source.terminal).toBe('medido en H');
    expect(notes[0]).toMatch(/Se midieron: H/);
    for (const k of Object.keys(style.source) as StyleKey[]) expect(style.source[k].length, k).toBeLessThanOrEqual(80);
  });

  it('una o mide la redondez y la altura de x; sin dibujo no se mide nada', () => {
    const d = doc0();
    const o = generateGlyph(d, 'o', { ...d.style, round: 0.2 })!;
    const ref = structuredClone(d);
    ref.glyphs.o = { ...o, status: 'dibujado' };
    const { style } = estimateStyle(ref, ['o']);
    expect(style.source.round).toBe('medido en o');
    expect(Math.abs(style.round - 0.2)).toBeLessThan(0.15);
    expect(Math.abs(style.xh - 500)).toBeLessThan(6);
    expect(style.source.cap).toMatch(/no estimado/);
    const none = estimateStyle(doc0(), ['H']);
    expect(none.notes.join(' ')).toMatch(/no tiene dibujo/);
    expect(none.style.source.weight).toMatch(/^predeterminado/);
  });

  it('remates redondos y en cuña se reconocen en una H generada', () => {
    const d = doc0();
    for (const terminal of ['redondo', 'cuna', 'recto'] as const) {
      const g = generateGlyph(d, 'H', { ...d.style, terminal })!;
      const ref = structuredClone(d);
      ref.glyphs.H = { ...g, status: 'dibujado' };
      expect(estimateStyle(ref, ['H']).style.terminal, terminal).toBe(terminal);
    }
  });

  it('styleHash es estable y cambia con el estilo', () => {
    const s = doc0().style;
    expect(styleHash(s)).toBe(styleHash(structuredClone(s)));
    expect(styleHash({ ...s, weight: s.weight + 1 })).not.toBe(styleHash(s));
    expect(styleHash(s).length).toBeLessThanOrEqual(12);
  });
});

describe('propuestas del asistente', () => {
  function board() {
    const d = doc0();
    const mine = (ch: string, status: Glyph['status'], extra: Partial<Glyph> = {}) => { d.glyphs[ch] = { ...d.glyphs[ch], status, contours: [rect(60, 0, 160, 500)], ...extra }; };
    mine('a', 'dibujado');
    mine('b', 'aceptado');
    mine('c', 'bloqueado');
    mine('d', 'propuesto', { corrected: true, origin: 'asistente' });
    mine('e', 'propuesto', { origin: 'asistente', gen: { style: 'viejo', variant: 0 } });
    mine('H', 'dibujado');
    d.refs = ['H'];
    return d;
  }

  it('nunca cambia lo dibujado, aceptado, bloqueado, corregido ni las referencias, y no muta el documento', () => {
    const d = board();
    const before = JSON.stringify(d);
    const r = proposeGlyphs(d, ['a', 'b', 'c', 'd', 'e', 'H', 'n', 'o', ' ']);
    expect(JSON.stringify(d)).toBe(before);
    for (const ch of ['a', 'b', 'c', 'd', 'H']) expect(r.doc.glyphs[ch]).toEqual(d.glyphs[ch]);
    expect(r.changed.sort()).toEqual(['e', 'n', 'o']);
    const why = Object.fromEntries(r.kept.map(k => [k.ch, k.why]));
    expect(why).toEqual({
      a: 'lo dibujaste tú', b: 'ya lo aceptaste', c: 'está bloqueado', d: 'es una propuesta que corregiste',
      H: 'es una referencia del estilo', ' ': 'el espacio no se dibuja',
    });
    expect(r.doc.glyphs.n.status).toBe('propuesto');
    expect(r.doc.glyphs.n.origin).toBe('asistente');
    expect(r.doc.glyphs.e.gen!.style).toBe(styleHash(d.style));
  });

  it('regenerar reemplaza sólo propuestas sin corregir; «nada» deja también las pendientes', () => {
    const first = proposeGlyphs(board(), ['e', 'n', 'd'], { variant: 0 }).doc;
    const again = proposeGlyphs(first, ['e', 'n', 'd'], { variant: 2 });
    expect(again.changed.sort()).toEqual(['e', 'n']);
    expect(again.doc.glyphs.n.gen!.variant).toBe(2);
    expect(again.doc.glyphs.n.contours).not.toEqual(first.glyphs.n.contours);
    expect(again.doc.glyphs.d).toEqual(first.glyphs.d);
    const none = proposeGlyphs(first, ['e', 'n', 'z'], { replace: 'nada' });
    expect(none.changed).toEqual(['z']);
    expect(none.kept.map(k => k.why)).toEqual(['ya tiene una propuesta pendiente', 'ya tiene una propuesta pendiente']);
  });

  it('las letras acentuadas se proponen como componentes cuando base y marca existen o se proponen a la vez', () => {
    const d = board();
    const r = proposeGlyphs(d, ['á', 'ñ', 'í', '´', '˜', 'n', 'ı', 'Ó']);
    for (const ch of ['á', 'ñ', 'í']) {
      const g = r.doc.glyphs[ch];
      expect(g.contours, ch).toEqual([]);
      expect(g.components.map(c => c.of), ch).toEqual([MARKS[ch].base, MARKS[ch].mark]);
      expect(g.status).toBe('propuesto');
    }
    // á is built on the person's own a
    expect(r.doc.glyphs['á'].components[0].of).toBe('a');
    // Ó: neither O nor ´ for it... ´ is proposed, O is not: drawn as one outline instead
    expect(r.doc.glyphs['Ó'].components).toEqual([]);
    expect(r.doc.glyphs['Ó'].contours.length).toBeGreaterThan(0);
    // the composed accent resolves to base + mark outlines
    const accepted = structuredClone(r.doc);
    for (const k of ['n', '˜']) accepted.glyphs[k].status = 'aceptado';
    expect(glyphContours(accepted, 'ñ').length).toBe(accepted.glyphs.n.contours.length + accepted.glyphs['˜'].contours.length);
  });

  it('compara variantes visiblemente distintas sin escribirlas', () => {
    const d = doc0();
    const before = JSON.stringify(d);
    const v = compareVariants(d, 'a');
    expect(v).toHaveLength(3);
    expect(v.map(g => g.gen!.variant)).toEqual([0, 1, 2]);
    const inks = v.map(g => inkOf(d, g));
    expect(new Set(inks.map(x => x.toFixed(4))).size).toBe(3);
    const widths = v.map(g => { const b = bboxOf(g.contours)!; return b.x1 - b.x0; });
    expect(widths[2]).toBeLessThan(widths[0] * 0.95);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('bloquea las referencias con dibujo', () => {
    const d = board();
    d.refs = ['H', 'n'];
    const locked = lockReferences(d);
    expect(locked.glyphs.H.status).toBe('bloqueado');
    expect(locked.glyphs.n.status).toBe('vacio');
    expect(d.glyphs.H.status).toBe('dibujado');
  });
});
