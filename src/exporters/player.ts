/**
 * Text animations for the web: frames of real characters with their colours, played by a tiny script (no
 * dependencies, no requests). The characters are text in a <pre> (selectable, read by screen readers as one
 * picture with a name), so this is only for pieces made of real characters: a shader ASCII render or a photo
 * is a picture and goes out as video/GIF instead.
 *
 *   packFrames     palette + colour runs per row, identical frames stored once
 *   toWebPlayer    a snippet to paste into a page: <div> + <script> (the MIT-0 line on top)
 *   toPlayerPage   the same player as a standalone HTML page
 *
 * The player measures the font it gets and spaces the characters so every column is one cell wide (the
 * site's font may not be the studio's), scales the piece down to its container, pauses when off screen or in a
 * hidden tab, and with «reduce motion» shows the last frame still (a click or Enter/Space plays it).
 */
import { LICENSE_LINE, charWidth } from './text';

export interface ColorFrame {
  /** Row-major characters (' ' = empty) and the colour of each cell (0xrrggbb). */
  chars: readonly string[];
  colors: ArrayLike<number>;
  /** Strength of each cell 0..1 (cells under `hide` are left empty, as the text exports do). */
  alpha?: ArrayLike<number>;
}

export interface ColorFrames {
  cols: number;
  rows: number;
  fps: number;
  frames: ColorFrame[];
  loop: boolean;
}

export interface PlayerLook {
  title: string;
  /** Page / piece background (null = transparent in the snippet). */
  bg: string | null;
  /** Cell size in px (the piece's own) and the CSS font stack. */
  cw: number;
  ch: number;
  font: string;
  weight?: number;
}

export interface Packed {
  w: number;
  h: number;
  fps: number;
  loop: boolean;
  /** Colours used ('#rrggbb'). */
  pal: string[];
  /** Unique frames: per row, [colourIndex, text, colourIndex, text…] (−1 = no colour: spaces). */
  f: Array<Array<Array<number | string>>>;
  /** Frame order (indices into f). */
  o: number[];
}

/** Cells this faint are empty (as in gridToText: alpha ≤ 40 of 255). */
const faint = (a: number) => !(Math.round(Math.min(1, Math.max(0, a)) * 255) > 40);

const hex = (v: number) => '#' + (v & 0xffffff).toString(16).padStart(6, '0');

/** Palette, runs and unique frames (see Packed). */
export function packFrames(f: ColorFrames): Packed {
  const pal: string[] = [];
  const palIdx = new Map<number, number>();
  const uniq = new Map<string, number>();
  const frames: Packed['f'] = [];
  const order: number[] = [];
  for (const fr of f.frames) {
    const rows: Array<Array<number | string>> = [];
    for (let y = 0; y < f.rows; y++) {
      const runs: Array<number | string> = [];
      let cur = -2, text = '';
      const flush = () => { if (text) { runs.push(cur, text); } text = ''; };
      for (let x = 0; x < f.cols; x++) {
        const i = y * f.cols + x;
        let ch = fr.chars[i] ?? ' ';
        if (fr.alpha && faint(fr.alpha[i] ?? 0)) ch = ' ';
        const w = charWidth(ch);
        if (w === 0) ch = ' ';
        let k = -1;
        if (ch !== ' ') {
          const c = (fr.colors[i] ?? 0) & 0xffffff;
          let p = palIdx.get(c);
          if (p === undefined) { p = pal.length; pal.push(hex(c)); palIdx.set(c, p); }
          k = p;
        }
        // a space joins whatever run it is in
        if (k === -1 && cur !== -2) { text += ' '; }
        else if (k !== cur) { flush(); cur = k; text = ch; }
        else text += ch;
        // a double-width character takes this cell and the next one (as a terminal shows it)
        if (w === 2) x++;
      }
      // trailing spaces add nothing
      if (text) { const t = text.replace(/ +$/, ''); if (t) runs.push(cur, t); }
      rows.push(runs);
    }
    const key = JSON.stringify(rows);
    let idx = uniq.get(key);
    if (idx === undefined) { idx = frames.length; frames.push(rows); uniq.set(key, idx); }
    order.push(idx);
  }
  return { w: f.cols, h: f.rows, fps: f.fps, loop: f.loop, pal, f: frames, o: order };
}

