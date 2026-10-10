/**
 * Teselación hiperbólica (analytic): the regular {p,q} tiling of the Poincaré disk, by folding. Each point
 * is reflected into the fundamental triangle (angles π/p at the polygon's centre, π/q at a vertex, π/2 at
 * an edge midpoint) by the two straight mirrors through the origin and the edge mirror, a circle orthogonal
 * to the rim; the parity of the reflections colours the triangles alternately. The edge mirror crosses the
 * real axis at tanh(b/2), b being the polygon's inradius: cosh b = cos(π/q) / sin(π/p).
 *
 * Motion: a turn (giro) and a drift along a geodesic toward the next polygon, T_{2bu} ∘ R_{ρu}; at u = 1 it
 * is a half-turn about an edge midpoint composed with a rotation by a multiple of 2π/p, a symmetry of the
 * tiling, so u wraps without a jump. |dw/dp| is carried through every step: it gives the screen size of a
 * tile, so lines have a hyperbolic width and tiles smaller than a cell fade to their mean tone.
 *
 * «Relieve» also carries the direction of the derivative (a unit complex J and whether the map reflects):
 * every step is conformal (turns, the translation) or anti-conformal (the rim, the wedge's mirror, the edge
 * mirror), so the edge's normal in the fundamental triangle maps back to a screen direction, and each tile's
 * bevel is lit from the same side of the screen, however folded.
 *
 * k0 = (p, q, motif, width), k1 = (drift, turn, rim fade, outside). Bounds: at most HY_IT folds.
 */
export const HIPERBOLICO_GLSL = `
#define HY_IT 40
#define HY_R .48
vec2 HY_cm(vec2 a, vec2 b){ return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
float F_hiperbolico(vec2 p, float t, vec4 k0, vec4 k1){
  // {p,q}: q rises to the first value that tiles the hyperbolic plane ((p-2)(q-2) > 4)
  float P = floor(k0.x + .5), Q = max(floor(k0.y + .5), floor(2. + 4. / (P - 2.)) + 1.);
  float an = PI / P;
  float ch = cos(PI / Q) / sin(an), sh = sqrt(ch * ch - 1.);
  float m = sh / (ch + 1.);
  float cx = (1. + m * m) / (2. * m), cr = (1. - m * m) / (2. * m);
  float vb = cx * cos(an), vr = vb - sqrt(max(vb * vb - 1., 0.));
  vec2 V = vr * vec2(cos(an), sin(an));
  float b = log(ch + sh);
  // view: a turn, then a drift toward the next polygon that ends on a symmetry
  float u = fract(k1.x * t / 8.);
  float rho = PI - 2. * an * floor(P * .5);
  float e = exp(2. * b * u), a = (e - 1.) / (e + 1.);
  // relief: the direction of the map's derivative J (dz = J ds, or J conj(ds) when fl), carried through every step
  bool rel = k0.z > 2.5;
  float gt = mod(k1.y * t * TAU / 60., TAU), fl = 0.;
  vec2 J = vec2(cos(gt), -sin(gt));
  vec2 z = rot2(p / HY_R, gt);
  float D = 1. / HY_R;
  float r2 = dot(z, z), outside = 0.;
  if (r2 > 1.){
    if (rel){ J = HY_cm(-vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) / r2, vec2(J.x, -J.y)); fl = 1.; }
    z /= r2; D /= r2; outside = 1.;
  }
  float rr = sqrt(dot(z, z));
  z = rot2(z, rho * u);
  vec2 dd = vec2(1. + a * z.x, a * z.y);
  float dl = dot(dd, dd);
  if (rel) J = HY_cm(vec2(dd.x * dd.x - dd.y * dd.y, -2. * dd.x * dd.y) / dl, HY_cm(vec2(cos(rho * u), -sin(rho * u)), J));
  z = vec2((z.x + a) * dd.x + z.y * dd.y, z.y * dd.x - (z.x + a) * dd.y) / dl;
  D *= (1. - a * a) / dl;
  if (dot(z, z) < 1e-12) z = vec2(1e-6, 0.);
  // fold: dihedral wedge 0 <= angle <= pi/p, then the edge mirror, until nothing moves
  float par = 0.;
  for (int i = 0; i < HY_IT; i++){
    float th = atan(z.y, z.x);
    float w = mod(th, 2. * an);
    bool rf = w > an;
    if (rf){ w = 2. * an - w; par = 1. - par; }
    // the wedge: a turn by w - th, or (reflected) e^{i(w + th)} conj(z)
    if (rel){ float ag = rf ? w + th : w - th; J = HY_cm(vec2(cos(ag), sin(ag)), rf ? vec2(J.x, -J.y) : J); if (rf) fl = 1. - fl; }
    z = length(z) * vec2(cos(w), sin(w));
    vec2 d = z - vec2(cx, 0.);
    float d2 = dot(d, d);
    if (d2 >= cr * cr) break;
    float k = cr * cr / d2;
    // the edge mirror: -((z - c)/|z - c|)^2 conj(dz)
    if (rel){ vec2 q = d / sqrt(d2); J = HY_cm(-vec2(q.x * q.x - q.y * q.y, 2. * q.x * q.y), vec2(J.x, -J.y)); fl = 1. - fl; }
    z = vec2(cx, 0.) + d * k;
    D *= k;
    par = 1. - par;
  }
  float tile = m / D;
  float de = (length(z - vec2(cx, 0.)) - cr) / D;
  float hw = k0.w * (.07 * tile + .004 * smoothstep(.02, .06, tile));
  float edge = 1. - smoothstep(hw, hw + .004, de);
  float v, avg;
  if (k0.z < .5){
    float g = length(z) / vr;
    v = max(.05 + .22 * g * g, edge);
    avg = .32;
  } else if (k0.z < 1.5){
    v = mix(par > .5 ? .84 : .26, .03, edge);
    avg = .5;
  } else if (k0.z < 2.5){
    // star: points at the vertices, inner corners on the spoke toward the edge midpoint
    vec2 S = vec2(m * .5, 0.), nv = normalize(vec2(V.y, S.x - V.x));
    float sd = dot(z - S, nv) / D;
    v = mix(.1 + .14 * par, .94, 1. - smoothstep(-.003, .003, sd));
    v = mix(v, .45, edge);
    avg = .42;
  } else {
    // relief: raised tiles lit from the upper left. The bevel rises along the edge's inward normal n,
    // brought back to the screen through the map's derivative (J^-1 n, or J^-1 conj(n) when it reflects)
    vec2 nn = normalize(z - vec2(cx, 0.));
    vec2 sc = vec2(nn.x * J.x + nn.y * J.y, fl > .5 ? nn.x * J.y - nn.y * J.x : nn.y * J.x - nn.x * J.y);
    float lam = (sc.y - sc.x) * .70710678;
    float bw = k0.w * .32 * tile;
    float wb = 1. - smoothstep(.55 * bw, bw, de);
    v = .4 * (1. - wb) + sat(.5 - .62 * lam) * wb;
    v *= smoothstep(0., .12 * bw, de);
    avg = .4;
  }
  v = mix(avg, v, smoothstep(.008, .024, tile));
  v *= 1. - k1.z * smoothstep(.3, 1., rr);
  if (outside > .5) v *= k1.w;
  float rim = abs(length(p) - HY_R);
  return sat(max(v, .4 * (1. - smoothstep(.003, .007, rim))));
}`;
