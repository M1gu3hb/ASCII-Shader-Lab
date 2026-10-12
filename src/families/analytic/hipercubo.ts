/**
 * «Hipercubo» (C-04): a regular 4D polytope (tesseract, 16-cell or 24-cell, all of circumradius 1) turning
 * in the xw, yw and zw planes, projected 4D → 3D in perspective from a 4D eye at w = D4 (v3 = v.xyz ·
 * D4 / (D4 − w)), then 3D → 2D by a camera that turns once per cycle around the vertical and looks a little
 * from above. Each edge is a segment drawn one or more cells wide; its width and brightness follow w along
 * it (what is nearer the 4D eye is thicker and brighter, and that is what turns the inner cube inside out),
 * dimmed with 3D depth. Vertices are dots. The trail repeats the figure a few moments earlier, fading.
 *
 * Time: each plane turns a whole number of times per cycle and the camera once, so the figure (and its
 * trail) repeats exactly every cycle.
 *
 * Tables (vertices and edges of the three polytopes) are built here and shared with the CPU twin.
 * k0 = (polytope, xw turns, yw turns, zw turns), k1 = (cycle seconds, 4D distance, width, trail).
 * Written from the geometry of the polytopes and of perspective projection, not from any shader's code.
 */

/** Vertices (x, y, z, w) of the three polytopes, one after another, all of circumradius 1. */
export const HC_V: number[][] = [];
/** Edges as pairs of local vertex indices, one polytope after another. */
export const HC_E: Array<[number, number]> = [];
/** Per polytope: first vertex, vertex count, first edge, edge count. */
export const HC_POLY: Array<{ v0: number; nv: number; e0: number; ne: number }> = [];
{
  const add = (verts: number[][]) => {
    const v0 = HC_V.length, e0 = HC_E.length;
    // edges: the pairs at the polytope's smallest distance
    let dmin = Infinity;
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
      const d = Math.hypot(...verts[i].map((c, q) => c - verts[j][q]));
      dmin = Math.min(dmin, d);
    }
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
      const d = Math.hypot(...verts[i].map((c, q) => c - verts[j][q]));
      if (d < dmin * 1.001) HC_E.push([i, j]);
    }
    HC_V.push(...verts);
    HC_POLY.push({ v0, nv: verts.length, e0, ne: HC_E.length - e0 });
  };
  // tesseract: (±1/2)^4
  const t: number[][] = [];
  for (let i = 0; i < 16; i++) t.push([0, 1, 2, 3].map(b => (i >> b & 1 ? 0.5 : -0.5)));
  add(t);
  // 16-cell: ±e_i
  const c16: number[][] = [];
  for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s; c16.push(v); }
  add(c16);
  // 24-cell: permutations of (±1, ±1, 0, 0) / √2
  const c24: number[][] = [];
  const r = Math.SQRT1_2;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const sa of [1, -1]) for (const sb of [1, -1]) {
    const v = [0, 0, 0, 0]; v[a] = sa * r; v[b] = sb * r; c24.push(v);
  }
  add(c24);
}

const f = (v: number) => { const s = String(Math.fround(v)); return s.includes('.') || s.includes('e') ? s : s + '.'; };
const NV = HC_V.length, NE = HC_E.length;

