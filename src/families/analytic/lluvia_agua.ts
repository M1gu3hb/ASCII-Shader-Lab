/**
 * «Lluvia digital sobre agua» (I-15): columns of characters fall and, when a head reaches the water line at the
 * bottom, the impact starts a damped ripple that runs along the line both ways.
 *
 *  - Rain: column c (a whole number of cells wide) releases a stream every P_c seconds (with phase φ_c; a stream is there with
 *    probability «Columnas encendidas»). Stream j reaches the water at T_j = (j + φ_c)·P_c and falls at v_c, so its
 *    head is at y = y_w + v_c·(T_j − t). A cell at height y lies above the heads that already passed it: the most
 *    recent one has index floor((t + (y − y_w)/v_c)/P_c − φ_c), and the cell is its trail at distance d above
 *    the head (brightness e^(−d/L)), the head itself a bright cell. Each trail cell shows another character now
 *    and then (its brightness jumps by a hash of the row and the moment).
 *  - Water: every impact is a deterministic event (T_j, x_c). Its ripple at distance |x − x_c| and age a is
 *    η = −A·e^(−a/τ − 3|x − x_c|)·sin(k·(c·a − |x − x_c|)) behind the front c·a, so it is born at the impact
 *    and spreads both ways at speed c while it dies out. The surface is the sum of the last three impacts of
 *    the columns around (a window fades the farthest), drawn as a line that rises and falls; below it the rain
 *    is mirrored about the moving line and bent by its slope, and the impacts throw a few droplets up.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (column width in cells, density, fall speed, trail), k1 = (water level, waves, damping, ripple speed),
 * K2 = (reflection, flicker, splash, wavelength).
 */
export const LLUVIA_AGUA_GLSL = /* glsl */ `
// a column's streams: period between them (s), phase, fall speed
vec3 la_cfg(float ci, float sp){
  return vec3(1. + 2.6 * hash12(vec2(ci, 3.1)), hash12(vec2(ci, 7.7)), sp * (.6 + .8 * hash12(vec2(ci, 1.3))));
}
// whether stream j of column ci is there
float la_on(float ci, float j, float dens){ return step(hash12(vec2(ci + .5, j)), dens); }
// how lit the rain is at p: the trails of the streams whose heads already passed below p, and their heads
float la_rain(vec2 p, float t, float colW, float co, float sp, float dens, float trail, float yw, float flick){
  float ci = floor(p.x / colW + co);
  vec3 c = la_cfg(ci, sp);
  float tau = t + (p.y - yw) / c.z;
  float j0 = floor(tau / c.x - c.y);
  float row = floor(p.y / PX + .125);
  float rate = 1.5 + 9. * flick;
  float fl = hash12(vec2(row + 157. * ci, floor(t * rate + hash12(vec2(ci, row)))));
  float b = 0.;
  for (int m = 0; m < 3; m++){
    float j = j0 - float(m);
    if (la_on(ci, j, dens) < .5) continue;
    float d = max(c.z * (tau - (j + c.y) * c.x), 0.);
    float L = trail * (.5 + hash12(vec2(ci + .25, j)));
    if (d > 4. * L + PX) continue;
    float v = d < PX ? 1. : (.16 + .66 * exp(-d / L)) * (1. - .5 * flick * fl);
    b = max(b, v);
  }
  return b;
}
// the water's height and slope at x: the ripples of the last three impacts of the columns around
vec2 la_wave(float x, float t, float colW, float co, float sp, float dens, float amp, float tau, float cv, float kw){
  float ci = floor(x / colW + co);
  float R = min(.45, 24.5 * colW);
  vec2 hg = vec2(0.);
  for (int n = -24; n <= 24; n++){
    float cj = ci + float(n);
    float dx = x - (cj + .5 - co) * colW, ax = abs(dx);
    float wn = smoothstep(R, .6 * R, ax);
    if (wn <= 0.) continue;
    vec3 c = la_cfg(cj, sp);
    float j0 = floor(t / c.x - c.y);
    for (int m = 0; m < 3; m++){
      float j = j0 - float(m);
      if (la_on(cj, j, dens) < .5) continue;
      float a = t - (j + c.y) * c.x;
      float s = cv * a - ax;
      if (s <= 0.) continue;
      float A = amp * (.6 + .8 * hash12(vec2(cj + .25, j))) * wn * exp(-a / tau - 2. * ax - s * kw / 9.) * smoothstep(0., .012, s);
      hg += A * vec2(-sin(kw * s), kw * cos(kw * s) * sign(dx));
    }
  }
  return hg;
}
// droplets thrown up by the last impact of this column and its neighbours
float la_splash(vec2 p, float t, float colW, float co, float sp, float dens, float yw){
  float ci = floor(p.x / colW + co);
  float s = 0.;
  for (int n = -1; n <= 1; n++){
    float cj = ci + float(n);
    vec3 c = la_cfg(cj, sp);
    float j = floor(t / c.x - c.y);
    if (la_on(cj, j, dens) < .5) continue;
    float a = t - (j + c.y) * c.x;
    if (a > .7) continue;
    for (int q = 0; q < 4; q++){
      float fq = float(q);
      float vx = (hash12(vec2(cj + .125, j + 64. * fq)) - .5) * .5;
      float vy = .22 + .3 * hash12(vec2(cj + .375, j + 64. * fq));
      vec2 d = vec2((cj + .5 - co) * colW + vx * a, yw + vy * a - 1.4 * a * a);
      if (d.y < yw) continue;
      s = max(s, (1. - smoothstep(.45 * PX, 1.05 * PX, length(p - d))) * (1. - a / .7));
    }
  }
  return s;
}
float F_lluvia_agua(vec2 p, float t, vec4 k0, vec4 k1){
  // a column is a whole number of cells wide (cells are 1.4 times taller than wide by default); its edges are
  // offset by a quarter of a cell so that no cell centre ever sits on one
  float colW = k0.x * PX / 1.4, co = .25 / k0.x, dens = k0.y, sp = k0.z, trail = k0.w;
  float yw = -.5 + k1.x;
  float amp = .035 * k1.y, tau = .35 + 1.6 * (1. - k1.z), cv = .1 + .5 * k1.w;
  float kw = TAU / (.06 + .24 * K2.w);
  vec2 hg = vec2(0.);
  if (p.y < yw + .14) hg = la_wave(p.x, t, colW, co, sp, dens, amp, tau, cv, kw);
  float ys = yw + hg.x;
  float v;
  if (p.y > ys){
    v = la_rain(p, t, colW, co, sp, dens, trail, yw, K2.y);
    v = max(v, K2.z * la_splash(p, t, colW, co, sp, dens, yw));
  } else {
    // under the line: the rain mirrored about the moving surface and bent by its slope, over dark water
    float dep = ys - p.y;
    vec2 m = vec2(p.x + hg.y * dep * 3., ys + dep);
    v = .03 + .06 * exp(-dep * 5.);
    v += K2.x * .85 * exp(-dep * 1.8) * la_rain(m, t, colW, co, sp, dens, trail, yw, K2.y);
    // the ripples' faces catch the light just under the line
    v += .2 * clamp(abs(hg.y) * 3., 0., 1.) * exp(-dep / PX);
  }
  // the line of the water
  float ln = 1. - smoothstep(.3 * PX, .85 * PX, abs(p.y - ys));
  v = max(v, ln * (.55 + .45 * clamp(abs(hg.y) * 5., 0., 1.)));
  return clamp(v, 0., 1.);
}
`;
