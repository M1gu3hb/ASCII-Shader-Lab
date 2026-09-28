// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Letras de bloque — rótulos con dos tipografías de mapa de bits incluidas («grande», 5×5, y
 * «compacta», 3×5), con tildes y eñe. Salen idénticos en cualquier equipo: en la web, en tu CLI de
 * Node (no necesitan <canvas>), en un README o en un comentario de código.
 * Monotrama · sin dependencias.
 *
 *   blockText('HOLA, MUNDO', { font: 'grande', style: 'sombra' });   // → texto de varias líneas
 *   blockBanner(document.querySelector('.rotulo'), 'HOLA');           // en la página, accesible
 */
export const blockTextDefaults = {
  font: 'grande',           // 'grande' (5×5) | 'compacta' (3×5)
  style: 'bloques',         // 'bloques' █ | 'sombra' █▒ | 'medios' ▀▄ (la mitad de alto) | 'almohadilla' # | 'puntos' •
  gap: 1,                   // columnas entre letras
  // sólo blockBanner: fontFamily (CSS; por omisión una monoespaciada, '' = la de tu página) y lineHeight (1.1)
};

// '#' lit, '.' empty; five rows each. Letters without a glyph fall back to their unaccented base or '?'.
const GRANDE = {
  A: '.###.|#...#|#####|#...#|#...#', B: '####.|#...#|####.|#...#|####.', C: '.####|#....|#....|#....|.####', D: '####.|#...#|#...#|#...#|####.',
  E: '#####|#....|####.|#....|#####', F: '#####|#....|####.|#....|#....', G: '.####|#....|#..##|#...#|.####', H: '#...#|#...#|#####|#...#|#...#',
  I: '###|.#.|.#.|.#.|###', J: '....#|....#|....#|#...#|.###.', K: '#...#|#..#.|###..|#..#.|#...#', L: '#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#', O: '.###.|#...#|#...#|#...#|.###.', P: '####.|#...#|####.|#....|#....',
  Q: '.###.|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|####.|#..#.|#...#', S: '.####|#....|.###.|....#|####.', T: '#####|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#.#.#|##.##|#...#', X: '#...#|.#.#.|..#..|.#.#.|#...#',
  Y: '#...#|.#.#.|..#..|..#..|..#..', Z: '#####|...#.|..#..|.#...|#####',
  0: '.###.|#..##|#.#.#|##..#|.###.', 1: '.#.|##.|.#.|.#.|###', 2: '####.|....#|.###.|#....|#####', 3: '####.|....#|.###.|....#|####.',
  4: '#...#|#...#|#####|....#|....#', 5: '#####|#....|####.|....#|####.', 6: '.###.|#....|####.|#...#|.###.', 7: '#####|....#|...#.|..#..|..#..',
  8: '.###.|#...#|.###.|#...#|.###.', 9: '.###.|#...#|.####|....#|.###.',
  ' ': '...|...|...|...|...', '.': '.|.|.|.|#', ',': '..|..|..|.#|#.', '!': '#|#|#|.|#', '¡': '#|.|#|#|#', '?': '####.|....#|..##.|.....|..#..',
  '¿': '..#..|.....|.##..|#....|.####', '-': '....|....|####|....|....', ':': '.|#|.|#|.', ';': '..|.#|..|.#|#.', "'": '#|#|.|.|.', '"': '#.#|#.#|...|...|...',
  '/': '....#|...#.|..#..|.#...|#....', '&': '.##..|#..#.|.##.#|#..#.|.##.#', '+': '.....|..#..|.###.|..#..|.....', '=': '....|####|....|####|....',
  '(': '.#|#.|#.|#.|.#', ')': '#.|.#|.#|.#|#.', '@': '.###.|#.###|#.#.#|#.###|.##..', '#': '.#.#.|#####|.#.#.|#####|.#.#.', '*': '#.#.#|.###.|#####|.###.|#.#.#',
  '_': '....|....|....|....|####', '<': '..#|.#.|#..|.#.|..#', '>': '#..|.#.|..#|.#.|#..',
};
const COMPACTA = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#', I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#', N: '##.|#.#|#.#|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#.#|#.#|###|###|#.#', X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.', 4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.',
  6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.', 8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
  ' ': '..|..|..|..|..', '.': '.|.|.|.|#', ',': '..|..|..|.#|#.', '!': '#|#|#|.|#', '¡': '#|.|#|#|#', '?': '##.|..#|.#.|...|.#.', '¿': '.#.|...|.#.|#..|.##',
  '-': '...|...|###|...|...', ':': '.|#|.|#|.', ';': '..|.#|..|.#|#.', "'": '#|#|.|.|.', '"': '#.#|#.#|...|...|...', '/': '..#|..#|.#.|#..|#..',
  '&': '.#.|#.#|.#.|#.#|.##', '+': '...|.#.|###|.#.|...', '=': '...|###|...|###|...', '(': '.#|#.|#.|#.|.#', ')': '#.|.#|.#|.#|#.',
  '@': '.#.|#.#|###|#..|.##', '#': '#.#|###|#.#|###|#.#', '*': '#.#|.#.|###|.#.|#.#', '_': '...|...|...|...|###', '<': '..#|.#.|#..|.#.|..#', '>': '#..|.#.|..#|.#.|#..',
};
const FONTS = { grande: GRANDE, compacta: COMPACTA };
/** Marks above a letter (a sixth row, drawn only when the text has one). */
const MARKS = { 'Á': ['A', "'"], 'É': ['E', "'"], 'Í': ['I', "'"], 'Ó': ['O', "'"], 'Ú': ['U', "'"], 'Ü': ['U', '"'], 'Ñ': ['N', '~'], 'Ç': ['C', ''] };

