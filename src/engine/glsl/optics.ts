/**
 * Glass in front of the piece (recipe.optics, PR #10 review: V-06 «Lluvia sobre vidrio», V-10 «Vidrio
 * acanalado»): before the grid is formed, each cell reads the source (pattern layers, picture or text) from a
 * point the glass moves it to, so drops and flutes refract whatever is behind them. Written from the
 * published descriptions of the effects (docs/cambios), stateless: a function of the point and the time, so
 * the stage, exports and both engines agree. Ported line by line to ../basic/optics.ts.
 *
 *   uOpA = (kind: 1 rain, 2 fluted; amount 0..1; scale; speed)
 *   uOpB = (angle in radians; profile: rain = density of the small drops 0..1, fluted = shape 0..4; shine; fog)
 *
 * optics(p, t) → (dx, dy) to add to the sample point (screen heights), z = light on the glass (−1..1),
 * w = how much the fogged glass dims what is behind (rain: outside the drops; 0 for fluted glass).
 */
export const GLSL_OPTICS = /* glsl */ `
uniform vec4 uOpA;
uniform vec4 uOpB;
// one drop: d = (point − centre) / radius; inside it, a lens that turns what is behind upside down
void opDrop(vec2 q, vec2 c, float r, inout vec4 o, inout float best){
  vec2 d = (q - c) / vec2(r, r * 1.2);
  float k = dot(d, d);
  if (k >= 1.) return;
  float z = sqrt(1. - k);
  if (z <= best) return;
  best = z;
  float rim = smoothstep(.55, 1., sqrt(k));
  o.xy = -d * r * (1.6 + 1.4 * z);
  o.z = rim * dot(normalize(d + 1e-4), vec2(-.55, .84)) + .25 * z;
  o.w = 0.;
}
vec4 opRain(vec2 p, float t){
  float S = uOpA.z, sp = uOpA.w;
  vec2 q = rot2(p, uOpB.x);
  vec4 o = vec4(0., 0., 0., 1.);
  float best = 0.;
  // drops that slide down the glass, one per column, stopping and going, with a trail of droplets behind
  float cw = .17 * S, top = .66, span = 1.32;
  float col = floor(q.x / cw);
  for (int j = -1; j <= 1; j++){
    float cj = col + float(j);
    float h1 = hash12(vec2(cj, 7.31)), h2 = hash12(vec2(cj, 1.93)), h3 = hash12(vec2(cj, 5.17)), h4 = hash12(vec2(cj, 3.71));
    float per = 3. + 5. * h1;
    float ph = fract(t * sp / per + h3);
    float g = ph + .03 * sin(TAU * ph * 5.);
    float r = (.038 + .03 * h4) * S;
    vec2 c = vec2((cj + .5 + (h2 - .5) * .5) * cw, top - span * g);
    opDrop(q, c, r, o, best);
    // the trail: droplets left at fixed heights of the column, drying in about two seconds
    float tsp = .055 * S;
    float k0 = floor((top - q.y) / tsp);
    for (int m = -1; m <= 1; m++){
      float k = k0 + float(m);
      float yk = top - (k + .5) * tsp;
      float pk = (top - yk) / span;
      float age = (ph - pk) * per / max(sp, .05);
      float hk = hash12(vec2(cj * 3.1, k));
      if (age > 0. && age < 2.4 && hk < .8){
        float rk = r * (.32 + .22 * hk) * (1. - .7 * age / 2.4);
        opDrop(q, vec2(c.x + (hk - .5) * r * .8, yk), max(rk, 1e-4), o, best);
      }
    }
  }
  // small drops that condense, stay and dry, each on its own clock
  float gs = .075 * S;
  vec2 id = floor(q / gs);
  float hp = hash12(id + 11.7);
  if (hp < uOpB.y){
    vec2 jc = (id + .25 + .5 * hash22(id + 3.3)) * gs;
    float life = (4. + 6. * hash12(id + 9.1)) / max(sp, .05);
    float ph = fract(t / life + hash12(id + 2.2));
    float rs = gs * (.16 + .2 * hash12(id + 4.4)) * smoothstep(0., .12, ph) * (1. - smoothstep(.7, 1., ph));
    if (rs > 1e-4) opDrop(q, jc, rs, o, best);
  }
  o.xy = rot2(o.xy, -uOpB.x) * uOpA.y;
  o.w *= uOpB.w;
  return o;
}
vec4 opFluted(vec2 p, float t){
  float w = .06 * uOpA.z;
  vec2 q = rot2(p, uOpB.x);
  // the glass slides slowly sideways: what each flute shows keeps changing
  float u = q.x / w + t * uOpA.w * .25;
  float x = fract(u);
  float pr = floor(uOpB.y + .5);
  float off;
  if (pr < .5) off = .9 * (.5 - x);
  else if (pr < 1.5) off = -(x - .5) * (1. - 4. * (x - .5) * (x - .5)) * 1.6;
  else if (pr < 2.5) off = sign(x - .5) * pow(abs(2. * x - 1.), 6.) * .5;
  else if (pr < 3.5) off = .35 * sin(TAU * x);
  else off = .45 * sin(TAU * (x + q.y * 1.5 + t * uOpA.w * .2));
  vec2 d = rot2(vec2(off * w * 2. * uOpA.y, 0.), -uOpB.x);
  float z = smoothstep(.9, 1., x) - .6 * smoothstep(.12, 0., x) - .25 * x * x * x;
  return vec4(d, z, 0.);
}
vec4 optics(vec2 p, float t){
  return uOpA.x < 1.5 ? opRain(p, t) : opFluted(p, t);
}
`;

