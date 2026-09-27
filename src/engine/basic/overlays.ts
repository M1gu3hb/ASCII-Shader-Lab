/**
 * Post effects drawn with Canvas 2D operations after putImageData, used when no effect moves pixels
 * (no CRT curvature, chromatic aberration or transition; those go through postPass on the CPU).
 * The browser runs these as native fills and scaled draws, several times faster than per-pixel script:
 *  - bloom: the blurred cell grid, upscaled bilinearly (as the shader samples it) and added ('lighter');
 *  - cell grid: 1 px lines in mix(bg, accent, .35) at grid × .6;
 *  - scanlines × vignette (a mask computed once per size) and flicker: black at the shader's darkening
 *    factor ('source-atop', so a transparent export keeps its alpha, as in the shader).
 * Film grain is added on the CPU before putImageData (see grainPass).
 * One deviation from COMPOSE_FS: the shader clamps after scanlines and vignette, the canvas clamps each
 * step, so bloomed highlights above white come out slightly darker under scanlines or a vignette.
 */
import type { ComposeFrame } from './compose';
import { hash12 } from './core';

export interface OverlayCache {
  bloom?: HTMLCanvasElement;
  bloomImg?: ImageData;
  shade?: { key: string; canvas: HTMLCanvasElement };
}

const css = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

/** Whether drawOverlays has anything to draw for this frame. */
export function hasOverlays(f: ComposeFrame): boolean {
  const x = f.fx, opaque = !f.transparent;
  return x.scan > 0 || x.vig > 0 || x.flicker > 0 || (opaque && (x.grid > 0 || (x.bloom > 0 && !!f.bloom)));
}

export function drawOverlays(ctx: CanvasRenderingContext2D, f: ComposeFrame, cache: OverlayCache) {
  const { W, H, cw, ch, cols, rows, fx } = f;
  const opaque = !f.transparent;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;

  if (opaque && fx.bloom > 0 && f.bloom) {
    const B = f.bloom;
    if (!cache.bloom) cache.bloom = document.createElement('canvas');
    const cv = cache.bloom;
    if (cv.width !== cols || cv.height !== rows || !cache.bloomImg) {
      cv.width = cols; cv.height = rows;
      cache.bloomImg = cv.getContext('2d')!.createImageData(cols, rows);
    }
    const d = cache.bloomImg!.data;
    for (let i = 0, n = cols * rows; i < n; i++) {
      d[i * 4] = B[i * 3] * 255; d[i * 4 + 1] = B[i * 3 + 1] * 255; d[i * 4 + 2] = B[i * 3 + 2] * 255; d[i * 4 + 3] = 255;
    }
    cv.getContext('2d')!.putImageData(cache.bloomImg!, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    for (let k = fx.bloom * 1.4; k > 0.002; k -= 1) {
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(cv, 0, 0, cols * cw, rows * ch);
    }
    ctx.globalAlpha = 1;
  }

  ctx.globalCompositeOperation = 'source-over';
  if (opaque && fx.grid > 0) {
    const [br, bg, bb] = f.bg, [ar, ag, ab] = f.accent;
    ctx.fillStyle = css((br + (ar - br) * 0.35) * 255, (bg + (ag - bg) * 0.35) * 255, (bb + (ab - bb) * 0.35) * 255);
    ctx.globalAlpha = fx.grid * 0.6;
    // one path: crossings are covered once, like the shader's clamp(gx + gy, 0, 1)
    ctx.beginPath();
    for (let x = 0; x < W; x += cw) ctx.rect(x, 0, 1, H);
    for (let y = 0; y < H; y += ch) ctx.rect(0, y, W, 1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.globalCompositeOperation = 'source-atop';
  if (fx.scan > 0 || fx.vig > 0) {
    // scanlines × vignette only depend on the size: computed once (exactly, per pixel) into a black
    // mask whose alpha is 1 - factor, then blitted every frame
    const key = `${W}x${H}:${fx.scan}:${fx.vig}`;
    if (!cache.shade || cache.shade.key !== key) {
      const cv = cache.shade?.canvas ?? document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d')!;
      const img = cx.createImageData(W, H);
      const d = new Uint32Array(img.data.buffer);
      const vx = new Float32Array(W);
      for (let x = 0; x < W; x++) { const v = (x + 0.5) / W - 0.5; vx[x] = fx.vig * v * v * 2.2; }
      for (let y = 0; y < H; y++) {
        const fcy = H - y - 0.5; // gl_FragCoord.y counts from the bottom: period and phase of the scanlines
        const s = fx.scan > 0 ? 1 - fx.scan * 0.45 * (0.5 + 0.5 * Math.cos(fcy * 1.5708)) : 1;
        const v = fcy / H - 0.5, vy = fx.vig * v * v * 2.2;
        for (let x = 0, o = y * W; x < W; x++, o++) {
          const m = s * (1 - vx[x] - vy);
          d[o] = Math.round((1 - (m < 0 ? 0 : m)) * 255) << 24;
        }
      }
      cx.putImageData(img, 0, 0);
      cache.shade = { key, canvas: cv };
    }
    ctx.drawImage(cache.shade.canvas, 0, 0);
  }
  if (fx.flicker > 0) {
    const T = f.realT;
    const k = fx.flicker * 0.12 * (0.5 + 0.5 * Math.sin(T * 53)) * hash12(Math.floor(T * 12), 3);
    if (k > 0) { ctx.fillStyle = css(0, 0, 0, k); ctx.fillRect(0, 0, W, H); }
  }
  ctx.restore();
}
