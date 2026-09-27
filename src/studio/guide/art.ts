import { paintLandscape } from '../../shared/sample';
import type { PathId } from './paths';

/**
 * The small pictures of the welcome choices: plain text art made once with Canvas 2D (no engine,
 * no network), so the dialog opens instantly even on a slow device.
 */
const COLS = 34, ROWS = 12;
/** Character cells are about 1.65 times taller than wide at line-height 1. */
const CELL = 1.65;

function ascii(draw: (x: CanvasRenderingContext2D) => void, ramp: string): string {
  const c = document.createElement('canvas');
  c.width = COLS; c.height = ROWS;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return '';
  x.fillStyle = '#000';
  x.fillRect(0, 0, COLS, ROWS);
  draw(x);
  const d = x.getImageData(0, 0, COLS, ROWS).data;
  let out = '';
  for (let y = 0; y < ROWS; y++) {
    for (let i = 0; i < COLS; i++) {
      const k = (y * COLS + i) * 4;
      const l = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255;
      out += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
    }
    if (y < ROWS - 1) out += '\n';
  }
  return out;
}

function photo() {
  // the sample landscape (960×600) across the full width; one pixel per cell, so the height is
  // divided by the cell's proportion (and centred, cropping a little)
  return ascii(x => {
    const sx = COLS / 960, sy = sx / CELL;
    x.translate(0, (ROWS - 600 * sy) / 2);
    x.scale(sx, sy);
    paintLandscape(x);
  }, ' .:-=+*#%@');
}

function field() {
  let out = '';
  const ramp = ' ..·:;+';
  for (let y = 0; y < ROWS; y++) {
    for (let i = 0; i < COLS; i++) {
      // a calm interference field, with a clear band where a page's content would sit
      const u = i / COLS, v = (y * CELL) / COLS;
      let f = 0.5 + 0.25 * Math.sin(u * 9 + Math.sin(v * 7) * 1.6) + 0.25 * Math.cos(v * 11 - u * 4);
      const band = y >= 4 && y <= 7 && i >= 5 && i <= COLS - 6;
      if (band) f *= 0.12;
      out += ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(f * ramp.length)))];
    }
    if (y < ROWS - 1) out += '\n';
  }
  // the «content» over the background
  const lines = out.split('\n');
  const put = (row: number, text: string) => {
    const l = lines[row], at = Math.floor((COLS - text.length) / 2);
    lines[row] = l.slice(0, at) + text + l.slice(at + text.length);
  };
  put(5, 'Tu titular');
  put(6, '[ botón ]');
  return lines.join('\n');
}

function word() {
  const family = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  return ascii(x => {
    // drawn in square units (cells are CELL times taller), as wide as the art allows
    x.scale(1, 1 / CELL);
    x.font = `900 20px ${family}`;
    const size = Math.min(ROWS * CELL * 0.8, (20 * COLS * 0.94) / Math.max(1, x.measureText('HOLA').width));
    x.font = `900 ${size.toFixed(1)}px ${family}`;
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    // centre the letters themselves (fonts differ in where their em box sits)
    const m = x.measureText('HOLA');
    const up = m.actualBoundingBoxAscent || size * 0.72, down = m.actualBoundingBoxDescent || 0;
    x.fillText('HOLA', COLS / 2, (ROWS * CELL + up - down) / 2);
  }, ' .:=+#@');
}

const memo = new Map<PathId, string>();

export function choiceArt(id: PathId): string {
  let s = memo.get(id);
  if (s === undefined) {
    try { s = id === 'foto' ? photo() : id === 'fondo' ? field() : word(); } catch { s = ''; }
    memo.set(id, s);
  }
  return s;
}
