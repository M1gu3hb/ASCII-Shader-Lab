/**
 * Templates of movement: cells that fly, fall, turn, shake and flow. Glyph layers move their characters;
 * ASCII layers move the engine's cells as tiles; photos, texts and shapes move square tiles of their
 * picture (clips.ts TileFx) — or the whole layer, for the layer-level moves.
 *
 *   recomponer      «Fragmentos que se unen» (entry): implosion, rain with a bounce, whirl, swarm
 *   dispersar       «Dispersión» (exit): explosion, wind drift, gravity, whirl, disintegration
 *   fragmentar      «Fragmentar y recomponer»: out and back in one clip, with a pause at the peak
 *   rompecabezas    «Rompecabezas»: turned, swapped blocks that slide and rotate into place
 *   cortina         «Cortina»: the layer tears in the middle and each half slides away
 *   apagado         «Apagado de televisor»: squashed to a bright line, then to a dot
 *   entrada-estela  «Entrada con estela»: slides in with motion blur (optional overshoot)
 *   glitch          «Glitch en franjas»: bursts of shifted bands, channel split and block glyphs
 *   temblor         «Temblor»: a seeded shake (a hit, constant, or growing), optionally per cell
 *   iman            «Imán»: cells pulled toward (or pushed from, or swirled around) a point
 *   barajar         «Barajar»: cells or rows trade places and come back
 *   lupa            «Lupa»: a lens travels over the layer enlarging the cells under it
 *   giro-celdas     «Ola de giros»: a wave of cells turning (or flipping) sweeps across
 *   onda            «Onda de celdas» (loop): a travelling wave moves the cells
 *   respirar        «Respiración» (loop): the layer (or each cell) breathes
 *   flotar          «Flotar» (loop): the layer or its cells drift and bob
 *   marquesina      «Marquesina» (loop): the grid scrolls and wraps around like a ticker
 */
import { hashString, rand01, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from '../project/clips';
import type { CellFx } from '../glyphs/index';
import type { Finish } from '../project/types';
import {
  ALL_KINDS, bell, bool, cellX, cellY, clamp, clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, frac, geo, lumAt, noise1,
  noise2, num, orderField, P, perCell, PICTURE_KINDS, smooth, span01, stagger, str, TAU, type Geo, type OrderKind,
} from './kit';

const TILE = 18;

/* ------------------------------------------------------------------ fragment paths */

type Path = (q: number) => CellFx;

/** Where a cell goes as it scatters (q 0 = home, 1 = gone), per mode. */
function scatterPath(mode: string, G: Geo, seed: number, i: number, c: number, r: number, cx: number, cy: number, dirDeg: number): Path {
  const x = cellX(G, c), y = cellY(G, r);
  const D = Math.hypot(G.w, G.h);
  const r1 = rand01(seed, i, 1), r2 = rand01(seed, i, 2), r3 = rand01(seed, i, 3);
  const spin = (r3 - 0.5) * 720;
  switch (mode) {
    case 'deriva': {
      const a = (dirDeg * Math.PI) / 180;
      const len = D * (0.55 + r1 * 0.6);
      const side = noise2(seed, x / D * 6, y / D * 6) * 0.35 * D;
      return q => { const e = easeInCubic(q); return { dx: (Math.cos(a) * len - Math.sin(a) * side) * e, dy: (Math.sin(a) * len + Math.cos(a) * side) * e, rot: spin * 0.4 * e, visible: 1 - smooth(span01(q, 0.55, 1)) }; };
    }
    case 'gravedad': {
      const fall = G.h * (1.15 + r1 * 0.5), drift = (r2 - 0.5) * 0.25 * D;
      return q => ({ dx: drift * q, dy: fall * q * q, rot: spin * q, visible: 1 - smooth(span01(q, 0.8, 1)) });
    }
    case 'remolino': {
      const a0 = Math.atan2(y - cy, x - cx), d0 = Math.hypot(x - cx, y - cy) + G.cw;
      const turn = TAU * (0.5 + r1 * 0.5);
      return q => {
        const e = easeInCubic(q);
        const a = a0 + turn * e, d = d0 * (1 + 1.6 * e) + D * 0.35 * e;
        return { dx: cx + Math.cos(a) * d - x, dy: cy + Math.sin(a) * d - y, rot: (turn * e * 180) / Math.PI, visible: 1 - smooth(span01(q, 0.6, 1)), scale: 1 - 0.4 * e };
      };
    }
    case 'desintegrar': {
      const a = (dirDeg * Math.PI) / 180 - 0.5;
      const len = D * (0.12 + r1 * 0.3);
      return q => { const e = easeOutCubic(q); return { dx: Math.cos(a) * len * e + noise2(seed, i * 0.01, q * 3) * 12 * q, dy: Math.sin(a) * len * e, visible: 1 - smooth(span01(q, 0.1, 0.85)), scale: 1 - 0.5 * e }; };
    }
    default: {
      // explosion: outward from the centre, turning, with a little angular spread
      const a = Math.atan2(y - cy, x - cx) + (r2 - 0.5) * 0.7;
      const len = D * (0.45 + r1 * 0.75);
      return q => { const e = easeInCubic(q) * 0.7 + q * 0.3; return { dx: Math.cos(a) * len * e, dy: Math.sin(a) * len * e, rot: spin * e, scale: 1 - 0.45 * e, visible: 1 - smooth(span01(q, 0.65, 1)) }; };
    }
  }
}

const SCATTER_MODES: Array<[string, string]> = [['explosion', 'Explosión'], ['deriva', 'Viento'], ['gravedad', 'Gravedad'], ['remolino', 'Remolino'], ['desintegrar', 'Desintegrar']];

function scatterEffect(ctx: ClipContext, amountAt: (i: number, o: number) => number, mode: string): ClipEffect {
  const seed = hashString(ctx.seed);
  const dir = num(ctx, 'direccion', 0);
  const cxF = num(ctx, 'x', 0.5), cyF = num(ctx, 'y', 0.5);
  const kind = str(ctx, 'orden', 'azar') as OrderKind;
  return perCell(ctx, g => {
    const G = geo(g);
    const o = orderField(kind, g, seed);
    const cx = cxF * G.w, cy = cyF * G.h;
    return (i, c, r) => {
      const q = amountAt(i, o[i]);
      if (q <= 0) return null;
      if (q >= 1 && mode !== 'desintegrar') return { visible: 0 };
      return scatterPath(mode, G, seed, i, c, r, cx, cy, dir)(Math.min(1, q));
    };
  }, { tileCell: TILE, zone: str(ctx, 'zona', 'todo') });
}

registerTemplate({
  id: 'dispersar',
  name: 'Dispersión',
  blurb: 'Las celdas se sueltan y se van: explotan desde un punto, se las lleva el viento, caen, giran en remolino o se desintegran.',
  group: 'salida',
  kinds: PICTURE_KINDS,
  dur: 2.5,
  params: [
    { key: 'modo', label: 'Cómo se van', type: 'select', options: SCATTER_MODES, def: 'explosion' },
    P.order('azar', ['azar', 'centro', 'bordes', 'izquierda', 'derecha', 'arriba', 'abajo', 'brillo', 'sombras', 'ruido']),
    { key: 'duracion', label: 'Vuelo de cada celda', type: 'range', min: 0.15, max: 1, step: 0.05, def: 0.55, help: 'Parte del clip que vuela cada celda (el resto, esperan su turno).' },
    { key: 'direccion', label: 'Dirección del viento', type: 'range', min: 0, max: 360, step: 5, def: 340, unit: '°', when: { modo: ['deriva', 'desintegrar'] } },
    ...P.center().map(d => ({ ...d, when: { modo: ['explosion', 'remolino'] } })),
    P.zone(),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0) return null;
    const len = num(ctx, 'duracion', 0.55);
    const mode = str(ctx, 'modo', 'explosion');
    return scatterEffect(ctx, (_i, o) => stagger(o, p, len), mode);
  },
});

