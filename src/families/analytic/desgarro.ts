/**
 * «Superficie que se abre» (V-07): a surface that tears open over a light behind it and mends again. Each
 * tear lives in cycles: in each one an impact point and a slant come from the cycle's hash; the tear line is
 * the signed distance to a line through the impact, wobbled by noise along it, and its edge is frayed by an
 * anisotropic fBm (stretched across the line: fibres). The opening spreads from the impact (wider near it),
 * holds and closes; everything a tear draws is zero at both ends of its cycle, so one cycle hands over to the
 * next without a jump. Several tears run out of phase so a background never stands still. Behind: a light of
 * its own (warped fBm nebula, ridged veins, slow sparkles), a line screen or colour currents of the palette.
 * The edge carries a hot rim, light spilling onto the surface, a lit lip on one side and a shadow on the
 * other; the surface's own grain moves apart with the halves. «Quemado» burns holes instead (an fBm front
 * that grows from the impact, with an ember line and charred paper) and heals them back. Written from the
 * published description of the effect, not from any shader's code.
 * Parameters: k0 = (kind, behind, tears, cycle s), k1 = (calm, width, glow, fibres).
 */
export const DESGARRO_GLSL = /* glsl */ `
vec3 desg_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
vec4 FC_desgarro(vec2 p, float t, vec4 k0, vec4 k1){
  float kind = floor(k0.x + .5), beh = floor(k0.y + .5), n = clamp(floor(k0.z + .5), 1., 3.), cyc = k0.w;
  float q = k1.x * .45, W = k1.y, glow = k1.z, fib = k1.w;
  float hole = 0., rim = 0., spill = 0., lip = 0., crack = 0., chr = 0.;
  vec2 shift = vec2(0.);
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    if (fi >= n) break;
    float tau = t / cyc + fi / n;
    float c = floor(tau), u = tau - c;
    float a = clamp((u - q) / (1. - q), 0., 1.);
    // opens fast, holds, closes slowly: zero at both ends of the cycle
    float open = smoothstep(0., .33, a) * (1. - smoothstep(.45, .97, a));
    if (open <= 0. && u < q - .13) continue;
    float seam = smoothstep(max(q - .12, 0.), q + .02, u) * (1. - smoothstep(.45, .97, a));
    // (hash inputs are whole numbers: float32 and float64 agree on them exactly)
    vec2 h = hash22(vec2(c * 7. + fi * 131. + 3., fi * 17. + 5.));
    vec2 h2 = hash22(vec2(c * 13. + fi * 57. + 1., c * 5. + fi * 3. + 29.));
    vec2 cc = vec2((h.x - .5) * 1.1, (h.y - .5) * .5);
    float so = h2.y * 40.;
    if (kind < .5){
      float th = (h2.x - .5) * 2.8;
      vec2 dir = vec2(cos(th), sin(th)), nrm = vec2(-dir.y, dir.x);
      float s = dot(p - cc, dir), dn = dot(p - cc, nrm);
      float off = .05 * (gnoise(vec2(s * 3.2 + so, so)) - .5) + .02 * (gnoise(vec2(s * 9.1 + so, 1.3 + so)) - .5);
      float side = dn - off, ad = abs(side);
      float R = 1.9 * smoothstep(0., .35, a) + .02;
      float hw = W * .09 * open * sqrt(max(0., 1. - s * s / (R * R)));
      // frayed edge: fibres across the line (fine along it, long across it), only near the edge
      float fr = 0.;
      if (ad - hw < .09 && open > 0.) fr = fib * .04 * open * (2. * fbm(vec2(s * 26. + so, dn * 3.)) - 1.) * (1. - smoothstep(.04, .09, ad - hw));
      float ed = ad - hw - fr;
      hole = max(hole, smoothstep(0., PX, -ed) * smoothstep(0., PX * .5, hw));
      rim = max(rim, open * exp(-abs(ed) / .012));
      spill = max(spill, open * exp(-max(ed, 0.) / .06));
      lip += sign(side) * open * exp(-max(ed, 0.) / .025) * smoothstep(0., PX, ed);
      crack = max(crack, seam * exp(-ad / .01) * (1. - smoothstep(R + .1, R + .45, abs(s))));
      shift += nrm * sign(side) * hw * exp(-ad / .45);
    } else {
      // burning: an fBm front grows from the impact and heals back
      float A = .25 + .25 * fib;
      float r = length(p - cc);
      float b = r * 1.6 + A + .02 - open * (.4 + 1.1 * W);
      if (b < 2. * A + .2) b += A * (2. * fbm(p * 2.3 + vec2(so + t * .04, so - t * .03)) - 1.) * (1. - smoothstep(2. * A, 2. * A + .2, b));
      float ed = b * .4;
      hole = max(hole, smoothstep(0., PX, -ed) * step(1e-6, open));
      rim = max(rim, open * exp(-abs(ed) / .012));
      spill = max(spill, open * exp(-max(ed, 0.) / .05));
      chr = max(chr, open * exp(-max(ed, 0.) / .03));
      crack = max(crack, seam * (1. - open) * exp(-r / .03));
    }
  }
  // the surface: its own grain, moved apart with the halves; lit lip and shadow by the edge, charred by fire
  vec2 ps = p - shift;
  float tex = gnoise(ps * vec2(5., 9.) + 3.1) * .55 + gnoise(ps * vec2(42., 7.) + 7.7) * .45;
  // a slow light drifts over the surface: even while every opening rests, the piece keeps moving
  float sl = .55 + .9 * gnoise(p * 1.4 + vec2(t * .12, -t * .08));
  float surf = (.02 + .26 * smoothstep(.55, .85, tex)) * sl + .3 * clamp(lip, -1., 1.) * glow;
  surf *= 1. - .92 * chr;
  vec3 scol = desg_ramp(.08 + .22 * tex) * (1. - .8 * chr);
  float bl = 0.;
  vec3 bcol = vec3(0.);
  if (hole > 0. || spill > .02){
    if (beh < .5){
      // its own light: a warped nebula, ridged veins and slow sparkles
      vec2 wq = p * 1.6 + vec2(t * .03, -t * .02);
      float n1 = fbm(wq + 1.4 * vec2(gnoise(wq * 1.1 + t * .05), gnoise(wq * 1.1 + 4.3 - t * .04)));
      float v = 1. - abs(2. * gnoise(p * 4.5 + n1 * 1.5) - 1.);
      v = v * v; v = v * v;
      vec2 g = floor(p * 26.);
      float hs = hash12(g + 3.);
      float sp = smoothstep(.95, 1., hs) * (.5 + .5 * sin(t * (1.5 + 2. * hs) + hs * 50.));
      bl = .06 + .62 * n1 * n1 + .45 * v + .6 * sp;
      bcol = desg_ramp(.42 + .45 * n1 + .25 * v + .3 * sp);
    } else if (beh < 1.5){
      // a line screen whose lines thicken with a slow field, crossed where it is darkest
      float v = fbm(p * 1.3 + vec2(t * .025, t * .02));
      float l1 = abs(fract(dot(p, vec2(.8, .6)) * 15. + t * .08) - .5) * 2.;
      float l2 = abs(fract(dot(p, vec2(-.6, .8)) * 15. - t * .06) - .5) * 2.;
      float hatch = max(smoothstep(.9 * v + .12, .9 * v - .12, l1), smoothstep(.5 * v + .1, .5 * v - .14, l2) * step(.55, v));
      bl = .22 + .7 * hatch;
      bcol = desg_ramp(.45 + .5 * v);
    } else {
      // colour currents: three spots of the palette's light colours, mixed by inverse distance
      vec3 acc = vec3(0.); float ws = 0.;
      for (int j = 0; j < 3; j++){
        float fj = float(j);
        vec2 cj = vec2(.75 * sin(t * (.11 + .04 * fj) + fj * 2.4), .35 * sin(t * (.09 + .03 * fj) + fj * 1.7 + .5));
        float w = 1. / (pow(length(p - cj), 3.) + 1e-3);
        acc += w * desg_ramp(.5 + .25 * fj); ws += w;
      }
      bcol = acc / ws;
      float g = gnoise(p * 4. + vec2(t * .1, -t * .07));
      bl = .1 + .55 * smoothstep(.3, .75, g) + .45 * dot(bcol, vec3(.299, .587, .114));
    }
  }
  float hot = clamp(rim * glow * 1.1 + crack * .45, 0., 1.);
  float lum = mix(surf, bl, hole) + hot + spill * glow * .35 * (1. - hole);
  vec3 col = mix(scol, bcol, hole);
  col = mix(col, desg_ramp(.92), clamp(hot + spill * glow * .5 * (1. - hole), 0., 1.));
  return vec4(col, clamp(lum, 0., 1.));
}
`;
