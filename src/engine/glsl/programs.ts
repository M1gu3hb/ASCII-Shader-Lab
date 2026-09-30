import { GLSL_BLEND, GLSL_CORE } from './core';
import { DISP_MAX } from '../touch';
import type { PatternLibrary } from './patterns';

export const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

export const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0., 1.); }`;

export type FieldSource = 'pattern' | 'media' | 'text';

/** Program cache key for the field pass. */
export function fieldKey(patterns: string[], src: FieldSource, loop: boolean): string {
  return `${src}|${loop ? 'L' : '-'}|${patterns.join(',')}`;
}

/** Media sampling with fit/zoom/pan/mirror; shared by field and compose passes. */
export const GLSL_MEDIA = `
uniform sampler2D uMedia;
uniform vec2 uMediaSize;
uniform int uFit;
uniform float uZoom;
uniform vec2 uPan;
uniform float uMirror;
vec2 mediaUV(vec2 s){
  float ca = uRes.x / uRes.y, ma = uMediaSize.x / max(uMediaSize.y, 1.);
  vec2 k = vec2(1.);
  if (uFit == 0) k = ca > ma ? vec2(1., ma / ca) : vec2(ca / ma, 1.);
  else if (uFit == 1) k = ca > ma ? vec2(ca / ma, 1.) : vec2(1., ma / ca);
  vec2 uv = (s - .5) * k / uZoom + .5 - uPan * vec2(.5, -.5);
  if (uMirror > .5) uv.x = 1. - uv.x;
  return uv;
}
vec4 media(vec2 s){
  vec2 uv = mediaUV(s);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return texture(uMedia, uv);
}
`;

export function buildFieldShader(patterns: string[], src: FieldSource, loop: boolean, lib: PatternLibrary): string {
  const used = [...new Set(patterns)];
  const chunks = used.map(id => {
    const c = lib[id];
    if (!c) throw new Error('Patrón no disponible en la librería: ' + id);
    return c;
  }).join('\n');

  const layerCode = patterns.map((id, i) => `
  {
    vec4 A = uLA[${i}], B = uLB[${i}], C = uLC[${i}];
    vec2 q = rot2(p - A.zw, A.y) * A.x;
    PX = uCellP * A.x;
    float x = P_${id}(q, t * B.w + C.y, B.x, B.y);
    x = mix(x, 1. - x, C.x);
    ${i === 0 ? 'v = x * B.z;' : 'v = blendf(v, x, int(C.z), B.z);'}
  }`).join('');

  return HEAD + `
