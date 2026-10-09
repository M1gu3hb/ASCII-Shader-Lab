/**
 * Fractales 3D (analytic): Mandelbulb (power-n "triplex" iteration, White/Nylander) and Mandelbox
 * (box fold + sphere fold, Lowe), rendered by sphere tracing a distance estimate from a camera that orbits
 * the origin. k0 = (form, power, iterations, cut), k1 = (orbit, distance, breathe, light). Written from the
 * published formulas; the CPU twin (fractal3d.cpu.ts) runs the same marching with a smaller budget.
 *
 * Bounds: the ray only marches inside the bounding sphere (radius 1.3, or 2.6 for the Mandelbox) and at
 * most FR_STEPS steps.
 */
export const FRACTAL3D_GLSL = `
#define FR_STEPS 96
float FR_de(vec3 pos, float form, float pw, int iters, out float trap){
  trap = 1e9;
  if (form < .5){
    vec3 z = pos; float dr = 1., r = 0.;
    for (int i = 0; i < 12; i++){
      if (i >= iters) break;
      r = length(z);
      if (r > 2.) break;
      float th = acos(clamp(z.z / max(r, 1e-6), -1., 1.)) * pw;
      float ph = atan(z.y, z.x) * pw;
      dr = pow(r, pw - 1.) * pw * dr + 1.;
      float zr = pow(r, pw);
      z = zr * vec3(sin(th) * cos(ph), sin(ph) * sin(th), cos(th)) + pos;
      trap = min(trap, dot(z, z));
    }
    return .5 * log(max(r, 1e-6)) * r / dr;
  }
  float sc = 2. + (pw - 2.) * .1;
  vec3 c = pos * 4., z = c; float dr = 1.;
  for (int i = 0; i < 12; i++){
    if (i >= iters) break;
    z = clamp(z, -1., 1.) * 2. - z;
    float r2 = dot(z, z);
    if (r2 < .25){ z *= 4.; dr *= 4.; } else if (r2 < 1.){ z /= r2; dr /= r2; }
    z = z * sc + c; dr = dr * abs(sc) + 1.;
    trap = min(trap, r2);
  }
  return length(z) / abs(dr) / 4.;
}
float FR_map(vec3 p, vec4 k0, float pw, out float trap){
  float d = FR_de(p, k0.x, pw, int(k0.z + .5), trap);
  if (k0.w > 0.) d = max(d, p.x - (1.2 - k0.w * 1.6));
  return d;
}
float F_fractal_3d(vec2 p, float t, vec4 k0, vec4 k1){
  float pw = k0.y + k1.z * 1.5 * sin(t * .4);
  float a = t * k1.x * 10. / 60. * TAU, e = .35;
  // the Mandelbox is larger (a cube of half-width 1.5 here): its camera stands further back
  float R = k0.x < .5 ? 1.3 : 2.6;
  vec3 ro = k1.y * (k0.x < .5 ? 1. : 1.75) * vec3(sin(a) * cos(e), sin(e), cos(a) * cos(e));
  vec3 fw = normalize(-ro), rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.1 * fw);
  // only inside the bounding sphere
  float b = dot(ro, rd), cc = dot(ro, ro) - R * R, disc = b * b - cc;
  if (disc < 0.) return 0.;
  float s = sqrt(disc), tt = max(0., -b - s), tf = -b + s;
  float trap = 1., d = 1., used = 0.;
  for (int i = 0; i < FR_STEPS; i++){
    d = FR_map(ro + rd * tt, k0, pw, trap);
    if (d < .0015 * tt || tt > tf) break;
    tt += d * .9;
    used += 1.;
  }
  if (tt > tf || d >= .0015 * tt) return 0.;
  vec3 pos = ro + rd * tt;
  float tr;
  vec2 h = vec2(.0015 * tt, 0.);
  vec3 n = normalize(vec3(FR_map(pos + h.xyy, k0, pw, tr) - FR_map(pos - h.xyy, k0, pw, tr),
    FR_map(pos + h.yxy, k0, pw, tr) - FR_map(pos - h.yxy, k0, pw, tr), FR_map(pos + h.yyx, k0, pw, tr) - FR_map(pos - h.yyx, k0, pw, tr)));
  vec3 ld = normalize(mix(-fw, rt, k1.w) + up * .5);
  float dif = max(0., dot(n, ld));
  // soft shadow toward the light (12 steps)
  float sh = 1., st = .01;
  for (int j = 0; j < 12; j++){
    float hh = FR_map(pos + ld * st, k0, pw, tr);
    sh = min(sh, 8. * hh / st);
    st += clamp(hh, .01, .2);
    if (sh < .02) break;
  }
  float ao = 1. - used / float(FR_STEPS);
  float col = .7 + .3 * clamp(trap, 0., 1.);
  return sat((dif * (.35 + .65 * clamp(sh, 0., 1.)) * .75 + .28 * ao) * col);
}`;
