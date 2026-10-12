/**
 * «Mosaico cinético» (V-05): a wall of tiles that flip over in waves, each pass revealing a new picture.
 * Tiles are whole blocks of character cells (n rows × m columns, m odd and about square at the default 1.4
 * cell aspect, from PX), so every flip is drawn at one-cell resolution: the face narrows by |cos θ| and, edge
 * on, the tile is a strip one cell wide (its gilded edge) before the other face opens. The amount of each cell
 * that the face or the edge covers is computed exactly (overlap of intervals), so the narrowing steps cell by
 * cell instead of popping.
 *
 * The wave: a phase φ = (speed·t − s)/spacing + scatter, s the tile's place along the wave (left to right,
 * top to bottom, diagonal, rings from the centre or a turning sweep). Each whole turn of φ is one pass: the
 * tile flips during the first «flip» share of it and rests showing face number floor(φ) + 1. Face k shows
 * picture k: a hash of the tile, or large soft shapes (fbm at the tile's centre, shifted by k) that the
 * front draws across the wall. Each tile also leans a little (its own normal, per face) under a light that
 * wanders, so tiles glint between passes. The pictures never repeat (k grows), so it never loops.
 *
 * k0 = (rows per tile, direction, speed, spacing), k1 = (flip share, scatter, picture, glints).
 * Written from the description of the mechanism (wave-driven flips, per-tile normals), not from any code.
 */
export const MOSAICO_GLSL = /* glsl */ `
// share of the interval [a - h, a + h] that [-e, e] covers
float mos_cov(float a, float h, float e){ return clamp((min(a + h, e) - max(a - h, -e)) / (2. * h), 0., 1.); }
float F_mosaico(vec2 p, float t, vec4 k0, vec4 k1){
  float n = clamp(floor(k0.x + .5), 2., 6.);
  float m = 2. * floor(.7 * n + .5) + 1.;
  vec2 ts = vec2(m * PX / 1.4, n * PX);
  // (a thousandth of a cell off: on canvases whose cell centres fall exactly on tile borders, the two
  // engines would otherwise round them to different tiles)
  vec2 gq = (p + .001 * vec2(PX / 1.4, PX)) / ts;
  vec2 id = floor(gq);
  vec2 uv = (gq - id) * 2. - 1.;
  vec2 c = (id + .5) * ts;
  float dir = floor(k0.y + .5);
  float lam = mix(.3, 1.6, k0.w);
  float s;
  if (dir < .5) s = c.x;
  else if (dir < 1.5) s = -c.y;
  else if (dir < 2.5) s = (c.x - c.y) * .7071;
  else if (dir < 3.5) s = length(c);
  else s = (atan(c.y, c.x) / TAU + .5) * lam;
  // the flip axis: across the wave's travel (diagonal: alternate tiles; sweep: along the radius)
  float vert;
  if (dir < .5) vert = 1.;
  else if (dir < 1.5) vert = 0.;
  else if (dir < 2.5) vert = mod(id.x + id.y, 2.);
  else if (dir < 3.5) vert = abs(c.x) > abs(c.y) ? 1. : 0.;
  else vert = abs(c.x) > abs(c.y) ? 0. : 1.;
  float ph = (k0.z * t - s) / lam + k1.y * .8 * (hash12(id + 7.31) - .5);
  float nf = floor(ph), fr = ph - nf;
  float f = smoothstep(0., k1.x, fr);
  float th = PI * f;
  float e = nf + step(.5, f);
  // the face: its picture and its own lean, turned with the flip
  float pic = mix(hash13(vec3(id, e)), smoothstep(.36, .64, fbm(c * 1.4 + vec2(e * .37, e * -.61))), k1.z);
  vec2 jn = (hash22(id + vec2(e * 13., e * 29.)) - .5) * .7;
  vec3 nr = normalize(vec3(jn, 1.));
  float ct = cos(th), st = sin(th);
  // the face we see turns with the tile: the old one by th, the new one (past the edge) by th - PI, so it
  // lands on its own lean when the flip ends
  float tn = f < .5 ? th : th - PI;
  float cn = cos(tn), sn = sin(tn);
  nr = vert > .5 ? vec3(nr.x * cn + nr.z * sn, nr.y, -nr.x * sn + nr.z * cn) : vec3(nr.x, nr.y * cn + nr.z * sn, -nr.y * sn + nr.z * cn);
  vec3 L = normalize(vec3(.75 * cos(t * .17), .6 * sin(t * .13) + .2, 1.));
  float dif = max(dot(nr, L), 0.);
  float gl = pow(max(dot(nr, normalize(L + vec3(0., 0., 1.))), 0.), 28.);
  float tone = mix(.1, 1., pic);
  float face = tone * (.3 + .7 * dif) + k1.w * gl * (.4 + .6 * tone);
  // raised tiles: the top row and left column lit, the bottom row and right column in shadow
  float hu = 1. / m, hv = 1. / n;
  float bev = (uv.y > 1. - 2. * hv ? .12 : uv.y < -1. + 2. * hv ? -.22 : 0.) + (uv.x < -1. + 2. * hu ? .06 : uv.x > 1. - 2. * hu ? -.12 : 0.);
  face *= 1. + bev * (1. - f * (1. - f) * 4.);
  // coverage along the axis that narrows: the face (|cos|) and, edge on, the tile's edge (one cell)
  float a = vert > .5 ? uv.x : uv.y, ha = vert > .5 ? hu : hv;
  float hf = abs(ct), he = max(hf, 1.2 * ha * st);
  float cf = mos_cov(a, ha, hf), ce = mos_cov(a, ha, he) - cf;
  float edge = .55 + .45 * st;
  return sat(cf * face + ce * edge);
}
`;
