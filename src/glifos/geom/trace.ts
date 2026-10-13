/**
 * Bitmap → contours («Vectorizar»): marching squares on the ink of a picture, with sub-pixel edges where the
 * picture is antialiased, then simplification and curve fitting. Holes come out as their own contours (o, A, B),
 * specks are dropped, and the result is oriented like every glyph: outer contours counter-clockwise, holes
 * clockwise (font units, y up). It only returns contours: the picture is never touched. Pure: no DOM.
 */
import type { Contour, Pt } from '../doc';
import { fitCurve, simplify } from './fit';
import { reverseContour, signedArea } from './ops';
import { miles } from './svgpath';

export const TRACE_LIMITS = { contours: 300, nodes: 6000 } as const;

export interface TraceOptions {
  /** Ink (0..1) above which a pixel is ink. */
  threshold: number;
  /** Top-left corner of the bitmap in font units (y up) and font units per pixel. */
  place: { x: number; y: number; s: number };
  /** Fitting tolerance in pixels (0.8 by default). */
  tolerance?: number;
  /** Shapes and holes smaller than this many square pixels are dropped (4 by default). */
  minArea?: number;
  /** At most this many contours (300 by default, the document's limit). */
  maxContours?: number;
}

const ringArea = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };

/**
 * Iso-lines of the ink at the threshold as closed rings in pixel coordinates (x right, y down, pixel (i, j)
 * centred at (i + 0.5, j + 0.5)). Every ring keeps ink on the same side, so outer boundaries and holes come out
 * with opposite orientations.
 */
