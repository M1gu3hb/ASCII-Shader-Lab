/**
 * Templates of colour and light: single-palette and colour-changing versions of a piece, and the finishes
 * that pulse (glow, grain, scanlines).
 *
 *   paleta-unica   «Paleta única»: the layer goes, cell by cell, to one palette (glyphs), a ramp (ASCII),
 *                  a duotone (photo) or one colour (text, shapes)
 *   ciclo-paleta   «Ciclo de paleta» (loop): colours rotate through a palette
 *   deriva-tono    «Deriva de tono» (loop): the hue turns all the way round
 *   ola-color      «Ola de color» (loop): a band of colours travels across the cells
 *   resaltado      «Barrido de luz»: a highlight band sweeps across and recolours (or swells) what it touches
 *   pulso-brillo   «Pulso de brillo»: the glow beats (soft, heartbeat or hit), the layer swells with it
 *   grano          «Grano y líneas que parpadean» (loop): film grain and CRT scanlines that flicker
 */
import { hashString, rand01, registerTemplate, type ClipContext, type ClipEffect, type ParamValue } from '../project/clips';
import type { Finish } from '../project/types';
import {
  ALL_KINDS, bool, cellX, cellY, clamp01, colorSet, COLOR_SET_OPTIONS, frac, geo, gradientAt, hueRotate, lumAt, mixColor, num, orderField,
  P, perCell, smooth, span01, str, sweep, toHex, TAU, type OrderKind,
} from './kit';

const hexOf = (v: number) => toHex((v >> 16) & 255, (v >> 8) & 255, v & 255);
/** A colour on a closed loop through the palette (the last colour blends back into the first). */
const cyc = (list: readonly string[], x: number) => gradientAt([...list, list[0]], frac(x));

/** The layer's own colours when it has several (glyph palette in palette mode, ASCII stops), else a set. */
function paletteFor(ctx: ClipContext, key = 'paleta'): string[] {
  const id = str(ctx, key, 'propia');
  if (id !== 'propia') return colorSet(id);
  const l = ctx.layer;
  if (l.kind === 'glyphs' && l.glyphs.color === 'palette' && l.glyphs.palette.length >= 2) return l.glyphs.palette.slice();
  if (l.kind === 'ascii' && l.style.color.stops.length >= 2) return l.style.color.stops.slice();
  return colorSet('neon');
}

/* ------------------------------------------------------------------ Paleta única */

registerTemplate({
  id: 'paleta-unica',
  name: 'Paleta única',
  blurb: 'La capa pasa a una sola paleta: celda por celda en los caracteres, la rampa del ASCII, un duotono en la foto, un color en textos y formas.',
  group: 'transformación',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'paleta', label: 'Paleta', type: 'select', options: COLOR_SET_OPTIONS, def: 'fosforo' },
    P.order('azar', ['azar', 'izquierda', 'arriba', 'centro', 'brillo', 'sombras', 'ruido']),
    P.soft(0.3),
    { key: 'vuelta', label: 'Ida y vuelta', type: 'toggle', def: false },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = bool(ctx, 'vuelta') ? clamp01(1 - Math.abs(ctx.p * 2 - 1)) : ctx.p;
    if (p <= 0) return null;
    const pal = colorSet(str(ctx, 'paleta', 'fosforo'));
    const l = ctx.layer;
    const seed = hashString(ctx.seed);
    switch (l.kind) {
      case 'glyphs': {
        const soft = Math.max(0.02, num(ctx, 'suavidad', 0.3) * 0.5);
        const kind = str(ctx, 'orden', 'azar') as OrderKind;
        return {
          cells: g => {
            const o = orderField(kind, g, seed);
            const cols = g.colors;
            return i => {
              const v = sweep(o[i], p, soft);
              if (v <= 0) return null;
              const target = gradientAt(pal, lumAt(g, i));
              return { color: cols && v < 1 ? mixColor(hexOf(cols[i] ?? 0), target, v) : target };
            };
          },
        };
      }
      case 'ascii': {
        const set: Record<string, ParamValue> = {};
        const n = l.style.color.stops.length;
        if (l.style.color.mode === 'source') {
          // the photo's colours fade to grey, then the ramp takes the palette
          if (p < 0.5) set['style.color.sat'] = l.style.color.sat * (1 - p * 2);
          else {
            set['style.color.mode'] = 'ramp';
            for (let i = 0; i < n; i++) set[`style.color.stops.${i}`] = mixColor('#8c857a', gradientAt(pal, n > 1 ? i / (n - 1) : 1), (p - 0.5) * 2);
          }
        } else for (let i = 0; i < n; i++) set[`style.color.stops.${i}`] = mixColor(l.style.color.stops[i], gradientAt(pal, n > 1 ? i / (n - 1) : 1), p);
        return { set };
      }
      case 'photo': {
        const f: Finish = { kind: 'duotone', on: true, amount: p, params: { dark: pal[0], light: pal[pal.length - 1], contrast: 1.15, balance: 0 } };
        return { finishes: [f] };
      }
      case 'text': return { set: { color: mixColor(l.color, pal[pal.length - 1], p) } };
      case 'shape': {
        const set: Record<string, ParamValue> = {};
        if (l.stroke) set.stroke = mixColor(l.stroke, pal[pal.length - 1], p);
        if (l.fill) set.fill = mixColor(l.fill, pal[Math.max(0, pal.length - 2)], p);
        return Object.keys(set).length ? { set } : null;
      }
    }
  },
});

