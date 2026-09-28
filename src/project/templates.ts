/**
 * The first animation templates, registered with clips.ts when this module loads (evaluate.ts imports it,
 * so a project that uses them evaluates anywhere). The rest of the library is in src/anim (one import of
 * src/anim/index.ts registers every catalog).
 *
 *   «Foto → ASCII» (foto-a-ascii): the characters of an ASCII or glyph layer appear over the photo cell by
 *     cell: at random, in a sweep, radially from a point, in noise patches, by brightness (lights or
 *     shadows first), contours first, or all at once (fade). Reversed: ASCII → photo, the same cells.
 *   «Escritura de terminal» (escritura): the characters of a glyph layer (or the letters of a text layer)
 *     are typed one after another — by character, word or line, with an irregular human rhythm and pauses
 *     at punctuation and line ends — with a cursor (block, bar, underline). Reversed: erasing from the end.
 */
import { orderField, sweep, type OrderKind } from '../anim/kit';
import { gridTyping, textTyping, typedCount } from '../anim/typekit';
import { hashString, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from './clips';

/* ------------------------------------------------------------------ Foto → ASCII */

const SWEEP_ORDER: Record<string, OrderKind> = { izquierda: 'izquierda', derecha: 'derecha', arriba: 'arriba', abajo: 'abajo', centro: 'centro' };
const MODE_ORDER: Record<string, OrderKind> = { disolver: 'azar', ruido: 'ruido', brillo: 'brillo', sombras: 'sombras', bordes: 'contornos', radial: 'centro' };

registerTemplate({
  id: 'foto-a-ascii',
  name: 'Foto → ASCII',
  blurb: 'Los caracteres aparecen sobre la foto celda por celda: al azar, en barrido, desde un punto, por manchas, por luces o por contornos. Al revés: de ASCII a foto.',
  group: 'entrada',
  kinds: ['ascii', 'glyphs'],
  dur: 2,
  params: [
    {
      key: 'modo', label: 'Cómo aparecen', type: 'select', def: 'disolver',
      options: [['disolver', 'Celdas al azar'], ['barrido', 'Barrido'], ['radial', 'Desde un punto'], ['ruido', 'Por manchas'], ['brillo', 'Luces primero'], ['sombras', 'Sombras primero'], ['bordes', 'Contornos primero'], ['fundido', 'Fundido']],
    },
    { key: 'direccion', label: 'Dirección del barrido', type: 'select', options: [['izquierda', 'Desde la izquierda'], ['derecha', 'Desde la derecha'], ['arriba', 'Desde arriba'], ['abajo', 'Desde abajo'], ['centro', 'Desde el centro']], def: 'izquierda', when: { modo: ['barrido'] } },
    { key: 'x', label: 'Punto horizontal', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, when: { modo: ['radial'] } },
    { key: 'y', label: 'Punto vertical', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, when: { modo: ['radial'] } },
    { key: 'suavidad', label: 'Suavidad del borde', type: 'range', min: 0, max: 1, step: 0.05, def: 0.25, help: 'Cuántas celdas están a medio aparecer a la vez.' },
    { key: 'irregular', label: 'Borde irregular', type: 'range', min: 0, max: 1, step: 0.05, def: 0.2, help: 'En el barrido, desde un punto y por manchas: mezcla el orden con celdas al azar.' },
    { key: 'destello', label: 'Destello al aparecer', type: 'toggle', def: false, help: 'Solo con caracteres reales: cada carácter se enciende en el color del destello antes de tomar el suyo.' },
    { key: 'colorDestello', label: 'Color del destello', type: 'color', def: '#ff5b1f', when: { destello: [true] } },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const mode = String(ctx.params.modo);
    if (mode === 'fundido') return p >= 1 ? null : { opacity: p };
    if (p >= 1) return null;
    const soft = Math.max(0.001, Number(ctx.params.suavidad) * 0.5);
    const seed = hashString(ctx.seed);
    const irr = Number(ctx.params.irregular);
    const kind: OrderKind = mode === 'barrido' ? SWEEP_ORDER[String(ctx.params.direccion)] ?? 'izquierda' : MODE_ORDER[mode] ?? 'azar';
    const orderOf = (g: CellGrid) => orderField(kind, g, seed, {
      irregular: mode === 'barrido' || mode === 'radial' || mode === 'ruido' ? irr : 0,
      cx: mode === 'radial' ? Number(ctx.params.x) : 0.5, cy: mode === 'radial' ? Number(ctx.params.y) : 0.5,
    });
    // cell c shows once p passes its threshold h: v = smooth((p·(1 + s) − h) / s), 0 at p = 0 and 1 at p = 1
    if (ctx.layer.kind === 'ascii') return { reveal: g => { const o = orderOf(g); const cols = Math.max(1, g.cols); return (c, r) => sweep(o[r * cols + c], p, soft); } };
    const flash = !!ctx.params.destello;
    const flashColor = String(ctx.params.colorDestello || '#ff5b1f');
    return {
      cells: g => {
        const o = orderOf(g);
        return i => {
          const v = sweep(o[i], p, soft);
          if (v >= 1) return null;
          // the flash: the character is lit in the flash colour while it is appearing
          return flash && v > 0.05 ? { visible: 1, color: flashColor } : { visible: v };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Escritura de terminal */

const CURSOR_COLORS: Record<string, string> = { acento: '#ff5b1f', fosforo: '#b8ffcf', hueso: '#ede6da' };

registerTemplate({
  id: 'escritura',
  name: 'Escritura de terminal',
  blurb: 'Los caracteres se escriben uno tras otro (o por palabras o líneas) con un cursor, ritmo humano y pausas en la puntuación. Al revés: se borran desde el final.',
  group: 'entrada',
  kinds: ['glyphs', 'text'],
  dur: 3,
  params: [
    { key: 'unidad', label: 'Escribe por', type: 'select', options: [['caracter', 'Carácter'], ['palabra', 'Palabra'], ['linea', 'Línea']], def: 'caracter' },
    { key: 'cursor', label: 'Cursor', type: 'toggle', def: true },
    { key: 'glifo', label: 'Forma del cursor', type: 'select', options: [['█', 'Bloque █'], ['▌', 'Barra ▌'], ['_', 'Subrayado _'], ['▏', 'Línea fina ▏']], def: '█', when: { cursor: [true] } },
    { key: 'colorCursor', label: 'Color del cursor', type: 'select', options: [['propio', 'El de los caracteres'], ['acento', 'Bermellón'], ['fosforo', 'Fósforo'], ['hueso', 'Hueso']], def: 'propio', when: { cursor: [true] }, help: 'Solo en capas de caracteres; en una capa de texto el cursor toma el color del texto.' },
    { key: 'parpadeo', label: 'Parpadeos por segundo', type: 'range', min: 0, max: 6, step: 0.5, def: 2, help: 'Cuando el texto está completo o vacío.', when: { cursor: [true] } },
    { key: 'final', label: 'Cursor al terminar', type: 'toggle', def: false, help: 'El cursor sigue ahí cuando todo está escrito.', when: { cursor: [true] } },
    { key: 'irregular', label: 'Ritmo irregular', type: 'range', min: 0, max: 1, step: 0.05, def: 0, help: 'Unas teclas tardan más que otras, como al escribir a mano.' },
    { key: 'puntuacion', label: 'Pausas en la puntuación', type: 'range', min: 0, max: 1, step: 0.05, def: 0, help: 'Se detiene después de puntos, comas y al final de cada línea.' },
    { key: 'vacios', label: 'Saltar celdas vacías', type: 'toggle', def: true, help: 'El tiempo se gasta solo en los caracteres que se ven.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const cursorOn = !!ctx.params.cursor;
    const glyph = String(ctx.params.glifo || '█');
    const hz = Number(ctx.params.parpadeo);
    const unit = String(ctx.params.unidad || 'caracter');
    const jitter = Number(ctx.params.irregular) || 0, pause = Number(ctx.params.puntuacion) || 0;
    const seed = hashString(ctx.seed);
    const done = p <= 0 || p >= 1;
    // while typing the cursor stays lit; at rest it blinks (from the clip's position: the same frames reversed)
    const lit = cursorOn && (p < 1 || !!ctx.params.final) && (!done || hz <= 0 || Math.floor(ctx.pos * hz * 2) % 2 === 0);
    if (ctx.layer.kind === 'text') {
      const T = textTyping(ctx.layer.text, unit, jitter, pause, seed);
      const k = typedCount(T.at, p);
      const upTo = k ? T.ends![k - 1] : 0;
      if (upTo >= T.chars.length && !lit) return null;
      return { set: { text: T.chars.slice(0, upTo).join('') + (lit ? glyph : '') } };
    }
    if (p >= 1 && !lit) return null;
    const skip = !!ctx.params.vacios;
    const color = CURSOR_COLORS[String(ctx.params.colorCursor)];
    return {
      glyphs: glyph,
      cells: g => {
        const T = gridTyping(g, unit, skip, jitter, pause, seed);
        const n = T.at.length;
        const k = typedCount(T.at, p);
        // the cursor sits on the next unit to type (after the last one once everything is typed)
        const cells = Math.max(1, g.cols * g.rows);
        const at = k < n ? T.first![k] : n ? Math.min(cells - 1, T.last![n - 1] + 1) : 0;
        const unitOf = T.unitOf!;
        return i => {
          if (lit && i === at) return color ? { visible: 1, glyph, color } : { visible: 1, glyph };
          const u = unitOf[i];
          if (u < 0) return skip ? null : { visible: 0 };
          return u < k ? null : { visible: 0 };
        };
      },
    };
  },
});
