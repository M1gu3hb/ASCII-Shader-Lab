/**
 * «Marco vivo» (C-08): a frame of glyphs around the canvas. A rounded rectangle inset by the margins (its
 * proportion is a control: the field does not know the canvas's) gives each cell its signed distance to the
 * outline and its position along the perimeter (arc length from the top centre, clockwise, by quadrant
 * symmetry). The line is a thin core 1/(1 + d²/w²) over a dim base; comets run along the perimeter, each a
 * bright head with an exponential tail behind it and its own colour from the palette, at slightly different
 * speeds (the spacing drifts: no exact repeat). A heartbeat pulse (two bumps per beat) thickens and brightens
 * the line; optional smoke is an fBm that drifts away from the line, lit by the comets. Written from the
 * published description of the effect, not from any shader's code.
 * Parameters: k0 = (comets, speed, thickness, margin), k1 = (corner radius, pulse, smoke, proportion).
 */
export const MARCO_GLSL = /* glsl */ `
vec3 marc_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
// signed distance to a rounded rectangle (half size b, corner r) and the arc length at its nearest point
vec2 marc_rr(vec2 p, vec2 b, float r){
  vec2 ib = b - r;
  vec2 a = abs(p), q = a - ib;
  float sd = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
  float Lc = r * PI * .5, P = 4. * (ib.x + ib.y + Lc);
  float s;
  if (q.x > 0. && q.y > 0.) s = ib.x + r * (PI * .5 - atan(q.y, q.x));
  else if (q.y > q.x) s = min(a.x, ib.x);
  else s = ib.x + Lc + ib.y - min(a.y, ib.y);
  if (p.y < 0.) s = P * .5 - s;
  if (p.x < 0.) s = P - s;
  return vec2(sd, s);
}
vec4 FC_marco(vec2 p, float t, vec4 k0, vec4 k1){
  float K = floor(k0.x + .5), sp = .1 + 1.4 * k0.y, m = k0.w;
  vec2 b = vec2(max(k1.w * .5 - m, .05), max(.5 - m, .05));
  float r = k1.x * min(b.x, b.y);
  vec2 rr = marc_rr(p, b, r);
  float sd = rr.x, ad = abs(sd), P = 4. * (b.x + b.y - 2. * r + r * PI * .5);
  float u = rr.y / P;
  // heartbeat: two bumps per beat
  float bt = fract(t / 1.15);
  float d1 = fract(bt - .08 + .5) - .5, d2 = fract(bt - .3 + .5) - .5;
  float beat = k1.y * (exp(-d1 * d1 / .0025) + .65 * exp(-d2 * d2 / .0036));
  float w = (.006 + .012 * k0.z) * (1. + 1.2 * beat);
  float core = 1. / (1. + sd * sd / (w * w));
  float n = max(uPalN, 1.);
  float base = .38;
  vec3 cb = marc_ramp(.72);
  vec3 acc = cb * base;
  float cs = 0., ws = base;
  float tau = .28 * P / max(K, 1.);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    if (fi >= K) break;
    float uk = fract(fi / K + t * sp * (1. + .07 * fi) / P);
    float bh = fract(uk - u) * P, ah = P - bh;
    float c = max(exp(-bh / tau) + .6 * exp(-bh / .04), exp(-ah / .02));
    vec3 ck = uPal[int(n - 1. - mod(fi, max(n - 2., 1.)))];
    acc += ck * c * 1.1; ws += c * 1.1; cs += c;
  }
  vec3 col = acc / ws;
  float lum = core * (base + 1.1 * cs) * (1. + .9 * beat) + .3 * cs * exp(-ad / .05) + .2 * beat * exp(-ad / .06);
  if (k1.z > 0.){
    // smoke: turbulence that hugs the line and drifts off it, lit by the comets
    float f = fbm(p * 4.5 + vec2(ad * 3., -ad * 5.) + vec2(t * .06, -t * .25));
    lum += k1.z * smoothstep(.5, .82, f) * exp(-ad / .09) * (.35 + .8 * cs + beat);
  }
  return vec4(col, clamp(lum, 0., 1.));
}
`;
