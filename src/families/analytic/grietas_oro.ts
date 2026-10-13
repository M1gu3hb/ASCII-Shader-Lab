/**
 * «Grietas de oro» (I-06, «Mejora de grietas»): the cracks of the grietas pattern (Voronoi edges, F2 − F1) over a
 * warped plane, but they appear in time. Each cycle a front leaves an origin; an edge opens when the front reaches
 * it (each edge a little early or late: a hash of the two cells it separates), so the cracks run outwards from
 * the origin. An open crack fills with molten metal: white hot behind the front, cooling to its colour; it widens
 * a little with age and bleeds into the stone around it (a glow whose reach grows with time). Finer cracks (a
 * second Voronoi, smaller) open later. Sparks of metal dust rise from the hot seams. Near the end of the cycle the
 * seams cool and close, and the cycle starts again on intact stone: the same network (an exact loop of «Ciclo»
 * seconds) or a new one each time («Trazado nuevo»: continuous, never repeating). Every time dependence goes
 * through the cycle's phase (whole numbers of dust cells and shimmer waves per cycle), so the loop is exact.
 * The stone takes the piece's palette; the metal its own heat ramp. Written from the description of the effect.
 * k0 = (metal, scale, warp, width), k1 = (cycle s, origin, bleed, dust), K2 = (fine cracks, jitter, renew, heat).
 */
