/**
 * Text exporters. They work from a GridSnapshot (the exact characters and colours the GPU chose),
 * so what you export is what you saw.
 */
import type { GridSnapshot } from '../engine/engine';
import { hexToRgb } from '../engine/color';

export type ColorDepth = 'none' | '16' | '256' | 'truecolor';

const ESC = '\x1b[';
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** One-line licence header of exported code (MIT-0), per comment syntax. */
export const LICENSE_LINE = 'Hecho con GLYPHOS · https://glyphos-ascii.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.';

/* ---------- display width (what a terminal does with each character) ---------- */

const WIDE: Array<[number, number]> = [
  [0x1100, 0x115f], [0x2329, 0x232a], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
];

/** Terminal columns taken by one character: 0 (controls, combining marks), 2 (CJK, fullwidth, emoji) or 1. */
export function charWidth(c: string): number {
  const cp = c.codePointAt(0) ?? 32;
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp < 0x300) return 1;
  if (/^[\p{Mn}\p{Me}\p{Cf}]$/u.test(c)) return 0;
  if (/^\p{Emoji_Presentation}$/u.test(c)) return 2;
  for (const [a, b] of WIDE) if (cp >= a && cp <= b) return 2;
  return 1;
}

export const textWidth = (s: string) => Array.from(s.replace(ANSI_RE, '')).reduce((n, c) => n + charWidth(c), 0);

/**
 * The cells of one row as a terminal will show them: a double-width glyph uses its cell and the next
 * one (whose glyph is dropped), so every row keeps exactly `cols` columns; zero-width ones become spaces.
 */
function rowCells(g: GridSnapshot, y: number, hideFaint = true): Array<{ ch: string; i: number }> {
  const out: Array<{ ch: string; i: number }> = [];
  for (let x = 0; x < g.cols; x++) {
    const i = y * g.cols + x;
    let ch = !hideFaint || g.alpha[i] > 40 ? g.chars[i] : ' ';
    const w = charWidth(ch);
    if (w === 0) ch = ' ';
    else if (w === 2) {
      if (x === g.cols - 1) ch = ' ';
      else { out.push({ ch, i }); x++; continue; }
    }
    out.push({ ch, i });
  }
  return out;
}

export function gridLines(g: GridSnapshot, opts: { trim?: boolean; hideFaint?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    const s = rowCells(g, y, !!opts.hideFaint).map(c => c.ch).join('');
    lines.push(opts.trim === false ? s : s.replace(/\s+$/, ''));
  }
  return lines;
}

export function gridToText(g: GridSnapshot): string {
  return gridLines(g, { hideFaint: true }).join('\n') + '\n';
}

/* ---------- colour quantisation ---------- */

const CUBE = [0, 95, 135, 175, 215, 255];
function to256(r: number, g: number, b: number): number {
  const q = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  const cr = q(r), cg = q(g), cb = q(b);
  const cube = 16 + 36 * cr + 6 * cg + cb;
  const dc = (CUBE[cr] - r) ** 2 + (CUBE[cg] - g) ** 2 + (CUBE[cb] - b) ** 2;
  const avg = (r + g + b) / 3;
  const gi = avg > 238 ? 23 : Math.max(0, Math.round((avg - 8) / 10));
  const gv = 8 + gi * 10;
  const dg = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return dg < dc ? 232 + gi : cube;
}

