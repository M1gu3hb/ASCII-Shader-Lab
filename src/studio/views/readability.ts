/**
 * How well text reads over a moving ASCII background: the pure part (no DOM, no store), so every rule
 * can be tested with synthetic pixels. `legibility.ts` feeds it the stage pixels behind each text region
 * of the preview («Fondo web», «Pantalla de móvil», the fondo guide).
 *
 * Averaging the background in blocks (what the first version did) erases exactly what competes with
 * the letters: bright glyph strokes right next to them. So each region is measured pixel by pixel (one
 * sample per CSS px, the scale of a paragraph's strokes), only around its own lines:
 *  - `clash`: share of that background too close to the text colour (under 3:1 for large text, 4.5:1
 *    for the rest, the WCAG thresholds);
 *  - `texture`: how much the background's lightness jumps around the letters, relative to how far the
 *    text is from it (glyphs that are not quite the text's tone still fight small letters);
 *  - `ratio`: the contrast at the worst tenth of that background (a figure to show, not the verdict).
 * The verdict is the worst region over several frames. It is an estimate, not a WCAG audit.
 */

export type RegionRole = 'headline' | 'body' | 'button' | 'nav';
export type Level = 'buena' | 'justa' | 'baja';
/** 0..255 per channel. */
export type Rgb = [number, number, number];

export interface RegionSpec {
  /** Stable id (the same region across frames). */
  id: string;
  role: RegionRole;
  /** How the verdict names it: «el titular», «el párrafo», «el botón «Saber más»», «el menú». */
  name: string;
  /** Text colour and the opacity it is drawn with (0..1). */
  text: Rgb;
  alpha: number;
  /** Large text (≥ 24 px, or ≥ 18.66 px bold): 3:1 is enough; otherwise 4.5:1. */
  large: boolean;
  /** A button with its own opaque background: its text is read on that, not on the art. */
  fill?: Rgb | null;
}

/** Background behind a region, one sample per CSS px (RGBA), and which pixels are next to the letters. */
export interface Sample {
  w: number;
  h: number;
  data: ArrayLike<number>;
  /** 1 where a pixel lies around the text (its line boxes); absent: every pixel. */
  mask?: ArrayLike<number>;
}

export interface Metrics { clash: number; texture: number; ratio: number }

export interface RegionResult { id: string; role: RegionRole; name: string; level: Level; why: Why | null; m: Metrics }

/** What makes a region hard to read. */
export type Why = 'fondo' | 'glifos' | 'textura';

/* ------------------------------------------------------------------ */
/* Colour                                                               */
/* ------------------------------------------------------------------ */

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const lin = (v: number) => LIN[Math.max(0, Math.min(255, Math.round(v)))];
/** Relative luminance (WCAG) of an sRGB colour, 0..255 channels. */
export const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** CIE lightness L* (0..100) from relative luminance. */
export const lightness = (Y: number) => (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y);
export const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/* ------------------------------------------------------------------ */
/* The protected zone (scrim)                                           */
/* ------------------------------------------------------------------ */

export interface ScrimLayer {
  color: Rgb;
  /** 0..1 */
  opacity: number;
  /** Backdrop blur radius in CSS px (a CSS blur() standard deviation). */
  blur: number;
}

/** Three passes of a box blur approximate a Gaussian with this standard deviation (in place, per channel). */
function blurRgba(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.5) return src;
  // box width for three passes: w = sqrt(12σ²/3 + 1)
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  let a = src, b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += a[(y * w + Math.max(0, Math.min(w - 1, x))) * 4 + c];
        for (let x = 0; x < w; x++) {
          b[(y * w + x) * 4 + c] = acc / (2 * r + 1);
          acc += a[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - a[(y * w + Math.max(0, x - r)) * 4 + c];
        }
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += b[(Math.max(0, Math.min(h - 1, y)) * w + x) * 4 + c];
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * 4 + c] = acc / (2 * r + 1);
          acc += b[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - b[(Math.max(0, y - r) * w + x) * 4 + c];
        }
      }
    }
    if (pass === 0 && a === src) { a = new Float32Array(src); }
  }
  return a;
}

/**
 * The background as seen through the protected zone: blurred and tinted where the zone covers it.
 * `cover` gives, per pixel, how much of the zone is there (0..1: the zone's shape and its gradient).
 */
export function applyScrim(s: Sample, scrim: ScrimLayer | null, cover: ArrayLike<number> | null): Sample {
  if (!scrim || scrim.opacity <= 0 && scrim.blur < 0.5) return s;
  const n = s.w * s.h;
  const src = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) src[i] = s.data[i];
  const blurred = blurRgba(new Float32Array(src), s.w, s.h, scrim.blur);
  const out = new Uint8ClampedArray(n * 4);
  const o = Math.max(0, Math.min(1, scrim.opacity));
  for (let i = 0; i < n; i++) {
    const k = cover ? Math.max(0, Math.min(1, cover[i])) : 1;
    for (let c = 0; c < 3; c++) {
      const through = blurred[i * 4 + c] * (1 - o) + scrim.color[c] * o;
      out[i * 4 + c] = src[i * 4 + c] * (1 - k) + through * k;
    }
    out[i * 4 + 3] = 255;
  }
  return { ...s, data: out };
}

