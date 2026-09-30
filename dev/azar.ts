/**
 * QA page of the dice: contact sheets of consecutive rolls, rolled the way the studio rolls (the base is the
 * previous result, looks already seen are passed over, the last ten results of the space are `recent`), from
 * the same fixed seed stream as scripts/azar-report.mjs, and what the renders look like in colour (measured
 * on the pixels, not on the recipe). Not part of the production build (like dev/library.html).
 *   ?espacio=arte&gen=5&n=48&sesion=0   draws one sheet on the page
 * window.mt.sheet(o) drives scripts that save the sheets (scratchpad tools).
 */
import '../src/shared/fonts.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-300.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-800.css';
import '@fontsource/ibm-plex-mono/latin-300.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import '@fontsource/martian-mono/latin-300.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import { AsciiEngine, PATTERN_GLSL, createFontLoader, defaultRecipe, patternById, rgbToOklab, type Recipe } from '../src/engine';
import * as random from '../src/random';
import { Rng, randomSeed, roll, type SpaceId } from '../src/random';
import { syntheticPhoto } from '../src/shared/sample';

const fonts = createFontLoader({ google: false });

/** The rolls of one simulated session (same stream and rules as scripts/azar-report.mjs). */
export function session(space: SpaceId, n: number, run: number, gen?: number): Array<{ r: Recipe; seed: string }> {
  const stream = new Rng(`azar-report|${space}|${run}`);
  const fresh = () => randomSeed(stream);
  const rand = () => stream.next();
  const seen = new Set<string>();
  let base = defaultRecipe();
  if (space === 'media') base.source = 'image';
  if (space === 'tipo') { base.source = 'text'; base.text.content = 'TRAMA'; }
  const recent: Recipe[] = [];
  const out: Array<{ r: Recipe; seed: string }> = [];
  for (let i = 0; i < n; i++) {
    const res = roll({ space, base, seen, fresh, rand, recent: recent.slice(-10), ...(gen ? { gen } : {}) });
    seen.add(res.fp);
    base = res.recipe;
    recent.push(res.recipe);
    out.push({ r: res.recipe, seed: res.seed });
  }
  return out;
}

export interface TileStats {
  /** mean OKLCH chroma of the lit pixels (the glyphs), and its 90th percentile */
  chroma: number; chroma90: number;
  /** share of lit pixels that are a muted warm colour (brown, khaki, beige: hue 40–115°, chroma .02–.10) */
  mutedWarm: number;
  /** share of lit pixels that are grey (chroma < .03) */
  grey: number;
  /** Hasler–Süsstrunk colourfulness of the whole tile */
  colourful: number;
  /** chroma-weighted mean hue of the lit pixels, and the background's lightness */
  hue: number; bgL: number;
  /** share of the tile the glyphs light up (far from the background), and their mean distance to it in lightness */
  coverage: number; energy: number;
}

function stats(x: CanvasRenderingContext2D, w: number, h: number): TileStats {
  const d = x.getImageData(0, 0, w, h).data;
  const step = 3;
  const px: Array<[number, number, number, number, number, number]> = [];
  for (let y = 0; y < h; y += step) for (let xx = 0; xx < w; xx += step) {
    const i = (y * w + xx) * 4;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const [L, A, B] = rgbToOklab([r, g, b]);
    px.push([L, A, B, d[i], d[i + 1], d[i + 2]]);
  }
  // background: the most common lightness (the glyphs are the pixels far from it)
  const hist = new Array(50).fill(0);
  for (const p of px) hist[Math.min(49, Math.floor(p[0] * 50))]++;
  const bgBin = hist.indexOf(Math.max(...hist));
  const bgL = (bgBin + 0.5) / 50;
  const lit = px.filter(p => Math.abs(p[0] - bgL) > 0.1);
  const cs: number[] = [];
  let warm = 0, grey = 0, sa = 0, sb = 0;
  for (const [, A, B] of lit) {
    const C = Math.hypot(A, B);
    cs.push(C);
    let hh = Math.atan2(B, A) * 180 / Math.PI; if (hh < 0) hh += 360;
    if (C < 0.03) grey++;
    else if (C < 0.1 && hh >= 40 && hh <= 115) warm++;
    sa += A; sb += B;
  }
  cs.sort((a, b) => a - b);
  let rg = 0, yb = 0, rg2 = 0, yb2 = 0;
  for (const p of px) { const a = p[3] - p[4], b2 = 0.5 * (p[3] + p[4]) - p[5]; rg += a; yb += b2; rg2 += a * a; yb2 += b2 * b2; }
  const n = px.length;
  const mrg = rg / n, myb = yb / n;
  const srg = Math.sqrt(Math.max(0, rg2 / n - mrg * mrg)), syb = Math.sqrt(Math.max(0, yb2 / n - myb * myb));
  const colourful = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
  let hue = Math.atan2(sb, sa) * 180 / Math.PI; if (hue < 0) hue += 360;
  const m = lit.length || 1;
  const energy = px.reduce((a, p) => a + Math.abs(p[0] - bgL), 0) / px.length;
  return {
    coverage: lit.length / px.length, energy,
    chroma: cs.reduce((s, v) => s + v, 0) / m, chroma90: cs[Math.floor(cs.length * 0.9)] ?? 0,
    mutedWarm: warm / m, grey: grey / m, colourful, hue, bgL,
  };
}

