/**
 * Dense optical flow on WebGL2: the same pyramidal Lucas–Kanade as flow.ts (1-2-1 pyramid, box windows,
 * symmetric gradients, Gauss–Newton steps with a 2 px cap, a 3×3 average after each step, weak pixels filled
 * from confident neighbours), as fragment shaders on 32-bit float textures. Pixels are fetched with texelFetch
 * and interpolated by hand, so no float-filtering extension is needed; rendering into float textures needs
 * EXT_color_buffer_float (without it glFlow returns null and the CPU version runs).
 *
 * One WebGL context for the page (created on first use, kept while tracking, released by releaseGlFlow).
 */
import type { FlowField, Luma } from './flow';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

// bilinear sample of channel c with clamped edges (texelFetch: no float filtering needed)
const SAMPLE = `
vec4 at(sampler2D t, ivec2 p) { ivec2 s = textureSize(t, 0); return texelFetch(t, clamp(p, ivec2(0), s - 1), 0); }
vec4 bil(sampler2D t, vec2 q) {
  ivec2 s = textureSize(t, 0);
  q = clamp(q, vec2(0.0), vec2(s - 1));
  ivec2 i = ivec2(floor(q));
  vec2 f = q - vec2(i);
  vec4 a = at(t, i), b = at(t, i + ivec2(1, 0)), c = at(t, i + ivec2(0, 1)), d = at(t, i + ivec2(1, 1));
  return (a + (b - a) * f.x) * (1.0 - f.y) + (c + (d - c) * f.x) * f.y;
}`;

const FS: Record<string, string> = {
  // half size: 1-2-1 blur then 2×2 box (flow.ts downsample)
  down: `${HEAD}${SAMPLE}
uniform sampler2D src;
out vec4 o;
float blurred(ivec2 p) {
  float s = 0.0;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    float w = (dx == 0 ? 2.0 : 1.0) * (dy == 0 ? 2.0 : 1.0);
    s += w * at(src, p + ivec2(dx, dy)).r;
  }
  return s / 16.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 s = textureSize(src, 0) - 1;
  float v = blurred(p) + blurred(min(p + ivec2(1, 0), s)) + blurred(min(p + ivec2(0, 1), s)) + blurred(min(p + ivec2(1, 1), s));
  o = vec4(0.25 * v, 0.0, 0.0, 1.0);
}`,
  // structure-tensor terms of a (gxx, gxy, gyy) for the confidence
  gradA: `${HEAD}${SAMPLE}
uniform sampler2D A;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float ix = 0.5 * (at(A, p + ivec2(1, 0)).r - at(A, p - ivec2(1, 0)).r);
  float iy = 0.5 * (at(A, p + ivec2(0, 1)).r - at(A, p - ivec2(0, 1)).r);
  o = vec4(ix * ix, ix * iy, iy * iy, 0.0);
}`,
  // the coarser level's flow at this size (vectors scaled)
  up: `${HEAD}${SAMPLE}
uniform sampler2D F;
uniform vec2 size;
out vec4 o;
void main() {
  vec2 fs = vec2(textureSize(F, 0));
  vec2 q = (gl_FragCoord.xy) * (fs / size) - 0.5;
  vec2 v = bil(F, q).xy * (size / fs);
  o = vec4(v, 0.0, 0.0);
}`,
  zero: `${HEAD}
out vec4 o;
void main() { o = vec4(0.0); }`,
  // per-pixel terms of one Gauss–Newton step (two outputs)
  terms: `${HEAD}${SAMPLE}
uniform sampler2D A;
uniform sampler2D B;
uniform sampler2D F;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 d = at(F, p).xy;
  vec2 q = vec2(p) + d;
  float e = bil(B, q).r - at(A, p).r;
  float iax = 0.5 * (at(A, p + ivec2(1, 0)).r - at(A, p - ivec2(1, 0)).r);
  float iay = 0.5 * (at(A, p + ivec2(0, 1)).r - at(A, p - ivec2(0, 1)).r);
  float gx = 0.5 * (iax + 0.5 * (bil(B, q + vec2(1.0, 0.0)).r - bil(B, q - vec2(1.0, 0.0)).r));
  float gy = 0.5 * (iay + 0.5 * (bil(B, q + vec2(0.0, 1.0)).r - bil(B, q - vec2(0.0, 1.0)).r));
  o0 = vec4(gx * gx, gx * gy, gy * gy, gx * e);
  o1 = vec4(gy * e, 0.0, 0.0, 0.0);
}`,
  // separable box sum (dir = (1,0) or (0,1)), times k
  box: `${HEAD}${SAMPLE}
uniform sampler2D S;
uniform ivec2 dir;
uniform int r;
uniform float k;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = vec4(0.0);
  for (int i = -r; i <= r; i++) s += at(S, p + dir * i);
  o = s * k;
}`,
  // the step: G·Δ = −b, capped at 2 px
  update: `${HEAD}${SAMPLE}
uniform sampler2D S0;
uniform sampler2D S1;
uniform sampler2D F;
uniform float lambda;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s0 = at(S0, p);
  float by = at(S1, p).x;
  vec2 d = at(F, p).xy;
  float g11 = s0.x + lambda, g22 = s0.z + lambda, g12 = s0.y, bx = s0.w;
  float det = g11 * g22 - g12 * g12;
  if (det > 1e-12) {
    vec2 u = vec2(-(g22 * bx - g12 * by), -(g11 * by - g12 * bx)) / det;
    float m = length(u);
    if (m > 2.0) u *= 2.0 / m;
    d += u;
  }
  o = vec4(d, 0.0, 0.0);
}`,
  // confidence-weighted flow for filling weak pixels
  weights: `${HEAD}${SAMPLE}
uniform sampler2D G;
uniform sampler2D F;
uniform float area;
uniform float minEig;
out vec4 o;
float confOf(vec4 g) {
  float tr = g.x + g.z, det = g.x * g.z - g.y * g.y;
  float disc = sqrt(max(0.0, tr * tr * 0.25 - det));
  return max(0.0, tr * 0.5 - disc) / area;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float c = confOf(at(G, p));
  c = c > minEig ? c : 0.0;
  vec2 d = at(F, p).xy;
  o = vec4(c * d, c, 0.0);
}`,
  fill: `${HEAD}${SAMPLE}
uniform sampler2D G;
uniform sampler2D F;
uniform sampler2D W1;
uniform sampler2D W2;
uniform float area;
uniform float minEig;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 g = at(G, p);
  float tr = g.x + g.z, det = g.x * g.z - g.y * g.y;
  float c = max(0.0, tr * 0.5 - sqrt(max(0.0, tr * tr * 0.25 - det))) / area;
  vec2 d = at(F, p).xy;
  if (c <= minEig) {
    vec4 a = at(W1, p), b = at(W2, p);
    if (a.z > 0.0) d = a.xy / a.z; else if (b.z > 0.0) d = b.xy / b.z;
  }
  o = vec4(d, 0.0, 0.0);
}`,
};

