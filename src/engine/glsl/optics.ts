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
