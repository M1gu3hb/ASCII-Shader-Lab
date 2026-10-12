/**
 * «Osciloscopio que se degrada» (C-06): a time trace y(x) drawn as on a phosphor screen, going through a
 * cycle: calm, swell, scream, collapse. The clean signal is a sum of harmonics Σ aₙ sin(2π n f x + φₙ(t))
 * whose phases drift (so the trace keeps running) and whose weights change from one cycle to the next during
 * the collapse, when the trace is flat. The envelope E(u) and the degradation D(u) follow the cycle and are
 * the same at both of its ends. D feeds a chain whose mix also changes per cycle: phase modulation (FM), soft
 * clipping y/(1 + |y| + 0.28 y²) then hard clipping, bit reduction round(y·2ᵇ)/2ᵇ with b = 8 − 7D plus a
 * sample-and-hold in x, and added noise. The cell's brightness comes from its distance to the polyline
 * through three samples of the trace (so steps and steep edges draw as lines), plus fading copies a moment
 * earlier (phosphor persistence) and an optional graticule. Written from the published description of the
 * effect, not from any shader's code.
 * Parameters: k0 = (harmonics, degradation, cycle s, noise), k1 = (graticule, persistence, gain, frequency).
 */
export const OSCILOSCOPIO_GLSL = /* glsl */ `
// (hash inputs are whole numbers: float32 and float64 agree on them exactly)
float osc_a(float n, float c){ return n < 1.5 ? 1. : (.35 + .65 * hash11(c * 7. + n * 13. + 1.)) / n; }
// the trace's height at x (screen units) at time t
float osc_y(float x, float t, vec4 k0, vec4 k1){
  float H = clamp(floor(k0.x + .5), 1., 6.), cyc = k0.z, f = k1.w;
  float u = fract(t / cyc), c = floor(t / cyc);
  float E = .55 + .6 * smoothstep(.35, .62, u) * (1. - smoothstep(.78, .86, u)) - .5 * smoothstep(.8, .87, u) * (1. - smoothstep(.9, .99, u));
  float D = k0.y * smoothstep(.35, .72, u) * (1. - smoothstep(.86, .98, u));
  // this cycle's mix of the chain: FM, clipping, bit reduction, noise
  float wf = .3 + .7 * hash11(c * 11. + 2.), wc = .3 + .7 * hash11(c * 17. + 3.), wq = .3 + .7 * hash11(c * 23. + 4.), wn = .3 + .7 * hash11(c * 29. + 5.);
  float dq = D * wq;
  float xs = x;
  if (dq > .05){ float dl = mix(.004, .07, dq); xs = (floor(x / dl) + .5) * dl; }
  float pm = 2.5 * D * wf * sin(TAU * f * (1.5 + 2. * hash11(c * 31. + 6.)) * xs + t * 3.1);
  float mw = smoothstep(.86, .98, u);
  float y = 0., sa = 0.;
  for (int i = 0; i < 6; i++){
    float n = float(i) + 1.;
    if (n > H) break;
    float a = mix(osc_a(n, c), osc_a(n, c + 1.), mw);
    y += a * sin(TAU * n * f * xs + t * (.7 + .23 * n) + n * 1.7 + n * pm);
    sa += a;
  }
  y = E * k1.z * y / sa;
  float dc = D * wc;
  y = mix(y, 1.6 * y / (1. + abs(y) + .28 * y * y), dc);
  float L = mix(1.4, .45, dc);
  y = clamp(y, -L, L);
  float Q = exp2(8. - 7. * dq) * .5;
  y = mix(y, floor(y * Q + .5) / Q, smoothstep(.05, .2, dq));
  float dn = D * wn + k0.w * .12;
  y += dn * .5 * (.6 * (gnoise(vec2(xs * 55., t * 7.)) - .5) + .4 * (hash11(floor(xs * 140.) + mod(floor(t * 24.), 997.) * 7.) - .5));
  return y * .3;
}
// brightness of the trace at p: distance to the polyline through three samples, dimmer where it is steep
float osc_trace(vec2 p, float t, vec4 k0, vec4 k1){
  float h = PX * .72;
  float ya = osc_y(p.x - h, t, k0, k1), yb = osc_y(p.x, t, k0, k1), yc = osc_y(p.x + h, t, k0, k1);
  vec2 A = vec2(p.x - h, ya), B = vec2(p.x, yb), C = vec2(p.x + h, yc);
  float d = min(sdSeg(p, A, B), sdSeg(p, B, C));
  float sl = abs(yc - ya) / (2. * h);
  return (1. / (1. + d * d / 7.2e-5) + .16 * exp(-d / .02)) * (.55 + .45 / (1. + sl * .15));
}
float F_osciloscopio(vec2 p, float t, vec4 k0, vec4 k1){
  float gr = floor(k1.x + .5), per = k1.y;
  float v = osc_trace(p, t, k0, k1);
  // phosphor: copies of the trace a moment earlier, fading
  float w = .6 * per;
  for (int j = 1; j < 4; j++){
    if (per <= 0.) break;
    v += w * osc_trace(p, t - float(j) * (.035 + .05 * per), k0, k1);
    w *= .55 * per + .1;
  }
  if (gr > .5){
    // graticule: eight divisions high, faint lines with dotted minor ticks; the axes carry ticks
    float dv = .125, mn = dv / 5.;
    float gx = abs(fract(p.x / dv + .5) - .5) * dv, gy = abs(fract(p.y / dv + .5) - .5) * dv;
    float tx = abs(fract(p.x / mn + .5) - .5) * mn, ty = abs(fract(p.y / mn + .5) - .5) * mn;
    float on = PX * .55;
    float g = 0.;
    if (gr < 1.5){
      g = .1 * step(min(gx, gy), on);
      g = max(g, .3 * step(gx, on) * step(ty, on));
      g = max(g, .3 * step(gy, on) * step(tx, on));
    }
    float ax = step(abs(p.x), on), ay = step(abs(p.y), on);
    g = max(g, .18 * max(ax, ay));
    g = max(g, .42 * max(ay * step(tx, on), ax * step(ty, on)));
    v += g;
  }
  return clamp(v, 0., 1.);
}
`;
