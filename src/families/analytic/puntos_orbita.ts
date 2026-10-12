/**
 * «Puntos en órbita» (I-25): Voronoi cells, each with a dot that orbits its centre; dots of different sizes,
 * each cell a colour of the palette taken in a few steps.
 *
 *  - Sites: one per square of side «Tamaño» (screen heights), displaced inside it by a hash («Irregularidad»).
 *    Each point of the canvas belongs to the nearest site (Voronoi): that is its cell, found among the 3 × 3
 *    squares around it.
 *  - Each site carries a dot on a circle around it: radius R (a fraction of the cell), angular speed ω (its
 *    own, clockwise or not) and phase from hashes of the site; the dot is at site + R·(cos(ωt + φ), sin(ωt + φ)).
 *    Its size is a hash of the site («Variación») with a slight pulse. The dots of the nine sites around are
 *    tested, so a dot that crosses into a neighbouring cell is still drawn; its circle can be traced faintly.
 *  - Colour per cell in steps: a hash of the site, quantised to «Pasos» levels spread over the palette. The
 *    cell is filled faintly with its colour («Relleno»), its borders can be traced, and the dot shines in the
 *    colour of its own cell.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (cell size, orbit, speed, dot size), k1 = (size variation, colour steps, fill, irregularity),
 * K2 = (borders, drift, orbit track).
 */
export const PUNTOS_ORBITA_GLSL = /* glsl */ `
vec3 po_pal(float i){ return uPal[int(mod(i, max(uPalN, 1.)))]; }
// the colour step of a site, as an index of the palette
float po_q(vec2 id, float steps){ return floor(hash13(vec3(id, 1.)) * steps) / max(steps - 1., 1.); }
float po_step(vec2 id, float steps){
  float N = max(uPalN, 1.);
  return floor(po_q(id, steps) * (N - 1.) + .5);
}
vec4 FC_puntos_orbita(vec2 p, float t, vec4 k0, vec4 k1){
  vec2 u = p / k0.x + K2.y * t * vec2(.07, .03);
  vec2 n = floor(u), f = fract(u);
  float d1 = 9., d2 = 9., dv = 0., tr = 0.;
  // the track is drawn about a cell wide whatever the cell size
  float tw = max(.04, .6 * PX / k0.x);
  vec2 c1 = n, cd = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 id = n + g;
    vec2 site = g + .5 + (hash22(id) - .5) * k1.w;
    vec2 r = f - site;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; c1 = id; } else if (d < d2) d2 = d;
    // the dot that orbits this site
    float dir = hash13(vec3(id, 2.)) < .5 ? -1. : 1.;
    float w = dir * k0.z * (.5 + hash13(vec3(id, 3.))) * 1.6;
    float a = w * t + TAU * hash13(vec3(id, 4.));
    float R = k0.y * .42 * (.55 + .45 * hash13(vec3(id, 5.)));
    vec2 dp = site + R * vec2(cos(a), sin(a));
    float sz = k0.w * .34 * (1. - k1.x * .7 * hash13(vec3(id, 6.))) * (.88 + .12 * sin(t * 1.9 + TAU * hash13(vec3(id, 7.))));
    float v = 1. - smoothstep(sz * .5, sz, length(f - dp));
    if (v > dv){ dv = v; cd = id; }
    // the orbit's track, faint
    tr = max(tr, 1. - smoothstep(.5 * tw, tw, abs(sqrt(d) - R)));
  }
  float steps = k1.y;
  vec3 cc = po_pal(po_step(c1, steps)), dc = po_pal(po_step(cd, steps));
  float e = 1. - smoothstep(0., .07, sqrt(d2) - sqrt(d1));
  // the fill's brightness follows the cell's colour step too: the steps show in the glyphs
  float bgl = max(k1.z * (.22 + .3 * po_q(c1, steps)) + K2.x * .4 * e, K2.z * .5 * tr);
  vec3 col = mix(cc * (.35 + .65 * k1.z), dc, dv);
  float lum = max(bgl, dv * (.7 + .3 * hash13(vec3(cd, 8.))));
  return vec4(col, clamp(lum, 0., 1.));
}
`;
