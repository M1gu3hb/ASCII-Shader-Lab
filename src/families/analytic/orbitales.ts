/**
 * Orbitales y superposiciones (analytic): hydrogen eigenstates ψ_nlm = R_nl(r) · Y_lm(θ, φ) in atomic units
 * (Bohr radii), n ≤ 4, real spherical harmonics up to l = 3. R_nl = N ρ^l e^(−ρ/2) L^(2l+1)_(n−l−1)(ρ) with
 * ρ = 2r/n, the associated Laguerre polynomial by its three-term recurrence and
 * N = sqrt((2/n)³ (n−l−1)! / (2n (n+l)!)). Two states superposed, cos(α) ψ_A e^(−iE_A t) + sin(α) ψ_B
 * e^(−iE_B t) with E_n = −1/(2n²): the density carries 2 cos α sin α ψ_A ψ_B cos(ΔE t), so it sloshes at
 * ω = ΔE/ħ (degenerate states, same n, do not beat: they make a still hybrid).
 *
 * Drawn in a sphere of radius 1 (s Bohr radii, fitted to the larger state) seen from an orbiting camera:
 * 'densidad' integrates the density along the ray (a probability cloud), 'isosuperficie' finds the surface
 * |Ψ|² = level (bisection, gradient normal, diffuse light), 'fase' the same surface toned by the sign of
 * Re Ψ. Densities are taken per unit of the drawing's volume (s³ |Ψ|²), so levels mean the same at any n.
 *
 * k0 = (state A, state B, mix, phase speed), k1 = (mode, level, camera turn, exposure).
 * Bounds: OR_STEPS samples per ray, 5 bisections, 6 samples for the normal; Laguerre degree ≤ 3.
 */
