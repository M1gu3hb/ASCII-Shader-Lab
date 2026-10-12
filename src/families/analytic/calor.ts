/**
 * «Calor que irradia» (I-12, inventario PR #10): a temperature field that radiates from one to three hot
 * centres. The domain is first bent by the curl of an fBm (its derivatives taken by central differences): the
 * shimmer of hot air, a divergence-free flow that never piles up. Around the main centre, tongues of heat come
 * from an fBm read in polar coordinates (direction and log r − v·t: seamless in angle, flowing outwards), which
 * modulate how far each centre's heat reaches (T ∝ exp(−(d/R)^1.3)); heat rises (the falloff is longer above),
 * flickers, and a warm ambient glow fills the rest. Embers fly out of the centres with buoyancy, leave a short
 * trail and cool as they age. The temperature picks the glyph and the colour through a thermal map: black
 * body, thermal camera or ember.
 * Written from the description of the effect and the physics of black-body colour, not from any shader's code.
 *
 * k0 = (centres, heat, reach, turbulence), k1 = (shimmer, outward flow, flicker, rise),
 * K2 = (embers, ember speed, ember life, map), K3 = (ambient).
 */
export const CALOR_GLSL = /* glsl */ `
vec3 cal_map(float T, float m){
  T = clamp(T, 0., 1.);
  vec3 a, b, c, d, e;
  if (m < .5){ a = vec3(.3, .02, .02); b = vec3(.85, .1, .02); c = vec3(1., .45, .04); d = vec3(1., .82, .32); e = vec3(1., 1., .92); }
  else if (m < 1.5){ a = vec3(.02, .02, .25); b = vec3(.3, .02, .65); c = vec3(.85, .05, .5); d = vec3(1., .45, .02); e = vec3(1., .95, .55); }
  else { a = vec3(.18, .01, .01); b = vec3(.55, .03, .02); c = vec3(.9, .2, .03); d = vec3(1., .5, .08); e = vec3(1., .78, .4); }
  vec3 col = mix(a, b, smoothstep(0., .25, T));
  col = mix(col, c, smoothstep(.25, .5, T));
  col = mix(col, d, smoothstep(.5, .78, T));
  return mix(col, e, smoothstep(.78, 1., T));
}
vec2 cal_src(float i, float n, float t){
  vec2 c = n < 1.5 ? vec2(0.) : n < 2.5 ? vec2(i < .5 ? -.38 : .38, -.02) : (i < .5 ? vec2(-.45, -.12) : i < 1.5 ? vec2(.45, -.12) : vec2(0., .2));
  return c + .03 * vec2(sin(t * .21 + i * 2.1), cos(t * .17 + i * 1.3));
}
vec4 FC_calor_radiante(vec2 p, float t, vec4 k0, vec4 k1){
  float ns = clamp(floor(k0.x + .5), 1., 3.), heat = k0.y, R = mix(.08, .3, k0.z), turb = k0.w;
  float shim = k1.x, flow = k1.y, fli = k1.z, rise = k1.w;
  float ne = clamp(floor(K2.x + .5), 0., 32.), es = K2.y, life = K2.z, map = floor(K2.w + .5), amb = K3.x;
  // the shimmer: the curl of an fBm, by central differences
  float e = .02;
  vec2 b = p * 2.2 + vec2(0., -t * .25 * (.3 + flow));
  float n0 = fbm(b + vec2(e, 0.)), n1 = fbm(b - vec2(e, 0.)), n2 = fbm(b + vec2(0., e)), n3 = fbm(b - vec2(0., e));
  vec2 q = p + shim * .03 * vec2(n2 - n3, n1 - n0) / (2. * e);
  // tongues of heat around the main centre: an fBm in (direction, log r − v·t)
  vec2 c0 = cal_src(0., ns, t);
  vec2 d0 = q - c0;
  float r0 = length(d0);
  float tg = fbm3(vec3(d0 / max(r0, 1e-4) * 2.4, log(r0 + .02) * 1.8 - t * (.2 + 1.3 * flow)));
  float reach = R * max(1. + turb * 3. * (tg - .45), .25);
  float T = 0.;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    if (fi >= ns) break;
    vec2 d = q - cal_src(fi, ns, t);
    // heat rises: a longer reach above the centre
    d.y *= d.y > 0. ? 1. - .55 * rise : 1. + .25 * rise;
    float fl = 1. + fli * .35 * (gnoise(vec2(t * 3.1, fi * 7.7)) - .5);
    T += exp(-pow(length(d) / max(reach, .02), 1.3)) * fl;
  }
  T = heat * T + amb * .22 * (.55 + .9 * fbm(q * 1.6 + vec2(t * .04, -t * .06)));
  // embers: thrown out of the centres, rising, cooling as they age
  float eb = 0., eT = 0.;
  for (int k = 0; k < 32; k++){
    float fk = float(k);
    if (fk >= ne) break;
    float L = mix(1.6, 4.2, hash11(fk * 3.31 + 9.2)) * (.4 + 1.2 * life);
    float tt = t + hash11(fk * 7.13 + 1.7) * L;
    float cy = floor(tt / L), a = tt - cy * L;
    float an = TAU * hash12(vec2(fk, cy));
    float sp = (.06 + .2 * hash12(vec2(cy, fk + 3.1))) * (.4 + 1.2 * es);
    vec2 dir = vec2(cos(an), sin(an));
    vec2 src = cal_src(mod(fk, ns), ns, t);
    vec2 vel = dir * sp + vec2(0., rise * .16 * a);
    vec2 pos = src + dir * (.02 + sp * a) + vec2(0., rise * .08 * a * a) + .012 * vec2(sin(a * 5. + fk), cos(a * 4.3 + fk));
    float dd = sdSeg(p, pos - vel * .14, pos);
    float lf = 1. - a / L;
    float bv = exp(-dd * dd / (PX * PX * .7)) * (.35 + .65 * lf);
    if (bv > eb){ eb = bv; eT = .35 + .65 * lf; }
  }
  float tv = clamp(T, 0., 1.);
  vec3 col = eb > tv ? cal_map(eT, map) : cal_map(tv, map);
  float v = max(tv, eb);
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(v * (.75 + .25 * Y), 0., 1.));
}
`;