/**
 * The glass solids (recipe.optics kind 'esfera' or 'poliedro'; closing of PR #10, rows I-36…I-43), written
 * from the physics (Snell's law, Schlick's Fresnel term, Beer–Lambert's tint), no code taken from elsewhere.
 * Ported line by line to ../basic/optics.ts. Units: the solid's radius, the view looking down −z, the piece
 * behind on the plane z = −2.7.
 *
 *   uOpC = (centre x, y in screen heights, radius, 0 sphere / 1 polyhedron)
 *   uOpD = (index of refraction, thickness: the z scale, dispersion, number of planes)
 *   uOpT = (tint rgb, opacity of the tinted body)        uOpN[i] = the polyhedron's planes (normal, distance)
 *
 * A ray from the cell enters the solid (refracted by the normal where it enters), crosses it, bounces inside
 * while it cannot leave (total internal reflection, up to three times), leaves refracted again and lands on
 * the piece behind: optics() returns where that is (xy, screen heights, as the other kinds), z = the light the
 * glass reflects (Fresnel on the way in, a window up and to the left, a glint where two facets meet), w = 0
 * inside; outside, w = its soft shadow on the piece (the light comes from up and to the left).
 * Besides, OPX = (1 inside the solid, the path inside it, its lit body 0.35..1, the share Fresnel reflects: what
 * gets through is darker by it) and, with a dispersion, OPD =
 * where the red and the blue rays land, relative to the green one (each channel has its own index).
 */
