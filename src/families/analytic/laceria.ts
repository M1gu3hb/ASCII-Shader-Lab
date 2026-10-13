/**
 * «Lacería» (C-01): interlaced star rosettes. Each rosette is a regular star polygon {N/k}: N chords of a
 * circle of radius R, chord j joining the vertices at angles rot + 2πj/N and rot + 2π(j + k)/N, so its line
 * has its normal at rot + (2j + k)π/N and lies at R·cos(πk/N) from the centre. One to three stars are
 * nested, each inner one a {N/2} that fits inside the central polygon of the one around it, turning in
 * alternate senses. They sit alone (a rose window) or on a square or hexagonal lattice, where each star turns
 * the other way from its neighbour, like gears.
 *
 * Over and under: the strands form closed curves, so the plane is two-coloured by the parity of how many
 * polygons contain the point (inside a regular star polygon, the winding number is k − the number of chord
 * lines with the point on their outer side). An alternating weave follows from that colouring (as in a
 * knot diagram): at a crossing, strand A passes over B when the region swept by turning A counter-clockwise
 * towards B is shaded. The strand below is cut by a gap around the one above; same-star chords that meet
 * at a tip just join. Strands are bands one or two cells wide with a dark outline; the regions between them
 * take two tones by their parity, like glazed tiles.
 *
 * Time: every half cycle a front (from the centre, or from the corners on a lattice) sweeps the piece and
 * leaves behind the next configuration (other star depths, rotated layers), the strands it passes freshly
 * inked. «Bucle»: two configurations alternate and each layer turns by whole symmetry steps (2π/N) per cycle,
 * so the piece repeats exactly every 32 s. «Continuo»: the configurations come from a hash of the cycle and
 * the layers turn at incommensurate speeds.
 *
 * k0 = (symmetry, lattice, star depth k, layers), k1 = (width, spin, reveal, cycle).
 * Written from the geometry of star polygons and alternating diagrams, not from any shader's code.
 */