registerTemplate({
  id: 'fragmentar',
  name: 'Fragmentar y recomponer',
  blurb: 'La imagen se rompe en celdas que se alejan y, después de una pausa, vuelven a su lugar: en un solo clip.',
  group: 'transformación',
  kinds: PICTURE_KINDS,
  dur: 3,
  params: [
    { key: 'modo', label: 'Cómo se separan', type: 'select', options: SCATTER_MODES.filter(([k]) => k !== 'desintegrar'), def: 'explosion' },
    { key: 'intensidad', label: 'Distancia', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.35 },
    { key: 'pausa', label: 'Pausa en el punto más lejos', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.25 },
    { key: 'desfase', label: 'Desfase entre celdas', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.3 },
    P.order('azar', ['azar', 'centro', 'bordes', 'izquierda', 'arriba', 'brillo', 'ruido']),
    { key: 'direccion', label: 'Dirección del viento', type: 'range', min: 0, max: 360, step: 5, def: 0, unit: '°', when: { modo: ['deriva'] } },
    ...P.center().map(d => ({ ...d, when: { modo: ['explosion', 'remolino'] } })),
    P.zone(),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const amt = num(ctx, 'intensidad', 0.35), hold = num(ctx, 'pausa', 0.25), lag = num(ctx, 'desfase', 0.3);
    const mode = str(ctx, 'modo', 'explosion');
    // each cell runs its own bell (0 → out → 0), delayed by its order
    return scatterEffect(ctx, (_i, o) => {
      const local = clamp01((p - o * lag) / (1 - lag));
      return bell(local, hold) * amt;
    }, mode);
  },
});

