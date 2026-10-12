/**
 * «Mar nocturno» (C-03): a sea in perspective under the moon. Each cell below the horizon casts a ray from a
 * camera one unit above the water and meets the plane: the farther the row, the farther the water. The
 * surface is a sum of eight waves h = Σ Aᵢ sin(kᵢ dᵢ·x − ωᵢ t + φᵢ) with the deep-water dispersion ωᵢ = √(g kᵢ),
 * so long swells run faster than short ripples and the sum never repeats. The normal comes from the analytic
 * gradient; waves shorter than a few cells' footprint fade out (no aliasing near the horizon). The ray
 * reflects off that normal and reads the sky in the reflected direction, weighted by Schlick's Fresnel term
 * F = F₀ + (1 − F₀)(1 − cos θ)⁵: the moon, far brighter than the sky, breaks into a column of glints.
 * «Plancton» lights the crests (normalised height over a threshold) with a slow twinkle per cell. Above the
 * horizon: haze, the moon with its halo and a few stars. Written from the published description of the
 * effect, not from any shader's code.
 * Parameters: k0 = (wave height, wave length, wind, horizon), k1 = (moon size, moon height, moon x, plankton).
 */
export const MAR_GLSL = /* glsl */ `
// the sky at offset s from the horizon point under it: haze (gain h), the moon (radiance m) with its halo, stars
float mar_sky(vec2 s, vec2 mp, float mr, float on, float m, float h, float st, float t){
  float y = max(s.y, 0.);
  float v = h * (.02 + .2 * exp(-y / .04) + .05 * exp(-y / .35));
  float d = length(s - mp);
  float disc = smoothstep(mr + .005, mr - .005, d);
  v += on * (m * disc + h * (.3 * exp(-max(d - mr, 0.) / .06) + .05 * exp(-d / .3)));
  if (st > 0.){
    vec2 c = floor(s * 64.);
    float hs = hash12(c + 11.);
    v += st * smoothstep(.04, .12, s.y) * step(.985, hs) * (.22 + .15 * sin(t * (.8 + hs * 2.) + hs * 60.));
  }
  return v;
}
float F_mar(vec2 p, float t, vec4 k0, vec4 k1){
  float wav = k0.x, sc = k0.y, wind = k0.z, hz = mix(-.25, .35, k0.w);
  float on = smoothstep(0., .08, k1.x), mr = .015 + .06 * k1.x;
  vec2 mp = vec2(k1.z * .6, .04 + .3 * k1.y);
  float pl = k1.w, f = 1.3;
  if (p.y > hz){
    vec2 s = vec2(p.x, p.y - hz);
    float v = mar_sky(s, mp, mr, on, 1., 1., 1. - .6 * on, t);
    // the moon's face: a few darker seas on it
    if (on > 0. && length(s - mp) < mr) v -= .28 * on * smoothstep(.45, .7, fbm((s - mp) / mr * 1.6 + 4.));
    return clamp(v, 0., 1.);
  }
  float l = 1. / max(hz - p.y, 1e-4);
  vec2 X = vec2(p.x * l, f * l);
  float fp = PX * max(f * l * l, l);
  vec3 rd = normalize(vec3(p.x, p.y - hz, f));
  float kb = TAU / (1. + 4. * sc);
  vec2 g = vec2(0.);
  float h = 0., a2 = 0.;
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    float k = kb * pow(1.45, fi);
    float a = wind * 1.4 + (fract(fi * .618) - .5) * 1.4;
    vec2 d = vec2(sin(a), cos(a));
    float A = wav * .045 * pow(TAU / k, .6);
    // a wave shorter than a few cells of water at this distance is averaged out
    float w = smoothstep(2., 4., TAU / (k * fp));
    float th = k * dot(d, X) - sqrt(2.5 * k) * t + fi * 2.1;
    g += w * A * k * cos(th) * d;
    h += w * A * sin(th);
    a2 += w * w * A * A;
  }
  vec3 nrm = normalize(vec3(-g.x, 1., -g.y));
  vec3 r = reflect(rd, nrm);
  float cs = max(-dot(rd, nrm), 0.);
  float F = .02 + .98 * pow(1. - cs, 5.);
  vec2 sr = vec2(r.x, max(r.y, 0.)) / max(r.z, .05) * f;
  // facets smaller than a cell: each cell's reflection wanders a little on its own, so the moon's path
  // sparkles cell by cell instead of shining in blocks
  vec2 c = floor(p / max(PX, 1e-4));
  vec2 hc = hash22(c + 7.);
  float an = hc.x * TAU + t * (.6 + 1.4 * hc.y);
  sr += .12 * sqrt(hc.y) * vec2(cos(an), sin(an));
  // the moon is far brighter than the sky: its reflection breaks into glints; the haze shows the waves' faces
  float v = F * mar_sky(sr, mp, mr * 1.25, on, 12., 2., 0., t);
  // the water itself: dark, a little lighter on the crests (ripples on calm water, whitecaps on rough)
  float hn = h / sqrt(a2 * .5 + 1e-8);
  float fade = exp(-l * .05);
  v += (1. - F) * (.03 + (.12 + .16 * wav) * smoothstep(.4, 1.6, hn) * fade);
  // plankton lights the crests with a slow twinkle
  float crest = smoothstep(.2, 1.3, hn);
  float hs = hash12(c + 5.);
  float tw = .5 + .5 * sin(t * (.9 + 1.6 * hs) + hs * 40.);
  v += pl * fade * (crest * (.35 + .65 * tw * step(.35, hs)) + .06);
  return clamp(v, 0., 1.);
}
`;
