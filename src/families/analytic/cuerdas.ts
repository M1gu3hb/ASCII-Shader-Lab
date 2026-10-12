/**
 * «Cuerdas vibrantes» (I-03, «Mejora de catenaria»): instead of chains hanging still, strings held at both ends
 * that vibrate. A string plucked at a fraction p of its length takes the triangle shape whose sine series is
 * Σ aₙ sin(nπs) with aₙ = 2 sin(nπp) / (n²π² p(1 − p)); here the first one to four modes, each oscillating as
 * cos(ωₙτ) (ωₙ = n·ω₁·√(1 + B n²): «Rigidez» stretches the higher ones) and dying away as e^(−γₙτ), faster for
 * the higher modes (the envelope). Each string is plucked once per cycle (in sequence, all at once or alternating);
 * over the last moments of the cycle the finger draws it back into the pluck's shape, so the release is not a
 * jump. A long exposure («Estela») adds the blur a vibrating string sweeps between its extremes, brighter at the
 * turning points (a sine spends its time there). A puff of rosin dust leaves the pluck point, drifts and falls.
 * «Afinación» shortens the higher strings and raises their pitch (a harp's outline).
 * Time: every string depends only on its time since its own pluck, τ = mod(t − tᵢ, «Ciclo»): an exact loop.
 * k0 = (strings, modes, pluck point, amplitude), k1 = (cycle s, frequency Hz, decay, pattern),
 * K2 = (exposure, dust, width, stiffness), K3 = (length, spread, tuning, −). Written from the wave equation.
 */
export const CUERDAS_GLSL = /* glsl */ `
float F_cuerdas(vec2 p, float t, vec4 k0, vec4 k1){
  float N = floor(k0.x + .5), M = floor(k0.y + .5), pk = k0.z, A = k0.w;
  float P = k1.x, f1 = k1.y, dec = k1.z, pat = floor(k1.w + .5);
  float ex = K2.x, rosin = K2.y, wd = K2.z, B = K2.w * .03;
  float L0 = K3.x, Wsp = K3.y, tune = K3.z;
  float w = PX * (.05 + .75 * wd), yb = -L0 * .5, v = 0.;
  float last = max(N - 1., 1.);
  float pd = min(.35, P * .08);
  float reach = A * 1.4 + (rosin > 0. ? .3 : PX * 3.);
  for (int i = 0; i < 12; i++){
    float fi = float(i);
    if (fi >= N) break;
    float xi = N < 1.5 ? 0. : Wsp * (fi / last - .5);
    float L = L0 * (1. - tune * .45 * fi / last);
    float dx0 = p.x - xi;
    if (abs(dx0) > reach) continue;
    float ti = pat < .5 ? P * fi / N : pat < 1.5 ? P * .02 * fi : (mod(fi, 2.) < .5 ? 0. : P * .5);
    float tau = mod(t - ti, P);
    float s = (p.y - yb) / L;
    float fs = f1 * (1. + tune * 1.2 * fi / last);
    float gam = .12 + 1.2 * dec;
    float u = 0., du = 0., env = 0., S = 0., dS = 0.;
    for (int n = 1; n <= 4; n++){
      float fn = float(n);
      if (fn > M) break;
      float an = 2. * sin(fn * PI * pk) / (fn * fn * PI * PI * pk * (1. - pk));
      float sn = sin(fn * PI * s), cn = cos(fn * PI * s);
      float g = exp(-gam * (1. + .7 * (fn - 1.)) * tau);
      float c = cos(TAU * fs * fn * sqrt(1. + B * fn * fn) * tau) * g;
      u += an * sn * c; du += an * fn * PI * cn * c;
      env += abs(an * sn) * g;
      S += an * sn; dS += an * fn * PI * cn;
    }
    // the finger draws the string back into the pluck's shape before releasing it
    float pull = smoothstep(P - pd, P, tau);
    u = A * mix(u, S, pull); du = A / L * mix(du, dS, pull); env = A * mix(env, abs(S), pull);
    float inside = step(0., s) * step(s, 1.);
    float dx = dx0 - u;
    float d = abs(dx) / sqrt(1. + du * du);
    float energy = max(exp(-gam * tau), pull);
    v = max(v, (1. - smoothstep(w, w + PX * .9, d)) * inside * (.6 + .4 * energy));
    // long exposure: the band the string sweeps, brighter at its turning points
    if (env > PX * .8){
      float r = dx0 / env;
      v = max(v, ex * .42 * inside * (1. - smoothstep(.9, 1.05, abs(r))) * (.3 + .7 * r * r) * min(env / (PX * 4.), 1.));
    }
    // pegs at both ends
    float pg = min(length(vec2(dx0, p.y - yb)), length(vec2(dx0, p.y - yb - L)));
    v = max(v, .9 * (1. - smoothstep(PX * .8, PX * 1.8, pg)));
    // rosin dust: a puff from the pluck point that drifts, falls and fades
    if (rosin > 0.) for (int j = 0; j < 8; j++){
      float fj = float(j);
      vec2 h = hash22(vec2(fi * 7.1 + fj, fj * 3.3 + 1.7));
      float an = TAU * h.x, sp = .05 + .14 * h.y;
      vec2 o = vec2(xi + A * .8, yb + pk * L) + vec2(cos(an), sin(an)) * sp * (1. - exp(-1.6 * tau)) / 1.6
        - vec2(0., .025 * tau * tau) + .012 * vec2(sin(tau * 2. + fj), cos(tau * 1.7 + fj * 2.));
      float fade = exp(-tau / (.6 + .7 * h.x)) * smoothstep(0., .04, tau);
      v = max(v, rosin * fade * (1. - smoothstep(PX * .35, PX * 1.3, length(p - o))));
    }
  }
  // the frame: a bridge below the strings and the neck above them
  float x0 = N < 1.5 ? -.04 : -Wsp * .5 - .03, x1 = N < 1.5 ? .04 : Wsp * .5 + .03;
  float fr = min(sdSeg(p, vec2(x0, yb), vec2(x1, yb)), sdSeg(p, vec2(x0, yb + L0), vec2(x1, yb + L0 * (1. - tune * .45))));
  v = max(v, .42 * (1. - smoothstep(PX * .4, PX * 1.4, fr)));
  return sat(v);
}
`;
