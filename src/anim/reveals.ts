/**
 * Templates that uncover or hide a layer by where and when: wipes, irises, regions and flickers. On glyph
 * and ASCII layers they work cell by cell (the edge is made of characters); on photos, texts and shapes
 * they use a mask (a soft edge) or square tiles.
 *
 *   iris               «Iris»: a circle, diamond or square opens from a point
 *   escaneo            «Barrido de escáner»: a luminous beam crosses the frame and leaves the layer behind
 *   espiral            «Espiral»: cells pop in along a spiral from the centre
 *   persianas          «Persianas»: slats at an angle open one after another
 *   partes-a-destiempo «Partes a destiempo»: regions (Voronoi, bands, brightness, grid, mask parts) each
 *                      with its own delay, each appearing its own way
 *   neon               «Encendido de neón»: flickers on like a tube that warms up, some letters later
 *   parpadeo           «Parpadeo foto ⇄ ASCII»: a controlled number of brief flickers (rhythm, bounded chance)
 *   estrobo            «Estroboscopio»: regular flashes (negative, white or off), with a photosensitivity limit
 *   secuencia-fotos    «Transición entre fotos»: characters cover each change of photo of a sequence
 */
import { hashString, rand01, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from '../project/clips';
import type { Finish, Layer, Mask, MaskPart } from '../project/types';
import {
  ALL_KINDS, bell, bool, cellX, cellY, clamp, clamp01, easeOutBack, geo, heldP, num, orderField, P, perCell, perCellVisibility, PICTURE_KINDS,
  regionField, smooth, span01, stagger, str, sweep, type OrderKind,
} from './kit';

const frameOf = (ctx: ClipContext) => ({ W: Math.max(1, ctx.project.canvas.w), H: Math.max(1, ctx.project.canvas.h) });
const maskOf = (parts: MaskPart[], feather = 0): Mask => ({ invert: false, feather, opacity: 1, parts });

/* ------------------------------------------------------------------ Iris */

/** A polygon (frame units) of a shape of radius R px around (cx, cy) px. */
function irisPoly(shape: string, cx: number, cy: number, R: number, W: number, H: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = shape === 'rombo' ? (k * Math.PI) / 2 : Math.PI / 4 + (k * Math.PI) / 2;
    const r = shape === 'rombo' ? R : R * Math.SQRT2 * 0.72;
    pts.push((cx + Math.cos(a) * r) / W, (cy + Math.sin(a) * r) / H);
  }
  return pts;
}

registerTemplate({
  id: 'iris',
  name: 'Iris',
  blurb: 'La capa se abre desde un punto en círculo, rombo o cuadrado, con borde suave o hecho de celdas.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 1.5,
  params: [
    ...P.center(),
    { key: 'forma', label: 'Forma', type: 'select', options: [['circulo', 'Círculo'], ['rombo', 'Rombo'], ['cuadrado', 'Cuadrado']], def: 'circulo' },
    { key: 'borde', label: 'Borde', type: 'select', options: [['suave', 'Suave'], ['celdas', 'Hecho de celdas']], def: 'suave' },
    { key: 'suavidad', label: 'Suavidad', type: 'range', min: 0, max: 200, step: 1, def: 24, unit: 'px' },
    { key: 'rebote', label: 'Rebote al abrir', type: 'toggle', def: false },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    if (ctx.p >= 1) return null;
    const { W, H } = frameOf(ctx);
    const cx = num(ctx, 'x', 0.5) * W, cy = num(ctx, 'y', 0.5) * H;
    const shape = str(ctx, 'forma', 'circulo');
    const soft = num(ctx, 'suavidad', 24);
    // far enough to uncover the farthest corner, soft edge included
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    const k = bool(ctx, 'rebote') ? easeOutBack(ctx.p, 1.2) : ctx.p;
    const R = Math.max(0, k * (far * (shape === 'circulo' ? 1 : 1.45) + soft));
    if (str(ctx, 'borde', 'suave') === 'celdas' && ctx.layer.kind !== 'text' && ctx.layer.kind !== 'shape') {
      return perCellVisibility(ctx, g => {
        const G = geo(g);
        const band = Math.max(G.cw, soft);
        return (_i, c, r) => {
          const dx = cellX(G, c) - cx, dy = cellY(G, r) - cy;
          const d = shape === 'circulo' ? Math.hypot(dx, dy) : shape === 'rombo' ? Math.abs(dx) + Math.abs(dy) : Math.max(Math.abs(dx), Math.abs(dy)) * 1.02;
          return smooth((R - d) / band);
        };
      }, { tileCell: 16 });
    }
    const part: MaskPart = shape === 'circulo'
      ? { kind: 'ellipse', op: 'add', x: (cx - R) / W, y: (cy - R) / H, w: (2 * R) / W, h: (2 * R) / H, rot: 0, soft, alpha: 1 }
      : { kind: 'polygon', op: 'add', pts: irisPoly(shape, cx, cy, R, W, H), soft, alpha: 1 };
    return { within: maskOf([part]) };
  },
});

