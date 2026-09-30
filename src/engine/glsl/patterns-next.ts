import { solidChunk, type SolidChunk } from './solid';

/**
 * Library, second batch (from the Codex branch, redrawn for GLYPHOS): calm fields, curves and seven animated
 * solids. CPU twins in ../basic/patterns-next.ts, step by step. Lines are never thinner than a cell (PX), so
 * curves do not break into dots; every pattern moves at speed 1.
 */
export const NEXT_GLSL: Record<string, string> = {
  mareas_lentas: `
float P_mareas_lentas(vec2 p, float t, float a, float b){
  float y = p.y + .14 * sin(p.x * 2.7 + t * .21) + .045 * sin(p.x * 8. - t * .14);
  float f = abs(sin(y * (13. + a * 19.)));
  return sat(.08 + .65 * pow(f, 1.5 + b * 2.) + .26 * (1. - smoothstep(-.45, .45, p.y)));
}`,
  // a raked gravel garden: straight furrows that bend into rings around two stones
  jardin_zen: `
float P_jardin_zen(vec2 p, float t, float a, float b){
  vec2 s1 = vec2(-.36 + .04 * sin(t * .07), .07), s2 = vec2(.4, -.13 + .03 * cos(t * .05));
  float dm = min(length(p - s1) - .085, length(p - s2) - .06);
  float w = smoothstep(.3, .03, dm);
  float u = mix(p.y + .012 * sin(p.x * 3. + t * .1), dm, w) * (19. + a * 25.) - t * .15;
  float v = pow(abs(sin(u)), 3. + b * 4.);
  float stone = 1. - smoothstep(-PX, PX, dm);
  return sat(mix(.05 + .8 * v + .1 * fbm(p * 2.), .92 - .25 * smoothstep(-.06, 0., dm), stone));
}`,
  // mountain ridges in five layers, the nearest brightest, each one fading into the mist below its crest
  bruma_lejana: `
float P_bruma_lejana(vec2 p, float t, float a, float b){
  float v = .03 * (1. - smoothstep(-.5, .5, p.y));
  for (int i = 0; i < 5; i++){
    float k = float(i);
    float x = p.x * (1.1 + k * .35) + t * (.012 + k * .014) + k * 3.7;
    float ridge = .28 - k * .15 + (fbm(vec2(x, k * 7.1)) - .5) * (.25 + a * .45) * (1. - k * .1);
    float below = ridge - p.y;
    float lum = (.14 + k * .15) * (.5 + .5 * exp(-max(below, 0.) / (.04 + b * .2)));
    v = mix(v, lum, smoothstep(-PX, PX, below));
  }
  return sat(v);
}`,
  // fireflies in a loose grid: each drifts around its place and glows on and off
  luciernagas: `
float P_luciernagas(vec2 p, float t, float a, float b){
  vec2 g = p * (4. + a * 7.), id = floor(g);
  float v = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 c0 = id + vec2(float(i), float(j));
    float h = hash12(c0);
    if (h < .3) continue;
    float ph = t * (.3 + h * .5) + h * TAU;
    vec2 c = c0 + .5 + .38 * vec2(sin(ph * 1.17), cos(ph * .83 + h * 4.));
    float blink = .5 + .5 * sin(t * (.8 + h * 1.5) + h * 20.);
    blink = blink * blink * blink;
    vec2 q = g - c;
    float d2 = dot(q, q);
    v = max(v, blink * (exp(-d2 * 60.) + (.15 + b * .5) * exp(-d2 * (6. - b * 4.))));
  }
  return sat(v);
}`,
  // drops falling on a pond: each opens three rings, then falls somewhere else
  lluvia_mansa: `
float P_lluvia_mansa(vec2 p, float t, float a, float b){
  float v = 0., w = PX * (.4 + b * 1.4);
  for (int i = 0; i < 10; i++){
    float fi = float(i), u = t * (.16 + hash12(vec2(fi, 3.)) * .08) + hash12(vec2(fi, 7.)), n = floor(u), k = u - n;
    vec2 c = vec2(hash12(vec2(fi, n)) * 1.7 - .85, hash12(vec2(n, fi + 11.)) * .9 - .45);
    float d = length(p - c);
    for (int j = 0; j < 3; j++){
      float kj = k - float(j) * .12;
      if (kj <= 0.) continue;
      float fade = 1. - kj;
      v = max(v, (1. - smoothstep(w, w + PX * 1.2, abs(d - kj * (.16 + a * .3)))) * fade * sqrt(fade) * (1. - float(j) * .25));
    }
    v = max(v, exp(-d * d * 4000.) * (1. - smoothstep(0., .06, k)));
  }
  return sat(v);
}`,
  // a grove of bamboo: leaning stalks with nodes and leaves that flutter
  bambu: `
float P_bambu(vec2 p, float t, float a, float b){
  float k = 3. + a * 6., col = floor(p.x * k), v = 0.;
  for (int j = -1; j <= 1; j++){
    float c = col + float(j), h = hash12(vec2(c, 3.));
    if (h < .2) continue;
    float lean = (h - .5) * .12 + .025 * sin(t * .35 + h * 6.);
    float base = (c + .3 + .4 * hash12(vec2(c, 9.))) / k;
    float wd = (.008 + b * .014) * (.7 + .6 * h);
    float seg = .16 + h * .1, fy = fract((p.y + h) / seg);
    float joint = 1. - smoothstep(0., .07, min(fy, 1. - fy));
    float dx = abs(p.x - base - lean * (p.y + .5));
    float ww = wd * (1. + .5 * joint);
    v = max(v, (1. - smoothstep(ww, ww + PX * 1.2, dx)) * (.5 + .4 * joint));
    for (int m = 0; m < 3; m++){
      float fm = float(m), hm = hash12(vec2(c, fm + 20.));
      float y0 = -.3 + fm * .28 + h * .1;
      vec2 o = vec2(base + lean * (y0 + .5), y0);
      float an = (mod(fm + c, 2.) < .5 ? 1. : -1.) * (.55 + .5 * hm) - 1.5708 + .12 * sin(t * .9 + hm * 9.);
      vec2 dir = vec2(cos(an), sin(an)), q = p - o;
      float lx = dot(q, dir), ly = dot(q, vec2(-dir.y, dir.x)), L = .09 + .06 * hm;
      float hw = .018 * sin(3.14159 * clamp(lx / L, 0., 1.));
      float leaf = max(abs(ly) - hw, max(-lx, lx - L));
      v = max(v, (1. - smoothstep(0., PX, leaf)) * .7);
    }
  }
  return sat(v);
}`,
  respiracion: `
float P_respiracion(vec2 p, float t, float a, float b){
  vec2 q = p / vec2(1., .78); float r = length(q), pulse = .36 + .045 * sin(t * .52);
  float z = (r - pulse) * (19. + a * 36.);
  float core = exp(-r * r * (6. + (1. - b) * 14.)) * (.35 + .13 * sin(t * .52));
  return sat(exp(-z * z) * .77 + core);
}`,
  estuario: `
float P_estuario(vec2 p, float t, float a, float b){
  float flow = p.x * .65 + p.y * .9 + sin(p.y * 3. + t * .15) * (.12 + a * .25);
  float q = flow * (13. + b * 17.) + fbm(p * 3. + vec2(t * .025, 0.)) * 2. - t * .3;
  return sat(.1 + .74 * pow(abs(sin(q)), 3.) + .14 * fbm(p * 2.));
}`,
  // the lemniscate of Bernoulli, breathing and turning, with a pen of light running along it
  lemniscata: `
float P_lemniscata(vec2 p, float t, float a, float b){
  float cr = cos(t * .05), sr = sin(t * .05);
  vec2 q = vec2(cr * p.x + sr * p.y, -sr * p.x + cr * p.y) / .9;
  float k = .16 + a * .2 + .025 * sin(t * .31), r2 = dot(q, q);
  float f = r2 * r2 - 2. * k * (q.x * q.x - q.y * q.y);
  vec2 g = vec2(4. * r2 * q.x - 4. * k * q.x, 4. * r2 * q.y + 4. * k * q.y);
  float d = abs(f) / sqrt(dot(g, g) + 1e-4) * .9, w = PX * (.4 + b * 1.6);
  float v = (1. - smoothstep(w, w + PX * 1.2, d)) * .8 + .12 * exp(-d * 30.), c = sqrt(2. * k);
  for (int j = 0; j < 4; j++){
    float u = t * .7 - float(j) * .1, su = sin(u);
    vec2 pen = c * vec2(cos(u), su * cos(u)) / (1. + su * su);
    vec2 e = (q - pen) * .9;
    v = max(v, exp(-dot(e, e) / (.0004 + PX * PX)) * (1. - float(j) * .22));
  }
  return sat(v);
}`,
  superformula: `
float P_superformula(vec2 p, float t, float a, float b){
  float th = atan(p.y, p.x) + t * .08, m = floor(3. + a * 7.), n = .4 + b * 1.3 + .2 * sin(t * .23);
  float co = abs(cos(m * th / 4.)), si = abs(sin(m * th / 4.));
  float rad = .43 / pow(pow(co, n) + pow(si, n), 1. / n);
  float co2 = abs(cos(m * (th + .01) / 4.)), si2 = abs(sin(m * (th + .01) / 4.));
  float slope = (.43 / pow(pow(co2, n) + pow(si2, n), 1. / n) - rad) / .01 / max(length(p), .05);
  float d = abs(length(p) - rad) / sqrt(1. + min(slope * slope, 25.));
  return sat((1. - smoothstep(PX * .6, PX * 1.8, d)) * .9 + .17 * exp(-d * 28.));
}`,
  // a harmonograph: two decaying pendulums per axis draw a rosette that slowly changes
  armonografo: `
float P_armonografo(vec2 p, float t, float a, float b){
  float d = 9., e = 1., ph = t * .07, dec = .02 + b * .05, f2 = 3.004 + a * .04;
  vec2 prev = vec2(0.);
  for (int i = 0; i <= 320; i++){
    float u = float(i) * .075, ex = exp(-u * dec);
    vec2 next = vec2(sin(2. * u + ph) + .7 * sin(f2 * u + 1.2), cos(2.005 * u + ph) + .7 * sin(3. * u + 2.)) * .26 * ex;
    if (i > 0){
      float s = sdSeg(p, prev, next);
      if (s < d){ d = s; e = ex; }
    }
    prev = next;
  }
  return sat((1. - smoothstep(PX * .5, PX * 1.6, d)) * (.4 + .6 * e) + .1 * exp(-d * 25.));
}`,
  // chains hanging from their two ends, swaying a little
  catenaria: `
float P_catenaria(vec2 p, float t, float a, float b){
  float v = 0., w = PX * (.4 + b * 1.4);
  for (int i = 0; i < 5; i++){
    float j = float(i), k = 1.6 + a * 2.4 + j * .35, span = .8 - j * .1, top = .36 - j * .02;
    float sag = (.18 + j * .09) * (1. + .08 * sin(t * .4 + j * 1.3));
    float x = p.x - .025 * sin(t * .5 + j) * (1. - (p.x / span) * (p.x / span));
    float den = cosh(span * k) - 1.;
    float y = top - sag * (1. - (cosh(x * k) - 1.) / den), dy = sag * k * sinh(x * k) / den;
    float d = abs(p.y - y) / sqrt(1. + dy * dy);
    v = max(v, (1. - smoothstep(w, w + PX * 1.2, d)) * step(abs(p.x), span) * (.5 + j * .1));
    v = max(v, 1. - smoothstep(.012, .012 + PX, length(vec2(abs(p.x) - span, p.y - top))));
  }
  return sat(v);
}`,
  // circles nested inside each other, each touching the one around it at a point that turns
  apolonio: `
float P_apolonio(vec2 p, float t, float a, float b){
  float r = .46, q = .74 + a * .16, v = 0., w = PX * (.4 + b * 1.4), turn = .5 + .25 * sin(t * .11);
  vec2 c = vec2(0.);
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    v = max(v, (1. - smoothstep(w, w + PX * 1.2, abs(length(p - c) - r))) * (1. - fi * .045));
    float rn = r * q, an = t * .15 + fi * turn;
    c += (r - rn) * vec2(cos(an), sin(an));
    r = rn;
  }
  return sat(v);
}`,
  campo_flujo: `
float P_campo_flujo(vec2 p, float t, float a, float b){
  float u = p.y + (.13 + a * .2) * sin(p.x * 4. + t * .16) + .08 * sin(p.x * 9. - p.y * 5. + t * .1);
  float v = abs(sin(u * (22. + b * 18.) - t * .2));
  return sat(.06 + .83 * pow(v, 5.));
}`,
  flor_armonica: `
float P_flor_armonica(vec2 p, float t, float a, float b){
  float th = atan(p.y, p.x), r = length(p), k = floor(5. + a * 8.);
  float edge = .3 + .12 * cos(k * th + t * .28) + .045 * cos((k * 2. + 3.) * th - t * .21);
  float de = (-.12 * k * sin(k * th + t * .28) - .045 * (k * 2. + 3.) * sin((k * 2. + 3.) * th - t * .21)) / max(r, .05);
  float di = .022 * k * cos(k * th - t * .16) / max(r, .05);
  float d = abs(r - edge) / sqrt(1. + min(de * de, 25.)), inner = abs(r - .17 - .022 * sin(k * th - t * .16)) / sqrt(1. + min(di * di, 25.));
  float w = PX * (.4 + b * 1.4);
  return sat(1. - smoothstep(w, w + PX * 1.2, min(d, inner)) + .12 * exp(-d * 20.));
}`,
  estrella_mar: `
float P_estrella_mar(vec2 p, float t, float a, float b){
  float th = atan(p.y, p.x) + t * .08, r = length(p), n = 5. + floor(a * 4.), e = 2. + b * 3.;
  float c = .5 + .5 * cos(n * th), petals = pow(c, e);
  float edge = .16 + .34 * petals, slope = .34 * e * pow(c, e - 1.) * .5 * n * sin(n * th) / max(r, .05);
  float d = abs(r - edge) / sqrt(1. + min(slope * slope, 25.));
  return sat((1. - smoothstep(PX * .5, PX * 1.8, d)) * .83 + .3 * (1. - smoothstep(edge - .06, edge + .03, r)));
}`,
};