interface Tex { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
interface Ctx {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas | HTMLCanvasElement;
  progs: Record<string, WebGLProgram>;
  pool: Map<string, Tex[]>;
  mrt: WebGLFramebuffer;
}
let ctx: Ctx | null | undefined;

function init(): Ctx | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  try {
    const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const progs: Record<string, WebGLProgram> = {};
    for (const [name, src] of Object.entries(FS)) {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, src));
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
      progs[name] = prog;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ctx = { gl, canvas, progs, pool: new Map(), mrt: gl.createFramebuffer()! };
    canvas.addEventListener?.('webglcontextlost', () => { ctx = undefined; });
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Frees the flow's WebGL context (tracking done). The next glFlow creates it again. */
export function releaseGlFlow(): void {
  if (!ctx) { ctx = undefined; return; }
  const { gl } = ctx;
  for (const list of ctx.pool.values()) for (const t of list) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  ctx = undefined;
}

/** Whether the GPU flow can run here (WebGL2 + float render targets). */
export const glFlowAvailable = () => !!init();

function texture(c: Ctx, w: number, h: number, data: Float32Array | null = null): Tex {
  const { gl } = c;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

/** Textures of a size, reused between calls (a tracking run asks for the same sizes every frame). */
function pool(c: Ctx, w: number, h: number, n: number): Tex[] {
  const k = `${w}x${h}`;
  let list = c.pool.get(k);
  if (!list) { list = []; c.pool.set(k, list); }
  while (list.length < n) list.push(texture(c, w, h));
  return list;
}

function run(c: Ctx, prog: string, out: Tex | [Tex, Tex], inputs: Record<string, Tex>, uni: Record<string, number | [number, number]> = {}) {
  const { gl } = c;
  const p = c.progs[prog];
  gl.useProgram(p);
  let unit = 0;
  for (const [name, t] of Object.entries(inputs)) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(gl.getUniformLocation(p, name), unit++);
  }
  for (const [name, v] of Object.entries(uni)) {
    const loc = gl.getUniformLocation(p, name);
    if (Array.isArray(v)) {
      if (name === 'dir') gl.uniform2i(loc, v[0], v[1]); else gl.uniform2f(loc, v[0], v[1]);
    } else if (name === 'r') gl.uniform1i(loc, v);
    else gl.uniform1f(loc, v);
  }
  if (Array.isArray(out)) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, c.mrt);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out[0].tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, out[1].tex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, out[0].w, out[0].h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, out.w, out.h);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** Box sum over a (2r+1)² window, times k: src → dst (tmp in between). */
