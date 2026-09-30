/**
 * The loops of «Qué puedes hacer» (src/landing/guias-data.ts), rendered frame by frame with the real engine
 * at 720 × 450 (twice the largest size the cards show them at). Driven by scripts/ejemplos.mjs, which
 * encodes the frames; open /dev/ejemplos.html?ver in the dev server to look at a few frames of each, and
 * /dev/ejemplos.html?ver&candidatos to compare the candidates of one guide (&id=texto).
 */
import '../src/shared/fonts.css';
import '../src/landing/fonts';
import { AsciiEngine } from '../src/engine/engine';
import { createFontLoader } from '../src/engine/fonts';
import { PATTERN_GLSL } from '../src/engine/glsl/patterns';
import type { Recipe } from '../src/engine/recipe';
import { GUIDE_MEDIA_PX } from '../src/landing/guias-data';
import { PRESETS } from '../src/studio/presets';
import guitarra from '../tests/fixtures/photos/guitarra-mantas.jpg?url';
import type { Guide } from '../src/shared/site';

type Id = Guide['id'];
type Space = keyof typeof PRESETS;
const fonts = createFontLoader({ google: false });
const preset = (space: Space, id: string) => PRESETS[space].find(p => p.id === id)!.make();
const W = GUIDE_MEDIA_PX.width, H = GUIDE_MEDIA_PX.height;
const CSS = { width: W / 2, height: H / 2 };

interface Ejemplo {
  recipe: () => Recipe;
  /** Seconds of the loop (the recipe's «Bucle perfecto» is set to it). */
  seconds: number;
  fps: number;
  /** Seconds into the loop of the first frame (the picture the card shows before it moves). */
  start?: number;
  /** false: the piece is periodic by itself; no «Bucle perfecto» crossfade. */
  crossfade?: boolean;
  /** A moving source, painted for each frame (loops with the clip). */
  scene?: (x: CanvasRenderingContext2D, t: number, T: number) => void;
  photo?: boolean;
  /** Drawn over the engine's frame (in 720 × 450 pixels). */
  over?: (x: CanvasRenderingContext2D, t: number, T: number) => void;
}

const TAU = Math.PI * 2;

/**
 * The photo of «Imagen a ASCII»: «Guitar on patterned blankets», Junior Pereira, 2016, CC0 1.0 (public domain
 * dedication; tests/fixtures/photos/CREDITS.md), cropped to 16:10 around the guitar's sound hole.
 */
let photoCanvas: HTMLCanvasElement | null = null;
async function loadPhoto(): Promise<HTMLCanvasElement> {
  if (photoCanvas) return photoCanvas;
  const img = new Image();
  img.src = guitarra;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  // 768 × 480 of the 768 × 1024 original, from y = 300 (the body, the sound hole and the blankets around)
  c.getContext('2d')!.drawImage(img, 0, 300, 768, 480, 0, 0, 960, 600);
  return (photoCanvas = c);
}