/* ------------------------------------------------------------------ Barrido de escáner */

registerTemplate({
  id: 'escaneo',
  name: 'Barrido de escáner',
  blurb: 'Un haz luminoso cruza el cuadro y deja la capa detrás; en los caracteres, el haz los enciende y los revuelve al pasar.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'direccion', label: 'Dirección', type: 'select', options: [['abajo', 'Hacia abajo'], ['arriba', 'Hacia arriba'], ['derecha', 'Hacia la derecha'], ['izquierda', 'Hacia la izquierda']], def: 'abajo' },
    { key: 'haz', label: 'Ancho del haz', type: 'range', min: 1, max: 20, step: 1, def: 4, unit: 'celdas' },
    P.color('color', 'Color del haz', '#b8ffcf'),
    { key: 'ruido', label: 'Revolver bajo el haz', type: 'toggle', def: true },
    ...P.holds(),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = heldP(ctx);
    if (p >= 1) return null;
    const dir = str(ctx, 'direccion', 'abajo');
    const vertical = dir === 'abajo' || dir === 'arriba';
    const beam = num(ctx, 'haz', 4);
    const color = str(ctx, 'color', '#b8ffcf');
    const noisy = bool(ctx, 'ruido', true);
    const seed = hashString(ctx.seed);
    const tick = Math.floor(ctx.pos * 18);
    if (ctx.layer.kind === 'glyphs' || ctx.layer.kind === 'ascii') {
      return perCell(ctx, g => {
        const G = geo(g);
        const len = vertical ? G.rows : G.cols;
        // the beam's leading edge in cells: from −beam (before the frame) to len (past it)
        const line = p * (len + beam) - beam;
        return (i, c, r) => {
          const k = vertical ? (dir === 'abajo' ? r : G.rows - 1 - r) : dir === 'derecha' ? c : G.cols - 1 - c;
          const d = line + beam - k;
          if (d < 0) return { visible: 0 };
          if (d >= beam) return null;
          const lit = 1 - d / beam;
          const glyph = noisy && g.chars && rand01(seed, i, tick) < lit * 0.6 ? '▓▒░#%'[Math.floor(rand01(seed, i, tick + 1) * 5)] : undefined;
          return { visible: 1, color, ...(glyph ? { glyph } : {}) };
        };
      }, { glyphs: '▓▒░#%' });
    }
    const edge = p * (1 + 0.02);
    const part: MaskPart = vertical
      ? { kind: 'rect', op: 'add', x: -0.01, y: dir === 'abajo' ? -0.01 : 1.01 - edge, w: 1.02, h: edge, rot: 0, soft: 2, alpha: 1 }
      : { kind: 'rect', op: 'add', x: dir === 'derecha' ? -0.01 : 1.01 - edge, y: -0.01, w: edge, h: 1.02, rot: 0, soft: 2, alpha: 1 };
    // a glow on the fresh edge: the beam
    const glow: Finish = { kind: 'glow', on: true, amount: 0.85 * bell(p), params: { threshold: 0.35, radius: 22, strength: 1.4, tint: color, blend: 'add' } };
    return { within: maskOf([part]), finishes: [glow] };
  },
});

