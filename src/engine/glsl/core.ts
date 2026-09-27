/** Shared GLSL ES 3.00 helpers (hashes, noise, sdf). Included in every generated shader. */
export const GLSL_CORE = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
float sat(float x){ return clamp(x, 0., 1.); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
mat2 rotm(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 rot2(vec2 p, float a){ return rotm(a) * p; }
float hard(float v, float k){ float w = .5 * (1. - k) + .004; return smoothstep(.5 - w, .5 + w, v); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 ga = hash22(i) * 2. - 1., gb = hash22(i + vec2(1., 0.)) * 2. - 1.;
  vec2 gc = hash22(i + vec2(0., 1.)) * 2. - 1., gd = hash22(i + vec2(1., 1.)) * 2. - 1.;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1., 0.)), vc = dot(gc, f - vec2(0., 1.)), vd = dot(gd, f - vec2(1., 1.));
  return .5 + .9 * mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  float a = hash13(i), b = hash13(i + vec3(1., 0., 0.)), c = hash13(i + vec3(0., 1., 0.)), d = hash13(i + vec3(1., 1., 0.));
  float e = hash13(i + vec3(0., 0., 1.)), g = hash13(i + vec3(1., 0., 1.)), h = hash13(i + vec3(0., 1., 1.)), k = hash13(i + vec3(1., 1., 1.));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm(vec2 p){
  float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * gnoise(p); p = m * p + 17.1; a *= .5; }
  return v / .96875;
}
float fbm3(vec3 p){
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++){ v += a * noise3(p); p = p * 2.03 + vec3(17.1, 3.7, 9.3); a *= .5; }
  return v / .9375;
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
mat3 rotXY(float x, float y){
  float cx = cos(x), sx = sin(x), cy = cos(y), sy = sin(y);
  return mat3(1., 0., 0., 0., cx, sx, 0., -sx, cx) * mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy);
}
vec2 voro(vec2 x, float t){
  vec2 n = floor(x), f = fract(x); float f1 = 8., f2 = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n + g); o = .5 + .42 * sin(t + TAU * o);
    float d = length(g + o - f);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f1, f2);
}
`;

/** Blend operators; index order must match BLENDS in recipe.ts */
export const GLSL_BLEND = /* glsl */ `
float blendf(float a, float b, int m, float k){
  float r = b;
  if (m == 1) r = a + b;
  else if (m == 2) r = a * b;
  else if (m == 3) r = 1. - (1. - a) * (1. - b);
  else if (m == 4) r = a < .5 ? 2. * a * b : 1. - 2. * (1. - a) * (1. - b);
  else if (m == 5) r = abs(a - b);
  else if (m == 6) r = max(a, b);
  else if (m == 7) r = min(a, b);
  else if (m == 8) r = a * smoothstep(.42, .58, b);
  else if (m == 9) r = a * (1. - smoothstep(.42, .58, b));
  else if (m == 10) r = a - b;
  return clamp(mix(a, r, k), 0., 1.);
}
`;
