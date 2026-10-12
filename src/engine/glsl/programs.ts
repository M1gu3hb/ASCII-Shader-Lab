import { GLSL_BLEND, GLSL_CORE } from './core';
import { DISP_MAX } from '../touch';
import { INK_DRY } from '../pointer';
import type { PatternLibrary } from './patterns';
import { isAnalytic, isColorFamily, isColourRaster, isFamily, isRaster } from '../../families/registry';
import { FAMILY_SAMPLE_GLSL } from '../../families/sample';
import { familyGlsl } from '../../families/analytic/glsl';
import { GLSL_OPTICS, GLSL_OPTICS_SOLID } from './optics';

export const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

export const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0., 1.); }`;

export type FieldSource = 'pattern' | 'media' | 'text';

/**
 * Which glass is in front (recipe.optics): none, rain or fluted glass (true), or a glass solid ('solido':
 * the sphere and the polyhedron, whose program also colours the cells: dispersion, tint).
 */
export type FieldOptics = boolean | 'solido';

/** Program cache key for the field pass. */
export function fieldKey(patterns: string[], src: FieldSource, loop: boolean, optics: FieldOptics = false): string {
  // an analytic family whose chunk has not arrived yet draws nothing: that program is another key, so it is
  // never kept in place of the real one
  const waiting = patterns.some(id => isAnalytic(id) && !familyGlsl(id));
  return `${src}|${loop ? 'L' : '-'}|${patterns.join(',')}${waiting ? '|sin-glsl' : ''}${optics === 'solido' ? '|vidrio3d' : optics ? '|vidrio' : ''}`;
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

export function buildFieldShader(patterns: string[], src: FieldSource, loop: boolean, lib: PatternLibrary, optics: FieldOptics = false): string {
  const solid = optics === 'solido';
  const used = [...new Set(patterns)];
  // raster families (geometry, simulation) need no chunk: their layer reads the raster their model computed
  const chunks = used.filter(id => !isRaster(id)).map(id => {
    const stub = isColorFamily(id) ? `vec4 FC_${id}(vec2 p, float t, vec4 k0, vec4 k1) { return vec4(0.); }` : `float F_${id}(vec2 p, float t, vec4 k0, vec4 k1) { return 0.; }`;
    const c = isAnalytic(id) ? familyGlsl(id) ?? stub : lib[id];
    if (!c) throw new Error('Patrón no disponible en la librería: ' + id);
    return c;
  }).join('\n');
  const families = used.some(isFamily);
  // colour families (FamilyMeta.color) give each cell a colour besides its luminance: SC carries it through
  // the stack (the first one sets it, the next ones mix theirs in by their layer's mix) to the pattern's col
  // (raster colour families too: their raster carries rgb and, in alpha, the luminance that picks the glyph)
  const tinted = isColorFamily;
  const colour = used.some(tinted);

  // a family layer: analytic ones read their typed parameters (uLF0/uLF1 as arguments, K2/K3 and the version
  // FV as globals), raster ones their raster (colour ones rgb and luminance)
  const call = (id: string, i: number) => isRaster(id) ? (isColourRaster(id) ? `famRasterC(${i}, q)` : `famRaster(${i}, q)`)
    : isColorFamily(id) ? `FC_${id}(q, t * B.w + C.y, uLF0[${i}], uLF1[${i}])`
    : isAnalytic(id) ? `F_${id}(q, t * B.w + C.y, uLF0[${i}], uLF1[${i}])`
    : `P_${id}(q, t * B.w + C.y, B.x, B.y)`;
  // before a family layer: its extra parameters and version, its transform (famSrc maps back to the canvas) and
  // the stack below it at this cell (FamilyMeta.reads)
  const pre = (id: string, i: number) => !isFamily(id) ? '' : `
    K2 = uLF2[${i}]; K3 = uLF3[${i}]; FV = uLV[${i}].x; LA = A; VB = ${i === 0 ? '0.' : 'v'};${colour ? ` VC = SCN > .5 ? SC : vec3(1.);` : ''}`;
  // a raster colour family whose run gives no colour (a piece made before it did) leaves SC as it was
  const tint = (id: string, i: number) => isRaster(id) ? `if (uLV[${i}].y > .5){ SC = SCN > .5 ? mix(SC, c4.rgb, B.z) : c4.rgb; SCN = 1.; }`
    : 'SC = SCN > .5 ? mix(SC, c4.rgb, B.z) : c4.rgb; SCN = 1.;';
  const layerCode = patterns.map((id, i) => tinted(id) ? `
  {
    vec4 A = uLA[${i}], B = uLB[${i}], C = uLC[${i}];
    vec2 q = rot2(p - A.zw, A.y) * A.x;
    PX = uCellP * A.x;${pre(id, i)}
    vec4 c4 = ${call(id, i)};
    float x = c4.a;
    x = mix(x, 1. - x, C.x);
    ${i === 0 ? 'v = x * B.z;' : 'v = blendf(v, x, int(C.z), B.z);'}
    ${tint(id, i)}${families ? `
    if (uLV[${i}].z > .5${isRaster(id) ? ` && uLV[${i}].y > .5` : ''}) SRCC = 1.;` : ''}
  }` : `
  {
    vec4 A = uLA[${i}], B = uLB[${i}], C = uLC[${i}];
    vec2 q = rot2(p - A.zw, A.y) * A.x;
    PX = uCellP * A.x;${pre(id, i)}
    float x = ${call(id, i)};
    x = mix(x, 1. - x, C.x);
    ${i === 0 ? 'v = x * B.z;' : 'v = blendf(v, x, int(C.z), B.z);'}
  }`).join('');
  // what a family that reads the piece sees of its source (FamilyMeta.reads): the picture or the letters at a
  // point of its layer, mapped back to the canvas through the layer's transform; nothing with patterns
  const famSrc = !families ? '' : `