/** The sample landscape of src/shared/sample.ts, with every motion on a whole number of turns per loop. */
function loopingLandscape(x: CanvasRenderingContext2D, t: number, T: number) {
  const ph = (t / T) * TAU;
  x.save();
  x.scale(0.5, 0.5);
  const sunY = 300 - Math.sin(ph) * 22;
  // brighter than the still sample: a camera sees the silhouettes against the sky
  const sky = x.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#26386e'); sky.addColorStop(0.5, '#d8735a'); sky.addColorStop(1, '#ffe1a6');
  x.fillStyle = sky; x.fillRect(0, 0, 960, 380);
  const sun = x.createRadialGradient(560, sunY, 10, 560, sunY, 160);
  sun.addColorStop(0, '#fff6d6'); sun.addColorStop(0.35, '#ffd27a'); sun.addColorStop(1, 'rgba(255,160,90,0)');
  x.fillStyle = sun; x.beginPath(); x.arc(560, sunY, 160, 0, TAU); x.fill();
  // clouds drifting a whole screen per loop
  x.fillStyle = 'rgba(255,214,190,.28)';
  for (let k = 0; k < 3; k++) {
    const cx = ((k / 3 + t / T) % 1) * 1320 - 180, cy = 90 + k * 55;
    x.beginPath(); x.ellipse(cx, cy, 150, 18, 0, 0, TAU); x.fill();
  }
  const ridge = (base: number, amp: number, f: number, col: string) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 600);
    for (let i = 0; i <= 960; i += 8) x.lineTo(i, base - amp * (Math.sin(i * f) * 0.6 + Math.sin(i * f * 2.7 + 1) * 0.3 + Math.sin(i * f * 6.1) * 0.1));
    x.lineTo(960, 600); x.fill();
  };
  ridge(330, 70, 0.006, '#2a1830'); ridge(365, 45, 0.011, '#160d1b'); ridge(390, 25, 0.02, '#07050a');
  const lake = x.createLinearGradient(0, 390, 0, 600);
  lake.addColorStop(0, '#a4586a'); lake.addColorStop(1, '#0a0d1c');
  x.fillStyle = lake; x.fillRect(0, 390, 960, 210);
  x.fillStyle = 'rgba(255,214,140,.6)';
  for (let y = 400; y < 600; y += 9) { const w = 170 * (1 - (y - 400) / 260); x.fillRect(560 - w / 2 + Math.sin(y * 0.7 + ph * 2) * 10, y, w, 3); }
  x.restore();
}

async function faces() {
  await Promise.all([
    document.fonts.load('800 40px "Martian Mono"', 'Tu titular'),
    document.fonts.load('500 20px "JetBrains Mono"', 'foto ASCII ~$ node'),
    document.fonts.load('500 20px "Inter Tight Variable"', 'Así se lee tu contenido'),
  ]);
}

/** A small tag in the brand's mono face (used to say which side is which). */
function tag(x: CanvasRenderingContext2D, text: string, px: number, py: number, align: 'left' | 'right') {
  x.save();
  x.font = '500 19px "JetBrains Mono"';
  x.letterSpacing = '2px';
  const w = x.measureText(text).width + 22;
  const left = align === 'left' ? px : px - w;
  x.fillStyle = 'rgba(12,11,10,.72)';
  x.beginPath(); x.roundRect(left, py, w, 34, 6); x.fill();
  x.fillStyle = '#ede6da';
  x.textBaseline = 'middle';
  x.fillText(text, left + 11, py + 18);
  x.restore();
}

/** GLYPHOS in the Texto space: the word filled with a moving pattern, its letters in a wave (and, with msg, a line typing itself). */
function palabra(stops: string[], bg: string, map: Recipe['color']['map'] = 'luma', msg = false): Recipe {
  const r = preset('tipo', 'ola');
  r.text.content = 'GLYPHOS';
  r.text.size = 1;
  r.glyph.cell = 4;
  r.glyph.charset = ' .:-=+*#%@';
  r.media.mix = 0.3;
  r.tone.contrast = 1.25;
  r.color.stops = stops;
  r.color.bg = bg;
  r.color.map = map;
  if (msg) r.msg = { ...r.msg, on: true, text: 'teje luz con caracteres', mode: 'type', x: 0.5, y: 0.83, align: 'center', box: 0, speed: 12, hold: 1.2, cursor: true };
  r.interact.mode = 'none';
  return r;
}

const foto = (tweak: (r: Recipe) => void, base = 'retrato') => () => { const r = preset('media', base); r.interact.mode = 'none'; tweak(r); return r; };

