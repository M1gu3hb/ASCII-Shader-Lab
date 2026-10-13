/**
 * «Burbujas con nucleación» (I-02, inventario PR #10): bubbles born at a few fixed nucleation points on the
 * bottom (5–8), each point releasing them at its own rhythm. A bubble rises with an accelerating speed
 * (y = y₀ + v·a + ½·α·a², larger bubbles faster), grows as it goes up (the gas it gathers, the pressure it
 * loses), sways from side to side (a sine whose amplitude grows with its size) and leaves a short trail that
 * follows its own path. At the surface it bursts: a flash, a ripple that runs along the surface both ways and
 * three droplets thrown up that fall back. Each bubble is drawn by its size: one glyph for a small one (dim
 * ∘ to bright ◎ with a geometric set), a rim with a highlight for a large one. The liquid glows faintly, the
 * nucleation points glint, and a foam line marks the surface.
 *
 * Every bubble is a pure function of time: the k-th bubble of point i was born at (k − φᵢ)/rᵢ, so a cell
 * only walks the bubbles in flight of the points within reach of its column. Written from the published
 * description of the effect (and the physics of rising bubbles), not from any shader's code.
 *
 * k0 = (points, bubbles per second, rise, sway), k1 = (size, size spread, trail, surface),
 * K2 = (burst, foam, liquid, layout).
 */