/**
 * Area-averages an RGBA image to another size (device pixels of the canvas → CSS px), so a phone with
 * a pixel ratio of 3 and a desktop at 1 are compared at the same scale.
 */
export function resample(src: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  if (sw === dw && sh === dh) { for (let i = 0; i < out.length; i++) out[i] = src[i]; return out; }
  const acc = new Float32Array(dw * dh * 4), cnt = new Uint32Array(dw * dh);
  const kx = dw / sw, ky = dh / sh;
  for (let y = 0; y < sh; y++) {
    const ty = Math.min(dh - 1, Math.floor(y * ky));
    for (let x = 0; x < sw; x++) {
      const t = ty * dw + Math.min(dw - 1, Math.floor(x * kx)), i = (y * sw + x) * 4;
      acc[t * 4] += src[i]; acc[t * 4 + 1] += src[i + 1]; acc[t * 4 + 2] += src[i + 2];
      cnt[t]++;
    }
  }
  for (let t = 0; t < dw * dh; t++) {
    const c = cnt[t] || 1;
    out[t * 4] = acc[t * 4] / c; out[t * 4 + 1] = acc[t * 4 + 1] / c; out[t * 4 + 2] = acc[t * 4 + 2] / c; out[t * 4 + 3] = 255;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* One region, one frame                                                */
/* ------------------------------------------------------------------ */

/** Contrast the text needs over its background (WCAG AA): 3:1 for large text, 4.5:1 otherwise. */
export const needFor = (spec: Pick<RegionSpec, 'large'>) => (spec.large ? 3 : 4.5);

/**
 * Clash, texture and the worst-tenth contrast of one region in one frame, one sample per CSS px (the
 * calibration settled on no smoothing at all: even a 72 px headline blends where thin light strokes
 * touch it, and averaging them away is what hid the problem). The text is drawn with `alpha` over each
 * background pixel (CSS opacity mixes in sRGB), so a translucent paragraph takes some of the glyph behind it.
 */
export function measureRegion(spec: RegionSpec, s: Sample): Metrics {
  if (spec.fill) {
    // a filled button: its text sits on its own colour
    const r = ratioOf(lum(...spec.text), lum(...spec.fill));
    return { clash: r < needFor(spec) ? 1 : 0, texture: 0, ratio: r };
  }
  const n = s.w * s.h;
  const a = Math.max(0, Math.min(1, spec.alpha)), [tr, tg, tb] = spec.text;
  const yt0 = lum(tr, tg, tb);
  const need = needFor(spec);
  // contrast histogram in steps of 0.05 from 1:1 to 21:1 (the worst tenth, without sorting every pixel)
  const hist = new Uint32Array(401);
  let count = 0, clash = 0, sumL = 0, sumL2 = 0;
  for (let i = 0; i < n; i++) {
    if (s.mask && !s.mask[i]) continue;
    const r = s.data[i * 4], g = s.data[i * 4 + 1], b = s.data[i * 4 + 2];
    const yb = lum(r, g, b);
    const yt = a >= 1 ? yt0 : lum(tr * a + r * (1 - a), tg * a + g * (1 - a), tb * a + b * (1 - a));
    const c = ratioOf(yt, yb);
    hist[Math.min(400, Math.floor((c - 1) * 20))]++;
    count++;
    if (c < need) clash++;
    const L = lightness(yb);
    sumL += L; sumL2 += L * L;
  }
  if (!count) return { clash: 0, texture: 0, ratio: 21 };
  let ratio = 21;
  for (let k = 0, acc = 0, want = Math.floor((count - 1) * 0.1) + 1; k < hist.length; k++) {
    acc += hist[k];
    if (acc >= want) { ratio = 1 + k / 20; break; }
  }
  const mean = sumL / count;
  const sd = Math.sqrt(Math.max(0, sumL2 / count - mean * mean));
  const texture = sd / Math.max(8, Math.abs(lightness(yt0) - mean));
  return { clash: clash / count, texture, ratio };
}

/* ------------------------------------------------------------------ */
/* Verdict                                                              */
/* ------------------------------------------------------------------ */

/**
 * Limits, calibrated on real renders of the previews (dark and light backgrounds, sparse and dense,
 * bright and dim glyphs, with and without the protected zone), each one labelled by eye. They lean to
 * caution: the estimate must never say «se lee bien» where the preview shows otherwise.
 * `ok`: at most this much to read well; `bad`: past this it is hard to read.
 */
export const LIMITS = {
  small: { clash: { ok: 0.01, bad: 0.06 }, texture: { ok: 0.18, bad: 0.34 } },
  large: { clash: { ok: 0.02, bad: 0.12 }, texture: { ok: 0.24, bad: 0.45 } },
};

export function judge(spec: RegionSpec, m: Metrics): { level: Level; why: Why | null } {
  if (spec.fill) return m.clash > 0 ? { level: 'baja', why: 'fondo' } : { level: 'buena', why: null };
  const L = spec.large ? LIMITS.large : LIMITS.small;
  // the whole background too close to the text: not a question of glyphs
  const why: Why = m.ratio < needFor(spec) * 0.8 && m.clash > 0.5 ? 'fondo' : m.clash > L.clash.ok ? 'glifos' : 'textura';
  if (m.clash > L.clash.bad || m.texture > L.texture.bad) return { level: 'baja', why };
  if (m.clash > L.clash.ok || m.texture > L.texture.ok) return { level: 'justa', why };
  return { level: 'buena', why: null };
}

const RANK: Record<Level, number> = { buena: 0, justa: 1, baja: 2 };
export const worse = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);

/** Per region, the worst of several frames (the background moves): highest clash and texture, lowest ratio. */
export function worstOf(frames: Metrics[]): Metrics {
  return frames.reduce((w, m) => ({ clash: Math.max(w.clash, m.clash), texture: Math.max(w.texture, m.texture), ratio: Math.min(w.ratio, m.ratio) }),
    { clash: 0, texture: 0, ratio: 21 });
}

export interface Verdict {
  level: Level;
  regions: RegionResult[];
}

/** «Se lee bien» only when every region does. */
export function verdict(specs: RegionSpec[], frames: Map<string, Metrics[]>): Verdict {
  const regions: RegionResult[] = [];
  let level: Level = 'buena';
  for (const spec of specs) {
    const list = frames.get(spec.id);
    if (!list?.length) continue;
    const m = worstOf(list);
    const j = judge(spec, m);
    regions.push({ id: spec.id, role: spec.role, name: spec.name, level: j.level, why: j.why, m });
    level = worse(level, j.level);
  }
  if (!regions.length) level = 'justa';
  return { level, regions };
}

/* ------------------------------------------------------------------ */
/* What the studio says                                                 */
/* ------------------------------------------------------------------ */

const listOf = (names: string[]) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1]);
const pct = (v: number) => (v < 0.01 ? 'menos del 1' : String(Math.round(v * 100)));

