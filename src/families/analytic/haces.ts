/**
 * «Haces de luz» (I-05 y I-21, inventario PR #10): beams of light from emitters that sweep inside a fog, in
 * two regimes of the same mechanism.
 *  - «Laberinto láser»: thin beams enter from points on the edges of the frame (a beam's width grows only a
 *    little with distance), each sweeping on its own slow sine; the fog is an fBm that drifts, and a beam is
 *    seen only as much as there is fog where it passes (volumetric light: the light scattered towards us is
 *    proportional to the density). Each beam has its own hue and the hues rotate in time; where two beams
 *    cross, their overlap flares white (the product of their intensities: zero unless both are there).
 *  - «Foco de terciopelo»: two or three wide cones hang above the top edge and sweep slowly; inside them,
 *    volumetric rays (streaks along the cone) and a haze; behind, a velvet curtain in the dark.
 * In both, dust motes drift on a slow grid (one mote per small square, wandering inside it) and are drawn only
 * where a beam lights them: outside the beams the same motes are invisible.
 *
 * Colour per cell: the light's own colour (the sum of the beams that reach the cell, the white of the
 * crossings, the dust lit by them, the haze); the glyph follows the light's intensity and its perceived
 * brightness. Written from the published descriptions of the effects, not from any shader's code.
 *
 * k0 = (mode, beams, width, sweep), k1 = (sweep speed, fog, fog drift, hue),
 * K2 = (hue rotation, crossing flashes, dust, rays), K3 = (haze, saturation).
 */
