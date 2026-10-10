/**
 * «Corrientes de color» (V-01): spots of the palette's colours drift along trajectories of their own (each
 * with its own pair of frequencies), over a domain bent by two crossed waves and a swirl. Each cell takes the
 * inverse-distance mix of the spots' colours (Shepard weights: sharper with «Contraste»), so the colour has a
 * spatial layout of its own; the glyph comes from that colour's brightness within the palette's range, or from
 * the borders between currents. Written from the published description of a mesh gradient (docs), not from
 * any shader's code.
 * «Textura» dithers the borders and adds a fine flow inside each current, so the glyphs' density changes within it.
 * Parameters: k0 = (spots, swirl, warp, speed), k1 = (scale, contrast, texture, glyph by).
 */
export const CORRIENTES_GLSL = /* glsl */ `
vec3 corr_pal(float i){ return uPal[int(mod(i, max(uPalN, 1.)))]; }
vec4 FC_corrientes(vec2 p, float t, vec4 k0, vec4 k1){
  float n = clamp(floor(k0.x + .5), 2., 8.), sw = k0.y, wa = k0.z, T = t * k0.w;
  vec2 u = p / k1.x;
  // grain: each cell reads the field from a point of its own nearby, so borders come out dithered
  u += k1.z * .045 * (hash22(floor(p / max(PX, 1e-4)) + 17.) - .5);
  // two passes of crossed waves, weaker towards the edges
  float fall = 1. / (1. + 1.5 * dot(u, u));
  u.x += wa * .16 * fall * sin(u.y * 3.1 + T * 1.17);
  u.y += wa * .13 * fall * sin(u.x * 2.6 - T * .93);
  u.x += wa * .07 * fall * sin(u.y * 5.3 - T * .71 + 1.9);
  u.y += wa * .06 * fall * sin(u.x * 4.7 + T * .53 + 4.1);
  // a swirl around the centre, its sense slowly turning
  u = rot2(u, sw * 2.6 * length(u) * cos(T * .19 + .7));
  float pw = mix(2., 6.5, k1.y);
  vec3 acc = vec3(0.);
  float ws = 0., wmax = 0.;
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    if (fi >= n) break;
    float a = fract(fi * .6180339), b = fract(fi * .4142136 + .31);
    vec2 c = vec2(.82 * sin(T * (.23 + .19 * a) + fi * 2.39), .4 * sin(T * (.17 + .15 * b) + fi * 1.31 + 1.1));
    c += .12 * vec2(sin(T * (.61 + .2 * b) + fi), cos(T * (.53 + .2 * a) + fi * 2.));
    float d = length(u - c);
    float w = 1. / (pow(d, pw) + 1e-3);
    acc += w * corr_pal(fi);
    ws += w;
    wmax = max(wmax, w);
  }
  vec3 col = acc / ws;
  // the brightness within the palette's own range: a dark palette still spans every glyph
  float lo = 1., hi = 0.;
  for (int i = 0; i < 6; i++){
    if (float(i) >= uPalN) break;
    float l = dot(uPal[i], vec3(.299, .587, .114));
    lo = min(lo, l); hi = max(hi, l);
  }
  float lum = clamp((dot(col, vec3(.299, .587, .114)) - lo) / max(hi - lo, .08), 0., 1.);
  float edge = 1. - smoothstep(.42, .94, wmax / ws);
  float g = k1.w < .5 ? lum : k1.w < 1.5 ? edge : max(lum * .85, edge);
  // texture: a fine flow inside each current (the density changes within it, as ink fibres), with the grain
  g += k1.z * .5 * (gnoise(u * 9. + vec2(T * .7, -T * .5)) - .5) * (.35 + .65 * g);
  return vec4(col, clamp(g, 0., 1.));
}
`;
