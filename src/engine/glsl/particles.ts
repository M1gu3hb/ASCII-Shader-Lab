/**
 * Particle choreographies (from the pattern-library branch, redrawn for GLYPHOS): points on analytic trajectories,
 * drawn as a field at any time t, so they loop, export and scrub like any other pattern. One chunk per
 * motion, each with its own number of points; CPU twin: ../basic/particles.ts (same order of operations).
 *   a: the motion's own setting (its label in the catalog), b: the size of the points.
 * Points and trails are never thinner than a cell (PX), so they do not flicker between glyphs.
 */
export const PARTICLE_IDS = [
  'enjambre_vivo', 'estela_cometas', 'lluvia_ascendente', 'orbitas_gemelas',
  'corazon_particulas', 'cardumen_luz', 'vortice_polvo', 'ondas_estelares',
  'mariposa_puntos', 'nieve_orbital', 'floracion_luz', 'constelacion_dinamica',
] as const;

/** Points of each motion (index = mode). */
export const PARTICLE_COUNT = [56, 12, 40, 48, 48, 56, 56, 48, 90, 56, 60, 26];

/**
 * Where point k of N is at time t: sets c (position), and for motions with a trail, tr (the trail, from the
 * point backwards). h, h2, h3: three independent hashes of k; per: its own cycle 0..1.
 */
function position(mode: number): string {
  switch (mode) {
    case 0: return `float morph = smoothstep(.15, .85, .5 + .5 * sin(t * .42));
    vec2 loose = vec2(h2 - .5, h3 - .5) * vec2(1.35, .85) + .04 * vec2(sin(t * .7 + k), cos(t * .6 + k * 1.3));
    float an = k / N * TAU + t * .25;
    c = mix(loose, vec2(cos(an), sin(an)) * (.16 + a * .2), morph);`;
    case 1: return `vec2 dir = normalize(vec2(1., -.3 - h2 * .35));
    c = vec2(-.95, .55 - h3 * .75) + dir * per * 2.1;
    tr = -dir * (.1 + a * .35);
    depth = 1.5;`;
    case 2: return `c = vec2((h2 - .5) * 1.6, -.62 + per * 1.24);
    tr = vec2(0., -.03 - a * .13);`;
    case 3: return `float ring = mod(k, 2.), an = floor(k * .5) / (N * .5) * TAU + t * (ring < .5 ? .36 : -.27);
    vec2 e = vec2(cos(an), sin(an)) * (ring < .5 ? vec2(.27, .15) : vec2(.34 + a * .22, .2 + a * .12));
    float ro = ring < .5 ? -.35 : .4, cr = cos(ro), sr = sin(ro);
    c = vec2(cr * e.x - sr * e.y, sr * e.x + cr * e.y);`;
    case 4: return `float u = k / N * TAU + t * .13, su = sin(u), beat = .5 + .5 * sin(t * 2.2);
    beat = beat * beat * beat; beat *= beat;
    c = vec2(16. * su * su * su, 13. * cos(u) - 5. * cos(2. * u) - 2. * cos(3. * u) - cos(4. * u) + 2.) * ((.9 + (.03 + a * .2) * beat) * .021);`;
    case 5: return `vec2 C = vec2(.42 * sin(t * .21), .15 * sin(t * .37 + 1.));
    vec2 V = normalize(vec2(.0882 * cos(t * .21), .0555 * cos(t * .37 + 1.)) + vec2(1e-4, 0.)), W = vec2(-V.y, V.x);
    float lg = (h2 - .5) * .52, ac = (h3 - .5) * .22 + (.01 + a * .05) * sin(t * 3. + h * 20. + lg * 18.);
    c = C + V * lg + W * ac;
    tr = -V * .035;`;
    case 6: return `float r = .05 + per * .55, th = h * TAU + t * .3 + per * TAU * 1.5;
    c = r * vec2(cos(th), sin(th));
    tr = -normalize(vec2(-c.y, c.x) + c * .3 + vec2(1e-4, 0.)) * (.03 + a * .12);`;
    case 7: return `float ring = mod(k, 4.), an = floor(k * .25) / (N * .25) * TAU + t * (.11 + ring * .03) * (mod(ring, 2.) < .5 ? 1. : -1.);
    c = vec2(cos(an), sin(an)) * (.08 + ring * (.06 + a * .08) + .012 * sin(t * .8 + ring));`;
    case 8: return `float u = k / N * TAU + t * .2, rho = exp(cos(u)) - 2. * cos(4. * u);
    c = vec2(sin(u) * rho * (1. - (.05 + a * .5) * (.5 + .5 * sin(t * 2.))), cos(u) * rho - .66) * .17;`;
    case 9: return `c = vec2((h2 - .5) * 1.7 + (.02 + a * .14) * sin(t * (.5 + h3) + h * TAU), .6 - per * 1.2);
    depth = .6 + .6 * h3;`;
    case 10: return `float u = k / N * TAU + t * .17, s3 = sin(floor(1.5 + a * 3.) * u), rr = .12 + .28 * s3 * s3;
    c = rr * vec2(cos(u), sin(u));`;
    default: return `c = vec2(h2 - .5, h3 - .5) * vec2(1.4, .88) + .05 * vec2(sin(t * .4 + h * TAU), cos(t * .35 + h2 * TAU));`;
  }
}

function particleChunk(id: string, mode: number): string {
  const N = PARTICLE_COUNT[mode];
  const trail = mode === 1 || mode === 2 || mode === 5 || mode === 6;
  return `
float P_${id}(vec2 p, float t, float a, float b){
  float v = 0., N = ${N}., rad0 = max(.012 + b * .024, PX * .9);
  vec2 prev = vec2(9.), prev2 = vec2(9.);
  for (int i = 0; i < ${N}; i++){
    float k = float(i), h = hash12(vec2(k, 19.)), h2 = hash12(vec2(k, 37.)), h3 = hash12(vec2(k, 53.));
    float per = fract(h + t * (.04 + h3 * .06)), depth = 1.;
    vec2 c = vec2(0.), tr = vec2(0.);
    ${position(mode)}
    float rad = rad0 * depth;
    vec2 q = p - c;
    float d2 = dot(q, q);
    v = max(v, exp(-d2 / (rad * rad)) * (.6 + .4 * h) + .18 * exp(-d2 / (rad * rad * 9.)));${trail ? `
    float along = clamp(dot(q, tr) / dot(tr, tr), 0., 1.), w = max(rad * .5, PX * .7);
    v = max(v, (1. - smoothstep(w, w + PX, length(q - tr * along))) * (1. - along) * .85);` : ''}${mode === 11 ? `
    float lim = .12 + a * .3, w = PX * .6;
    if (length(prev - c) < lim) v = max(v, (1. - smoothstep(w, w + PX, sdSeg(p, prev, c))) * .4);
    if (length(prev2 - c) < lim) v = max(v, (1. - smoothstep(w, w + PX, sdSeg(p, prev2, c))) * .3);
    prev2 = prev; prev = c;` : ''}
  }
  return sat(v);
}`;
}

export const PARTICLE_GLSL: Record<string, string> = Object.fromEntries(PARTICLE_IDS.map((id, mode) => [id, particleChunk(id, mode)]));
