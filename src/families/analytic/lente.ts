/**
 * Agujero negro (analytic): light bent by a Schwarzschild (non-rotating) black hole, units r_s = 1. Each
 * ray stays in the plane through the hole, the camera and its direction, where u = 1/r obeys
 * d²u/dφ² = −u + (3/2) u²; it is integrated with RK4 in φ (steps shrink near the photon sphere) from the
 * camera, a static observer at distance D: u = 1/D, du/dφ = −u √(1 − u) cot ψ, ψ the angle to the radial
 * direction. u ≥ 1 is a capture (the shadow); u ≤ 0 an escape, whose asymptotic direction reads the
 * background (a procedural star field, a grid of meridians and parallels). The thin disk lives in the
 * plane y = 0 between r = 3 (ISCO) and the outer radius: the ray meets that plane at φ = φ₀ + kπ, and u
 * there comes from a cubic Hermite step.
 *
 * Artistic, not computed: the disk's emission (∝ r⁻³ (1 − √(3/r)) times a sheared noise turning at the
 * Keplerian rate), its opacity, a Doppler beaming factor g² from the orbital speed and the photon's
 * direction, no gravitational redshift, no radiative transfer, no colour.
 *
 * k0 = (distance, inclination°, camera orbit, disk outer radius), k1 = (disk brightness, background,
 * exposure, disk rotation). Bounds: BH_STEPS integration steps per ray.
 */
export const LENTE_GLSL = `
#define BH_STEPS 96
vec2 BH_f(vec2 s){ return vec2(s.y, -s.x + 1.5 * s.x * s.x); }
float BH_bg(vec3 d, float mode){
  float v = 0.;
  if (mode < .5 || mode > 1.5){
    vec3 q = d * 34., c = floor(q);
    float h = hash13(c);
    vec3 o = vec3(hash13(c + 17.31), hash13(c + 41.7), hash13(c + 73.1)) * .6 + .2;
    v = smoothstep(.45, 0., length(q - c - o)) * step(.9, h) * (.45 + 5.5 * (h - .9)) + .015 + .04 * noise3(d * 3.);
  }
  if (mode > .5){
    float lon = atan(d.z, d.x), lat = asin(clamp(d.y, -1., 1.)), st = PI / 12.;
    float gl = abs(fract(lon / st + .5) - .5) * st * cos(lat), gb = abs(fract(lat / st + .5) - .5) * st;
    v = max(v, .75 * (1. - smoothstep(.006, .014, min(gl, gb))));
  }
  return v;
}
float F_lente_gravitacional(vec2 p, float t, vec4 k0, vec4 k1){
  float D = k0.x, inc = k0.y * PI / 180., az = t * k0.z * TAU / 60., rout = k0.w;
  vec3 C = D * vec3(cos(inc) * sin(az), sin(inc), cos(inc) * cos(az));
  vec3 fw = -C / D, rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.1 * fw);
  // the ray's plane: e1 radial at the camera, e2 along the ray's sideways part
  vec3 e1 = C / D;
  float cp = dot(rd, e1);
  vec3 e2 = rd - cp * e1;
  float sp = length(e2);
  e2 = sp > 1e-6 ? e2 / sp : up;
  sp = max(sp, 1e-4);
  float u = 1. / D, w = -u * sqrt(1. - u) * cp / sp;
  // crossings of the disk plane y = 0: phi = pc + k pi, pc in (0, pi]
  float pc = atan(-e1.y, e2.y);
  if (pc <= 0.) pc += PI;
  float phi = 0., T = 1., col = 0., fate = 0., phiE = 0.;
  for (int i = 0; i < BH_STEPS; i++){
    float h = .02 + .16 * sat(1. - 1.4 * u);
    vec2 s = vec2(u, w);
    vec2 a1 = BH_f(s), a2 = BH_f(s + .5 * h * a1), a3 = BH_f(s + .5 * h * a2), a4 = BH_f(s + h * a3);
    vec2 sn = s + h / 6. * (a1 + 2. * a2 + 2. * a3 + a4);
    if (pc <= phi + h){
      float x = (pc - phi) / h, x2 = x * x, x3 = x2 * x;
      float uc = (2. * x3 - 3. * x2 + 1.) * s.x + (x3 - 2. * x2 + x) * h * s.y + (3. * x2 - 2. * x3) * sn.x + (x3 - x2) * h * sn.y;
      float wc = mix(s.y, sn.y, x);
      float r = uc > 1e-6 ? 1. / uc : 1e6;
      if (r > 3. && r < rout && k1.x > 0. && T > .01){
        vec3 er = cos(pc) * e1 + sin(pc) * e2, P = r * er;
        float th = atan(P.z, P.x), om = sqrt(.5 / (r * r * r));
        float tha = th - k1.w * t * 5.8 * om;
        float q = 3. / r, I = 14. * q * q * q * (1. - sqrt(q));
        float tex = .4 + .6 * noise3(vec3(cos(tha) * 2.2, sin(tha) * 2.2, log(r) * 7.));
        // Doppler beaming (artistic): orbital speed from a static observer, photon toward the camera
        float v = sqrt(.5 / (r - 1.));
        vec3 tg = (-wc / (uc * uc)) * er + r * (-sin(pc) * e1 + cos(pc) * e2);
        float g = sqrt(1. - v * v) / (1. - v * dot(vec3(-sin(th), 0., cos(th)), -normalize(tg)));
        float al = sat(k1.x * 1.5);
        col += T * al * k1.x * I * tex * min(g * g, 5.);
        T *= 1. - al;
      }
      pc += PI;
    }
    phi += h; u = sn.x; w = sn.y;
    if (u >= 1.){ fate = 2.; break; }
    if (u <= 0.){ phiE = phi - h + h * s.x / (s.x - u); fate = 1.; break; }
  }
  float bg = fate > .5 && fate < 1.5 ? BH_bg(cos(phiE) * e1 + sin(phiE) * e2, k1.y) : 0.;
  return sat(1. - exp(-(col + T * bg) * k1.z * 1.6));
}`;
