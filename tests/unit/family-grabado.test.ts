import { describe, expect, it } from 'vitest';
import { create, fadeTau, SPACING } from '../../src/families/sims/grabado';
import { META } from '../../src/families/meta/grabado';
import {
  isoContours, maskStrokes, planRoute, polyLength, routeAt, routeEnd, sampleMask, TRAVEL, walkCut, type Route, type Trazo,
} from '../../src/families/sims/grabado-ruta';
import { figureStrokes, signatureStrokes, wordStrokes, FIGURES } from '../../src/families/sims/grabado-trazos';
import { textSource } from '../../src/families/source';
import { FamilyHost, type HostSource } from '../../src/families/host';
import { familyRecipe } from '../../src/families/recipes';
import { defaultParams, normFam } from '../../src/families/params';
import { loadFamilyNow } from '../../src/families/load';
import type { FieldModel, Params, SourceFeed } from '../../src/families/types';

/**
 * «Grabado láser» (C-07): the contours of the person's words (holes, accents, ñ, several lines, long texts), the
 * route that joins them without engraving between them and runs them by arc length, and the model that cuts
 * along it (determinism with the same words, exact snapshots, other words start a new route without jumping).
 */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });

/**
 * A text mask as the engines hand it (families/source.ts textSource): the own single-stroke type drawn thick on a
 * W × H canvas (2:1, so the canvas is the layer's domain at scale 1). Stands for the letters of the studio.
 */
function textMask(text: string, W = 512, H = 256, thick = 0.016): HostSource & { mask: Uint8Array } {
  const mask = new Uint8Array(W * H);
  for (const t of wordStrokes(text, 1.6, 0.74)) {
    const p = t.pts, n = p.length / 2, segs = t.closed ? n : n - 1;
    for (let s = 0; s < segs; s++) {
      const a = s, b = (s + 1) % n;
      // to pixels: x ∈ [−1, 1] → [0, W], y ∈ [0.5, −0.5] → [0, H]
      const ax = ((p[a * 2] + 1) / 2) * W, ay = (0.5 - p[a * 2 + 1]) * H, bx = ((p[b * 2] + 1) / 2) * W, by = (0.5 - p[b * 2 + 1]) * H;
      const r = thick * H, x0 = Math.floor(Math.min(ax, bx) - r - 1), x1 = Math.ceil(Math.max(ax, bx) + r + 1);
      const y0 = Math.floor(Math.min(ay, by) - r - 1), y1 = Math.ceil(Math.max(ay, by) + r + 1);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const px = x + 0.5, py = y + 0.5, t2 = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        const d = Math.hypot(px - ax - dx * t2, py - ay - dy * t2);
        const v = Math.round(Math.max(0, Math.min(1, r - d + 0.5)) * 255);
        if (v > mask[y * W + x]) mask[y * W + x] = v;
      }
    }
  }
  return Object.assign(textSource(mask, W, H, W, H, text, 1), { mask });
}
/** The source as a model at layer scale 1 reads it. */
const feedOf = (s: HostSource, version = 1): SourceFeed => ({ kind: 2, version, text: s.text, at: (x, y, o) => s.at(x, y, o) });

const raster = (m: FieldModel) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
const colour = (m: FieldModel) => { const o = new Uint8Array(m.w * m.h * 3); m.render(new Uint8Array(m.w * m.h), 0); m.renderColor!(o, 0); return o; };
const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
type Debug = { debug(): { route: Route | null; state: Record<string, number> } };
const dbg = (m: FieldModel) => (m as unknown as Debug).debug();

/** Level-0 contours (outlines) and parts of a text's mask (letters drawn `thick` wide on a W × W/2 canvas). */
function cutsOf(text: string, passes = 1, thick = 0.016, W = 512, gh = 160) {
  const src = textMask(text, W, W / 2, thick);
  return maskStrokes(sampleMask(feedOf(src), gh), passes, SPACING);
}
const outlines = (t: Trazo[]) => t.filter(s => s.level === 0);