const ANSI16: Array<[number, number, number]> = [
  [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0], [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
  [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
];
function to16(r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  ANSI16.forEach(([R, G, B], i) => { const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

function fgCode(depth: ColorDepth, r: number, g: number, b: number): string {
  if (depth === 'truecolor') return `${ESC}38;2;${r};${g};${b}m`;
  if (depth === '256') return `${ESC}38;5;${to256(r, g, b)}m`;
  if (depth === '16') { const c = to16(r, g, b); return `${ESC}${c < 8 ? 30 + c : 90 + c - 8}m`; }
  return '';
}
function bgCode(depth: ColorDepth, r: number, g: number, b: number): string {
  if (depth === 'truecolor') return `${ESC}48;2;${r};${g};${b}m`;
  if (depth === '256') return `${ESC}48;5;${to256(r, g, b)}m`;
  if (depth === '16') { const c = to16(r, g, b); return `${ESC}${c < 8 ? 40 + c : 100 + c - 8}m`; }
  return '';
}

/**
 * ANSI art. Colour codes are only emitted when the colour changes, which keeps files small.
 * withBg paints the piece's background colour behind every cell (otherwise the terminal's own background shows).
 * Every line ends with a reset, so nothing bleeds into the next prompt.
 */
export function gridToAnsi(g: GridSnapshot, depth: ColorDepth, withBg = true): string {
  if (depth === 'none') return gridToText(g);
  const [br, bg_, bb] = hexToRgb(g.bg).map(v => Math.round(v * 255));
  const bgc = withBg ? bgCode(depth, br, bg_, bb) : '';
  const out: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    let line = bgc, last = '';
    for (const { ch, i } of rowCells(g, y)) {
      if (ch !== ' ') {
        const f = fgCode(depth, g.rgb[i * 3], g.rgb[i * 3 + 1], g.rgb[i * 3 + 2]);
        if (f !== last) { line += f; last = f; }
      }
      line += ch;
    }
    out.push(line + `${ESC}0m`);
  }
  return out.join('\n') + '\n';
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Coloured <pre> block: runs of the same colour share one <span>. */
export function gridToHtml(g: GridSnapshot, font = 'ui-monospace, Menlo, Consolas, monospace'): string {
  const rows: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    let row = '', run = '', col = '';
    const flush = () => { if (run) row += col ? `<span style="color:${col}">${escHtml(run)}</span>` : escHtml(run); run = ''; };
    for (const { ch, i } of rowCells(g, y)) {
      const c = ch === ' ' ? col : '#' + [0, 1, 2].map(k => g.rgb[i * 3 + k].toString(16).padStart(2, '0')).join('');
      if (c !== col) { flush(); col = c; }
      run += ch;
    }
    flush();
    rows.push(row.replace(/\s+$/, ''));
  }
  // the newline after <pre> is eaten by the HTML parser, so an empty first row survives
  return `<pre style="margin:0;padding:1em;background:${g.bg};font:12px/1.15 ${font};letter-spacing:0;overflow:auto" aria-label="Arte ASCII">\n${rows.join('\n')}</pre>`;
}

/** A standalone page with the coloured block (the title is escaped: piece names come from shared links). */
export function gridToHtmlPage(g: GridSnapshot, title: string): string {
  return `<!doctype html>\n<html lang="es">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escHtml(title)}</title>\n<body style="margin:0;background:${g.bg}">${gridToHtml(g)}</body>\n</html>\n`;
}

/* ---------- animations for the terminal ---------- */

export interface Frames { cols: number; rows: number; fps: number; frames: string[] }

/** Pads every line to the full width, so a frame always covers what the previous one left on screen. */
function fullWidth(f: Frames): string[] {
  return f.frames.map(fr => fr.split('\n').map(l => {
    const w = textWidth(l);
    return w < f.cols ? l + ' '.repeat(f.cols - w) : l;
  }).join('\n'));
}
/**
 * Text that stays inside a one-line comment (piece names come from shared links): control characters and
 * U+2028/U+2029, which end a line in JavaScript, become spaces.
 */
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ');

/** asciinema v2 recording (.cast): plays with `asciinema play` or the web player. */
export function toAsciicast(f: Frames, title: string): string {
  const header = JSON.stringify({ version: 2, width: f.cols, height: f.rows, timestamp: Math.floor(Date.now() / 1000), title, env: { TERM: 'xterm-256color' } });
  const lines = [header, JSON.stringify([0, 'o', `${ESC}?25l${ESC}2J`])];
  fullWidth(f).forEach((fr, i) => lines.push(JSON.stringify([+(0.001 + i / f.fps).toFixed(4), 'o', `${ESC}H` + fr.replace(/\n/g, '\r\n')])));
  // no trailing newline: on the last row it would scroll the final frame up by one line
  lines.push(JSON.stringify([+(f.frames.length / f.fps).toFixed(4), 'o', `${ESC}0m${ESC}?25h`]));
  return lines.join('\n') + '\n';
}

async function gzipBase64(text: string): Promise<string> {
  const s = new Blob([new TextEncoder().encode(text) as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(s).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Self-contained Node.js player (Node 18+, no dependencies): `node pieza.mjs`.
 * In a terminal it loops in the alternate screen until Ctrl+C and then restores cursor, colours and wrapping;
 * with the output redirected (file, pipe) it writes the first frame and exits.
 */
export async function toNodePlayer(f: Frames, title: string): Promise<string> {
  const data = await gzipBase64(JSON.stringify(fullWidth(f)));
  return `#!/usr/bin/env node
// ${LICENSE_LINE}
// ${oneLine(title)} · ${f.cols}×${f.rows} · ${f.frames.length} fotogramas a ${f.fps} fps
// Ejecuta: node <este-archivo>.mjs · Ctrl+C para salir · redirigido a un archivo escribe un fotograma
import { gunzipSync } from 'node:zlib';
const FPS = ${f.fps};
const frames = JSON.parse(gunzipSync(Buffer.from(${JSON.stringify(data)}, 'base64')).toString('utf8'));
const out = process.stdout;
const plain = s => (process.env.NO_COLOR ? s.replace(/\\x1b\\[[0-9;]*m/g, '') : s);
out.on('error', () => process.exit(0)); // p. ej. «| head» cerró la tubería
if (!out.isTTY) {
  out.write(plain(frames[0]) + '\\x1b[0m\\n');
} else {
  let timer = 0, i = 0;
  const restore = () => { clearInterval(timer); out.write('\\x1b[0m\\x1b[?7h\\x1b[?25h\\x1b[?1049l'); process.exit(0); };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, restore);
  out.write('\\x1b[?1049h\\x1b[?25l\\x1b[?7l\\x1b[2J');
  const draw = () => {
    const lines = frames[i].split('\\n');
    out.write('\\x1b[H' + plain(lines.slice(0, out.rows || lines.length).join('\\n')));
    i = (i + 1) % frames.length;
  };
  draw();
  timer = setInterval(draw, 1000 / FPS);
}
`;
}

/** Self-contained Python 3 player (standard library only): `python3 pieza.py`. Same behaviour as the Node one. */
export async function toPythonPlayer(f: Frames, title: string): Promise<string> {
  const data = await gzipBase64(JSON.stringify(fullWidth(f)));
  return `#!/usr/bin/env python3
# ${LICENSE_LINE}
# ${oneLine(title)} · ${f.cols}×${f.rows} · ${f.frames.length} fotogramas a ${f.fps} fps
# Ejecuta: python3 <este-archivo>.py · Ctrl+C para salir · redirigido a un archivo escribe un fotograma
import base64, gzip, json, os, re, shutil, signal, sys, time

FPS = ${f.fps}
frames = json.loads(gzip.decompress(base64.b64decode(${JSON.stringify(data)})).decode("utf-8"))
out = sys.stdout


def plain(s):
    return re.sub(r"\\x1b\\[[0-9;]*m", "", s) if os.environ.get("NO_COLOR") else s


def play():
    if not out.isatty():
        out.write(plain(frames[0]) + "\\x1b[0m\\n")
        return
    if os.name == "nt":
        os.system("")  # activa las secuencias ANSI en la consola de Windows
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    out.write("\\x1b[?1049h\\x1b[?25l\\x1b[?7l\\x1b[2J")
    try:
        i = 0
        while True:
            lines = frames[i].split("\\n")
            out.write("\\x1b[H" + plain("\\n".join(lines[: shutil.get_terminal_size().lines])))
            out.flush()
            i = (i + 1) % len(frames)
            time.sleep(1 / FPS)
    except KeyboardInterrupt:
        pass
    finally:
        out.write("\\x1b[0m\\x1b[?7h\\x1b[?25h\\x1b[?1049l")
        out.flush()


try:
    play()
except BrokenPipeError:  # p. ej. «| head» cerró la tubería
    os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
`;
}

/** Snippet for a shell greeting (.bashrc / .zshrc). Only interactive shells print it, so scp/rsync keep working. */
export function toShellBanner(text: string): string {
  const safe = text.replace(/\n+$/, '');
  // the art may hold any line (a shared piece can write text over it): a line equal to the heredoc
  // delimiter would end it early and run what follows, so pick one that no line matches
  const lines = new Set(safe.split('\n').map(l => l.trim()));
  let end = 'GLYPHOS';
  for (let i = 1; lines.has(end); i++) end = `GLYPHOS_${i}`;
  return `# ${LICENSE_LINE}
# Pega esto al final de ~/.bashrc o ~/.zshrc. Sólo se muestra en sesiones interactivas (no rompe scp ni rsync).
case $- in *i*)
cat <<'${end}'
${safe}
${end}
;; esac
`;
}

/** Snippet for a Node CLI: prints the piece with colours in a terminal, as plain text when redirected. */
export function toJsString(ansi: string): string {
  return `// ${LICENSE_LINE}
// Arte para tu CLI: con color en la terminal; redirigido a un archivo, sin códigos de color.
const banner = ${JSON.stringify(ansi)};
process.stdout.write(process.stdout.isTTY ? banner : banner.replace(/\\x1b\\[[0-9;]*m/g, ''));
`;
}

export function byteSize(s: string): string {
  const n = new Blob([s]).size;
  return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
}
