/**
 * «Metal fundido» (I-16, «Mejora de marmol»): a height field made like the marble pattern but warped three times
 * (each warp moves where the next one reads: q → a(q) → b(q + a) → c(q + b) → h(q + c)), with metaball bumps
 * (Σ r² / d²: where it passes 1 a dome rises, x(2 − x) with x = 1 − 1/Σ, and neighbours melt into each other) on top. Its normal (finite
 * differences of the height) lights it as a metal: the view reflects off the surface into a studio (dark floor,
 * a bright horizon band, a soft box overhead) turned by «Luz», plus a key light with a Blinn highlight; the
 * reflection is tinted by the metal's reflectance at normal incidence and goes white at grazing angles (Schlick's
 * Fresnel). Gold, silver and copper carry their own reflectance; «Paleta» reads it from the piece's palette.
 * The glyph comes from the reflected brightness. Written from the description of the effect, not from any code.
 * Parameters: k0 = (metal, scale, warp, drops), k1 = (speed, relief, shine, light angle °).
 */
export const METAL_FUNDIDO_GLSL = /* glsl */ `
vec3 mf_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
// three octaves: a liquid surface is smooth, its detail comes from the warps
float mf_fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++){ v += a * gnoise(p); p = m * p + 17.1; a *= .5; }
  return v / .875;
}
// the height: three nested warps of a 3-octave fBm, and the metaball drops
float mf_h(vec2 p, float T, float sc, float wa, float bl){
  vec2 q = p * sc;
  float W = 2.8 * wa;
  vec2 a = vec2(mf_fbm(q + vec2(0., T * .11)), mf_fbm(q + vec2(5.2 - T * .09, 1.3))) - .5;
  vec2 b = vec2(mf_fbm(q + W * a + vec2(1.7 + T * .06, 9.2)), mf_fbm(q + W * a + vec2(8.3, 2.8 - T * .05))) - .5;
  vec2 c = vec2(mf_fbm(q + W * b + vec2(4.1, 3.3)), mf_fbm(q + W * b + vec2(2.9, 7.7 + T * .04))) - .5;
  float h = mf_fbm(q + 1.3 * W * c + vec2(T * .03, -T * .02));
  float m = 0.;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 cc = vec2(.78 * sin(T * (.29 + .06 * fi) + fi * 2.3), .34 * sin(T * (.21 + .05 * fi) + fi * 1.7 + .5));
    float r = (.085 + .025 * sin(fi * 3.1 + T * .45)) * (.7 + .7 * bl);
    vec2 d = p - cc;
    m += r * r / (dot(d, d) + .0015);
  }
  // a drop's height: a dome where the field passes 1, rounded on top and melted into its neighbours
  float x = max(1. - 1. / max(m, 1e-3), 0.);
  return h + bl * .5 * x * (2. - x);
}
vec4 FC_metal_fundido(vec2 p, float t, vec4 k0, vec4 k1){
  float metal = floor(k0.x + .5), sc = k0.y, wa = k0.z, bl = k0.w;
  float T = t * k1.x, rel = k1.y, sh = k1.z, la = k1.w * PI / 180.;
  float e = .004;
  float h0 = mf_h(p, T, sc, wa, bl);
  vec2 g = vec2(mf_h(p + vec2(e, 0.), T, sc, wa, bl) - h0, mf_h(p + vec2(0., e), T, sc, wa, bl) - h0) / e;
  vec3 n = normalize(vec3(-g * (.012 + .07 * rel), 1.));
  // the view (along -z) reflected by the surface, read in a studio turned by the light's angle
  vec3 r = vec3(2. * n.z * n.xy, 2. * n.z * n.z - 1.);
  vec2 rr = rot2(r.xy, la);
  float env = .04 + .26 * smoothstep(-.15, .5, rr.y)
    + .8 * exp(-(rr.y + .06) * (rr.y + .06) / .006)
    + 1.1 * smoothstep(.45, .8, rr.y) * (1. - smoothstep(.2, .55, abs(rr.x)));
  vec3 L = normalize(vec3(.55 * sin(la) - .35, .55 * cos(la) + .2, .75));
  vec3 H = normalize(L + vec3(0., 0., 1.));
  float spec = pow(max(dot(n, H), 0.), 24. + 200. * sh) * (.3 + 1.7 * sh);
  float fr = pow(1. - n.z, 5.);
  float E = env + spec;
  vec3 col;
  if (metal < 2.5){
    vec3 F0 = metal < .5 ? vec3(1., .74, .3) : metal < 1.5 ? vec3(.93, .93, .91) : vec3(.96, .52, .34);
    col = (F0 + (1. - F0) * fr) * E;
    // a little of the metal's own colour in the dark: it is never a black mirror
    col += F0 * F0 * .05;
  } else col = mf_ramp(clamp(.08 + .8 * E + .4 * fr, 0., 1.)) * (.55 + .45 * min(E + fr, 1.6));
  col = col / (1. + .35 * col);
  float lum = dot(col, vec3(.299, .587, .114));
  return vec4(clamp(col, 0., 1.), clamp(lum * 1.35, 0., 1.));
}
`;