function isoRings(ink: Uint8Array, w: number, h: number, threshold: number): Pt[][] {
  const W = w + 2, H = h + 2;
  const t = Math.max(0, Math.min(1, threshold)) * 255;
  // a padded field (blank paper on the border, like ink 0) so every ring closes
  const f = new Float32Array(W * H).fill(Math.min(-t, -1e-3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = ink[y * w + x] - t;
    f[(y + 1) * W + x + 1] = v > 0 ? v : Math.min(v, -1e-3);
  }
  const pos = (i: number, j: number) => ({ x: i - 0.5, y: j - 0.5 });
  const cache = new Map<number, Pt>();
  // edge ids: horizontal edge (i, j)-(i+1, j) → 2·(j·W + i); vertical edge (i, j)-(i, j+1) → 2·(j·W + i) + 1
  const edgePt = (id: number): Pt => {
    let p = cache.get(id);
    if (p) return p;
    const k = id >> 1, i = k % W, j = (k - i) / W;
    const [i2, j2] = id & 1 ? [i, j + 1] : [i + 1, j];
    const a = f[j * W + i], b = f[j2 * W + i2];
    const r = a / (a - b);
    const pa = pos(i, j), pb = pos(i2, j2);
    p = { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r };
    cache.set(id, p);
    return p;
  };
  const next = new Map<number, number>();
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = f[j * W + i] > 0, b = f[j * W + i + 1] > 0, c = f[(j + 1) * W + i + 1] > 0, d = f[(j + 1) * W + i] > 0;
    const n = +a + +b + +c + +d;
    if (n === 0 || n === 4) continue;
    const top = 2 * (j * W + i), bottom = 2 * ((j + 1) * W + i), left = 2 * (j * W + i) + 1, right = 2 * (j * W + i + 1) + 1;
    // corners in order a (top-left), b (top-right), c (bottom-right), d (bottom-left); edges between them
    const ins = [a, b, c, d];
    const cornerEdges: Array<[number, number]> = [[left, top], [top, right], [right, bottom], [bottom, left]];
    const cornerPos = [pos(i, j), pos(i + 1, j), pos(i + 1, j + 1), pos(i, j + 1)];
    const segs: Array<{ e: [number, number]; corner: number }> = [];
    if (n === 1 || n === 3) {
      const k = ins.indexOf(n === 1);
      segs.push({ e: cornerEdges[k], corner: k });
    } else if (ins[0] === ins[2]) {
      // saddle: the centre decides which pair of corners is connected
      const centre = (f[j * W + i] + f[j * W + i + 1] + f[(j + 1) * W + i + 1] + f[(j + 1) * W + i]) / 4 > 0;
      const iso = ins.map((v, k) => (v !== centre ? k : -1)).filter(k => k >= 0);
      for (const k of iso) segs.push({ e: cornerEdges[k], corner: k });
    } else {
      // two neighbouring corners inside: a straight cut between the other two edges
      const k = ins.findIndex((v, q) => v && ins[(q + 1) % 4]);
      const e1 = cornerEdges[k][0], e2 = cornerEdges[(k + 1) % 4][1];
      segs.push({ e: [e1, e2], corner: k });
    }
    for (const s of segs) {
      let [e1, e2] = s.e;
      const p1 = edgePt(e1), p2 = edgePt(e2), q = cornerPos[s.corner];
      // ink on the right of the walking direction (image coordinates)
      const cr = (p2.x - p1.x) * (q.y - p1.y) - (p2.y - p1.y) * (q.x - p1.x);
      const inkSide = ins[s.corner] ? cr : -cr;
      if (inkSide < 0) [e1, e2] = [e2, e1];
      next.set(e1, e2);
    }
  }
  const rings: Pt[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: Pt[] = [];
    let e: number | undefined = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      ring.push(edgePt(e));
      e = next.get(e);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Vectorises a bitmap of ink values (0..255, row by row from the top). Returns contours in font units and
 * Spanish warnings when limits cut the result.
 */
export function traceBitmap(ink: Uint8Array, w: number, h: number, o: TraceOptions): { contours: Contour[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!(w > 0 && h > 0) || ink.length < w * h) throw new Error('La imagen para vectorizar no tiene el tamaño indicado.');
  const tolPx = Math.max(0.05, o.tolerance ?? 0.8);
  const minArea = Math.max(0, o.minArea ?? 4);
  const maxC = Math.max(1, Math.min(TRACE_LIMITS.contours, o.maxContours ?? TRACE_LIMITS.contours));
  const { x: X, y: Y, s } = o.place;
  let rings = isoRings(ink, w, h, o.threshold).map(r => ({ r, a: ringArea(r) })).filter(r => Math.abs(r.a) >= Math.max(minArea, 1e-6));
  const dropped = rings.length;
  if (rings.length > maxC) {
    rings.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
    rings = rings.slice(0, maxC);
    warnings.push(`La imagen daba ${miles(dropped)} contornos: se conservaron los ${miles(maxC)} más grandes.`);
  }
  // ink is on the right in y-down pixels, so outer rings have negative pixel area; y up flips that sign
  const toFont = (p: Pt): Pt => ({ x: X + p.x * s, y: Y - p.y * s });
  const fit = (tolScale: number) => rings.map(({ r }) => {
    const simple = simplify(r, tolPx * 0.75 * tolScale, true);
    return fitCurve(simple.map(toFont), true, tolPx * s * tolScale, 50);
  });
  let contours = fit(1);
  const count = (cs: Contour[]) => cs.reduce((n, c) => n + c.nodes.length, 0);
  let scale = 1;
  while (count(contours) > TRACE_LIMITS.nodes && scale < 16) {
    scale *= 2;
    contours = fit(scale);
  }
  if (scale > 1) warnings.push(`El dibujo tenía demasiados nodos: se simplificó con una tolerancia ${scale} veces mayor.`);
  if (count(contours) > TRACE_LIMITS.nodes) {
    // still too many: keep the biggest shapes that fit
    const order = contours.map((c, i) => ({ c, a: Math.abs(signedArea(c)), i })).sort((p, q) => q.a - p.a);
    const keep: Contour[] = [];
    let n = 0;
    for (const { c } of order) if (n + c.nodes.length <= TRACE_LIMITS.nodes) { keep.push(c); n += c.nodes.length; }
    warnings.push(`Se descartaron ${contours.length - keep.length} contornos pequeños para no pasar de ${miles(TRACE_LIMITS.nodes)} nodos.`);
    contours = keep;
  }
  contours = contours.filter(c => c.nodes.length >= 2);
  // orientation: the largest ring is an outer boundary; marching keeps all rings consistent with it
  if (contours.length) {
    const areas = contours.map(signedArea);
    let big = 0;
    areas.forEach((a, i) => { if (Math.abs(a) > Math.abs(areas[big])) big = i; });
    if (areas[big] < 0) contours = contours.map(reverseContour);
  }
  return { contours, warnings };
}
