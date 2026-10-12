/**
 * «Seda especular» (I-10, I-11, I-33: «Mejora de mareas_lentas»): the slow tides of mareas_lentas turned into a
 * lit surface. A height field (directed folds: three sines across a direction, their phases bending slowly along
 * it, the folds meandering with a noise, plus fBm detail) is lit by its normal. Three modes:
 *  - «Seda»: Blinn–Phong, a sharp highlight and a wide sheen (I-10, silk-groove);
 *  - «Cascada»: Kajiya–Kay anisotropic highlights along threads that cross the folds, shifted by a fibre noise
 *    (streaks) with a second, tinted lobe; one to three translucent layers (the nearer ones are ribbons over the
 *    sheet), each larger and faster than the one behind (parallax) (I-11, silk-cascade);
 *  - «Olas facetadas»: a sea seen in perspective from a camera above it (each cell's ray meets the displaced
 *    surface after a few fixed-point steps), shaded flat triangle by triangle with Phong's reflection and fog
 *    towards the horizon (I-33, Vanta waves).
 * «Facetas» cuts any of the three into flat triangles (a low-poly surface): the normal is the plane of the grid
 * triangle that holds the point. Colours come from the piece's palette (shade → ramp, highlight → its light end);
 * the glyph comes from the shading itself. Written from the published models, not from any shader's code.
 * k0 = (mode, scale, angle°, relief), k1 = (speed, detail, shine, gloss), K2 = (light°, layers, parallax,
 * facets), K3 = (tilt, meander, −, −).
 */
