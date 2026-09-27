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
  /*
   * More 3D objects. Same camera as the solids above (eye at z = -3 looking at the origin; the object turns,
   * the light stays put). Each one marches only inside its bounding volume, with a bounded number of steps,
   * and names its helpers with its own prefix (several chunks can share one shader).
   */
  nudo: `
vec2 nu_pq(float b){
  float k = floor(b * 5.999);
  return k < 1. ? vec2(2., 3.) : k < 2. ? vec2(3., 2.) : k < 3. ? vec2(2., 5.) : k < 4. ? vec2(3., 4.) : k < 5. ? vec2(5., 2.) : vec2(3., 5.);
}
// distance to a (P, Q) torus knot: in the cross-section plane of the torus the knot crosses P times; the tube
// leans through that plane, so the offset along its lean is shortened by the cosine of the lean
float nu_sd(vec3 p, vec2 pq, float th){
  float an = atan(p.z, p.x);
  vec2 cp = vec2(length(p.xz) - .46, p.y);
  float d = 1e3;
  for (int k = 0; k < 5; k++){
    if (float(k) >= pq.x) break;
    float s = (an + TAU * float(k)) / pq.x;
    vec2 c = vec2(cos(pq.y * s), sin(pq.y * s));
    vec2 v = cp - .22 * c;
    float sp = pq.x * (.46 + .22 * c.x), sq = pq.y * .22;
    float dn = dot(v, c), dt = dot(v, vec2(-c.y, c.x)) * sp / sqrt(sp * sp + sq * sq);
    d = min(d, sqrt(dn * dn + dt * dt));
  }
  return d - th;
}
float P_nudo(vec2 p, float t, float a, float b){
  mat3 R = rotXY(.7 + .25 * sin(t * .21), t * .32);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.6));
  vec2 pq = nu_pq(b);
  float th = .06 + a * .07;
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .81;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 80; i++){
    pos = ro + rd * d;
    float s = nu_sd(pos, pq, th);
    if (s < .002){ hit = true; break; }
    d += s * .85; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 k = vec2(1., -1.);
  vec3 n = normalize(k.xyy * nu_sd(pos + k.xyy * .002, pq, th) + k.yyx * nu_sd(pos + k.yyx * .002, pq, th)
                   + k.yxy * nu_sd(pos + k.yxy * .002, pq, th) + k.xxx * nu_sd(pos + k.xxx * .002, pq, th));
  // candy stripes wound around the tube, flowing along it
  float an = atan(pos.z, pos.x);
  vec2 cp = vec2(length(pos.xz) - .46, pos.y);
  float best = 1e3, ss = 0., psi = 0.;
  for (int j = 0; j < 5; j++){
    if (float(j) >= pq.x) break;
    float s = (an + TAU * float(j)) / pq.x;
    vec2 dv = cp - .22 * vec2(cos(pq.y * s), sin(pq.y * s));
    float dl = length(dv);
    if (dl < best){ best = dl; ss = s; psi = atan(dv.y, dv.x); }
  }
  float stripe = smoothstep(-.35, .35, sin(psi * 2. - ss * pq.y * 3. + t * 2.5));
  vec3 L = normalize(R * vec3(-.5, .65, -.55));
  float dif = max(dot(n, L), 0.), hl = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 28.);
  return sat(.04 + (.5 * dif + .42 * hl) * mix(.4, 1., stripe) + .4 * spec);
}`,
  poliedro: `
const vec3 PO_N[22] = vec3[22](
  vec3(.57735027, .57735027, .57735027), vec3(-.57735027, .57735027, .57735027), vec3(.57735027, -.57735027, .57735027), vec3(.57735027, .57735027, -.57735027),
  vec3(0., .35682209, .93417236), vec3(0., -.35682209, .93417236), vec3(.93417236, 0., .35682209), vec3(-.93417236, 0., .35682209), vec3(.35682209, .93417236, 0.), vec3(-.35682209, .93417236, 0.),
  vec3(0., .85065081, .52573111), vec3(0., -.85065081, .52573111), vec3(.52573111, 0., .85065081), vec3(-.52573111, 0., .85065081), vec3(.85065081, .52573111, 0.), vec3(-.85065081, .52573111, 0.),
  vec3(.70710678, .70710678, 0.), vec3(.70710678, -.70710678, 0.), vec3(.70710678, 0., .70710678), vec3(.70710678, 0., -.70710678), vec3(0., .70710678, .70710678), vec3(0., .70710678, -.70710678)
);
vec3 PO_n;
// kind 0 octahedron, 1 rhombic dodecahedron, 2 dodecahedron, 3 icosahedron, 4 truncated icosahedron (a football)
vec2 po_sd(vec3 p, float kind){
  int i0 = kind < 1. ? 0 : kind < 2. ? 16 : kind < 3. ? 10 : 0;
  int i1 = kind < 1. ? 4 : kind < 2. ? 22 : kind < 3. ? 16 : kind < 4. ? 10 : 16;
  float r = kind < 1. ? .44 : kind < 2. ? .53 : kind < 4. ? .6 : .68;
  float m1 = -1e3, m2 = -1e3;
  for (int i = 0; i < 22; i++){
    if (i < i0) continue;
    if (i >= i1) break;
    float dp = dot(p, PO_N[i]);
    float v = abs(dp) - (kind > 3.5 && i >= 10 ? r * 1.0266 : r);
    if (v > m1){ m2 = m1; m1 = v; PO_n = PO_N[i] * sign(dp); } else if (v > m2) m2 = v;
  }
  return vec2(m1, m1 - m2);
}
float P_poliedro(vec2 p, float t, float a, float b){
  mat3 R = rotXY(t * .31 + .5, t * .47);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.6));
  float kind = floor(a * 4.999);
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .64;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  vec2 s = vec2(1.);
  bool hit = false;
  for (int i = 0; i < 48; i++){
    s = po_sd(ro + rd * d, kind);
    if (s.x < .001){ hit = true; break; }
    d += s.x; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec3 n = PO_n;
  vec3 L = normalize(R * vec3(-.45, .7, -.55));
  float dif = max(dot(n, L), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 20.);
  // flat faces, each with its own tone, so neighbours stay apart even under the same light
  float face = .08 + .62 * dif + .22 * hash13(floor(n * 7. + 7.5)) + .18 * max(dot(n, -rd), 0.) + .3 * spec;
  float edge = 1. - smoothstep(PX * .3, PX * 1.1, s.y);
  return sat(mix(face * (1. - .6 * edge), max(edge * (.55 + .45 * dif), .05 + .12 * dif), b));
}`,
  giroide: `
// a gyroid network (the solid side of the surface) carved out of a ball
float gy_sd(vec3 p, float k, float c, float ph){
  vec3 q = p * k;
  q.z += ph;
  float g = (dot(sin(q), cos(q.yzx)) - c) / k * .55;
  return max(g, length(p) - .66);
}
float P_giroide(vec2 p, float t, float a, float b){
  mat3 R = rotXY(t * .17 + .4, t * .23);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.6));
  float k = 5. + a * 7., c = -.7 + b * 1.4, ph = t * .5;
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .4356;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.); float it = 0.;
  for (int i = 0; i < 72; i++){
    pos = ro + rd * d;
    float s = gy_sd(pos, k, c, ph);
    if (s < .0015){ hit = true; break; }
    d += s; it += 1.; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(1., -1.);
  vec3 n = normalize(e.xyy * gy_sd(pos + e.xyy * .0015, k, c, ph) + e.yyx * gy_sd(pos + e.yyx * .0015, k, c, ph)
                   + e.yxy * gy_sd(pos + e.yxy * .0015, k, c, ph) + e.xxx * gy_sd(pos + e.xxx * .0015, k, c, ph));
  vec3 L = normalize(R * vec3(-.4, .75, -.5));
  float dif = max(dot(n, L), 0.), hl = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 16.);
  // tunnels: the deeper inside the ball (and the more steps it took to get there), the darker
  float depth = smoothstep(.2, .66, length(pos));
  return sat((.05 + .55 * dif + .4 * hl + .25 * spec) * mix(.2, 1., depth) * (1. - .4 * it / 72.));
}`,
  moebius: `
float mo_sd(vec3 p, float w, float tw){
  float an = atan(p.z, p.x);
  vec2 q = rot2(vec2(length(p.xz) - .5, p.y), an * tw * .5);
  vec2 d = abs(q) - vec2(w, .045);
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
float P_moebius(vec2 p, float t, float a, float b){
  mat3 R = rotXY(.8 + .2 * sin(t * .23), t * .3);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.6));
  float w = .12 + a * .2, tw = 1. + 2. * floor(b * 2.999);
  float rb = .55 + w;
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + rb * rb;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 90; i++){
    pos = ro + rd * d;
    float s = mo_sd(pos, w, tw);
    if (s < .0015){ hit = true; break; }
    d += s * .6; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(1., -1.);
  vec3 n = normalize(e.xyy * mo_sd(pos + e.xyy * .0015, w, tw) + e.yyx * mo_sd(pos + e.yyx * .0015, w, tw)
                   + e.yxy * mo_sd(pos + e.yxy * .0015, w, tw) + e.xxx * mo_sd(pos + e.xxx * .0015, w, tw));
  if (dot(n, rd) > 0.) n = -n;
  // along the band: a dark centre line and bars that travel round its one side
  float an = atan(pos.z, pos.x);
  vec2 q = rot2(vec2(length(pos.xz) - .5, pos.y), an * tw * .5);
  float u = q.x / w;
  float line = 1. - smoothstep(.1, .22, abs(u));
  float bars = smoothstep(.35, .5, abs(fract(an * 12. / TAU - t * .6) - .5)) * step(.4, abs(u));
  vec3 L = normalize(R * vec3(-.5, .7, -.5));
  float dif = max(dot(n, L), 0.), hl = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 24.);
  return sat(.06 + (.55 * dif + .4 * hl) * (1. - .55 * max(line, bars)) + .35 * spec);
}`,
  adn: `
float DN_m;
float dn_sd(vec3 p, float k, float kk, float sp, float ph){
  // two strands on a helix of radius .3 around y, the second 2.3 rad behind (a major and a minor groove)
  float a1 = p.y * k + ph, a2 = a1 + 2.3;
  vec2 c1 = vec2(cos(a1), sin(a1)), c2 = vec2(cos(a2), sin(a2));
  vec2 v1 = p.xz - .3 * c1, v2 = p.xz - .3 * c2;
  // a strand leans along its tangent: shorten the tangential offset so the distance stays honest
  float s1 = length(vec2(dot(v1, c1), dot(v1, vec2(-c1.y, c1.x)) * kk)) - .065;
  float s2 = length(vec2(dot(v2, c2), dot(v2, vec2(-c2.y, c2.x)) * kk)) - .065;
  float yi = (floor(p.y / sp) + .5) * sp;
  float b1 = yi * k + ph, b2 = b1 + 2.3;
  vec3 A = vec3(.3 * cos(b1), yi, .3 * sin(b1)), B = vec3(.3 * cos(b2), yi, .3 * sin(b2));
  vec3 pa = p - A, ba = B - A;
  float hh = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  float rg = length(pa - ba * hh) - .03;
  float s = min(s1, s2);
  DN_m = rg < s ? (hh < .5 ? 1. : 2.) : 0.;
  return min(s, rg);
}
float P_adn(vec2 p, float t, float a, float b){
  mat3 R = rotXY(.35, 0.);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(rot2(p, .5), 1.6));
  float k = 3.5 + a * 5., kk = 1. / sqrt(1. + .09 * k * k), sp = .2 - b * .12, ph = t * 1.1;
  // bounding cylinder around the axis
  vec2 o = ro.xz, v = rd.xz;
  float A2 = dot(v, v), B2 = dot(o, v), h = B2 * B2 - A2 * (dot(o, o) - .1521);
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = (-B2 - h) / A2, dmax = (-B2 + h) / A2;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 80; i++){
    pos = ro + rd * d;
    float s = dn_sd(pos, k, kk, sp, ph);
    if (s < .002){ hit = true; break; }
    d += s * .8; if (d > dmax) break;
  }
  if (!hit) return 0.;
  float m = DN_m;
  vec2 e = vec2(1., -1.);
  vec3 n = normalize(e.xyy * dn_sd(pos + e.xyy * .002, k, kk, sp, ph) + e.yyx * dn_sd(pos + e.yyx * .002, k, kk, sp, ph)
                   + e.yxy * dn_sd(pos + e.yxy * .002, k, kk, sp, ph) + e.xxx * dn_sd(pos + e.xxx * .002, k, kk, sp, ph));
  vec3 L = normalize(R * vec3(-.5, .6, -.6));
  float dif = max(dot(n, L), 0.), hl = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 30.);
  // strands bright and glossy; each rung in two halves (a base pair)
  float tone = m < .5 ? 1. : m < 1.5 ? .75 : .45;
  return sat(.04 + (.55 * dif + .42 * hl) * tone + .4 * spec * step(m, .5));
}`,
  planeta: `
float pl_ring(float rr, float an, float a, float t){
  float r0 = .56, r1 = .66 + a * .36;
  float x = (rr - r0) / (r1 - r0);
  float band = smoothstep(0., .04, x) * smoothstep(1., .94, x);
  float dens = .35 + .65 * vnoise(vec2(x * 36., 3.7));
  dens *= 1. - .9 * exp(-(x - .62) * (x - .62) * 480.);
  dens *= .82 + .18 * vnoise(vec2(an * 5. - t * .15, x * 6.));
  return band * dens;
}
float P_planeta(vec2 p, float t, float a, float b){
  mat3 R = rotXY(.12 + b * .75 + .04 * sin(t * .17), -.5 + t * .03);
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.7));
  vec3 L = normalize(R * vec3(-.75, .35, -.45));
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .1521;
  float ts = h > 0. ? -bb - sqrt(h) : 1e3;
  float col = 0.;
  if (ts < 1e3){
    vec3 ps = ro + rd * ts, n = ps / .39;
    // cloud bands swirled by noise; the planet turns under them
    float lon = atan(n.z, n.x) + t * .12;
    float tex = .5 + .5 * sin(n.y * 15. + 2.6 * fbm(vec2(lon * 1.3, n.y * 4.)));
    float dif = max(dot(n, L), 0.);
    float sr = -ps.y / L.y;
    if (sr > 0.){ vec3 q = ps + L * sr; dif *= 1. - .75 * pl_ring(length(q.xz), atan(q.z, q.x), a, t); }
    col = .03 + dif * (.45 + .55 * tex) + .2 * pow(1. - max(dot(n, -rd), 0.), 2.) * dif;
  } else {
    col = .12 * exp(-(length(ro - rd * bb) - .39) * 22.);
  }
  float tr = -ro.y / rd.y;
  if (tr > 0. && tr < ts){
    vec3 q = ro + rd * tr;
    float den = pl_ring(length(q.xz), atan(q.z, q.x), a, t);
    if (den > 0.){
      // the planet's shadow falls across the rings
      float b2 = dot(q, L), h2 = b2 * b2 - dot(q, q) + .1521;
      float lit = h2 > 0. && -b2 - sqrt(h2) > 0. ? .15 : 1.;
      col = mix(col, (.35 + .6 * den) * lit, min(den * 1.3, .95));
    }
  }
  return sat(col);
}`,
  voxeles: `
float vx_h(vec2 c, float lv, float b){
  vec2 q = c * (.05 + b * .12);
  float v = vnoise(q) * .7 + vnoise(q * 2.7 + 5.3) * .3;
  return floor(v * v * lv * 1.6) + step(.985, hash12(c)) * (2. + floor(hash12(c + 7.) * 3.));
}
float P_voxeles(vec2 p, float t, float a, float b){
  float lv = 2. + floor(a * 7.);
  vec3 ro = vec3(t * .35, lv + 1.5, t * 1.4);
  vec3 rd = normalize(vec3(p, 1.1));
  // look down (.45 rad), and sway a little from side to side
  rd = vec3(rd.x, rd.y * .9004471 - rd.z * .4349655, rd.y * .4349655 + rd.z * .9004471);
  float yw = .3 * sin(t * .11), cy = cos(yw), sy = sin(yw);
  rd = vec3(rd.x * cy + rd.z * sy, rd.y, rd.z * cy - rd.x * sy);
  vec2 cell = floor(ro.xz), sg = sign(rd.xz), dl = abs(1. / rd.xz);
  vec2 tm = (sg * (cell - ro.xz) + sg * .5 + .5) * dl;
  float tc = 0., face = 0., hh = -1.;
  for (int i = 0; i < 72; i++){
    float hc = vx_h(cell, lv, b);
    float tn = min(tm.x, tm.y);
    if (ro.y + rd.y * tc < hc){ hh = hc; break; }
    if (ro.y + rd.y * tn < hc){ tc = (hc - ro.y) / rd.y; face = 0.; hh = hc; break; }
    if (tm.x < tm.y){ tc = tm.x; tm.x += dl.x; cell.x += sg.x; face = 1.; }
    else { tc = tm.y; tm.y += dl.y; cell.y += sg.y; face = 2.; }
    if (tc > 60.) break;
  }
  if (hh < 0.) return .05 * exp(-max(rd.y, 0.) * 10.);
  // three tones like a drawing: tops bright, one side mid, the other dark; outlines fade with distance
  vec3 hp = ro + rd * tc;
  float fade = exp(-tc * .07);
  float lum;
  if (face < .5){
    vec2 f = fract(hp.xz);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    lum = .95 - .45 * fade * (1. - smoothstep(.05, .12, e));
  } else {
    lum = face < 1.5 ? (sg.x > 0. ? .62 : .4) : .28;
  }
  lum *= .6 + .4 * sat(hh / (lv * 1.2));
  return sat(lum * exp(-tc * .018));
}`,
  metabolas: `
float mb_sd(vec3 p, vec3 C[5], float r, float k){
  float d = 1e3;
  for (int i = 0; i < 5; i++){
    float s = length(p - C[i]) - r * (.8 + .25 * sin(float(i) * 1.7));
    float hh = max(k - abs(d - s), 0.) / k;
    d = min(d, s) - hh * hh * k * .25;
  }
  return d;
}
float P_metabolas(vec2 p, float t, float a, float b){
  vec3 C[5];
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    C[i] = vec3(.42 * sin(t * (.41 + fi * .11) + fi * 2.1), .24 * cos(t * (.37 + fi * .09) + fi * 1.3), .28 * sin(t * (.29 + fi * .07) + fi * .7));
  }
  float r = .2 + a * .14, k = .12 + b * .36;
  vec3 ro = vec3(0., 0., -3.), rd = normalize(vec3(p, 1.6));
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + 1.;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 64; i++){
    pos = ro + rd * d;
    float s = mb_sd(pos, C, r, k);
    if (s < .002){ hit = true; break; }
    d += s; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(1., -1.);
  vec3 n = normalize(e.xyy * mb_sd(pos + e.xyy * .002, C, r, k) + e.yyx * mb_sd(pos + e.yyx * .002, C, r, k)
                   + e.yxy * mb_sd(pos + e.yxy * .002, C, r, k) + e.xxx * mb_sd(pos + e.xxx * .002, C, r, k));
  // liquid metal: it mirrors a studio (bright ceiling, dark floor, a light band on the horizon, a softbox)
  vec3 rf = reflect(rd, n);
  float env = mix(.3, .55 + .35 * rf.y, smoothstep(-.2, .2, rf.y)) + .55 * exp(-abs(rf.y + .05) * 12.) + .35 * exp(-abs(rf.y - .5) * 18.);
  float box = smoothstep(.72, .9, dot(rf, vec3(-.49, .64, -.59)));
  float fres = .5 + .5 * pow(1. - max(dot(n, -rd), 0.), 3.);
  float dif = max(dot(n, vec3(-.49, .64, -.59)), 0.);
  return sat(.06 + .35 * dif + .7 * env * fres + .55 * box);
}`,
  engranajes: `
float ge_gear(vec3 p, vec2 c, float R, float N, float ang, float S){
  vec2 q = p.xy - c;
  float r = length(q), an = atan(q.y, q.x) - ang;
  float hg = 2.3 * R / N;
  float tooth = clamp(cos(an * N) * 2.2, -1., 1.) * .5 + .5;
  float d = (r - (R - hg * .5 + hg * tooth)) * .7;
  d = max(d, .05 - r);
  // round windows between the spokes
  float sec = TAU / S;
  float ar = mod(an, sec) - sec * .5;
  float win = length(r * vec2(cos(ar), sin(ar)) - vec2(R * .55, 0.)) - R * (.13 + .48 / S);
  d = max(d, -win);
  vec2 w = vec2(d, abs(p.z) - .09);
  return min(max(w.x, w.y), 0.) + length(max(w, 0.));
}
float P_engranajes(vec2 p, float t, float a, float b){
  float NA = 10. + floor(a * 10.), NB = max(6., floor(NA * .55));
  float RA = .55, RB = RA * NB / NA, S = 3. + floor(b * 3.999);
  float D = RA + RB, sh = (RA - RB) * .5;
  vec2 cA = vec2(-D * .5 + sh, 0.), cB = vec2(D * .5 + sh, 0.);
  // meshed: B turns the other way, NA/NB times as fast, with a gap facing each tooth of A
  float angA = t * .4, angB = -angA * NA / NB + PI - PI / NB;
  mat3 R = rotXY(.38 + .08 * sin(t * .2), -.25 + .1 * sin(t * .13));
  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.6));
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + 1.;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 80; i++){
    pos = ro + rd * d;
    float s = min(ge_gear(pos, cA, RA, NA, angA, S), ge_gear(pos, cB, RB, NB, angB, S));
    if (s < .0015){ hit = true; break; }
    d += s * .8; if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(1., -1.);
  vec3 n = normalize(e.xyy * min(ge_gear(pos + e.xyy * .0015, cA, RA, NA, angA, S), ge_gear(pos + e.xyy * .0015, cB, RB, NB, angB, S))
                   + e.yyx * min(ge_gear(pos + e.yyx * .0015, cA, RA, NA, angA, S), ge_gear(pos + e.yyx * .0015, cB, RB, NB, angB, S))
                   + e.yxy * min(ge_gear(pos + e.yxy * .0015, cA, RA, NA, angA, S), ge_gear(pos + e.yxy * .0015, cB, RB, NB, angB, S))
                   + e.xxx * min(ge_gear(pos + e.xxx * .0015, cA, RA, NA, angA, S), ge_gear(pos + e.xxx * .0015, cB, RB, NB, angB, S)));
  // the faces catch the light, the flanks of the teeth and the windows stay dark; faint turning marks
  float onA = step(ge_gear(pos, cA, RA, NA, angA, S), ge_gear(pos, cB, RB, NB, angB, S));
  float rr = length(pos.xy - mix(cB, cA, onA));
  float front = smoothstep(.6, .9, abs(n.z));
  float tex = mix(.45, .9 + .1 * sin(rr * 90.), front);
  vec3 L = normalize(R * vec3(-.5, .65, -.6));
  float dif = max(dot(n, L), 0.), hl = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 18.);
  return sat(.04 + (.58 * dif + .5 * hl) * tex + .3 * spec);
}`,
  cristales: `
const vec3 CR_D[9] = vec3[9](vec3(.059964, .998201, .0), vec3(.619408, .751806, .226102), vec3(-.541688, .710914, .448527), vec3(-.25202, .777573, -.576079), vec3(.193155, .471328, .860547), vec3(-.811904, .523366, -.25865), vec3(.550397, .380925, -.74294), vec3(.378189, .913089, -.152452), vec3(.928233, .286715, .237017));
const vec3 CR_U[9] = vec3[9](vec3(.996404, -.059856, -.059964), vec3(.687084, -.379801, -.619408), vec3(.797432, .265852, .541688), vec3(.959701, .124336, -.25202), vec3(.979947, -.048931, -.193155), vec3(.476274, .337602, -.811904), vec3(.826192, -.120291, .550397), vec3(.875893, -.29964, .378189), vec3(.303472, -.215146, -.928233));
const vec3 CR_V[9] = vec3[9](vec3(-.059856, .003596, -.998201), vec3(-.379801, .539017, -.751806), vec3(.265852, .651095, -.710914), vec3(-.124336, -.616377, -.777573), vec3(-.048931, .880599, -.471328), vec3(-.337602, -.782376, -.523366), vec3(.120291, -.916748, -.380925), vec3(.29964, -.276559, -.913089), vec3(-.215146, .933545, -.286715));
const float CR_L[9] = float[9](1.0, .78, .72, .76, .55, .53, .47, .66, .42);
const float CR_R[9] = float[9](.13, .11, .105, .11, .09, .095, .085, .09, .08);
float CR_id;
float cr_sd(vec3 p, float n, float lk){
  vec3 q = p - vec3(0., -.5, 0.);
  // the rock they grow from
  float d = (length(q * vec3(1., 1.6, 1.)) - .22) * .62;
  CR_id = -1.;
  for (int i = 0; i < 9; i++){
    if (float(i) >= n) break;
    // each one roots a little off the centre, towards where it leans
    vec3 qi = q - vec3(CR_D[i].x, 0., CR_D[i].z) * .14;
    float y = dot(qi, CR_D[i]);
    vec2 w = abs(vec2(dot(qi, CR_U[i]), dot(qi, CR_V[i])));
    float r = CR_R[i];
    // a hexagonal prism with a six-sided point
    float hx = max(w.x * .866025 + w.y * .5, w.y) - r;
    float tip = (y - CR_L[i] * lk + (hx + r) * 1.4) * .58;
    float c = max(max(hx, tip), -y);
    if (c < d){ d = c; CR_id = float(i); }
  }
  return d;
}
float P_cristales(vec2 p, float t, float a, float b){
  mat3 R = rotXY(-.18 + .05 * sin(t * .21), t * .22);
  vec3 ro = R * vec3(0., 0., -3.) - vec3(0., .05, 0.), rd = R * normalize(vec3(p + vec2(0., .05), 1.9));
  float n = 4. + floor(a * 5.999), lk = .65 + b * .5;
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .9025;
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  bool hit = false; vec3 pos = vec3(0.);
  for (int i = 0; i < 72; i++){
    pos = ro + rd * d + vec3(0., .05, 0.);
    float s = cr_sd(pos, n, lk);
    if (s < .0015){ hit = true; break; }
    d += s * .8; if (d > dmax) break;
  }
  if (!hit) return 0.;
  float id = CR_id;
  vec2 e = vec2(1., -1.);
  vec3 nn = normalize(e.xyy * cr_sd(pos + e.xyy * .0015, n, lk) + e.yyx * cr_sd(pos + e.yyx * .0015, n, lk)
                    + e.yxy * cr_sd(pos + e.yxy * .0015, n, lk) + e.xxx * cr_sd(pos + e.xxx * .0015, n, lk));
  vec3 L = normalize(R * vec3(-.45, .7, -.55));
  float dif = max(dot(nn, L), 0.), hl = max(dot(nn, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, nn), -rd), 0.), 40.);
  float fres = pow(1. - hl, 2.);
  // every crystal its own clarity; the rock stays dull
  float tone = id < 0. ? .4 : .7 + .3 * fract(id * .618);
  return sat(.04 + (.5 * dif + .35 * hl) * tone + .45 * spec + .3 * fres * step(0., id));
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
