/**
 * «Cromado en tramas» (V-03): chrome bands that bend along a mask's contour. A shape (circle, ring, drop,
 * rhombus, moving metaballs, or none) gives a signed distance d; from it an edge field E (1 on the contour,
 * falling to 0 inside with a parabolic profile, the shape of a Poisson solution with zero boundary value) bends
 * the band coordinate: φ = repetition · (diagonal + contour · E + distortion · noise) − time. Near the contour
 * the bands turn and crowd to follow it. One period of φ is a reflected ramp up to a sharp horizon and a line
 * in the dark ground, filtered by the phase change across one cell so it never aliases into noise; a rim of
 * light runs along the contour. Red and blue read the
 * band a little ahead and behind (dispersion), each channel through the palette (the tint). The glyph comes
 * from the band phase. Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (mask, repetition, distortion, contour), k1 = (angle°, dispersion, speed, size).
 */
export const CROMADO_GLSL = /* glsl */ `
vec3 crom_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
float crom_smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
// signed distance to the mask (negative inside)
float crom_sd(vec2 p, float m, float R, float T){
  if (m < 1.5) return length(p) - R;
  if (m < 2.5) return abs(length(p) - .7 * R) - .3 * R;
  if (m < 3.5){
    // a drop: the hull of a round base and a small tip above it, swaying a little
    vec2 q = rot2(p, .09 * sin(T * .7));
    q.y += .42 * R; q.x = abs(q.x);
    float r1 = .78 * R, r2 = .05 * R, h = 1.75 * R;
    float b = (r1 - r2) / h, a = sqrt(1. - b * b);
    float k = dot(q, vec2(-b, a));
    if (k < 0.) return length(q) - r1;
    if (k > a * h) return length(q - vec2(0., h)) - r2;
    return dot(q, vec2(a, b)) - r1;
  }
  if (m < 4.5){
    vec2 q = abs(p);
    vec2 A = vec2(.78 * R, 0.), B = vec2(0., 1.1 * R);
    return sdSeg(q, A, B) * sign(q.x / A.x + q.y / B.y - 1.);
  }
  // metaballs: four drops on their own slow paths, melted together
  float d = 1e3;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 c = vec2(1.3 * R * sin(T * (.23 + .07 * fi) + fi * 2.1), .62 * R * sin(T * (.31 - .05 * fi) + fi * 1.3 + .6));
    float r = R * (.5 + .1 * sin(fi * 1.7 + T * .4));
    d = crom_smin(d, length(p - c) - r, .55 * R);
  }
  return d;
}
// one band period: a sky ramp up to a sharp horizon, then darker ground with one reflected line; fw is the
// phase step across one cell: what a cell cannot hold is averaged instead of aliased
float crom_line(float x, float c, float h, float fw){
  float w = max(h, fw * .5);
  return h / w * (1. - smoothstep(0., w, abs(fract(x - c + .5) - .5)));
}
float crom_prof(float x, float fw){
  float e = max(.02, fw * .5);
  float v = mix(.03 + .1 * smoothstep(.5, 1., x), .32 + .68 * smoothstep(0., .5, x), 1. - smoothstep(.5 - e, .5 + e, x));
  v = max(v, .9 * crom_line(x, .68, .045, fw));
  return mix(v, .42, smoothstep(.35, .9, fw));
}
vec4 FC_cromado(vec2 p, float t, vec4 k0, vec4 k1){
  float m = floor(k0.x + .5), rep = k0.y, dis = k0.z, con = k0.w;
  float ang = k1.x * PI / 180., T = t * k1.z, R = k1.w;
  float d = -1., E, dE, cov = 1.;
  if (m < .5){
    // no mask: the level lines of a slow field stand in for a contour, the whole canvas is metal
    float n = fbm(p * .9 / R + vec2(T * .05, -T * .04));
    E = smoothstep(.25, .75, n);
    dE = 2.5 / R;
  } else {
    d = crom_sd(p, m, R, T);
    float D = .3 * R;
    float u = clamp(-d / D, 0., 1.);
    E = (1. - u) * (1. - u);
    dE = 2. * (1. - u) / D;
    cov = smoothstep(.6 * PX, -.6 * PX, d);
  }
  float nz = gnoise(p * 2.6 / R + vec2(T * .21, -T * .17)) - .5;
  vec2 dir = vec2(cos(ang), sin(ang));
  float ph = rep * (dot(p, dir) + con * .5 * R * E + dis * .5 * R * nz) - T * .55;
  float fw = rep * (1. + con * .5 * R * dE + dis * 1.3) * PX;
  float dl = k1.y * .12 * (.3 + .7 * E);
  float g = crom_prof(fract(ph), fw);
  float r = crom_prof(fract(ph + dl), fw);
  float b = crom_prof(fract(ph - dl), fw);
  // outside: a thin halo that hugs the shape, lit by the band at the contour
  float halo = m < .5 ? 0. : .2 * exp(-max(d, 0.) / .016) * (.55 + .45 * g) * (1. - cov);
  // a rim of light along the contour, as on polished metal seen at a grazing angle
  float rim = m < .5 ? 0. : .32 * E * E * E;
  vec3 col = vec3(crom_ramp(r).r, crom_ramp(g).g, crom_ramp(b).b);
  col = mix(crom_ramp(.25 + 1.8 * halo), col, cov);
  // the glyph follows the band's phase, through the same three channels (dispersion widens the bright lines)
  float lb = .3 * r + .59 * g + .11 * b;
  return vec4(col, clamp(cov * (.05 + .95 * lb + rim) + halo, 0., 1.));
}
`;