export const HACES_GLSL = /* glsl */ `
vec3 haz_hue(float h){ return .5 + .5 * cos(TAU * (h - vec3(0., .333, .667))); }
// a point of the frame's outline, just outside a 16:9 canvas, at a fraction s of its perimeter
vec2 haz_rim(float s){
  float A = .95, B = .54, u = s * (4. * A + 4. * B);
  if (u < 2. * A) return vec2(-A + u, B);
  if (u < 2. * A + 2. * B) return vec2(A, B - (u - 2. * A));
  if (u < 4. * A + 2. * B) return vec2(A - (u - 2. * A - 2. * B), -B);
  return vec2(-A, -B + (u - 4. * A - 2. * B));
}
vec4 FC_haces_luz(vec2 p, float t, vec4 k0, vec4 k1){
  bool F = k0.x > .5;
  float n = clamp(floor(k0.y + .5), 2., 6.);
  float wd = k0.z, sw = k0.w, sp = k1.x, fog = k1.y, dr = k1.z, hue = k1.w;
  float hr = K2.x, fla = K2.y, dust = K2.z, ray = K2.w, haze = K3.x, sat = K3.y;
  // the fog: an fBm that drifts; a beam shows as much as the fog it crosses
  float fd = fbm(p * 2.2 + (.15 + dr) * t * vec2(.07, .035));
  float dens = mix(1., 1.6 * smoothstep(.33, .62, fd), fog);
  float S = 0., S2 = 0.;
  vec3 acc = vec3(0.);
  vec2 E[6], Dd[6];
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= n) break;
    float h1 = hash11(fi * 3.7 + 1.1), h2 = hash11(fi * 5.3 + 2.9);
    vec2 e; float a0;
    if (F){
      e = vec2((-.5 + (fi + .5) / n) * 1.5 + (h1 - .5) * .12, .62);
      a0 = -PI * .5 + (h2 - .5) * .5 - e.x * .25;
    } else {
      e = haz_rim(fract(fi / n + .11 + .08 * h1));
      a0 = atan(-e.y, -e.x) + (h2 - .5) * .9;
    }
    float om = .05 + sp * (.35 + .5 * h2);
    float a = a0 + sw * (F ? .55 : 1.) * sin(t * om + h1 * TAU);
    vec2 dir = vec2(cos(a), sin(a));
    E[i] = e; Dd[i] = dir;
    vec2 d = p - e;
    float al = dot(d, dir), pe = d.y * dir.x - d.x * dir.y;
    if (al <= 0.) continue;
    float w = F ? .02 + mix(.08, .34, wd) * al : .003 + mix(.004, .07, wd) * al;
    float x = pe / w;
    float I = F ? (1. - smoothstep(.55, 1., abs(x))) * (.55 + .45 * exp(-x * x * 2.)) * exp(-al * .35) : exp(-x * x * 1.5) / (1. + al * .5);
    // volumetric rays: streaks that run along the beam and drift down it
    I *= mix(1., .35 + 1.3 * gnoise(vec2(x * 3.5 + fi * 7.3, al * 1.2 - t * .25)), ray);
    float core = F ? 0. : exp(-pe * pe / (PX * PX * .25)) / (1. + al * .5);
    vec3 c = mix(vec3(1.), haz_hue(hue + (F ? .04 : .5 / n) * fi + hr * .05 * t), sat);
    float b = I * dens + core * .6;
    acc += b * c;
    S += b; S2 += b * b;
  }
  // where two beams cross, their overlap flares white, and where two lasers meet a star sparkles
  float fl = clamp((S * S - S2) * 1.1, 0., 1.);
  if (!F){
    for (int i = 0; i < 6; i++){
      if (float(i) >= n) break;
      for (int j = 0; j < 6; j++){
        if (j <= i) continue;
        if (float(j) >= n) break;
        float det = Dd[i].x * Dd[j].y - Dd[i].y * Dd[j].x;
        if (abs(det) < .05) continue;
        vec2 b = E[j] - E[i];
        float si = (b.x * Dd[j].y - b.y * Dd[j].x) / det, sj = (b.x * Dd[i].y - b.y * Dd[i].x) / det;
        if (si <= 0. || sj <= 0.) continue;
        vec2 q = p - (E[i] + si * Dd[i]);
        float r = length(q);
        float tw = .7 + .3 * sin(t * 6. + float(i) * 1.7 + float(j) * 2.3);
        fl += (.7 * exp(-r * r / .0009) + .6 * exp(-r * 9.) * (exp(-abs(q.y) / (.35 * PX)) + exp(-abs(q.x) / (.35 * PX)))) * tw * mix(1., dens, fog) / (1. + .25 * (si + sj));
      }
    }
  }
  fl = fla * min(fl, 1.);
  // dust motes on a slow grid, each wandering inside its square: seen only where a beam lights it
  float g = .045;
  vec2 gp = p + (.3 + dr) * t * vec2(.006, .012);
  vec2 gc = floor(gp / g);
  vec2 gh = hash22(gc + 7.);
  vec2 mp = (gc + .5 + .3 * vec2(sin(t * (.3 + .5 * gh.x) + gh.y * TAU), sin(t * (.25 + .4 * gh.y) + gh.x * TAU))) * g;
  vec2 dm = gp - mp;
  float mote = step(.3, gh.x) * exp(-dot(dm, dm) / (PX * PX * .2)) * (.65 + .35 * sin(t * 2. + gh.y * 30.));
  float dv = dust * mote * clamp(S * 1.4, 0., 1.);
  // the room: the fog itself (laser) or a velvet curtain (foco), faint
  float tex = F ? (.55 + .45 * sin(p.x * 34. + 2.5 * gnoise(p * vec2(2., .6)))) * (.6 + .4 * fd) : fd;
  float hv = haze * .3 * tex;
  vec3 hc = F ? vec3(.55, .06, .14) : mix(vec3(.3, .25, .6), haz_hue(hue + .5 + hr * .05 * t), .6);
  float lum = S + fl + dv + hv;
  vec3 lc = S > 1e-4 ? acc / S : vec3(1.);
  vec3 col = (acc + fl * vec3(1.) + dv * (.5 + .5 * lc) + hv * hc) / max(lum, 1e-4);
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(lum * (.7 + .3 * Y), 0., 1.));
}
`;
