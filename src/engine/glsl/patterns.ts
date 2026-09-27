/**
 * Pattern library. Each entry is a self-contained GLSL chunk defining
 *   float P_<id>(vec2 p, float t, float a, float b)
 * p: centred coordinates in screen heights (y up), t: layer time in seconds,
 * a/b: shape parameters in 0..1. Returns luminance 0..1.
 * The global PX holds the size of one cell in p units (for crisp lines).
 * Only the chunks used by a recipe are compiled, so this file can grow freely.
 */
export const PATTERN_GLSL: Record<string, string> = {
  nube: `
float P_nube(vec2 p, float t, float a, float b){
  vec2 d = vec2(cos(b * TAU), sin(b * TAU)) * t * .06;
  float v = fbm3(vec3(p * (1.3 + a * 2.6) + d, t * .11));
  return smoothstep(.3 - a * .08, .72, v);
}`,
  marmol: `
float P_marmol(vec2 p, float t, float a, float b){
  vec2 q = p * (1.2 + b * 2.);
  vec2 w1 = vec2(fbm(q + vec2(0., t * .08)), fbm(q + vec2(5.2, 1.3) - t * .07));
  vec2 w2 = vec2(fbm(q + 3.5 * w1 + vec2(1.7, 9.2) + t * .05), fbm(q + 3.5 * w1 + vec2(8.3, 2.8)));
  return smoothstep(.2, .8, fbm(q + (2. + a * 4.) * w2));
}`,
  crestas: `
float P_crestas(vec2 p, float t, float a, float b){
  vec2 q = p * (1.2 + b * 2.5) + vec2(t * .03, t * .07);
  float s = 0., amp = .6, f = 1., w = 1.;
  for (int i = 0; i < 5; i++){
    float n = 1. - abs(gnoise(q * f + float(i) * 7.13) * 2. - 1.);
    n = pow(n, 1.5 + a * 5.);
    s += n * amp * w; w = clamp(n * 1.6, 0., 1.); amp *= .5; f *= 2.05;
  }
  return sat(s * 1.15);
}`,
  fuego: `
float P_fuego(vec2 p, float t, float a, float b){
  vec2 q = vec2(p.x * 2.4, p.y * 1.7 - t * (1.1 + b * .8));
  float n = fbm(q + vec2(0., fbm(q * 1.6 + vec2(3.1, -t * .5)) * (.6 + b * .9)));
  float base = p.y + .56 - a * .3;
  return sat(n * 1.75 - base * 1.25);
}`,
  aurora: `
float P_aurora(vec2 p, float t, float a, float b){
  float v = 0.;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float y0 = .12 * sin(p.x * (1.3 + fi * .6) + t * (.25 + fi * .1) + fi * 2.1)
             + .18 * (fbm(vec2(p.x * 1.4 + fi * 4.3, t * .08)) - .5) + (fi - 1.) * (.06 + a * .14);
    float d = p.y - y0;
    float band = exp(-d * d * (30. + b * 140.));
    float rays = .55 + .45 * gnoise(vec2(p.x * (14. + fi * 3.), fi * 9. + t * .3));
    float up = smoothstep(-.02, .25, d) * exp(-max(d, 0.) * 6.);
    v += (band * .85 + up * .35 * rays) * (1. - fi * .18);
  }
  return sat(v);
}`,
  causticas: `
float P_causticas(vec2 p, float t, float a, float b){
  vec2 q = p * TAU * (.6 + a * 1.2) - 250.;
  vec2 i = q; float c = 1.;
  for (int n = 0; n < 4; n++){
    float tt = t * .45 * (1. - 3.5 / float(n + 1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(q.x / (sin(i.x + tt) / .005), q.y / (cos(i.y + tt) / .005)));
  }
  c /= 4.;
  c = 1.17 - pow(c, 1.4);
  return sat(pow(abs(c), 2.2 + b * 4.) * 1.25);
}`,
  lava: `
float P_lava(vec2 p, float t, float a, float b){
  float s = 0.;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    vec2 c = vec2(.78 * sin(t * (.23 + fi * .061) + fi * 1.93), .40 * cos(t * (.19 + fi * .083) + fi * 2.71));
    vec2 d = p - c; s += (.010 + a * .022) / (dot(d, d) + .0004);
  }
  return smoothstep(.55, 1.2 + b * 2.6, s);
}`,
  celulas: `
float P_celulas(vec2 p, float t, float a, float b){
  vec2 v = voro(p * (2. + a * 6.), t * .7);
  float core = pow(sat(1. - v.x * 1.15), 1. + b * 3.);
  float rim = smoothstep(.02, .18, v.y - v.x);
  return sat(core * mix(1., rim, .6));
}`,
  grietas: `
float P_grietas(vec2 p, float t, float a, float b){
  float k = 2. + a * 6.;
  vec2 v = voro(p * k, t * .45);
  float w = PX * k * (1. + b * 3.);
  return 1. - smoothstep(w * .3, w, v.y - v.x);
}`,
  anillos: `
float P_anillos(vec2 p, float t, float a, float b){
  return hard(.5 + .5 * sin(length(p) * (8. + a * 44.) - t * 3.), b);
}`,
  cuadros: `
float P_cuadros(vec2 p, float t, float a, float b){
  return hard(.5 + .5 * sin(max(abs(p.x), abs(p.y)) * (8. + a * 40.) - t * 3.), b);
}`,
  rayos: `
float P_rayos(vec2 p, float t, float a, float b){
  float an = atan(p.y, p.x), r = length(p);
  float v = .5 + .5 * sin(an * floor(3. + a * 20.) + t * 1.2 + r * (b - .5) * 24.);
  return v * sat(1.2 - r * .7);
}`,
  tablero: `
float P_tablero(vec2 p, float t, float a, float b){
  vec2 q = p * (3. + a * 12.);
  q += b * .9 * vec2(sin(q.y * .8 + t), cos(q.x * .8 - t * .8));
  return mod(floor(q.x) + floor(q.y), 2.);
}`,
  truchet: `
float P_truchet(vec2 p, float t, float a, float b){
  float k = 3. + a * 9.;
  vec2 q = p * k;
  vec2 id = floor(q); vec2 f = fract(q) - .5;
  float flip = step(.5, hash12(id + floor(t * .35 + hash12(id * 1.7) * 3.) * .37));
  if (flip > .5) f.x = -f.x;
  float d = min(abs(length(f - .5) - .5), abs(length(f + .5) - .5));
  float w = .04 + b * .16 + PX * k * .4;
  return 1. - smoothstep(w, w + PX * k * .9, d);
}`,
  hex: `
vec4 hexCell(vec2 p){
  vec2 s = vec2(1., 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(.5, 1.)) / s.xyxy) + .5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + .5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + .5);
}
float P_hex(vec2 p, float t, float a, float b){
  vec4 h = hexCell(p * (3. + a * 12.));
  vec2 q = abs(h.xy);
  float d = max(dot(q, vec2(.5, .8660254)), q.x);
  float ph = hash12(h.zw);
  float pulse = .5 + .5 * sin(t * 1.8 + ph * TAU + length(h.zw) * .35);
  float edge = smoothstep(.5, .5 - .04 - b * .3, d);
  return edge * mix(.25, 1., pulse);
}`,
  trama: `
float P_trama(vec2 p, float t, float a, float b){
  float sc = 4. + a * 10.;
  vec2 q = rot2(p, .7854) * sc;
  vec2 id = floor(q) + .5;
  vec2 c = rot2(id / sc, -.7854);
  float tone = .5 + .5 * sin(c.x * 2.6 + t * .9) * cos(c.y * 3.1 - t * .6);
  tone = mix(tone, smoothstep(.25, .75, fbm(c * 1.6 + vec2(t * .05, -t * .03))), b);
  float r = sqrt(tone) * .64;
  return 1. - smoothstep(r - .1, r + .1, length(q - id));
}`,
  moire: `
float P_moire(vec2 p, float t, float a, float b){
  float f = 18. + a * 50.;
  float l1 = .5 + .5 * sin(p.x * f);
  vec2 q = rot2(p, .03 + .25 * b * sin(t * .15) + .015 * sin(t * .5));
  q *= 1. + .03 * sin(t * .23);
  return l1 * (.5 + .5 * sin(q.x * f));
}`,
  rombos: `
float P_rombos(vec2 p, float t, float a, float b){
  vec2 q = p * (1.5 + a * 6.);
  vec2 f = fract(q) - .5;
  float z = abs(f.x) + abs(f.y);
  return .5 + .5 * sin(z * TAU * (1. + b * 2.) - t * 2.2 + length(floor(q)) * .6);
}`,
  franjas: `
float P_franjas(vec2 p, float t, float a, float b){
  float k = 6. + a * 34.;
  float v = .5 + .5 * sin((p.x + p.y * (b * 2. - 1.)) * k - t * 2.5 + sin(p.y * 2.4 + t * .7) * .8);
  return hard(v, .55);
}`,
  caleido: `
float P_caleido(vec2 p, float t, float a, float b){
  float n = floor(3. + a * 9.);
  float an = atan(p.y, p.x) + t * .05, r = length(p);
  float seg = TAU / n;
  an = mod(an, seg); an = abs(an - seg * .5);
  vec2 q = vec2(cos(an), sin(an)) * r;
  return smoothstep(.3, .72, fbm(q * (2.5 + b * 5.) + vec2(t * .12, -t * .09)));
}`,
  ondas: `
float P_ondas(vec2 p, float t, float a, float b){
  return .5 + .5 * sin(p.x * (4. + a * 10.) + sin(p.y * 3.2 + t * .9) * (.5 + b * 2.2) + t * 1.4);
}`,
  interferencia: `
float P_interferencia(vec2 p, float t, float a, float b){
  vec2 o = vec2((.2 + b * .5) * sin(t * .5), .2 * cos(t * .4));
  float f = 14. + a * 40.;
  return .5 + .25 * (sin(length(p - o) * f - t * 2.) + sin(length(p + o) * f - t * 2.));
}`,
  plasma: `
float P_plasma(vec2 p, float t, float a, float b){
  vec2 q = p * (2. + a * 5.);
  q = rot2(q, b * length(p) * 3.);
  float v = sin(q.x + t) + sin(q.y * 1.1 + t * 1.3) + sin((q.x + q.y) * .75 + t * .7)
          + sin(length(q + vec2(sin(t * .3), cos(t * .4)) * 2.) - t * 1.2);
  return sat(.5 + .19 * v);
}`,
  lissajous: `
float P_lissajous(vec2 p, float t, float a, float b){
  float fa = floor(1. + a * 5.), fb = floor(2. + b * 5.);
  float d = 1e3, ph = t * .35;
  vec2 prev = vec2(.72 * sin(ph), 0.);
  for (int i = 1; i <= 72; i++){
    float s = float(i) / 72. * TAU;
    vec2 c = vec2(.72 * sin(fa * s + ph), .40 * sin(fb * s));
    d = min(d, sdSeg(p, prev, c)); prev = c;
  }
  return sat(1. - smoothstep(PX * .4, PX * 1.3, d) + .5 * exp(-d * 18.));
}`,
  ecualizador: `
float P_ecualizador(vec2 p, float t, float a, float b){
  float n = floor(10. + a * 44.);
  float x = (p.x + .95) / 1.9 * n;
  float id = floor(x), f = fract(x);
  float h = .08 + .82 * pow(gnoise(vec2(id * .43, t * 1.7)), 1.6) * (.75 + .25 * sin(t * 3. + id));
  float y = p.y + .5;
  float gap = .1 + b * .35;
  float col = step(gap, f) * step(f, 1. - gap * .5);
  float bar = step(y, h) * col * step(.28, fract(y * 22.));
  float peak = step(abs(y - h - .025), .012) * col;
  return sat(bar * (.45 + .55 * y / max(h, .01)) + peak);
}`,
  horizonte: `
float P_horizonte(vec2 p, float t, float a, float b){
  float L = 8. + floor(a * 16.);
  float v = 0.;
  float w = PX * .5;
  float env = exp(-p.x * p.x * (5. + b * 16.));
  for (int k = 39; k >= 0; k--){
    float fk = float(k);
    if (fk >= L) continue;
    float yk = -.40 + fk / L * .78;
    float n = gnoise(vec2(p.x * 7. + fk * 3.17, t * .3 + fk * .71));
    float n2 = gnoise(vec2(p.x * 17. + fk * 1.3, fk));
    float c = yk + env * (.02 + .48 * pow(n, 3.) + .02 * n2);
    if (p.y < c - w) v = 0.;
    if (abs(p.y - c) < w) v = 1.;
  }
  return v;
}`,
  radar: `
float P_radar(vec2 p, float t, float a, float b){
  float r = length(p), an = atan(p.y, p.x);
  float sw = fract((t * 1.4 - an) / TAU);
  float trail = pow(1. - sw, 1.5 + a * 10.);
  float k = 3. + b * 6.;
  float rd = abs(fract(r * k + .5) - .5) / k;
  float rings = 1. - smoothstep(0., PX * 1.2, rd);
  float axes = 1. - smoothstep(0., PX, min(abs(p.x), abs(p.y)));
  vec2 g = p * 9.; vec2 bid = floor(g);
  float blip = step(.93, hash12(bid)) * smoothstep(.2, 0., length(fract(g) - .5))
             * pow(1. - fract((t * 1.4 - atan(bid.y + .5, bid.x + .5)) / TAU), 2.);
  return sat((trail * .85 + rings * .3 + axes * .2 + blip) * step(r, .47));
}`,
  tunel: `
float P_tunel(vec2 p, float t, float a, float b){
  float r = max(length(p), .001), an = atan(p.y, p.x) / TAU;
  float z = .35 / r + t * (.4 + b * 1.2);
  float v = .5 + .5 * sin(an * TAU * floor(3. + a * 9.)) * sin(z * TAU);
  return v * smoothstep(0., .45, r);
}`,
  espiral: `
float P_espiral(vec2 p, float t, float a, float b){
  float an = atan(p.y, p.x);
  return .5 + .5 * sin(an * floor(1. + a * 6.) + length(p) * (6. + b * 24.) - t * 2.5);
}`,
  estrellas: `
float P_estrellas(vec2 p, float t, float a, float b){
  float v = 0.;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    vec2 g = p * (10. + fk * 9. + a * 14.) + vec2(t * (.05 + fk * .04), 0.);
    vec2 i = floor(g);
    float h = hash12(i + fk * 31.);
    vec2 f = fract(g) - .5 - (hash22(i + 3.1) - .5) * .6;
    float tw = .55 + .45 * sin(t * (2. + h * 4.) + h * 60.);
    v += smoothstep(.22 + b * .2, 0., length(f)) * step(.82 - b * .1, h) * tw;
  }
  return sat(v);
}`,
  hiper: `
float P_hiper(vec2 p, float t, float a, float b){
  float an = atan(p.y, p.x), r = length(p);
  float n = floor(60. + a * 120.);
  float x = (an / TAU + .5) * n;
  float id = floor(x), fa = fract(x);
  float h = hash11(id);
  float z = fract(h * 7.31 + t * (.18 + h * .5) * (.5 + b * 1.6));
  float rr = z * z * 1.3;
  float len = .015 + z * z * .35;
  float thin = smoothstep(.5, .15, abs(fa - .5));
  float s = step(rr - len, r) * step(r, rr) * thin * (.3 + .7 * z);
  return sat(s * 1.8 + exp(-r * r * 60.) * .3);
}`,
  galaxia: `
float P_galaxia(vec2 p, float t, float a, float b){
  float r = length(p) + .001, an = atan(p.y, p.x);
  float arms = 2. + floor(a * 3.);
  float ph = an * arms + log(r) * (3. + b * 6.) * arms * .5 - t * .35;
  float v = pow(.5 + .5 * cos(ph), 3.) * exp(-r * 2.4) * 1.6;
  v *= .55 + .45 * fbm(p * 7. + vec2(t * .03, 0.));
  v += exp(-r * r * 55.) * 1.1;
  float st = step(.985, hash12(floor(p * 70.))) * .8;
  return sat(v + st * (.4 + .6 * exp(-r * 2.)));
}`,
  rejilla: `
float P_rejilla(vec2 p, float t, float a, float b){
  float hz = .02 + (a - .5) * .3;
  float v = 0.;
  if (p.y < hz){
    float dy = hz - p.y;
    float z = .35 / dy;
    vec2 g = vec2(p.x * z, z + t * (.6 + b * 2.4));
    float wx = PX * z * 1.1, wy = PX * .35 / (dy * dy) * 1.1;
    vec2 d = abs(fract(g) - .5);
    float lx = 1. - smoothstep(0., wx, .5 - d.x);
    float ly = 1. - smoothstep(0., wy, .5 - d.y);
    float fade = exp(-z * .08);
    v = wy > .45 ? .45 * fade : max(lx, ly) * fade;
  } else {
    vec2 c = vec2(0., hz + .2);
    float sun = step(length(p - c), .19);
    float k = sat((c.y - p.y) / .19);
    float slit = step(k * .55, fract((p.y - hz) * 26.));
    v = sun * mix(1., slit, step(p.y, c.y));
    v = max(v, step(.992, hash12(floor(p * 80.))) * .6);
  }
  return v;
}`,
  dona: `
float sdTorus(vec3 p, vec2 tt){ vec2 q = vec2(length(p.xz) - tt.x, p.y); return length(q) - tt.y; }
float P_dona(vec2 p, float t, float a, float b){
  mat3 R = rotXY(t * .8, t * (.35 + b * .6));
  vec3 ro = vec3(0., 0., -2.8), rd = normalize(vec3(p, 1.55));
  vec2 tt = vec2(.72, .18 + a * .28);
  float d = 0.; bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 64; i++){
    pos = R * (ro + rd * d);
    float s = sdTorus(pos, tt);
    if (s < .002){ hit = true; break; }
    d += s; if (d > 6.) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(.002, 0.);
  vec3 n = normalize(vec3(sdTorus(pos + e.xyy, tt) - sdTorus(pos - e.xyy, tt),
                          sdTorus(pos + e.yxy, tt) - sdTorus(pos - e.yxy, tt),
                          sdTorus(pos + e.yyx, tt) - sdTorus(pos - e.yyx, tt)));
  vec3 L = normalize(R * vec3(-.4, .7, -.6));
  vec3 V = normalize(R * -rd);
  float dif = max(dot(n, L), 0.);
  float spec = pow(max(dot(reflect(-L, n), V), 0.), 24.);
  return sat(.08 + .82 * dif + .35 * spec);
}`,
  esfera: `
float P_esfera(vec2 p, float t, float a, float b){
  float R = .38; float r2 = dot(p, p);
  if (r2 > R * R) return exp(-(sqrt(r2) - R) * 18.) * .12;
  vec3 n = vec3(p, sqrt(R * R - r2)) / R;
  vec3 m = rotXY(.35, t * .4) * n;
  float tex = mix(fbm3(m * 2.6 + 3.), .5 + .5 * sin(m.y * 22.), b);
  tex = mix(.5, tex, .4 + a * .6);
  float dif = max(dot(n, normalize(vec3(-.5, .55, .7))), 0.);
  float rim = pow(1. - n.z, 3.) * .3;
  return sat(.06 + dif * (.35 + .75 * tex) + rim);
}`,
  cubo: `
float sdRBox(vec3 p, vec3 bb, float r){ vec3 q = abs(p) - bb + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float P_cubo(vec2 p, float t, float a, float b){
  mat3 R = rotXY(t * .55, t * .7);
  vec3 ro = vec3(0., 0., -3.), rd = normalize(vec3(p, 1.6));
  float rr = .02 + a * .2;
  float d = 0.; bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 56; i++){
    pos = R * (ro + rd * d);
    float s = sdRBox(pos, vec3(.55), rr);
    if (s < .002){ hit = true; break; }
    d += s; if (d > 7.) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(.002, 0.);
  vec3 n = normalize(vec3(sdRBox(pos + e.xyy, vec3(.55), rr) - sdRBox(pos - e.xyy, vec3(.55), rr),
                          sdRBox(pos + e.yxy, vec3(.55), rr) - sdRBox(pos - e.yxy, vec3(.55), rr),
                          sdRBox(pos + e.yyx, vec3(.55), rr) - sdRBox(pos - e.yyx, vec3(.55), rr)));
  float dif = max(dot(n, normalize(R * vec3(-.5, .7, -.5))), 0.);
  vec3 q = abs(pos);
  float mid = q.x + q.y + q.z - max(q.x, max(q.y, q.z)) - min(q.x, min(q.y, q.z));
  float edge = smoothstep(.43, .53, mid);
  return sat(mix(.1 + .85 * dif, max(edge, .08 + .2 * dif), b));
}`,
  julia: `
float P_julia(vec2 p, float t, float a, float b){
  vec2 z = p * (2.6 - a * 1.8);
  vec2 c = vec2(-.745 + .06 * cos(t * .21), .186 + .06 * sin(t * .17));
  c = mix(c, .7885 * vec2(cos(t * .12 + 2.), sin(t * .12 + 2.)), b);
  float i = 0.;
  for (int n = 0; n < 72; n++){
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    if (dot(z, z) > 64.) break;
    i += 1.;
  }
  if (i >= 71.) return 0.;
  float sm = i + 1. - log2(log2(dot(z, z)));
  return sat(pow(sm / 40., .6));
}`,
  rosa: `
float P_rosa(vec2 p, float t, float a, float b){
  float k = floor(2. + a * 7.);
  float an = atan(p.y, p.x), r = length(p);
  float R = .42 * abs(cos(k * an + t * .6));
  float w = PX * (1.2 + b * 4.);
  float line = 1. - smoothstep(w * .4, w, abs(r - R));
  float fill = step(r, R) * (.25 + .2 * sin(r * 40. - t * 3.));
  return sat(line + fill * b);
}`,
  degradado: `
float P_degradado(vec2 p, float t, float a, float b){
  vec2 dir = vec2(cos(a * TAU), sin(a * TAU));
  return sat(.5 + dot(p, dir) * .55 + b * .12 * sin(dot(p, vec2(-dir.y, dir.x)) * 6. + t));
}`,
  forma: `
float P_forma(vec2 p, float t, float a, float b){
  float n = floor(3. + a * 6.);
  vec2 q = rot2(p, t * .25);
  float an = atan(q.y, q.x), r = length(q);
  float seg = TAU / n;
  float d = cos(floor(.5 + an / seg) * seg - an) * r;
  float R = .3 * (1. + .05 * sin(t * 2.));
  float fill = 1. - smoothstep(R - PX, R + PX, d);
  float ring = 1. - smoothstep(PX * .5, PX * 1.5, abs(d - R));
  float echo = (.5 + .5 * sin((d - R) * 50. - t * 4.)) * exp(-max(d - R, 0.) * 5.) * step(R, d);
  return sat(mix(fill, max(ring, echo * .6), b));
}`,
  estrella: `
float P_estrella(vec2 p, float t, float a, float b){
  float n = floor(4. + a * 6.);
  vec2 q = rot2(p, -t * .3);
  float an = atan(q.y, q.x), r = length(q);
  float R = .34 * (1. + .06 * sin(t * 2.5));
  float rs = R * (.45 + .55 * pow(abs(cos(an * n * .5)), 3.));
  float d = r - rs;
  float fill = 1. - smoothstep(-PX, PX, d);
  float ring = 1. - smoothstep(PX * .5, PX * 1.6, abs(d));
  return sat(mix(fill, ring + .25 * fill, b));
}`,
  latido: `
float sdHeart(vec2 p){
  p.x = abs(p.x);
  if (p.y + p.x > 1.) return length(p - vec2(.25, .75)) - .35355339;
  vec2 q = p - vec2(0., 1.); vec2 w = p - .5 * max(p.x + p.y, 0.);
  return sqrt(min(dot(q, q), dot(w, w))) * sign(p.x - p.y);
}
float P_latido(vec2 p, float t, float a, float b){
  float beat = pow(.5 + .5 * sin(t * 4.2), 6.) * .12 + pow(.5 + .5 * sin(t * 4.2 - .6), 8.) * .06;
  float s = (.55 + a * .5) * (1. + beat);
  float d = sdHeart(p / s + vec2(0., .5)) * s;
  float fill = 1. - smoothstep(-PX, PX, d);
  float ring = 1. - smoothstep(PX * .5, PX * 1.6, abs(d));
  float echo = (.5 + .5 * sin(d * 60. - t * 5.)) * exp(-max(d, 0.) * 6.) * step(0., d);
  return sat(mix(fill, max(ring, echo * .5), b));
}`,
  lluvia: `
float P_lluvia(vec2 p, float t, float a, float b){
  float c = floor(p.x * (14. + a * 30.));
  float sp = (.35 + hash11(c) * 1.1) * (.5 + b * 1.5);
  float y = p.y * .9 + t * sp + hash11(c + 7.) * 13.;
  return pow(1. - fract(y), 5.) * step(.12, hash11(c + 3.1));
}`,
  glitch: `
float P_glitch(vec2 p, float t, float a, float b){
  float tt = floor(t * (3. + b * 14.));
  float rows = 6. + a * 30.;
  float row = floor((p.y + .5) * rows);
  float r = hash12(vec2(row, tt));
  float shift = r > .62 ? (hash12(vec2(row + 3., tt)) - .5) * .8 : 0.;
  vec2 q = p + vec2(shift, 0.);
  float base = smoothstep(.35, .65, fbm(q * vec2(1.4, 5.) + vec2(0., tt * .21)));
  float blocks = step(.88, hash12(floor(q * vec2(5., 12.)) + tt * .17));
  return sat(base + blocks * .9 - step(.95, r) * .7);
}`,
  ruido: `
float P_ruido(vec2 p, float t, float a, float b){
  float f = floor(t * (6. + b * 24.));
  float v = hash12(floor(p / PX) + f * vec2(17.3, 31.7));
  float roll = .5 + .5 * sin(p.y * 3. - t * 2.);
  return pow(v, .6 + a * 2.5) * (.7 + .3 * roll);
}`,
};

export type PatternLibrary = Record<string, string>;

export function pickPatterns(ids: Iterable<string>): PatternLibrary {
  const out: PatternLibrary = {};
  for (const id of ids) if (PATTERN_GLSL[id]) out[id] = PATTERN_GLSL[id];
  return out;
}