export const GLSL_OPTICS_SOLID = /* glsl */ `
uniform vec4 uOpA;
uniform vec4 uOpB;
uniform vec4 uOpC;
uniform vec4 uOpD;
uniform vec4 uOpT;
uniform vec4 uOpN[20];
// 1: the cell keeps its own colour (the photo, a colour family); 2: the palette's, times a factor (programs.ts)
uniform float uOpCol;
vec4 OPD;
vec4 OPX;
// what the glass reflects: a dim room, brighter above, and a bright window up and to the left
float opEnv(vec3 rf){
  vec3 L = normalize(vec3(-.48, .62, .62));
  return .3 + .45 * max(rf.y, 0.) + 12. * pow(max(dot(rf, L), 0.), 40.);
}
vec3 opSphereN(vec3 P){ return normalize(vec3(P.xy, P.z / (uOpD.y * uOpD.y))); }
// how far a ray inside the ball goes before it reaches the surface again
float opSphereExit(vec3 P, vec3 r){
  float s2 = uOpD.y * uOpD.y;
  float A = r.x * r.x + r.y * r.y + r.z * r.z / s2;
  float B = 2. * (P.x * r.x + P.y * r.y + P.z * r.z / s2);
  return max(-B / A, 0.);
}
// how far a ray inside the polyhedron goes before it reaches a face, and that face's normal
float opPolyExit(vec3 P, vec3 r, out vec3 n){
  float te = 1e4;
  n = vec3(0., 0., -1.);
  for (int i = 0; i < 20; i++){
    if (float(i) >= uOpD.w) break;
    vec4 pl = uOpN[i];
    float den = dot(pl.xyz, r);
    if (den > 1e-5){
      float tt = (pl.w - dot(pl.xyz, P)) / den;
      if (tt < te){ te = tt; n = pl.xyz; }
    }
  }
  return max(te, 0.);
}
// one ray at index eta, entering at P through a surface of normal n1: where it lands behind (xy), its path inside (z)
vec3 opTrace(vec3 P, vec3 n1, float eta){
  vec3 r = refract(vec3(0., 0., -1.), n1, 1. / eta);
  float path = 0.;
  for (int k = 0; k < 3; k++){
    vec3 n2;
    float te;
    if (uOpC.w > .5) te = opPolyExit(P, r, n2);
    else { te = opSphereExit(P, r); n2 = opSphereN(P + r * te); }
    P += r * te;
    path += te;
    vec3 o2 = refract(r, -n2, eta);
    if (dot(o2, o2) > 0.){ r = o2; break; }
    // it cannot leave here: it bounces back inside
    r = reflect(r, n2);
  }
  float rz = min(r.z, -.08);
  return vec3(P.xy + r.xy * ((-2.7 - P.z) / rz), path);
}
// outside the solid: its soft shadow on the piece behind it, down and to the right
vec4 opShadow(vec2 d){
  float rs = uOpC.w > .5 ? .85 : 1.;
  float sh = 1. - smoothstep(.6 * rs, 1.15 * rs, length(d - vec2(.42, -.5) * rs));
  return vec4(0., 0., 0., sh * .7 * uOpB.z);
}
vec4 opSolid(vec2 p){
  OPD = vec4(0.);
  OPX = vec4(0.);
  float R = uOpC.z;
  vec2 d = (p - uOpC.xy) / R;
  vec3 P, n1;
  float edge = 0., rim;
  if (uOpC.w > .5){
    // the polyhedron: the ray (d, 3) going down −z enters through the face it crosses last
    vec3 o = vec3(d, 3.);
    float tin = -1e4, tin2 = -1e4, tout = 1e4;
    vec3 nin = vec3(0., 0., 1.);
    for (int i = 0; i < 20; i++){
      if (float(i) >= uOpD.w) break;
      vec4 pl = uOpN[i];
      float den = -pl.z, num = pl.w - dot(pl.xyz, o);
      if (abs(den) < 1e-5){ if (num < 0.) return opShadow(d); continue; }
      float tt = num / den;
      if (den < 0.){
        if (tt > tin){ tin2 = tin; tin = tt; nin = pl.xyz; }
        else if (tt > tin2) tin2 = tt;
      } else tout = min(tout, tt);
    }
    if (tin >= tout) return opShadow(d);
    P = vec3(d, 3. - tin);
    n1 = nin;
    // where two faces meet: a glint
    edge = 1. - smoothstep(0., .08, tin - tin2);
    // near the silhouette, where the path inside is short
    rim = 1. - smoothstep(.05, .35, tout - tin);
  } else {
    float k = dot(d, d);
    if (k >= 1.) return opShadow(d);
    P = vec3(d, uOpD.y * sqrt(1. - k));
    n1 = opSphereN(P);
    rim = smoothstep(.8, 1., sqrt(k));
  }
  float eta = uOpD.x;
  vec3 g = opTrace(P, n1, eta);
  float k = R * uOpA.y;
  if (uOpD.z > 0.){
    // dispersion: red bends less, blue more
    float dn = .06 * uOpD.z;
    vec3 rr = opTrace(P, n1, eta * (1. - dn)), bb = opTrace(P, n1, eta * (1. + dn));
    OPD = vec4((rr.xy - g.xy) * k, (bb.xy - g.xy) * k);
  }
  // Fresnel (Schlick) where the ray comes in, with what the glass reflects there
  float f0 = (eta - 1.) / (eta + 1.);
  f0 *= f0;
  float fres = f0 + (1. - f0) * pow(1. - max(n1.z, 0.), 5.);
  vec3 rf = reflect(vec3(0., 0., -1.), n1);
  // the rim: more reflected, less let through
  float refl = min(1., fres + .4 * rim);
  OPX = vec4(1., g.z, .35 + .65 * max(dot(n1, normalize(vec3(-.48, .62, .62))), 0.), refl);
  return vec4((g.xy - d) * k, refl * opEnv(rf) * 1.8 + edge * .7, 0.);
}
vec4 optics(vec2 p, float t){
  return opSolid(p);
}
`;
