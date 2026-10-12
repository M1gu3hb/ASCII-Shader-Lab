/**
 * «Eclipse total» (I-08, inventario PR #10): a black disc (the moon) over the sun, with the corona around it.
 *  - Corona: in polar coordinates around the sun, a brightness that falls with the distance to the limb as a
 *    power law (∝ (1 + ρ/s)^−2.6), stretched along an axis (the equatorial streamers: s grows with
 *    cos 2(φ − axis)), and broken into rays by an fBm on (direction, log r − v·t): seamless in angle, long along
 *    the radius, and drifting outwards with time (the solar wind). Fine straight plumes add to it.
 *  - The moon's limb is irregular (mountains and valleys); the moon's centre slides a little off the sun's and
 *    back on a slow cycle: when the sun's limb shows through, a bead of photosphere lights (Baily's beads) and,
 *    exposed further, a diamond ring flares with a cross of rays.
 *  - At the limb, pink prominences (flames anchored at a few angles whose height breathes with a noise) and the
 *    chromosphere; around, stars that the corona's light hides.
 * Colour per cell: pearl corona (warmer or colder with «Tinte»), pink prominences, white photosphere, stars.
 * Written from the physics and the published description of the effect, not from any shader's code.
 *
 * k0 = (size, corona extent, streamers, asymmetry), k1 = (axis, solar wind, diamond, contact),
 * K2 = (beads, prominences, stars, tint).
 */
export const ECLIPSE_GLSL = /* glsl */ `
vec4 FC_eclipse_total(vec2 p, float t, vec4 k0, vec4 k1){
  float Rm = mix(.12, .24, k0.x), Rs = Rm * .985;
  float ext = mix(.35, 1.4, k0.y), nst = mix(2., 9., k0.z), asym = k0.w;
  float axis = k1.x * PI, wind = k1.y, dia = k1.z, con = k1.w;
  float bead = K2.x, prom = K2.y, stars = K2.z, tint = K2.w;
  // the moon slides off the sun's centre and back (a 16 s cycle): the sun's limb shows at angle thd
  float thd = axis + 2.2;
  vec2 dd = vec2(cos(thd), sin(thd));
  float del = Rm * .065 * con * (.5 - .5 * cos(TAU * t / 16.));
  vec2 mc = -del * dd;
  float r = length(p), phi = atan(p.y, p.x);
  vec2 dir = p / max(r, 1e-5);
  vec2 pm = p - mc;
  float rm = length(pm);
  // the moon's limb: valleys where the sun can shine through
  float limb = Rm * (1. - .045 * bead * smoothstep(.4, .8, gnoise(pm / max(rm, 1e-5) * 11. + 3.1)));
  float outM = smoothstep(limb - .35 * PX, limb + .35 * PX, rm);
  // the photosphere that shows past the moon: beads and the diamond
  float phot = outM * (1. - smoothstep(Rs - .3 * PX, Rs + .3 * PX, r));
  // how much of the limb is uncovered at thd: the diamond ring's strength
  float ex = clamp((del - (Rm - Rs)) / (Rm * .03), 0., 1.);
  vec2 q = p - Rs * dd;
  float dq = length(q);
  float dg = dia * ex * (exp(-dq * dq / .0006) + .45 * exp(-dq / .05)
    + .55 * exp(-dq * 5.) * (exp(-abs(q.y) / (.4 * PX)) + exp(-abs(q.x) / (.4 * PX))));
  // the corona: a power law of the height over the limb, stretched along the axis, broken into rays that drift out
  float rho = max(r - Rs, 0.) / Rs;
  float E = 1. + .8 * asym * cos(2. * (phi - axis));
  float st = fbm3(vec3(dir * nst, log(max(r, 1e-3) / Rs) * 1.6 - t * wind * .3));
  float pl = gnoise(dir * nst * 5. + vec2(0., t * .02));
  float streak = mix(st, pl, .3);
  float I = 2. * pow(1. + rho / (.3 * ext * E), -2.2);
  float cor = outM * I * (.15 + 1.7 * smoothstep(.3, .75, streak)) * step(Rs, r);
  // prominences: flames anchored at four angles, their height breathing with a noise; and the chromosphere
  float H = 0.;
  for (int j = 0; j < 4; j++){
    float fj = float(j);
    float a = axis + fj * 1.7 + .9 + .4 * sin(fj * 3.1);
    float da = atan(sin(phi - a), cos(phi - a));
    float wj = .1 + .09 * fract(fj * .618);
    H = max(H, exp(-da * da / (wj * wj)) * (.5 + .7 * fbm(dir * 7. + vec2(fj * 3.3, t * .12))));
  }
  float hp = prom * Rm * .45 * H;
  float pv = outM * step(Rs, r) * ((1. - smoothstep(hp * .5, hp + PX * .3, r - Rs)) * step(.002, hp) + (.25 + .6 * prom) * exp(-(r - Rs) / .006));
  // stars, hidden where the corona is bright
  float g = .055;
  vec2 gc = floor(p / g);
  vec2 sh = hash22(gc + 19.);
  vec2 sp = (gc + .2 + .6 * sh) * g;
  float sd = length(p - sp);
  float sv = stars * step(.78, sh.x) * exp(-sd * sd / (PX * PX * .2)) * (.55 + .45 * sin(t * (1. + 2. * sh.y) + sh.x * 40.)) * (1. - smoothstep(.02, .2, cor)) * outM;
  float lum = cor + pv + phot + dg + sv;
  vec3 warm = vec3(1., .78, .45), cold = vec3(.55, .72, 1.);
  vec3 cc = mix(mix(cold, warm, tint), vec3(1., .98, .94), clamp(.6 - 1.2 * rho, 0., .6));
  vec3 col = (cor * cc + pv * vec3(1., .3, .45) + (phot + dg) * vec3(1., .97, .9) + sv * vec3(.85, .9, 1.)) / max(lum, 1e-4);
  if (lum < 1e-4) col = vec3(.06, .08, .2);
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(lum * (.7 + .3 * Y), 0., 1.));
}
`;
