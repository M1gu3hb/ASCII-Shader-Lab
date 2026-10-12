/**
 * «Talla de diamante» (I-09, inventario PR #10): a cut stone seen from above, turning under a fixed light.
 * Its crown is a grid of rings × sectors (table, star facets, kites, upper girdle facets; each ring offset by
 * half a sector from the next and each cell split into an inner triangle and the two outer halves), so every
 * facet has a centre angle and a tilt (steeper towards the girdle): its normal in 3D. Each facet reflects the
 * light by Blinn's half vector (sharper with «Brillo») and returns a spectral colour of its own — the fire:
 * the hue depends on how far its normal is from the perfect reflection, so as the stone turns the colours run
 * across the facets. Each facet also twinkles (a sharp flash at a whole number of times per cycle), some
 * glints throw a star of rays, the table shows the arrows of the pavilion through it, dark lines mark the
 * facets' edges, and rainbow caustics fan out around the stone.
 * Everything is a function of the cut's angle and of whole multiples of the cycle: the stone comes back
 * exactly after «Ciclo» seconds (a loop). Written from the geometry of the brilliant cut, not from any
 * shader's code.
 *
 * k0 = (cut, size, facets, cycle s), k1 = (turns, fire, sparkle, star), K2 = (sharpness, edges, caustics, light).
 */