export const LACERIA_GLSL = /* glsl */ `
vec4 lac_b1, lac_b2, lac_b3; vec3 lac_i1, lac_i2, lac_i3; vec3 lac_k; float lac_par;
void lac_star(vec2 z, float R, float N, float k, float rot, float pid){
  float d0 = R * cos(PI * k / N), hl = R * sin(PI * k / N);
  float m = 0.;
  for (int j = 0; j < 12; j++){
    if (float(j) >= N) break;
    float b = rot + (2. * float(j) + k) * PI / N;
    vec2 n = vec2(cos(b), sin(b));
    float sl = dot(z, n) - d0, al0 = dot(z, vec2(-n.y, n.x)), al = abs(al0);
    m += sl > 0. ? 1. : 0.;
    float d = abs(sl), ss = sl;
    vec2 nn = n;
    if (al > hl){
      // past the chord's end: the strand's corner at the star's tip, whose side and direction are the tip's
      // own (radial), the same for both chords that meet there
      vec2 E = d0 * n + sign(al0) * hl * vec2(-n.y, n.x);
      nn = E / R;
      d = length(z - E);
      ss = dot(z - E, nn);
    }
    // ordered by distance (on a mirror of the pattern two chords are equally far: small tie-breaks, the
    // nearer line and then an order of the chords, make both engines pick the same)
    float key = d + 2e-4 * abs(ss) + 1e-5 * fract(pid * .6180339 + float(j) * .1271);
    if (key < lac_k.x){ lac_b3 = lac_b2; lac_i3 = lac_i2; lac_b2 = lac_b1; lac_i2 = lac_i1; lac_k = vec3(key, lac_k.xy); lac_b1 = vec4(d, ss, nn); lac_i1 = vec3(pid, float(j), k); }
    else if (key < lac_k.y){ lac_b3 = lac_b2; lac_i3 = lac_i2; lac_k = vec3(lac_k.x, key, lac_k.y); lac_b2 = vec4(d, ss, nn); lac_i2 = vec3(pid, float(j), k); }
    else if (key < lac_k.z){ lac_k.z = key; lac_b3 = vec4(d, ss, nn); lac_i3 = vec3(pid, float(j), k); }
  }
  if (dot(z, z) < R * R) lac_par += mod(k - m + 24., 2.);
}
float F_laceria(vec2 p, float t, vec4 k0, vec4 k1){
  float N = 6. + 2. * clamp(floor(k0.x + .5), 0., 3.);
  float grid = floor(k0.y + .5);
  float kmax = N * .5 - 1.;
  float L = clamp(floor(k0.w + .5), 1., 3.);
  float loop = k1.w < .5 ? 1. : 0.;
  float rv = k1.z;
  // the cycle: a front sweeps the piece every half period and leaves the next configuration behind it
  const float P = 32.;
  float H = P * .5;
  float c = floor(t / H), u = t / H - c;
  float sF = grid > 1.5 ? length(p) / 1.05
    : min(min(length(p - vec2(-.9, -.5)), length(p - vec2(.9, -.5))), min(length(p - vec2(-.9, .5)), length(p - vec2(.9, .5)))) / 1.03;
  float Rf = smoothstep(0., max(rv, 1e-3), u) * 1.08;
  float cfg = rv < .001 ? 0. : sF < Rf ? c : c - 1.;
  float fresh = rv < .001 || sF >= Rf ? 0. : 1. - smoothstep(0., .08, Rf - sF);
  float cb = loop > .5 ? mod(cfg, 2.) : cfg;
  float kb = clamp(floor(k0.z + .5), 2., kmax);
  // (hashes of whole numbers: both engines feed them the same value)
  float jump = loop > .5 ? cb : floor(hash11(cb + 101.) * 5.);
  float q = floor(k1.y * 3. + .5);
  float w = k1.x * .55 * PX, o = .8 * PX, gp = .6 * PX;
  // on a lattice the stars almost touch their neighbours (radius .45 of the spacing), so they turn freely
  float S = grid < .5 ? .8 : .86;
  float Rb = grid > 1.5 ? .47 : .45 * S;
  lac_b1 = vec4(1e3, 0., 1., 0.); lac_b2 = lac_b1; lac_b3 = lac_b1; lac_i1 = vec3(-1.); lac_i2 = vec3(-2.); lac_i3 = vec3(-3.); lac_k = vec3(1e3); lac_par = 0.;
  // the layers of this configuration
  // (each inner star fits inside the central polygon of the one around it, and is the simplest, {N/2})
  float kl[3]; float rs[3]; float ro[3]; float Rl[3];
  float Rp = Rb;
  for (int l = 0; l < 3; l++){
    float fl = float(l);
    kl[l] = l == 0 ? 2. + mod(kb - 2. + jump, max(kmax - 1., 1.)) : 2.;
    float sg = mod(fl, 2.) < .5 ? 1. : -1.;
    float spin = loop > .5 ? sg * q * (TAU / N) * (fl + 1.) * t / P : sg * k1.y * .25 * t * (1. + .618 * fl);
    float off = loop > .5 ? mod(cb * (fl + 1.), 2.) * PI / N : hash11(cb * 4. + fl + 7.) * TAU / N;
    rs[l] = spin; ro[l] = off;
    Rl[l] = Rp;
    Rp *= cos(PI * kl[l] / N) * .92;
  }
  float reach = Rb + w + o + gp;
  if (grid > 1.5){
    for (int l = 0; l < 3; l++){ if (float(l) >= L) break; lac_star(p, Rl[l], N, kl[l], rs[l] + ro[l], float(l)); }
  } else if (grid < .5){
    // the four lattice points around p are the only ones whose stars can reach it
    vec2 i0 = floor(p / S);
    for (int dy = 0; dy <= 1; dy++) for (int dx = 0; dx <= 1; dx++){
      vec2 id = i0 + vec2(float(dx), float(dy));
      vec2 z = p - id * S;
      if (length(z) > reach) continue;
      float pid = (id.x * 7. + id.y * 131.) * 4.;
      // neighbours turn the other way, like gears
      float cs = mod(id.x + id.y, 2.) < .5 ? 1. : -1.;
      for (int l = 0; l < 3; l++){ if (float(l) >= L) break; lac_star(z, Rl[l], N, kl[l], cs * rs[l] + ro[l], pid + float(l)); }
    }
  } else {
    // hexagonal lattice: basis (S, 0) and (S/2, S·√3/2)
    float hj = p.y / (S * .8660254), hi = p.x / S - hj * .5;
    vec2 i0 = floor(vec2(hi, hj));
    for (int dy = 0; dy <= 1; dy++) for (int dx = 0; dx <= 1; dx++){
      vec2 id = i0 + vec2(float(dx), float(dy));
      vec2 z = p - vec2((id.x + id.y * .5) * S, id.y * S * .8660254);
      if (length(z) > reach) continue;
      float pid = (id.x * 7. + id.y * 131.) * 4.;
      // neighbours turn the other way, like gears
      float cs = mod(id.x + id.y, 2.) < .5 ? 1. : -1.;
      for (int l = 0; l < 3; l++){ if (float(l) >= L) break; lac_star(z, Rl[l], N, kl[l], cs * rs[l] + ro[l], pid + float(l)); }
    }
  }
  float bg = mix(.08, .24, mod(lac_par, 2.));
  // the two nearest strands: a crossing (one over, one under) unless they are chords of one star meeting at a tip
  // (two chords of one star meeting at its tip are one strand: then the other strand is the third nearest)
  float dj = mod(lac_i1.y - lac_i2.y + N, N);
  if (lac_i1.x == lac_i2.x && (abs(dj - lac_i1.z) < .5 || abs(dj - (N - lac_i1.z)) < .5)){ lac_b2 = lac_b3; lac_i2 = lac_i3; }
  dj = mod(lac_i1.y - lac_i2.y + N, N);
  bool tip = lac_i1.x == lac_i2.x && (abs(dj - lac_i1.z) < .5 || abs(dj - (N - lac_i1.z)) < .5);
  // nearly parallel strands do not cross (neighbouring stars' chords can lie on one line): they just join
  bool cross = lac_b2.x < w + o + gp && !tip && abs(lac_b1.z * lac_b2.w - lac_b1.w * lac_b2.z) > .2;
  float dO = lac_b1.x, dU = 1e3;
  if (cross){
    vec2 nA = lac_b1.zw, nB = lac_b2.zw;
    vec2 dA = vec2(-nA.y, nA.x), dB = vec2(-nB.y, nB.x);
    if (dA.x * dB.y - dA.y * dB.x < 0.) dB = -dB;
    // parity of the region swept by turning A towards B: shaded means A goes over
    float qp = mod(lac_par + (lac_b1.y > 0. ? 1. : 0.) + (dot(dB, nA) > 0. ? 1. : 0.) + (lac_b2.y > 0. ? 1. : 0.) + (dot(dA, nB) > 0. ? 1. : 0.), 2.);
    if (qp > .5){ dO = lac_b1.x; dU = lac_b2.x; } else { dO = lac_b2.x; dU = lac_b1.x; }
  }
  float v = bg;
  float core = w + o;
  if (dO < core) v = dO < w ? .92 - .12 * (dO / w) * (dO / w) : 0.;
  else if (cross && dO < core + gp) v = dU < core ? 0. : bg;
  else if (dU < core) v = dU < w ? .92 - .12 * (dU / w) * (dU / w) : 0.;
  // freshly inked strands, and the front itself while it sweeps
  if (v > .5) v = mix(v, 1., fresh);
  if (rv > .001 && u < rv) v = max(v, .55 * (1. - smoothstep(PX * .4, PX * 1.1, abs(sF - Rf))));
  return sat(v);
}
`;
