/**
 * Colour selection maths, pure: the colour under the pointer (a small average, so one noisy pixel does not decide
 * it) and the distance the mask uses. Same meaning as the project's MaskColorPart and the cutout's
 * matteFromColor: Euclidean RGB distance / (255·√3), 0 = the same colour, 1 = black against white.
 */

export type RGB = [number, number, number];

export const COLOR_NORM = 1 / (255 * Math.sqrt(3));

export function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) * COLOR_NORM;
}

export const toHex = (c: RGB) => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export function fromHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * The average colour of the pixels within `radius` px of (x, y) (a square window clipped to the picture;
 * transparent pixels do not count). Null outside the picture or when everything there is transparent.
 */
export function pickColor(rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number, radius = 1): RGB | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = Math.max(0, cy - radius); yy <= Math.min(h - 1, cy + radius); yy++) {
    for (let xx = Math.max(0, cx - radius); xx <= Math.min(w - 1, cx + radius); xx++) {
      const o = (yy * w + xx) * 4, a = rgba[o + 3] / 255;
      if (a <= 0) continue;
      r += rgba[o] * a; g += rgba[o + 1] * a; b += rgba[o + 2] * a; n += a;
    }
  }
  if (n <= 0) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** How strongly a pixel of colour `c` is selected by (color, tol, soft): 1 up to tol, then a ramp of width soft. */
export function colorStrength(c: RGB, color: RGB, tol: number, soft: number): number {
  const d = colorDistance(c, color);
  if (d <= tol) return 1;
  const s = Math.max(1e-4, soft);
  return Math.max(0, 1 - (d - tol) / s);
}

/** Share of pixels a colour selection takes (0..1), sampled every `step` pixels: for the status line. */
export function colorShare(rgba: Uint8ClampedArray, w: number, h: number, color: RGB, tol: number, soft: number, step = 4): number {
  let on = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4;
      on += colorStrength([rgba[o], rgba[o + 1], rgba[o + 2]], color, tol, soft) * (rgba[o + 3] / 255);
      n++;
    }
  }
  return n ? on / n : 0;
}