export const HIPERCUBO_GLSL = /* glsl */ `
const vec4 HC_V[${NV}] = vec4[${NV}](${HC_V.map(v => `vec4(${v.map(f).join(', ')})`).join(', ')});
const ivec2 HC_E[${NE}] = ivec2[${NE}](${HC_E.map(e => `ivec2(${e[0]}, ${e[1]})`).join(', ')});
vec4 hc_P[24];
// the figure at time t: each vertex projected to the screen (x, y), its w after the 4D turn, its 3D depth
void hc_project(float t, vec4 k0, vec4 k1, int v0, int nv){
  float ph = TAU * t / k1.x;
  float a = floor(k0.y + .5) * ph, b = floor(k0.z + .5) * ph, c = floor(k0.w + .5) * ph;
  float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b), cc = cos(c), sc = sin(c);
  float D4 = k1.y, Rm = D4 / (D4 - 1.), D3 = 3.2 * Rm, Fk = .62 * D3 / Rm;
  float cy = cos(ph + .6), sy = sin(ph + .6), cp = cos(.42), sp = sin(.42);
  for (int i = 0; i < 24; i++){
    if (i >= nv) break;
    vec4 v = HC_V[v0 + i];
    // turns in the zw, yw and xw planes
    v = vec4(v.x, v.y, cc * v.z - sc * v.w, sc * v.z + cc * v.w);
    v = vec4(v.x, cb * v.y - sb * v.w, v.z, sb * v.y + cb * v.w);
    v = vec4(ca * v.x - sa * v.w, v.y, v.z, sa * v.x + ca * v.w);
    vec3 q = v.xyz * (D4 / (D4 - v.w));
    // the camera: a turn around the vertical, then a look from above
    q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    q = vec3(q.x, cp * q.y - sp * q.z, sp * q.y + cp * q.z);
    float k = Fk / (D3 - q.z);
    hc_P[i] = vec4(q.xy * k, v.w, q.z / Rm);
  }
}
float F_hipercubo(vec2 p, float t, vec4 k0, vec4 k1){
  float pl = floor(k0.x + .5);
  int v0 = pl < .5 ? ${HC_POLY[0].v0} : pl < 1.5 ? ${HC_POLY[1].v0} : ${HC_POLY[2].v0};
  int nv = pl < .5 ? ${HC_POLY[0].nv} : pl < 1.5 ? ${HC_POLY[1].nv} : ${HC_POLY[2].nv};
  int e0 = pl < .5 ? ${HC_POLY[0].e0} : pl < 1.5 ? ${HC_POLY[1].e0} : ${HC_POLY[2].e0};
  int ne = pl < .5 ? ${HC_POLY[0].ne} : pl < 1.5 ? ${HC_POLY[1].ne} : ${HC_POLY[2].ne};
  float wd = k1.z * PX * .5;
  float v = 0.;
  // the figure now and, with a trail, a few moments earlier, fading
  for (int j = 0; j < 4; j++){
    float wt = j == 0 ? 1. : k1.w * pow(.62, float(j));
    if (wt < .02) break;
    hc_project(t - float(j) * k1.x * .006, k0, k1, v0, nv);
    float best = 0.;
    for (int i = 0; i < 96; i++){
      if (i >= ne) break;
      ivec2 e = HC_E[e0 + i];
      vec4 A = hc_P[e.x], B = hc_P[e.y];
      vec2 pa = p - A.xy, ba = B.xy - A.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0., 1.);
      float d = length(pa - ba * h);
      if (d > wd * 2.2 + PX * 3.) continue;
      // nearer the 4D eye (w up): wider and brighter; farther in 3D: dimmer
      float w = mix(A.z, B.z, h), z = mix(A.w, B.w, h);
      float n = .5 + .5 * w;
      float hw = wd * mix(.55, 1.45, n);
      float br = mix(.32, 1., n) * mix(.62, 1., sat(.5 + .5 * z));
      float line = 1. - smoothstep(hw - PX * .35, hw + PX * .35, d);
      float halo = .22 * (1. - smoothstep(hw, hw + PX * 2.5, d));
      best = max(best, br * max(line, halo));
    }
    for (int i = 0; i < 24; i++){
      if (i >= nv) break;
      vec4 A = hc_P[i];
      float n = .5 + .5 * A.z;
      float r = wd * mix(1.2, 2.4, n) + PX * .4;
      best = max(best, mix(.5, 1., n) * (1. - smoothstep(r - PX * .4, r + PX * .4, length(p - A.xy))));
    }
    v = max(v, best * wt);
  }
  return sat(v);
}
`;