/* ------------------------------------------------------------------ Espiral */

registerTemplate({
  id: 'espiral',
  name: 'Espiral',
  blurb: 'Las celdas brotan a lo largo de una espiral que sale del centro, cada una con un pequeño salto.',
  group: 'entrada',
  kinds: PICTURE_KINDS,
  dur: 2.5,
  params: [
    ...P.center(),
    { key: 'vueltas', label: 'Vueltas', type: 'range', min: 1, max: 8, step: 0.5, def: 4 },
    { key: 'sentido', label: 'Sentido', type: 'select', options: [['horario', 'Horario'], ['antihorario', 'Antihorario']], def: 'horario' },
    { key: 'salto', label: 'Salto de cada celda', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 },
    P.soft(0.06),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const turns = num(ctx, 'vueltas', 4), pop = num(ctx, 'salto', 0.6), soft = Math.max(0.02, num(ctx, 'suavidad', 0.06));
    const ccw = str(ctx, 'sentido', 'horario') === 'antihorario';
    const cx = num(ctx, 'x', 0.5), cy = num(ctx, 'y', 0.5);
    return perCell(ctx, g => {
      const o = orderField('espiral', g, seed, { turns, cx: ccw ? 1 - cx : cx, cy });
      const G = geo(g);
      return (_i, c, r) => {
        const idx = r * G.cols + (ccw ? G.cols - 1 - c : c);
        const v = sweep(o[idx], p, soft);
        if (v >= 1) return null;
        if (v <= 0) return { visible: 0 };
        return { visible: Math.min(1, v * 2), scale: pop > 0 ? easeOutBack(v, 2.2 * pop) : 1 };
      };
    }, { tileCell: 20 });
  },
});

/* ------------------------------------------------------------------ Persianas */

