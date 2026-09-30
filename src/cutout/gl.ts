/**
 * The last, full-resolution step of the guided upsampling on the GPU (WebGL2 on an OffscreenCanvas: works on the
 * page and in the worker). Same maths as refine.applyGuided — coefficients sampled bilinearly by hand with
 * texelFetch (no float-filtering extension needed) — so both paths give the same bytes within ±1.
 */
import type { GuidedPlan } from './refine';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Row y of the output = row y of the image (framebuffer row 0 is read first by readPixels), so no flip.
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D guide;
uniform highp sampler2D coef;
uniform vec2 scale;      // coef size / image size
uniform ivec2 csize;
out vec4 o;
vec4 texC(int x, int y) { return texelFetch(coef, ivec2(clamp(x, 0, csize.x - 1), clamp(y, 0, csize.y - 1)), 0); }
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec2 uv = (vec2(px) + 0.5) * scale - 0.5;
  uv = clamp(uv, vec2(0.0), vec2(csize - 1));
  ivec2 c0 = ivec2(floor(uv));
  vec2 f = uv - vec2(c0);
  vec4 a = texC(c0.x, c0.y), b = texC(c0.x + 1, c0.y), c = texC(c0.x, c0.y + 1), d = texC(c0.x + 1, c0.y + 1);
  vec4 k = (a * (1.0 - f.x) + b * f.x) * (1.0 - f.y) + (c * (1.0 - f.x) + d * f.x) * f.y;
  vec3 I = texelFetch(guide, px, 0).rgb;
  float q = clamp(dot(k.rgb, I) + k.a, 0.0, 1.0);
  o = vec4(q, q, q, 1.0);
}`;

interface Ctx { gl: WebGL2RenderingContext; prog: WebGLProgram; canvas: OffscreenCanvas; max: number }
let ctx: Ctx | null | undefined;

function init(): Ctx | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    ctx = { gl, prog, canvas, max };
  } catch { ctx = null; }
  return ctx;
}

export function glAvailable(): boolean { return !!init(); }

/** Applies the plan on the GPU. Null when WebGL2 is missing or the image is larger than the GPU allows. */
export function applyGuidedGL(plan: GuidedPlan, rgba: Uint8ClampedArray | Uint8Array, W: number, H: number): Uint8ClampedArray | null {
  const c = init();
  if (!c || W > c.max || H > c.max || plan.cw > c.max || plan.ch > c.max) return null;
  const { gl, prog } = c;
  try {
    const tex = (unit: number) => { const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const tGuide = tex(0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
    const tCoef = tex(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, plan.cw, plan.ch, 0, gl.RGBA, gl.FLOAT, plan.coef);
    const tOut = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tOut);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tOut, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer');
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'guide'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'coef'), 1);
    gl.uniform2f(gl.getUniformLocation(prog, 'scale'), plan.cw / W, plan.ch / H);
    gl.uniform2i(gl.getUniformLocation(prog, 'csize'), plan.cw, plan.ch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tGuide); gl.deleteTexture(tCoef); gl.deleteTexture(tOut);
    if (gl.getError() !== gl.NO_ERROR) return null;
    const out = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = px[j];
    return out;
  } catch {
    return null;
  }
}

/** Drops the context (e.g. when the worker is idle for good). */
export function releaseGL(): void {
  if (ctx) (ctx.gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
  ctx = undefined;
}
