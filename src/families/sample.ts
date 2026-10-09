import type { RasterView } from './host';

/**
 * How the field pass reads a raster family's layer: the raster covers the domain x ∈ [−1, 1],
 * y ∈ [−0.5, 0.5] (screen heights, y up; row 0 at the top), read bilinearly between texel centres. Outside
 * the domain it repeats (wrap) or is empty. The GLSL twin (FAMILY_SAMPLE_GLSL) does the same arithmetic with
 * texelFetch, so both engines read the same values from the same bytes.
 */
export function sampleRaster(R: RasterView, x: number, y: number): number {
  const w = R.w, h = R.h, d = R.data;
  const u = x * 0.5 + 0.5, v = 0.5 - y;
  if (!R.wrap && (u < 0 || u > 1 || v < 0 || v > 1)) return 0;
  const fx = u * w - 0.5, fy = v * h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  let x0: number, x1: number, y0: number, y1: number;
  if (R.wrap) {
    x0 = ix - w * Math.floor(ix / w); x1 = (ix + 1) - w * Math.floor((ix + 1) / w);
    y0 = iy - h * Math.floor(iy / h); y1 = (iy + 1) - h * Math.floor((iy + 1) / h);
  } else {
    x0 = ix < 0 ? 0 : ix > w - 1 ? w - 1 : ix; x1 = ix + 1 < 0 ? 0 : ix + 1 > w - 1 ? w - 1 : ix + 1;
    y0 = iy < 0 ? 0 : iy > h - 1 ? h - 1 : iy; y1 = iy + 1 < 0 ? 0 : iy + 1 > h - 1 ? h - 1 : iy + 1;
  }
  const a = d[y0 * w + x0] / 255, b = d[y0 * w + x1] / 255, c = d[y1 * w + x0] / 255, e = d[y1 * w + x1] / 255;
  const top = a + (b - a) * tx, bot = c + (e - c) * tx;
  return top + (bot - top) * ty;
}

/**
 * GLSL twin of sampleRaster. R = (w, h, wrap, on). The four samplers are bound to units 8–11 by the
 * engine (a 1×1 empty texture where a layer has no raster).
 */
export const FAMILY_SAMPLE_GLSL = `
uniform sampler2D uFT0, uFT1, uFT2, uFT3;
uniform vec4 uLR[4];
uniform vec4 uLF0[4], uLF1[4];
float famTexel(int i, ivec2 c){
  if (i == 0) return texelFetch(uFT0, c, 0).r;
  if (i == 1) return texelFetch(uFT1, c, 0).r;
  if (i == 2) return texelFetch(uFT2, c, 0).r;
  return texelFetch(uFT3, c, 0).r;
}
float famRaster(int i, vec2 q){
  vec4 R = uLR[i];
  if (R.w < .5) return 0.;
  vec2 uv = vec2(q.x * .5 + .5, .5 - q.y);
  if (R.z < .5 && (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.)) return 0.;
  vec2 f = uv * R.xy - .5;
  vec2 i0 = floor(f), t = f - i0;
  vec2 i1 = i0 + 1.;
  if (R.z > .5){ i0 = i0 - R.xy * floor(i0 / R.xy); i1 = i1 - R.xy * floor(i1 / R.xy); }
  else { i0 = clamp(i0, vec2(0.), R.xy - 1.); i1 = clamp(i1, vec2(0.), R.xy - 1.); }
  ivec2 a = ivec2(i0), b = ivec2(i1);
  float v00 = famTexel(i, a), v10 = famTexel(i, ivec2(b.x, a.y)), v01 = famTexel(i, ivec2(a.x, b.y)), v11 = famTexel(i, b);
  float top = v00 + (v10 - v00) * t.x, bot = v01 + (v11 - v01) * t.x;
  return top + (bot - top) * t.y;
}
`;
