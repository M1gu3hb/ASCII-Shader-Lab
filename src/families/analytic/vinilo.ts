/**
 * «Disco de vinilo» (I-18, inventario PR #10): a record turning on a turntable, seen from above or tilted.
 *  - V grooves: the radius folded into a triangle wave (the two walls of each groove), wobbling with the music
 *    — a displacement along the radius that follows the disc's own angle, so it turns with it, louder in some
 *    passages than others — and broken by the smooth gaps between tracks;
 *  - the light's reflection on the grooves: the walls are radial, so they send the light back only along a
 *    cross of wedges perpendicular to it (a strong pair and a weaker one); the grooves act as a diffraction
 *    grating, so inside the wedges the colour runs through the spectrum with the angle and the radius; the
 *    gaps between tracks shine more, like a mirror; the light can turn around the disc;
 *  - a label that turns with the disc (rings of marks like printed text), the spindle hole, the platter;
 *  - a tone arm on its pivot, whose stylus tracks inwards over the cycle and lifts back to the edge.
 * The disc turns a whole number of times per cycle and the arm's sweep takes the whole cycle: an exact loop.
 * Written from the physics of the record and of diffraction gratings, not from any shader's code.
 *
 * k0 = (speed, size, tilt, grooves), k1 = (signal, tracks, shine, iridescence),
 * K2 = (light, light turns, arm, label hue), K3 = (cycle s).
 */