registerTemplate({
  id: 'recomponer',
  name: 'Fragmentos que se unen',
  blurb: 'Celdas sueltas llegan de todas partes y encajan en la imagen: implosión, lluvia con rebote, remolino o enjambre.',
  group: 'entrada',
  kinds: PICTURE_KINDS,
  dur: 2.5,
  params: [
    { key: 'modo', label: 'De dónde llegan', type: 'select', options: [['implosion', 'Desde fuera del cuadro'], ['lluvia', 'Caen desde arriba'], ['remolino', 'En remolino'], ['enjambre', 'Enjambre']], def: 'implosion' },
    P.order('azar', ['azar', 'centro', 'bordes', 'abajo', 'arriba', 'izquierda', 'brillo', 'ruido']),
    { key: 'duracion', label: 'Vuelo de cada celda', type: 'range', min: 0.15, max: 1, step: 0.05, def: 0.5 },
    { key: 'rebote', label: 'Rebote al llegar', type: 'range', min: 0, max: 1, step: 0.05, def: 0.4 },
    ...P.center(),
    P.zone(),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const len = num(ctx, 'duracion', 0.5), bounce = num(ctx, 'rebote', 0.4);
    const mode = str(ctx, 'modo', 'implosion');
    const kind = str(ctx, 'orden', 'azar') as OrderKind;
    const cxF = num(ctx, 'x', 0.5), cyF = num(ctx, 'y', 0.5);
    return perCell(ctx, g => {
      const G = geo(g);
      const o = orderField(kind, g, seed);
      const D = Math.hypot(G.w, G.h);
      const cx = cxF * G.w, cy = cyF * G.h;
      return (i, c, r) => {
        const q = stagger(o[i], p, len);
        if (q >= 1) return null;
        if (q <= 0) return { visible: 0 };
        const x = cellX(G, c), y = cellY(G, r);
        const r1 = rand01(seed, i, 1), r2 = rand01(seed, i, 2);
        const arrive = bounce > 0 ? 1 - easeOutBack(q, 1 + bounce * 2.2) : 1 - easeOutCubic(q);
        const vis = Math.min(1, q * 4);
        switch (mode) {
          case 'lluvia': {
            // falls from above the frame, lands with a bounce
            const drop = y + G.h * (0.3 + r1 * 0.5);
            return { visible: vis, dy: -drop * arrive, rot: (r2 - 0.5) * 90 * arrive };
          }
          case 'remolino': {
            const a0 = Math.atan2(y - cy, x - cx), d0 = Math.hypot(x - cx, y - cy);
            const a = a0 - TAU * 0.75 * arrive, d = d0 + D * 0.5 * arrive;
            return { visible: vis, dx: cx + Math.cos(a) * d - x, dy: cy + Math.sin(a) * d - y, rot: -270 * arrive, scale: 1 - 0.3 * arrive };
          }
          case 'enjambre': {
            const sx = rand01(seed, i, 3) * G.w, sy = rand01(seed, i, 4) * G.h;
            const wob = Math.sin(q * TAU * 1.5 + r1 * TAU) * G.cw * 3 * (1 - q);
            return { visible: vis, dx: (sx - x) * arrive + wob, dy: (sy - y) * arrive - wob * 0.5, scale: 0.6 + 0.4 * q };
          }
          default: {
            const a = Math.atan2(y - cy, x - cx) + (r2 - 0.5) * 0.4;
            const d = D * (0.55 + r1 * 0.4);
            return { visible: vis, dx: Math.cos(a) * d * arrive, dy: Math.sin(a) * d * arrive, rot: (r2 - 0.5) * 360 * arrive };
          }
        }
      };
    }, { tileCell: TILE, zone: str(ctx, 'zona', 'todo') });
  },
});

/* ------------------------------------------------------------------ Rompecabezas */

registerTemplate({
  id: 'rompecabezas',
  name: 'Rompecabezas',
  blurb: 'La imagen empieza en bloques girados y cambiados de lugar; uno a uno se deslizan y giran hasta encajar.',
  group: 'entrada',
  kinds: PICTURE_KINDS,
  dur: 3,
  params: [
    { key: 'bloque', label: 'Tamaño del bloque', type: 'range', min: 2, max: 20, step: 1, def: 6, unit: 'celdas' },
    { key: 'orden', label: 'Orden', type: 'select', options: [['azar', 'Al azar'], ['lectura', 'En orden de lectura'], ['centro', 'Desde el centro']], def: 'azar' },
    { key: 'solape', label: 'Solape', type: 'range', min: 0, max: 1, step: 0.05, def: 0.7, help: '0: un bloque a la vez. 1: todos a la vez.' },
    { key: 'giro', label: 'Giros', type: 'toggle', def: true },
    { key: 'cambio', label: 'Cambiar de lugar', type: 'toggle', def: true },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const B = Math.round(num(ctx, 'bloque', 6));
    const overlap = num(ctx, 'solape', 0.7);
    const turn = bool(ctx, 'giro', true), swap = bool(ctx, 'cambio', true);
    const ord = str(ctx, 'orden', 'azar');
    return perCell(ctx, g => {
      const G = geo(g);
      const bw = B, bh = Math.max(1, Math.round((B * G.cw) / G.ch));
      const bc = Math.ceil(G.cols / bw), br = Math.ceil(G.rows / bh), nb = bc * br;
      // a permutation of the blocks (seeded shuffle) and each block's turn
      const perm = [...Array(nb).keys()];
      for (let k = nb - 1; k > 0; k--) { const j = Math.floor(rand01(seed, k, 31) * (k + 1)); [perm[k], perm[j]] = [perm[j], perm[k]]; }
      const orderOf = (b: number) => {
        if (ord === 'lectura') return nb > 1 ? b / (nb - 1) : 0;
        if (ord === 'centro') { const x = (b % bc + 0.5) / bc - 0.5, y = (Math.floor(b / bc) + 0.5) / br - 0.5; return Math.min(1, Math.hypot(x, y) / 0.71); }
        return rand01(seed, b, 32);
      };
      const L = clamp(1 / (1 + (nb - 1) * (1 - overlap)), 0.04, 1);
      return (_i, c, r) => {
        const bx = Math.floor(c / bw), by = Math.floor(r / bh), b = by * bc + bx;
        const q = stagger(orderOf(b), p, L);
        if (q >= 1) return null;
        const e = easeInOutCubic(q);
        const k = 1 - e;
        const angle = turn ? (1 + Math.floor(rand01(seed, b, 33) * 3)) * 90 : 0;
        const tgt = swap ? perm[b] : b;
        const offX = ((tgt % bc) - bx) * bw * G.cw, offY = (Math.floor(tgt / bc) - by) * bh * G.ch;
        // the cell turns with its block around the block's centre
        const ccx = (bx + 0.5) * bw * G.cw, ccy = (by + 0.5) * bh * G.ch;
        const rx = cellX(G, c) - ccx, ry = cellY(G, r) - ccy;
        const a = (angle * k * Math.PI) / 180;
        const nx = rx * Math.cos(a) - ry * Math.sin(a), ny = rx * Math.sin(a) + ry * Math.cos(a);
        return { dx: nx - rx + offX * k, dy: ny - ry + offY * k, rot: angle * k, visible: q <= 0 ? 0.85 : 1 };
      };
    }, { tileCell: 16 });
  },
});

/* ------------------------------------------------------------------ Cortina */

