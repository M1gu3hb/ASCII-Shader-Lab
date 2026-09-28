/**
 * The first animation templates, registered with clips.ts when this module loads. They prove the wiring
 * of every kind of change a template can make (opacity, per-cell reveal of shader ASCII, per-cell glyph
 * changes, a string property); the full library comes in a later catalog.
 *
 *   «Foto → ASCII» (foto-a-ascii): the characters of an ASCII or glyph layer appear over the photo cell by
 *     cell (dissolve), in a sweep, or all at once (fade). Reversed: ASCII → photo.
 *   «Escritura de terminal» (escritura): the characters of a glyph layer (or the letters of a text layer)
 *     are typed one after another, with a block cursor. Reversed: reverse typing (erasing from the end).
 */
import { hashString, rand01, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from './clips';

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * When a cell switches on in «Foto → ASCII» (0..1): at random (dissolve), or by its place along a direction
 * (sweep), each with a little jitter so the edge is not a ruler line.
 */
function cellOrder(mode: string, dir: string, irregular: number, seed: number, g: CellGrid): (col: number, row: number) => number {
  const cols = Math.max(1, g.cols), rows = Math.max(1, g.rows);
  if (mode === 'barrido') {
    const pos = (c: number, r: number) => {
      const x = (c + 0.5) / cols, y = (r + 0.5) / rows;
      switch (dir) {
        case 'derecha': return 1 - x;
        case 'abajo': return y;
        case 'arriba': return 1 - y;
        case 'centro': return Math.min(1, Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2);
        default: return x;
      }
    };
    return (c, r) => pos(c, r) * (1 - irregular) + rand01(seed, c, r) * irregular;
  }
  return (c, r) => rand01(seed, c, r);
}

registerTemplate({
  id: 'foto-a-ascii',
  name: 'Foto → ASCII',
  blurb: 'Los caracteres aparecen sobre la foto celda por celda. Al revés: de ASCII a foto.',
  group: 'entrada',
  kinds: ['ascii', 'glyphs'],
  dur: 2,
  params: [
    { key: 'modo', label: 'Cómo aparecen', type: 'select', options: [['disolver', 'Celdas al azar'], ['barrido', 'Barrido'], ['fundido', 'Fundido']], def: 'disolver' },
    { key: 'direccion', label: 'Dirección del barrido', type: 'select', options: [['izquierda', 'Desde la izquierda'], ['derecha', 'Desde la derecha'], ['arriba', 'Desde arriba'], ['abajo', 'Desde abajo'], ['centro', 'Desde el centro']], def: 'izquierda' },
    { key: 'suavidad', label: 'Suavidad del borde', type: 'range', min: 0, max: 1, step: 0.05, def: 0.25, help: 'Cuántas celdas están a medio aparecer a la vez.' },
    { key: 'irregular', label: 'Borde irregular', type: 'range', min: 0, max: 1, step: 0.05, def: 0.2, help: 'Solo en el barrido: mezcla el orden con celdas al azar.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const mode = String(ctx.params.modo);
    if (mode === 'fundido') return { opacity: p };
    if (p >= 1) return null;
    const soft = Math.max(0.001, Number(ctx.params.suavidad) * 0.5);
    const seed = hashString(ctx.seed);
    const dir = String(ctx.params.direccion), irr = Number(ctx.params.irregular);
    // cell c shows once p passes its threshold h: v = smooth((p·(1 + s) − h) / s), 0 at p = 0 and 1 at p = 1
    const visibility = (g: CellGrid) => {
      const order = cellOrder(mode, dir, irr, seed, g);
      return (c: number, r: number) => smooth((p * (1 + soft) - order(c, r)) / soft);
    };
    if (ctx.layer.kind === 'ascii') return { reveal: visibility };
    return {
      cells: g => {
        const vis = visibility(g);
        return (_i, c, r) => {
          const v = vis(c, r);
          return v >= 1 ? null : { visible: v };
        };
      },
    };
  },
});

/** Cells typed in reading order: the non-empty ones (or all of them). */
function typingOrder(g: CellGrid, skipEmpty: boolean): Int32Array {
  const n = g.cols * g.rows;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (!skipEmpty || !g.chars || (g.chars[i] ?? ' ') !== ' ') idx.push(i);
  return Int32Array.from(idx);
}

registerTemplate({
  id: 'escritura',
  name: 'Escritura de terminal',
  blurb: 'Los caracteres se escriben uno tras otro con un cursor de bloque. Al revés: se borran desde el final.',
  group: 'entrada',
  kinds: ['glyphs', 'text'],
  dur: 3,
  params: [
    { key: 'cursor', label: 'Cursor', type: 'toggle', def: true },
    { key: 'glifo', label: 'Forma del cursor', type: 'select', options: [['█', 'Bloque █'], ['▌', 'Barra ▌'], ['_', 'Subrayado _']], def: '█' },
    { key: 'parpadeo', label: 'Parpadeos por segundo', type: 'range', min: 0, max: 6, step: 0.5, def: 2, help: 'Solo cuando el texto está completo o vacío.' },
    { key: 'vacios', label: 'Saltar celdas vacías', type: 'toggle', def: true, help: 'El tiempo se gasta solo en los caracteres que se ven.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const cursorOn = !!ctx.params.cursor;
    const glyph = String(ctx.params.glifo || '█');
    const hz = Number(ctx.params.parpadeo);
    const done = p <= 0 || p >= 1;
    // while typing the cursor stays lit; at rest it blinks (from the clip's own clock: the same at any frame)
    const lit = cursorOn && (!done || hz <= 0 || Math.floor(ctx.local * hz * 2) % 2 === 0) && ctx.raw < 1;
    if (ctx.layer.kind === 'text') {
      const chars = Array.from(ctx.layer.text);
      const k = Math.floor(p * chars.length + 1e-9);
      if (k >= chars.length && !lit) return null;
      return { set: { text: chars.slice(0, k).join('') + (lit ? glyph : '') } };
    }
    if (p >= 1 && !lit) return null;
    const skip = !!ctx.params.vacios;
    return {
      cells: g => {
        const order = typingOrder(g, skip);
        const n = order.length;
        const k = Math.floor(p * n + 1e-9);
        // rank of each cell in the typing order (−1: never typed, e.g. an empty cell that is skipped)
        const rank = new Int32Array(g.cols * g.rows).fill(-1);
        for (let j = 0; j < n; j++) rank[order[j]] = j;
        // the cursor sits on the next cell to type (after the last one once everything is typed)
        const at = k < n ? order[k] : n ? Math.min(g.cols * g.rows - 1, order[n - 1] + 1) : 0;
        return i => {
          if (lit && i === at) return { visible: 1, glyph };
          const r = rank[i];
          if (r < 0) return skip ? null : { visible: 0 };
          return r < k ? null : { visible: 0 };
        };
      },
    };
  },
});