registerTemplate({
  id: 'persianas',
  name: 'Persianas',
  blurb: 'Lamas inclinadas se abren una tras otra (o todas a la vez) y descubren la capa.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 1.8,
  params: [
    { key: 'lamas', label: 'Lamas', type: 'range', min: 2, max: 24, step: 1, def: 8 },
    { key: 'angulo', label: 'Ángulo', type: 'range', min: 0, max: 180, step: 5, def: 0, unit: '°', help: '0°: lamas verticales que se abren hacia la derecha.' },
    { key: 'desfase', label: 'Una tras otra', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6, help: '0: todas a la vez. 1: cada una empieza cuando termina la anterior.' },
    { key: 'suavidad', label: 'Suavidad', type: 'range', min: 0, max: 40, step: 1, def: 2, unit: 'px' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const { W, H } = frameOf(ctx);
    const N = Math.max(2, Math.round(num(ctx, 'lamas', 8)));
    const a = (num(ctx, 'angulo', 0) * Math.PI) / 180;
    const lag = num(ctx, 'desfase', 0.6);
    const soft = num(ctx, 'suavidad', 2);
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const D = Math.hypot(W, H) + 4, s = D / N;
    const L = 1 / (1 + (N - 1) * lag);
    const parts: MaskPart[] = [];
    for (let j = 0; j < N; j++) {
      const f = clamp01((p - j * lag * L) / L);
      if (f <= 0) continue;
      const u0 = -D / 2 + j * s, u1 = u0 + f * s + (f >= 1 ? 1 : 0);
      const corner = (u: number, v: number) => [(W / 2 + ux * u + vx * v) / W, (H / 2 + uy * u + vy * v) / H];
      parts.push({ kind: 'polygon', op: 'add', pts: [...corner(u0, -D / 2), ...corner(u1, -D / 2), ...corner(u1, D / 2), ...corner(u0, D / 2)], soft, alpha: 1 });
    }
    // nothing open yet: an empty polygon keeps everything hidden
    return { within: maskOf(parts.length ? parts : [{ kind: 'polygon', op: 'add', pts: [0, 0, 0, 0, 0, 0], soft: 0, alpha: 1 }]) };
  },
});

/* ------------------------------------------------------------------ Partes a destiempo */

/** Whether (x, y) in frame units is inside a shape part (edges hard; strokes as a thick polyline). */
function insidePart(part: MaskPart, x: number, y: number, W: number, H: number): boolean {
  if (part.kind === 'rect' || part.kind === 'ellipse') {
    const cx = (part.x + part.w / 2) * W, cy = (part.y + part.h / 2) * H;
    const a = (-part.rot * Math.PI) / 180;
    const px = x * W - cx, py = y * H - cy;
    const lx = px * Math.cos(a) - py * Math.sin(a), ly = px * Math.sin(a) + py * Math.cos(a);
    const hw = (part.w * W) / 2, hh = (part.h * H) / 2;
    if (!(hw > 0 && hh > 0)) return false;
    return part.kind === 'rect' ? Math.abs(lx) <= hw && Math.abs(ly) <= hh : (lx / hw) ** 2 + (ly / hh) ** 2 <= 1;
  }
  if (part.kind === 'polygon') {
    const pts = part.pts;
    let inside = false;
    for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  if (part.kind === 'stroke') {
    const r = (part.size * Math.min(W, H)) / 2;
    for (let i = 0; i + 1 < part.pts.length; i += 2) if (Math.hypot((part.pts[i] - x) * W, (part.pts[i + 1] - y) * H) <= r) return true;
  }
  return false;
}

/** Region of each cell: the index of the first mask part it is in (the rest: one more region). */
function maskRegions(layer: Readonly<Layer>, g: CellGrid, W: number, H: number): { reg: Int32Array; k: number } | null {
  const parts = (layer.mask?.parts ?? []).filter(pt => pt.kind === 'rect' || pt.kind === 'ellipse' || pt.kind === 'polygon' || pt.kind === 'stroke');
  if (!parts.length) return null;
  const G = geo(g);
  const reg = new Int32Array(G.n);
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    const x = cellX(G, c) / G.w, y = cellY(G, r) / G.h;
    let k = parts.findIndex(pt => insidePart(pt, x, y, W, H));
    if (k < 0) k = parts.length;
    reg[r * G.cols + c] = k;
  }
  return { reg, k: parts.length + 1 };
}

registerTemplate({
  id: 'partes-a-destiempo',
  name: 'Partes a destiempo',
  blurb: 'La imagen se divide en partes (regiones de Voronoi, bandas, zonas de brillo, una rejilla o las partes de la máscara) y cada una aparece a su tiempo y a su manera.',
  group: 'entrada',
  kinds: PICTURE_KINDS,
  dur: 3,
  params: [
    { key: 'partes', label: 'Partes', type: 'select', options: [['voronoi', 'Regiones (Voronoi)'], ['bandas', 'Bandas'], ['brillo', 'Zonas de brillo'], ['rejilla', 'Rejilla'], ['mascara', 'Partes de la máscara']], def: 'voronoi' },
    { key: 'cuantas', label: 'Cuántas partes', type: 'range', min: 2, max: 24, step: 1, def: 7 },
    { key: 'orden', label: 'Orden de las partes', type: 'select', options: [['azar', 'Al azar'], ['izquierda', 'De izquierda a derecha'], ['arriba', 'De arriba abajo'], ['brillo', 'Las más claras primero']], def: 'azar' },
    { key: 'efecto', label: 'Cada parte', type: 'select', options: [['aparecer', 'Aparece celda por celda'], ['escribir', 'Se escribe en orden de lectura'], ['crecer', 'Brota con un salto'], ['cae', 'Cae en su lugar']], def: 'aparecer' },
    { key: 'solape', label: 'Solape', type: 'range', min: 0, max: 1, step: 0.05, def: 0.35, help: '0: una parte empieza cuando termina la anterior. 1: todas a la vez.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const { W, H } = frameOf(ctx);
    const mode = str(ctx, 'partes', 'voronoi');
    const K0 = Math.round(num(ctx, 'cuantas', 7));
    const how = str(ctx, 'efecto', 'aparecer');
    const overlap = num(ctx, 'solape', 0.35);
    const ord = str(ctx, 'orden', 'azar');
    return perCell(ctx, g => {
      const G = geo(g);
      let reg: Int32Array, K: number;
      const m = mode === 'mascara' ? maskRegions(ctx.layer, g, W, H) : null;
      if (m) { reg = m.reg; K = m.k; } else { K = K0; reg = regionField(mode === 'mascara' ? 'voronoi' : (mode as 'voronoi' | 'bandas' | 'brillo' | 'rejilla'), g, seed, K); }
      // the delay of each region: by its centroid (or its brightness) or at random, as ranks 0..1
      const sx = new Float64Array(K), sy = new Float64Array(K), sl = new Float64Array(K), cnt = new Float64Array(K);
      for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
        const i = r * G.cols + c, k = reg[i];
        sx[k] += c; sy[k] += r; sl[k] += g.lum ? g.lum[i] ?? 0.5 : 0.5; cnt[k]++;
      }
      const key = (k: number) => ord === 'izquierda' ? sx[k] / cnt[k] : ord === 'arriba' ? sy[k] / cnt[k] : ord === 'brillo' ? -sl[k] / cnt[k] : rand01(seed, k, 41);
      const present = [...Array(K).keys()].filter(k => cnt[k] > 0).sort((a, b) => key(a) - key(b));
      const delay = new Float64Array(K);
      present.forEach((k, j) => { delay[k] = present.length > 1 ? j / (present.length - 1) : 0; });
      const L = clamp(1 / (1 + (present.length - 1) * (1 - overlap)), 0.05, 1);
      const within = how === 'escribir' ? orderField('lectura', g, seed) : orderField('azar', g, seed);
      return (i, _c, r) => {
        const q = stagger(delay[reg[i]], p, L);
        if (q >= 1) return null;
        switch (how) {
          case 'crecer': { const v = clamp01(q * 1.6 - within[i] * 0.6); return v <= 0 ? { visible: 0 } : v >= 1 ? null : { visible: Math.min(1, v * 2), scale: easeOutBack(v, 2) }; }
          case 'cae': { const v = clamp01(q * 1.5 - within[i] * 0.5); return v <= 0 ? { visible: 0 } : v >= 1 ? null : { visible: 1, dy: -((1 - v) ** 2) * (r + 4) * G.ch }; }
          default: { const v = sweep(within[i], q, 0.15); return v >= 1 ? null : { visible: v }; }
        }
      };
    }, { tileCell: 20, revealOnly: how === 'aparecer' || how === 'escribir' });
  },
});

/* ------------------------------------------------------------------ Encendido de neón */

registerTemplate({
  id: 'neon',
  name: 'Encendido de neón',
  blurb: 'La capa titila al encenderse como un tubo que se calienta: destellos cada vez más largos, algunas letras más tarde, con resplandor.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 1.6,
  params: [
    { key: 'titileo', label: 'Titileo', type: 'range', min: 0.2, max: 1, step: 0.05, def: 0.7, help: 'Cuánto duda antes de quedar encendido.' },
    { key: 'fallas', label: 'Letras rebeldes', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.12, help: 'Parte de las celdas que tardan más en encenderse (capas de celdas).' },
    { key: 'brillo', label: 'Resplandor', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 },
    P.color('tinte', 'Tinte del resplandor', '#ff7a45'),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const hes = num(ctx, 'titileo', 0.7);
    const steps = 22 + Math.round(hes * 26);
    // lit when a seeded draw is under a duty that rises to 1 (fully on at 0.85 of the clip)
    const litAt = (x: number, salt: number, settle: number) => {
      if (x >= settle) return 1;
      if (x <= 0) return 0;
      const duty = (x / settle) ** (0.6 + hes * 1.4);
      return rand01(seed, Math.floor(x * steps), salt) < duty ? 1 : 0;
    };
    const on = litAt(p, 1, 0.85);
    const glowAmt = num(ctx, 'brillo', 0.6) * (on ? 1 : 0.25) * (1 - smooth(span01(p, 0.8, 1)));
    const finishes: Finish[] = glowAmt > 0.001 ? [{ kind: 'glow', on: true, amount: glowAmt, params: { threshold: 0.2, radius: 26, strength: 1.6, tint: str(ctx, 'tinte', '#ff7a45'), blend: 'screen' } }] : [];
    const rebels = num(ctx, 'fallas', 0.12);
    if ((ctx.layer.kind === 'glyphs' || ctx.layer.kind === 'ascii') && rebels > 0) {
      return {
        ...perCellVisibility(ctx, () => (i: number) => (rand01(seed, i, 51) < rebels ? litAt(p, 100 + (i % 7), 0.97) * 0.9 + 0.05 : on ? 1 : 0.06)),
        finishes,
      };
    }
    return { opacity: on ? 1 : 0.06, finishes };
  },
});

/* ------------------------------------------------------------------ Parpadeo foto ⇄ ASCII */

/** Centres of `n` flashes in 0..1 by rhythm, each moved at most `chance` of half its slot (never overlapping). */
export function flashCentres(n: number, rhythm: string, chance: number, seed: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    let c = rhythm === 'acelera' ? Math.sqrt(u) : rhythm === 'frena' ? 1 - Math.sqrt(1 - u) : u;
    const slot = rhythm === 'regular' || rhythm === 'irregular' ? 1 / n : Math.abs((rhythm === 'acelera' ? Math.sqrt((k + 1) / n) - Math.sqrt(k / n) : Math.sqrt(1 - k / n) - Math.sqrt(1 - (k + 1) / n)));
    const j = rhythm === 'irregular' ? Math.max(chance, 0.5) : chance;
    c += (rand01(seed, k, 71) - 0.5) * slot * 0.9 * j;
    out.push(clamp(c, 0.02, 0.98));
  }
  return out;
}