export const VINILO_GLSL = /* glsl */ `
vec3 vin_spec(float h){ return clamp(abs(fract(h + vec3(0., 2. / 3., 1. / 3.)) * 6. - 3.) - 1., 0., 1.); }
vec4 FC_vinilo(vec2 p, float t, vec4 k0, vec4 k1){
  float sp = floor(k0.x + .5);
  float rate = sp < .5 ? 8. : sp < 1.5 ? 33.333 : sp < 2.5 ? 45. : 78.;
  float P = max(K3.x, 4.), u = t / P;
  float rev = max(floor(rate / 60. * P + .5), 1.);
  float rot = TAU * u * rev;
  float Rd = mix(.3, .46, k0.y), ct = cos(k0.z * 1.05);
  float ng = mix(12., 60., k0.w), sig = k1.x, ntr = clamp(floor(k1.y + .5), 1., 8.);
  float shine = k1.z, iris = k1.w, La = K2.x * TAU + TAU * floor(K2.y + .5) * u;
  float armOn = K2.z, lab = floor(K2.w + .5);
  // the disc's plane: centred a little to the left (room for the arm), tilted away from the viewer
  vec2 c = vec2(-.1 * Rd / .46, 0.);
  vec2 q = p - c;
  q.y /= ct;
  float r = length(q), ph = atan(q.y, q.x);
  // the angle in the disc's own frame (it turns with it)
  float th = mod(ph - rot, TAU);
  float v = 0.;
  vec3 col = vec3(.6, .62, .68);
  float rl = .3 * Rd, rg0 = .34 * Rd, rg1 = .97 * Rd;
  if (r < Rd){
    if (r > rl){
      // grooves: a triangle wave across the radius, wobbling with the music (it turns with the disc)
      float s = (r - rg0) / (rg1 - rg0);
      float loud = smoothstep(.25, .75, gnoise(vec2(s * 9., 3.7)));
      float wob = sig * (.25 + .75 * loud) * .35 * sin(th * 7. + s * 40.) * sin(th * 3. - s * 17.);
      float gp = (r - rg0) * ng / Rd + wob;
      float tri = abs(fract(gp) - .5) * 2.;
      // the smooth gaps between tracks
      float tk = s * ntr;
      float gd = abs(tk - floor(tk + .5)) / ntr * (rg1 - rg0);
      float gap = (s > 0. && s < 1.) ? (1. - smoothstep(.5 * PX, 1.3 * PX, gd)) * step(.5, tk) * step(tk, ntr - .5) : 0.;
      float rim = s >= 1. ? 1. : 0.;
      // the reflection: a cross of wedges perpendicular to the light, coloured by the grating
      float da = ph - La;
      float wedge = pow(abs(cos(da)), 26.) + .45 * pow(abs(sin(da)), 40.);
      float refl = shine * wedge * (.35 + .65 * mix(tri, 1., gap)) * (1. + .8 * gap);
      float base = .1 + .16 * tri * (1. - gap) + .05 * loud * (1. - gap) + .25 * rim;
      v = base + refl;
      // the grating's colour: symmetric on both sides of each wedge (the two orders of diffraction)
      vec3 grat = vin_spec(fract(abs(sin(da)) * 2.2 + s * 1.3 + .1));
      vec3 rc = mix(vec3(1.), grat, iris);
      col = mix(vec3(.55, .57, .63), rc, clamp(refl / max(v, 1e-3), 0., 1.));
    } else {
      // the label: a bright paper with rings of dark marks like printed text, turning with the disc; the spindle hole
      float lr = r / rl;
      float mark = 0.;
      for (int i = 0; i < 2; i++){
        float fi = float(i);
        float rr = .55 + .22 * fi;
        float n = 26. + 10. * fi;
        float cell = floor(th / TAU * n);
        float on = step(.35, hash12(vec2(cell, fi + 4.))) * step(abs(lr - rr), .045) * step(.15, fract(th / TAU * n));
        mark = max(mark, on);
      }
      float hole = smoothstep(.06, .1, lr);
      vec3 lc = lab < .5 ? vec3(.85, .12, .1) : lab < 1.5 ? vec3(.95, .78, .15) : lab < 2.5 ? vec3(.15, .3, .85) : lab < 3.5 ? vec3(.15, .6, .3) : vec3(.92, .9, .85);
      v = (.85 - .45 * mark) * hole * (.6 + .6 * dot(lc, vec3(.299, .587, .114)));
      col = mix(lc, vec3(.15), .5 * mark);
      v *= 1. - .6 * step(abs(lr - .93), .02);
    }
  } else if (r < Rd * 1.07){
    // the platter's rim around the record
    v = .16 + .12 * pow(abs(cos(ph - La)), 8.);
    col = vec3(.75, .76, .8);
  }
  // the tone arm: pivot, arm and headshell; the stylus tracks inwards over the cycle and lifts back
  if (armOn > 0.){
    vec2 pv = Rd * vec2(1., .62);
    float La2 = 1.1 * Rd, D = length(pv);
    float fu = fract(u);
    float pr = fu < .9 ? fu / .9 : 1. - (fu - .9) / .1;
    // the arm's angle that puts the stylus at radius rho (law of cosines in the pivot–spindle–stylus triangle)
    float rho = mix(.94, .36, pr) * Rd;
    float aa = atan(-pv.y, -pv.x) + acos(clamp((D * D + La2 * La2 - rho * rho) / (2. * D * La2), -1., 1.));
    vec2 e = pv + La2 * vec2(cos(aa), sin(aa));
    vec2 hd = e + .07 * vec2(cos(aa + .55), sin(aa + .55));
    float w = PX * .45;
    float da = min(sdSeg(q, pv, e), sdSeg(q, e, hd) - .3 * PX);
    da = min(da, sdSeg(q, pv, pv - .09 * vec2(cos(aa), sin(aa))) - .8 * PX);
    da = min(da, abs(length(q - pv) - .045));
    float arm = armOn * (1. - smoothstep(w, w + PX, da));
    float sh = armOn * .55 * (1. - smoothstep(w, w + 2.5 * PX, sdSeg(q, pv + vec2(.012, -.015), e + vec2(.012, -.015))));
    v = mix(v * (1. - .6 * sh), .85, arm);
    col = mix(col, vec3(.85, .88, .93), arm);
  }
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(v * (.7 + .3 * Y), 0., 1.));
}
`;
