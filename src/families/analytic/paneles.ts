/**
 * «Paneles prismáticos» (V-04): translucent sheets hinged on one horizontal axis, turning around it like the
 * blades of a paddle wheel (a second set can turn the other way). The camera looks along +z from the origin;
 * the axis is the line y = 0, z = z0. A panel at angle α holds the points (s, r·sin α, z0 + r·cos α), r in
 * [0, length], |s| < width. The ray through a cell, (x, y, f)·λ, meets its plane at λ = z0·sin α / (f·sin α −
 * y·cos α) (and r = z0·y / (f·sin α − y·cos α)); each panel the ray crosses inside its rectangle is a layer
 * with its depth, its colour (the piece's palette by panel, shading toward the next colour along the panel)
 * and its alpha. The layers are sorted far to near and composed with «over», so overlaps mix their colours as
 * glass would. Edges are one cell wide at any depth (PX scaled by the depth) and catch the light.
 *
 * Time: each set turns a whole number of times per minute and the axis sways once a minute, so the piece is
 * exactly periodic with a period of 60 s (state, colour and camera).
 *
 * k0 = (panels per set, turns per minute, opacity, length), k1 = (sets, tilt, edges, width). Written from
 * the geometry above (ray–plane intersection, back-to-front alpha compositing), not from any shader's code.
 */
export const PANELES_GLSL = /* glsl */ `
#define PN_MAX 20
vec4 FC_paneles(vec2 p, float t, vec4 k0, vec4 k1){
  float N = clamp(floor(k0.x + .5), 2., 10.), turns = floor(k0.y + .5), op = k0.z, len = k0.w;
  float sets = k1.x < .5 ? 1. : 2., wid = k1.w;
  float nP = max(uPalN, 1.);
  // the axis: tilted on screen, swaying once a minute
  float ph = TAU * t / 60.;
  vec2 q = rot2(p, k1.y * 1.5708);
  const float F = 1.7, Z0 = 3.4;
  // the axis is turned in depth (yaw, swaying once a minute) and seen a little from above (pitch): the ray
  // in the axis frame, o + lam * d
  float yw = .55 + .12 * sin(ph), pt = .28;
  float cy = cos(yw), sy = sin(yw), cp = cos(pt), sp = sin(pt);
  vec3 d = vec3(q, F);
  d = vec3(cy * d.x - sy * d.z, d.y, sy * d.x + cy * d.z);
  d = vec3(d.x, cp * d.y - sp * d.z, sp * d.y + cp * d.z);
  vec3 o = vec3(-sy * -Z0, 0., cy * -Z0);
  o = vec3(o.x, cp * o.y - sp * o.z, sp * o.y + cp * o.z);
  float zs[PN_MAX]; vec3 cs[PN_MAX]; float as_[PN_MAX]; float gs[PN_MAX];
  int nh = 0;
  for (int s = 0; s < 2; s++){
    if (float(s) >= sets) break;
    float dir = s == 0 ? 1. : -1.;
    for (int i = 0; i < 10; i++){
      if (float(i) >= N) break;
      float a = dir * turns * ph + TAU * (float(i) + .5 * float(s)) / N + .3 * float(s);
      float sa = sin(a), ca = cos(a);
      // the panel's plane holds the axis (x) and (0, sin a, cos a)
      float den = d.y * ca - d.z * sa;
      if (abs(den) < 1e-4) continue;
      float lam = -(o.y * ca - o.z * sa) / den;
      vec3 P = o + lam * d;
      float r = P.y * sa + P.z * ca;
      if (lam <= 0. || r < 0. || r > len) continue;
      float z = lam * F, sx = P.x;
      // one cell, in world units at this depth
      float cw = PX * z / F;
      float wsx = 1. - smoothstep(wid - cw, wid, abs(sx));
      float wr = 1. - smoothstep(len - cw, len, r);
      if (wsx * wr <= 0.) continue;
      // fades: near the axis (the blades meet there) and close to the eye
      float fade = smoothstep(0., .25, r) * smoothstep(.55, 1.1, z);
      float rim = k1.z * max(1. - smoothstep(cw * .6, cw * 1.6, len - r), 1. - smoothstep(cw * .6, cw * 1.6, wid - abs(sx)));
      float j = mod(float(i) + float(s) * 2., max(nP - 1., 1.)) + (nP > 1.5 ? 1. : 0.);
      vec3 c0 = uPal[int(j)], c1 = uPal[int(mod(j, max(nP - 1., 1.)) + (nP > 1.5 ? 1. : 0.))];
      vec3 c = mix(c0, c1, smoothstep(.1, 1., r / len) * .4);
      // depth: farther layers are dimmer
      float dim = mix(1., .4, smoothstep(Z0 - 1.2, Z0 + 1.2, z));
      c = mix(c * dim, vec3(1.), rim * .6);
      // ribs across the panel (they crowd together with distance) and more ink toward its tip
      float rib = .5 + .5 * cos(r / len * TAU * 5.);
      float g = (.45 + .45 * r / len) * (.4 + .6 * dim) * (1. - .35 * k1.z * rib) + rim;
      zs[nh] = z; cs[nh] = c; as_[nh] = sat(fade * wsx * wr * (op + rim * (1. - op))); gs[nh] = sat(g);
      nh++;
    }
  }
  // far to near (insertion sort), then «over»
  for (int i = 1; i < PN_MAX; i++){
    if (i >= nh) break;
    float z = zs[i]; vec3 c = cs[i]; float a = as_[i], g = gs[i];
    int j = i - 1;
    for (int k = 0; k < PN_MAX; k++){
      if (j < 0 || zs[j] >= z) break;
      zs[j + 1] = zs[j]; cs[j + 1] = cs[j]; as_[j + 1] = as_[j]; gs[j + 1] = gs[j];
      j--;
    }
    zs[j + 1] = z; cs[j + 1] = c; as_[j + 1] = a; gs[j + 1] = g;
  }
  vec3 col = uPal[0];
  float ink = 0.;
  for (int i = 0; i < PN_MAX; i++){
    if (i >= nh) break;
    col = mix(col, cs[i], as_[i]);
    ink = mix(ink, gs[i], as_[i]);
  }
  return vec4(col, sat(ink));
}
`;