/** The plain text of one packed frame (what the player shows, without colours): tests and the README. */
export function packedText(p: Packed, k: number): string {
  return p.f[p.o[k]].map(row => row.filter((_, j) => j % 2 === 1).join('')).join('\n');
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inComment = (s: string) => s.replace(/-{2,}/g, '–').replace(/[<>]/g, '').replace(/[\r\n\u2028\u2029]+/g, ' ');

/** The player script for element #id (ES2017, no dependencies). */
function script(id: string, p: Packed, look: PlayerLook): string {
  const cfg = { cw: +look.cw.toFixed(3), ch: +look.ch.toFixed(3), font: look.font, weight: look.weight ?? 400 };
  return `(function () {
  var D = ${json(p)}, L = ${json(cfg)};
  var root = document.getElementById(${json(id)});
  if (!root) return;
  var pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;padding:0;white-space:pre;overflow:visible;transform-origin:0 0;font-kerning:none;font-variant-ligatures:none;' +
    'font-family:' + L.font + ';font-weight:' + L.weight + ';line-height:' + L.ch + 'px;font-size:' + Math.min(L.ch * 0.9, L.cw / 0.6).toFixed(2) + 'px';
  root.style.overflow = 'hidden';
  root.appendChild(pre);
  // every column one cell wide, whatever font this page has
  var probe = document.createElement('span');
  probe.textContent = '0000000000';
  pre.appendChild(probe);
  var adv = probe.getBoundingClientRect().width / 10 || L.cw;
  pre.removeChild(probe);
  pre.style.letterSpacing = (L.cw - adv).toFixed(3) + 'px';
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var html = [];
  var frame = function (k) {
    var u = D.o[k];
    if (html[u] === undefined) html[u] = D.f[u].map(function (row) {
      var s = '';
      for (var j = 0; j < row.length; j += 2) s += row[j] < 0 ? esc(row[j + 1]) : '<span style="color:' + D.pal[row[j]] + '">' + esc(row[j + 1]) + '</span>';
      return s;
    }).join('\\n');
    return html[u];
  };
  var W = D.w * L.cw, H = D.h * L.ch;
  var fit = function () {
    var k = Math.min(1, (root.clientWidth || W) / W);
    pre.style.transform = k < 1 ? 'scale(' + k + ')' : '';
    root.style.height = Math.ceil(H * k) + 'px';
  };
  fit();
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(root); else window.addEventListener('resize', fit);
  var n = D.o.length, i = 0, last = 0, raf = 0, seen = true;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var playing = n > 1 && !still;
  var show = function () { pre.innerHTML = frame(i); };
  var tick = function (ts) {
    raf = 0;
    if (!playing || !seen || document.hidden) return;
    if (!last) last = ts;
    var step = 1000 / D.fps, k = Math.floor((ts - last) / step);
    if (k > 0) {
      last += k * step;
      i += k;
      if (i >= n) {
        if (D.loop) i %= n;
        else { i = n - 1; playing = false; }
      }
      show();
    }
    if (playing) raf = requestAnimationFrame(tick);
  };
  var go = function () { if (playing && !raf) { last = 0; raf = requestAnimationFrame(tick); } };
  var toggle = function () {
    if (n < 2) return;
    if (!playing && i >= n - 1 && !D.loop) i = 0;
    playing = !playing;
    root.setAttribute('aria-pressed', String(playing));
    if (playing) go();
  };
  root.tabIndex = 0;
  root.setAttribute('role', 'button');
  root.setAttribute('aria-pressed', String(playing));
  root.addEventListener('click', toggle);
  root.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  document.addEventListener('visibilitychange', go);
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(function (es) { seen = es[0].isIntersecting; go(); }).observe(root);
  // with reduced motion, the finished piece (the last frame) stays still
  if (still) i = n - 1;
  show();
  go();
})();`;
}

/** An id for the player's element, stable for the same piece (two players can share a page). */
function playerId(title: string, p: Packed): string {
  let h = 0x811c9dc5;
  const s = title + '|' + p.w + 'x' + p.h + '|' + p.o.length;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return 'glyphos-' + (h >>> 0).toString(36);
}

/**
 * A snippet for a web page: the piece's element and its player. Paste it where the piece goes; it takes the
 * width of its container (never larger than its own size) and keeps its proportion.
 */
export function toWebPlayer(f: ColorFrames, look: PlayerLook): string {
  const p = packFrames(f);
  const id = playerId(look.title, p);
  const label = `${look.title} · arte en texto animado, ${p.o.length} cuadros. Clic o Intro para pausar.`;
  return `<!-- ${inComment(LICENSE_LINE)} -->
<!-- ${inComment(look.title)} · ${f.cols}×${f.rows} caracteres · ${p.o.length} cuadros a ${f.fps} fps · texto real (se puede seleccionar) -->
<div id="${id}" class="glyphos-texto" aria-label="${attr(label)}" style="max-width:${Math.ceil(f.cols * look.cw)}px;${look.bg ? `background:${attr(look.bg)};` : ''}cursor:pointer"></div>
<script>
${script(id, p, look).replace(/<\/(script)/gi, '<\\/$1')}
</script>
`;
}

/** A standalone page with the player, centred on the piece's background. */
export function toPlayerPage(f: ColorFrames, look: PlayerLook): string {
  const bg = look.bg ?? '#0c0b0a';
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(look.title)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:${attr(bg)}">
<main style="width:min(100%, ${Math.ceil(f.cols * look.cw)}px);padding:16px;box-sizing:border-box">
${toWebPlayer(f, { ...look, bg })}</main>
</body>
</html>
`;
}
