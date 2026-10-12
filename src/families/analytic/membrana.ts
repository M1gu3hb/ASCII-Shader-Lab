/**
 * «Membrana iridiscente» (V-02): a thin film (soap or oil) whose colour is the interference of the light
 * reflected by its two faces. The optical path difference is OPD = 2·n·d·cos θt (d the film thickness, θt
 * the refraction angle by Snell's law from the surface's tilt); one of the two reflections is inverted, so a
 * band of the spectrum at wavelength λ comes back with intensity ∝ 1 − cos(2π·OPD/λ) (black where the film
 * is much thinner than the light, then Newton's sequence: white, yellow, magenta, blue, green… fading to
 * pastel as it thickens). The spectrum is cut in MEM_N bands; each band's response is averaged over its
 * width (a sinc factor) and weighted by the CIE 1931 matching functions (Wyman–Sloan–Shirley's analytic fit)
 * turned into linear sRGB, normalised so that a flat spectrum is white. With «Color: paleta» the same
 * physics runs over the piece's colours instead (each colour gets a wavelength of its own).
 *
 * The thickness drains under gravity (thick below, black film above), is stirred by a warped flow, and the
 * surface undulates (analytic waves): its tilt changes the angle, shades the folds and moves the highlight.
 * Forms: a sheet that fills the canvas, a floating bubble (sphere: angle from the radius, bright rim), or an
 * oil slick on dark water.
 *
 * k0 = (form, thickness, flow, waves), k1 = (speed, shine, scale, colour by). Written from the physics
 * (thin-film interference, Snell, Fresnel), not from any shader's code.
 */

/** Spectral bands over 400–700 nm. */
export const MEM_N = 8;
export const MEM_L0 = 400, MEM_L1 = 700;
export const MEM_DL = (MEM_L1 - MEM_L0) / MEM_N;

// CIE 1931 colour matching functions, piecewise-gaussian fit (Wyman, Sloan & Shirley, JCGT 2013)
const g = (l: number, mu: number, s1: number, s2: number) => { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const cmfX = (l: number) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const cmfY = (l: number) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const cmfZ = (l: number) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);