registerTemplate({
  id: 'parpadeo',
  name: 'Parpadeo foto ⇄ ASCII',
  blurb: 'Destellos breves y contados: la capa se apaga un instante y deja ver lo de abajo (la foto bajo el ASCII). Eliges cuántos, su ritmo y cuánto azar.',
  group: 'énfasis',
  kinds: ALL_KINDS,
  dur: 1.5,
  params: [
    { key: 'veces', label: 'Destellos', type: 'range', min: 1, max: 24, step: 1, def: 5 },
    { key: 'ritmo', label: 'Ritmo', type: 'select', options: [['regular', 'Regular'], ['irregular', 'Irregular'], ['acelera', 'Acelera'], ['frena', 'Frena']], def: 'irregular' },
    { key: 'azar', label: 'Azar (con límite)', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5, help: 'Cuánto se mueve cada destello dentro de su lugar: nunca se juntan ni se pierden.' },
    { key: 'duracion', label: 'Largo de cada destello', type: 'range', min: 0.05, max: 0.6, step: 0.05, def: 0.25 },
    { key: 'modo', label: 'Qué parpadea', type: 'select', options: [['capa', 'Toda la capa'], ['celdas', 'Celdas sueltas'], ['franjas', 'Franjas']], def: 'capa' },
    { key: 'fraccion', label: 'Parte que parpadea', type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.6, when: { modo: ['celdas', 'franjas'] } },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const seed = hashString(ctx.seed);
    const n = Math.round(num(ctx, 'veces', 5));
    const centres = flashCentres(n, str(ctx, 'ritmo', 'irregular'), num(ctx, 'azar', 0.5), seed);
    const half = (num(ctx, 'duracion', 0.25) / n) / 2;
    let k = -1;
    for (let j = 0; j < n; j++) if (Math.abs(p - centres[j]) < half) { k = j; break; }
    if (k < 0) return null;
    const mode = str(ctx, 'modo', 'capa');
    if (mode === 'capa') return { opacity: 0 };
    const frac = num(ctx, 'fraccion', 0.6);
    return perCellVisibility(ctx, g => {
      const G = geo(g);
      const bands = Math.max(3, Math.round(G.rows / 6));
      return (i, _c, r) => (mode === 'franjas' ? rand01(seed, Math.floor((r / G.rows) * bands), 900 + k) : rand01(seed, i, 900 + k)) < frac ? 0 : 1;
    }, { tileCell: 16 });
  },
});