/* ------------------------------------------------------------------ Ciclo de paleta */

const WITH_OWN: Array<[string, string]> = [['propia', 'Los de la capa'], ...COLOR_SET_OPTIONS];

registerTemplate({
  id: 'ciclo-paleta',
  name: 'Ciclo de paleta',
  blurb: 'Los colores giran por una paleta, como las animaciones de paleta de los juegos de 8 bits. Vueltas enteras: el bucle cierra sin salto.',
  group: 'bucle',
  kinds: ALL_KINDS,
  dur: 3,
  params: [
    { key: 'paleta', label: 'Colores', type: 'select', options: WITH_OWN, def: 'propia' },
    P.cycles(1, 12, 'Vueltas'),
    { key: 'pasos', label: 'A saltos', type: 'toggle', def: false, help: 'Cada color salta al siguiente en vez de fundirse.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const pal = paletteFor(ctx);
    const n = Math.round(num(ctx, 'ciclos', 1));
    let x = ctx.p * n;
    if (bool(ctx, 'pasos')) x = Math.floor(x * pal.length + 1e-9) / pal.length;
    const l = ctx.layer;
    const set: Record<string, ParamValue> = {};
    switch (l.kind) {
      case 'glyphs':
        if (l.glyphs.color === 'palette') { l.glyphs.palette.forEach((_, i) => { set[`glyphs.palette.${i}`] = cyc(pal, i / Math.max(1, l.glyphs.palette.length) + x); }); return { set }; }
        if (l.glyphs.color === 'mono') return { set: { 'glyphs.ink': cyc(pal, x) } };
        // colour from the photo: colour bands climb through the brightness
        return { cells: g => i => ({ color: cyc(pal, lumAt(g, i) + x) }) };
      case 'ascii': {
        const k = l.style.color.stops.length;
        for (let i = 0; i < k; i++) set[`style.color.stops.${i}`] = cyc(pal, i / Math.max(1, k) + x);
        if (l.style.color.mode === 'source') set['style.color.mode'] = 'ramp';
        return { set };
      }
      case 'photo': return { finishes: [{ kind: 'duotone', on: true, amount: 1, params: { dark: cyc(pal, x), light: cyc(pal, x + 0.5), contrast: 1.1, balance: 0 } }] };
      case 'text': return { set: { color: cyc(pal, x) } };
      case 'shape':
        if (l.stroke) set.stroke = cyc(pal, x);
        if (l.fill) set.fill = cyc(pal, x + 0.5);
        return { set };
    }
  },
});

/* ------------------------------------------------------------------ Deriva de tono */

registerTemplate({
  id: 'deriva-tono',
  name: 'Deriva de tono',
  blurb: 'El tono de los colores da la vuelta completa al círculo cromático (o la mitad y regresa), sin cambiar su luz.',
  group: 'bucle',
  kinds: ALL_KINDS,
  dur: 4,
  params: [
    P.cycles(1, 8, 'Vueltas'),
    { key: 'modo', label: 'Recorrido', type: 'select', options: [['vuelta', 'Vuelta completa'], ['vaiven', 'Ida y vuelta']], def: 'vuelta' },
    { key: 'amplitud', label: 'Ángulo del vaivén', type: 'range', min: 10, max: 180, step: 5, def: 60, unit: '°', when: { modo: ['vaiven'] } },
    { key: 'sentido', label: 'Sentido', type: 'select', options: [['1', 'Horario'], ['-1', 'Antihorario']], def: '1' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const n = Math.round(num(ctx, 'ciclos', 1));
    const dir = str(ctx, 'sentido', '1') === '-1' ? -1 : 1;
    const deg = str(ctx, 'modo', 'vuelta') === 'vaiven' ? Math.sin(TAU * n * ctx.p) * num(ctx, 'amplitud', 60) * dir : 360 * n * ctx.p * dir;
    const d = ((deg % 360) + 360) % 360;
    if (d < 1e-6 || d > 360 - 1e-6) return null;
    const l = ctx.layer;
    const set: Record<string, ParamValue> = {};
    switch (l.kind) {
      case 'ascii': return { set: { 'style.color.hue': frac(l.style.color.hue + d / 360), ...(l.style.color.mode === 'ramp' ? Object.fromEntries(l.style.color.stops.map((c, i) => [`style.color.stops.${i}`, hueRotate(c, d)])) : {}) } };
      case 'photo': { const h = ((l.adjust.hue + d + 180) % 360 + 360) % 360 - 180; return { set: { 'adjust.hue': h } }; }
      case 'text': return { set: { color: hueRotate(l.color, d) } };
      case 'shape':
        if (l.stroke) set.stroke = hueRotate(l.stroke, d);
        if (l.fill) set.fill = hueRotate(l.fill, d);
        return { set };
      case 'glyphs':
        if (l.glyphs.color === 'mono') return { set: { 'glyphs.ink': hueRotate(l.glyphs.ink, d) } };
        if (l.glyphs.color === 'palette') { l.glyphs.palette.forEach((c, i) => { set[`glyphs.palette.${i}`] = hueRotate(c, d); }); return { set }; }
        return {
          cells: g => {
            const memo = new Map<number, string>();
            return i => {
              const c = g.colors?.[i];
              if (c === undefined) return null;
              let out = memo.get(c);
              if (!out) { out = hueRotate(hexOf(c), d); memo.set(c, out); }
              return { color: out };
            };
          },
        };
    }
  },
});

/* ------------------------------------------------------------------ Ola de color */

registerTemplate({
  id: 'ola-color',
  name: 'Ola de color',
  blurb: 'Una banda de colores viaja por las celdas: en frentes rectos, en círculos o siguiendo la luz de la imagen.',
  group: 'bucle',
  kinds: ['glyphs', 'ascii'],
  dur: 3,
  params: [
    { key: 'paleta', label: 'Colores', type: 'select', options: WITH_OWN, def: 'neon' },
    { key: 'forma', label: 'Forma', type: 'select', options: [['x', 'De izquierda a derecha'], ['y', 'De arriba abajo'], ['radial', 'En círculos'], ['luz', 'Siguiendo la luz']], def: 'x' },
    { key: 'longitud', label: 'Largo de la ola', type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.6, help: 'En fracción del cuadro.' },
    { key: 'mezcla', label: 'Mezcla con el color propio', type: 'range', min: 0, max: 1, step: 0.05, def: 0.85, help: 'Solo en capas de caracteres.' },
    P.cycles(1, 8),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const pal = paletteFor(ctx);
    const n = Math.round(num(ctx, 'ciclos', 1));
    const shape = str(ctx, 'forma', 'x');
    const l = ctx.layer;
    if (l.kind === 'ascii') {
      // the engine's ramp is mapped along x / y / radial / luma and shifted
      const map = shape === 'luz' ? 'luma' : shape;
      const k = l.style.color.stops.length;
      const set: Record<string, ParamValue> = { 'style.color.map': map, 'style.color.shift': frac(l.style.color.shift + n * ctx.p) };
      if (l.style.color.mode === 'source') set['style.color.mode'] = 'ramp';
      if (str(ctx, 'paleta', 'neon') !== 'propia') for (let i = 0; i < k; i++) set[`style.color.stops.${i}`] = gradientAt(pal, k > 1 ? i / (k - 1) : 1);
      return { set };
    }
    const len = num(ctx, 'longitud', 0.6), mix = num(ctx, 'mezcla', 0.85);
    return {
      cells: g => {
        const G = geo(g);
        const cols = g.colors;
        return (i, c, r) => {
          const x = cellX(G, c) / G.w, y = cellY(G, r) / G.h;
          const d = shape === 'y' ? y : shape === 'radial' ? Math.hypot(x - 0.5, (y - 0.5) * (G.h / G.w)) : shape === 'luz' ? lumAt(g, i) : x;
          const col = cyc(pal, d / len - n * ctx.p);
          return { color: cols && mix < 1 ? mixColor(hexOf(cols[i] ?? 0), col, mix) : col };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Barrido de luz */

registerTemplate({
  id: 'resaltado',
  name: 'Barrido de luz',
  blurb: 'Una banda de luz cruza la capa en diagonal: tiñe los caracteres que toca (o los hincha, en el ASCII) y sigue de largo.',
  group: 'énfasis',
  kinds: ['glyphs', 'ascii', 'text'],
  dur: 1.4,
  params: [
    P.color('color', 'Color de la luz', '#ffc46b'),
    { key: 'angulo', label: 'Ángulo', type: 'range', min: 0, max: 180, step: 5, def: 30, unit: '°' },
    { key: 'ancho', label: 'Ancho de la banda', type: 'range', min: 0.02, max: 0.6, step: 0.01, def: 0.18 },
    { key: 'hinchar', label: 'Hinchar', type: 'range', min: 0, max: 1, step: 0.05, def: 0.4 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const color = str(ctx, 'color', '#ffc46b');
    const a = (num(ctx, 'angulo', 30) * Math.PI) / 180, width = num(ctx, 'ancho', 0.18), swell = num(ctx, 'hinchar', 0.4);
    const ux = Math.cos(a), uy = Math.sin(a);
    // band centre travels from before the first corner to past the last one
    const lo = Math.min(0, ux) + Math.min(0, uy) - width, hi = Math.max(0, ux) + Math.max(0, uy) + width;
    const centre = lo + (hi - lo) * p;
    const k = (x: number, y: number) => { const d = (x * ux + y * uy - centre) / width; return Math.abs(d) >= 1 ? 0 : smooth(1 - Math.abs(d)); };
    const l = ctx.layer;
    if (l.kind === 'text') {
      const kk = k(l.box.x + l.box.w / 2, l.box.y + l.size / 2);
      return kk > 0.001 ? { set: { color: mixColor(l.color, color, kk) } } : null;
    }
    return perCell(ctx, g => {
      const G = geo(g);
      const cols = g.colors;
      return (i, c, r) => {
        const kk = k(cellX(G, c) / G.w, cellY(G, r) / G.h);
        if (kk <= 0.001) return null;
        const f = { scale: 1 + swell * kk * 0.6 };
        return l.kind === 'glyphs' ? { ...f, color: cols ? mixColor(hexOf(cols[i] ?? 0), color, kk) : color } : f;
      };
    }, { tileCell: 12 });
  },
});

/* ------------------------------------------------------------------ Pulso de brillo */

/** A beat shape 0..1 at x (0..1 of one beat): soft sine, a heartbeat (two bumps) or a hit that decays. */
function beat(shape: string, x: number): number {
  if (shape === 'latido') return Math.min(1, Math.exp(-(((x - 0.16) / 0.06) ** 2)) + 0.65 * Math.exp(-(((x - 0.4) / 0.07) ** 2)));
  if (shape === 'golpe') return x < 0.06 ? x / 0.06 : Math.exp(-(x - 0.06) * 7) * (1 - smooth(span01(x, 0.85, 1)));
  return Math.sin(Math.PI * x) ** 2;
}

registerTemplate({
  id: 'pulso-brillo',
  name: 'Pulso de brillo',
  blurb: 'El resplandor late: suave, como un corazón o como un golpe que se apaga; la capa puede hincharse un poco con cada latido.',
  group: 'énfasis',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'latidos', label: 'Latidos', type: 'range', min: 1, max: 16, step: 1, def: 2 },
    { key: 'forma', label: 'Forma', type: 'select', options: [['suave', 'Suave'], ['latido', 'Latido'], ['golpe', 'Golpe']], def: 'latido' },
    { key: 'fuerza', label: 'Fuerza', type: 'range', min: 0.1, max: 4, step: 0.05, def: 1.8 },
    { key: 'radio', label: 'Radio', type: 'range', min: 4, max: 160, step: 1, def: 36, unit: 'px' },
    P.color('tinte', 'Tinte', '#ffffff'),
    { key: 'escala', label: 'Hinchar con el latido', type: 'range', min: 0, max: 0.2, step: 0.005, def: 0.03 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0 || p >= 1) return null;
    const n = Math.round(num(ctx, 'latidos', 2));
    const b = beat(str(ctx, 'forma', 'latido'), frac(p * n));
    if (b < 0.004) return null;
    const eff: ClipEffect = {
      finishes: [{ kind: 'glow', on: true, amount: Math.min(1, b), params: { threshold: 0.3, radius: num(ctx, 'radio', 36), strength: num(ctx, 'fuerza', 1.8), tint: str(ctx, 'tinte', '#ffffff'), blend: 'screen' } }],
    };
    const s = num(ctx, 'escala', 0.03);
    if (s > 0) eff.set = { 'xf.scale': ctx.layer.xf.scale * (1 + s * b) };
    return eff;
  },
});

/* ------------------------------------------------------------------ Grano y líneas que parpadean */

registerTemplate({
  id: 'grano',
  name: 'Grano y líneas que parpadean',
  blurb: 'Grano de película y líneas de monitor que titilan a un ritmo, con ráfagas de vez en cuando: textura viva que cierra en bucle.',
  group: 'bucle',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'modo', label: 'Textura', type: 'select', options: [['ambos', 'Grano y líneas'], ['grano', 'Solo grano'], ['lineas', 'Solo líneas']], def: 'ambos' },
    { key: 'ritmo', label: 'Cambios por segundo', type: 'range', min: 2, max: 30, step: 1, def: 12 },
    { key: 'intensidad', label: 'Intensidad', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.45 },
    { key: 'rafagas', label: 'Ráfagas', type: 'range', min: 0, max: 1, step: 0.05, def: 0.25, help: 'Cada tanto, un momento mucho más fuerte.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const seed = hashString(ctx.seed);
    const dur = Math.max(0.05, ctx.clip.dur / Math.max(1, ctx.clip.repeat));
    const steps = Math.max(1, Math.round(num(ctx, 'ritmo', 12) * dur));
    const k = Math.floor(ctx.p * steps + 1e-9) % steps;
    const base = num(ctx, 'intensidad', 0.45);
    const burst = rand01(seed, k, 3) < num(ctx, 'rafagas', 0.25) * 0.3 ? 1.9 : 1;
    const v = base * (0.55 + 0.45 * rand01(seed, k, 1)) * burst;
    const mode = str(ctx, 'modo', 'ambos');
    const finishes: Finish[] = [];
    if (mode !== 'lineas') finishes.push({ kind: 'grain', on: true, amount: 1, params: { amount: Math.min(1, v), size: 1.2 + rand01(seed, k, 2) * 1.4, color: false, anim: false } });
    if (mode !== 'grano') finishes.push({ kind: 'scanlines', on: true, amount: 1, params: { spacing: 3 + Math.round(rand01(seed, k, 4) * 2), intensity: Math.min(1, v * 1.1), width: 0.45, roll: 0, mask: false } });
    return { finishes };
  },
});

/** A palette's colour at x on its closed loop (the last colour blends back into the first). */
export const paletteLoop = cyc;
