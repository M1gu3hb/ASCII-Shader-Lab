import { GLSL_CORE } from './core';
import { GLSL_MEDIA, HEAD } from './programs';

/**
 * The transformation pass (see ../xform.ts): one small program for every stage, drawn over the cell grid
 * (cols × rows, row 0 at the top). uKind says what this draw does:
 *   -1 / -2   average the picture (or the big text) into one colour per cell, like the field pass does
 *   0 … 9     one transformation (the index in XFORM_KINDS), reading the previous grid (uIn)
 *   20 / 21   Estela's own passes: update the trail, keep this frame's input for the next one
 * Ported line by line to JavaScript in ../basic/xform.ts.
 */
export const XFORM_FS = HEAD + `
uniform sampler2D uIn;
uniform sampler2D uPat;
uniform sampler2D uPrevIn;
uniform sampler2D uTrail;
uniform sampler2D uText;
uniform int uKind;
uniform float uAmt, uP, uK, uTime, uTimeB, uDecay, uHave, uAspect;
uniform vec2 uGrid, uRes, uCell;
out vec4 o;
${GLSL_CORE}
${GLSL_MEDIA}
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 vivid(vec3 c){ return c / max(max(max(c.r, c.g), c.b), .05); }
vec3 I(ivec2 c){ return texelFetch(uIn, clamp(c, ivec2(0), ivec2(uGrid) - 1), 0).rgb; }
vec3 If(vec2 g){ return I(ivec2(floor(g))); }
float Li(ivec2 c){ return luma(I(c)); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 cf = vec2(c);
  if (uKind < 0){
    // the source at the centre of each cell, four taps a quarter cell apart (as buildFieldShader samples it)
    vec2 s = (cf + .5) * uCell / uRes;
    vec2 cs = uCell / uRes * .25;
    if (uKind == -1){
      vec2 m0 = clamp(s - cs, 0., 1.), m1 = clamp(s + cs, 0., 1.);
      o = vec4(((media(m0) + media(vec2(m1.x, m0.y)) + media(vec2(m0.x, m1.y)) + media(m1)) * .25).rgb, 1.);
    } else {
      float tm = (texture(uText, s + vec2(-cs.x, -cs.y)).r + texture(uText, s + vec2(cs.x, -cs.y)).r
                + texture(uText, s + vec2(-cs.x, cs.y)).r + texture(uText, s + cs).r) * .25;
      o = vec4(vec3(tm), 1.);
    }
    return;
  }
  vec3 C = I(c);
  vec3 R = C;
  if (uKind == 0){
    // semitono: a screen of dots at 45°, uK cells apart; each dot takes the colour at its centre and
    // grows with its brightness
    vec2 pos = vec2(cf.x + .5, (cf.y + .5) * uAspect);
    vec2 r = rot2(pos, .7853982) / uK;
    vec2 id = floor(r) + .5;
    vec2 cp = rot2(id * uK, -.7853982);
    vec3 dc = I(ivec2(floor(vec2(cp.x, cp.y / uAspect))));
    float rad = sqrt(luma(dc)) * .72;
    float cov = clamp((rad - length(r - id)) * uK + .5, 0., 1.);
    R = mix(C, mix(vivid(dc), vec3(1.), .35) * cov, uAmt);
  } else if (uKind == 1){
    // contorno: Sobel on the brightness, uK cells apart; edges light up in their own hue, the rest goes dark
    int k = int(uK);
    float tl = Li(c + ivec2(-k, -k)), tc = Li(c + ivec2(0, -k)), tr = Li(c + ivec2(k, -k));
    float ml = Li(c + ivec2(-k, 0)), mr = Li(c + ivec2(k, 0));
    float bl = Li(c + ivec2(-k, k)), bc = Li(c + ivec2(0, k)), br = Li(c + ivec2(k, k));
    float gx = (tr + 2. * mr + br) - (tl + 2. * ml + bl);
    float gy = (bl + 2. * bc + br) - (tl + 2. * tc + tr);
    float e = smoothstep(.1, .45, length(vec2(gx, gy)));
    R = mix(C, mix(vivid(C), vec3(1.), .2) * e + C * .1 * (1. - e), uAmt);
  } else if (uKind == 2){
    // bandas: uK inks per channel
    R = mix(C, floor(C * uK * .9999) / (uK - 1.), uAmt);
  } else if (uKind == 3){
    // arrastre: a vertical «pixel sort». Inside a run of cells brighter than the threshold (seen uK cells
    // each way at most), the run turns into a gradient from its darkest colour (top) to its brightest (bottom)
    float th = .15 + .7 * uP;
    float lc = luma(C);
    int N = int(uK);
    if (lc >= th && N > 0){
      vec3 lo = C, hi = C;
      float llo = lc, lhi = lc;
      int up = 0, dn = 0, rows = int(uGrid.y);
      for (int k = 1; k <= 48; k++){
        if (k > N || c.y - k < 0) break;
        vec3 s = I(c + ivec2(0, -k));
        float ls = luma(s);
        if (ls < th) break;
        up = k;
        if (ls < llo){ lo = s; llo = ls; }
        if (ls > lhi){ hi = s; lhi = ls; }
      }
      for (int k = 1; k <= 48; k++){
        if (k > N || c.y + k >= rows) break;
        vec3 s = I(c + ivec2(0, k));
        float ls = luma(s);
        if (ls < th) break;
        dn = k;
        if (ls < llo){ lo = s; llo = ls; }
        if (ls > lhi){ hi = s; lhi = ls; }
      }
      R = mix(lo, hi, float(up) / float(max(up + dn, 1)));
    }
  } else if (uKind == 4){
    // desplazar: the pattern's value pushes each cell along a direction
    float v = texelFetch(uPat, c, 0).r - .5;
    float a = uP * TAU;
    R = If(cf + .5 + vec2(cos(a), sin(a) / uAspect) * v * uAmt * uK);
  } else if (uKind == 5){
    // caleido: uK mirrors around the centre
    vec2 ctr = uGrid * .5;
    vec2 d = vec2(cf.x + .5 - ctr.x, (cf.y + .5 - ctr.y) * uAspect);
    float rr = length(d);
    float a = rr > 1e-4 ? atan(d.y, d.x) : 0.;
    float seg = TAU / uK;
    a = mod(a, seg);
    a = min(a, seg - a);
    vec2 q = vec2(cos(a), sin(a)) * rr;
    R = mix(C, If(vec2(q.x, q.y / uAspect) + ctr), uAmt);
  } else if (uKind == 6){
    // ondular: a flag in the wind (uK waves down the grid)
    float ox = sin((cf.y + .5) / uGrid.y * uK * PI + uTime * 2.) * uAmt * 6.;
    // (uTime and uTimeB: the same time, or with a loop each wave's own, see engine/loop.ts)
    float oy = cos((cf.x + .5) / uGrid.x * uK * .7 * PI - uTimeB * 1.6) * uAmt * 3.;
    R = If(cf + .5 + vec2(ox, oy));
  } else if (uKind == 7){
    // estela: the trail (updated just before, pass 20) lights the source up (screen)
    R = 1. - (1. - C) * (1. - clamp(texelFetch(uTrail, c, 0).rgb * uAmt, 0., 1.));
  } else if (uKind == 8){
    // canales: red and blue taken uK·amount cells to each side
    float a = uP * TAU;
    vec2 off = vec2(cos(a), sin(a) / uAspect) * uAmt * uK;
    R = vec3(If(cf + .5 + off).r, C.g, If(cf + .5 - off).b);
  } else if (uKind == 9){
    // bloques: blocks of uK cells (as tall as wide on screen) take their centre cell
    vec2 B = vec2(uK, max(1., floor(uK / uAspect + .5)));
    R = mix(C, I(ivec2(floor(cf / B) * B + floor(B * .5))), uAmt);
  } else if (uKind == 20){
    // what moved since the last frame lights the trail up; the trail fades by uDecay
    vec3 d = abs(C - texelFetch(uPrevIn, c, 0).rgb);
    R = uHave > .5 ? max(texelFetch(uTrail, c, 0).rgb * uDecay, vivid(C) * smoothstep(.04, .22, max(max(d.r, d.g), d.b))) : vec3(0.);
  }
  o = vec4(R, 1.);
}`;
