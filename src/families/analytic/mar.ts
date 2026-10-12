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
// the sky at offset s from the horizon point under it: haze, the moon (radiance m) with its halo, stars
float mar_sky(vec2 s, vec2 mp, float mr, float on, float m, float st, float t){
  float y = max(s.y, 0.);
  float v = .025 + .11 * exp(-y / .07) + .04 * exp(-y / .4);
  float d = length(s - mp);
  float disc = smoothstep(mr + .005, mr - .005, d);
  v += on * (m * disc + m * .3 * exp(-max(d - mr, 0.) / .06) + .08 * exp(-d / .35));
  if (st > 0.){
    vec2 c = floor(s * 64.);
    float h = hash12(c + 11.);
    v += st * smoothstep(.04, .12, s.y) * step(.985, h) * (.35 + .3 * sin(t * (.8 + h * 2.) + h * 60.));
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
    float v = mar_sky(s, mp, mr, on, 1., 1. - .6 * on, t);
    // the moon's face: a few darker seas on it
    if (on > 0. && length(s - mp) < mr) v -= .28 * on * smoothstep(.45, .7, fbm((s - mp) / mr * 1.6 + 4.));
    return clamp(v, 0., 1.);
  }
  float l = 1. / max(hz - p.y, 1e-4);
  vec2 X = vec2(p.x * l, f * l);
  float fp = PX * max(f * l * l, l);
  vec3 rd = normalize(vec3(p.x, p.y - hz, f));
  float kb = TAU / (2. + 10. * sc);
  vec2 g = vec2(0.);
  float h = 0., amp = 0.;
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    float k = kb * pow(1.45, fi);
    float a = wind * 1.4 + (fract(fi * .618) - .5) * 1.4;
    vec2 d = vec2(sin(a), cos(a));
    float A = wav * .08 * pow(.85, fi) / k;
    // a wave shorter than a few cells of water at this distance is averaged out
    float w = smoothstep(2., 4., TAU / (k * fp));
    float th = k * dot(d, X) - sqrt(2.5 * k) * t + fi * 2.1;
    g += w * A * k * cos(th) * d;
    h += w * A * sin(th);
    amp += A;
  }
  vec3 nrm = normalize(vec3(-g.x, 1., -g.y));
  vec3 r = reflect(rd, nrm);
  float cs = max(-dot(rd, nrm), 0.);
  float F = .02 + .98 * pow(1. - cs, 5.);
  vec2 sr = vec2(r.x, max(r.y, 0.)) / max(r.z, .05) * f;
  float v = F * mar_sky(sr, mp, mr * 1.7 + .006, on, 12., 0., t);
  // the water itself: a faint light on the faces turned to the moon, darker in the troughs
  float hn = h / max(amp, 1e-4);
  v += (1. - F) * (.035 + .05 * clamp(dot(nrm, normalize(vec3(mp.x, .5, 1.))) - .85, 0., 1.) * 6. + .03 * hn);
  // crests: whitecaps on rough water; plankton lights them with a slow twinkle
  float crest = smoothstep(.3, .8, hn);
  vec2 c = floor(p / max(PX, 1e-4));
  float hs = hash12(c + 5.);
  float tw = .5 + .5 * sin(t * (.9 + 1.6 * hs) + hs * 40.);
  float fade = exp(-l * .05);
  v += wav * .1 * smoothstep(.55, .95, hn) * fade;
  v += pl * fade * (crest * (.3 + .7 * tw * step(.35, hs)) + .05);
  return clamp(v, 0., 1.);
}
`;
