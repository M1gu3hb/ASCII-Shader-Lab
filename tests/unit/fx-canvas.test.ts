import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyFinishes, defaultFinish, finishPoolStats, releaseFinishes } from '../../src/fx';
import { MAX_POOL } from '../../src/fx/canvas';

/**
 * A minimal stand-in for a 2D canvas (node has no DOM): pixels in a Uint8ClampedArray, drawImage copies
 * another fake canvas at (0, 0), getImageData/putImageData copy whole frames.
 */
class FakeCanvas {
  private w = 0; private h = 0;
  px = new Uint8ClampedArray(0);
  get width() { return this.w; }
  set width(v: number) { this.w = v; this.px = new Uint8ClampedArray(this.w * this.h * 4); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; this.px = new Uint8ClampedArray(this.w * this.h * 4); }
  getContext() {
    const c = this;
    return {
      clearRect: () => c.px.fill(0),
      drawImage: (src: FakeCanvas) => {
        for (let y = 0; y < Math.min(c.h, src.height); y++) for (let x = 0; x < Math.min(c.w, src.width); x++) {
          for (let k = 0; k < 4; k++) c.px[(y * c.w + x) * 4 + k] = src.px[(y * src.width + x) * 4 + k];
        }
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(c.px), width: w, height: h }),
      putImageData: (img: { data: Uint8ClampedArray }) => c.px.set(img.data),
    };
  }
}

function source(w: number, h: number, v = 200): FakeCanvas {
  const c = new FakeCanvas();
  c.width = w; c.height = h;
  for (let i = 0; i < c.px.length; i += 4) { c.px[i] = v; c.px[i + 1] = v / 2; c.px[i + 2] = 30; c.px[i + 3] = 255; }
  return c;
}

const ctx = { t: 0, seed: 'p', scale: 1, quality: 'final' as const };
const run = (src: FakeCanvas, key: string, finishes = [defaultFinish('invert')]) =>
  applyFinishes(src as unknown as HTMLCanvasElement, finishes, ctx, key) as unknown as FakeCanvas;

describe('applyFinishes on canvases (pool)', () => {
  const g = globalThis as unknown as { document?: unknown; HTMLImageElement?: unknown };
  const had = g.document;
  beforeAll(() => { g.document = { createElement: () => new FakeCanvas() }; });
  afterAll(() => { releaseFinishes(); g.document = had; });

  it('returns a canvas of the input size with the result, and reuses it for the same key', () => {
    const a = run(source(8, 6), 'capa-1');
    expect([a.width, a.height]).toEqual([8, 6]);
    expect(a.px[0]).toBe(55); // 255 − 200
    const b = run(source(8, 6, 100), 'capa-1');
    expect(b).toBe(a);
    expect(b.px[0]).toBe(155);
    const c = run(source(8, 6), 'capa-2');
    expect(c).not.toBe(a);
  });

  it('resizes the pooled canvas when the input size changes, and copies when nothing is on', () => {
    const a = run(source(10, 4), 'capa-1');
    expect([a.width, a.height]).toEqual([10, 4]);
    const off = { ...defaultFinish('invert'), on: false };
    const b = run(source(10, 4, 90), 'capa-1', [off]);
    expect(b.px[0]).toBe(90);
  });

  it('applies to its own output canvas without reading garbage', () => {
    const a = run(source(5, 5, 200), 'self');
    const again = applyFinishes(a as unknown as HTMLCanvasElement, [defaultFinish('invert')], ctx, 'self') as unknown as FakeCanvas;
    expect(again).toBe(a);
    expect(again.px[0]).toBe(200);
  });

  it('keeps at most MAX_POOL canvases, frees the least recently used, and releases on demand', () => {
    releaseFinishes();
    const first = run(source(4, 4), 'k0');
    for (let i = 1; i <= MAX_POOL + 3; i++) run(source(4, 4), `k${i}`);
    expect(finishPoolStats().canvases).toBe(MAX_POOL);
    expect(first.width).toBe(0); // evicted: its pixels are released
    const kept = run(source(4, 4), `k${MAX_POOL + 3}`);
    releaseFinishes(`k${MAX_POOL + 3}`);
    expect(kept.width).toBe(0);
    expect(finishPoolStats().canvases).toBe(MAX_POOL - 1);
    releaseFinishes();
    expect(finishPoolStats()).toMatchObject({ canvases: 0, pixels: 0, scratchBytes: 0 });
  });
});
