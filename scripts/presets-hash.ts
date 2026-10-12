/**
 * Development aid: a fingerprint of how every studio recipe (src/studio/presets.ts) draws, in Node, without a
 * browser: the basic engine's field and select passes (the cells' luminance, colour and glyph) at three moments,
 * hashed per recipe. Run it on two trees (a commit unpacked with `git archive` and this one) and diff the lists:
 * a recipe that was already published must give the same line (rule 2 of the closing of PR #10). A picture and a
 * text are synthetic; the pointer and the compose pass (pixels) are left out.
 *
 *   npx tsx scripts/presets-hash.ts <root of the tree>   > hashes.txt
 */
import { createHash } from 'node:crypto';

const root = process.argv[2] ?? '.';
const imp = (p: string) => import(root + p);
await imp('/src/families/all.ts');
const { PRESETS } = await imp('/src/studio/presets.ts');
const { FieldBuffers, fieldLayers, runField, pulseAt } = await imp('/src/engine/basic/field.ts');
const { SelectBuffers, runSelect } = await imp('/src/engine/basic/select.ts');
const { bakeGradient } = await imp('/src/engine/color.ts');
const { opticsUniforms } = await imp('/src/engine/opticsU.ts');
const { pieceTime } = await imp('/src/engine/loop.ts');

const COLS = 48, ROWS = 27, CW = 10, CH = 14, W = COLS * CW, H = ROWS * CH;
const media = { w: 64, h: 40, natW: 640, natH: 400, data: new Uint8ClampedArray(64 * 40 * 4) };
for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) {
  const o = (y * 64 + x) * 4;
  media.data[o] = x * 4; media.data[o + 1] = y * 6; media.data[o + 2] = (x * y) % 255; media.data[o + 3] = 255;
}
const text = { w: 96, h: 54, data: new Uint8Array(96 * 54) };
for (let y = 10; y < 44; y++) for (let x = 8; x < 88; x++) if ((x >> 3) % 2 === 0 || y % 9 < 3) text.data[y * 96 + x] = 255;

for (const [space, list] of Object.entries(PRESETS) as Array<[string, Array<{ id: string; make: () => any }>]>) {
  for (const p of list) {
    const r = p.make();
    const h = createHash('sha1');
    for (const t of [0.7, 3.3, 11.9]) {
      const n = COLS * ROWS, F = new FieldBuffers(n), S = new SelectBuffers(n);
      const tq = pieceTime(t, r.motion);
      const src = ['image', 'video', 'camera'].includes(r.source) ? 'media' : r.source === 'text' ? 'text' : 'pattern';
      runField({
        W, H, cw: CW, ch: CH, cols: COLS, rows: ROWS, time: tq, loop: r.motion.loop, layers: fieldLayers(r, W, H),
        warp: r.motion.warp, warpScale: r.motion.warpScale, pulse: pulseAt(r.motion, tq, 0),
        src, mediaMix: r.media.mix, mediaBlend: 0, morph: 0, media: src === 'media' ? media : null, fit: 0, zoom: 1, panX: 0, panY: 0, mirror: false,
        text: src === 'text' ? text : null, imode: 0, ptrX: -1e4, ptrY: -1e4, ptrOn: 0, istr: 0, irad: 0.2, sim: null,
        optics: r.optics ? opticsUniforms(r.optics, tq, r.motion.loop) : null,
      }, F);
      runSelect({
        cols: COLS, rows: ROWS, time: tq, r, fa: F.a, fr: F.r, fg: F.g, fb: F.b, isMedia: src === 'media',
        grad: bakeGradient(r.color.stops), n: 10, edgeBase: 10, blockIdx: 14, words: Uint16Array.of(30, 31),
        msg: { on: false, mode: 0, prog: 0, win: 6, shift: 0, data: new Uint8Array(4), width: 1, cursorX: -9, cursorY: -9, cursorOn: false, color: null },
        imode: 0, ptrCellX: -1e4, ptrCellY: -1e4, ptrOn: 0, istr: 0, iradCells: 1, aspect: CH / CW,
      }, S);
      h.update(F.a); h.update(F.r); h.update(F.g); h.update(F.b); h.update(S.rgb); h.update(S.lum); h.update(new Uint8Array(S.idx.buffer));
    }
    console.log(`${space}/${p.id} ${h.digest('hex').slice(0, 16)}`);
  }
}