float famSrcKind(){ return ${src === 'media' ? '1.' : src === 'text' ? '2.' : '0.'}; }
vec4 famSrc(vec2 q){
  vec2 p = rot2(q / LA.x, -LA.y) + LA.zw;
  vec2 s = vec2(p.x * uRes.y + .5 * uRes.x, .5 * uRes.y - p.y * uRes.y) / uRes;
  ${src === 'media' ? 'vec4 c = media(s); return vec4(c.rgb * c.a, dot(c.rgb, vec3(.299, .587, .114)) * c.a);'
    : src === 'text' ? 'float m = texture(uText, s).r; return vec4(vec3(m), m);'
    : 'return vec4(0.);'}
}`;

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
${colour ? `uniform vec3 uPal[6];
uniform float uPalN;
vec3 SC; float SCN;` : ''}
${families ? 'float SRCC;' : ''}
${GLSL_CORE}
${GLSL_BLEND}
${src === 'media' ? GLSL_MEDIA : ''}
${families ? FAMILY_SAMPLE_GLSL : ''}
${famSrc}
${solid ? GLSL_OPTICS_SOLID : optics ? GLSL_OPTICS : ''}
${chunks}
float stack(vec2 p, float t){
  float v = 0.;${colour ? '\n  SC = vec3(1.); SCN = 0.;' : ''}${families ? '\n  SRCC = 0.;' : ''}
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
  ${optics ? `// glass in front of the piece: what each cell reads moves where the drops or flutes send it (optics.ts)
  vec4 OP = ${loop ? 'mix(optics(pp, mod(uTime, uLoop)), optics(pp, mod(uTime, uLoop) - uLoop), mod(uTime, uLoop) / uLoop)' : 'optics(pp, uTime)'};
  pp += OP.xy;` : ''}
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
  ${colour ? `float pa = stack(q, tl);
  vec3 sa = SC;
  pv = mix(pa, stack(q2, tl - uLoop), w);
  SC = mix(sa, SC, w);` : 'pv = mix(stack(q, tl), stack(q2, tl - uLoop), w);'}
  pv = clamp(.5 + (pv - .5) * (1. + .41 * sin(PI * w)), 0., 1.);` : `
  pv = stack(q, uTime);`}
  // the pattern alone, for a transformation that reads it (Desplazar, see glsl/xform.ts)
  if (uPatOnly == 1){ o = vec4(pv, 0., 0., 1.); return; }${solid && src === 'pattern' ? `
  // a glass solid with a dispersion: the red and the blue rays read the layers where they land (optics.ts)
  vec3 GL3 = vec3(pv);
  if (OPX.x > .5 && uOpD.z > 0.){${colour ? `
    vec3 scg = SC;
    float scn = SCN;` : ''}${loop ? `
    GL3.r = clamp(.5 + (mix(stack(q + OPD.xy, tl), stack(q2 + OPD.xy, tl - uLoop), w) - .5) * (1. + .41 * sin(PI * w)), 0., 1.);
    GL3.b = clamp(.5 + (mix(stack(q + OPD.zw, tl), stack(q2 + OPD.zw, tl - uLoop), w) - .5) * (1. + .41 * sin(PI * w)), 0., 1.);` : `
    GL3.r = stack(q + OPD.xy, uTime);
    GL3.b = stack(q + OPD.zw, uTime);`}${colour ? `
    SC = scg;
    SCN = scn;` : ''}
    pv = dot(GL3, vec3(.299, .587, .114));
  }` : ''}
  vec3 col = ${colour && src === 'pattern' ? 'SC' : 'vec3(1.)'};
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
  }${solid ? `
  // a glass solid with a dispersion: red and blue from where their own rays land (optics.ts)
  if (OPX.x > .5 && uOpD.z > 0.){
    vec2 sR = s + OPD.xy * vec2(uRes.y / uRes.x, -1.), sB = s + OPD.zw * vec2(uRes.y / uRes.x, -1.);
    if (uXOn == 1){
      c4.r = texelFetch(uXGrid, clamp(ivec2(floor(sR * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).r;
      c4.b = texelFetch(uXGrid, clamp(ivec2(floor(sB * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).b;
    } else {
      vec2 a0 = clamp(sR - cs, 0., 1.), a1 = clamp(sR + cs, 0., 1.), b0 = clamp(sB - cs, 0., 1.), b1 = clamp(sB + cs, 0., 1.);
      c4.r = (media(a0).r + media(vec2(a1.x, a0.y)).r + media(vec2(a0.x, a1.y)).r + media(a1).r) * .25;
      c4.b = (media(b0).b + media(vec2(b1.x, b0.y)).b + media(vec2(b0.x, b1.y)).b + media(b1).b) * .25;
    }
  }` : ''}
  col = c4.rgb;
  float ml = dot(col, vec3(.299, .587, .114));
  l = uMediaMix > 0. ? blendf(ml, pv, uMediaBlend, uMediaMix) : ml;${colour ? `
  // a colour family that reads the picture (FamilyMeta.reads) gives the cells their colour, the picture's
  // own where it shows it, by the pattern's amount
  if (SRCC > .5) col = mix(col, SC, uMediaMix);` : ''}` : ''}
  ${src === 'text' ? `
  float tm = uXOn == 1
    ? dot(texelFetch(uXGrid, clamp(ivec2(floor(s * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).rgb, vec3(.299, .587, .114))
    : (texture(uText, s + vec2(-cs.x, -cs.y)).r + texture(uText, s + vec2(cs.x, -cs.y)).r
      + texture(uText, s + vec2(-cs.x, cs.y)).r + texture(uText, s + cs).r) * .25;${solid ? `
  // a glass solid with a dispersion: the red and the blue rays read the letters where they land (optics.ts)
  vec3 TX3 = vec3(tm);
  if (OPX.x > .5 && uOpD.z > 0.){
    vec2 sR = s + OPD.xy * vec2(uRes.y / uRes.x, -1.), sB = s + OPD.zw * vec2(uRes.y / uRes.x, -1.);
    if (uXOn == 1){
      TX3.r = dot(texelFetch(uXGrid, clamp(ivec2(floor(sR * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).rgb, vec3(.299, .587, .114));
      TX3.b = dot(texelFetch(uXGrid, clamp(ivec2(floor(sB * uRes / uCell)), ivec2(0), ivec2(uGrid) - 1), 0).rgb, vec3(.299, .587, .114));
    } else {
      TX3.r = (texture(uText, sR + vec2(-cs.x, -cs.y)).r + texture(uText, sR + vec2(cs.x, -cs.y)).r
        + texture(uText, sR + vec2(-cs.x, cs.y)).r + texture(uText, sR + cs).r) * .25;
      TX3.b = (texture(uText, sB + vec2(-cs.x, -cs.y)).r + texture(uText, sB + vec2(cs.x, -cs.y)).r
        + texture(uText, sB + vec2(-cs.x, cs.y)).r + texture(uText, sB + cs).r) * .25;
    }
    tm = dot(TX3, vec3(.299, .587, .114));
  }` : ''}
  l = uMediaMix > 0. ? blendf(tm, pv, uMediaBlend, uMediaMix) : tm;
  if (uMorph > 0.){
    float env = .5 - .5 * cos(TAU * uTime / uMorph);
    l = hash12(cell * 1.37) < smoothstep(.1, .9, env) ? pv : l;
  }${colour ? `
  // a colour family that reads the letters (FamilyMeta.reads) gives the cells their colour
  if (SRCC > .5) col = SC;` : ''}` : ''}
  if (uIMode == 1) l += uIStr * fall * (.75 + .25 * sin(dist * 40. - uTime * 6.));
  else if (uIMode == 2) l += simH(cell) * .3 * uIStr;
  else if (uIMode == 6) l *= 1. - clamp(sim.b, 0., 1.);
  else if (uIMode == 7) l += sim.b * .85;
  ${solid ? `// a glass solid (optics.ts): its tint deepens with the path inside it, its body shows by its opacity,
  // and a dispersion's channels colour the cell. uOpCol 1: the cell's colour is its own (the photo, a colour
  // family), tinted here; 2: the palette's, and the cell carries a factor the select pass multiplies it by (128 = ×1)
  if (uOpCol > 1.5) col = vec3(128. / 255.);
  if (OPX.x > .5){
    vec3 LW = vec3(.299, .587, .114);
    vec3 T = pow(max(uOpT.rgb, vec3(.02)), vec3(OPX.y * .8));
    float tlum = max(dot(T, LW), .02);
    vec3 own = uOpT.rgb * OPX.z;
    // what gets through: less where Fresnel reflects more (the rim), and tinted
    l = mix(l * tlum * (1. - .85 * OPX.w), dot(own, LW), uOpT.a);
    vec3 c3 = ${src === 'pattern' ? 'GL3' : src === 'text' ? 'TX3' : 'vec3(1.)'};
    vec3 dc = (c3 + .02) / (dot(c3, LW) + .02);
    if (uOpCol > 1.5) col = clamp(mix(dc * T / tlum, uOpT.rgb / max(dot(uOpT.rgb, LW), .02), uOpT.a) * (128. / 255.), 0., 1.);
    else if (uOpCol > .5) col = mix(col * ${src === 'media' ? '' : 'dc * '}T, own, uOpT.a);
  }
  ` : ''}${optics ? `// the glass's own light, and fog that dims what is behind it outside the drops
  l = mix(l, l * .55 + .06, OP.w);
  l += uOpB.z * OP.z * .6;` : ''}
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
// «Pincel caligráfico» (pointer.ts): the brush's radius where the segment starts, how dry it runs, how far the ink bleeds
uniform int uStroke;
uniform float uBrushR0, uDry, uBleed;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float Tr(ivec2 c){ ivec2 G = ivec2(uGrid) - 1; return texelFetch(uPrev, clamp(c, ivec2(0), G), 0).b; }
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
  else if (uMode == 7 && uStroke == 1){
    // the calligraphic brush: its width goes from uBrushR0 to uBrushR along the segment (the speed changed it),
    // and running fast it goes dry: across the stroke its hairs leave gaps
    vec2 pa = px - uSeg.xy, ba = uSeg.zw - uSeg.xy;
    float bb = max(dot(ba, ba), 1e-6);
    float h = clamp(dot(pa, ba) / bb, 0., 1.);
    vec2 e = pa - ba * h;
    float r = max(mix(uBrushR0, uBrushR, h), 1.);
    float d = length(e) / r;
    float across = (e.x * ba.y - e.y * ba.x) / sqrt(bb) / r;
    float hair = .5 + .5 * sin(across * 11. + 1.7) * sin(across * 4.3 + .4);
    float ink = exp(-d * d * 3.2) * mix(1., smoothstep(.25, .75, hair), uDry);
    // (ink on paper stays: it fades at INK_DRY of Pincel's rate, pointer.ts)
    tr = max(tr * exp(-uDt * uPaintRate * ${INK_DRY.toFixed(2)}), ink * uActive * (.4 + uStr * .8));
    // the ink bleeds into the paper: a cell soaks up part of its wettest neighbour's, more along its fibres
    float nb = max(max(Tr(c + ivec2(1, 0)), Tr(c - ivec2(1, 0))), max(Tr(c + ivec2(0, 1)), Tr(c - ivec2(0, 1))));
    float soak = nb * uBleed * (.35 + .4 * hash12(vec2(c) * .73 + 3.1));
    if (soak > tr) tr += (soak - tr) * min(1., uDt * 4.);
  }
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
uniform float uEmptyField;
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
uniform int uGlassCol;
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

  if (uEmptyField > .5){ alpha = 0.; l = 0.; inten = 0.; }
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
  // a glass solid in front (optics.ts): the cell carries what it does to the palette's colour (128 = ×1)
  else if (uGlassCol == 1) base = clamp(base * f.rgb * (255. / 128.), 0., 1.);
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

/**
 * «Destello anamórfico» (recipe.fxKind.bloom 'anamorfico'; closing of PR #10, row I-22): the halo of fx.bloom
 * as an anamorphic lens draws it, written from the published description of the effect. Two passes on the
 * cell grid, into the same targets as BLUR_FS (the compose pass adds them alike):
 *   0. the lights (what the select pass drew, only where it is bright) spread sideways;
 *   1. that spread three times as far again, a long horizontal streak, with its red pulled to the right and
 *      its blue to the left of each light, slightly cool; plus a bokeh ring around each light (24 taps
 *      on a circle, round in pixels: the cells are taller than wide).
 * Ported to basic/compose.ts (blurGridAnamorphic).
 */
export const ANAMORPHIC_FS = HEAD + `
uniform sampler2D uSrc;
uniform sampler2D uSel;
uniform int uPass;
uniform float uStep;
uniform float uAspect;
out vec4 o;
float GW(int k){ return k == 0 ? .227027 : k == 1 ? .1945946 : k == 2 ? .1216216 : k == 3 ? .054054 : .016216; }
// a light: what the select pass drew at a cell, only where it is bright
vec3 light(ivec2 c){
  ivec2 G = textureSize(uSel, 0) - 1;
  vec4 v = texelFetch(uSel, clamp(c, ivec2(0), G), 0);
  vec3 s = v.rgb * v.a;
  return s * (max(dot(s, vec3(.299, .587, .114)) - .3, 0.) / .7);
}
vec3 A(ivec2 c){ ivec2 G = textureSize(uSrc, 0) - 1; return texelFetch(uSrc, clamp(c, ivec2(0), G), 0).rgb; }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  int s = int(uStep + .5);
  if (uPass == 0){
    vec3 acc = light(c) * GW(0);
    for (int k = 1; k < 5; k++) acc += (light(c + ivec2(k * s, 0)) + light(c - ivec2(k * s, 0))) * GW(k);
    o = vec4(acc, 1.);
    return;
  }
  int s3 = 3 * s, off = s + 1;
  vec3 acc = vec3(0.);
  for (int k = -4; k <= 4; k++){
    float w = GW(k < 0 ? -k : k);
    acc.r += A(c + ivec2(k * s3 - off, 0)).r * w;
    acc.g += A(c + ivec2(k * s3, 0)).g * w;
    acc.b += A(c + ivec2(k * s3 + off, 0)).b * w;
  }
  vec3 ring = vec3(0.);
  float R = 2. + 2. * uStep;
  for (int k = 0; k < 24; k++){
    float a = float(k) * .2617994;
    ring += light(c + ivec2(floor(vec2(cos(a) * R, sin(a) * R / uAspect) + .5)));
  }
  o = vec4(acc * vec3(.85, .95, 1.2) * 1.6 + ring * .05, 1.);
}`;

/**
 * «Papel» (recipe.fxKind.grain 'papel'; closing of PR #10, row I-27): fx.grain as a still sheet of paper, written
 * from the published description of the effect (grain, fibres, folds). Drawn once per size into a texture
 * the compose pass reads (R: the relief P as P · 0.4 + 0.5), never per frame: it does not move.
 *   - fine grain per pixel, and a soft mottling a few cells wide;
 *   - fibres: short thin strands (two per square of three cells), lighter or darker than the sheet;
 *   - folds (uFold 1 in four, 2 a letter in three, 3 the diagonals, 4 crumpled): along each crease, a thin dark
 *     line, the side that faces the light (up and to the left) lighter and the other darker; crumpled paper
 *     also tilts every facet between its creases.
 * Ported to basic/compose.ts (paperField).
 */
export const PAPER_FS = HEAD + `
uniform vec2 uRes;
uniform float uCellW;
uniform int uFold;
out vec4 o;
${GLSL_CORE}
float crease(vec2 p, vec2 a, vec2 n, float k, float facet){
  float d = dot(p - a, n);
  float side = (d < 0. ? -1. : 1.) * dot(n, vec2(-.6, .8));
  return k * (side * (.45 * exp(-abs(d) / .06) + facet) - .9 * exp(-d * d / 4.84e-6));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 q = fc / uCellW;
  float P = (hash12(floor(fc)) - .5) * .5 + (vnoise(q * .22) + .6 * vnoise(q * .55 + 7.3) - .8) * .55;
  vec2 g = floor(q / 3.);
  float fib = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 id = g + vec2(float(i), float(j));
    for (int f = 0; f < 2; f++){
      float ff = float(f);
      vec2 c = (id + hash22(id * 1.7 + ff * 13.1)) * 3.;
      float a = hash12(id + ff * 7.3) * PI;
      vec2 dir = vec2(cos(a), sin(a));
      float len = .3 + .8 * hash12(id * 2.3 + ff);
      vec2 pa = q - c;
      float t = clamp(dot(pa, dir), -len, len);
      vec2 e = pa - dir * t;
      fib += (hash12(id * 3.1 + ff * 5.) < .5 ? -1. : 1.) * exp(-dot(e, e) / .004);
    }
  }
  P += clamp(fib, -1., 1.) * .45;
  vec2 p = (fc - .5 * uRes) / uRes.y;
  if (uFold == 1) P += crease(p, vec2(0.), vec2(1., 0.), 1., 0.) + crease(p, vec2(0.), vec2(0., 1.), 1., 0.);
  else if (uFold == 2) P += crease(p, vec2(0., 1. / 6.), vec2(0., 1.), 1., 0.) + crease(p, vec2(0., -1. / 6.), vec2(0., 1.), 1., 0.);
  else if (uFold == 3) P += crease(p, vec2(0.), vec2(.7071068, .7071068), 1., 0.) + crease(p, vec2(0.), vec2(.7071068, -.7071068), 1., 0.);
  else if (uFold == 4){
    for (int k = 0; k < 9; k++){
      float fk = float(k);
      vec2 a = (vec2(hash12(vec2(fk, 1.7)), hash12(vec2(fk, 4.3))) - .5) * vec2(1.4, .9);
      float an = hash12(vec2(fk, 8.9)) * PI;
      P += crease(p, a, vec2(cos(an), sin(an)), .45 + .35 * hash12(vec2(fk, 2.1)), .14);
    }
  }
  o = vec4(clamp(P * .4 + .5, 0., 1.), 0., 0., 1.);
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
// the old frame's size over the canvas's: the stage may change size during a transition (a new view, a new window)
uniform vec2 uPrevScale;
uniform float uFxTime;
// «Papel» (PAPER_FS): the still sheet's relief, and whether fx.grain is that instead of the film grain
uniform sampler2D uPaperT;
uniform float uPaper;
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
  if (uGrain > 0. && uTransparent < .5){
    if (uPaper > .5){
      // a still sheet of paper: lighter and darker by its relief, more so where the frame is light
      float P = (texelFetch(uPaperT, ivec2(fc), 0).r - .5) / .4;
      col += P * uGrain * (.04 + .3 * col);
    } else col += (hash12(fc + fract(uFxTime * 13.7) * 311.) - .5) * uGrain * .16;
  }
  col *= edgeMask;
  if (uTrans >= 0.){
    vec2 st = transCell(tc, uTrans);
    if (st.x > 1.5){
      ivec2 ic = clamp(ivec2(floor(ps)) - ivec2(tc) * ivec2(uCell), ivec2(0), ivec2(uCell) - 1);
      float cv = glyphCov(st.y, ic);
      col = mix(uTransparent > .5 ? vec3(0.) : uBg, uAccent, cv);
      alpha = uTransparent > .5 ? cv : 1.;
    } else if (st.x > .5){
      vec4 pv = texelFetch(uPrev, min(ivec2(fc * uPrevScale), textureSize(uPrev, 0) - 1), 0);
      col = pv.rgb; alpha = pv.a;
    }
  }
  col = clamp(col, 0., 1.);
  if (uTransparent > .5){ o = vec4(alpha > 0. ? col / max(alpha, 1e-4) : vec3(0.), alpha); o.rgb = clamp(o.rgb, 0., 1.); }
  else o = vec4(col, 1.);
}`;