export const GRIETAS_ORO_GLSL = /* glsl */ `
vec3 go_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
// the molten metal by temperature (0 cold … 1 white hot)
vec3 go_metal(float m, float x){
  vec3 a = vec3(.32, .1, 0.), b = vec3(.85, .48, .07), c = vec3(1., .8, .32), d = vec3(1., .97, .85);
  if (m > .5 && m < 1.5){ a = vec3(.28, .05, .02); b = vec3(.8, .3, .1); c = vec3(1., .62, .42); d = vec3(1., .92, .85); }
  else if (m > 1.5 && m < 2.5){ a = vec3(.18, .2, .24); b = vec3(.55, .6, .68); c = vec3(.88, .92, .97); d = vec3(1.); }
  else if (m > 2.5){ a = vec3(.3, 0., 0.); b = vec3(.9, .14, .02); c = vec3(1., .55, .08); d = vec3(1., .92, .55); }
  x = clamp(x, 0., 1.) * 3.;
  return x < 1. ? mix(a, b, x) : x < 2. ? mix(b, c, x - 1.) : mix(c, d, x - 2.);
}
// Voronoi of fixed points: F1, F2 and the lattice cells of the two nearest points
vec4 go_voro(vec2 x, out vec2 i2){
  vec2 n = floor(x), f = fract(x), i1 = n;
  float f1 = 8., f2 = 8.;
  i2 = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 o = .15 + .7 * hash22(n + g);
    float d = length(g + o - f);
    if (d < f1){ f2 = f1; i2 = i1; f1 = d; i1 = n + g; } else if (d < f2){ f2 = d; i2 = n + g; }
  }
  return vec4(f1, f2, i1);
}
vec4 FC_grietas_oro(vec2 p, float t, vec4 k0, vec4 k1){
  float metal = floor(k0.x + .5), k = k0.y, wa = k0.z, wd = k0.w;
  float P = k1.x, org = floor(k1.y + .5), bleed = k1.z, dust = k1.w;
  float fine = K2.x, jit = K2.y, renew = K2.z, heat = K2.w;
  float cyc = floor(t / P), ph = t / P - cyc;
  // the network: the same every cycle, or a new one
  vec2 sh = renew > .5 ? 40. * hash22(vec2(cyc + 1., 3.7)) : vec2(0.);
  vec2 o = org < .5 ? vec2(0.) : org < 1.5 ? vec2(-.85, -.05) : org < 2.5 ? vec2(.1, -.48)
    : (hash22(vec2((renew > .5 ? cyc : 0.) + 2., 9.1)) - .5) * vec2(1.5, .8);
  float dmax = length(vec2(.9 + abs(o.x), .5 + abs(o.y)));
  // the plane warped (cracks wander), then the two Voronoi scales
  vec2 w = vec2(fbm(p * 1.7 + sh), fbm(p * 1.7 + sh + vec2(5.2, 1.3))) - .5;
  vec2 pw = p + wa * .35 * w;
  vec2 j1, j2;
  vec4 v1 = go_voro(pw * k + sh, j1);
  vec4 v2 = go_voro(pw * k * 2.3 + sh + 11.7, j2);
  float e1 = (v1.y - v1.x) / k, e2 = (v2.y - v2.x) / (k * 2.3);
  // when the front reaches this point (phase), each edge a little early or late
  float dist = length(p - o);
  // the front leaves the blow fast and slows down as it spreads (radius ∝ phase^0.62)
  float r1 = .55 * pow((dist + jit * .4 * hash12(v1.zw + j1 + 3.1)) / (dmax + .4 * jit), 1.6);
  float r2 = r1 + .1 + .12 * jit * hash12(v2.zw + j2 + 7.3);
  float a1 = ph - r1, a2 = ph - r2;
  float close = smoothstep(.8, 1., ph);
  float W = PX * .6 + wd * .016;
  float o1 = smoothstep(0., .04, a1) * (1. - close), o2 = smoothstep(0., .04, a2) * (1. - close) * fine;
  float c1 = o1 * (1. - smoothstep(W * (.55 + .45 * smoothstep(0., .3, a1)), W + PX, e1));
  float c2 = o2 * (1. - smoothstep(W * .45, W * .55 + PX, e2));
  float fill = max(c1, c2);
  // temperature: white hot behind the front, cooling with age (slower with «Calor»)
  float cool = .08 + .3 * heat;
  float temp = max(exp(-max(a1, 0.) / cool) * step(0., a1), .8 * exp(-max(a2, 0.) / cool) * step(0., a2));
  temp = max(temp, .35 * heat);
  // the shimmer of molten metal running along the seams (whole waves per cycle)
  float sw = .85 + .15 * sin(dist * 55. - ph * TAU * floor(P * .6 + 1.) + hash12(v1.zw) * 6.283);
  // the metal bleeds into the stone: a glow whose reach grows with age
  float reach = PX * .5 + bleed * .035 * (.3 + .7 * smoothstep(0., .45, a1));
  float glow = o1 * exp(-max(e1 - W, 0.) / reach) + .6 * o2 * exp(-max(e2 - W * .5, 0.) / (reach * .6));
  glow = min(glow, 1.) * (.5 + .5 * temp);
  // the blow: a glow gathers at the origin over the last moments of the cycle and fades as the cracks leave it
  float imp = (ph < .5 ? exp(-ph * 25.) : smoothstep(.9, 1., ph)) * exp(-dist * dist / .006);
  glow = max(glow, imp);
  // the stone: a tone per plate and a fine grain
  float sl = .04 + .11 * hash12(v1.zw + .5) + .08 * (fbm(p * 5. + sh) - .5);
  sl *= .88 + .12 * smoothstep(0., .03, e1);
  // dust: sparks that rise from the hot seams, a whole number of cells per cycle
  vec2 dq = vec2(p.x * 22., p.y * 22. - ph * floor(P * 1.1 + 1.));
  vec2 dc = floor(dq);
  vec2 dp = dc + .2 + .6 * hash22(dc + sh + 1.3);
  float life = fract(hash12(dc + 4.1) + ph * floor(P * .3 + 1.));
  float spark = (1. - smoothstep(.12, .35, length(dq - dp))) * sin(PI * life) * dust * (1. - close);
  spark *= smoothstep(.05, .5, glow + fill);
  vec3 stone = go_ramp(sl * 2.2);
  vec3 mc = go_metal(metal, .3 + .7 * temp) * sw;
  vec3 col = mix(stone + go_metal(metal, .2 + .4 * temp) * glow * .7, mc, fill) + go_metal(metal, .85) * spark;
  // brighter metals take denser glyphs
  float ml = dot(mc, vec3(.299, .587, .114));
  float lum = mix(sl + glow * .5, (.55 + .5 * ml) * sw, fill) + spark * .8;
  return vec4(clamp(col, 0., 1.), clamp(lum, 0., 1.));
}
`;
