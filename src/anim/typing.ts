/**
 * Templates of characters that are typed, erased, decoded or counted: they work on the characters
 * themselves (glyph layers: real characters; text layers: the letters), so they read as text.
 *
 *   borrado            «Borrado»: backspace from the end (the held key speeds up), a selection that is
 *                      deleted at once, or lines cleared from the top — the exit of a terminal
 *   escritura-errores  «Escritura con errores»: a typist who hits a wrong key, notices, deletes and retypes
 *   descifrar          «Descifrado»: every character scrambles through random glyphs and locks in place
 *   lluvia             «Lluvia de matriz»: columns of falling glyphs leave the picture behind them
 *   cuenta             «Cuenta hacia arriba»: digits roll (or the ink climbs the ramp) until each character lands
 *   cursor             «Cursor que parpadea»: a blinking cursor after the last character (a loop)
 *   palabras-figura    «Palabras que forman la figura»: the layer's words stream from one point into the figure
 */
import { charsetInfo } from '../glyphs/index';
import { hashString, rand01, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from '../project/clips';
import {
  bool, cached, cellX, cellY, clamp01, easeOutCubic, filled, geo, lerp, num, orderField, P, POOL_OPTIONS, poolChars, span01,
  str, type OrderKind,
} from './kit';
import { gridTyping, textTyping, typedCount } from './typekit';

const ACCENTS: Record<string, string | undefined> = { propio: undefined, acento: '#ff5b1f', fosforo: '#b8ffcf', hueso: '#ede6da', blanco: '#ffffff' };
const ACCENT_OPTIONS: Array<[string, string]> = [['propio', 'El de la capa'], ['acento', 'Bermellón'], ['fosforo', 'Fósforo'], ['hueso', 'Hueso'], ['blanco', 'Blanco']];
const CURSORS: Array<[string, string]> = [['█', 'Bloque █'], ['▌', 'Barra ▌'], ['_', 'Subrayado _'], ['▏', 'Línea fina ▏']];

/* ------------------------------------------------------------------ Borrado */

/** Erase times with a held backspace: the first units go slowly, then the key repeats faster and faster. */
function eraseTimes(n: number, accel: number): Float64Array {
  const w = new Float64Array(n);
  let W = 0;
  for (let k = 0; k < n; k++) { w[k] = 1 / (1 + accel * 6 * Math.min(1, k / Math.max(1, n * 0.15))); W += w[k]; }
  const at = new Float64Array(n);
  let cum = 0;
  for (let k = 0; k < n; k++) { cum += w[k]; at[k] = W > 0 ? cum / W : 1; }
  return at;
}

registerTemplate({
  id: 'borrado',
  name: 'Borrado',
  blurb: 'El texto se borra como en una terminal: con retroceso desde el final (la tecla sostenida acelera), seleccionado y borrado de golpe, o línea a línea desde arriba.',
  group: 'salida',
  kinds: ['glyphs', 'text'],
  dur: 2,
  params: [
    { key: 'modo', label: 'Cómo se borra', type: 'select', options: [['retroceso', 'Retroceso desde el final'], ['seleccion', 'Seleccionar y borrar'], ['lineas', 'Línea a línea, desde arriba']], def: 'retroceso' },
    { key: 'unidad', label: 'Borra por', type: 'select', options: [['caracter', 'Carácter'], ['palabra', 'Palabra'], ['linea', 'Línea']], def: 'caracter', when: { modo: ['retroceso'] } },
    { key: 'acelera', label: 'Tecla sostenida', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5, help: 'Cuánto se acelera el borrado después de las primeras teclas.', when: { modo: ['retroceso'] } },
    P.color('colorSeleccion', 'Color de la selección', '#ff5b1f'),
    { key: 'cursor', label: 'Cursor', type: 'toggle', def: true },
    { key: 'glifo', label: 'Forma del cursor', type: 'select', options: CURSORS, def: '█', when: { cursor: [true] } },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p <= 0) return null;
    const mode = str(ctx, 'modo', 'retroceso');
    const cursor = bool(ctx, 'cursor', true);
    const glyph = str(ctx, 'glifo', '█');
    const accel = num(ctx, 'acelera', 0.5);
    const selColor = str(ctx, 'colorSeleccion', '#ff5b1f');
    const seed = hashString(ctx.seed);
    if (ctx.layer.kind === 'text') {
      const T = textTyping(ctx.layer.text, mode === 'retroceso' ? str(ctx, 'unidad', 'caracter') : mode === 'lineas' ? 'linea' : 'caracter', 0, 0, seed);
      const n = T.at.length;
      if (mode === 'seleccion') {
        // the selection grows from the end (drawn as the cursor glyph over the text), then all goes at once
        const kept = p < 0.8 ? T.chars.join('') : '';
        return { set: { text: kept + (cursor ? glyph : '') } };
      }
      if (mode === 'lineas') {
        const lines = ctx.layer.text.split('\n');
        const gone = Math.min(lines.length, Math.floor(p * lines.length + 1e-9));
        return { set: { text: lines.slice(gone).join('\n') + (cursor && gone >= lines.length ? glyph : '') } };
      }
      const at = eraseTimes(n, accel);
      const erased = typedCount(at, p);
      const left = n - erased;
      const upTo = left ? T.ends![left - 1] : 0;
      return { set: { text: T.chars.slice(0, upTo).join('') + (cursor ? glyph : '') } };
    }
    return {
      glyphs: glyph + '█',
      cells: g => {
        const G = geo(g);
        if (mode === 'lineas') {
          // every row scrolls up and out, like a terminal cleared by new empty lines
          const shift = p * (G.rows + 1);
          return (_i, _c, r) => {
            const y = r - shift;
            if (y < -0.5) return { visible: 0 };
            return { dy: -shift * G.ch, visible: clamp01(y + 1) };
          };
        }
        const T = gridTyping(g, mode === 'retroceso' ? str(ctx, 'unidad', 'caracter') : 'caracter', true, 0, 0, seed);
        const n = T.at.length;
        const unitOf = T.unitOf!;
        if (mode === 'seleccion') {
          // 0..0.8: the selection grows from the last character back to the first; then it is deleted
          if (p >= 0.8) {
            const at = n ? T.first![0] : 0;
            return i => (cursor && i === at ? { visible: 1, glyph } : unitOf[i] >= 0 ? { visible: 0 } : null);
          }
          const sel = Math.floor(span01(p, 0, 0.78) * n + 1e-9);
          return i => {
            const u = unitOf[i];
            if (u < 0) return null;
            return u >= n - sel ? { visible: 1, glyph: '█', color: selColor } : null;
          };
        }
        const erased = typedCount(eraseTimes(n, accel), p);
        const left = n - erased;
        const at = left > 0 ? Math.min(g.cols * g.rows - 1, T.last![left - 1] + 1) : n ? T.first![0] : 0;
        return i => {
          if (cursor && i === at) return { visible: 1, glyph };
          const u = unitOf[i];
          if (u < 0) return null;
          return u < left ? null : { visible: 0 };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Escritura con errores */

/** Neighbouring keys (QWERTY / Spanish layout) for believable typos. */
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm,.-'];
function neighbour(ch: string, r: number): string {
  const lower = ch.toLowerCase();
  for (let y = 0; y < ROWS.length; y++) {
    const x = ROWS[y].indexOf(lower);
    if (x < 0) continue;
    const opts: string[] = [];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const k = ROWS[y + dy]?.[x + dx]; if (k) opts.push(k); }
    const pick = opts[Math.floor(r * opts.length)] ?? lower;
    return ch === lower ? pick : pick.toUpperCase();
  }
  return ch;
}

/** Per unit: when the wrong key appears, when it is erased, when the right one appears (right only = no typo). */
interface Keystrokes { wrong: Float64Array; erase: Float64Array; right: Float64Array; typo: Uint8Array }
function keystrokes(n: number, rate: number, seed: number): Keystrokes {
  return cached(`keys:${n}:${rate}:${seed}`, () => {
    const typo = new Uint8Array(n);
    let W = 0;
    const w = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      typo[k] = k > 0 && rand01(seed, k, 61) < rate ? 1 : 0;
      // a typo costs the wrong key, a moment to notice, the backspace and the right key
      w[k] = (typo[k] ? 1 + 1.6 + 0.6 : 0) + 1 * (0.8 + rand01(seed, k, 62) * 0.4);
      W += w[k];
    }
    const wrong = new Float64Array(n), erase = new Float64Array(n), right = new Float64Array(n);
    let cum = 0;
    for (let k = 0; k < n; k++) {
      if (typo[k]) { wrong[k] = (cum + 1) / W; erase[k] = (cum + 2.6) / W; }
      cum += w[k];
      right[k] = Math.min(1, cum / W);
    }
    return { wrong, erase, right, typo };
  });
}

registerTemplate({
  id: 'escritura-errores',
  name: 'Escritura con errores',
  blurb: 'Una persona escribe: a veces toca la tecla de al lado, se detiene, la borra y sigue. Siempre los mismos errores para la misma semilla.',
  group: 'entrada',
  kinds: ['glyphs', 'text'],
  dur: 4,
  params: [
    { key: 'errores', label: 'Errores', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.1, help: 'Parte de las teclas que salen mal (y se corrigen).' },
    P.color('colorError', 'Color del error', '#ff5b1f'),
    { key: 'cursor', label: 'Cursor', type: 'toggle', def: true },
    { key: 'glifo', label: 'Forma del cursor', type: 'select', options: CURSORS, def: '▌', when: { cursor: [true] } },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const rate = num(ctx, 'errores', 0.1);
    const cursor = bool(ctx, 'cursor', true);
    const glyph = str(ctx, 'glifo', '▌');
    const errColor = str(ctx, 'colorError', '#ff5b1f');
    const seed = hashString(ctx.seed);
    /** State of unit k at p: 0 hidden, 1 wrong key showing, 2 right. */
    const stateOf = (K: Keystrokes, k: number) => (p >= K.right[k] ? 2 : K.typo[k] && p >= K.wrong[k] && p < K.erase[k] ? 1 : 0);
    if (ctx.layer.kind === 'text') {
      const chars = Array.from(ctx.layer.text);
      const K = keystrokes(chars.length, rate, seed);
      let out = '';
      for (let k = 0; k < chars.length; k++) {
        const s = stateOf(K, k);
        if (s === 2) { out += chars[k]; continue; }
        if (s === 1) out += neighbour(chars[k], rand01(seed, k, 63));
        break;
      }
      return { set: { text: out + (cursor ? glyph : '') } };
    }
    return {
      glyphs: glyph,
      cells: g => {
        const T = gridTyping(g, 'caracter', true, 0, 0, seed);
        const n = T.at.length;
        const K = keystrokes(n, rate, seed);
        const pool = poolChars('propio', g);
        // the unit being worked on: the first one not yet right
        let head = 0;
        while (head < n && p >= K.right[head]) head++;
        const headState = head < n ? stateOf(K, head) : 2;
        const cursorUnit = headState === 1 ? head + 1 : head;
        const cursorCell = cursorUnit < n ? T.first![cursorUnit] : n ? Math.min(g.cols * g.rows - 1, T.last![n - 1] + 1) : 0;
        const unitOf = T.unitOf!;
        return i => {
          if (cursor && i === cursorCell) return { visible: 1, glyph };
          const u = unitOf[i];
          if (u < 0) return null;
          if (u < head) return null;
          if (u === head && headState === 1) return { visible: 1, glyph: pool[Math.floor(rand01(seed, u, 64) * pool.length)] ?? '#', color: errColor };
          return { visible: 0 };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Descifrado */

registerTemplate({
  id: 'descifrar',
  name: 'Descifrado',
  blurb: 'Cada carácter gira entre glifos al azar y se fija en su lugar, en el orden que elijas: un mensaje que se decodifica.',
  group: 'entrada',
  kinds: ['glyphs', 'text'],
  dur: 2.5,
  params: [
    P.order('azar', ['azar', 'izquierda', 'derecha', 'arriba', 'centro', 'lectura', 'brillo', 'contornos', 'ruido']),
    { key: 'glifos', label: 'Glifos del ruido', type: 'select', options: POOL_OPTIONS, def: 'propio' },
    { key: 'cambios', label: 'Cambios por segundo', type: 'range', min: 2, max: 30, step: 1, def: 14 },
    { key: 'ventana', label: 'Tiempo girando', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.45, help: 'Parte del clip que cada carácter pasa girando antes de fijarse.' },
    { key: 'inicio', label: 'Al empezar', type: 'select', options: [['lleno', 'Todo girando'], ['vacio', 'Vacío: aparecen girando']], def: 'lleno' },
    { key: 'color', label: 'Color mientras gira', type: 'select', options: ACCENT_OPTIONS, def: 'fosforo', help: 'Solo en capas de caracteres.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const win = num(ctx, 'ventana', 0.45);
    const rate = num(ctx, 'cambios', 14);
    const tick = Math.floor(ctx.pos * rate);
    const full = str(ctx, 'inicio', 'lleno') === 'lleno';
    const color = ACCENTS[str(ctx, 'color', 'fosforo')];
    const kind = str(ctx, 'orden', 'azar') as OrderKind;
    const poolId = str(ctx, 'glifos', 'propio');
    // cell i locks at L = o·(1 − win) + win (the last one at p = 1) and starts at 0 or L − win
    const state = (o: number) => { const L = o * (1 - win) + win; return p >= L ? 2 : full || p >= L - win ? 1 : 0; };
    if (ctx.layer.kind === 'text') {
      const chars = Array.from(ctx.layer.text);
      const pool = poolId === 'propio' ? Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=') : poolChars(poolId);
      let out = '';
      for (let k = 0; k < chars.length; k++) {
        const ch = chars[k];
        if (ch === ' ' || ch === '\n') { out += ch; continue; }
        const o = kind === 'izquierda' || kind === 'lectura' ? k / Math.max(1, chars.length - 1) : kind === 'derecha' ? 1 - k / Math.max(1, chars.length - 1) : rand01(seed, k, 3);
        const s = state(o);
        out += s === 2 ? ch : s === 1 ? pool[Math.floor(rand01(seed, k, tick + 11) * pool.length)] : ' ';
      }
      return { set: { text: out } };
    }
    return {
      glyphs: poolId === 'propio' ? '' : poolChars(poolId).join(''),
      cells: g => {
        const o = orderField(kind, g, seed);
        const pool = poolChars(poolId, g);
        return i => {
          if (!filled(g, i)) return null;
          const s = state(o[i]);
          if (s === 2) return null;
          if (s === 0) return { visible: 0 };
          const glyph = pool[Math.floor(rand01(seed, i, tick + 11) * pool.length)] ?? '#';
          return color ? { visible: 1, glyph, color } : { visible: 1, glyph };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Lluvia de matriz */

registerTemplate({
  id: 'lluvia',
  name: 'Lluvia de matriz',
  blurb: 'Columnas de glifos caen a distintas velocidades con una cabeza brillante y dejan la imagen formada detrás.',
  group: 'entrada',
  kinds: ['glyphs', 'ascii'],
  dur: 3,
  params: [
    { key: 'glifos', label: 'Glifos que caen', type: 'select', options: POOL_OPTIONS, def: 'propio' },
    { key: 'estela', label: 'Largo de la estela', type: 'range', min: 2, max: 40, step: 1, def: 12, unit: 'celdas' },
    { key: 'velocidad', label: 'Velocidad de caída', type: 'range', min: 0.2, max: 1, step: 0.05, def: 0.55, help: 'Más alto: cada columna cae en menos tiempo (y empiezan más repartidas).' },
    { key: 'cambios', label: 'Cambios por segundo', type: 'range', min: 0, max: 30, step: 1, def: 16, help: 'Los glifos de la estela cambian mientras caen.' },
    P.color('cabeza', 'Color de la cabeza', '#e9fff0'),
    P.color('rastro', 'Color de la estela', '#4fe36a'),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const trail = num(ctx, 'estela', 12);
    const speed = num(ctx, 'velocidad', 0.55);
    const tick = Math.floor(ctx.pos * num(ctx, 'cambios', 16));
    const head = str(ctx, 'cabeza', '#e9fff0'), tail = str(ctx, 'rastro', '#4fe36a');
    const poolId = str(ctx, 'glifos', 'propio');
    // column c starts at s_c and its head crosses rows + trail in L = 1 − speed·0.7 of the clip… all end by p = 1
    const fall = (G: { rows: number }, c: number) => {
      const L = 1 - speed * 0.7;
      const s = rand01(seed, c, 21) * (1 - L);
      const len = L * (0.75 + rand01(seed, c, 22) * 0.25);
      return (span01(p, s, s + len)) * (G.rows + trail + 1) - 1;
    };
    if (ctx.layer.kind === 'ascii') {
      return {
        reveal: g => {
          const G = geo(g);
          const heads = new Float32Array(G.cols);
          for (let c = 0; c < G.cols; c++) heads[c] = fall(G, c);
          // passed cells show; the trail fades in behind the head
          return (c, r) => { const d = heads[c] - r; return d < 0 ? 0 : d >= trail ? 1 : 0.25 + 0.75 * (d / trail) * 0.6; };
        },
      };
    }
    return {
      glyphs: poolId === 'propio' ? '' : poolChars(poolId).join(''),
      cells: g => {
        const G = geo(g);
        const heads = new Float32Array(G.cols);
        for (let c = 0; c < G.cols; c++) heads[c] = fall(G, c);
        const pool = poolChars(poolId, g);
        return (i, c, r) => {
          const d = heads[c] - r;
          if (d < 0) return { visible: 0 };
          if (d >= trail) return null;
          const glyph = pool[Math.floor(rand01(seed, i, tick + Math.floor(d)) * pool.length)] ?? '1';
          if (d < 1) return { visible: 1, glyph, color: head };
          return { visible: 1 - (d / trail) * 0.75, glyph, color: tail };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Cuenta hacia arriba */

/** The ramp a glyph layer draws with (empty → full), for «the ink climbs». */
function rampOf(ctx: ClipContext, g: CellGrid): string[] {
  if (ctx.layer.kind === 'glyphs') {
    const s = ctx.layer.glyphs;
    const info = charsetInfo(s.charset);
    const chars = info.user === 'chars' ? s.chars : info.user ? '' : info.chars;
    const list = Array.from(chars || '').filter(c => c !== ' ');
    if (list.length >= 2) return list;
  }
  return poolChars('propio', g);
}

registerTemplate({
  id: 'cuenta',
  name: 'Cuenta hacia arriba',
  blurb: 'Cada carácter cuenta antes de quedarse: las cifras ruedan como un contador, o la tinta sube por la rampa de la capa hasta su carácter.',
  group: 'entrada',
  kinds: ['glyphs', 'text'],
  dur: 2.5,
  params: [
    { key: 'modo', label: 'Qué cuenta', type: 'select', options: [['digitos', 'Cifras que ruedan'], ['rampa', 'La tinta sube por la rampa']], def: 'digitos' },
    P.order('izquierda', ['izquierda', 'derecha', 'arriba', 'abajo', 'centro', 'azar', 'brillo', 'lectura']),
    { key: 'vueltas', label: 'Vueltas del contador', type: 'range', min: 0, max: 5, step: 1, def: 1, when: { modo: ['digitos'] } },
    { key: 'ventana', label: 'Tiempo contando', type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.5, help: 'Parte del clip que cada carácter pasa contando.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const digits = str(ctx, 'modo', 'digitos') === 'digitos';
    const laps = num(ctx, 'vueltas', 1);
    const win = num(ctx, 'ventana', 0.5);
    const kind = str(ctx, 'orden', 'izquierda') as OrderKind;
    const local = (o: number) => clamp01((p - o * (1 - win)) / win);
    if (ctx.layer.kind === 'text') {
      const chars = Array.from(ctx.layer.text);
      let out = '';
      for (let k = 0; k < chars.length; k++) {
        const ch = chars[k];
        const o = kind === 'derecha' ? 1 - k / Math.max(1, chars.length - 1) : kind === 'azar' ? rand01(seed, k, 5) : k / Math.max(1, chars.length - 1);
        const q = local(o);
        if (q >= 1 || ch === ' ' || ch === '\n') { out += ch; continue; }
        if (q <= 0) { out += ' '; continue; }
        const target = /[0-9]/.test(ch) ? Number(ch) : 9;
        out += String(Math.floor(q * (target + 10 * laps + 1)) % 10);
      }
      return { set: { text: out } };
    }
    return {
      glyphs: '0123456789',
      cells: g => {
        const o = orderField(kind, g, seed);
        const ramp = rampOf(ctx, g);
        const idx = new Map<string, number>(ramp.map((c, k) => [c, k]));
        return i => {
          if (!filled(g, i)) return null;
          const q = local(o[i]);
          if (q >= 1) return null;
          if (q <= 0) return { visible: 0 };
          const ch = g.chars?.[i] ?? '#';
          if (digits) {
            const target = /[0-9]/.test(ch) ? Number(ch) : 9;
            return { visible: 1, glyph: String(Math.floor(q * (target + 10 * laps + 1)) % 10) };
          }
          const f = idx.get(ch) ?? ramp.length - 1;
          return { visible: 1, glyph: ramp[Math.min(f, Math.floor(q * (f + 1)))] ?? ch };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Cursor que parpadea */

registerTemplate({
  id: 'cursor',
  name: 'Cursor que parpadea',
  blurb: 'Un cursor late después del último carácter, como una terminal que espera. Un número entero de parpadeos: el bucle cierra sin salto.',
  group: 'bucle',
  kinds: ['glyphs', 'text'],
  dur: 2,
  params: [
    P.cycles(3, 30, 'Parpadeos'),
    { key: 'glifo', label: 'Forma', type: 'select', options: CURSORS, def: '█' },
    { key: 'color', label: 'Color', type: 'select', options: ACCENT_OPTIONS, def: 'acento', help: 'Solo en capas de caracteres.' },
    { key: 'encendido', label: 'Tiempo encendido', type: 'range', min: 0.2, max: 0.8, step: 0.05, def: 0.5 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const cycles = Math.round(num(ctx, 'ciclos', 3));
    const on = num(ctx, 'encendido', 0.5);
    const glyph = str(ctx, 'glifo', '█');
    const color = ACCENTS[str(ctx, 'color', 'acento')];
    const lit = (ctx.p * cycles) % 1 < on || ctx.p >= 1 && on >= 1;
    if (!lit) return null;
    if (ctx.layer.kind === 'text') return { set: { text: ctx.layer.text + glyph } };
    return {
      glyphs: glyph,
      cells: g => {
        const G = geo(g);
        let last = -1;
        for (let i = G.n - 1; i >= 0; i--) if (filled(g, i)) { last = i; break; }
        const at = Math.min(G.n - 1, last + 1);
        return i => (i === at ? (color ? { visible: 1, glyph, color } : { visible: 1, glyph }) : null);
      },
    };
  },
});

/* ------------------------------------------------------------------ Palabras que forman la figura */

registerTemplate({
  id: 'palabras-figura',
  name: 'Palabras que forman la figura',
  blurb: 'Tus palabras (una capa de caracteres con «Tus palabras») salen de un punto como un chorro de texto y van ocupando la figura en orden de lectura.',
  group: 'entrada',
  kinds: ['glyphs'],
  dur: 4,
  params: [
    { key: 'origen', label: 'Salen desde', type: 'select', options: [['izquierda', 'La izquierda'], ['derecha', 'La derecha'], ['arriba', 'Arriba'], ['abajo', 'Abajo'], ['centro', 'El centro'], ['punto', 'Un punto']], def: 'izquierda' },
    ...P.center().map(d => ({ ...d, when: { origen: ['punto'] } })),
    { key: 'vuelo', label: 'Tiempo en el aire', type: 'range', min: 0.05, max: 0.6, step: 0.05, def: 0.25, help: 'Parte del clip que cada carácter tarda en llegar a su lugar.' },
    { key: 'curva', label: 'Curva del chorro', type: 'range', min: -1, max: 1, step: 0.05, def: 0.35 },
    { key: 'color', label: 'Color en el aire', type: 'select', options: ACCENT_OPTIONS, def: 'acento' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const fly = num(ctx, 'vuelo', 0.25);
    const bend = num(ctx, 'curva', 0.35);
    const color = ACCENTS[str(ctx, 'color', 'acento')];
    const from = str(ctx, 'origen', 'izquierda');
    return {
      cells: g => {
        const G = geo(g);
        const o = orderField('lectura', g, seed);
        const ox = from === 'izquierda' ? -G.cw * 2 : from === 'derecha' ? G.w + G.cw * 2 : from === 'punto' ? num(ctx, 'x', 0.5) * G.w : G.w / 2;
        const oy = from === 'arriba' ? -G.ch * 2 : from === 'abajo' ? G.h + G.ch * 2 : from === 'punto' ? num(ctx, 'y', 0.5) * G.h : G.h / 2;
        // only the filled cells stream in; their order compressed to the filled share of the grid
        let filledN = 0;
        for (let i = 0; i < G.n; i++) if (filled(g, i)) filledN++;
        const share = Math.max(1, filledN) / Math.max(1, G.n);
        return (i, c, r) => {
          if (!filled(g, i)) return null;
          const k = Math.min(1, o[i] / Math.max(1e-6, share));
          const arrive = k * (1 - fly) + fly;
          const q = (p - (arrive - fly)) / fly;
          if (q >= 1) return null;
          if (q <= 0) return { visible: 0 };
          const e = easeOutCubic(q);
          const tx = cellX(G, c), ty = cellY(G, r);
          // a quadratic curve from the spout to the cell, bent sideways
          const mx = (ox + tx) / 2 - (ty - oy) * bend * 0.5, my = (oy + ty) / 2 + (tx - ox) * bend * 0.5;
          const x = lerp(lerp(ox, mx, e), lerp(mx, tx, e), e), y = lerp(lerp(oy, my, e), lerp(my, ty, e), e);
          const f = { visible: Math.min(1, q * 5), dx: x - tx, dy: y - ty, scale: 0.55 + 0.45 * e };
          return color && q < 0.9 ? { ...f, color } : f;
        };
      },
    };
  },
});
