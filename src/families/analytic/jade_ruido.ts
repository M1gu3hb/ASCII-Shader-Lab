/**
 * «Jade de ruido» (I-34, I-35: «Mejora de jade_vivo»): jade_vivo's sphere, but its surface is pushed along the
 * normal by a 3D noise instead of sines. The noise space is twisted about the vertical axis by an angle that
 * waves with the height (a·sin(y·f + phase): the torsion of the reference blobs), the radius breathes, and the
 * colour is a cosine palette (a + b·cos(2π(c·x + d))) indexed by the displacement, so ridges and hollows take
 * different colours; «Paleta» indexes the piece's palette instead. Drawn by sphere tracing a signed distance
 * (|q| − R − A·D(q), scaled for safety) inside a bounding sphere, at most 44 steps, with a four-tap normal,
 * wrapped diffuse light (jade lets light in), a Phong highlight and a Fresnel rim.
 * Time: every time dependence is a whole number of turns of the cycle's phase θ = 2πt / «Ciclo» — the two noise
 * octaves travel round circles in noise space (a noise periodic in time), the torsion wave and the breath turn
 * with θ, the figure turns «Giro» whole times — so the loop is exact.
 * k0 = (radius, displacement, frequency, torsion), k1 = (torsion waves, breath, cycle s, palette),
 * K2 = (hue shift, hue spread, turns per cycle, shine). Written from the published description, not from code.
 */
export const JADE_RUIDO_GLSL = /* glsl */ `
vec3 jr_ramp(float x){
  float n = max(uPalN, 1.);
  float f = clamp(x, 0., 1.) * (n - 1.);
  float i = floor(f);
  return mix(uPal[int(i)], uPal[int(min(i + 1., n - 1.))], f - i);
}
// cosine palettes: jade, iris, magma, ocean; the piece's palette read back and forth
vec3 jr_pal(float m, float x){
  vec3 a = vec3(.22, .5, .38), b = vec3(.18, .32, .24), c = vec3(1.), d = vec3(0., .1, .25);
  if (m > .5 && m < 1.5){ a = vec3(.5); b = vec3(.5); c = vec3(1.); d = vec3(0., .33, .67); }
  else if (m > 1.5 && m < 2.5){ a = vec3(.55, .25, .12); b = vec3(.45, .3, .2); c = vec3(1., .8, .6); d = vec3(0., .1, .2); }
  else if (m > 2.5 && m < 3.5){ a = vec3(.2, .42, .6); b = vec3(.2, .3, .35); c = vec3(1., 1., .8); d = vec3(.5, .35, .2); }
  else if (m > 3.5) return jr_ramp(.5 + .5 * cos(TAU * x));
  return clamp(a + b * cos(TAU * (c * x + d)), 0., 1.);
}
// the displacement at q: twisted about y, two octaves of noise travelling round circles (periodic in θ)
float jr_disp(vec3 q, float th, float fq, float tw, float twf){
  float a = tw * sin(q.y * twf + th);
  float ca = cos(a), sa = sin(a);
  q = vec3(ca * q.x - sa * q.z, q.y, sa * q.x + ca * q.z);
  vec3 s = q * fq;
  float n = noise3(s + 1.6 * vec3(cos(th), sin(th), 0.)) + .5 * noise3(s * 2.1 + 1.3 * vec3(0., cos(2. * th + 1.), sin(2. * th + 1.)) + 7.7);
  return (n / 1.5 - .5) * 2.2;
}
// the figure in the camera's space: turned about y, then the displaced sphere
float jr_sdf(vec3 x, float cs, float ss, float R, float amp, float th, float fq, float tw, float twf){
  vec3 q = vec3(cs * x.x + ss * x.z, x.y, -ss * x.x + cs * x.z);
  return (length(q) - R - amp * jr_disp(q, th, fq, tw, twf)) * .6;
}
vec4 FC_jade_ruido(vec2 p, float t, vec4 k0, vec4 k1){
  float R0 = k0.x, amp = k0.y, fq = k0.z, tw = k0.w;
  float twf = k1.x, br = k1.y, P = k1.z, pal = floor(k1.w + .5);
  float shf = K2.x, hs = K2.y, spin = floor(K2.z + .5), sh = K2.w;
  float th = TAU * t / P;
  float R = R0 * (1. + br * sin(2. * th));
  float cs = cos(spin * th + .4), ss = sin(spin * th + .4);
  vec3 ro = vec3(0., 0., 2.6), rd = normalize(vec3(p, -2.4));
  float rb = R + amp * 1.15 + .02;
  float bq = dot(ro, rd), disc = bq * bq - (dot(ro, ro) - rb * rb);
  if (disc < 0.) return vec4(0.);
  float tt = -bq - sqrt(disc), tf = -bq + sqrt(disc), hit = 0.;
  for (int i = 0; i < 44; i++){
    float d = jr_sdf(ro + rd * tt, cs, ss, R, amp, th, fq, tw, twf);
    if (d < .0012){ hit = 1.; break; }
    tt += d;
    if (tt > tf){ break; }
  }
  if (hit < .5) return vec4(0.);
  vec3 x = ro + rd * tt;
  // four-tap normal
  float e = .0025;
  vec3 n = normalize(
    vec3(1., -1., -1.) * jr_sdf(x + e * vec3(1., -1., -1.), cs, ss, R, amp, th, fq, tw, twf) +
    vec3(-1., -1., 1.) * jr_sdf(x + e * vec3(-1., -1., 1.), cs, ss, R, amp, th, fq, tw, twf) +
    vec3(-1., 1., -1.) * jr_sdf(x + e * vec3(-1., 1., -1.), cs, ss, R, amp, th, fq, tw, twf) +
    vec3(1., 1., 1.) * jr_sdf(x + e * vec3(1., 1., 1.), cs, ss, R, amp, th, fq, tw, twf));
  vec3 q = vec3(cs * x.x + ss * x.z, x.y, -ss * x.x + cs * x.z);
  float dsp = jr_disp(q, th, fq, tw, twf);
  vec3 L = normalize(vec3(-.5, .62, .62)), V = -rd;
  float nl = dot(n, L), diff = max((nl + .35) / 1.35, 0.);
  float spec = sh * pow(max(dot(2. * nl * n - L, V), 0.), 6. + 50. * sh);
  float fres = pow(1. - max(dot(n, V), 0.), 3.);
  vec3 base = jr_pal(pal, shf + hs * dsp);
  vec3 col = base * (.18 + .82 * diff) + spec + fres * (.15 + .4 * sh) * jr_pal(pal, shf + .5);
  float lum = .1 + .62 * diff * (.55 + .45 * dot(base, vec3(.299, .587, .114))) + .55 * spec + (.12 + .36 * sh) * fres;
  return vec4(clamp(col, 0., 1.), clamp(lum, 0., 1.));
}
`;
