/** Thin WebGL2 helpers. */

export interface Program {
  prog: WebGLProgram;
  u: Map<string, WebGLUniformLocation | null>;
}

export function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s) || 'error de compilación';
      gl.deleteShader(s);
      throw new Error(log + '\n' + numbered(src, log));
    }
    return s;
  };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(gl.getProgramInfoLog(prog) || 'error de enlazado');
  }
  return { prog, u: new Map() };
}

function numbered(src: string, log: string): string {
  const m = /ERROR: \d+:(\d+)/.exec(log);
  if (!m) return '';
  const line = +m[1];
  return src.split('\n').slice(Math.max(0, line - 4), line + 2).map((l, i) => `${line - 3 + i}: ${l}`).join('\n');
}

export function loc(gl: WebGL2RenderingContext, p: Program, name: string) {
  let l = p.u.get(name);
  if (l === undefined) { l = gl.getUniformLocation(p.prog, name); p.u.set(name, l); }
  return l;
}

export interface Tex { tex: WebGLTexture; w: number; h: number; internal: number; format: number; type: number; filter: number }

export function createTex(
  gl: WebGL2RenderingContext, w: number, h: number,
  opts: { internal?: number; format?: number; type?: number; filter?: number; data?: ArrayBufferView | null } = {},
): Tex {
  const t: Tex = {
    tex: gl.createTexture()!, w, h,
    internal: opts.internal ?? gl.RGBA8, format: opts.format ?? gl.RGBA, type: opts.type ?? gl.UNSIGNED_BYTE,
    filter: opts.filter ?? gl.NEAREST,
  };
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, t.internal, w, h, 0, t.format, t.type, opts.data ?? null);
  return t;
}

export function resizeTex(gl: WebGL2RenderingContext, t: Tex, w: number, h: number, data: ArrayBufferView | null = null) {
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, t.internal, w, h, 0, t.format, t.type, data);
  t.w = w; t.h = h;
}

export function fboFor(gl: WebGL2RenderingContext, ...texs: Tex[]): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t.tex, 0));
  if (texs.length > 1) gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

/** Can we render into half-float textures? (needed for smooth ripples) */
export function halfFloatRenderable(gl: WebGL2RenderingContext): boolean {
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false;
  const t = createTex(gl, 2, 2, { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT });
  const fb = fboFor(gl, t);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.deleteTexture(t.tex);
  return ok;
}
