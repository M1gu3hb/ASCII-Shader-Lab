/**
 * «Globo de constelaciones» (I-29): a sphere of points that turns, its neighbours joined by segments, and arcs
 * that fly between far points with a pulse running along them.
 *
 *  - Nodes: a latitude–longitude lattice (NL bands, 2·NL meridians) with each node displaced inside its square
 *    («Desorden») and thinned towards the poles (a node lives with a probability that follows cos latitude).
 *    Each node may be joined to its east and north neighbours («Enlaces»): the segments are chords drawn on
 *    the screen.
 *  - Each cell inside the disc is the front point of the sphere (and, dimmer, the back one): turned back into
 *    the globe's own frame (spin about its axis, then the tilt), its latitude and longitude give the lattice
 *    square, and the 3 × 3 squares around are tested: their nodes as dots and their east and north links as
 *    segments, each projected with the globe's rotation (orthographic).
 *  - Arcs: pairs of directions from hashes of the arc's index, joined by a quadratic Bézier lifted above the
 *    surface («Altura»), drawn as eight segments; a bright pulse runs along each «Pulsos» times per turn.
 *    What passes behind the globe is dimmed like the back face.
 * The globe turns once per «Vuelta» seconds: an exact loop.
 * Written from the published description of the effect, not from any shader's code.
 * Parameters: k0 = (size, bands, disorder, links), k1 = (dot, lines, arcs, arc height),
 * K2 = (turn seconds, tilt, back face, pulses per turn).
 */
