/**
 * Text exporters. They work from a GridSnapshot (the exact characters and colours the GPU chose),
 * so what you export is what you saw.
 */
import type { GridSnapshot } from '../engine/engine';
import { hexToRgb } from '../engine/color';

export type ColorDepth = 'none' | '16' | '256' | 'truecolor';

const ESC = '\x1b[';

export function gridLines(g: GridSnapshot, opts: { trim?: boolean; hideFaint?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    let s = '';
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      const visible = g.alpha[i] > 40 || !opts.hideFaint;
      s += visible ? g.chars[i] : ' ';
    }
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
 */
export function gridToAnsi(g: GridSnapshot, depth: ColorDepth, withBg = true): string {
  if (depth === 'none') return gridToText(g);
  const [br, bg_, bb] = hexToRgb(g.bg).map(v => Math.round(v * 255));
  const bgc = withBg ? bgCode(depth, br, bg_, bb) : '';
  const out: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    let line = bgc, last = '';
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      const ch = g.alpha[i] > 40 ? g.chars[i] : ' ';
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
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      const ch = g.alpha[i] > 40 ? g.chars[i] : ' ';
      const c = ch === ' ' ? col : '#' + [0, 1, 2].map(k => g.rgb[i * 3 + k].toString(16).padStart(2, '0')).join('');
      if (c !== col) { flush(); col = c; }
      run += ch;
    }
    flush();
    rows.push(row.replace(/\s+$/, ''));
  }
  return `<pre style="margin:0;padding:1em;background:${g.bg};font:12px/1.15 ${font};letter-spacing:0;overflow:auto" aria-label="Arte ASCII">${rows.join('\n')}</pre>`;
}

/* ---------- animations for the terminal ---------- */

export interface Frames { cols: number; rows: number; fps: number; frames: string[] }

/** asciinema v2 recording (.cast): plays with `asciinema play` or the web player. */
export function toAsciicast(f: Frames, title: string): string {
  const header = JSON.stringify({ version: 2, width: f.cols, height: f.rows, timestamp: Math.floor(Date.now() / 1000), title, env: { TERM: 'xterm-256color' } });
  const lines = [header, JSON.stringify([0, 'o', `${ESC}?25l${ESC}2J`])];
  f.frames.forEach((fr, i) => lines.push(JSON.stringify([+(0.001 + i / f.fps).toFixed(4), 'o', `${ESC}H` + fr.replace(/\n/g, '\r\n')])));
  lines.push(JSON.stringify([+(f.frames.length / f.fps).toFixed(4), 'o', `${ESC}0m${ESC}?25h\r\n`]));
  return lines.join('\n') + '\n';
}

async function gzipBase64(text: string): Promise<string> {
  const s = new Blob([new TextEncoder().encode(text) as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(s).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Self-contained Node.js player (no dependencies): `node pieza.mjs`. */
export async function toNodePlayer(f: Frames, title: string): Promise<string> {
  const data = await gzipBase64(JSON.stringify(f.frames));
  return `#!/usr/bin/env node
// ${title.replace(/\n/g, ' ')} — hecho con Monotrama (ASCII Shader Lab)
// Ejecuta: node ${'<este-archivo>'}.mjs   ·   Ctrl+C para salir
import { gunzipSync } from 'node:zlib';
const FPS = ${f.fps};
const frames = JSON.parse(gunzipSync(Buffer.from(${JSON.stringify(data)}, 'base64')).toString('utf8'));
const out = process.stdout;
const restore = () => { out.write('\\x1b[0m\\x1b[?25h\\x1b[?1049l'); process.exit(0); };
process.on('SIGINT', restore);
process.on('SIGTERM', restore);
out.write('\\x1b[?1049h\\x1b[?25l\\x1b[2J');
let i = 0;
setInterval(() => { out.write('\\x1b[H' + frames[i]); i = (i + 1) % frames.length; }, 1000 / FPS);
`;
}

/** Self-contained Python 3 player: `python3 pieza.py`. */
export async function toPythonPlayer(f: Frames, title: string): Promise<string> {
  const data = await gzipBase64(JSON.stringify(f.frames));
  return `#!/usr/bin/env python3
# ${title.replace(/\n/g, ' ')} — hecho con Monotrama (ASCII Shader Lab)
# Ejecuta: python3 <este-archivo>.py   ·   Ctrl+C para salir
import base64, gzip, json, sys, time
FPS = ${f.fps}
frames = json.loads(gzip.decompress(base64.b64decode(${JSON.stringify(data)})).decode("utf-8"))
out = sys.stdout
out.write("\\x1b[?1049h\\x1b[?25l\\x1b[2J")
try:
    i = 0
    while True:
        out.write("\\x1b[H" + frames[i])
        out.flush()
        i = (i + 1) % len(frames)
        time.sleep(1 / FPS)
except KeyboardInterrupt:
    pass
finally:
    out.write("\\x1b[0m\\x1b[?25h\\x1b[?1049l")
    out.flush()
`;
}

/** Snippet for a shell greeting (.bashrc / .zshrc). */
export function toShellBanner(text: string): string {
  const safe = text.replace(/\n+$/, '');
  return `# Pega esto al final de ~/.bashrc o ~/.zshrc\ncat <<'MONOTRAMA'\n${safe}\nMONOTRAMA\n`;
}

/** Snippet for a Node CLI: prints the piece with colours. */
export function toJsString(ansi: string): string {
  return `// Arte para tu CLI (Monotrama)\nconst banner = ${JSON.stringify(ansi)};\nprocess.stdout.write(banner);\n`;
}

export function byteSize(s: string): string {
  const n = new Blob([s]).size;
  return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
}