registerTemplate({
  id: 'cortina',
  name: 'Cortina',
  blurb: 'La capa se rasga por el medio y cada mitad se desliza hacia su lado, con un borde desgarrado.',
  group: 'salida',
  kinds: ALL_KINDS,
  dur: 1.6,
  params: [
    { key: 'direccion', label: 'Se abre', type: 'select', options: [['horizontal', 'Hacia los lados'], ['vertical', 'Hacia arriba y abajo']], def: 'horizontal' },
    { key: 'desgarro', label: 'Desgarro', type: 'range', min: 0, max: 1, step: 0.05, def: 0.45, help: 'Cuánto se adelantan unas filas a otras.' },
    { key: 'corte', label: 'Dónde se corta', type: 'range', min: 0.1, max: 0.9, step: 0.01, def: 0.5 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0) return null;
    const seed = hashString(ctx.seed);
    const vertical = str(ctx, 'direccion', 'horizontal') === 'vertical';
    const tear = num(ctx, 'desgarro', 0.45), cut = num(ctx, 'corte', 0.5);
    return perCell(ctx, g => {
      const G = geo(g);
      return (_i, c, r) => {
        const line = vertical ? c : r;
        const lag = (noise1(seed, line * 0.18) * 0.5 + 0.5) * tear;
        const q = clamp01((p - lag * 0.5) / (1 - tear * 0.5));
        if (q <= 0) return null;
        const e = easeInCubic(q);
        const pos = vertical ? cellY(G, r) / G.h : cellX(G, c) / G.w;
        const first = pos < cut;
        const dist = (vertical ? G.h : G.w) * (first ? cut : 1 - cut) + (vertical ? G.ch : G.cw) * 2;
        const d = (first ? -1 : 1) * dist * e;
        return vertical ? { dy: d } : { dx: d };
      };
    }, { tileCell: 12 });
  },
});

/* ------------------------------------------------------------------ Apagado de televisor */

registerTemplate({
  id: 'apagado',
  name: 'Apagado de televisor',
  blurb: 'Como un televisor de tubo al apagarse: la imagen se aplasta en una línea brillante, la línea se encoge en un punto y el punto se apaga.',
  group: 'salida',
  kinds: ALL_KINDS,
  dur: 1.2,
  params: [
    P.color('color', 'Color de la línea', '#f4fff8'),
    { key: 'brillo', label: 'Resplandor', type: 'range', min: 0, max: 1, step: 0.05, def: 0.7 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0) return null;
    const e1 = easeInCubic(span01(p, 0, 0.5)), e2 = easeInOutCubic(span01(p, 0.45, 0.85)), e3 = span01(p, 0.8, 1);
    const color = str(ctx, 'color', '#f4fff8');
    const glyphs = ctx.layer.kind === 'glyphs';
    const eff = perCell(ctx, g => {
      const G = geo(g);
      return (_i, c, r) => {
        const x = cellX(G, c), y = cellY(G, r);
        const f: CellFx & { sy?: number } = {
          dy: (G.h / 2 - y) * e1, dx: (G.w / 2 - x) * e2 * 0.985,
          visible: (1 - e3) * (1 - 0.3 * e2), scale: 1 - 0.7 * e2,
        };
        if (glyphs && e1 > 0.55) f.color = color;
        return f;
      };
    }, { tileCell: 8 });
    if (eff.tiles && !glyphs) {
      // tiles also squash vertically into the line
      const base = eff.tiles;
      eff.tiles = g => { const f = base(g); return (c, r) => { const t = f(c, r); return t ? { ...t, sy: 1 - 0.985 * e1 } : t; }; };
    }
    const glow = num(ctx, 'brillo', 0.7) * e1 * (1 - e3);
    if (glow > 0.001) eff.finishes = [{ kind: 'glow', on: true, amount: Math.min(1, glow), params: { threshold: 0.2, radius: 18, strength: 2, tint: color, blend: 'add' } }];
    return eff;
  },
});

/* ------------------------------------------------------------------ Entrada con estela */

