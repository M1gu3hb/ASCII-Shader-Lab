/**
 * «Letrero de neón» (I-13, inventario PR #10): glass tubes bent into shapes — a heart, a star, rainbow arcs, a
 * word (LUZ) or a whole sign — drawn from their distance fields (a heart as a polyline of the classic heart
 * curve, a star as a ten-sided polygon, letters as segments and arcs). Each tube is a group with its own
 * colour, ignition time and faults:
 *  - a power cycle: the tubes ignite one after another, each stuttering (on and off at random for half a
 *    second) before it holds; one tube can stay faulty; near the end of the cycle the sign goes dark and starts
 *    again — the whole sequence repeats exactly every «Ciclo» seconds;
 *  - an electric hum and brief dropouts while lit;
 *  - the tube: a white-hot core inside a coloured glow; unlit tubes show as faint glass;
 *  - light that drips from the lowest points of the lit tubes and falls;
 *  - the wall behind: bricks that show only where the neon lights them, and a reflection of the sign on the
 *    wet floor below (the sign seen mirrored through a small ripple).
 * Colour per cell: each tube's colour, white in its core, the wall lit by it. Written from the description of
 * the effect, not from any shader's code.
 *
 * k0 = (shape, hue, second hue, thickness), k1 = (glow, flicker, cycle s, ignition pace),
 * K2 = (drips, reflection, wall, fault), K3 = (size).
 */