export const GLOBO_PUNTOS_GLSL = /* glsl */ `
// globe frame → view: spin φ about y, then tilt τ about x
vec3 gp_view(vec3 v, float cf, float sf, float ct, float st){
  vec3 a = vec3(v.x * cf + v.z * sf, v.y, -v.x * sf + v.z * cf);
  return vec3(a.x, a.y * ct - a.z * st, a.y * st + a.z * ct);
}
vec3 gp_globe(vec3 v, float cf, float sf, float ct, float st){
  vec3 a = vec3(v.x, v.y * ct + v.z * st, -v.y * st + v.z * ct);
  return vec3(a.x * cf - a.z * sf, a.y, a.x * sf + a.z * cf);
}
// node (a, b) of the lattice: its direction in the globe's frame, and whether it lives (w)
vec4 gp_node(float a, float b, float NL, float jit){
  float NO = 2. * NL, aw = mod(a, NO);
  float dl = PI / NL, dn = TAU / NO;
  float lat = -.5 * PI + (b + .5 + (hash13(vec3(aw, b, 1.)) - .5) * jit) * dl;
  float lon = (aw + .5 + (hash13(vec3(aw, b, 2.)) - .5) * jit) * dn;
  float live = step(hash13(vec3(aw, b, 3.)), .15 + cos(-.5 * PI + (b + .5) * dl)) * step(0., b) * step(b, NL - 1.);
  return vec4(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon), live);
}
// the lattice around the sphere point n (view frame), drawn as dots and links; side 1: front, −1: back
float gp_mesh(vec2 p, vec3 n, float side, float R, vec4 k0, vec4 k1, vec4 cs){
  vec3 g = gp_globe(n, cs.x, cs.y, cs.z, cs.w);
  float NL = k0.y, NO = 2. * NL;
  float lat = asin(clamp(g.y, -1., 1.)), lon = atan(g.z, g.x);
  if (lon < 0.) lon += TAU;
  float b0 = floor((lat + .5 * PI) / (PI / NL)), a0 = floor(lon / (TAU / NO));
  float rd = max(k1.x * R * .075, .55 * PX);
  float v = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    float a = a0 + float(i), b = b0 + float(j);
    vec4 N = gp_node(a, b, NL, k0.z);
    if (N.w < .5) continue;
    vec3 P = gp_view(N.xyz, cs.x, cs.y, cs.z, cs.w);
    float wd = smoothstep(-.15, .25, P.z * side);
    vec2 sp = P.xy * R;
    v = max(v, (1. - smoothstep(.45 * rd, rd, length(p - sp))) * wd);
    float aw = mod(a, NO);
    vec4 E = gp_node(a + 1., b, NL, k0.z);
    if (E.w > .5 && hash13(vec3(aw, b, 4.)) < k0.w){
      vec3 Q = gp_view(E.xyz, cs.x, cs.y, cs.z, cs.w);
      v = max(v, k1.y * (1. - smoothstep(.35 * PX, .95 * PX, sdSeg(p, sp, Q.xy * R))) * min(wd, smoothstep(-.15, .25, Q.z * side)));
    }
    vec4 U = gp_node(a, b + 1., NL, k0.z);
    if (U.w > .5 && hash13(vec3(aw, b, 5.)) < k0.w){
      vec3 Q = gp_view(U.xyz, cs.x, cs.y, cs.z, cs.w);
      v = max(v, k1.y * (1. - smoothstep(.35 * PX, .95 * PX, sdSeg(p, sp, Q.xy * R))) * min(wd, smoothstep(-.15, .25, Q.z * side)));
    }
  }
  return v;
}
// a unit direction from two hashes
vec3 gp_dir(float k, float o){
  float z = hash12(vec2(k, o)) * 2. - 1., a = TAU * hash12(vec2(k, o + 1.));
  float r = sqrt(max(1. - z * z, 0.));
  return vec3(r * cos(a), z, r * sin(a));
}
float F_globo_puntos(vec2 p, float t, vec4 k0, vec4 k1){
  float R = k0.x, P = K2.x, ph = fract(t / P);
  float fa = TAU * ph, ta = radians(K2.y);
  vec4 cs = vec4(cos(fa), sin(fa), cos(ta), sin(ta));
  float r = length(p);
  float v = 0.;
  if (r < R){
    float z = sqrt(R * R - r * r) / R;
    v = gp_mesh(p, vec3(p / R, z), 1., R, k0, k1, cs);
    v = max(v, K2.z * gp_mesh(p, vec3(p / R, -z), -1., R, k0, k1, cs));
  }
  // the rim of the globe
  v = max(v, .38 * (1. - smoothstep(.3 * PX, 1.1 * PX, abs(r - R))));
  // arcs between far points, lifted over the surface, with a pulse running along them
  float lift = .15 + .9 * k1.w;
  if (k1.z > .5 && r < R * (1.3 + lift)){
    for (int k = 0; k < 6; k++){
      float fk = float(k);
      if (fk >= k1.z) break;
      vec3 A = gp_dir(fk, 31.), B = gp_dir(fk, 47.);
      vec3 C = normalize(A + B + 1e-3) * (1. + lift);
      float sp = fract(ph * K2.w + hash12(vec2(fk, 59.)));
      vec3 Q0 = gp_view(A, cs.x, cs.y, cs.z, cs.w);
      for (int s = 1; s <= 8; s++){
        float u = float(s) / 8.;
        vec3 Q1 = gp_view((1. - u) * (1. - u) * A + 2. * u * (1. - u) * C + u * u * B, cs.x, cs.y, cs.z, cs.w);
        vec2 a2 = Q0.xy * R, b2 = Q1.xy * R;
        vec2 pa = p - a2, ba = b2 - a2;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0., 1.);
        float d = length(pa - ba * h);
        float uu = u - (1. - h) / 8.;
        vec3 Qm = mix(Q0, Q1, h);
        float hid = (Qm.z < 0. && length(Qm.xy) < 1.) ? K2.z : 1.;
        float glow = .3 + .7 * exp(-pow((uu - sp) * 6., 2.));
        v = max(v, hid * glow * max(k1.y, .35) * (1. - smoothstep(.35 * PX, .95 * PX, d)));
        Q0 = Q1;
      }
    }
  }
  return clamp(v, 0., 1.);
}
`;