/** One line for the whole estimate: «Se lee bien», or which regions fail. */
export function summary(v: Verdict): string {
  if (v.level === 'buena') return 'Se lee bien';
  const bad = v.regions.filter(r => r.level === 'baja').map(r => r.name);
  const fair = v.regions.filter(r => r.level === 'justa').map(r => r.name);
  if (bad.length) return `Cuesta leer ${listOf(bad)}` + (fair.length ? `; con esfuerzo, ${listOf(fair)}` : '');
  return `Se lee con esfuerzo ${listOf(fair)}`;
}

/** Why one region is hard to read, in plain words (`light`: the text is light). */
export function reason(r: RegionResult, light: boolean): string {
  if (r.level === 'buena') return 'se lee bien';
  if (r.why === 'fondo') return 'el fondo es casi del mismo tono que el texto';
  if (r.why === 'glifos') return `hay caracteres casi tan ${light ? 'claros' : 'oscuros'} como el texto pegados a las letras (${pct(r.m.clash)} % de lo que las rodea)`;
  return 'la textura de los caracteres compite con las letras';
}

export const LEVEL_WORD: Record<Level, string> = { buena: 'Se lee bien', justa: 'Con esfuerzo', baja: 'Cuesta leer' };

/**
 * What to try, most effective first: the other text colour when the estimate says it reads better,
 * the protected zone (or a stronger one), and calming the background.
 */
export function advice(v: Verdict, o: { light: boolean; scrim: 'off' | 'suave' | 'fuerte' | 'custom'; alt: Level | null; guide?: boolean }): string[] {
  if (v.level === 'buena') return [];
  const out: string[] = [];
  if (o.alt && RANK[o.alt] < RANK[v.level]) out.push(`Prueba el texto ${o.light ? 'oscuro' : 'claro'}: se estima que ${o.alt === 'buena' ? 'se leería bien' : 'se leería mejor'}.`);
  if (o.scrim === 'off') out.push('Activa la zona protegida: una capa detrás del texto que calma el fondo.');
  else if (o.scrim === 'suave') out.push('Sube la zona protegida a «Fuerte», o dale más opacidad o desenfoque.');
  else out.push('Dale más opacidad o desenfoque a la zona protegida, o cámbiala a «Toda la página».');
  out.push(o.guide ? 'O baja la presencia del fondo.' : 'O calma el fondo: menos brillo o contraste en los caracteres (pestañas Color y Glifos).');
  return out;
}