export const SEDA_GLSL = /* glsl */ `
vec3 sd_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
float sd_fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++){ v += a * gnoise(p); p = m * p + 17.1; a *= .5; }
  return v / .875;
}
// the height at x (the cloth's own coordinates, or the sea's plane), for layer j
float sd_h(vec2 x, float T, float mode, float sc, vec2 d, float det, float wa, float j){
  float u = dot(x, d), v = dot(x, vec2(-d.y, d.x));
  if (mode > 1.5){
    vec2 s = x * sc;
    return .9 * (gnoise(s * .8 + vec2(0., T * .22)) - .5) + .35 * sin(u * sc * 3. - T * 1.1) + det * .6 * (sd_fbm(s * 2.6 + vec2(T * .17, -T * .21)) - .5);
  }
  float m = wa * 2.2 * (sd_fbm(vec2(u * sc * .7 + j * 7.3, v * sc * .35 + T * .05 + j * 3.1)) - .5);
  float w = v * sc * 5. + m * 3.;
  float a = u * sc;
  float h = sin(w + T * .55 + .8 * sin(a * 1.1 - T * .23 + j))
    + .5 * sin(2.07 * w - T * .37 + 1.7 + 1.2 * sin(a * 1.9 + T * .19 + 2. * j))
    + .22 * sin(4.3 * w + T * .8 + 1.3 * a);
  return .4 * h + det * .5 * (sd_fbm(x * sc * 3. + vec2(T * .06 + j * 5.1, -T * .05 + j * 5.1)) - .5);
}
// the slope at x: of the grid triangle that holds it (facets of size g), or by finite differences
vec2 sd_grad(vec2 x, float g, float T, float mode, float sc, vec2 d, float det, float wa, float j){
  if (g > 0.){
    vec2 c = floor(x / g), f = x / g - c, a = c * g;
    float ha = sd_h(a, T, mode, sc, d, det, wa, j), hd = sd_h(a + vec2(g), T, mode, sc, d, det, wa, j);
    if (f.x > f.y){
      float hb = sd_h(a + vec2(g, 0.), T, mode, sc, d, det, wa, j);
      return vec2(hb - ha, hd - hb) / g;
    }
    float hc = sd_h(a + vec2(0., g), T, mode, sc, d, det, wa, j);
    return vec2(hd - hc, hc - ha) / g;
  }
  float e = .004, h0 = sd_h(x, T, mode, sc, d, det, wa, j);
  return vec2(sd_h(x + vec2(e, 0.), T, mode, sc, d, det, wa, j) - h0, sd_h(x + vec2(0., e), T, mode, sc, d, det, wa, j) - h0) / e;
}
vec4 FC_seda(vec2 p, float t, vec4 k0, vec4 k1){
  float mode = floor(k0.x + .5), sc = k0.y, ang = k0.z * PI / 180., rel = k0.w;
  float T = t * k1.x, det = k1.y, sh = k1.z, gl = 6. + 154. * k1.w * k1.w;
  float la = K2.x * PI / 180., nl = floor(K2.y + .5), par = K2.z, fac = K2.w;
  float tilt = K3.x, wa = K3.y;
  vec2 d = vec2(cos(ang), sin(ang)), pd = vec2(-d.y, d.x);
  vec3 col;
  float lum;
  if (mode > 1.5){
    // the sea in perspective: a camera one unit above the plane, looking down by «Inclinación»
    float pitch = .22 + .85 * tilt, cp = cos(pitch), sp = sin(pitch);
    vec3 dir = normalize(vec3(p.x, p.y * cp - 1.7 * sp, -p.y * sp - 1.7 * cp));
    vec3 sky = sd_ramp(.18 + .3 * (1. - smoothstep(-.02, .45, dir.y)));
    if (dir.y > -.015) return vec4(sky, .1 + .25 * (1. - smoothstep(-.02, .45, dir.y)));
    float k = rel * .35, tt = 1. / -dir.y;
    vec2 W = dir.xz * tt;
    for (int i = 0; i < 3; i++){
      tt = (1. - k * sd_h(W, T, mode, sc, d, det, wa, 0.)) / -dir.y;
      W = dir.xz * tt;
    }
    vec2 g = sd_grad(W, fac < .01 ? 0. : .05 + .3 * fac, T, mode, sc, d, det, wa, 0.);
    vec3 n = normalize(vec3(-g.x * k * 1.7, 1., -g.y * k * 1.7));
    vec3 L = normalize(vec3(.6 * cos(la), .32, .6 * sin(la) - .45));
    float diff = max(dot(n, L), 0.);
    vec3 R = reflect(-L, n);
    float hi = sh * 1.4 * pow(max(dot(R, -dir), 0.), gl);
    float fog = exp(-max(tt - 1.2, 0.) * .16);
    float shade = .1 + .78 * diff;
    col = mix(sky, sd_ramp(shade) + hi * mix(sd_ramp(1.), vec3(1.), .4), fog);
    lum = mix(.1 + .25 * (1. - smoothstep(-.02, .45, dir.y)), shade * .9 + hi, fog);
    return vec4(clamp(col, 0., 1.), clamp(lum, 0., 1.));
  }
  // cloth: seen from the front (tilted by «Inclinación»), lit from «Luz»
  vec3 V = normalize(vec3(0., -.8 * tilt, 1.)), L = normalize(vec3(.7 * cos(la), .7 * sin(la), .55)), H = normalize(L + V);
  float gs = fac < .01 ? 0. : .04 + .3 * fac, nlay = mode > .5 ? nl : 1.;
  col = vec3(0.); lum = 0.;
  for (int i = 0; i < 3; i++){
    float j = float(i);
    if (j >= nlay) break;
    // each layer nearer than the one behind: larger, and drifting faster along the folds (parallax)
    float s = 1. + .35 * j * par;
    vec2 xr = p / s + d * T * (.04 + .12 * par * j), x = xr + vec2(3.7, 1.3) * j;
    vec2 g = sd_grad(x, gs, T, mode, sc, d, det, wa, j);
    vec3 n = normalize(vec3(-g * rel * .55, 1.));
    float diff = max(dot(n, L), 0.), shade = .06 + .84 * diff * sqrt(diff), hi, hi2 = 0.;
    if (mode < .5){
      // silk: a sharp Blinn highlight and its wide sheen
      float nh = max(dot(n, H), 0.);
      hi = sh * (1.1 * pow(nh, gl) + .18 * pow(nh, gl * .12));
    } else {
      // threads across the folds (Kajiya–Kay), shifted along the normal by a fibre noise: streaks
      float fib = gnoise(vec2(dot(x, d) * 55. * sc, dot(x, pd) * 1.5 * sc + j * 9.1)) - .5;
      vec3 T0 = vec3(pd, 0.);
      vec3 Tn = normalize(T0 - n * dot(n, T0) + n * fib * (.06 + .3 * det));
      float th = dot(Tn, H);
      hi = sh * .8 * pow(sqrt(max(1. - th * th, 0.)), gl * 3.);
      vec3 T2 = normalize(Tn - n * .3);
      float th2 = dot(T2, H);
      hi2 = sh * .3 * pow(sqrt(max(1. - th2 * th2, 0.)), gl);
    }
    vec3 c = sd_ramp(shade * .85) + hi * mix(sd_ramp(1.), vec3(1.), .4) + hi2 * sd_ramp(.75);
    float l = shade * .8 + hi + .5 * hi2;
    // the first layer is the whole sheet; the nearer ones are translucent ribbons over it
    float al = 1.;
    if (j > .5){
      float v = dot(xr, pd), u = dot(xr, d);
      float cen = (j < 1.5 ? -.2 : .24) + .1 * sin(u * 1.2 + T * .2 * (1. + j) + j);
      float w = .14 + .05 * sin(u * .8 - T * .15 + 2. * j);
      al = .62 * smoothstep(w + .025, w - .025, abs(v - cen));
    }
    col = mix(col, c, al);
    lum = mix(lum, l, al);
  }
  return vec4(clamp(col, 0., 1.), clamp(lum, 0., 1.));
}
`;