export const ORBITALES_GLSL = `
#define OR_STEPS 64
// states: (n, l, harmonic): 1s 2s 2pz 2px 3s 3pz 3dz2 3dxy 3dxz 4s 4pz 4dz2 4fz3 4fxyz 4fx(x2-3y2)
const vec3 OR_S[15] = vec3[15](vec3(1., 0., 0.), vec3(2., 0., 0.), vec3(2., 1., 1.), vec3(2., 1., 2.), vec3(3., 0., 0.),
  vec3(3., 1., 1.), vec3(3., 2., 3.), vec3(3., 2., 4.), vec3(3., 2., 5.), vec3(4., 0., 0.), vec3(4., 1., 1.),
  vec3(4., 2., 3.), vec3(4., 3., 6.), vec3(4., 3., 7.), vec3(4., 3., 8.));
float OR_fact(float n){ float f = 1.; for (int i = 2; i <= 7; i++){ if (float(i) > n) break; f *= float(i); } return f; }
float OR_norm(vec3 s){ float n = s.x, l = s.y; return sqrt(8. / (n * n * n) * OR_fact(n - l - 1.) / (2. * n * OR_fact(n + l))); }
float OR_R(float r, vec3 s, float N){
  float n = s.x, l = s.y, rho = 2. * r / n, a = 2. * l + 1.;
  float k = n - l - 1.;
  // associated Laguerre L^(a)_k(rho): L0 = 1, L1 = 1 + a - rho, then the recurrence
  float L0 = 1., L1 = 1. + a - rho;
  for (int j = 1; j < 3; j++){
    if (float(j) >= k) break;
    float L2 = ((2. * float(j) + 1. + a - rho) * L1 - (float(j) + a) * L0) / float(j + 1);
    L0 = L1; L1 = L2;
  }
  float Lk = k < .5 ? 1. : L1;
  float pw = 1.;
  for (int j = 0; j < 3; j++) if (float(j) < l) pw *= rho;
  return N * pw * exp(-.5 * rho) * Lk;
}
float OR_Y(vec3 u, float h){
  if (h < .5) return .28209479;
  if (h < 1.5) return .48860251 * u.z;
  if (h < 2.5) return .48860251 * u.x;
  if (h < 3.5) return .31539157 * (3. * u.z * u.z - 1.);
  if (h < 4.5) return 1.09254843 * u.x * u.y;
  if (h < 5.5) return 1.09254843 * u.x * u.z;
  if (h < 6.5) return .37317633 * u.z * (5. * u.z * u.z - 3.);
  if (h < 7.5) return 2.89061144 * u.x * u.y * u.z;
  return .59004359 * u.x * (u.x * u.x - 3. * u.y * u.y);
}
float OR_psi(vec3 x, vec3 s, float N){
  float r = length(x);
  vec3 u = r > 1e-6 ? x / r : vec3(0., 0., 1.);
  return OR_R(r, s, N) * OR_Y(u, s.z);
}
// c = (cos α, sin α, Bohr radii per unit, cos of the relative phase): density per unit of the drawing's
// volume, and Re Ψ (relative to A's phase) in .y
vec2 OR_rho(vec3 x, vec3 sA, vec3 sB, float NA, float NB, vec4 c){
  float a = OR_psi(x * c.z, sA, NA), b = OR_psi(x * c.z, sB, NB);
  float s3 = c.z * c.z * c.z;
  return vec2(s3 * (c.x * c.x * a * a + c.y * c.y * b * b + 2. * c.x * c.y * a * b * c.w), c.x * a + c.y * b * c.w);
}
float F_orbitales(vec2 p, float t, vec4 k0, vec4 k1){
  vec3 sA = OR_S[int(clamp(floor(k0.x + .5), 0., 14.))], sB = OR_S[int(clamp(floor(k0.y + .5), 0., 14.))];
  float NA = OR_norm(sA), NB = OR_norm(sB);
  float al = k0.z * PI * .5, nm = max(sA.x, sB.x);
  // relative phase: (E_B - E_A) t, E_n = -1/(2 n^2) hartree
  float ph = (.5 / (sA.x * sA.x) - .5 / (sB.x * sB.x)) * t * k0.w * 4.;
  vec4 c = vec4(cos(al), sin(al), 2. * nm * nm + 2., cos(ph));
  float a = t * k1.z * TAU / 60., e = .35;
  vec3 ro = 2.8 * vec3(cos(a) * cos(e), sin(a) * cos(e), sin(e));
  vec3 fw = -ro / 2.8, rt = normalize(cross(fw, vec3(0., 0., 1.))), up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.25 * fw);
  float b = dot(ro, rd), disc = b * b - dot(ro, ro) + 1.;
  if (disc <= 0.) return 0.;
  float sq = sqrt(disc), t0 = -b - sq, t1 = -b + sq, dt = (t1 - t0) / float(OR_STEPS);
  float lev = .02 * pow(200., k1.y);
  if (k1.x < .5){
    // probability along the ray, softly cut below the level
    float I = 0.;
    for (int i = 0; i < OR_STEPS; i++){
      float d = OR_rho(ro + rd * (t0 + dt * (float(i) + .5)), sA, sB, NA, NB, c).x;
      I += d * smoothstep(lev * .05, lev * .5, d) * dt;
    }
    return sat(1. - exp(-I * k1.w * .8));
  }
  float tp = t0, tt = -1.;
  for (int i = 0; i < OR_STEPS; i++){
    float ti = t0 + dt * (float(i) + .5);
    if (OR_rho(ro + rd * ti, sA, sB, NA, NB, c).x > lev){ tt = ti; break; }
    tp = ti;
  }
  if (tt < 0.) return 0.;
  for (int j = 0; j < 5; j++){
    float tm = .5 * (tp + tt);
    if (OR_rho(ro + rd * tm, sA, sB, NA, NB, c).x > lev) tt = tm; else tp = tm;
  }
  vec3 x = ro + rd * tt;
  vec2 h = vec2(.01, 0.);
  vec3 g = vec3(OR_rho(x + h.xyy, sA, sB, NA, NB, c).x - OR_rho(x - h.xyy, sA, sB, NA, NB, c).x,
    OR_rho(x + h.yxy, sA, sB, NA, NB, c).x - OR_rho(x - h.yxy, sA, sB, NA, NB, c).x,
    OR_rho(x + h.yyx, sA, sB, NA, NB, c).x - OR_rho(x - h.yyx, sA, sB, NA, NB, c).x);
  vec3 n = -g / max(length(g), 1e-9);
  vec3 ld = normalize(-fw + .6 * up - .5 * rt);
  float sh = .18 + .82 * max(dot(n, ld), 0.);
  if (k1.x > 1.5 && OR_rho(x, sA, sB, NA, NB, c).y < 0.) sh *= .42;
  return sat(sh * (.45 + .55 * k1.w));
}`;