export const NEON_GLSL = /* glsl */ `
vec3 neo_hue(float h){ return .5 + .5 * cos(TAU * (h - vec3(0., .333, .667))); }
float neo_arc(vec2 q, vec2 c, float R, float a0, float a1){
  vec2 d = q - c;
  float a = atan(d.y, d.x);
  if (a >= a0 && a <= a1) return abs(length(d) - R);
  return min(length(q - c - R * vec2(cos(a0), sin(a0))), length(q - c - R * vec2(cos(a1), sin(a1))));
}
// nearest tube of the sign at q (in the sign's units): its distance and its group
float NEO_G;
void neo_take(float d, float g, inout float best){ if (d < best){ best = d; NEO_G = g; } }
float neo_heart(vec2 q, vec2 c, float s){
  float d = 1e3;
  vec2 a = c + s * vec2(0., 5. / 17.);
  for (int i = 1; i <= 28; i++){
    float u = float(i) / 28. * TAU;
    float su = sin(u);
    vec2 b = c + s * vec2(16. * su * su * su, 13. * cos(u) - 5. * cos(2. * u) - 2. * cos(3. * u) - cos(4. * u)) / 17.;
    d = min(d, sdSeg(q, a, b));
    a = b;
  }
  return d;
}
float neo_star(vec2 q, vec2 c, float R){
  float d = 1e3;
  vec2 a = c + vec2(0., R);
  for (int i = 1; i <= 10; i++){
    float an = PI * .5 + float(i) * PI / 5.;
    vec2 b = c + (mod(float(i), 2.) > .5 ? .45 * R : R) * vec2(cos(an), sin(an));
    d = min(d, sdSeg(q, a, b));
    a = b;
  }
  return d;
}
// the word LUZ in a box of height h whose lower left corner is o: three groups, from g0
void neo_word(vec2 q, vec2 o, float h, float g0, inout float best){
  vec2 L = o, U = o + vec2(.95 * h, 0.), Z = o + vec2(1.95 * h, 0.);
  neo_take(min(sdSeg(q, L + vec2(0., h), L), sdSeg(q, L, L + vec2(.6 * h, 0.))), g0, best);
  neo_take(min(min(sdSeg(q, U + vec2(0., h), U + vec2(0., .35 * h)), sdSeg(q, U + vec2(.6 * h, .35 * h), U + vec2(.6 * h, h))),
    neo_arc(q, U + vec2(.3 * h, .35 * h), .3 * h, -PI, 0.)), g0 + 1., best);
  neo_take(min(min(sdSeg(q, Z + vec2(0., h), Z + vec2(.62 * h, h)), sdSeg(q, Z + vec2(.62 * h, h), Z)), sdSeg(q, Z, Z + vec2(.62 * h, 0.))), g0 + 2., best);
}
float neo_sign(vec2 q, float shape){
  float best = 1e3;
  NEO_G = 0.;
  if (shape < .5){ neo_take(neo_heart(q, vec2(0., .03), .3), 0., best); }
  else if (shape < 1.5){ neo_take(neo_star(q, vec2(0., -.01), .34), 0., best); }
  else if (shape < 2.5){
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      neo_take(neo_arc(q, vec2(0., -.2), .2 + .1 * fi, .12, PI - .12), fi, best);
    }
  } else if (shape < 3.5){ neo_word(q, vec2(-.39, -.15), .3, 0., best); }
  else {
    neo_word(q, vec2(-.27, -.2), .2, 0., best);
    neo_take(neo_arc(q, vec2(0., -.13), .4, .2, PI - .2), 3., best);
    neo_take(neo_arc(q, vec2(0., -.13), .47, .2, PI - .2), 4., best);
    neo_take(neo_heart(q, vec2(-.5, -.1), .1), 5., best);
    neo_take(neo_star(q, vec2(.5, -.08), .1), 6., best);
  }
  return best;
}
// how lit group g is at time τ of the cycle P: ignition with stutter, hum and dropouts, the faulty tube fg, dark end
float neo_on(float g, float tau, float P, float seq, float fli, float fault, float fg){
  float tg = P * (.04 + seq * .11 * g);
  float x = tau - tg;
  if (x < 0. || tau > P * .88) return 0.;
  float on = 1.;
  if (x < .6) on = step(.45, hash12(vec2(floor(x * 18.), g + 1.))) * (.6 + .4 * x / .6);
  float m = floor(9. * P + .5);
  on *= 1. - fli * .22 * (.5 + .5 * sin(TAU * m * tau / P + g));
  on *= 1. - .75 * step(1. - fli * .1, hash12(vec2(floor(tau * 15.), g + 3.)));
  // the faulty tube (the second one; the only one in a heart or a star)
  if (abs(g - fg) < .5) on *= 1. - .9 * step(1. - fault * .45, hash12(vec2(floor(tau * 11.), 7.)));
  return on;
}
// the lowest points of the tubes, where light drips (and the tube each one hangs from)
vec2 neo_drip(float shape, float j, out float g){
  g = 0.;
  if (shape < .5) return vec2((j - 1.) * .09, -.27 + .09 * abs(j - 1.));
  if (shape < 1.5) return j < .5 ? vec2(-.2, -.295) : j < 1.5 ? vec2(.2, -.295) : vec2(0., -.163);
  if (shape < 2.5){ g = j; float R = .2 + .1 * j; return vec2(.993 * R, -.2 + .1197 * R); }
  g = j;
  if (shape < 3.5) return j < .5 ? vec2(-.21, -.15) : j < 1.5 ? vec2(-.015, -.15) : vec2(.381, -.15);
  return j < .5 ? vec2(-.15, -.2) : j < 1.5 ? vec2(-.02, -.2) : vec2(.244, -.2);
}
vec4 FC_neon_tubos(vec2 p, float t, vec4 k0, vec4 k1){
  float shape = floor(k0.x + .5), h1 = k0.y, h2 = k0.z;
  float S = mix(.75, 1.35, K3.x);
  float w = PX * (.3 + 1.1 * k0.w) / S;
  float glo = k1.x, fli = k1.y, P = max(k1.z, 2.), seq = k1.w;
  float drip = K2.x, refl = K2.y, wall = K2.z, fault = K2.w;
  // the cycle starts with the sign igniting (a thumbnail at t = 0 shows part of it lit); it goes dark and re-ignites later
  float tau = mod(t + .2 * P, P);
  vec2 q = p / S;
  float d = neo_sign(q, shape);
  float g = NEO_G;
  float fg = shape < 1.5 ? 0. : 1.;
  float on = neo_on(g, tau, P, seq, fli, fault, fg);
  vec3 hc = neo_hue(mod(g, 2.) < .5 ? h1 : h2);
  // the tube: a white-hot core, a coloured glow around it, faint glass when it is off
  float core = 1. - smoothstep(.4 * w, w, d);
  float gw = (.012 + .05 * glo) / S;
  float glow = exp(-d / gw);
  float tube = on * (core + .7 * glow) + .14 * core * (1. - on);
  vec3 acc = on * (core * mix(hc, vec3(1.), .55) + .7 * glow * hc) + .14 * core * (1. - on) * vec3(.55, .6, .7);
  float lum = tube;
  // the wall: bricks lit only by the neon's spill
  float spill = on * exp(-d / ((.045 + .07 * glo) / S));
  float row = floor(p.y / .045);
  float fy = fract(p.y / .045), fx = fract(p.x / .09 + .5 * mod(row, 2.));
  float brick = smoothstep(.08, .22, min(fy, 1. - fy)) * smoothstep(.04, .11, min(fx, 1. - fx));
  float wl = wall * .4 * spill * (.1 + .9 * brick);
  acc += wl * hc * .8;
  lum += wl;
  // light that drips from the lowest points of the lit tubes
  float Pd = P / max(floor(P / 2.5), 1.);
  for (int j = 0; j < 6; j++){
    // three points, two drops in the air from each
    float fj = mod(float(j), 3.);
    float gj;
    vec2 sp = neo_drip(shape, fj, gj);
    float a = mod(tau + fj * .37 * Pd + floor(float(j) / 3.) * .5 * Pd, Pd);
    float fall = .45 * a * a;
    vec2 dp = sp * S + vec2(0., -fall);
    float dd = sdSeg(p, dp, dp + vec2(0., .012 + min(.07, .12 * a)));
    float dv = drip * neo_on(gj, tau, P, seq, fli, fault, fg) * (exp(-dd * dd / (PX * PX * .5)) + .35 * exp(-dd / .018)) * (1. - a / Pd);
    acc += dv * neo_hue(mod(gj, 2.) < .5 ? h1 : h2);
    lum += dv;
  }
  // the reflection on the wet floor: the sign mirrored below its base, through a ripple
  // the floor line, just under the sign's lowest tube
  float yb = (shape < .5 ? -.31 : shape < 1.5 ? -.335 : shape < 2.5 ? -.22 : shape < 3.5 ? -.19 : -.24) * S;
  if (p.y < yb && refl > 0.){
    float m2 = floor(3. * P + .5);
    vec2 pr = vec2(p.x + .008 * sin(p.y * 90. + TAU * m2 * tau / P), 2. * yb - p.y) / S;
    float dr = neo_sign(pr, shape);
    float gr = NEO_G;
    float onr = neo_on(gr, tau, P, seq, fli, fault, fg);
    float rv = refl * .45 * onr * (1. - smoothstep(.4 * w, w * 1.6, dr) + .5 * exp(-dr / gw)) * exp(-(yb - p.y) / .22);
    acc += rv * neo_hue(mod(gr, 2.) < .5 ? h1 : h2);
    lum += rv;
  }
  vec3 col = lum > 1e-4 ? acc / lum : vec3(.05);
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(lum * (.65 + .35 * Y), 0., 1.));
}
`;