/** Distance from a point to a polyline. */
function distTo(t: Trazo, x: number, y: number) {
  const p = t.pts, n = p.length / 2, segs = t.closed ? n : n - 1;
  let best = Infinity;
  for (let s = 0; s < segs; s++) {
    const a = s, b = (s + 1) % n, ax = p[a * 2], ay = p[a * 2 + 1], dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
    const L2 = dx * dx + dy * dy || 1e-18, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * u, y - ay - dy * u));
  }
  return best;
}

describe('grabado: contornos de una máscara', () => {
  it('un anillo da dos contornos cerrados, el de fuera y el del hueco, con su longitud', () => {
    const w = 200, h = 100, v = new Float32Array(w * h);
    // an antialiased ring (as a text mask is): the 0.5 level at r = 15 and r = 30
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const r = Math.hypot(i - 100, j - 50); v[j * w + i] = clamp(30.5 - r) * clamp(r - 14.5); }
    const loops = isoContours(v, w, h, 0.5);
    expect(loops.length).toBe(2);
    const L = loops.map(l => polyLength(l, true)).sort((a, b) => a - b);
    expect(L[0] / (2 * Math.PI * 15)).toBeCloseTo(1, 1);
    expect(L[1] / (2 * Math.PI * 30)).toBeCloseTo(1, 1);
    // closed: the polyline comes back next to where it started
    for (const l of loops) expect(Math.hypot(l[0] - l[l.length - 2], l[1] - l[l.length - 1])).toBeLessThan(1.5);
  });

  it('letras con huecos: la O y la A tienen dos contornos, la B tres', () => {
    for (const [ch, n] of [['O', 2], ['A', 2], ['B', 3], ['D', 2], ['L', 1]] as const) {
      const c = cutsOf(ch);
      expect(c.letters, ch).toBe(1);
      expect(outlines(c.strokes).length, ch).toBe(n);
      expect(c.strokes.every(s => s.closed)).toBe(true);
    }
  });

  it('la ñ y los acentos son piezas propias de su letra: Ñ, É, Ü, ç', () => {
    expect(cutsOf('Ñ').letters).toBe(2);
    expect(cutsOf('ñ').letters).toBe(2);
    expect(cutsOf('É').letters).toBe(2);
    expect(cutsOf('Ü').letters).toBe(3);
    // the cedilla hangs from the C (one part): its outline is longer and reaches below the baseline
    const len = (t: Trazo[]) => t.reduce((s, x) => s + polyLength(x.pts, x.closed), 0);
    const low = (t: Trazo[]) => Math.min(...t.flatMap(x => Array.from(x.pts.filter((_, i) => i % 2 === 1))));
    expect(len(cutsOf('Ç').strokes)).toBeGreaterThan(len(cutsOf('C').strokes) * 1.1);
    expect(low(cutsOf('Ç').strokes)).toBeLessThan(low(cutsOf('C').strokes) - 0.02);
    // the mark sits above the letter (the tilde's outline is higher than every point of the N)
    const c = cutsOf('Ñ'), parts = new Map<number, Trazo[]>();
    for (const s of outlines(c.strokes)) parts.set(s.group, [...(parts.get(s.group) ?? []), s]);
    const tops = [...parts.values()].map(ss => Math.min(...ss.flatMap(s => Array.from(s.pts.filter((_, i) => i % 2 === 1))))).sort((a, b) => a - b);
    expect(tops[1]).toBeGreaterThan(tops[0] + 0.1);
  });

  it('varias líneas y un texto largo: cada letra con sus contornos', () => {
    const two = cutsOf('AB\nO');
    expect(two.letters).toBe(3);
    expect(outlines(two.strokes).length).toBe(2 + 3 + 2);
    const long = cutsOf('LO QUE SE ESCRIBE\nTAMBIEN SE GRABA 2026', 1, 0.006, 1024, 192);
    // 31 letters and digits; the ones with holes add theirs (O, Q, B, R, A, A, B, R, A, B, A, 0, 6…)
    expect(long.letters).toBeGreaterThanOrEqual(31);
    expect(outlines(long.strokes).length).toBeGreaterThan(long.letters);
  });

  it('los cortes paralelos quedan dentro de la letra, a su distancia del borde, y se acercan en letras finas', () => {
    const c = cutsOf('O', 3, 0.045), outer = outlines(c.strokes);
    const inner = c.strokes.filter(s => s.level === 1);
    expect(inner.length).toBeGreaterThan(0);
    for (const s of inner) for (let i = 0; i < s.pts.length; i += 2) {
      const d = Math.min(...outer.map(o => distTo(o, s.pts[i], s.pts[i + 1])));
      expect(Math.abs(d - SPACING * c.fit)).toBeLessThan(0.012);
    }
    // a long text has thinner letters: its cuts fit them (closer) and its groove gets narrower
    expect(c.fit).toBe(1);
    expect(cutsOf('LO QUE SE ESCRIBE\nTAMBIEN SE GRABA 2026', 3, 0.006, 1024, 192).fit).toBeLessThan(1);
  });

  it('sin letras no hay trazos', () => {
    const empty = textSource(new Uint8Array(64 * 32), 64, 32, 64, 32, '', 1);
    expect(maskStrokes(sampleMask(feedOf(empty), 64), 3, SPACING).strokes.length).toBe(0);
  });
});