/* ------------------------------------------------------------------ Estroboscopio */

registerTemplate({
  id: 'estrobo',
  name: 'Estroboscopio',
  blurb: 'Destellos regulares: la capa en negativo, en blanco o apagada. Tope de 3 por segundo por defecto (más rápido puede molestar a personas fotosensibles).',
  group: 'énfasis',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'modo', label: 'Destello', type: 'select', options: [['negativo', 'Negativo'], ['blanco', 'Blanco'], ['apagar', 'Apagar']], def: 'negativo' },
    { key: 'ritmo', label: 'Destellos por segundo', type: 'range', min: 0.5, max: 6, step: 0.5, def: 2.5, help: 'Más de 3 por segundo puede molestar a personas fotosensibles.' },
    { key: 'envolvente', label: 'Entrar y salir suave', type: 'toggle', def: true, help: 'Los destellos se espacian al principio y al final.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const dur = Math.max(0.05, ctx.clip.dur / Math.max(1, ctx.clip.repeat));
    const n = Math.max(1, Math.round(num(ctx, 'ritmo', 2.5) * dur));
    const x = p * n, k = Math.floor(x), f = x - k;
    const env = bool(ctx, 'envolvente', true) ? bell(p, 0.5) : 1;
    // each flash lasts a third of its period; with the envelope, flashes near the ends get shorter
    if (f < 0.35 || f > 0.35 + 0.33 * env) return null;
    const mode = str(ctx, 'modo', 'negativo');
    if (mode === 'apagar') return { opacity: 0 };
    if (mode === 'blanco') return { finishes: [{ kind: 'levels', on: true, amount: 1, params: { black: 0, white: 1, gamma: 1, outBlack: 1, outWhite: 1 } }] };
    return { finishes: [{ kind: 'invert', on: true, amount: 1, params: { mode: 'rgb' } }] };
  },
});

