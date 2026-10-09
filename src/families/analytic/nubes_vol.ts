/**
 * Nubes volumétricas (analytic): cloud density ray marched. Density: fbm3 thresholded by the coverage and
 * eroded by a finer noise; over the sea of clouds and under the broken layer ('horizonte', 'haces') it
 * lives in a layer between heights 0 and 1 with flat bases and rounded tops, inside ('dentro') it fills
 * space. Light: Beer–Lambert transmittance along the view ray, a short march toward the sun for each sample
 * (the light that reaches it), a two-lobe Henyey–Greenstein phase (forward silver lining, some back
 * scatter) and an ambient term. 'haces': the camera sits in a thin haze under the layer, and each haze
 * sample reads the layer's optical depth toward the sun: light shafts. The wind carries the noise.
 * Output: the light accumulated plus the sky seen through, with distance haze over the sea of clouds.
 *
 * k0 = (coverage, scale, erosion, wind), k1 = (sun angle, absorption, steps, camera).
 * Bounds: at most NV_STEPS view steps, NV_LIGHT sun steps per lit sample, 3 per haze sample.
 */
export const NUBES_VOL_GLSL = `
#define NV_STEPS 64
#define NV_LIGHT 5
// detail 0: the light's coarse density (three octaves, no erosion), 1: the view's
float NV_dens(vec3 q, vec3 off, float sc, float th, float ero, float layer, float detail, float gain){
  vec3 s = q * sc + off;
  float d = 0.;
  if (detail > .5) d = fbm3(s);
  else {
    vec3 c = s; float a = .5;
    for (int i = 0; i < 3; i++){ d += a * noise3(c); c = c * 2.03 + vec3(17.1, 3.7, 9.3); a *= .5; }
    d /= .875;
  }
  if (layer > .5){ float h = 2. * q.y - 1.; d = d * smoothstep(0., .12, q.y) - .3 * h * h; }
  d -= th;
  if (detail > .5 && d > -.1) d -= ero * .2 * noise3(s * 3.3);
  return max(d, 0.) * gain;
}
float NV_hg(float c, float g){ float k = 1. + g * g - 2. * g * c; return (1. - g * g) / (k * sqrt(k)); }
float F_nubes_vol(vec2 p, float t, vec4 k0, vec4 k1){
  float cam = k1.w, layer = cam > .5 ? 1. : 0.;
  // (no coverage, no cloud: the density fades in over the first 12 %)
  float th = mix(.66, .36, k0.x), sc = 1.6 / k0.y, ero = k0.z, sig = k1.y, gain = 12. * smoothstep(0., .12, k0.x);
  vec3 off = k0.w * t * (cam < .5 ? vec3(.06, .012, .32) : vec3(.18, .012, .1));
  vec3 ro = cam < .5 ? vec3(0., .5, 0.) : cam < 1.5 ? vec3(0., 1.45, 0.) : vec3(0., -1.5, 0.);
  float pitch = cam < .5 ? .05 : cam < 1.5 ? -.1 : .22;
  float el = cam < .5 ? .5 : cam < 1.5 ? .3 : .95;
  vec3 fw = vec3(0., sin(pitch), cos(pitch)), up = vec3(0., cos(pitch), -sin(pitch));
  vec3 rd = normalize(p.x * vec3(1., 0., 0.) + p.y * up + 1.1 * fw);
  float az = k1.x * PI;
  vec3 L = normalize(vec3(sin(az) * .9 + .2, el, -cos(az)));
  float mu = dot(rd, L);
  float ph = .7 * NV_hg(mu, .55) + .3 * NV_hg(mu, -.25);
  // sky (what the clouds let through) and the haze far over the sea of clouds
  float bg = cam < .5 ? .02 + .3 * pow(max(mu, 0.), 6.)
    : .03 + .13 * (1. - sat(rd.y * 2.5)) + .4 * pow(max(mu, 0.), 24.);
  float hz = .16 + .12 * pow(max(mu, 0.), 4.);
  if (cam > 1.5 && rd.y < 0.) bg = mix(bg, .03, sat(-rd.y * 6.));
  if (cam > .5 && cam < 1.5 && rd.y < 0.) bg = .03;
  // the stretch of the ray that crosses clouds
  float t0 = .02, t1 = 3.5, fog = 1.;
  if (cam > .5){
    float ry = abs(rd.y) > 1e-4 ? rd.y : -1e-4;
    float ta = (0. - ro.y) / ry, tb = (1. - ro.y) / ry;
    t0 = max(0., min(ta, tb)); t1 = min(t0 + 3., max(ta, tb));
    if (t0 > 25.) t1 = -1.;
    if (cam < 1.5) fog = exp(-t0 * .09);
  }
  float N = clamp(floor(k1.z + .5), 8., float(NV_STEPS));
  float T = 1., acc = 0.;
  // haze under the layer, lit through it
  if (cam > 1.5){
    float th1 = rd.y > 1e-4 ? min(t0, 6.) : 6.;
    float NH = floor(N * .5), dh = th1 / NH, sh0 = 1. / L.y, ph2 = NV_hg(mu, .35);
    for (int i = 0; i < NV_STEPS / 2; i++){
      if (float(i) >= NH) break;
      vec3 q = ro + rd * (dh * (float(i) + .5));
      float s0 = -q.y / L.y, tau = 0.;
      for (int j = 0; j < 3; j++) tau += NV_dens(q + L * (s0 + sh0 * (float(j) + .5) / 3.), off, sc, th, ero, 1., 0., gain);
      float lit = exp(-tau * sh0 / 3. * sig);
      float dt = .3 * dh;
      acc += T * (1. - exp(-dt)) * (lit * ph2 * .4 + .004);
      T *= exp(-dt);
    }
  }
  if (t1 > t0){
    float dt = (t1 - t0) / N;
    for (int i = 0; i < NV_STEPS; i++){
      if (float(i) >= N || T < .02) break;
      vec3 q = ro + rd * (t0 + dt * (float(i) + .5));
      float d = NV_dens(q, off, sc, th, ero, layer, 1., gain);
      if (d > .001){
        float tau = 0., s = 0.;
        for (int j = 0; j < NV_LIGHT; j++){
          float ls = .07 * float(j + 1);
          s += ls;
          tau += NV_dens(q + L * (s - ls * .5), off, sc, th, ero, layer, 0., gain) * ls;
        }
        float amb = layer > .5 ? .1 + .4 * sat(q.y) : .18;
        float a = 1. - exp(-d * sig * dt);
        float light = exp(-tau * sig) * ph * 2. + amb;
        acc += T * a * light;
        T *= 1. - a;
      }
    }
  }
  float v = mix(hz, acc + T * bg, fog);
  return sat(1. - exp(-1.5 * v));
}`;
