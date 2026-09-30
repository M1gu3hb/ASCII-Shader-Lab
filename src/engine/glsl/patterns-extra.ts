import { solidChunk } from './solid';

/**
 * Library, first batch (ported from the Codex branch): mathematical fields and three solids. Every chunk
 * is self-contained, like those of patterns.ts, and has a line-by-line CPU twin in ../basic/patterns-extra.ts.
 * p uses screen-height coordinates. Ideas: Mandelbrot, Sierpinski's carpet, Vogel's phyllotaxis,
 * hypotrochoids and quasiperiodic waves; the code is written for GLYPHOS.
 */
export const EXTRA_GLSL: Record<string, string> = {
  // escape-time Mandelbrot: a dark set with glowing bands that flow outwards from its edge
  mandelbrot: `
float P_mandelbrot(vec2 p, float t, float a, float b){
  vec2 c = (p + vec2(.16 + .07 * sin(t * .08), .02 * cos(t * .09))) * (2.6 - 1.9 * a) + vec2(-.63, 0.);
  vec2 z = vec2(0.); float n = 0., m = 0.;
  for (int i = 0; i < 64; i++){
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    m = dot(z, z);
    if (m > 256.) break;
    n += 1.;
  }
  if (n >= 63.5) return .1 + .07 * sin(atan(z.y, z.x) * 3. + t * .5);
  float sn = n + 1. - log2(.5 * log2(m));
  float glow = pow(clamp(sn / 24., 0., 1.), .55);
  float bands = .5 + .5 * cos(sn * (.35 + b * .6) - t * .6);
  return sat(.06 + glow * mix(1., .3 + .7 * bands, b));
}`,
  sierpinski: `
float P_sierpinski(vec2 p, float t, float a, float b){
  vec2 q = fract((p + .5) * (1. + a * 1.8) + vec2(t * .014, 0.));
  float cut = 0.;
  for (int i = 0; i < 4; i++){
    vec2 digit = floor(q * 3.);
    if (digit.x == 1. && digit.y == 1.) cut = 1.;
    q = fract(q * 3.);
  }
  float rim = min(min(q.x, 1. - q.x), min(q.y, 1. - q.y));
  return (1. - cut) * mix(.3 + .7 * smoothstep(0., .14, rim), 1., b);
}`,
  filotaxis: `
float P_filotaxis(vec2 p, float t, float a, float b){
  float st = .027 + a * .008, r = length(p), n = (r / st) * (r / st);
  float v = 0.;
  for (int j = -24; j <= 24; j++){
    float k = floor(n) + float(j);
    if (k < 0. || k > 340.) continue;
    float an = k * 2.39996323 + t * .08;
    vec2 c = st * sqrt(k) * vec2(cos(an), sin(an));
    float d = length(p - c);
    v = max(v, (1. - smoothstep(.006 + b * .002, .018 + b * .013, d)) * (.45 + .55 * (k / 340.)));
  }
  return v * (1. - smoothstep(.51, .64, r));
}`,
  quasicristal: `
float P_quasicristal(vec2 p, float t, float a, float b){
  float v = 0., f = 10. + a * 17.;
  for (int i = 0; i < 5; i++){
    float an = TAU * float(i) / 5.;
    v += cos(dot(p, vec2(cos(an), sin(an))) * f + t * (.16 + float(i) * .025));
  }
  v = .5 + v * .1;
  return mix(v, hard(v, .64), b);
}`,
  // contour lines one cell wide wherever the slope is (the gradient turns height into distance); every fifth brighter
  topografia: `
float P_topografia(vec2 p, float t, float a, float b){
  float k = .6 + a * 1., n = 5. + b * 9., e = .01;
  vec2 o = vec2(t * .035, -t * .02);
  float h = fbm(p * k + o) + .1 * sin(p.x * 2. + p.y * 1.5);
  float hx = fbm((p + vec2(e, 0.)) * k + o) + .1 * sin((p.x + e) * 2. + p.y * 1.5);
  float hy = fbm((p + vec2(0., e)) * k + o) + .1 * sin(p.x * 2. + (p.y + e) * 1.5);
  float g = length(vec2(hx - h, hy - h)) / e * n;
  float f = fract(h * n), d = min(f, 1. - f) / max(g, .5);
  float major = 1. - step(.5, mod(floor(h * n + .5), 5.));
  return sat(.06 + .22 * h + (1. - smoothstep(PX * .5, PX * 1.6, d)) * (.55 + .35 * major));
}`,
  espirografo: `
float P_espirografo(vec2 p, float t, float a, float b){
  float q = floor(3. + a * 7.), arm = .44 * (.18 + b * .3), r = .44 - arm;
  float d = 8.; vec2 prev = vec2(r + arm * cos(t * .22), -arm * sin(t * .22));
  for (int i = 1; i <= 160; i++){
    float u = float(i) / 160. * TAU;
    vec2 next = r * vec2(cos(u), sin(u)) + arm * vec2(cos(q * u + t * .22), -sin(q * u + t * .22));
    d = min(d, sdSeg(p, prev, next)); prev = next;
  }
  return sat(1. - smoothstep(PX * .35, PX * 1.5, d) + .25 * exp(-d * 18.));
}`,
  // traces of a circuit board with pads; pulses of light run along the traces
  circuitos: `
float P_circuitos(vec2 p, float t, float a, float b){
  float k = 8. + a * 13.; vec2 g = p * k, id = floor(g), f = fract(g);
  float h = hash12(id);
  float hor = 1. - smoothstep(.018, .04 + PX * k * .4, abs(f.y - .5));
  float ver = 1. - smoothstep(.018, .04 + PX * k * .4, abs(f.x - .5));
  float run = h > .75 ? max(hor, ver) : h < .5 ? hor : ver;
  float s = sin((h < .5 ? g.x : g.y) * 1.3 - t * 2.5 + h * 20.), pulse = s * s * s * s;
  pulse *= pulse * pulse * pulse;
  float pad = 1. - smoothstep(.12, .2, length(f - .5));
  float blink = .5 + .5 * sin(t * 1.4 + h * TAU);
  return sat(run * (.3 + b * .4 + .6 * pulse) + step(.77, h) * pad * (.5 + .5 * blink));
}`,
  dunas: `
float P_dunas(vec2 p, float t, float a, float b){
  float q = p.y * (13. + a * 24.)
    + sin(p.x * 4. + t * .18) * (1.2 + b * 3.)
    + 1.3 * sin(p.x * 9. - t * .12) + .8 * fbm(p * 3. + vec2(t * .02, 0.));
  float f = fract(q / TAU);
  return sat(.14 + .42 * pow(f, 1.8) + .7 * pow(1. - f, 7.));
}`,
  entrelazado: `
float P_entrelazado(vec2 p, float t, float a, float b){
  vec2 g = p * (7. + a * 12.), id = floor(g), f = fract(g);
  float h = 1. - smoothstep(.12, .22, abs(f.y - .5));
  float v = 1. - smoothstep(.12, .22, abs(f.x - .5));
  float over = mod(id.x + id.y, 2.);
  float warp = .5 + .5 * cos((over > .5 ? f.y : f.x) * TAU + t * .05);
  return sat(max(h * (over > .5 ? .4 : 1.), v * (over > .5 ? 1. : .4)) * (.55 + .45 * warp) * (.6 + .4 * b));
}`,
  obelisco: solidChunk('obelisco', {
    rot: ['.22 + .12 * sin(t * .21)', '.35 + t * .38'], eye: 3, focal: 1.65, bound: .95, steps: 64, k: .7, light: [-.6, .7, -.5],
    sdf: `float y = clamp(q.y, -.64, .64), s = .8 + a * .4;
  float w = (y < .42 ? mix(.3, .19, (y + .64) / 1.06) : .19 * (1. - (y - .42) / .22)) * s;
  return max(max(abs(q.x), abs(q.z)) - w, abs(q.y) - .64) * .8;`,
    shade: '.1 + .72 * dif + .15 * face + .25 * spec + .2 * b * step(q.y, .42) * (1. - smoothstep(.015, .05, abs(fract((q.y + .64) * (6. + b * 14.)) - .5)))',
  }),
  prisma: solidChunk('prisma', {
    rot: ['.45 + .1 * sin(t * .24)', 't * .42'], eye: 3, focal: 1.65, bound: .9, steps: 64, k: .78, light: [-.6, .65, -.5],
    sdf: `vec2 z = abs(q.xz);
  return max(max(z.x * .8660254 + z.y * .5, z.y) - (.43 + a * .12), abs(q.y) - .55);`,
    shade: '.05 + dif * (.5 + .42 * (.5 + .5 * cos(q.y * (14. + b * 28.) + t * .5))) + .15 * face + .3 * spec',
  }),
  reloj_arena: solidChunk('reloj_arena', {
    rot: ['.2 + .1 * sin(t * .13)', 't * .38'], eye: 3, focal: 1.65, bound: .9, steps: 72, k: .65, light: [-.6, .7, -.5],
    sdf: `float r = .12 + (abs(q.y) / .59) * (.29 + a * .1), l = length(q.xz);
  float body = max(l - r, abs(q.y) - .59);
  float rim = length(vec2(l - (.43 + a * .1), abs(q.y) - .59)) - .034;
  return min(body, rim);`,
    shade: '.05 + .6 * dif + .2 * face + .3 * spec + b * .4 * smoothstep(-.05, .04, -.12 - .3 * (.5 + .5 * sin(t * .38)) - q.y) * step(q.y, 0.)',
  }),
};
