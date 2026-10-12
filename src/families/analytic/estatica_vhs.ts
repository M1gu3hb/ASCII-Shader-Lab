/**
 * «Estática de barras» (I-19): a colour-bar test card that melts column by column, with the cuts and the
 * tracking errors of a worn tape and its scan lines, in a loop of «Ciclo» seconds.
 *
 *  - The card: seven bars (white, yellow, cyan, green, magenta, red, blue at 75 %, or the palette's colours), a
 *    strip of castellations in reverse order and a bottom row of reference patches; each cell keeps its colour.
 *  - Melting: the canvas is cut into columns «Gota» wide. Column c starts melting at s_c (in the first third of
 *    the cycle) and its content sinks by m_c = melt·r_c·0.62·min(a/0.8, 1)^1.7, a = (T − s_c)/P, rounded inside the
 *    column (a drip) and pinned at the top (the card stretches down instead of leaving a hole): the boundaries
 *    between bars, strip and bottom row drip down by different amounts in each column, faster and faster.
 *  - Tape: whole lines torn sideways now and then, a tracking band that rolls down the frame twice a cycle
 *    (lines pushed sideways and static inside it), red and blue read a little to each side (colour bleeding),
 *    and at the end of the cycle a vertical roll into static: the cut back to the fresh card.
 *  - Scan lines: every other row dimmer, and a soft brighter line sweeping down three times a cycle.
 * Everything is a function of T = t mod P: an exact loop of P seconds.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (cycle, melt, drip width, cuts), k1 = (scan lines, static, colour bleed, roll), K2.x = bars.
 */
export const ESTATICA_VHS_GLSL = /* glsl */ `
vec3 es_bar(float b, float pal){
  if (pal > .5) return uPal[int(mod(b, max(uPalN, 1.)))];
  if (b < .5) return vec3(.75);
  if (b < 1.5) return vec3(.75, .75, 0.);
  if (b < 2.5) return vec3(0., .75, .75);
  if (b < 3.5) return vec3(0., .75, 0.);
  if (b < 4.5) return vec3(.75, 0., .75);
  if (b < 5.5) return vec3(.75, 0., 0.);
  return vec3(0., 0., .75);
}
// the card at q before the tape touches it
vec3 es_card(vec2 q, float pal){
  float u = clamp((q.x + .9) / 1.8, 0., .9999);
  float b = floor(u * 7.);
  if (q.y > -.16) return es_bar(b, pal);
  if (q.y > -.24) return mod(b, 2.) < .5 ? es_bar(6. - b, pal) : vec3(.05);
  float c = floor(u * 6.);
  if (c < .5) return vec3(0., .13, .3);
  if (c < 1.5) return vec3(.95);
  if (c < 2.5) return vec3(.22, 0., .45);
  if (c < 3.5) return vec3(.03);
  if (c < 4.5) return vec3(.1);
  return vec3(.03);
}
// how far the content of column x has sunk at T
float es_melt(float x, float T, vec4 k0){
  float w = k0.z;
  float ci = floor(x / w), fx = fract(x / w) - .5;
  float s = hash12(vec2(ci, 2.)) * .33 * k0.x;
  float r = .25 + .75 * hash12(vec2(ci, 4.));
  float a = max(T - s, 0.) / k0.x;
  return k0.y * r * .62 * pow(clamp(a / .8, 0., 1.), 1.7) * (1. - 1.2 * fx * fx);
}
vec4 FC_estatica_vhs(vec2 p, float t, vec4 k0, vec4 k1){
  float P = k0.x, T = mod(t, P), pal = K2.x;
  float row = floor(p.y / PX + .125);
  float fr = floor(T * 15.);
  // the end of the cycle: a vertical roll into static, cut back to the fresh card
  float cut = smoothstep(P - .8, P - .05, T) * k1.w;
  // the tape never sits still: the frame hops a little every tape frame, and rolls away at the end of the cycle
  float y = p.y + 1.3 * cut * cut + k1.w * .014 * (hash12(vec2(fr, 5.)) - .5);
  // torn lines and the tracking band that rolls down twice a cycle
  float tear = step(hash12(vec2(row, fr)), k0.w * .06) * (hash12(vec2(row + .5, fr)) - .5) * .4;
  float yb = .58 - fract(2. * T / P) * 1.25;
  float band = exp(-pow((p.y - yb) / .04, 2.)) * k0.w;
  float xs = p.x + tear + band * (gnoise(vec2(p.y * 40., fr)) - .5) * .3;
  // melting: the content sinks, pinned at the top
  float qy = y + es_melt(xs, T, k0) * smoothstep(.6, -.4, y);
  float ch = .018 * k1.z;
  vec3 col = vec3(es_card(vec2(xs + ch, qy), pal).r, es_card(vec2(xs, qy), pal).g, es_card(vec2(xs - ch, qy), pal).b);
  // static: grain about a cell across that changes fifteen times a second
  float sn = gnoise(p / PX * vec2(1.4, 1.) + vec2(fr * 17.3, fr * 7.1));
  float sa = clamp(k1.y * .3 + band * .9 + cut, 0., 1.);
  col = mix(col, vec3(sn * .9), sa);
  // scan lines
  col *= 1. - k1.x * .32 * mod(row, 2.);
  col += k1.x * .2 * exp(-pow((p.y - (.62 - fract(3. * T / P) * 1.25)) / .05, 2.));
  col = clamp(col, 0., 1.);
  // the glyph: the brightness, and dark saturated bars (blue, red) still get a visible character
  return vec4(col, clamp(max(dot(col, vec3(.299, .587, .114)) * 1.25, max(col.r, max(col.g, col.b)) * .45), 0., 1.));
}
`;
