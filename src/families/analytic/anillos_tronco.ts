/**
 * «Anillos de tronco» (I-32): concentric rings whose radius is bent by a noise read in polar coordinates, that
 * grow and pile up as a trunk's growth rings do.
 *
 *  - Growth: a ring is laid down every «Año» seconds and the wood keeps a constant area per year, so a ring
 *    born a years ago (or laid a years after the pith, in «Crece») sits at r = c·√a: wide rings near the pith,
 *    thinner and thinner outward. c comes from «Anchura» (the ring width at r = 0.3). A cell at radius r was
 *    therefore formed at τ = t − (r/c)² («Fluye»: rings are born at the centre and drift out, slowing and
 *    piling up; the picture is the same at every moment, only the rings move) or τ = (r/c)² («Crece»: the
 *    trunk grows ring by ring from the pith, its bark at c·√t, and stays still once it fills the canvas).
 *  - Irregular rings: the radius is divided by 1 + A·(2n − 1), n an fbm read on a circle of the direction
 *    (no seam) moved along with τ, so each ring keeps its own wobble and its neighbours share most of it (one
 *    fixed-point step finds τ). «Excentricidad» grows one side faster (the pith is off centre).
 *  - The year's phase fract(τ/Año) gives the wood: pale early wood, a dark (bright in the glyphs) late band and
 *    a sharp start of the next year; rings closer than a couple of cells fade to their mean. Radial rays and a
 *    few radial cracks cross them; in «Crece» the bark is a rough band at the edge of the trunk.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (mode, year, ring width, irregularity), k1 = (detail, late wood, rays, cracks),
 * K2.x = eccentricity.
 */
export const ANILLOS_TRONCO_GLSL = /* glsl */ `
float at_n(vec2 d, float tau, float det){ return fbm(d * det * 1.6 + vec2(tau * .07, 3.7)); }
float F_anillos_tronco(vec2 p, float t, vec4 k0, vec4 k1){
  float grow = k0.x, Y = k0.y;
  float c2 = .6 * k0.z / Y;                    // c² (screen heights² per second)
  float r = length(p);
  vec2 d = r > 1e-5 ? p / r : vec2(1., 0.);
  // the pith is off centre: one side grows faster
  float ecc = 1. + .35 * K2.x * d.x;
  float A = .12 * k0.w;
  float re = r / ecc;
  float tau0 = grow > .5 ? re * re / c2 : t - re * re / c2;
  re = re / (1. + A * (2. * at_n(d, tau0, k1.x) - 1.));
  float tau = grow > .5 ? re * re / c2 : t - re * re / c2;
  float ph = fract(tau / Y);
  // the rings' spacing here, in screen heights: closer than a couple of cells, they fade to their mean
  float dr = .3 * k0.z / max(re, .01);
  float sharp = smoothstep(.7 * PX, 1.8 * PX, dr);
  float late = smoothstep(.5, .96, ph) * (1. - smoothstep(.985, 1., ph));
  float yearK = .7 + .3 * hash12(vec2(floor(tau / Y), 7.));
  float wood = .14 + k1.y * mix(.32, late * yearK, sharp);
  // radial rays and the grain along them
  float a = atan(d.y, d.x);
  wood += k1.z * .22 * smoothstep(.62, .9, gnoise(d * 22. + vec2(r * 2.5, 0.)));
  wood *= .85 + .3 * gnoise(d * 6. + vec2(0., r * 60.));
  // cracks: a few dark radial lines from the outside in
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    if (fi >= k1.w) break;
    float ca = TAU * hash12(vec2(fi, 13.));
    float dc = abs(mod(a - ca + PI, TAU) - PI) * r;
    float len = .25 + .5 * hash12(vec2(fi, 17.));
    wood *= 1. - .85 * (1. - smoothstep(.35 * PX, 1.1 * PX, dc - .006 * (r - len))) * smoothstep(len, len + .05, r);
  }
  // the pith
  wood = max(wood, .9 * (1. - smoothstep(.006, .016, r)));
  if (grow > .5){
    // the bark at the edge of the trunk; nothing beyond it
    float Rb = sqrt(c2 * t) * ecc * (1. + A * (2. * at_n(d, t, k1.x) - 1.));
    float bark = smoothstep(Rb, Rb + PX, r);
    float rough = .35 + .4 * gnoise(d * 32. + vec2(r * 30., 0.));
    wood = mix(wood, rough, bark);
    wood *= 1. - smoothstep(Rb + .03, Rb + .03 + PX, r);
  }
  return clamp(wood, 0., 1.);
}
`;