let engine: AsciiEngine | null = null;
/** Tiles: drawn like a 720×450 stage at pixel ratio 1, then scaled to half (a glance at the stage). */
const TW = 360, TH = 225, CSS = { width: 720, height: 450 };

async function renderTile(r: Recipe, t: number): Promise<HTMLCanvasElement> {
  if (!engine) {
    engine = new AsciiEngine(document.createElement('canvas'), r, {
      library: PATTERN_GLSL, fonts, fixedSize: { width: CSS.width, height: CSS.height, pixelRatio: 1 },
      autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true,
    });
    engine.setMedia('image', syntheticPhoto());
  }
  engine.set(r);
  await engine.ready();
  engine.renderAt(t);
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(engine.canvas, 0, 0, TW, TH);
  return c;
}

export interface SheetOpts { space: SpaceId; gen?: number; n?: number; run?: number; cols?: number; t?: number; title?: string }

async function sheet(o: SheetOpts): Promise<{ url: string; stats: TileStats[]; items: Array<{ seed: string; arch: string; lead: string; gen: number }> }> {
  const n = o.n ?? 48, cols = o.cols ?? 6, t = o.t ?? 3;
  const list = session(o.space, n, o.run ?? 0, o.gen);
  const rows = Math.ceil(n / cols), LBL = 18, GAP = 4, HEAD = 30;
  const out = document.createElement('canvas');
  out.width = cols * (TW + GAP) + GAP;
  out.height = HEAD + rows * (TH + LBL + GAP) + GAP;
  const x = out.getContext('2d')!;
  x.fillStyle = '#161412'; x.fillRect(0, 0, out.width, out.height);
  x.fillStyle = '#ede6da'; x.font = '600 16px "JetBrains Mono", monospace'; x.textBaseline = 'middle';
  x.fillText(o.title ?? `${o.space} · generador v${list[0]?.r.meta.gen} · ${n} tiradas seguidas (sesión ${o.run ?? 0})`, 8, HEAD / 2);
  const st: TileStats[] = [];
  const items: Array<{ seed: string; arch: string; lead: string; gen: number }> = [];
  for (let i = 0; i < list.length; i++) {
    const { r, seed } = list[i];
    const tile = await renderTile(r, t);
    st.push(stats(tile.getContext('2d')!, TW, TH));
    const cx = GAP + (i % cols) * (TW + GAP), cy = HEAD + Math.floor(i / cols) * (TH + LBL + GAP);
    x.drawImage(tile, cx, cy);
    x.fillStyle = '#a39c90'; x.font = '500 11px "JetBrains Mono", monospace';
    const lead = r.source === 'pattern' || r.source === 'text' || r.source === 'image' ? patternById(r.layers[0].pattern).id : r.source;
    x.fillText(`${i + 1}. ${r.meta.arch} · ${lead}${r.layers.length > 1 ? '+' + (r.layers.length - 1) : ''}`, cx + 2, cy + TH + LBL / 2);
    items.push({ seed, arch: r.meta.arch ?? '', lead, gen: r.meta.gen ?? 0 });
  }
  return { url: out.toDataURL('image/jpeg', 0.86), stats: st, items };
}

/** One recipe drawn as a tile, with its colour measures (for experiments from a script). */
async function tile(r: Recipe, t = 3): Promise<{ url: string; stats: TileStats }> {
  const c = await renderTile(r, t);
  return { url: c.toDataURL('image/jpeg', 0.85), stats: stats(c.getContext('2d')!, TW, TH) };
}

/** Swatches of every palette family of version 5 (after tune5), `n` draws each: background, then the stops. */
function paletteSheet(n = 14): string {
  const fams = Object.keys(random.PALETTE5_NAMES) as random.Palette5Style[];
  const W = 120, H = 56, LBL = 170;
  const c = document.createElement('canvas');
  c.width = LBL + n * (W + 6); c.height = fams.length * (H + 8) + 8;
  const x = c.getContext('2d')!;
  x.fillStyle = '#161412'; x.fillRect(0, 0, c.width, c.height);
  x.font = '500 13px "JetBrains Mono", monospace'; x.textBaseline = 'middle';
  fams.forEach((f, j) => {
    const y = 8 + j * (H + 8);
    x.fillStyle = '#ede6da'; x.fillText(random.PALETTE5_NAMES[f], 8, y + H / 2);
    for (let i = 0; i < n; i++) {
      const p = random.tune5(random.makePalette5(f, new Rng(`muestra|${f}|${i}`)));
      const x0 = LBL + i * (W + 6);
      x.fillStyle = p.bg; x.fillRect(x0, y, W, H);
      const sw = (W - 16) / p.stops.length;
      p.stops.forEach((s, k) => { x.fillStyle = s; x.fillRect(x0 + 8 + k * sw, y + 12, sw - 2, H - 24); });
    }
  });
  return c.toDataURL('image/png');
}

const api = { sheet, session, tile, random, defaultRecipe, paletteSheet };
(window as unknown as { mt: typeof api }).mt = api;

const q = new URLSearchParams(location.search);
if (q.get('espacio')) {
  void sheet({ space: q.get('espacio') as SpaceId, gen: Number(q.get('gen')) || undefined, n: Number(q.get('n')) || 48, run: Number(q.get('sesion')) || 0 }).then(s => {
    const img = new Image(); img.src = s.url; document.getElementById('main')!.append(img);
  });
}
