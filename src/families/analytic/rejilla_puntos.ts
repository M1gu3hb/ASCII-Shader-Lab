/**
 * «Rejilla de puntos» (I-28): a square lattice of dots on a plane seen in perspective that undulates, with no
 * sun: points, not lines, over an empty sky.
 *
 *  - Camera at height 1 over the plane y = 0, looking forward and pitched down by α («Inclinación»), focal
 *    1.1; it travels forward («Avance») and sways sideways. A lattice point (i·s, j·s) rises to the height
 *    h = A·(two crossing waves + a circular ripple from a point ahead of the camera).
 *  - For each cell the ray through it meets the flat plane at depth Z₀; the lattice rows j around (Z₀ + travel)/s
 *    (nine of them, enough for the waves' lift) are tested: in each row the nearest column at that depth, its
 *    point lifted by h and projected; the cell is lit by the nearest projected dot (a disc whose radius shrinks
 *    with depth, never under half a cell). Rows closer on the screen than about a cell fade out (no moiré),
 *    and a distance fog dims the far ones; dots higher on a wave are brighter.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (spacing, wave height, wavelength, wave speed), k1 = (travel, tilt, dot size, fog),
 * K2 = (ripple, sway).
 */
export const REJILLA_PUNTOS_GLSL = /* glsl */ `
float rp_h(vec2 w, float t, vec4 k0, float rip, float zw){
  float k = TAU / (.5 + 2.5 * k0.z);
  float sp = .4 + 2.2 * k0.w;
  float h = sin(w.x * k + t * sp) * cos(w.y * k * .8 - t * sp * .7) + .5 * sin((w.x + w.y) * k * 1.7 + t * sp * 1.3);
  vec2 d = w - vec2(0., zw + 4.);
  float r = length(d);
  h += rip * 1.4 * sin(r * k * 1.3 - t * sp * 1.6) / (1. + .35 * r);
  return .12 * k0.y * h;
}
float F_rejilla_puntos(vec2 p, float t, vec4 k0, vec4 k1){
  float s = k0.x, f = 1.1;
  float al = radians(mix(10., 42., k1.y));
  float ca = cos(al), sa = sin(al);
  float den = f * sa - p.y * ca;
  if (den <= .02) return 0.;
  float zw = k1.x * t * .5;
  float cx = K2.y * .7 * sin(t * .21);
  float lam = 1. / den;
  float Z0 = lam * (p.y * sa + f * ca);
  float j0 = floor((Z0 + zw) / s + .5);
  float best = 0., A = .12 * k0.y + 1e-3;
  for (int m = -4; m <= 4; m++){
    float j = j0 + float(m);
    float Z = j * s - zw;
    if (Z < .05) continue;
    float zc0 = sa + Z * ca;
    float i = floor((p.x * zc0 / f + cx) / s + .5);
    vec2 w = vec2(i * s, j * s);
    float h = rp_h(w, t, k0, K2.x, zw);
    float yc = (h - 1.) * ca + Z * sa, zc = -(h - 1.) * sa + Z * ca;
    if (zc < .1) continue;
    vec2 q = vec2((w.x - cx) * f / zc, yc * f / zc);
    float rd = max(k1.z * s * .36 * f / zc, .75 * PX);
    float fade = smoothstep(.15 * PX, .9 * PX, f * s / (zc * zc)) * exp(-zc * k1.w * .3);
    float v = (1. - smoothstep(.5 * rd, rd, length(p - q))) * fade * (.5 + .5 * clamp(.5 + .5 * h / A, 0., 1.));
    best = max(best, v);
  }
  return clamp(best, 0., 1.);
}
`;
