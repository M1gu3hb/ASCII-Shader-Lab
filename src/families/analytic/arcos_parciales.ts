/**
 * «Arcos parciales» (I-30): incomplete arcs of different radii and thicknesses turning at different rates in
 * one inclined plane.
 *
 *  - The plane is tilted about the horizontal axis by «Inclinación» (plus a slow balance, once per cycle) and
 *    seen head-on: a screen point (x, y) is the plane point (x, y / cos tilt), so circles look like ellipses.
 *  - Ring i (of n, from the inner radius to the outer one) has its own thickness (a hash, «Variación»), its arc
 *    length (a fraction of the turn), «Arcos por anillo» copies of it around, a start angle and an integer
 *    number of turns per cycle, clockwise or not (up to «Ritmos»): rings turn at different rates and the whole
 *    returns exactly after «Ciclo» seconds.
 *  - Along each arc the brightness rises from its tail to its head (in the sense it turns: «Cola»), the ends
 *    are rounded, and the near half of the plane is a little brighter than the far one. Each ring has its own
 *    brightness, so the palette gives each its tone.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (rings, opening, thickness, thickness variation), k1 = (arc length, tilt, cycle, rates),
 * K2 = (tail, balance, arcs per ring, size).
 */
export const ARCOS_PARCIALES_GLSL = /* glsl */ `
float F_arcos_parciales(vec2 p, float t, vec4 k0, vec4 k1){
  float ph = fract(t / k1.z);
  float tl = radians(k1.y) + K2.y * .18 * sin(TAU * ph);
  float ct = max(cos(tl), .08);
  vec2 q = vec2(p.x, p.y / ct);
  float r = length(q), a = atan(q.y, q.x + 1e-6);
  float Ro = K2.w, Ri = Ro * (1. - .85 * k0.y);
  float n = k0.x, m = K2.z;
  float near = .86 + .14 * (-sin(a)) * sign(sin(tl));
  float v = 0.;
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    if (fi >= n) break;
    float R = mix(Ri, Ro, (fi + .5) / n);
    float w = k0.z * .6 * (Ro - Ri + .05) / n * (1. - .8 * k0.w * hash12(vec2(fi, 3.)));
    w = max(w, .5 * PX / ct);
    float d = abs(r - R);
    if (d > w + PX / ct) continue;
    float dir = hash12(vec2(fi, 7.)) < .5 ? -1. : 1.;
    float turns = dir * floor(1. + hash12(vec2(fi, 5.)) * k1.w);
    float seg = TAU / m;
    float span = seg * clamp(k1.x * (.45 + .9 * hash12(vec2(fi, 11.))), .06, .94);
    float u = mod(a - TAU * (hash12(vec2(fi, 9.)) + turns * ph), seg);
    float soft = 1.2 * PX / R;
    float ends = smoothstep(0., soft, u) * smoothstep(span, span - soft, u);
    float s = clamp(u / span, 0., 1.);
    float head = dir > 0. ? s : 1. - s;
    float b = (.72 + .28 * hash12(vec2(fi, 13.))) * mix(1. - .8 * K2.x, 1., head);
    float cov = 1. - smoothstep(w - .6 * PX / ct, w + .4 * PX / ct, d);
    v = max(v, b * ends * cov * near);
  }
  return clamp(v, 0., 1.);
}
`;
