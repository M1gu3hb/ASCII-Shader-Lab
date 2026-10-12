/**
 * «Anillo de humo» (I-26): a ring of smoke around the centre, its radius bent by a noise read in polar
 * coordinates, its texture flowing outward, its colour taken from the palette by radius.
 *
 *  - Flow: the texture is a 3D value-noise fbm read at (direction θ, radius ρ): the direction as a point on a
 *    circle (no seam), ρ = 3(r − φ·L) + offset. As the phase φ grows the same texture is found farther out: it
 *    flows outward. Two layers half a cycle apart, each faded out where its phase wraps (a flow-map cross-fade),
 *    make the flow endless and exactly periodic; the directions turn «Giros» times per cycle.
 *  - Ring: the distance to the circle R₀ + A·(n − ½), n the flow noise, so the ring is bent differently at each
 *    angle and the bends travel; density e^(−d²/w²), its width and strength textured by a finer flow noise, wisps outside it that fade
 *    with distance (where the fine noise is high), and a faint core inside.
 *  - Colour by radius: the palette as a gradient from inside to outside the ring (its spread is a control); the
 *    glyph comes from the density.
 * Everything is a function of t mod «Ciclo»: an exact loop.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (radius, thickness, wobble, detail), k1 = (wisps, cycle, core, colour spread),
 * K2 = (turns per cycle, outward flow).
 */
export const ANILLO_HUMO_GLSL = /* glsl */ `
vec3 ah_grad(float g){
  float N = max(uPalN, 1.);
  float x = clamp(g, 0., 1.) * (N - 1.);
  float i = floor(x);
  return mix(uPal[int(i)], uPal[int(min(i + 1., N - 1.))], x - i);
}
// the flow noise at direction d and radius r, phase ph of the cycle (two layers cross-faded)
float ah_flow(vec2 d, float r, float ph, float det, float L, float o){
  float p1 = fract(ph), p2 = fract(ph + .5);
  float a = fbm3(vec3(d * det, 3. * (r - p1 * L)) + vec3(o, 0., 0.));
  float b = fbm3(vec3(d * det, 3. * (r - p2 * L)) + vec3(o + 5.3, 0., 0.));
  float wa = 1. - abs(2. * p1 - 1.);
  return mix(b, a, wa);
}
vec4 FC_anillo_humo(vec2 p, float t, vec4 k0, vec4 k1){
  float P = k1.y, ph = fract(t / P);
  float r = length(p);
  float a = TAU * K2.x * ph;
  vec2 d = r > 1e-5 ? rot2(p / r, a) : vec2(1., 0.);
  float L = .15 + .5 * K2.y;
  float n = ah_flow(d, r, ph, 1.3 * k0.w, L, 0.);
  float n2 = ah_flow(d, r, ph, 3.1 * k0.w, L, 11.);
  float R0 = k0.x, w = k0.y;
  float dr = r - R0 - k0.z * .16 * (n - .5) * 2.;
  float we = w * (.55 + .9 * n2);
  float ring = exp(-dr * dr / (we * we)) * (.55 + .6 * n2);
  float wisp = k1.x * smoothstep(0., .03, dr) * exp(-dr / (.05 + .15 * k1.x)) * smoothstep(.45, .75, n2);
  float core = k1.z * .35 * exp(-r / (.35 * R0)) * (.6 + .4 * n);
  float dens = smoothstep(.05, 1., ring + wisp + core);
  float g = .5 + (r - R0) / (.05 + .5 * k1.w);
  vec3 gc = ah_grad(g);
  vec3 col = gc * (.35 + .65 * smoothstep(0., .6, dens));
  // the glyph is the density, a little denser where the radius' colour is brighter
  float hi = 0.;
  for (int i = 0; i < 6; i++){ if (float(i) >= uPalN) break; hi = max(hi, dot(uPal[i], vec3(.299, .587, .114))); }
  return vec4(col, dens * (.72 + .28 * dot(gc, vec3(.299, .587, .114)) / max(hi, .05)));
}
`;