/** Centre wavelength of each band (nm) and its weight in linear sRGB (a flat spectrum sums to white). */
export const MEM_LAMBDA = new Float32Array(MEM_N);
export const MEM_W = new Float32Array(MEM_N * 3);
{
  const raw = new Float64Array(MEM_N * 3);
  const sum = [0, 0, 0];
  for (let i = 0; i < MEM_N; i++) {
    let X = 0, Y = 0, Z = 0;
    // integrate each band finely
    for (let s = 0; s < 40; s++) {
      const l = MEM_L0 + (i + (s + 0.5) / 40) * MEM_DL;
      X += cmfX(l); Y += cmfY(l); Z += cmfZ(l);
    }
    // XYZ → linear sRGB (D65)
    raw[i * 3] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    raw[i * 3 + 1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    raw[i * 3 + 2] = 0.0557 * X - 0.204 * Y + 1.057 * Z;
    for (let c = 0; c < 3; c++) sum[c] += raw[i * 3 + c];
    MEM_LAMBDA[i] = Math.fround(MEM_L0 + (i + 0.5) * MEM_DL);
  }
  for (let i = 0; i < MEM_N * 3; i++) MEM_W[i] = Math.fround(raw[i] / sum[i % 3]);
}

const f = (v: number) => { const s = String(Math.fround(v)); return s.includes('.') || s.includes('e') ? s : s + '.'; };
const arrL = Array.from(MEM_LAMBDA, f).join(', ');
const arrW = Array.from({ length: MEM_N }, (_, i) => `vec3(${f(MEM_W[i * 3])}, ${f(MEM_W[i * 3 + 1])}, ${f(MEM_W[i * 3 + 2])})`).join(', ');

export const MEMBRANA_GLSL = /* glsl */ `
const float MEM_L[${MEM_N}] = float[${MEM_N}](${arrL});
const vec3 MEM_W[${MEM_N}] = vec3[${MEM_N}](${arrW});
// one band's two-beam response, averaged over its width: 1 - cos(phase) * sinc
float mem_band(float opd, float l){
  float x = PI * opd * ${f(MEM_DL)} / (l * l);
  float env = x < 1e-3 ? 1. : sin(x) / x;
  return 1. - cos(TAU * opd / l) * env;
}
vec4 FC_membrana(vec2 p, float t, vec4 k0, vec4 k1){
  float form = floor(k0.x + .5), fl = k0.z, wv = k0.w, T = t * k1.x, sh = k1.y;
  // thickness (nm): the film's thickest part
  float D = mix(260., 1500., k0.y);
  vec2 u = p / k1.z;
  // surface waves: height h = sum of travelling sines, its gradient analytic
  float A = wv * .05;
  vec2 d1 = vec2(.83, .55), d2 = vec2(-.42, .91), d3 = vec2(.97, -.26);
  float a1 = dot(u, d1) * 7.3 + T * 1.31, a2 = dot(u, d2) * 11.1 - T * .97, a3 = dot(u, d3) * 4.9 + T * .61;
  vec2 gr = A * (d1 * 7.3 * cos(a1) + .55 * d2 * 11.1 * cos(a2) + .8 * d3 * 4.9 * cos(a3));
  vec3 n = normalize(vec3(-gr, 1.));
  float thick, cosi, rim = 0., cover = 1., ground = 0.;
  if (form < .5){
    // a sheet: drains under gravity (black film at the top), stirred by a warped flow rising from below
    vec2 w = vec2(fbm(u * 1.5 + vec2(0., -T * .3)), fbm(u * 1.5 + vec2(5.2, 1.3 - T * .22))) - .5;
    vec2 q = u + fl * .5 * w;
    // a second warp, fed by the first: the swirls pull the bands into thin streaks
    vec2 w2 = vec2(fbm(q * 2.2 + vec2(1.7, 9.2 + T * .12)), fbm(q * 2.2 + vec2(8.3, 2.8 - T * .15))) - .5;
    float sw = fbm(q * 2.4 + w2 * 3. * fl + vec2(T * .11, -T * .36)) - .5;
    float gv = .5 - q.y + .06 * sin(q.x * 3.1 + T * .23);
    thick = D * (.01 + .99 * sat(-.12 + .95 * gv + fl * .55 * sw));
    cosi = n.z;
  } else if (form < 1.5){
    // a bubble: a sphere seen from the front; the angle comes from the radius, gravity drains its top
    float an = atan(u.y, u.x);
    float R = .4 * (1. + .022 * sin(an * 3. + T * .7) + .016 * sin(an * 2. - T * .53));
    float rho = length(u) / R;
    if (rho > 1.02) return vec4(0.);
    cover = 1. - smoothstep(.985, 1.015, rho);
    rho = min(rho, .999);
    float nz = sqrt(1. - rho * rho);
    vec3 sp = vec3(u / R, nz);
    float ca = cos(T * .13), sa = sin(T * .13);
    vec3 sr = vec3(ca * sp.x + sa * sp.z, sp.y, -sa * sp.x + ca * sp.z);
    float sw = fbm3(sr * 2.3 + vec3(0., -T * .21, T * .07)) - .5;
    thick = D * (.01 + .99 * sat(-.1 + .48 * (1. - sp.y) + fl * .7 * sw));
    n = normalize(vec3(sp.xy + gr * .6, nz));
    cosi = n.z;
    rim = pow(1. - nz, 3.);
  } else {
    // an oil slick on dark water: patches of oil, thicker at their middle
    vec2 w = vec2(fbm(u * 1.3 + vec2(T * .05, 0.)), fbm(u * 1.3 + vec2(5.2, 1.3 - T * .04))) - .5;
    vec2 q = u + fl * .45 * w;
    float m = fbm(q * 1.9 + vec2(T * .03, T * .02));
    cover = smoothstep(.38, .46, m);
    thick = D * (.04 + .96 * smoothstep(.38, .85, m + fl * .12 * (fbm(q * 5. - T * .1) - .5)));
    cosi = n.z;
    ground = .03 + .04 * (gr.x - gr.y) / max(A * 20., 1e-3);
  }
  // refraction into the film (soap 1.33, oil 1.45) and the optical path difference
  float nf = form > 1.5 ? 1.45 : 1.33;
  float st = sqrt(max(0., 1. - cosi * cosi)) / nf;
  float opd = 2. * nf * thick * sqrt(1. - st * st);
  vec3 col = vec3(0.);
  float Y0;
  if (k1.w < .5){
    for (int i = 0; i < ${MEM_N}; i++) col += MEM_W[i] * mem_band(opd, MEM_L[i]);
    col = max(col * .5, 0.);
    // the glyph: the reflected brightness, with the fringes of the green band (where the eye is sharpest) marked
    Y0 = mix(dot(col, vec3(.2126, .7152, .0722)), .45 * mem_band(opd, 555.), .35);
  } else {
    // the same fringes in the piece's colours: each interference order takes the next colour (the darkest
    // one at the minima), and they fade towards an even mix as the film thickens, as white light does
    float s = opd / 560., nP = max(uPalN, 1.);
    float I = .5 * (1. - cos(TAU * s) * exp(-s * s / 14.));
    vec3 fc = nP < 1.5 ? uPal[0] : uPal[int(mod(floor(s), nP - 1.)) + 1];
    col = mix(uPal[0], fc, sat(I * 1.6));
    Y0 = I * .9;
  }
  // light: shading of the folds, a highlight from the upper left, brighter at grazing angles
  vec3 L = normalize(vec3(-.45, .55, 1.));
  float dif = max(dot(n, L), 0.);
  float spec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 70.);
  float fres = pow(1. - cosi, 2.);
  float lit = .55 + .45 * dif + .6 * fres + .8 * rim;
  if (form > .5 && form < 1.5){
    // the bubble: mostly transparent in the middle, the window's reflection near the top
    lit = .2 + .3 * dif + 2.2 * rim + .6 * fres;
    vec2 wq = n.xy - vec2(-.38, .42);
    spec += .8 * (1. - smoothstep(.09, .16, length(wq * vec2(1., 1.6))));
  } else if (form > 1.5) lit *= 1.3;
  vec3 film = col * lit;
  float Y = Y0 * lit;
  // the highlight is the light reflected by the film: it takes the film's colour (none on a black film)
  float s = sh * spec * (.15 + 2. * Y0);
  film += s * (col + .1);
  // water around the slick, nothing around the bubble
  film = mix(vec3(ground * .6, ground * .8, ground), film, cover);
  float lum = mix(ground, pow(sat(Y * 1.15), .8) + s, cover);
  vec3 outc = pow(clamp(film, 0., 1.), vec3(1. / 2.2));
  return vec4(outc, sat(lum));
}
`;
