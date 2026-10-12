/**
 * «Tejido de bandas» (I-17): a woven cloth whose warp (vertical) and weft (horizontal) threads come in bands
 * of the palette's colours, crossing over and under; the crossings flip as a wave runs across the cloth.
 *
 *  - The cloth is a lattice of threads: warp i at x = (i + ½)/n, weft j at y = (j + ½)/n (n threads per
 *    screen height), each «Grosor» of its spacing wide. Warp threads take their colour by bands of «Banda»
 *    threads, weft threads by bands one thread wider, so the two sets of stripes make blocks of colour.
 *  - At crossing (i, j) the weave says which thread is on top: plain weave alternates like a chequerboard,
 *    twill shifts by one thread per row (diagonals), blocks alternate warp-faced and weft-faced squares of
 *    2·«Banda» threads (most crossings show the warp in one and the weft in the other).
 *  - The crossing state is a signed height h = cos(π·(s₀ + ⌊φ⌋ + smoothstep(.75, 1, fract φ))), with
 *    φ = t·speed − (i, j)·d a phase that runs across the cloth in direction d: each time a front passes, the
 *    thread on top goes under (smoothly) and the other comes up. Between crossings a thread's height goes from
 *    one crossing's to the next.
 *  - The visible thread is shaded by its round profile and its height (the one going under darkens), with a
 *    fibre texture along it and a sheen on its crown; the gaps between threads are dark.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (threads, width, band, weave), k1 = (crossing speed, direction, sheen, drift).
 */
export const TEJIDO_BANDAS_GLSL = /* glsl */ `
vec3 tj_pal(float i){ return uPal[int(mod(i, max(uPalN, 1.)))]; }
// which thread is on top at crossing (i, j) before any flip: 1 the warp, 0 the weft
float tj_base(float i, float j, float wv, float bw){
  if (wv < .5) return 1. - mod(i + j, 2.);
  if (wv < 1.5) return step(mod(i + j, 4.), 1.5);
  float B = 2. * bw;
  float warpFaced = 1. - mod(floor(i / B) + floor(j / B), 2.);
  float odd = 1. - step(.5, mod(i + j, 4.));
  return warpFaced > .5 ? 1. - odd : odd;
}
// the warp's signed height at crossing (i, j) at time t: +1 on top, −1 under
float tj_h(float i, float j, float t, vec4 k0, vec4 k1){
  float a = radians(k1.y);
  float ph = t * k1.x * .35 - dot(vec2(i, j), vec2(cos(a), sin(a))) * .09;
  return cos(PI * (tj_base(i, j, k0.w, k0.z) + floor(ph) + smoothstep(.75, 1., fract(ph))));
}
vec4 FC_tejido_bandas(vec2 p, float t, vec4 k0, vec4 k1){
  float n = k0.x, tw = k0.y, bw = k0.z;
  vec2 u = p * n + k1.w * t * vec2(.6, .22);
  vec2 c = floor(u), f = fract(u) - .5;
  float i = c.x, j = c.y;
  // the threads take the palette's colours after the first, which is the ground seen between them
  float N = max(uPalN - 1., 1.), o = uPalN > 1.5 ? 1. : 0.;
  vec3 cw = tj_pal(o + floor(hash12(vec2(floor(i / bw), 5.)) * N));
  vec3 cf = tj_pal(o + floor(hash12(vec2(floor(j / (bw + 1.)), 9.)) * N));
  float hw = tj_h(i, j, t, k0, k1);
  float hf = .5 * tw;
  float inW = step(abs(f.x), hf), inF = step(abs(f.y), hf);
  vec3 bg = uPal[0] * .35;
  if (inW + inF < .5) return vec4(bg, 0.);
  // which thread shows: at the crossing the one on top, elsewhere the only one there
  float warp = inW * inF > .5 ? step(0., hw) : inW;
  float off, h, along;
  if (warp > .5){
    // the warp between this crossing and the next one up or down
    float hn = tj_h(i, j + sign(f.y), t, k0, k1);
    h = mix(hw, hn, smoothstep(0., 1., abs(f.y)));
    off = f.x; along = u.y;
  } else {
    float hn = -tj_h(i + sign(f.x), j, t, k0, k1);
    h = mix(-hw, hn, smoothstep(0., 1., abs(f.x)));
    off = f.y; along = u.x;
  }
  float prof = sqrt(max(1. - (off / hf) * (off / hf), 0.));
  float shade = prof * (.42 + .58 * (.5 + .5 * h));
  shade *= 1. - .22 * gnoise(vec2(along * 7., off * 9. + (warp > .5 ? i : j) * 3.1));
  float sheen = k1.z * pow(prof, 6.) * (.5 + .5 * h);
  vec3 col = warp > .5 ? cw : cf;
  float lc = dot(col, vec3(.299, .587, .114));
  vec3 rgb = col * (.3 + .7 * shade) + sheen * .35;
  float lum = clamp(shade * (.55 + .45 * lc) + sheen * .5, 0., 1.);
  return vec4(clamp(rgb, 0., 1.), lum);
}
`;