export const EJEMPLOS: Record<Id, Ejemplo> = {
  // the photo on the left, its ASCII version on the right, the seam sweeping across and back
  imagen: {
    seconds: 5, fps: 24, photo: true,
    recipe: foto(r => { r.layers = []; r.glyph.cell = 5; r.glyph.charset = ' .:-=+*#%@'; r.glyph.edge = 0; r.color.vivid = 1; r.tone.gamma = 0.75; r.tone.contrast = 1.15; r.fx.cellBg = 0.3; r.fx.vig = 0; }),
    over(x, t, T) {
      const photo = photoCanvas!;
      const s = 0.5 - 0.5 * Math.cos((t / T) * TAU);
      const seam = Math.round(W * (0.16 + 0.68 * s));
      x.save();
      x.beginPath(); x.rect(0, 0, seam, H); x.clip();
      x.drawImage(photo, 0, 0, W, H);
      x.restore();
      x.fillStyle = '#ede6da';
      x.fillRect(seam - 1.5, 0, 3, H);
      tag(x, 'FOTO', 18, H - 52, 'left');
      tag(x, 'ASCII', W - 18, H - 52, 'right');
    },
  },
  video: {
    seconds: 4, fps: 24, scene: loopingLandscape,
    recipe: () => { const r = preset('media', 'fosforo'); r.source = 'video'; r.glyph.cell = 5; r.glyph.charset = ' .:-=+*#%@'; r.tone.contrast = 1.3; r.fx.curve = 0.15; r.fx.scan = 0.35; r.interact.mode = 'none'; return r; },
  },
  fondos: {
    seconds: 5, fps: 24,
    recipe: () => { const r = preset('fondos', 'marea'); r.interact.mode = 'none'; return r; },
    over(x) {
      // what the background is for: a headline, a line of text and a button on top of it
      const g = x.createLinearGradient(0, 0, W * 0.75, 0);
      g.addColorStop(0, 'rgba(7,10,24,.78)'); g.addColorStop(1, 'rgba(7,10,24,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#f6efe4';
      x.font = '800 50px "Martian Mono"';
      x.letterSpacing = '-3px';
      x.fillText('Tu titular', 44, 190);
      x.font = '500 21px "Inter Tight Variable"';
      x.letterSpacing = '0px';
      x.globalAlpha = 0.85;
      x.fillText('Así se lee tu contenido encima del fondo.', 46, 232);
      x.globalAlpha = 1;
      x.beginPath(); x.roundRect(46, 262, 196, 50, 10); x.fill();
      x.fillStyle = '#07060f';
      x.font = '700 19px "Inter Tight Variable"';
      x.fillText('Botón principal', 70, 294);
    },
  },
  texto: {
    seconds: 4, fps: 24,
    recipe: () => palabra(['#ff3d8b', '#ff9bd0', '#9af6ff', '#39f3ff'], '#07010f', 'x'),
  },
  terminal: {
    // donut.c turns on two axes (0.8 and 0.35 + 0.6·b rad per unit of time): with b = 1/12 the second one is
    // exactly half the first, so the ring is back where it started after 2π / 0.4 units, a whole loop with no
    // crossfade (a crossfade would show two rings at once); the layer's speed fits that into 5 seconds
    seconds: 5, fps: 20, start: 0.6, crossfade: false,
    recipe: () => {
      const r = preset('terminal', 'donut');
      r.glyph.cell = 6;
      r.layers[0] = { ...r.layers[0], b: 1 / 12, speed: (2 * Math.PI) / 0.4 / 5, scale: 1.5, y: -0.04 };
      return r;
    },
    over(x) {
      x.fillStyle = '#1c1b1a';
      x.fillRect(0, 0, W, 40);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(24 + i * 22, 20, 7, 0, TAU); x.fill(); });
      x.fillStyle = 'rgba(237,230,218,.7)';
      x.font = '500 17px "JetBrains Mono"';
      x.textAlign = 'center';
      x.fillText('~ $ node donut.mjs', W / 2, 26);
      x.textAlign = 'start';
    },
  },
};

