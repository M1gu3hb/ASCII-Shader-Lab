/**
 * A cheap, model-free hint for the UI: does this photo look like it has one clear subject? Downsamples to 48 px,
 * compares every pixel with the colours of the border (what is probably background), and looks for skin tones.
 * Pure (RGBA in, verdict out); it never downloads anything. It is a hint, so its wording is careful.
 */

export interface CutoutSuggestion {
  /** A clear subject is likely: showing «Quitar fondo» prominently makes sense. */
  likely: boolean;
  /** 0..1 */
  confidence: number;
  /** The model that fits best: 'portrait' (people), 'subject' (anything on a simple background), 'select' (busy scenes). */
  model: 'subject' | 'portrait' | 'select';
  /** One Spanish sentence for the UI. */
  text: string;
  /** Measurements, for tests and curious people. */
  stats: { foreground: number; centred: number; borderSpread: number; skin: number };
}

const N = 48;

function thumb(rgba: ArrayLike<number>, W: number, H: number): Float32Array {
  const out = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) {
    const ya = Math.floor((y * H) / N), yb = Math.max(ya + 1, Math.floor(((y + 1) * H) / N));
    for (let x = 0; x < N; x++) {
      const xa = Math.floor((x * W) / N), xb = Math.max(xa + 1, Math.floor(((x + 1) * W) / N));
      let r = 0, g = 0, b = 0, n = 0;
      const sy = Math.max(1, Math.floor((yb - ya) / 4)), sx = Math.max(1, Math.floor((xb - xa) / 4));
      for (let yy = ya; yy < yb; yy += sy) for (let xx = xa; xx < xb; xx += sx) {
        const j = (yy * W + xx) * 4; r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; n++;
      }
      const i = (y * N + x) * 3;
      out[i] = r / n / 255; out[i + 1] = g / n / 255; out[i + 2] = b / n / 255;
    }
  }
  return out;
}

const isSkin = (r: number, g: number, b: number) => {
  // YCbCr skin box (Chai & Ngan), on 0..255 values, plus a minimum brightness.
  const R = r * 255, G = g * 255, B = b * 255;
  const y = 0.299 * R + 0.587 * G + 0.114 * B;
  const cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
  const cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
  return y > 50 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
};

export function suggestFromRGBA(rgba: ArrayLike<number>, W: number, H: number): CutoutSuggestion {
  const t = thumb(rgba, W, H);
  const ring = 4;
  const border: number[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x < ring || y < ring || x >= N - ring || y >= N - ring) border.push((y * N + x) * 3);
  }
  // Spread of the border colours (a plain studio wall is low, a street is high).
  let mr = 0, mg = 0, mb = 0;
  for (const i of border) { mr += t[i]; mg += t[i + 1]; mb += t[i + 2]; }
  mr /= border.length; mg /= border.length; mb /= border.length;
  let spread = 0;
  for (const i of border) spread += Math.hypot(t[i] - mr, t[i + 1] - mg, t[i + 2] - mb);
  spread /= border.length;
  // Foreground: interior pixels far from every border colour (sampled).
  const samples = border.filter((_, k) => k % 3 === 0);
  let fg = 0, fgCentre = 0, skin = 0, interior = 0;
  for (let y = ring; y < N - ring; y++) for (let x = ring; x < N - ring; x++) {
    interior++;
    const i = (y * N + x) * 3, r = t[i], g = t[i + 1], b = t[i + 2];
    let dmin = Infinity;
    for (const s of samples) { const d = Math.hypot(r - t[s], g - t[s + 1], b - t[s + 2]); if (d < dmin) dmin = d; }
    if (dmin > 0.12) {
      fg++;
      const cx = (x + 0.5) / N - 0.5, cy = (y + 0.5) / N - 0.5;
      if (Math.abs(cx) < 0.3 && Math.abs(cy) < 0.35) fgCentre++;
      if (isSkin(r, g, b)) skin++;
    }
  }
  const foreground = fg / interior;
  const centred = fg ? fgCentre / fg : 0;
  const skinFrac = fg ? skin / fg : 0;
  // Confidence of «one clear subject»: some foreground, not everything, mostly in the middle, calm border.
  const sizeOk = foreground > 0.06 && foreground < 0.8 ? 1 : foreground > 0.03 ? 0.5 : 0;
  const calm = Math.max(0, Math.min(1, (0.2 - spread) / 0.12));
  const confidence = Math.max(0, Math.min(1, 0.45 * sizeOk + 0.3 * Math.min(1, centred / 0.6) + 0.25 * calm));
  const person = skinFrac > 0.08;
  const likely = confidence >= 0.6;
  let model: CutoutSuggestion['model'];
  let text: string;
  if (likely && person) {
    model = 'portrait';
    text = 'Parece un retrato sobre un fondo sencillo: «Retrato» o «Sujeto» deberían separar a la persona sin esfuerzo.';
  } else if (likely) {
    model = 'subject';
    text = 'Hay un sujeto claro sobre un fondo sencillo: «Quitar fondo» debería separarlo bien.';
  } else if (spread >= 0.2) {
    model = 'select';
    text = 'El fondo tiene mucho detalle: con «Seleccionar objeto» (tocar lo que quieres y lo que no) tendrás más control.';
  } else {
    model = person ? 'portrait' : 'select';
    text = 'No se ve un sujeto claro. Si quieres recortar algo concreto, prueba «Seleccionar objeto».';
  }
  return { likely, confidence, model, text, stats: { foreground, centred, borderSpread: spread, skin: skinFrac } };
}