describe('grabado: la ruta', () => {
  const check = (r: Route, strokes: Trazo[]) => {
    // every engraved segment lies on its stroke: nothing is engraved between two contours
    for (let i = 0; i < r.n - 1; i++) {
      if (!r.on[i]) { expect(r.stroke[i]).toBe(-1); continue; }
      const t = strokes[r.stroke[i]];
      expect(distTo(t, r.x[i], r.y[i])).toBeLessThan(1e-9);
      expect(distTo(t, r.x[i + 1], r.y[i + 1])).toBeLessThan(1e-9);
    }
    // each stroke engraved whole, once: the engraved length is the strokes' length
    const total = strokes.reduce((s, t) => s + polyLength(t.pts, t.closed), 0);
    expect(r.cut).toBeCloseTo(total, 9);
    // a group (a letter) is engraved whole before the next one, outline first
    const seq: number[] = [];
    for (let i = 0; i < r.n - 1; i++) if (r.on[i]) { const g = strokes[r.stroke[i]].group; if (seq[seq.length - 1] !== g) seq.push(g); }
    expect(new Set(seq).size).toBe(seq.length);
    for (let i = 1; i < r.n - 1; i++) {
      if (!r.on[i] || !r.on[i - 1]) continue;
      const a = strokes[r.stroke[i - 1]], b = strokes[r.stroke[i]];
      if (a.group === b.group) expect(b.level).toBeGreaterThanOrEqual(a.level);
    }
  };

  it('une los contornos de varias letras con desplazamientos apagados', () => {
    const c = cutsOf('ÑO\nBA', 3);
    const r = planRoute(c.strokes, -0.9, 0.4);
    check(r, c.strokes);
    expect(r.on.filter(v => !v).length).toBeGreaterThanOrEqual(c.strokes.length);
  });

  it('las figuras, la firma y la palabra propia también', () => {
    for (const f of FIGURES) { const s = figureStrokes(f, 3, 'semilla', 2); check(planRoute(s, 0, 0), s); }
    const sig = signatureStrokes(1, 'semilla');
    check(planRoute(sig, -0.9, 0), sig);
    const word = wordStrokes('Ñandú 2026');
    check(planRoute(word, -0.9, 0), word);
  });

  it('P(s) por longitud de arco: la punta va a velocidad constante, cuatro veces más rápida apagada', () => {
    const c = cutsOf('OB', 2), r = planRoute(c.strokes, -0.9, 0.4), o0 = new Float64Array(4), o1 = new Float64Array(4);
    const end = routeEnd(r);
    let checked = 0;
    for (let k = 0; k < 400; k++) {
      const cst = (end * (k + 0.5)) / 400, dc = 1e-4;
      routeAt(r, cst, o0); routeAt(r, cst + dc, o1);
      if (o0[2] !== o1[2]) continue; // a segment change in between
      const ds = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
      // on a segment the distance travelled is the cost (engraving) or TRAVEL times it (moving)
      if (Math.abs(o1[3] - o0[3] - ds) > 1e-9) continue; // a corner inside the step
      expect(ds).toBeCloseTo(o0[2] ? dc : dc * TRAVEL, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
    // walking the whole route engraves exactly its cut length, in samples no longer than asked
    let longest = 0;
    const got = walkCut(r, 0, end, 0.004, (_x, _y, _ux, _uy, dl) => { longest = Math.max(longest, dl); });
    expect(got).toBeCloseTo(r.cut, 9);
    expect(longest).toBeLessThanOrEqual(0.004 + 1e-12);
  });

  it('la palabra propia lleva la ñ, las tildes y la diéresis como marcas de su letra', () => {
    const s = wordStrokes('ñandú pingüino');
    const groups = new Set(s.map(t => t.group));
    expect(groups.size).toBe('ñandúpingüino'.length);
    // Ñ: N plus the tilde; Ü: U plus two dots
    expect(s.filter(t => t.group === 0).length).toBe(2);
    expect(s.filter(t => t.group === 10).length).toBe(3);
    expect(wordStrokes('').length).toBe(0);
    expect(wordStrokes('你好').length).toBe(0);
  });
});

describe('grabado: el modelo', () => {
  const RES = 64;
  const textRun = (text: string, p: Params = {}, seed = 'g') => {
    const m = create({ seed, params: base(p), res: RES });
    m.feed!(feedOf(textMask(text)));
    return m;
  };

  it('la misma semilla y el mismo texto dan el mismo grabado; otro texto, otro', () => {
    const a = textRun('GLYPHOS'), b = textRun('GLYPHOS'), c = textRun('ÑANDÚ');
    for (const m of [a, b, c]) m.step(240);
    expect(mad(raster(a), raster(b))).toBe(0);
    expect(mad(colour(a), colour(b))).toBe(0);
    expect(mad(raster(a), raster(c))).toBeGreaterThan(1);
    // the route is the words' contours, not the own word
    expect(dbg(a).route!.strokes).toBeGreaterThan(dbg(create({ seed: 'g', params: base({ pasadas: 3 }), res: RES })).route!.strokes / 4);
    expect(dbg(a).state.sigN).not.toBe(dbg(c).state.sigN);
  });

  it('guardar y restaurar con texto continúa exactamente (el estado lleva dónde está la punta en su ruta)', () => {
    const a = textRun('OB\nÑ');
    a.step(200);
    const snap = a.snapshot();
    a.step(150);
    const b = create({ seed: 'g', params: base(), res: RES });
    // as the host does: restore, then hand the source, then step
    b.restore(snap);
    b.feed!(feedOf(textMask('OB\nÑ'), 7));
    b.step(150);
    expect(mad(raster(a), raster(b))).toBe(0);
    expect(mad(colour(a), colour(b))).toBe(0);
  });

  it('la punta avanza por longitud de arco a la velocidad elegida y no graba en los desplazamientos', () => {
    const m = textRun('I  I', { velocidad: 0.6, chispas: 0, humo: 0, pasadas: 1 });
    m.step(1);
    const r = dbg(m).route!;
    let prev = dbg(m).state.cost;
    for (let k = 0; k < 120; k++) {
      m.step(1);
      const c = dbg(m).state.cost;
      if (dbg(m).state.phase !== 0) break;
      expect(c - prev).toBeCloseTo(0.6 / 30, 9);
      prev = c;
    }
    // finish the route, then look at the groove along the moves between the two letters
    m.step(Math.ceil((routeEnd(r) / 0.6) * 30) + 10);
    const snap = m.snapshot(), G = snap.arrays.G as Float32Array, w = m.w, h = m.h;
    const on = r.strokes ? Array.from({ length: r.n - 1 }, (_, i) => i).filter(i => r.on[i]) : [];
    const nearCut = (x: number, y: number) => on.some(i => {
      const ax = r.x[i], ay = r.y[i], dx = r.x[i + 1] - ax, dy = r.y[i + 1] - ay, L2 = dx * dx + dy * dy;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      return Math.hypot(x - ax - dx * u, y - ay - dy * u) < 0.06;
    });
    let probed = 0;
    for (let i = 0; i < r.n - 1; i++) {
      if (r.on[i]) continue;
      for (let f = 0.05; f < 1; f += 0.05) {
        const x = r.x[i] + (r.x[i + 1] - r.x[i]) * f, y = r.y[i] + (r.y[i + 1] - r.y[i]) * f;
        if (nearCut(x, y)) continue;
        const ci = Math.min(w - 1, Math.max(0, Math.round(((x + 1) / 2) * w - 0.5))), cj = Math.min(h - 1, Math.max(0, Math.round((0.5 - y) * h - 0.5)));
        expect(G[cj * w + ci], `surco en un desplazamiento (${x.toFixed(2)}, ${y.toFixed(2)})`).toBeLessThan(0.01);
        probed++;
      }
    }
    expect(probed).toBeGreaterThan(5);
  });

  it('otro texto empieza otra ruta desde donde está la punta: lo grabado se disuelve y nada salta', () => {
    const m = textRun('OB');
    m.step(150);
    const before = { ...dbg(m).state };
    m.feed!(feedOf(textMask('LUZ'), 2));
    m.step(1);
    const after = dbg(m).state;
    expect(after.k).toBe(before.k + 1);
    expect(after.wOn).toBe(1);
    expect(after.sx).toBeCloseTo(before.tipX, 9); expect(after.sy).toBeCloseTo(before.tipY, 9);
    expect(Math.hypot(after.tipX - before.tipX, after.tipY - before.tipY)).toBeLessThan(0.6 * TRAVEL / 30 + 1e-9);
    // half a second later the old words are nearly gone
    m.step(45);
    const W = m.snapshot().arrays.W as Float32Array;
    expect(Math.max(...W)).toBeLessThan(0.1);
  });

  it('textos vacíos: graba la palabra propia; sin palabra propia, una figura; nunca una ruta vacía', () => {
    const empty = feedOf(textSource(new Uint8Array(64 * 32), 64, 32, 64, 32, '', 1));
    const own = create({ seed: 'g', params: base(), res: RES });
    own.feed!(empty); own.step(60);
    expect(dbg(own).route!.strokes).toBe(dbg(create({ seed: 'g', params: base(), res: RES })).route!.strokes);
    const none = create({ seed: 'g', params: base({ palabra: '' }), res: RES });
    none.feed!(empty); none.step(60);
    expect(dbg(none).route!.strokes).toBeGreaterThan(0);
    expect(raster(none).some(v => v > 100)).toBe(true);
    // a picture is not followed: the same as no source
    const pic: SourceFeed = { kind: 1, version: 1, at: (_x, _y, o) => { o[0] = o[1] = o[2] = o[3] = 1; } };
    const withPic = create({ seed: 'g', params: base(), res: RES });
    withPic.feed!(pic); withPic.step(60);
    const plain = create({ seed: 'g', params: base(), res: RES });
    plain.step(60);
    expect(mad(raster(withPic), raster(plain))).toBe(0);
  });

  it('«Una vez y se queda» termina, se enfría y se queda quieto; «sin fin» empieza otra pasada', () => {
    const p = { velocidad: 1.5, pasadas: 1, origen: 'forma', figura: 'poligono' };
    const once = create({ seed: 'g', params: base({ ...p, ciclo: 'una' }), res: RES });
    once.step(30 * 12);
    expect(dbg(once).state.phase).toBe(2);
    const a = raster(once);
    once.step(60);
    // sparks and smoke are gone by then too: nothing changes
    expect(mad(a, raster(once))).toBe(0);
    const ever = create({ seed: 'g', params: base({ ...p, ciclo: 'continuo' }), res: RES });
    ever.step(30 * 12);
    expect(dbg(ever).state.k).toBeGreaterThan(0);
    const b = raster(ever);
    ever.step(60);
    expect(mad(b, raster(ever))).toBeGreaterThan(0.05);
  });

  it('la persistencia decide cuánto dura el surco (sólo sin fin)', () => {
    expect(fadeTau(0)).toBeCloseTo(1, 9);
    expect(fadeTau(1)).toBeCloseTo(120, 9);
    const groove = (pers: number, ciclo = 'continuo') => {
      const m = create({ seed: 'g', params: base({ persistencia: pers, ciclo, chispas: 0, humo: 0 }), res: RES });
      m.step(30 * 8);
      const G = m.snapshot().arrays.G as Float32Array;
      let s = 0; for (const v of G) s += v;
      return s;
    };
    expect(groove(0)).toBeLessThan(groove(1) * 0.5);
    expect(groove(0, 'una')).toBeCloseTo(groove(1, 'una'), 6);
  });

  it('la punta y las chispas son calientes y el surco del acero frío (color por celda)', () => {
    const m = create({ seed: 'g', params: base({ humo: 0, chispas: 1 }), res: RES });
    m.step(150);
    const L = raster(m), C = colour(m), s = m.snapshot(), H = s.arrays.H as Float32Array, G = s.arrays.G as Float32Array;
    let hot = 0, hotR = 0, hotB = 0, cold = 0, coldR = 0, coldB = 0;
    for (let i = 0; i < L.length; i++) {
      const r = C[i * 3], b = C[i * 3 + 2];
      if (H[i] > 0.25) { hot++; hotR += r; hotB += b; } else if (H[i] === 0 && G[i] > 0.6 && L[i] > 100) { cold++; coldR += r; coldB += b; }
    }
    expect(hot).toBeGreaterThan(0);
    expect(cold).toBeGreaterThan(20);
    expect(hotR).toBeGreaterThan(hotB * 1.5);
    // the steel cut away from the heat (a fresh one keeps a warm temper for a few seconds: some cells are straw)
    expect(coldB).toBeGreaterThan(coldR * 0.8);
  });

  it('los presets tienen comportamientos distintos y contratos honestos', () => {
    const tc = Object.fromEntries(META.presets.map(pr => [pr.id, (META.caps.time as { values: Record<string, string>; else: string }).values[String(pr.params.ciclo)] ?? 'continuo']));
    expect(tc).toEqual({ 'tu-palabra': 'continuo', geometria: 'continuo', firma: 'continuo', placa: 'construccion', luz: 'continuo' });
    expect(META.presets.find(p => p.id === 'tu-palabra')!.uses).toEqual(expect.arrayContaining(['tipo/texturas', 'terminal/consola']));
    expect(META.reads).toEqual(['source']);
  });
});

describe('grabado: el anfitrión con texto', () => {
  const recipe = () => {
    const r = familyRecipe('grabado', 'tu-palabra');
    r.source = 'text';
    r.layers[0].fam = normFam(META, { ...r.layers[0].fam, res: 48 });
    return r;
  };
  const src = (text: string, version: number): HostSource => ({ ...textMask(text, 256, 128), version });

  it('un motor fijo: el mismo momento por pasos o de un salto, y otras palabras empiezan otra ejecución', async () => {
    await loadFamilyNow('grabado');
    const r = recipe();
    const a = new FamilyHost({ live: false, catchupBudget: 1e9 }), b = new FamilyHost({ live: false, catchupBudget: 1e9 });
    a.setSource(src('ÑO', 1));
    for (const t of [0.5, 1, 1.5, 2, 3]) a.update(r, t);
    // b draws other words first, then the same ones as a (another canvas, another version)
    b.setSource(src('BIEN', 1)); b.update(r, 3);
    const other = b.raster(0)!.data.slice();
    b.setSource(src('ÑO', 5)); b.update(r, 3);
    expect(mad(a.raster(0)!.data, b.raster(0)!.data)).toBe(0);
    expect(mad(a.raster(0)!.data, other)).toBeGreaterThan(0.5);
    // going back in time starts again from the seed, reading the same words
    a.update(r, 1);
    const c = new FamilyHost({ live: false, catchupBudget: 1e9 });
    c.setSource(src('ÑO', 9)); c.update(r, 1);
    expect(mad(a.raster(0)!.data, c.raster(0)!.data)).toBe(0);
  });

  it('en vivo, escribir otro texto no reinicia la ejecución: la punta sigue desde donde está', async () => {
    await loadFamilyNow('grabado');
    const r = recipe();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.setSource(src('ÑO', 1));
    for (let t = 0.1; t <= 2; t += 0.1) h.update(r, t);
    const steps = h.info(r)[0].steps;
    h.setSource(src('LUZ', 2));
    for (let t = 2.1; t <= 3; t += 0.1) h.update(r, t);
    expect(h.info(r)[0].steps).toBeGreaterThan(steps);
  });
});