function box(c: Ctx, src: Tex, tmp: Tex, dst: Tex, r: number, k = 1) {
  run(c, 'box', tmp, { S: src }, { dir: [1, 0], r, k: 1 });
  run(c, 'box', dst, { S: tmp }, { dir: [0, 1], r, k });
}

const MIN_EIG = 2e-5;

/**
 * Flow a → b (see flow.ts for the convention and options). Null when WebGL2 float targets are not available here.
 */
export function glFlow(a: Luma, b: Luma, o: { radius?: number; levels?: number; iterations?: number } = {}): FlowField | null {
  const c = init();
  if (!c) return null;
  const { gl } = c;
  const r = Math.max(1, o.radius ?? 3);
  const levels = Math.max(1, Math.min(6, o.levels ?? 4));
  const iterations = Math.max(1, o.iterations ?? 5);
  // pyramid sizes (same rule as flow.ts: stop before a side under 24 px)
  const sizes: Array<[number, number]> = [[a.w, a.h]];
  while (sizes.length < levels) {
    const [w, h] = sizes[sizes.length - 1];
    if (Math.min(w, h) < 24) break;
    sizes.push([Math.max(1, w >> 1), Math.max(1, h >> 1)]);
  }
  const lumaTex = (l: Luma, t: Tex) => {
    const d = new Float32Array(l.w * l.h * 4);
    for (let i = 0; i < l.data.length; i++) d[i * 4] = l.data[i];
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, l.w, l.h, gl.RGBA, gl.FLOAT, d);
  };
  // per level: A, B, G (tensor of a), GS (box of G), F0, F1 (flow ping-pong), T0, T1 (terms), S0, S1 (sums), X (tmp), W1, W2
  const L = sizes.map(([w, h]) => pool(c, w, h, 13));
  lumaTex(a, L[0][0]);
  lumaTex(b, L[0][1]);
  for (let l = 1; l < sizes.length; l++) {
    run(c, 'down', L[l][0], { src: L[l - 1][0] });
    run(c, 'down', L[l][1], { src: L[l - 1][1] });
  }
  const area = (2 * r + 1) * (2 * r + 1);
  const lambda = 1e-6 * area;
  let flow: Tex | null = null;
  for (let l = sizes.length - 1; l >= 0; l--) {
    const [w, h] = sizes[l];
    const [A, B, G, GS, F0, F1, T0, T1, S0, S1, X, W1, W2] = L[l];
    run(c, 'gradA', G, { A });
    box(c, G, X, GS, r);
    if (flow) run(c, 'up', F0, { F: flow }, { size: [w, h] });
    else run(c, 'zero', F0, {});
    let cur = F0, next = F1;
    for (let it = 0; it < iterations; it++) {
      run(c, 'terms', [T0, T1], { A, B, F: cur });
      box(c, T0, X, S0, r);
      box(c, T1, X, S1, r);
      run(c, 'update', next, { S0, S1, F: cur }, { lambda });
      // 3×3 average (flow.ts smoothFlow)
      box(c, next, X, cur, 1, 1 / 9);
    }
    // weak pixels from confident neighbours (flow.ts fillWeak)
    run(c, 'weights', T0, { G: GS, F: cur }, { area, minEig: MIN_EIG });
    const R1 = Math.max(2, r * 3);
    const R2 = Math.max(R1 * 4, Math.round(Math.min(w, h) / 4));
    box(c, T0, X, W1, R1);
    box(c, T0, X, W2, R2);
    run(c, 'fill', next, { G: GS, F: cur, W1, W2 }, { area, minEig: MIN_EIG });
    flow = next;
  }
  const out = new Float32Array(a.w * a.h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, flow!.fbo);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.readPixels(0, 0, a.w, a.h, gl.RGBA, gl.FLOAT, out);
  const data = new Float32Array(a.w * a.h * 2);
  for (let i = 0; i < a.w * a.h; i++) { data[i * 2] = out[i * 4]; data[i * 2 + 1] = out[i * 4 + 1]; }
  return { w: a.w, h: a.h, data };
}