/** The camera, light and march the solids share (see ./solid.ts); highlight and detail per solid. */
const SOLID: Omit<SolidChunk, 'sdf' | 'shade'> = {
  rot: ['.27 + .13 * sin(t * .16)', '.3 + t * .23'], eye: 2.55, focal: 1.65, bound: 1., steps: 72, k: .66, light: [-.6, .7, -.5],
};
const solid = (id: string, sdf: string, detail: string, over: Partial<SolidChunk> = {}) =>
  solidChunk(id, { ...SOLID, ...over, sdf, shade: `.06 + .66 * dif + .18 * face + .3 * spec + (${detail}) * .16` });

Object.assign(NEXT_GLSL, {
  simbiosis: solid('simbiosis', `
  float s = 10., k = .05 + b * .35, rad = .23 + .22 * sin(t * .4);
  for (int i = 0; i < 3; i++){
    float ph = t * .63 + float(i) * TAU / 3.;
    float d = length(q - vec3(rad * cos(ph), .28 * sin(ph * .85), rad * sin(ph))) - (.22 + a * .1);
    float h = max(k - abs(s - d), 0.) / k;
    s = min(s, d) - h * h * k * .25;
  }
  return s;`, '.4 + .4 * sin(q.y * 11. + t * .7)'),
  // a pendulum wave: nine bobs on one beam, each at its own rhythm
  pendulos: solid('pendulos', `
  float s = length(vec2(q.y - .5, q.z)) - .018;
  s = max(s, abs(q.x) - .74);
  for (int i = 0; i < 9; i++){
    float f = float(i), x = -.64 + f * .16;
    float an = sin(t * (1. + f * .07)) * (.15 + a * .45);
    vec3 c = vec3(x, .5 - .72 * cos(an), .72 * sin(an));
    float ball = length(q - c) - (.05 + b * .045);
    vec3 v = vec3(x, .5, 0.) - c;
    float u = clamp(dot(q - c, v) / dot(v, v), 0., 1.);
    s = min(s, min(ball, length(q - c - v * u) - .007));
  }
  return s;`, '.2', { rot: ['.3', '.35 + .22 * sin(t * .13)'], bound: 1.05 }),
  // a ribbon that waves and twists as it flows
  cinta_ola: solid('cinta_ola', `
  float ph = q.x * 4. + t * .9, c = cos(ph), s = sin(ph);
  vec2 o = vec2(q.y - .2 * s, q.z - .14 * c);
  vec2 uv = vec2(c * o.x - s * o.y, s * o.x + c * o.y);
  return max(max(abs(uv.x) - (.012 + b * .02), abs(uv.y) - (.06 + a * .07)), abs(q.x) - .8) * .45;`,
  '.5 + .5 * sin(q.x * 22. - t * 1.2)', { steps: 96 }),
  jade_vivo: solid('jade_vivo', `
  float r = length(q), th = atan(q.z, q.x), phi = atan(q.y, length(q.xz));
  float wave = .045 * sin(th * 6. + t * .58) * cos(phi * 4. - t * .41) + .025 * sin(phi * 11. + th * 3. + t * .3);
  return r - (.43 + a * .12 + wave * (.4 + b));`, '.5 + .5 * sin(q.y * 17. + t * .5)'),
  // a goblet: open bowl, stem with a knot, round foot
  caliz: solid('caliz', `
  float l = length(q.xz), y = q.y, R = .28 + a * .08;
  float bowl = max(abs(length(vec2(l, y - .16)) - R) - (.012 + b * .02), y - .16 - R * .7);
  float stem = max(l - .03, max(y - .2 + R, -.48 - y));
  float knot = length(vec2(l, y + .3)) - .05;
  float foot = length(vec2(max(l - .2, 0.), y + .5)) - .018;
  return min(min(bowl, stem), min(knot, foot));`, '.45 + .35 * cos(atan(q.z, q.x) * 8. + t * .3)'),
  medusa: solid('medusa', `
  float bell = (.33 + a * .12) * (1. + .06 * sin(t * 1.3));
  float dome = max(length(vec3(q.x, max(q.y - .05, 0.) * .75, q.z)) - bell, -q.y + .04);
  float tent = 10.;
  for (int i = 0; i < 7; i++){
    float ph = float(i) * TAU / 7.;
    vec2 c = vec2(.19 * cos(ph) + .05 * sin(t * .5 + q.y * 7. + ph), .19 * sin(ph) + .05 * cos(t * .5 + q.y * 7. + ph));
    tent = min(tent, max(length(q.xz - c) - (.012 + b * .013), max(-.6 - q.y, q.y + .07)));
  }
  return min(dome, tent);`, '.4 + .5 * exp(-abs(q.y - .05) * 6.)'),
  esferas_orbita: solid('esferas_orbita', `
  float s = 10.;
  for (int i = 0; i < 6; i++){
    float ph = float(i) * TAU / 6. + t * (.35 + a * .35);
    s = min(s, length(q - vec3(.4 * cos(ph), .21 * sin(ph * 2. + t * .2), .4 * sin(ph))) - (.11 + b * .05));
  }
  return min(s, length(vec2(length(q.xz) - .4, q.y)) - .017);`, '.5 + .5 * cos(q.x * 9. + q.z * 8.)'),
});
