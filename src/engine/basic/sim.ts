/**
 * Pointer simulation on the cell grid (ripples, erase and paint trails), a port of SIM_FS in
 * ../glsl/programs.ts. Values stay in floats (like the half-float path of the GPU engine). Pure: no DOM.
 */
import { eraseRate, paintRate } from '../touch';
import { INK_DRY } from '../pointer';
import { hash12 } from './core';

const fr = Math.fround;

/** «Pincel caligráfico» (../pointer.ts): the brush's radius where the segment starts, how dry it runs, how far the ink bleeds. */
export interface CalligraphyStep { r0: number; dry: number; bleed: number }

export class SimGrid {
  cols = 0; rows = 0;
  h = new Float32Array(0);   // height
  hp = new Float32Array(0);  // previous height
  tr = new Float32Array(0);  // trail (erase / paint)
  private nh = new Float32Array(0);
  private ntr = new Float32Array(0);

  resize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) { this.reset(); return; }
    this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.h = new Float32Array(n); this.hp = new Float32Array(n); this.tr = new Float32Array(n);
    this.nh = new Float32Array(n); this.ntr = new Float32Array(n);
  }

  reset() { this.h.fill(0); this.hp.fill(0); this.tr.fill(0); }

  /**
   * One step. mode: 2 ripple, 6 erase, 7 paint (INTERACT_MODES index). seg: pointer segment in device px
   * (previous → current); brushR in device px; decay: the trails' «Duración» (0.5: as they always were).
   */
  step(mode: number, cw: number, ch: number, seg: [number, number, number, number], brushR: number,
    str: number, active: number, impulse: number, dt: number, decay = 0.5, cal: CalligraphyStep | null = null) {
    const er = eraseRate(decay), pr = paintRate(decay);
    const { cols, rows, h, hp, tr, nh, ntr } = this;
    const ky = (cw * cw) / (ch * ch);
    const kx = 1 / Math.max(1, ky), kyy = ky / Math.max(1, ky);
    const [ax, ay, bx, by] = seg;
    const bax = bx - ax, bay = by - ay, bb = Math.max(bax * bax + bay * bay, 1e-6);
    const br = Math.max(brushR, 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const hh = h[i];
        let t = tr[i];
        let n = 0;
        const px = (c + 0.5) * cw, py = (r + 0.5) * ch;
        const pax = px - ax, pay = py - ay;
        let k = (pax * bax + pay * bay) / bb; k = k < 0 ? 0 : k > 1 ? 1 : k;
        const dx = pax - bax * k, dy = pay - bay * k;
        const dd = Math.sqrt(dx * dx + dy * dy) / br;
        const brush = Math.exp(-dd * dd * 2.5);
        if (mode === 2) {
          const lap = kx * (at(h, cols, rows, c + 1, r) + at(h, cols, rows, c - 1, r) - 2 * hh)
            + kyy * (at(h, cols, rows, c, r + 1) + at(h, cols, rows, c, r - 1) - 2 * hh);
          n = (2 * hh - hp[i] + 0.45 * lap) * 0.985;
          n += brush * str * (active * 0.35 + impulse * 1.6);
          t = 0;
        } else if (mode === 6) t = Math.max(t - dt * er, brush * active);
        else if (mode === 7 && cal) {
          // the calligraphic brush (SIM_FS): width from r0 to brushR along the segment, dry hairs when fast
          const rad = Math.max(cal.r0 + (brushR - cal.r0) * k, 1);
          const d = Math.sqrt(dx * dx + dy * dy) / rad;
          const across = (dx * bay - dy * bax) / Math.sqrt(bb) / rad;
          const hair = 0.5 + 0.5 * Math.sin(across * 11 + 1.7) * Math.sin(across * 4.3 + 0.4);
          let hs = (hair - 0.25) / 0.5; hs = hs < 0 ? 0 : hs > 1 ? 1 : hs;
          const ink = Math.exp(-d * d * 3.2) * (1 + (hs * hs * (3 - 2 * hs) - 1) * cal.dry);
          t = Math.max(t * Math.exp(-dt * pr * INK_DRY), ink * active * (0.4 + str * 0.8));
          // the ink bleeds into the paper: a cell soaks up part of its wettest neighbour's
          const nb = Math.max(Math.max(at(tr, cols, rows, c + 1, r), at(tr, cols, rows, c - 1, r)), Math.max(at(tr, cols, rows, c, r + 1), at(tr, cols, rows, c, r - 1)));
          const soak = nb * cal.bleed * (0.35 + 0.4 * hash12(fr(fr(c * fr(0.73)) + fr(3.1)), fr(fr(r * fr(0.73)) + fr(3.1))));
          if (soak > t) t += (soak - t) * Math.min(1, dt * 4);
        }
        else if (mode === 7) t = Math.max(t * Math.exp(-dt * pr), brush * active * (0.4 + str * 0.8));
        else t = 0;
        nh[i] = n < -1.9 ? -1.9 : n > 1.9 ? 1.9 : n;
        ntr[i] = t < 0 ? 0 : t > 1 ? 1 : t;
      }
    }
    // rotate buffers: hp ← h (clamped like the shader), h ← nh, tr ← ntr
    for (let i = 0; i < h.length; i++) hp[i] = h[i] < -1.9 ? -1.9 : h[i] > 1.9 ? 1.9 : h[i];
    this.h = nh; this.nh = h;
    this.tr = ntr; this.ntr = tr;
  }
}

/** Height at a cell, clamped to the grid (texelFetch with clamped coordinates in the shader). */
function at(h: Float32Array, cols: number, rows: number, c: number, r: number) {
  c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
  r = r < 0 ? 0 : r >= rows ? rows - 1 : r;
  return h[r * cols + c];
}
