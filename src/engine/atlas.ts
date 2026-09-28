import { EDGE_GLYPHS } from './catalog';

export interface AtlasSpec {
  charset: string;
  sort: boolean;
  stack: string;      // css font stack
  weight: number;
  italic?: boolean;
  scale: number;      // glyph scale inside the cell (already includes the font's optical fit)
  cw: number;         // cell width in device px (integer)
  ch: number;         // cell height in device px (integer)
  extras: string;     // characters needed by messages / words
  maxTex: number;
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  chars: string[];        // index → character
  cols: number;           // glyphs per atlas row
  n: number;              // number of ramp glyphs
  edgeBase: number;
  blockIdx: number;
  spaceIdx: number;
  index: Map<string, number>;
  cw: number;
  ch: number;
}

const densityCache = new Map<string, string[]>();

export function uniqueChars(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of Array.from(s)) {
    if (c === '\n' || c === '\r' || c === '\t') continue;
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

function fontString(spec: { weight: number; italic?: boolean; stack: string }, px: number) {
  return `${spec.italic ? 'italic ' : ''}${spec.weight} ${px}px ${spec.stack}`;
}

/**
 * Grows each time a web font finishes loading. A web font still on its way measures as its fallback: the
 * order measured then must not outlive the load, or the same piece picks other glyphs for the rest of the
 * page (a first visit rendered, and exported, differently from the same piece reopened later).
 */
function loadedFonts(): number {
  const set = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!set || typeof set.forEach !== 'function') return 0;
  let n = 0;
  set.forEach(f => { if (f.status === 'loaded') n++; });
  return n;
}

/** Orders characters from empty to full by measuring rendered ink coverage. Cached (per set of loaded fonts). */
export function sortByDensity(chars: string[], spec: { stack: string; weight: number; italic?: boolean }, aspect: number): string[] {
  const key = chars.join('') + '|' + spec.stack + '|' + spec.weight + '|' + (spec.italic ? 1 : 0) + '|' + aspect.toFixed(2) + '|' + loadedFonts();
  const hit = densityCache.get(key);
  if (hit) return hit;
  const G = 32, GH = Math.max(12, Math.round(G * aspect));
  const cv = document.createElement('canvas');
  cv.width = G; cv.height = GH;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const fs = Math.round(Math.min(GH * 0.82, G * 1.55));
  cx.font = fontString(spec, fs);
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = '#fff';
  const dens = chars.map(c => {
    cx.clearRect(0, 0, G, GH);
    cx.fillText(c, G / 2, GH / 2 + fs * 0.04);
    const d = cx.getImageData(0, 0, G, GH).data;
    let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i];
    return s;
  });
  const sorted = chars.map((c, i) => [c, dens[i], i] as const)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map(a => a[0]);
  densityCache.set(key, sorted);
  return sorted;
}

export function buildAtlas(spec: AtlasSpec, prev?: HTMLCanvasElement): Atlas {
  let ramp = uniqueChars(spec.charset);
  if (!ramp.length) ramp = [' ', '#'];
  if (spec.sort && ramp.length > 1) ramp = sortByDensity(ramp, spec, spec.ch / spec.cw);
  const chars = ramp.slice();
  const index = new Map<string, number>();
  ramp.forEach((c, i) => { if (!index.has(c)) index.set(c, i); });
  const edgeBase = chars.length;
  chars.push(...EDGE_GLYPHS);
  const blockIdx = chars.length; chars.push('█');
  const spaceIdx = chars.length; chars.push(' ');
  if (!index.has(' ')) index.set(' ', spaceIdx);
  if (!index.has('█')) index.set('█', blockIdx);
  for (const c of uniqueChars(spec.extras)) {
    if (!index.has(c)) { index.set(c, chars.length); chars.push(c); }
  }
  const { cw, ch } = spec;
  const cols = Math.max(1, Math.min(chars.length, Math.floor(spec.maxTex / cw), 64));
  const rows = Math.ceil(chars.length / cols);
  const cv = prev ?? document.createElement('canvas');
  cv.width = cols * cw;
  cv.height = Math.min(spec.maxTex, rows * ch);
  const cx = cv.getContext('2d')!;
  cx.clearRect(0, 0, cv.width, cv.height);
  const fs = Math.max(1, Math.min(ch * 0.82, cw * 1.55) * spec.scale);
  cx.font = fontString(spec, fs);
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = '#fff';
  chars.forEach((c, i) => {
    if (c === ' ') return;
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch;
    cx.save();
    cx.beginPath();
    cx.rect(x0, y0, cw, ch);
    cx.clip();
    if (c === '█') cx.fillRect(x0, y0, cw, ch);
    else cx.fillText(c, x0 + cw / 2, y0 + ch / 2 + fs * 0.04);
    cx.restore();
  });
  return { canvas: cv, chars, cols, n: ramp.length, edgeBase, blockIdx, spaceIdx, index, cw, ch };
}