export const DIAMANTE_GLSL = /* glsl */ `
vec3 dia_spec(float h){ return clamp(abs(fract(h + vec3(0., 2. / 3., 1. / 3.)) * 6. - 3.) - 1., 0., 1.); }
vec4 FC_talla_diamante(vec2 p, float t, vec4 k0, vec4 k1){
  float cut = floor(k0.x + .5);
  float Rg = mix(.26, .45, k0.y), fm = clamp(floor(k0.z + .5), 1., 3.);
  float P = max(k0.w, 1.), u = t / P;
  float rot = TAU * u * floor(k1.x + .5) * (cut > 1.5 ? -1. : 1.);
  float fire = k1.y, spk = k1.z, star = k1.w;
  float shp = mix(6., 60., K2.x), edg = K2.y, cau = K2.z, La = K2.w * TAU;
  float r = length(p), th = atan(p.y, p.x);
  float a = th - rot;
  // the girdle's outline: round (brilliant), square (princess) or hexagonal (rose)
  float N = cut < .5 ? 0. : cut < 1.5 ? 4. : 6.;
  float sh = N > 0. ? cos(PI / N) / cos(mod(a + PI / N, TAU / N) - PI / N) : 1.;
  float s = r / (Rg * sh);
  float sym = cut > 1.5 ? 6. : 8.;
  // the light: from up and to one side; the viewer above
  vec3 L = normalize(vec3(cos(La), sin(La), 1.6));
  vec3 Hh = normalize(L + vec3(0., 0., 1.));
  vec3 col = vec3(0.);
  float v = 0.;
  if (s < 1.){
    // which ring: table, star facets, kites, upper girdle (rose cut: three rings of triangles, no table)
    float s0 = 0., s1 = .48, ns = 1., off = 0., tilt = 0., ri = 0.;
    if (cut > 1.5){
      if (s < .4){ s0 = 0.; s1 = .4; ns = sym * fm; off = 0.; tilt = .32; ri = 1.; }
      else if (s < .75){ s0 = .4; s1 = .75; ns = 2. * sym * fm; off = .5; tilt = .5; ri = 2.; }
      else { s0 = .75; s1 = 1.; ns = 2. * sym * fm; off = 0.; tilt = .68; ri = 3.; }
    } else {
      // the table's edge is an octagon
      float so = r * cos(PI / 8.) / cos(mod(a + PI / 8., PI / 4.) - PI / 8.) / (Rg * sh);
      if (so < .48){ s0 = 0.; s1 = .48; ns = 1.; tilt = 0.; ri = 0.; s = so; }
      else if (s < .68){ s0 = .48; s1 = .68; ns = 2. * sym * fm; off = 0.; tilt = .38; ri = 1.; }
      else if (s < .86){ s0 = .68; s1 = .86; ns = sym * fm; off = .5; tilt = .52; ri = 2.; }
      else { s0 = .86; s1 = 1.; ns = 2. * sym * fm; off = .5; tilt = .7; ri = 3.; }
    }
    float fa, cell, edge;
    float vv = clamp((s - s0) / (s1 - s0), 0., 1.);
    if (ns < 1.5){
      // the table: one flat facet that shows the pavilion's arrows through it
      fa = 0.; cell = 0.;
      edge = (1. - vv) * (s1 - s0) * Rg;
      tilt = 0.;
    } else {
      float w = TAU / ns;
      float uu = (a + PI) / w + off;
      float si0 = floor(uu);
      float fu = uu - si0;
      // the facet's index around its ring (the same facet keeps it as the stone turns)
      float si = mod(si0, ns);
      // the inner triangle (apex outwards) or one of the two outer halves
      float tri = 1. - abs(2. * fu - 1.);
      bool inner = vv < tri;
      float cu = inner ? .5 : (fu < .5 ? 0. : 1.);
      fa = (si + cu - off) * w - PI;
      cell = ri * 97. + mod(si * 2. + (inner ? 0. : (fu < .5 ? -1. : 1.)), 2. * ns);
      float dz = (s1 - s0) * Rg * sh, arc = r * w;
      edge = min(min(vv, 1. - vv) * dz, min(abs(tri - vv) * dz * .45, min(fu, 1. - fu) * arc));
    }
    // the facet's normal in the scene (it turns with the stone) and its reflection of the light
    float az = fa + rot;
    vec3 n = vec3(sin(tilt) * cos(az), sin(tilt) * sin(az), cos(tilt));
    float nh = max(dot(n, Hh), 0.);
    float spec = pow(nh, shp);
    float dif = max(dot(n, L), 0.);
    float hf = hash11(cell * 1.37 + 4.1);
    // scintillation: a sharp flash a whole number of times per cycle
    float tw = pow(.5 + .5 * sin(TAU * u * (3. + floor(hf * 9.)) + hf * 40.), 10.);
    // what the facet sees of the room around (bright and dark parts of it), which shifts as the stone turns
    float env = .5 + .5 * sin(az * 3. + tilt * 9. + ri * 1.3) * cos(az * 2. - ri);
    float b = .14 + .55 * env + .2 * dif + 1.1 * spec + spk * .9 * tw * (.3 + .7 * dif);
    if (ns < 1.5) b = .14 + .15 * dif + .45 * spec + .35 * (1. - pow(abs(cos(.5 * sym * a)), 6.));
    // the fire: a hue from how far the facet is from the perfect reflection, plus a little of its own
    float hue = fract(acos(clamp(nh, -1., 1.)) * 2.2 + ri * .17 + hf * .35 * fire + u * 2.);
    vec3 c = mix(vec3(1.), dia_spec(hue), fire * (.35 + .65 * smoothstep(.15, .9, b)));
    // dark lines on the edges between facets, the girdle bright
    float e = mix(1., .25 + .75 * smoothstep(.15 * PX, .9 * PX, edge), edg);
    v = b * e;
    col = c;
    float gl = exp(-pow((1. - s) * Rg / (.6 * PX), 2.));
    v = max(v, .75 * gl);
  }
  // rainbow caustics fanned out around the stone, turning twice as fast
  if (s >= 1. && cau > 0.){
    float ns2 = 2. * sym;
    float ray = pow(.5 + .5 * cos(ns2 * (th - 2. * rot) + 2.5 * sin(3. * th + rot)), 24.);
    float cv = cau * .9 * exp(-(r - Rg * sh) / .11) * ray;
    v = cv;
    col = dia_spec(fract(th * ns2 / TAU * .5 + r * 3.));
  }
  // star glints: five points of the crown that flash in turn and throw a star of rays
  for (int j = 0; j < 5; j++){
    float fj = float(j);
    float gh = hash11(fj * 5.7 + 2.2);
    float ga = fj * 2.39996 + gh + rot;
    vec2 gp = Rg * (.3 + .6 * fract(gh * 3.7)) * vec2(cos(ga), sin(ga));
    float on = star * pow(.5 + .5 * sin(TAU * u * (2. + fj) + gh * 30.), 14.);
    if (on < .002) continue;
    vec2 q = p - gp;
    float d = length(q);
    float w2 = .35 * PX;
    float sp = exp(-d * d / (PX * PX * 1.5)) + .9 * exp(-d * 7.) * (exp(-abs(q.x) / w2) + exp(-abs(q.y) / w2))
      + .45 * exp(-d * 12.) * (exp(-abs(q.x + q.y) * .7071 / w2) + exp(-abs(q.x - q.y) * .7071 / w2));
    float sv = on * sp;
    col = mix(col, vec3(1.), clamp(sv / max(v + sv, 1e-4), 0., 1.));
    v += sv;
  }
  float Y = dot(col, vec3(.299, .587, .114)) / max(max(col.r, max(col.g, col.b)), 1e-3);
  return vec4(col, clamp(v * (.7 + .3 * Y), 0., 1.));
}
`;