/* ------------------------------------------------------------------ Transición entre fotos */

registerTemplate({
  id: 'secuencia-fotos',
  name: 'Transición entre fotos',
  blurb: 'En una capa sobre una secuencia de fotos: los caracteres cubren cada cambio de foto y se retiran, así se pasa de una a otra a través del ASCII.',
  group: 'transformación',
  kinds: ['glyphs', 'ascii'],
  dur: 4,
  params: [
    { key: 'cobertura', label: 'Duración del cambio', type: 'range', min: 0.1, max: 3, step: 0.05, def: 0.45, unit: 's', help: 'Si es más larga que el tiempo de cada foto, los caracteres no llegan a retirarse.' },
    { key: 'cada', label: 'Cada (sin secuencia)', type: 'range', min: 0.2, max: 10, step: 0.1, def: 1, unit: 's', help: 'Si la capa no lee una secuencia, cada cuánto cubre.' },
    P.order('azar', ['azar', 'izquierda', 'derecha', 'arriba', 'abajo', 'centro', 'brillo', 'ruido']),
    P.soft(0.25),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const src = 'source' in ctx.layer ? ctx.project.sources.find(s => s.id === (ctx.layer as { source: string }).source) : undefined;
    const hold = src?.kind === 'sequence' && src.hold && src.hold > 0 ? src.hold : num(ctx, 'cada', 1);
    const cov = Math.min(num(ctx, 'cobertura', 0.45), hold);
    // project time as the clip plays forward (a reversed clip mirrors it)
    const t = ctx.clip.start + ctx.pos;
    const tau = ((t % hold) + hold) % hold;
    const d = Math.min(tau, hold - tau);
    const cover = 1 - smooth(d / Math.max(1e-3, cov / 2));
    if (cover <= 0) return { opacity: 0 };
    if (cover >= 1) return null;
    const seed = hashString(ctx.seed);
    const kind = str(ctx, 'orden', 'azar') as OrderKind;
    const soft = Math.max(0.02, num(ctx, 'suavidad', 0.25) * 0.5);
    return perCellVisibility(ctx, g => { const o = orderField(kind, g, seed); return i => sweep(o[i], cover, soft); });
  },
});