function glyphOf(font, ch) {
  const f = FONTS[font] ?? GRANDE;
  const up = ch.toUpperCase();
  let mark = '';
  let base = up;
  if (MARKS[up]) [base, mark] = MARKS[up];
  else if (!f[up]) base = up.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rows = (f[base] ?? f['?']).split('|');
  const w = rows[0].length;
  let top = '.'.repeat(w);
  if (mark) {
    const mid = Math.floor(w / 2);
    const put = (s, i) => s.slice(0, i) + '#' + s.slice(i + 1);
    if (mark === "'") top = put(top, Math.min(w - 1, mid + (w > 3 ? 1 : 0)));
    else if (mark === '"') { top = put(top, 0); top = put(top, w - 1); }
    else if (mark === '~') top = w > 3 ? '.##.#'.slice(0, w).padEnd(w, '.') : '###';
  }
  return { rows, top, mark: !!mark && mark !== '' };
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** The text as block letters (one string of lines, no trailing spaces). */
export function blockText(text, options = {}) {
  const o = { ...blockTextDefaults, ...options };
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const gs = Array.from(line).map(ch => glyphOf(o.font, ch));
    if (!gs.length) { out.push(''); continue; }
    const withTop = gs.some(g => g.mark);
    const H = withTop ? 6 : 5;
    const grid = Array.from({ length: H }, () => '');
    gs.forEach((g, i) => {
      const sp = i ? '.'.repeat(o.gap) : '';
      if (withTop) grid[0] += sp + g.top;
      for (let r = 0; r < 5; r++) grid[r + (withTop ? 1 : 0)] += sp + g.rows[r];
    });
    out.push(...render(grid, o.style));
  }
  return out.map(l => l.replace(/\s+$/, '')).join('\n');
}

function render(grid, style) {
  const on = (r, c) => grid[r]?.[c] === '#';
  if (style === 'medios') {
    const rows = [];
    for (let r = 0; r < grid.length; r += 2) {
      let s = '';
      for (let c = 0; c < grid[r].length; c++) {
        const a = on(r, c), b = on(r + 1, c);
        s += a && b ? '█' : a ? '▀' : b ? '▄' : ' ';
      }
      rows.push(s);
    }
    return rows;
  }
  if (style === 'sombra') {
    const H = grid.length + 1, W = grid[0].length + 1, rows = [];
    for (let r = 0; r < H; r++) {
      let s = '';
      for (let c = 0; c < W; c++) s += on(r, c) ? '█' : on(r - 1, c - 1) ? '▒' : ' ';
      rows.push(s);
    }
    return rows;
  }
  const ink = style === 'almohadilla' ? '#' : style === 'puntos' ? '•' : '█';
  return grid.map(row => Array.from(row, ch => (ch === '#' ? ink : ' ')).join(''));
}

/** Puts a block-letter sign in an element: shown as art, read as its words. */
export function blockBanner(el, text, options = {}) {
  const prev = { label: el.getAttribute('aria-label'), role: el.getAttribute('role'), text: el.textContent, css: el.style.cssText };
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', String(text));
  el.style.whiteSpace = 'pre';
  // the blocks only line up in a monospaced face, with rows that touch ('' keeps your page's)
  const family = options.fontFamily ?? MONO;
  if (family) el.style.fontFamily = family;
  el.style.lineHeight = String(options.lineHeight ?? 1.1);
  el.textContent = blockText(text, options);
  return {
    update(t, o = options) { el.setAttribute('aria-label', String(t)); el.textContent = blockText(t, o); },
    destroy() {
      el.textContent = prev.text;
      el.style.cssText = prev.css;
      if (prev.role === null) el.removeAttribute('role'); else el.setAttribute('role', prev.role);
      if (prev.label === null) el.removeAttribute('aria-label'); else el.setAttribute('aria-label', prev.label);
    },
  };
}