export const BURBUJAS_GLSL = /* glsl */ `
float F_burbujas(vec2 p, float t, vec4 k0, vec4 k1){
  float n = clamp(floor(k0.x + .5), 5., 8.);
  float wob = k0.w, Rm = mix(.01, .045, k1.x), spread = k1.y, trail = k1.z;
  float ys = mix(.18, .47, k1.w), y0 = -.47, Dy = ys - y0;
  float bu = K2.x, foam = K2.y, liq = K2.z, lay = floor(K2.w + .5);
  float vb = mix(.1, .34, k0.z), D = .3 + .3 * bu;
  // the slowest bubble's whole life (rise and burst): the oldest one a point can still have in flight
  float vmin = vb * .7 * .55;
  float aMax = (sqrt(1. + 2.4 * Dy / vmin) - 1.) / 1.2 + .6;
  float v = 0.;
  // the liquid: a faint glow, lighter towards the surface, with a slow shimmer
  if (p.y < ys) v = liq * (.1 + .14 * smoothstep(-.5, ys, p.y) + .14 * gnoise(p * vec2(3., 6.) + vec2(0., -t * .15)));
  // the surface: a meniscus line and a band of foam (small bubbles that drift and pop)
  float fz = p.y - ys, fw = .004 + .075 * foam * foam;
  if (fz > -.3 * fw - PX && fz < fw + PX){
    float line = exp(-fz * fz / (PX * PX * .45));
    float band = smoothstep(-.3 * fw - PX * .5, -.3 * fw + PX * .5, fz) * (1. - smoothstep(fw - PX * .5, fw + PX * .5, fz));
    float dots = smoothstep(.5, .72, gnoise(vec2(p.x * 52. + t * .12, p.y * 70. + 3.1 * sin(p.x * 9. + t * .4))));
    v = max(v, (.15 + .85 * foam) * max(line * .5, band * (.18 + .62 * dots)));
  }
  float W = 1.62;
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    if (fi >= n) break;
    float xi = (-.5 + (fi + .5) / n) * W + (hash11(fi * 7.31 + lay * 13.7 + 1.3) - .5) * W / n * .6;
    float dxs = p.x - xi;
    if (abs(dxs) > .1) continue;
    // the nucleation point: a glint on the bottom that never moves, and above it a thread of bubbles too small
    // to draw one by one (a fine sparkle that runs up the column)
    v = max(v, .5 * exp(-(dxs * dxs + (p.y - y0) * (p.y - y0)) / (PX * PX * .5)));
    if (p.y > y0 && p.y < ys){
      float th = exp(-dxs * dxs / (PX * PX * .3)) * smoothstep(.45, .75, gnoise(vec2(fi * 7.7 + dxs * 9., p.y * 38. - t * 5.)));
      v = max(v, liq * .7 * th);
    }
    float ri = k0.y * (.65 + .7 * hash11(fi * 3.17 + lay * 5.1 + 7.7));
    ri = min(ri, 23. / aMax);
    float ph = hash11(fi * 1.91 + lay * 2.3 + 3.3);
    float jn = floor(t * ri + ph);
    for (int k = 0; k < 24; k++){
      float jj = jn - float(k);
      float a = t - (jj - ph) / ri;
      if (a > aMax) break;
      float h1 = hash12(vec2(jj, fi + lay * 9.)), h2 = hash12(vec2(jj + 31.7, fi * 1.7 + 3.)), h3 = hash12(vec2(fi + 11.1, jj * .37 + 5.));
      float sz = mix(.75, h1, spread);
      float r0 = Rm * (.35 + .65 * sz);
      float vy = vb * (.7 + .6 * h2) * (.55 + .45 * sz), acc = 1.2 * vy;
      float ts = (sqrt(vy * vy + 2. * acc * Dy) - vy) / acc;
      if (a > ts + D) continue;
      float ac = min(a, ts);
      float y = y0 + vy * ac + .5 * acc * ac * ac;
      float r = r0 * (1. + .9 * (y - y0) / Dy);
      float om = 5. + 4. * h3, amp = wob * (.004 + .6 * r);
      float x = xi + amp * sin(ac * om + h3 * TAU) * smoothstep(0., .4, ac);
      vec2 d = p - vec2(x, y);
      float dl = length(d);
      if (a < ts){
        // rising: one glyph by its size when small, a rim and a highlight when large
        float re = max(r, .55 * PX);
        float I = clamp(.42 + .58 * r / (Rm * 1.6), 0., 1.);
        float body = 1. - smoothstep(re - .3 * PX, re + .5 * PX, dl);
        float rw = (dl - re) / (.45 * PX + .15 * re);
        float ring = exp(-rw * rw);
        float hollow = smoothstep(1.1 * PX, 2.2 * PX, re);
        float b = I * max(body * (1. - .65 * hollow), ring * hollow);
        vec2 hd = d + vec2(.4, -.4) * re;
        b = max(b, hollow * .9 * exp(-dot(hd, hd) / (PX * PX * .3)));
        // the trail: a short streak under it, along the path it just came by
        float sp = vy + acc * ac, L = trail * min(.14, .5 * sp);
        float u = (y - re - p.y) / max(L, 1e-4);
        if (L > 0. && u > 0. && u < 1. && dl > re){
          float tau = (u * L + re) / sp;
          float xt = xi + amp * sin((ac - tau) * om + h3 * TAU) * smoothstep(0., .4, ac - tau);
          float tx = (p.x - xt) / (.45 * PX);
          b = max(b, trail * .55 * I * (1. - u) * (1. - u) * exp(-tx * tx));
        }
        v = max(v, b);
      } else {
        // the burst at the surface: a flash, a ripple both ways along it, three droplets thrown up
        float bb = (a - ts) / D;
        vec2 c = vec2(x, ys);
        vec2 e = p - c;
        float fR = r + 1.5 * PX, fq = max(0., 1. - dot(e, e) / (fR * fR));
        float fl = (1. - smoothstep(0., .25, bb)) * fq * fq;
        float rx = abs(e.x) - (r + bb * (.015 + .06 * bu));
        float rip = (1. - bb) * (.35 + .65 * bu) * exp(-(rx * rx + e.y * e.y * 2.) / (PX * PX * .4));
        float dr = 0.;
        for (int m = 0; m < 3; m++){
          float fm = float(m);
          float th = (fm - 1.) * (.45 + .35 * hash12(vec2(jj, fm + fi * 3.))) + (h2 - .5) * .3;
          float s = .1 + .22 * bu * (.6 + .4 * hash12(vec2(fm + 7., jj + fi)));
          float tt = bb * D;
          vec2 q = c + vec2(sin(th), cos(th)) * s * tt - vec2(0., .9 * tt * tt);
          vec2 g = p - q;
          // a droplet that falls back into the liquid is gone
          dr = max(dr, exp(-dot(g, g) / (PX * PX * .35)) * smoothstep(-.01, .005, q.y - ys));
        }
        v = max(v, max(fl * (.35 + .6 * bu), max(rip, dr * bu * (1. - bb) * .9)));
      }
    }
  }
  return clamp(v, 0., 1.);
}
`;
