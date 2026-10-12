/**
 * «Estratos» (I-23): layers of rock seen in section, their boundaries folded by tectonic warping and cut by
 * faults, each layer a colour of the palette on a paper grain.
 *
 *  - The layers are the level sets of a depth z(p, t): z = y, plus folds (a long wave across x whose phase
 *    creeps with the tectonics and whose height changes with depth: anticlines and synclines), plus a slow
 *    fbm warp, plus each fault's throw. A fault is a steep line (from the seed of the family: a hash of its
 *    index); across it z jumps by its throw Δ (which breathes slowly) and the layers near it bend (drag).
 *    «Sedimentación» moves z with time: the layers rise or sink without end.
 *  - Layer s = ⌊g(z·L)⌋ with g(u) = u + .3 sin .9u + .15 sin(2.3u + 1), monotonic, so layers have unequal
 *    thicknesses. Each layer takes one colour of the palette (a cyclic shift per block of N layers, so
 *    neighbours differ) and a brightness of its own; the colour is the same everywhere in the layer.
 *  - The glyph comes from the layer's brightness times a paper grain (fine fbm and a speckle about a cell
 *    across), darkened along the boundaries between layers (the ink line).
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (layers, folding, fold length, warp), k1 = (faults, throw, grain, sedimentation),
 * K2 = (boundary lines, tectonic speed).
 */
export const ESTRATOS_GLSL = /* glsl */ `
vec3 st_pal(float i){ return uPal[int(mod(i, max(uPalN, 1.)))]; }
// the depth whose level sets are the layers
float st_z(vec2 p, float t, vec4 k0, vec4 k1){
  float tc = t * K2.y;
  float kf = TAU / (.45 + 1.3 * k0.z);
  float z = p.y;
  z += k0.y * .1 * sin(p.x * kf + tc * .35) * (.65 + .35 * sin(p.y * 4.1 + 1.3)) * (1. + .45 * sin(p.x * kf * .41 + 2.));
  z += k0.w * .16 * (fbm(p * 1.9 + vec2(tc * .04, 3.1)) - .5);
  for (int f = 0; f < 4; f++){
    float ff = float(f);
    if (ff >= k1.x) break;
    vec2 c = vec2(hash12(vec2(ff, 11.)) * 1.4 - .7, hash12(vec2(ff, 13.)) * .5 - .25);
    float a = (hash12(vec2(ff, 17.)) - .5) * 1.1 + PI * .5;
    vec2 n = vec2(sin(a), -cos(a));
    float d = dot(p - c, n);
    float D = k1.y * .1 * (.55 + .45 * hash12(vec2(ff, 19.))) * (1. + .35 * sin(tc * .3 + ff * 2.1));
    z += D * smoothstep(-.003, .003, d) + D * .45 * sign(d) * exp(-abs(d) / .035);
  }
  return z + k1.w * t * .03;
}
vec4 FC_estratos(vec2 p, float t, vec4 k0, vec4 k1){
  float u = st_z(p, t, k0, k1) * k0.x;
  float g = u + .3 * sin(u * .9) + .15 * sin(u * 2.3 + 1.);
  float s = floor(g), f = g - s;
  // the layers take the palette's colours after the first (the darkest, left for the ink lines)
  float N = max(uPalN - 1., 1.), o = uPalN > 1.5 ? 1. : 0.;
  float idx = o + mod(s + floor(hash12(vec2(floor(s / N), 7.)) * N), N);
  vec3 col = st_pal(idx);
  float base = .45 + .55 * hash12(vec2(s, 23.));
  float grain = 1. - k1.z * (.55 * fbm(p * 24. + s * 3.7) + .35 * gnoise(p / PX * .9 + 41.) - .45);
  float edge = smoothstep(0., .1, f) * smoothstep(1., .9, f);
  float lum = clamp(base * grain * (1. - K2.x * (1. - edge)), 0., 1.);
  return vec4(col, lum);
}
`;
