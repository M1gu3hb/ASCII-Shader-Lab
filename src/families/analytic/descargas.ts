/**
 * «Descargas eléctricas» (V-08): arcs between moving conductors. Each arc projects the cell onto the segment
 * between its two conductors (s in 0..1) and takes the point of the axis there pushed sideways by three
 * octaves of noise in (s, crackle time), held to zero at both ends by √(s(1 − s)); the brightness is a thin
 * core 1/(1 + d²/w²) plus an inner halo ∝ 1/d and a wide one ∝ e^(−d), from the distance d to that point
 * (projecting and then pushing is an approximation of the distance to the curve, good at cell size). Every arc
 * lives a few seconds, fades out and forms again with another shape (its seed), and so do its two branches,
 * so nothing switches on or off at once. Far from an arc only its halos are computed. «Tormenta» draws
 * sky-to-ground bolts with a leader that runs down, branches and a dim cloud band they light. Flicker is a
 * slow, shallow modulation (under 3 Hz). Written from the published description of the effect, not from any
 * shader's code.
 * Parameters: k0 = (layout, conductors, jaggedness, branches), k1 = (crackle, glow, flicker, motion).
 */
export const DESCARGAS_GLSL = /* glsl */ `
float desc_core(float d, float w){ return 1. / (1. + d * d / (w * w)); }
// sideways push of an arc's axis at s: three octaves, renewed with the seed, crackling with T
float desc_off(float s, float L, float sd, float T){
  return (gnoise(vec2(s * 3.5 * L + sd, T + sd)) - .5) * .8 + (gnoise(vec2(s * 10. * L + sd, T * 1.7 + 3.)) - .5) * .5
    + (gnoise(vec2(s * 28. * L, T * 3.1 + sd)) - .5) * .28;
}
// conductor i: on a slow ellipse with a drift of its own (star layout: conductor 0 is the centre)
vec2 desc_cond(float i, float n, float lay, float M){
  if (lay > .5 && i < .5) return vec2(.04 * sin(M * .7), .03 * cos(M * .53));
  float m = lay > .5 ? n - 1. : n, j = lay > .5 ? i - 1. : i;
  float a = TAU * j / m + .35 * sin(M * .21 + i * 1.7) + M * .07;
  vec2 c = lay > .5 ? vec2(.42 * cos(a), .34 * sin(a)) : vec2(.62 * cos(a), .3 * sin(a));
  return c + vec2(.07 * sin(M * (.37 + .05 * i) + i * 2.3), .05 * cos(M * (.29 + .04 * i) + i));
}
// one arc a→b at p (life envelope e; id: a whole number for this arc's life, the seed of its shape) with two
// branches; prog: how far down a leader has run (2: all of it); bt < 0: the branches live as long as the arc,
// else they renew on their own clock bt. (Hash inputs are whole numbers: float32 and float64 agree on them.)
float desc_arc(vec2 p, vec2 a, vec2 b, float id, float e, float bt, float T, float jag, float br, float hal, float prog){
  float sd = hash11(id * 3. + 1.) * 50.;
  vec2 ab = b - a;
  float L = max(length(ab), 1e-3);
  vec2 dir = ab / L, nrm = vec2(-dir.y, dir.x);
  float amp = jag * .4 * L;
  float s = clamp(dot(p - a, dir) / L, 0., 1.);
  float vis = 1. - smoothstep(prog - .03, prog, s);
  float d0 = sdSeg(p, a, b);
  float far = (.16 * hal * .015 / (d0 + .015) + .08 * hal * exp(-d0 / .07)) * vis;
  float w = smoothstep(amp + .1, amp + .16, d0);
  float v = far;
  if (w < 1.){
    vec2 c = a + ab * s + nrm * desc_off(s, L, sd, T) * jag * 1.1 * L * sqrt(s * (1. - s));
    float d = length(p - c);
    v = mix((desc_core(d, .009) + .16 * hal * .015 / (d + .015) + .08 * hal * exp(-d / .07)) * vis, far, w);
  }
  if (br > 0.) for (int j = 0; j < 2; j++){
    float fj = float(j);
    float g = bt < 0. ? 0. : bt * (.4 + .1 * fj) + fract(sd * .37 + fj * .5);
    float x = fract(g);
    float eb = bt < 0. ? 1. : smoothstep(0., .15, x) * (1. - smoothstep(.55, .85, x));
    if (eb <= 0.) continue;
    vec2 hb = hash22(vec2(id * 5. + fj * 3. + 1., floor(g) * 7. + fj));
    float sb = .2 + .6 * hb.x;
    vec2 o = a + ab * sb + nrm * desc_off(sb, L, sd, T) * jag * 1.1 * L * sqrt(sb * (1. - sb));
    vec2 bd = rot2(dir, (hb.y < .5 ? 1. : -1.) * (.45 + .6 * fract(hb.y * 7.3)));
    float lb = br * (.22 + .3 * fract(hb.x * 13.1)) * L;
    float wb = 1. - smoothstep(.06, .1, sdSeg(p, o, o + bd * lb) - .25 * jag * lb);
    if (wb <= 0.) continue;
    float q = clamp(dot(p - o, bd) / lb, 0., 1.);
    vec2 cb = o + bd * lb * q + vec2(-bd.y, bd.x) * (gnoise(vec2(q * 6. * lb + sd + fj, T * 1.3)) - .5) * .5 * jag * lb * q;
    float d = length(p - cb);
    float f = 1. - q;
    v += wb * eb * f * f * (desc_core(d, .008) + .12 * hal * .015 / (d + .015)) * (1. - smoothstep(prog - .03, prog, sb));
  }
  return e * v;
}
float F_descargas(vec2 p, float t, vec4 k0, vec4 k1){
  float lay = floor(k0.x + .5), n = clamp(floor(k0.y + .5), 2., 6.), jag = k0.z, br = k0.w;
  float T = t * (.5 + 6. * k1.x), hal = .25 + k1.y, M = t * (.15 + 1.2 * k1.w);
  float fl = 1. - k1.z * .3 * (.5 + .5 * sin(t * 13.)) * (.5 + .5 * sin(t * 2.3 + 1.));
  float v = 0.;
  if (lay < 1.5){
    // ring: each conductor to the next (one arc for two); star: the centre to each of the others
    float arcs = lay > .5 ? n - 1. : n < 2.5 ? 1. : n;
    for (int i = 0; i < 6; i++){
      float fi = float(i);
      if (fi >= arcs) break;
      vec2 a = desc_cond(lay > .5 ? 0. : fi, n, lay, M);
      vec2 b = desc_cond(lay > .5 ? fi + 1. : mod(fi + 1., n), n, lay, M);
      float g = t * (.11 + .04 * hash11(fi * 31. + 10.)) + hash11(fi * 77. + 5.);
      float x = fract(g);
      float e = smoothstep(0., .12, x) * (1. - smoothstep(.72, .92, x));
      if (e > 0.) v += desc_arc(p, a, b, floor(g) * 8. + fi, e, t, T, jag, br, hal, 2.);
    }
    if (lay < .5 && n > 3.5){
      // an intermittent arc across the ring
      float g = t * .19 + .3, x = fract(g);
      float e = .85 * smoothstep(0., .1, x) * (1. - smoothstep(.35, .55, x));
      if (e > 0.) v += desc_arc(p, desc_cond(0., n, lay, M), desc_cond(floor(n * .5), n, lay, M), floor(g) * 8. + 7., e, t, T, jag, br, hal, 2.);
    }
    for (int i = 0; i < 6; i++){
      float fi = float(i);
      if (fi >= n) break;
      float r = length(p - desc_cond(fi, n, lay, M));
      v += .55 * exp(-r / .015) + .2 * hal * exp(-r / .05);
    }
    return clamp(v * fl, 0., 1.);
  }
  // storm: bolts from the cloud band to the ground, each striking on a cycle of its own
  float cl = smoothstep(.02, .42, p.y) * smoothstep(.3, .85, fbm(p * vec2(1.5, 3.2) + vec2(M * .1, -M * .05)));
  float flash = 0.;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= n) break;
    float g = t * (.14 + .04 * fi) * (.6 + .8 * k1.w) + hash11(fi * 37. + 3.) * 10.;
    float x = fract(g), li = floor(g);
    float re = step(.5, hash11(li * 3. + fi * 17. + 5.));
    float env = smoothstep(0., .012, x) * exp(-max(x - .03, 0.) * 7.) + .4 * re * smoothstep(.1, .115, x) * exp(-max(x - .115, 0.) * 12.);
    if (env < .002) continue;
    vec2 h = hash22(vec2(li * 7. + fi * 13. + 1., fi * 3. + 2.));
    vec2 a = vec2((h.x - .5) * 1.5, .43), b = vec2(a.x + (h.y - .5) * .7, -.52);
    v += desc_arc(p, a, b, li * 8. + fi, env, -1., T * .25, .45 + .55 * jag, br, hal, smoothstep(0., .03, x) * 1.05);
    flash += env * exp(-length(p - a) / .5);
  }
  return clamp((v + (.45 + .35 * k1.z * flash) * cl) * fl, 0., 1.);
}
`;