registerTemplate({
  id: 'entrada-estela',
  name: 'Entrada con estela',
  blurb: 'La capa entra deslizándose desde un lado con desenfoque de movimiento, y puede pasarse un poco antes de quedarse.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 1.2,
  params: [
    { key: 'desde', label: 'Entra desde', type: 'select', options: [['izquierda', 'La izquierda'], ['derecha', 'La derecha'], ['arriba', 'Arriba'], ['abajo', 'Abajo']], def: 'izquierda' },
    { key: 'distancia', label: 'Distancia', type: 'range', min: 0.1, max: 1.5, step: 0.05, def: 1, help: 'En anchos (o altos) del cuadro.' },
    { key: 'rebote', label: 'Se pasa y vuelve', type: 'range', min: 0, max: 1, step: 0.05, def: 0.3 },
    { key: 'estela', label: 'Estela', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const from = str(ctx, 'desde', 'izquierda');
    const dist = num(ctx, 'distancia', 1), over = num(ctx, 'rebote', 0.3), trail = num(ctx, 'estela', 0.6);
    const k = over > 0 ? easeOutBack(p, over * 2.2) : easeOutCubic(p);
    const off = (1 - k) * dist;
    const horiz = from === 'izquierda' || from === 'derecha';
    const sign = from === 'izquierda' || from === 'arriba' ? -1 : 1;
    const xf = ctx.layer.xf;
    const set: Record<string, number> = horiz ? { 'xf.x': xf.x + sign * off } : { 'xf.y': xf.y + sign * off };
    // speed of the move now (numerical derivative of the curve) sets the length of the blur
    const d = 0.01;
    const k2 = over > 0 ? easeOutBack(Math.min(1, p + d), over * 2.2) : easeOutCubic(Math.min(1, p + d));
    const speed = Math.abs(k2 - k) / d * dist;
    const W = horiz ? ctx.project.canvas.w : ctx.project.canvas.h;
    const blur = Math.min(400, speed * W * 0.06 * trail);
    const eff: ClipEffect = { set };
    if (blur > 1) {
      const f: Finish = { kind: 'motionblur', on: true, amount: 1, params: { mode: 'linear', angle: horiz ? (sign < 0 ? 0 : 180) : sign < 0 ? 90 : 270, distance: Math.round(blur), trail: true } };
      eff.finishes = [f];
    }
    return eff;
  },
});

/* ------------------------------------------------------------------ Glitch */

registerTemplate({
  id: 'glitch',
  name: 'Glitch en franjas',
  blurb: 'Ráfagas breves: franjas de la imagen se desplazan, los canales de color se separan y algunos caracteres se vuelven bloques.',
  group: 'énfasis',
  kinds: PICTURE_KINDS.concat(['text']),
  dur: 1.5,
  params: [
    { key: 'rafagas', label: 'Ráfagas', type: 'range', min: 1, max: 10, step: 1, def: 3 },
    { key: 'intensidad', label: 'Intensidad', type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.55 },
    { key: 'franjas', label: 'Franjas', type: 'range', min: 3, max: 40, step: 1, def: 14 },
    { key: 'color', label: 'Separar colores', type: 'toggle', def: true },
    { key: 'bloques', label: 'Caracteres en bloques', type: 'toggle', def: true },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const seed = hashString(ctx.seed);
    const n = Math.round(num(ctx, 'rafagas', 3));
    const amt = num(ctx, 'intensidad', 0.55);
    // burst k sits in its own slot of the clip; inside it the bands jump several times
    const slot = Math.min(n - 1, Math.floor(p * n));
    const centre = (slot + 0.25 + rand01(seed, slot, 1) * 0.5) / n, half = (0.08 + rand01(seed, slot, 2) * 0.08) / n;
    if (Math.abs(p - centre) > half) return null;
    const sub = Math.floor(((p - centre + half) / (2 * half)) * 5);
    const bands = Math.round(num(ctx, 'franjas', 14));
    const blocks = bool(ctx, 'bloques', true) && ctx.layer.kind === 'glyphs';
    const eff = perCell(ctx, g => {
      const G = geo(g);
      return (i, _c, r) => {
        const band = Math.floor((r / G.rows) * bands);
        const roll = rand01(seed, band, 100 + slot * 8 + sub);
        if (roll > 0.45) return null;
        const dx = (rand01(seed, band, 200 + slot * 8 + sub) - 0.5) * G.w * 0.22 * amt;
        const f: CellFx = { dx: Math.round(dx / G.cw) * G.cw };
        if (blocks && rand01(seed, i, 300 + sub) < 0.3 * amt) f.glyph = '▓█▒░▀▄'[Math.floor(rand01(seed, i, 301 + sub) * 6)];
        if (blocks && roll < 0.12) f.color = roll < 0.06 ? '#ff2bd6' : '#2bd9ff';
        return f;
      };
    }, { tileCell: 10, glyphs: '▓█▒░▀▄' });
    if (bool(ctx, 'color', true)) eff.finishes = [{ kind: 'chroma', on: true, amount: 1, params: { amount: 4 + 14 * amt, angle: 0, mode: 'lineal', jitter: 0.4 * amt } }];
    return eff;
  },
});

/* ------------------------------------------------------------------ Temblor */

registerTemplate({
  id: 'temblor',
  name: 'Temblor',
  blurb: 'La capa tiembla: un golpe que se apaga, un temblor constante o uno que crece; también cada celda por su cuenta.',
  group: 'énfasis',
  kinds: ALL_KINDS,
  dur: 1,
  params: [
    { key: 'amplitud', label: 'Amplitud', type: 'range', min: 1, max: 80, step: 1, def: 14, unit: 'px' },
    { key: 'frecuencia', label: 'Sacudidas por segundo', type: 'range', min: 2, max: 40, step: 1, def: 16 },
    { key: 'forma', label: 'Forma', type: 'select', options: [['golpe', 'Golpe que se apaga'], ['constante', 'Constante'], ['crece', 'Crece']], def: 'golpe' },
    { key: 'giro', label: 'Giro', type: 'range', min: 0, max: 10, step: 0.5, def: 1.5, unit: '°' },
    { key: 'celdas', label: 'También cada celda', type: 'toggle', def: false },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const seed = hashString(ctx.seed);
    const shape = str(ctx, 'forma', 'golpe');
    const env = shape === 'golpe' ? smooth(span01(p, 0, 0.06)) * (1 - p) ** 2 : shape === 'crece' ? smooth(p) * (1 - smooth(span01(p, 0.9, 1))) : bell(p, 0.85);
    const amp = num(ctx, 'amplitud', 14) * env;
    const dur = Math.max(0.05, ctx.clip.dur / Math.max(1, ctx.clip.repeat));
    const x = p * num(ctx, 'frecuencia', 16) * dur;
    const { w, h } = ctx.project.canvas;
    const xf = ctx.layer.xf;
    const eff: ClipEffect = {
      set: { 'xf.x': xf.x + (noise1(seed, x) * amp) / w, 'xf.y': xf.y + (noise1(seed + 17, x) * amp) / h, 'xf.rot': xf.rot + noise1(seed + 29, x * 0.7) * num(ctx, 'giro', 1.5) * env },
    };
    if (bool(ctx, 'celdas') && ctx.layer.kind !== 'text' && ctx.layer.kind !== 'shape') {
      Object.assign(eff, perCell(ctx, () => i => ({ dx: noise1(seed + i, x * 1.3) * amp * 0.5, dy: noise1(seed + i * 3, x * 1.3) * amp * 0.5 }), { tileCell: 20 }));
    }
    return eff;
  },
});

/* ------------------------------------------------------------------ Imán */

registerTemplate({
  id: 'iman',
  name: 'Imán',
  blurb: 'Un punto atrae las celdas cercanas (o las empuja, o las hace girar a su alrededor) y luego las suelta.',
  group: 'énfasis',
  kinds: PICTURE_KINDS,
  dur: 2,
  params: [
    ...P.center(),
    { key: 'modo', label: 'Fuerza', type: 'select', options: [['atraer', 'Atrae'], ['repeler', 'Empuja'], ['girar', 'Remolino']], def: 'atraer' },
    { key: 'radio', label: 'Alcance', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3, help: 'En fracción de la diagonal del cuadro.' },
    { key: 'fuerza', label: 'Intensidad', type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.7 },
    { key: 'pausa', label: 'Pausa en el máximo', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.3 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const env = bell(p, num(ctx, 'pausa', 0.3));
    const mode = str(ctx, 'modo', 'atraer');
    const force = num(ctx, 'fuerza', 0.7) * env;
    const px = num(ctx, 'x', 0.5), py = num(ctx, 'y', 0.5), rad = num(ctx, 'radio', 0.3);
    return perCell(ctx, g => {
      const G = geo(g);
      const X = px * G.w, Y = py * G.h, R = rad * Math.hypot(G.w, G.h);
      return (_i, c, r) => {
        const x = cellX(G, c), y = cellY(G, r);
        const vx = X - x, vy = Y - y, d = Math.hypot(vx, vy);
        const fall = Math.exp(-((d / R) ** 2));
        const k = fall * force;
        if (k < 0.002) return null;
        if (mode === 'repeler') { const s = d > 1e-3 ? (R * 0.6 * k) / d : 0; return { dx: -vx * s, dy: -vy * s, scale: 1 + 0.25 * k }; }
        if (mode === 'girar') {
          const a = k * Math.PI * 1.2;
          return { dx: X - (vx * Math.cos(a) - vy * Math.sin(a)) - x, dy: Y - (vx * Math.sin(a) + vy * Math.cos(a)) - y, rot: (a * 180) / Math.PI };
        }
        return { dx: vx * k * 0.85, dy: vy * k * 0.85, scale: 1 - 0.55 * k };
      };
    }, { tileCell: 14 });
  },
});

/* ------------------------------------------------------------------ Barajar */

registerTemplate({
  id: 'barajar',
  name: 'Barajar',
  blurb: 'Las celdas (o las filas) cambian de lugar con otras cercanas, la imagen se desordena y vuelve a ordenarse.',
  group: 'énfasis',
  kinds: PICTURE_KINDS,
  dur: 2,
  params: [
    { key: 'modo', label: 'Qué se baraja', type: 'select', options: [['celdas', 'Celdas'], ['filas', 'Filas'], ['columnas', 'Columnas']], def: 'celdas' },
    { key: 'alcance', label: 'Alcance', type: 'range', min: 1, max: 40, step: 1, def: 6, unit: 'celdas' },
    { key: 'pausa', label: 'Pausa desordenada', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.3 },
    { key: 'desfase', label: 'Desfase', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.25 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const seed = hashString(ctx.seed);
    const reach = num(ctx, 'alcance', 6), hold = num(ctx, 'pausa', 0.3), lag = num(ctx, 'desfase', 0.25);
    const mode = str(ctx, 'modo', 'celdas');
    return perCell(ctx, g => {
      const G = geo(g);
      return (i, c, r) => {
        const unit = mode === 'filas' ? r : mode === 'columnas' ? c : i;
        const e = easeInOutCubic(bell(clamp01((p - rand01(seed, unit, 9) * lag) / (1 - lag)), hold));
        if (e <= 0) return null;
        const jx = mode === 'columnas' ? 0 : Math.round((rand01(seed, unit, 7) * 2 - 1) * reach);
        const jy = mode === 'filas' ? 0 : Math.round((rand01(seed, unit, 8) * 2 - 1) * reach * (mode === 'celdas' ? 0.5 : 1));
        const tc = clamp(c + jx, 0, G.cols - 1), tr = clamp(r + jy, 0, G.rows - 1);
        return { dx: (tc - c) * G.cw * e, dy: (tr - r) * G.ch * e };
      };
    }, { tileCell: 16 });
  },
});

/* ------------------------------------------------------------------ Lupa */

registerTemplate({
  id: 'lupa',
  name: 'Lupa',
  blurb: 'Una lente recorre la capa y agranda las celdas que tiene debajo, empujando a las vecinas.',
  group: 'énfasis',
  kinds: PICTURE_KINDS,
  dur: 3,
  params: [
    { key: 'recorrido', label: 'Recorrido', type: 'select', options: [['horizontal', 'De izquierda a derecha'], ['vertical', 'De arriba abajo'], ['circulo', 'En círculo'], ['ocho', 'En ocho']], def: 'horizontal' },
    { key: 'radio', label: 'Tamaño de la lente', type: 'range', min: 0.05, max: 0.5, step: 0.01, def: 0.18, help: 'En fracción del lado menor del cuadro.' },
    { key: 'aumento', label: 'Aumento', type: 'range', min: 1.2, max: 4, step: 0.1, def: 2.2 },
    { key: 'altura', label: 'Altura del paso', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, when: { recorrido: ['horizontal'] } },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const path = str(ctx, 'recorrido', 'horizontal');
    const zoom = num(ctx, 'aumento', 2.2), rad = num(ctx, 'radio', 0.18);
    return perCell(ctx, g => {
      const G = geo(g);
      const R = rad * Math.min(G.w, G.h);
      let X: number, Y: number, env = 1;
      if (path === 'horizontal' || path === 'vertical') {
        const k = -R + p * ((path === 'horizontal' ? G.w : G.h) + 2 * R);
        X = path === 'horizontal' ? k : G.w / 2; Y = path === 'horizontal' ? num(ctx, 'altura', 0.5) * G.h : k;
      } else {
        const a = p * TAU;
        X = G.w / 2 + Math.sin(a) * G.w * 0.3; Y = G.h / 2 + (path === 'ocho' ? Math.sin(2 * a) * 0.25 : -Math.cos(a) * 0.3) * G.h;
        env = bell(p, 0.7);
      }
      return (_i, c, r) => {
        const x = cellX(G, c), y = cellY(G, r);
        const d = Math.hypot(x - X, y - Y);
        if (d >= R) return null;
        const k = (1 - (d / R) ** 2) * env;
        const m = 1 + (zoom - 1) * k;
        // pushed out from the lens centre as if magnified
        return { dx: (x - X) * (m - 1) * 0.5, dy: (y - Y) * (m - 1) * 0.5, scale: m };
      };
    }, { tileCell: 14 });
  },
});

/* ------------------------------------------------------------------ Ola de giros */

registerTemplate({
  id: 'giro-celdas',
  name: 'Ola de giros',
  blurb: 'Una ola atraviesa la capa y cada celda da una vuelta (o se voltea) al pasar, como fichas de dominó.',
  group: 'énfasis',
  kinds: PICTURE_KINDS,
  dur: 2,
  params: [
    { key: 'eje', label: 'Movimiento', type: 'select', options: [['giro', 'Giro'], ['volteo', 'Volteo']], def: 'giro' },
    { key: 'vueltas', label: 'Vueltas', type: 'range', min: 1, max: 4, step: 1, def: 1 },
    P.order('diagonal', ['diagonal', 'izquierda', 'arriba', 'centro', 'bordes', 'espiral', 'azar', 'brillo']),
    { key: 'ancho', label: 'Ancho de la ola', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const seed = hashString(ctx.seed);
    const turns = Math.round(num(ctx, 'vueltas', 1)), width = num(ctx, 'ancho', 0.3);
    const flip = str(ctx, 'eje', 'giro') === 'volteo';
    const kind = str(ctx, 'orden', 'diagonal') as OrderKind;
    return perCell(ctx, g => {
      const o = orderField(kind, g, seed);
      return i => {
        const q = stagger(o[i], p, width);
        if (q <= 0 || q >= 1) return null;
        const e = easeInOutCubic(q);
        if (flip) return { scale: Math.max(0.05, Math.abs(Math.cos(e * Math.PI * turns))) };
        return { rot: 360 * turns * e, scale: 1 - 0.25 * Math.sin(Math.PI * q) };
      };
    }, { tileCell: 16 });
  },
});

/* ------------------------------------------------------------------ Onda de celdas */

registerTemplate({
  id: 'onda',
  name: 'Onda de celdas',
  blurb: 'Una onda recorre la capa y mueve las celdas: en círculos desde un punto o en frentes rectos. Un número entero de ciclos cierra el bucle.',
  group: 'bucle',
  kinds: PICTURE_KINDS,
  dur: 3,
  params: [
    { key: 'forma', label: 'Forma', type: 'select', options: [['radial', 'Círculos desde un punto'], ['horizontal', 'Frentes horizontales'], ['vertical', 'Frentes verticales'], ['diagonal', 'En diagonal']], def: 'radial' },
    { key: 'mueve', label: 'Qué mueve', type: 'select', options: [['altura', 'Sube y baja'], ['lado', 'De lado'], ['tamano', 'Tamaño']], def: 'altura' },
    { key: 'amplitud', label: 'Amplitud', type: 'range', min: 1, max: 80, step: 1, def: 12, unit: 'px' },
    { key: 'longitud', label: 'Largo de onda', type: 'range', min: 2, max: 80, step: 1, def: 18, unit: 'celdas' },
    P.cycles(2, 12),
    { key: 'extremos', label: 'Entrar y salir suave', type: 'toggle', def: true },
    ...P.center().map(d => ({ ...d, when: { forma: ['radial'] } })),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const env = bool(ctx, 'extremos', true) ? smooth(span01(p, 0, 0.15)) * smooth(span01(1 - p, 0, 0.15)) : 1;
    if (env <= 0) return null;
    const shape = str(ctx, 'forma', 'radial'), moves = str(ctx, 'mueve', 'altura');
    const A = num(ctx, 'amplitud', 12) * env, lambda = num(ctx, 'longitud', 18), cycles = Math.round(num(ctx, 'ciclos', 2));
    const cx = num(ctx, 'x', 0.5), cy = num(ctx, 'y', 0.5);
    return perCell(ctx, g => {
      const G = geo(g);
      return (_i, c, r) => {
        const x = cellX(G, c) / G.cw, y = cellY(G, r) / G.cw;
        const d = shape === 'radial' ? Math.hypot(x - cx * G.w / G.cw, y - cy * G.h / G.cw) : shape === 'horizontal' ? y : shape === 'vertical' ? x : (x + y) * Math.SQRT1_2;
        const s = Math.sin(TAU * (d / lambda - cycles * p));
        if (moves === 'tamano') return { scale: 1 + (A / 40) * s };
        return moves === 'lado' ? { dx: A * s } : { dy: A * s };
      };
    }, { tileCell: 12 });
  },
});

/* ------------------------------------------------------------------ Respiración */

registerTemplate({
  id: 'respirar',
  name: 'Respiración',
  blurb: 'La capa se expande y se recoge despacio, como si respirara; o cada celda respira según su brillo, en ondas desde el centro.',
  group: 'bucle',
  kinds: ALL_KINDS,
  dur: 4,
  params: [
    { key: 'modo', label: 'Qué respira', type: 'select', options: [['capa', 'Toda la capa'], ['celdas', 'Cada celda']], def: 'capa' },
    { key: 'amplitud', label: 'Amplitud', type: 'range', min: 0.01, max: 0.5, step: 0.01, def: 0.06 },
    P.cycles(2, 12, 'Respiraciones'),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const n = Math.round(num(ctx, 'ciclos', 2));
    const A = num(ctx, 'amplitud', 0.06);
    const b = Math.sin(Math.PI * n * p) ** 2;
    if (str(ctx, 'modo', 'capa') === 'celdas' && ctx.layer.kind !== 'text' && ctx.layer.kind !== 'shape') {
      return perCell(ctx, g => {
        const G = geo(g);
        return (i, c, r) => {
          const d = Math.hypot(cellX(G, c) / G.w - 0.5, cellY(G, r) / G.h - 0.5);
          const s = Math.sin(Math.PI * (n * p - d * 1.5)) ** 2 * Math.sin(Math.PI * p) ** 0.3;
          return { scale: 1 + A * 4 * s * (0.3 + lumAt(g, i)) };
        };
      }, { tileCell: 16 });
    }
    if (b < 1e-6) return null;
    return { set: { 'xf.scale': ctx.layer.xf.scale * (1 + A * b) } };
  },
});

/* ------------------------------------------------------------------ Flotar */

registerTemplate({
  id: 'flotar',
  name: 'Flotar',
  blurb: 'Deriva suave, como en el agua: toda la capa en un ocho lento, o cada celda con su propio vaivén.',
  group: 'bucle',
  kinds: ALL_KINDS,
  dur: 4,
  params: [
    { key: 'modo', label: 'Qué flota', type: 'select', options: [['capa', 'Toda la capa'], ['celdas', 'Cada celda']], def: 'capa' },
    { key: 'amplitud', label: 'Amplitud', type: 'range', min: 1, max: 80, step: 1, def: 16, unit: 'px' },
    { key: 'giro', label: 'Balanceo', type: 'range', min: 0, max: 10, step: 0.5, def: 1.5, unit: '°' },
    P.cycles(1, 8),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const n = Math.round(num(ctx, 'ciclos', 1));
    const A = num(ctx, 'amplitud', 16);
    const a = TAU * n * p;
    if (str(ctx, 'modo', 'capa') === 'celdas' && ctx.layer.kind !== 'text' && ctx.layer.kind !== 'shape') {
      const seed = hashString(ctx.seed);
      return perCell(ctx, g => {
        const G = geo(g);
        return (_i, c, r) => {
          const ph = (noise2(seed, c / G.cols * 3, r / G.rows * 3) * 0.5 + 0.5) * TAU;
          return { dx: A * 0.4 * (Math.sin(a + ph) - Math.sin(ph)), dy: A * (Math.sin(2 * a + ph) - Math.sin(ph)) * 0.5 };
        };
      }, { tileCell: 16 });
    }
    const { w, h } = ctx.project.canvas;
    const xf = ctx.layer.xf;
    const dx = A * Math.sin(a), dy = A * 0.6 * Math.sin(2 * a), rot = num(ctx, 'giro', 1.5) * Math.sin(a);
    if (!dx && !dy && !rot) return null;
    return { set: { 'xf.x': xf.x + dx / w, 'xf.y': xf.y + dy / h, 'xf.rot': xf.rot + rot } };
  },
});

/* ------------------------------------------------------------------ Marquesina */

registerTemplate({
  id: 'marquesina',
  name: 'Marquesina',
  blurb: 'La imagen corre como un letrero de luces y vuelve a entrar por el otro lado; a saltos de celda o continua.',
  group: 'bucle',
  kinds: PICTURE_KINDS,
  dur: 4,
  params: [
    { key: 'direccion', label: 'Hacia', type: 'select', options: [['izquierda', 'La izquierda'], ['derecha', 'La derecha'], ['arriba', 'Arriba'], ['abajo', 'Abajo']], def: 'izquierda' },
    P.cycles(1, 8, 'Vueltas'),
    { key: 'pasos', label: 'A saltos de celda', type: 'toggle', def: true },
    { key: 'filas', label: 'Filas alternas', type: 'toggle', def: false, help: 'Una fila hacia un lado y la siguiente hacia el otro.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const dir = str(ctx, 'direccion', 'izquierda');
    const n = Math.round(num(ctx, 'ciclos', 1));
    const stepped = bool(ctx, 'pasos', true), alt = bool(ctx, 'filas');
    const horiz = dir === 'izquierda' || dir === 'derecha';
    const sign = dir === 'izquierda' || dir === 'arriba' ? -1 : 1;
    return perCell(ctx, (g: CellGrid) => {
      const G = geo(g);
      const len = horiz ? G.cols : G.rows;
      let s = p * n * len;
      if (stepped) s = Math.floor(s + 1e-9);
      if (frac(s / len) === 0 && !alt) return () => null;
      return (_i, c, r) => {
        const k = horiz ? c : r;
        const way = alt && (horiz ? r : c) % 2 === 1 ? -sign : sign;
        const pos = (((k + way * s) % len) + len) % len;
        const d = (pos - k) * (horiz ? G.cw : G.ch);
        if (!d) return null;
        return horiz ? { dx: d } : { dy: d };
      };
    }, { tileCell: 12 });
  },
});