uniform vec2 uRes;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uCellP;
uniform float uTime;
uniform float uLoop;
uniform vec4 uLA[4];
uniform vec4 uLB[4];
uniform vec4 uLC[4];
uniform float uWarp, uWarpScale, uPulse;
uniform float uMediaMix;
uniform int uMediaBlend;
uniform float uMorph;
uniform sampler2D uXGrid;
uniform int uXOn, uPatOnly;
uniform sampler2D uText;
uniform sampler2D uSim;
uniform float uSimEnc;
uniform int uIMode;
uniform vec2 uPtr;
uniform float uPtrOn, uIStr, uIRad, uPtrDown;
uniform vec3 uView;
uniform sampler2D uTouch;
uniform int uTouchDisp;
out vec4 o;
float PX;
${GLSL_CORE}
${GLSL_BLEND}
${src === 'media' ? GLSL_MEDIA : ''}
${chunks}
float stack(vec2 p, float t){
  float v = 0.;
  ${layerCode}
  return v;
}
float simH(vec2 c){
  float r = texture(uSim, (c + .5) / uGrid).r;
  return uSimEnc > .5 ? (r - .5) * 4. : r;
}
void main(){
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 px = (cell + .5) * uCell;
  vec2 p = vec2(px.x - .5 * uRes.x, .5 * uRes.y - px.y) / uRes.y;
  vec2 m = vec2(uPtr.x - .5 * uRes.x, .5 * uRes.y - uPtr.y) / uRes.y;
  vec2 dm = p - m;
  float dist = length(dm);
  float fall = uPtrOn * exp(-dist * dist / max(uIRad * uIRad, 1e-5));
  vec4 sim = texture(uSim, (cell + .5) / uGrid);
  // «Zoom con los dedos» and «Seguir» move the view (1, 0, 0 otherwise: see engine/touch.ts)
  vec2 pp = p * uView.x + uView.yz;
  if (uIMode == 3) pp = m + dm * (1. - .62 * uIStr * fall);
  else if (uIMode == 4) pp = p - normalize(dm + 1e-5) * uIStr * uIRad * .7 * fall;
  else if (uIMode == 16) pp = p + normalize(dm + 1e-5) * uIStr * uIRad * .8 * fall * (1. + .8 * uPtrDown);
  else if (uIMode == 5) pp = m + rot2(dm, uIStr * 3.2 * fall);
  else if (uIMode == 2){
    vec2 g = vec2(simH(cell + vec2(1., 0.)) - simH(cell - vec2(1., 0.)), simH(cell - vec2(0., 1.)) - simH(cell + vec2(0., 1.)));
    pp += g * .05 * uIStr;
  }
  // «Estirar»: where the grid was dragged, it shows the pattern from where the finger took it
  if (uTouchDisp == 1) pp -= (floor(texelFetch(uTouch, ivec2(cell), 0).ba * 255. + .5) - 128.) / 127. * ${DISP_MAX.toFixed(2)};
  pp *= 1. - uPulse * .06;
  vec2 q = pp;
  if (uWarp > 0.){
    vec2 wq = pp * uWarpScale * 1.2;
    q += uWarp * (vec2(fbm(wq + uTime * .15), fbm(wq + vec2(5.2, 1.3) - uTime * .15)) - .5) * 1.6;
  }
  float pv;
  ${loop ? `
  float tl = mod(uTime, uLoop);
  float w = tl / uLoop;
  // the warp drifts too: the second stack reads it as it was one loop earlier
  vec2 q2 = pp;
  if (uWarp > 0.){
    vec2 wq = pp * uWarpScale * 1.2;
    float t2 = tl - uLoop;
    q2 += uWarp * (vec2(fbm(wq + t2 * .15), fbm(wq + vec2(5.2, 1.3) - t2 * .15)) - .5) * 1.6;
  }
  pv = mix(stack(q, tl), stack(q2, tl - uLoop), w);
  pv = clamp(.5 + (pv - .5) * (1. + .41 * sin(PI * w)), 0., 1.);` : `
  pv = stack(q, uTime);`}
  // the pattern alone, for a transformation that reads it (Desplazar, see glsl/xform.ts)
  if (uPatOnly == 1){ o = vec4(pv, 0., 0., 1.); return; }
  vec3 col = vec3(1.);
  float l = pv;
  vec2 s = vec2(pp.x * uRes.y + .5 * uRes.x, .5 * uRes.y - pp.y * uRes.y) / uRes;
  vec2 cs = uCell / uRes * .25;
  ${src === 'media' ? `
  // a cell cut by the canvas edge (the last row or column) samples up to the edge, not the empty space
  // past it (that made a black band along the bottom of some exports)
  vec4 c4;
  // transformed: the cell of the last transformation's grid this cell looks at (after the pointer's distortions)
  if (uXOn == 1) c4 = texelFetch(uXGrid, clamp(ivec2(floor(s * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0);
  else {
    vec2 m0 = clamp(s - cs, 0., 1.), m1 = clamp(s + cs, 0., 1.);
    c4 = (media(m0) + media(vec2(m1.x, m0.y)) + media(vec2(m0.x, m1.y)) + media(m1)) * .25;
  }
  col = c4.rgb;
  float ml = dot(col, vec3(.299, .587, .114));
  l = uMediaMix > 0. ? blendf(ml, pv, uMediaBlend, uMediaMix) : ml;` : ''}
  ${src === 'text' ? `
  float tm = uXOn == 1
    ? dot(texelFetch(uXGrid, clamp(ivec2(floor(s * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).rgb, vec3(.299, .587, .114))
    : (texture(uText, s + vec2(-cs.x, -cs.y)).r + texture(uText, s + vec2(cs.x, -cs.y)).r
      + texture(uText, s + vec2(-cs.x, cs.y)).r + texture(uText, s + cs).r) * .25;
  l = uMediaMix > 0. ? blendf(tm, pv, uMediaBlend, uMediaMix) : tm;
  if (uMorph > 0.){
    float env = .5 - .5 * cos(TAU * uTime / uMorph);
    l = hash12(cell * 1.37) < smoothstep(.1, .9, env) ? pv : l;
  }` : ''}
  if (uIMode == 1) l += uIStr * fall * (.75 + .25 * sin(dist * 40. - uTime * 6.));
  else if (uIMode == 2) l += simH(cell) * .3 * uIStr;
  else if (uIMode == 6) l *= 1. - clamp(sim.b, 0., 1.);
  else if (uIMode == 7) l += sim.b * .85;
  l += uPulse * .22;
  o = vec4(col, clamp(l, 0., 1.));
}`;
}

export const SIM_FS = HEAD + `
uniform sampler2D uPrev;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec4 uSeg;
uniform float uBrushR, uStr, uActive, uImpulse, uEnc, uDt, uEraseRate, uPaintRate;
uniform int uMode;
out vec4 o;
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba * h); }
float dec(float v){ return uEnc > .5 ? (v - .5) * 4. : v; }
float enc(float h){ return uEnc > .5 ? h * .25 + .5 : h; }
float H(ivec2 c){ ivec2 G = ivec2(uGrid) - 1; return dec(texelFetch(uPrev, clamp(c, ivec2(0), G), 0).r); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uPrev, c, 0);
  float h = dec(s.r), hp = dec(s.g);
  float ky = (uCell.x * uCell.x) / (uCell.y * uCell.y);
  float kx = 1. / max(1., ky), kyy = ky / max(1., ky);
  float lap = kx * (H(c + ivec2(1, 0)) + H(c - ivec2(1, 0)) - 2. * h) + kyy * (H(c + ivec2(0, 1)) + H(c - ivec2(0, 1)) - 2. * h);
  float nh = (2. * h - hp + .45 * lap) * .985;
  vec2 px = (vec2(c) + .5) * uCell;
  float dd = sdSeg(px, uSeg.xy, uSeg.zw) / max(uBrushR, 1.);
  float brush = exp(-dd * dd * 2.5);
  float tr = s.b;
  if (uMode == 2) nh += brush * uStr * (uActive * .35 + uImpulse * 1.6);
  if (uMode == 6) tr = max(tr - uDt * uEraseRate, brush * uActive);
  else if (uMode == 7) tr = max(tr * exp(-uDt * uPaintRate), brush * uActive * (.4 + uStr * .8));
  else tr = 0.;
  if (uMode != 2) nh = 0.;
  o = vec4(enc(clamp(nh, -1.9, 1.9)), enc(clamp(h, -1.9, 1.9)), clamp(tr, 0., 1.), 1.);
}`;

export const SELECT_FS = HEAD + `
uniform sampler2D uField;
uniform sampler2D uGrad;
uniform sampler2D uMsg;
uniform sampler2D uWords;
uniform vec2 uGrid;
uniform float uTime;
uniform float uN, uEdgeBase, uEdge, uDither;
uniform int uDitherKind;
uniform float uBright, uContrast, uGamma, uInvert, uLevels;
uniform int uGMode;
uniform float uJitter, uWordsN;
uniform int uCMode, uMap, uIsMedia;
uniform float uShift, uCycle, uHue, uSat, uVivid, uShade, uAspect;
uniform int uMsgOn, uMsgMode;
uniform float uMsgProg, uMsgWin, uMsgShift, uMsgW;
uniform vec3 uMsgColor;
uniform float uMsgUseColor;
uniform int uMsgAnim;
uniform float uMsgSp, uMsgAmt, uMsgTime;
uniform float uLoop;
uniform vec2 uCursor;
uniform float uCursorOn, uBlockIdx;
uniform int uIMode;
uniform vec2 uPtrCell;
uniform float uPtrOn, uIStr, uIRadCells;
uniform sampler2D uTouch;
uniform int uTouchMark;
uniform float uTouchInk;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;
${GLSL_CORE}
float tone(float l){ l = (l - .5) * uContrast + .5 + uBright; l = clamp(l, 0., 1.); l = pow(l, uGamma); return mix(l, 1. - l, uInvert); }
float L(ivec2 c){ c = clamp(c, ivec2(0), ivec2(uGrid) - 1); return tone(texelFetch(uField, c, 0).a); }
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(.5 * a) * .25 + bayer2(a); }
vec3 hueShift(vec3 c, float a){ vec3 k = vec3(.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }
float tri(float x){ return 1. - abs(1. - mod(x, 2.)); }
float dec16(vec2 v){ return floor(v.x * 255. + .5) + floor(v.y * 255. + .5) * 256.; }
vec2 enc16(float i){ return vec2(mod(i, 256.), floor(i / 256.)) / 255.; }
// where a cell reads the palette at time t
float gradPos(vec2 uv, float l, float t){
  float g = l;
  if (uMap == 1) g = uv.x;
  else if (uMap == 2) g = 1. - uv.y;
  else if (uMap == 3) g = length((uv - .5) * vec2(uGrid.x / (uGrid.y * uAspect), 1.)) * 1.5;
  else if (uMap == 4) g = atan(uv.y - .5, (uv.x - .5) * uGrid.x / (uGrid.y * uAspect)) / TAU + .5;
  else if (uMap == 5) g = smoothstep(.25, .75, fbm(uv * vec2(uGrid.x / (uGrid.y * uAspect), 1.) * 2.2 + t * .03));
  return tri(g + uShift + uCycle * t);
}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 cf = vec2(c);
  vec4 f = texelFetch(uField, c, 0);
  float l = tone(f.a);
  if (uLevels > 1.5) l = floor(l * uLevels * .9999) / (uLevels - 1.);
  // the marks a gesture leaves (Rastro, Florecer, Anillos, Chispas; engine/touch.ts): R how strong, G which glyph
  float ta = 0., tg = 0.;
  // (where a mark is, it draws its own shape: its intensity takes the cell over)
  if (uTouchMark > 0){ vec4 tv = texelFetch(uTouch, c, 0); ta = tv.r; tg = tv.g; l = mix(l, ta, min(1., ta * 3.)); }
  float dth = uDitherKind == 0 ? bayer8(cf) : hash12(cf * 1.37 + 11.);
  float lq = clamp(l + (dth - .5) * uDither / max(uN - 1., 1.), 0., 1.);
  float idx = floor(lq * (uN - 1.) + .5);
  float alpha = 1.;
  float flags = 0.;
  float inten = mix(1., l, uShade);

  if (uGMode == 2){
    float h = hash12(cf * 1.31 + floor(uTime * (1. + uJitter * 14.) + hash12(cf) * 8.) * .73);
    idx = l < .06 ? 0. : floor(mix(uN * .35, uN - .01, h));
    inten = mix(inten, l, .85);
  } else if (uGMode == 3){
    float k = cf.y * uGrid.x + cf.x + floor(uTime * uJitter * 8.);
    vec4 wv = texelFetch(uWords, ivec2(int(mod(k, uWordsN)), 0), 0);
    idx = dec16(wv.rg) - 1.;
    alpha = smoothstep(.03, .14, l);
    inten = mix(inten, l, .85);
  } else if (uGMode == 1){
    idx = 0.;
  }
  if (uEdge > 0. || uGMode == 1){
    float tl = L(c + ivec2(-1, -1)), tc = L(c + ivec2(0, -1)), tr = L(c + ivec2(1, -1));
    float ml = L(c + ivec2(-1, 0)), mr = L(c + ivec2(1, 0));
    float bl = L(c + ivec2(-1, 1)), bc = L(c + ivec2(0, 1)), br = L(c + ivec2(1, 1));
    float gx = (tr + 2. * mr + br) - (tl + 2. * ml + bl);
    float gy = (tl + 2. * tc + tr) - (bl + 2. * bc + br);
    float e = uGMode == 1 ? max(uEdge, .35) : uEdge;
    if (length(vec2(gx, gy)) > mix(2.2, .12, e)){
      float an = atan(gy, gx); if (an < 0.) an += PI;
      idx = uEdgeBase + mod(floor(an / .7853982 + .5), 4.);
      alpha = 1.;
      if (uGMode == 1) inten = 1.;
    }
  }
  if (uIMode == 8){
    vec2 d = (cf - uPtrCell) * vec2(1., uAspect);
    float k = uPtrOn * exp(-dot(d, d) / max(uIRadCells * uIRadCells, 1.));
    float tt = floor(uTime * 18.);
    if (hash12(cf + tt * 1.7) < k * uIStr * 1.3){
      idx = 1. + floor(hash12(cf * .7 + tt) * max(uN - 1., 1.));
      l = max(l, .7); inten = max(inten, .9); alpha = 1.;
    }
  }
  // (uTouchMark 2: the piece's own glyphs, only brighter)
  if (uTouchMark == 1 && tg > 0. && ta > .02){ idx = max(1., floor(tg * (.35 + .65 * ta) * (uN - 1.) + .5)); alpha = 1.; }

  vec2 uv = (cf + .5) / uGrid;
  vec3 base = texture(uGrad, vec2(gradPos(uv, l, uTime), .5)).rgb;
  // with a loop, what drifts (the colour cycle, the noise map) fades from its state one loop earlier into its
  // start, as the pattern layers do (uTime is then the loop's time)
  if (uLoop > 0. && (uCycle != 0. || uMap == 5)) base = mix(base, texture(uGrad, vec2(gradPos(uv, l, uTime - uLoop), .5)).rgb, uTime / uLoop);
  if (uCMode == 1 && uIsMedia == 1){
    base = f.rgb;
    float mx = max(max(base.r, base.g), base.b);
    base = mix(base, base / max(mx, .04), uVivid);
  }
  if (uHue > 0.) base = hueShift(base, uHue * TAU);
  float gr = dot(base, vec3(.299, .587, .114));
  base = clamp(mix(vec3(gr), base, uSat), 0., 1.);
  if (ta > 0.){ base = mix(base, texture(uGrad, vec2(1., .5)).rgb, ta * uTouchInk); inten = max(inten, ta); }

  if (uMsgOn == 1){
    ivec2 mc = ivec2(int(mod(cf.x + uMsgShift, uMsgW)), c.y);
    vec4 m = texelFetch(uMsg, mc, 0);
    float mi = dec16(m.rg) - 1.;
    if (mi >= 0.){
      float ord = dec16(m.ba);
      vec3 mcol = uMsgUseColor > .5 ? uMsgColor : texture(uGrad, vec2(1., .5)).rgb;
      if (uMsgAnim == 1){
        // «Color por letra»: each letter a colour of its own (the palette's upper part, or the own colour's
        // hue turned), moving along the message
        float ph = ord * .07 - uMsgTime * uMsgSp * .35;
        vec3 lc = uMsgUseColor > .5 ? clamp(hueShift(uMsgColor, ph * TAU), 0., 1.) : texture(uGrad, vec2(.35 + .65 * tri(ph * 2.), .5)).rgb;
        mcol = mix(mcol, lc, uMsgAmt);
      }
      bool shown = (uMsgMode == 0 || uMsgMode == 3) || ord < floor(uMsgProg);
      bool scr = uMsgMode == 2 && !shown && ord < floor(uMsgProg) + uMsgWin;
      if (shown){ idx = mi; base = mcol; inten = 1.; alpha = 1.; flags = 1.; }
      else if (scr){ idx = 1. + floor(hash12(cf + floor(uTime * 24.)) * max(uN - 1., 1.)); base = mcol; inten = .85; alpha = 1.; flags = 1.; }
    }
  }
  if (uCursorOn > .5 && all(equal(c, ivec2(uCursor)))){
    idx = uBlockIdx; base = uMsgUseColor > .5 ? uMsgColor : texture(uGrad, vec2(1., .5)).rgb; inten = 1.; alpha = 1.; flags = 1.;
  }
  oC = vec4(base * inten, l);
  oG = vec4(enc16(idx), flags / 255., alpha);
}`;

export const BLUR_FS = HEAD + `
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uFromSelect;
out vec4 o;
vec3 S(ivec2 c){
  ivec2 G = textureSize(uSrc, 0) - 1;
  vec4 v = texelFetch(uSrc, clamp(c, ivec2(0), G), 0);
  return uFromSelect > .5 ? v.rgb * v.a : v.rgb;
}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 d = ivec2(uDir);
  vec3 acc = S(c) * .227027;
  acc += (S(c + d) + S(c - d)) * .1945946;
  acc += (S(c + 2 * d) + S(c - 2 * d)) * .1216216;
  acc += (S(c + 3 * d) + S(c - 3 * d)) * .054054;
  acc += (S(c + 4 * d) + S(c - 4 * d)) * .016216;
  o = vec4(acc, 1.);
}`;

export const COMPOSE_FS = HEAD + `
uniform sampler2D uC;
uniform sampler2D uG;
uniform sampler2D uAtlas;
uniform sampler2D uBloom;
uniform sampler2D uPrev;
uniform sampler2D uSimT;
uniform vec2 uRes;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uAtlasCols;
uniform vec3 uBg;
uniform vec3 uAccent;
uniform float uCellBg, uGlow, uBloomAmt, uScan, uVig, uCurve, uChroma, uGrain, uFlicker, uGridAmt, uTime, uMsgBox;
uniform float uTrans, uTransparent, uReveal, uEraseReveal, uHasMedia, uN;
uniform int uTransKind;
uniform vec2 uTransOrigin;
uniform float uTransDir, uTransSeed;
uniform float uFxTime;
uniform sampler2D uTouch;
uniform float uTouchReveal, uTouchTile;
${GLSL_MEDIA}
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// The glyph's place in the atlas in whole numbers, as the basic engine finds it (g % cols, g / cols). In floats,
// idx / cols can land just under a whole number where a GPU divides through a reciprocal (the spec allows
// 2.5 ULP): with 41, 47, 55 or 61 glyphs per atlas row, the first glyph of each later row was read past the
// end of its row, where there is no ink.
float glyphCov(float idx, ivec2 ic){
  int i = int(idx + .5), n = max(int(uAtlasCols + .5), 1);
  ivec2 ac = ivec2(i % n, i / n) * ivec2(uCell) + ic;
  return texelFetch(uAtlas, ac, 0).a;
}
// Mosaico's block size in cells at progress p: 16, 8, 4, 2, 1
float mosaicBlock(float p){ return float(16 >> min(4, int(p * 5.))); }
// Transition state of a cell of the screen grid at progress p (see engine/transitions.ts; ported to JS in
// basic/transition.ts): x = 0 the new piece, 1 the old frame, 2 a glyph of the ramp (index y) in the accent.
vec2 transCell(vec2 cell, float p){
  float N1 = max(uN - 1., 1.);
  vec2 g = uGrid;
  float u = (cell.x + .5) / g.x, v = (cell.y + .5) / g.y;
  if (uTransDir < 0.) u = 1. - u;
  if (uTransKind == 1){
    // disolución: each cell at its own moment, down the ramp from dense to empty, then the new piece
    float s = hash12(cell * 1.37 + vec2(7.1, uTransSeed)) * .7;
    float lp = (p - s) / .3;
    if (lp < 0.) return vec2(1., 0.);
    if (lp >= 1.) return vec2(0.);
    return vec2(2., floor((1. - lp) * N1 + .5));
  }
  if (uTransKind == 2){
    // lluvia: columns fall at their own pace, a trail of scrambled glyphs ahead of the new piece
    float d = hash12(vec2(cell.x * 1.7 + uTransSeed, 3.1)) * .45;
    float tail = max(3., floor(g.y * .12));
    float front = clamp((p - d) / .55, 0., 1.) * (g.y + tail);
    if (cell.y < front - tail) return vec2(0.);
    if (cell.y < front) return vec2(2., cell.y >= front - 1. ? N1 : 1. + floor(hash12(cell + floor(uTime * 24.)) * N1));
    return vec2(1., 0.);
  }
  if (uTransKind == 3){
    // iris: a ring of glyphs opens from the origin (the centre, or where the pointer was)
    vec2 o = uTransOrigin * uRes;
    float r = length((cell + .5) * uCell - o) / uCell.x;
    float maxr = length(max(o, uRes - o)) / uCell.x + 1.;
    float rad = p * (maxr + 2.5);
    if (r < rad - 2.5) return vec2(0.);
    if (r < rad) return vec2(2., 1. + floor(hash12(cell + floor(uTime * 30.)) * N1));
    return vec2(1., 0.);
  }
  if (uTransKind == 4){
    // barrido: a diagonal scan, densest glyph at its front
    float h = u * .7 + v * .3;
    float front = p * 1.14;
    if (h < front - .14) return vec2(0.);
    if (h < front) return vec2(2., floor((h - front + .14) / .14 * N1 + .5));
    return vec2(1., 0.);
  }
  if (uTransKind == 5){
    // mosaico: blocks of the new piece appear, then the blocks halve down to single cells (see main)
    vec2 blk = floor(cell / mosaicBlock(p));
    if (p < .2 && hash12(blk * 1.31 + uTransSeed) > p * 5.) return vec2(1., 0.);
    return vec2(0.);
  }
  // tejido: a scrambled weave crosses the piece
  float h = hash12(cell * 1.13 + uTransSeed) * .3 + u * .55 + v * .15;
  float prog = p * 1.3 - .15;
  if (h > prog + .07) return vec2(1., 0.);
  if (h > prog) return vec2(2., 1. + floor(hash12(cell + floor(uTime * 30.)) * N1));
  return vec2(0.);
}
vec4 shade(vec2 pt){
  ivec2 cell = ivec2(floor(pt / uCell));
  if (pt.x < 0. || pt.y < 0. || cell.x >= int(uGrid.x) || cell.y >= int(uGrid.y)) return vec4(uBg * (1. - uTransparent), 1. - uTransparent);
  vec4 c = texelFetch(uC, cell, 0);
  vec4 g = texelFetch(uG, cell, 0);
  float idx = floor(g.r * 255. + .5) + floor(g.g * 255. + .5) * 256.;
  ivec2 ic = clamp(ivec2(floor(pt)) - cell * ivec2(uCell), ivec2(0), ivec2(uCell) - 1);
  float cov = glyphCov(idx, ic) * g.a;
  float flags = floor(g.b * 255. + .5);
  vec2 lc = (vec2(ic) + .5) / uCell - .5;
  float fillA = uCellBg * c.a;
  float glowA = uGlow * c.a * exp(-dot(lc, lc) * 7.) * .55;
  vec3 ink = c.rgb;
  // «Revelar» (engine/touch.ts): the picture under the finger, or without one each cell's colour as a tile
  float tr = uTouchReveal > 0. ? texelFetch(uTouch, cell, 0).r : 0.;
  if (uHasMedia < .5) fillA = max(fillA, tr * .9);
  // a gesture's marks glow a little behind their glyphs
  if (uTouchTile > 0.) fillA = max(fillA, texelFetch(uTouch, cell, 0).r * uTouchTile);
  if (uReveal > 0. || uEraseReveal > 0. || tr > 0.){
    float r = max(uReveal, tr * uHasMedia);
    if (uEraseReveal > 0.) r = max(r, texture(uSimT, (vec2(cell) + .5) / uGrid).b * uEraseReveal);
    if (r > 0. && uHasMedia > .5){
      vec3 mcol = media(pt / uRes).rgb;
      if (uTransparent < .5) return vec4(mix(mix(mix(uBg, ink, fillA) + ink * glowA, ink, cov), mcol, r), 1.);
    }
  }
  if (uTransparent > .5){
    vec3 pc = ink * fillA; float pa = fillA;
    pc += ink * glowA * (1. - pa); pa += glowA * (1. - pa);
    if (flags > .5){ pc = mix(pc, uBg, uMsgBox); pa = mix(pa, 1., uMsgBox); }
    pc = ink * cov + pc * (1. - cov); pa = cov + pa * (1. - cov);
    return vec4(pc, pa);
  }
  vec3 bgc = mix(uBg, ink, fillA) + ink * glowA;
  if (flags > .5) bgc = mix(bgc, uBg, uMsgBox);
  return vec4(mix(bgc, ink, cov), 1.);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  // transitions work on the screen grid (the cells as drawn, before any CRT curvature)
  vec2 ps = vec2(fc.x, uRes.y - fc.y);
  vec2 tc = floor(ps / uCell);
  vec2 pt = ps;
  if (uTrans >= 0. && uTransKind == 5){
    // mosaico: each block shows its centre cell, magnified
    float B = mosaicBlock(uTrans);
    if (B > 1.){
      vec2 bo = floor(tc / B) * B;
      vec2 c = min(bo + floor(B * .5), uGrid - 1.);
      pt = c * uCell + (ps - bo * uCell) / B;
    }
  }
  float edgeMask = 1.;
  if (uCurve > 0.){
    vec2 uv = pt / uRes * 2. - 1.;
    uv *= 1. + uCurve * .14 * dot(uv, uv) - uCurve * .1;
    edgeMask = smoothstep(1., .985, max(abs(uv.x), abs(uv.y)));
    pt = (uv * .5 + .5) * uRes;
  }
  vec4 s = shade(pt);
  vec3 col = s.rgb;
  float alpha = s.a;
  if (uChroma > 0.){
    float off = uChroma * uCell.x * .45;
    col.r = shade(pt + vec2(off, 0.)).r;
    col.b = shade(pt - vec2(off, 0.)).b;
  }
  if (uTransparent < .5){
    if (uBloomAmt > 0.) col += texture(uBloom, pt / uCell / uGrid).rgb * uBloomAmt * 1.4;
    if (uGridAmt > 0.){
      vec2 f = fract(pt / uCell);
      float gl = step(f.x * uCell.x, 1.) + step(f.y * uCell.y, 1.);
      col = mix(col, mix(uBg, uAccent, .35), clamp(gl, 0., 1.) * uGridAmt * .6);
    }
  }
  if (uScan > 0.) col *= 1. - uScan * .45 * (.5 + .5 * cos(fc.y * 1.5708));
  if (uVig > 0.){ vec2 vv = fc / uRes - .5; col *= 1. - uVig * dot(vv, vv) * 2.2; }
  // (uFxTime: the real time, or with a loop the loop's time, so flicker and grain repeat with it)
  if (uFlicker > 0.) col *= 1. - uFlicker * .12 * (.5 + .5 * sin(uFxTime * 53.)) * hash12(vec2(floor(uFxTime * 12.), 3.));
  if (uGrain > 0. && uTransparent < .5) col += (hash12(fc + fract(uFxTime * 13.7) * 311.) - .5) * uGrain * .16;
  col *= edgeMask;
  if (uTrans >= 0.){
    vec2 st = transCell(tc, uTrans);
    if (st.x > 1.5){
      ivec2 ic = clamp(ivec2(floor(ps)) - ivec2(tc) * ivec2(uCell), ivec2(0), ivec2(uCell) - 1);
      float cv = glyphCov(st.y, ic);
      col = mix(uTransparent > .5 ? vec3(0.) : uBg, uAccent, cv);
      alpha = uTransparent > .5 ? cv : 1.;
    } else if (st.x > .5){
      vec4 pv = texelFetch(uPrev, ivec2(fc), 0);
      col = pv.rgb; alpha = pv.a;
    }
  }
  col = clamp(col, 0., 1.);
  if (uTransparent > .5){ o = vec4(alpha > 0. ? col / max(alpha, 1e-4) : vec3(0.), alpha); o.rgb = clamp(o.rgb, 0., 1.); }
  else o = vec4(col, 1.);
}`;