/** Other candidates, to compare in ?ver&candidatos. */
export const CANDIDATOS: Partial<Record<Id, Array<{ name: string; recipe: () => Recipe }>>> = {
  texto: [
    { name: 'neón (plasma)', recipe: () => { const r = preset('tipo', 'neon'); r.text.content = 'GLYPHOS'; r.glyph.cell = 5; r.interact.mode = 'none'; return r; } },
    { name: 'marca', recipe: () => palabra(['#2b0d06', '#ff5b1f', '#ffd9a8', '#fff6e8'], '#0b0708') },
    { name: 'con mensaje', recipe: () => palabra(['#ff3d8b', '#ff9bd0', '#9af6ff', '#39f3ff'], '#07010f', 'x', true) },
  ],
  imagen: [
    { name: 'bloques', recipe: foto(r => { r.glyph.cell = 6; }, 'bloques') },
    { name: 'detallado', recipe: foto(r => { r.layers = []; r.glyph.cell = 5; r.glyph.edge = 0.1; r.color.vivid = 1; r.tone.gamma = 0.8; r.fx.cellBg = 0.3; r.fx.vig = 0; }) },
  ],
};

/* ------------------------------------------------------------------ rendering */

interface Open { e: AsciiEngine; ex: Ejemplo; out: HTMLCanvasElement; scene?: HTMLCanvasElement; n: number }
let cur: Open | null = null;

async function open(id: Id, recipe?: (() => Recipe) | string): Promise<number> {
  close();
  await faces();
  const ex = EJEMPLOS[id];
  const make = typeof recipe === 'string' ? CANDIDATOS[id]?.find(c => c.name === recipe)?.recipe : recipe;
  const r = (make ?? ex.recipe)();
  r.motion.loop = ex.crossfade === false ? 0 : ex.seconds * r.motion.speed;
  r.interact.auto = false;
  const e = new AsciiEngine(document.createElement('canvas'), r, {
    library: PATTERN_GLSL, fonts, fixedSize: { ...CSS, pixelRatio: 2 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true,
  });
  let scene: HTMLCanvasElement | undefined;
  if (ex.photo) e.setMedia('image', await loadPhoto());
  if (ex.scene) { scene = document.createElement('canvas'); scene.width = 480; scene.height = 300; }
  await e.ready();
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  cur = { e, ex, out, scene, n: Math.round(ex.seconds * ex.fps) };
  return cur.n;
}

/** Frame i of the open loop, as a PNG data URL (lossless: the encoder gets the exact pixels). */
function frame(i: number, type = 'image/png', q?: number): string {
  if (!cur) throw new Error('nada abierto');
  const { e, ex, out, scene, n } = cur;
  const secs = ((i % n) / ex.fps + (ex.start ?? 0)) % ex.seconds;
  const r = e.recipe;
  if (scene && ex.scene) {
    const x = scene.getContext('2d')!;
    ex.scene(x, secs, ex.seconds);
    e.setMedia('video', scene);
  }
  e.renderAt(secs * r.motion.speed, secs);
  const x = out.getContext('2d')!;
  x.clearRect(0, 0, W, H);
  x.drawImage(e.canvas, 0, 0, W, H);
  ex.over?.(x, secs, ex.seconds);
  return out.toDataURL(type, q);
}

function close() { cur?.e.destroy(); cur = null; }

const api = { ids: Object.keys(EJEMPLOS) as Id[], fps: (id: Id) => EJEMPLOS[id].fps, open, frame, close, candidates: (id: Id) => (CANDIDATOS[id] ?? []).map(c => c.name) };
(window as unknown as { mt: typeof api }).mt = api;

async function ver() {
  const q = new URLSearchParams(location.search);
  const ids = (q.get('id')?.split(',') ?? api.ids) as Id[];
  for (const id of ids) {
    const list = q.has('candidatos') ? (CANDIDATOS[id] ?? []) : [{ name: id, recipe: EJEMPLOS[id].recipe }];
    for (const c of list) {
      const n = await open(id, c.recipe);
      const row = document.createElement('figure');
      row.innerHTML = `<figcaption>${id} · ${c.name}</figcaption>`;
      for (const k of [0, 0.25, 0.5, 0.75]) {
        const img = document.createElement('img');
        img.src = frame(Math.floor(k * n), 'image/webp', 0.9);
        img.width = W / 2; img.height = H / 2;
        row.append(img);
      }
      document.body.append(row);
    }
  }
  close();
  document.body.dataset.ready = '1';
}

if (location.search.includes('ver')) void ver();
