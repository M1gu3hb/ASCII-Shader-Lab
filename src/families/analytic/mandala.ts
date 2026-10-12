/**
 * «Mandala de capas» (I-07, inventario PR #10): three concentric layers with their own angular repetition that
 * turn at speeds of opposite sign, around a centre point.
 *  - the core: a «flower of life» — n circles of radius ρ centred on a ring of radius ρ, a circle in the middle
 *    and n more where neighbours meet; where circles overlap, petals (vesicae) are filled;
 *  - the middle band: golden spirals, logarithmic spirals r = a·e^{bθ} with b = ln φ / (π/2) (they grow by the
 *    golden ratio every quarter turn), m arms each way, so their crossings make a sunflower-like lattice;
 *  - the outer band: a rosette of 2n lobes with a bead at each tip, concentric rings and a crown of ticks.
 * Each layer is folded into one sector of its symmetry, so a cell checks a handful of curves. The core and the
 * rosette turn one way, the spirals and the ticks the other, each by a whole number of its own symmetry steps
 * per cycle: the whole mandala comes back exactly after «Ciclo» seconds (a loop), with a breathing scale.
 * Written from the geometry (circle packing, logarithmic spirals), not from any shader's code.
 *
 * k0 = (petals, spiral arms, rings, cycle s), k1 = (turns, counter turns, line, fill),
 * K2 = (glow, breathing, flower weight, spiral weight), K3 = (outer weight, centre).
 */
export const MANDALA_GLSL = /* glsl */ `
// distance to a circle of radius rr centred at angle a, distance c from the origin (q in folded polar frame)
float mand_circ(vec2 q, float a, float c, float rr){ return abs(length(q - c * vec2(cos(a), sin(a))) - rr); }
float mand_in(vec2 q, float a, float c, float rr){ return step(length(q - c * vec2(cos(a), sin(a))), rr); }
float mand_ln(float d, float w){ return 1. - smoothstep(.5 * w, w + .45 * PX, d); }
float F_mandala_capas(vec2 p, float t, vec4 k0, vec4 k1){
  float n = clamp(floor(k0.x + .5), 5., 12.), m = clamp(floor(k0.y + .5), 3., 8.), nr = clamp(floor(k0.z + .5), 1., 5.);
  float P = max(k0.w, 1.), u = t / P;
  float tu = floor(k1.x + .5), cu = floor(k1.y + .5);
  float w = PX * (.12 + .6 * k1.z), fil = k1.w, glo = K2.x, br = K2.y;
  float wf = K2.z, ws = K2.w, wo = K3.x, cen = K3.y;
  float R0 = .46 * (1. + .035 * br * sin(TAU * u));
  float r1 = .42 * R0, r2 = .74 * R0, h = R0 - r2;
  float r = length(p), th = atan(p.y, p.x);
  // the layers' angles: whole steps of their own symmetry per cycle, in opposite senses
  float k = 2. * n, kt = 4. * n;
  float rot1 = TAU * u * tu / n, rot2 = -TAU * u * cu / m, rot3 = TAU * u * 3. * tu / k, rot4 = -TAU * u * 2. / kt;
  float v = 0., dmin = 1e3;
  if (r < r1 + 2. * w){
    // the flower of life, folded into one sector of its n-fold symmetry
    float s = TAU / n;
    float a = mod(th - rot1 + .5 * s, s) - .5 * s;
    vec2 q = r * vec2(cos(a), sin(a));
    float rho = .5 * r1;
    float dd = abs(r - rho);
    dd = min(dd, mand_circ(q, 0., rho, rho));
    dd = min(dd, mand_circ(q, s, rho, rho));
    dd = min(dd, mand_circ(q, -s, rho, rho));
    // the petals: where two or more circles overlap (the vesicae), alternating light and dark
    float cnt = step(r, rho) + mand_in(q, 0., rho, rho) + mand_in(q, s, rho, rho) + mand_in(q, -s, rho, rho);
    float ins = step(r, r1);
    v = max(v, wf * ins * max(mand_ln(dd, w), fil * step(1.5, cnt) * (.18 + .2 * mod(cnt, 2.))));
    dmin = min(dmin, mix(1e3, dd, step(.01, wf) * ins));
  }
  if (r > r1 - 2. * w && r < r2 + 2. * w){
    // golden spirals both ways, m arms each, folded by their own symmetry
    float b = .30634896, kk = b / sqrt(1. + b * b), lr = log(max(r, 1e-4)) / b, s = TAU / m;
    float pa = mod(th - lr - rot2 + .5 * s, s) - .5 * s;
    float pb = mod(th + lr - rot2 + .5 * s, s) - .5 * s;
    float ds = min(abs(pa), abs(pb)) * r * kk;
    float band = step(r1, r) * step(r, r2);
    // the cells of the lattice glow softly in their middle
    float cell = smoothstep(.25, .95, abs(pa) / (.5 * s)) * smoothstep(.25, .95, abs(pb) / (.5 * s));
    v = max(v, ws * band * max(mand_ln(ds, w), fil * .22 * cell));
    dmin = min(dmin, mix(1e3, ds, step(.01, ws) * band));
  }
  if (r > r2 - 2. * w && r < R0 + 3. * w){
    // a rosette of 2n lobes with a bead in each, turning with the flower
    float s = TAU / k;
    float a = mod(th - rot3 + .5 * s, s) - .5 * s;
    float lob = r2 + h * (.3 + .62 * pow(abs(cos(.5 * k * a)), .7));
    float dl = abs(r - lob) / sqrt(1. + .5 * pow(h * .22 * k / max(r, .05), 2.));
    float bead = length(vec2(r * a, r - (r2 + .7 * h))) - 1.3 * w;
    // concentric rings low in the band
    float dr = 1e3;
    for (int i = 0; i < 5; i++){
      if (float(i) >= nr) break;
      dr = min(dr, abs(r - (r2 + h * (float(i) + .5) / nr * .26)));
    }
    // a crown of ticks on the rim that turns the other way
    float st = TAU / kt;
    float at = mod(th - rot4 + .5 * st, st) - .5 * st;
    float dt = max(abs(r * at) - .45 * w, abs(r - R0) - .02);
    float band = step(r2, r);
    float dd = min(min(dl, dr), min(dt, abs(r - R0)));
    v = max(v, wo * band * max(max(mand_ln(dd, w), mand_ln(max(bead, 0.), w) ), fil * .14 * step(r, lob) * step(r2 + .28 * h, r)));
    dmin = min(dmin, mix(1e3, min(dd, max(bead, 0.)), step(.01, wo) * band));
  }
  // the borders between the layers
  float db = min(abs(r - r1), abs(r - r2));
  v = max(v, max(max(wf, ws) * mand_ln(abs(r - r1), w), max(ws, wo) * mand_ln(abs(r - r2), w)));
  dmin = min(dmin, db);
  // a glow around every line, breathing with the cycle
  v = max(v, glo * .32 * exp(-dmin / (PX * 1.3)) * (.85 + .15 * sin(TAU * 2. * u)) * step(r, R0 + .02));
  // the centre: a dark moat around a bright point, and a small star of n rays
  v *= 1. - cen * .85 * (smoothstep(.022, .03, r) - smoothstep(.05, .06, r));
  v = max(v, cen * max(1. - smoothstep(.022, .03, r), .7 * exp(-r / .035) * pow(abs(cos(.5 * n * (th - rot1))), 8.) * step(.03, r) * step(r, .09)));
  // a faint aura around the outer edge
  v = max(v, glo * .2 * exp(-max(r - R0, 0.) / .05) * step(R0, r));
  return clamp(v, 0., 1.);
}
`;
