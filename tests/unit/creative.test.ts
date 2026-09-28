import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MSG_ANIMS, TEXT_ANIMS, XFORM_KINDS, XFORM_MAX, defaultRecipe, normAnim, normXforms, normalizeRecipe, sameRecipe, type Recipe,
} from '../../src/engine/recipe';
import { XFORMS, xformK } from '../../src/engine/catalog';
import { activeXforms, trailDecay, xformStages } from '../../src/engine/xform';
import { runStage, updateTrail } from '../../src/engine/basic/xform';
import { animateMessage, letterPose, movedCell } from '../../src/engine/letters';
import { layoutMessage, messageState } from '../../src/engine/text';

const json = (r: Recipe) => JSON.parse(JSON.stringify(r)) as Recipe;
const fixture = (v: number) => JSON.parse(readFileSync(join(import.meta.dirname, `fixtures/generator-v${v}.json`), 'utf8')) as { cases: Array<{ recipe: Recipe }> };

describe('recetas: transformaciones y letras que se mueven', () => {
  it('las recetas de antes se quedan exactamente como eran (sin campos nuevos)', () => {
    // (cases with a media reference carry a made-up id that normalisation drops: left out)
    for (const v of [1, 2]) for (const c of fixture(v).cases.filter(x => !x.recipe.media.ref)) {
      const n = json(normalizeRecipe(c.recipe));
      expect(n).toEqual(c.recipe);
      expect(JSON.stringify(n)).toBe(JSON.stringify(c.recipe));
      expect('xform' in n.media).toBe(false);
      expect('anim' in n.text).toBe(false);
      expect('anim' in n.msg).toBe(false);
    }
    const d = json(defaultRecipe());
    expect(d.media.xform).toBeUndefined();
    expect(d.text.anim).toBeUndefined();
  });

  it('las transformaciones se validan: tipos conocidos, cada uno una vez, hasta cuatro, en su orden', () => {
    expect(normXforms(undefined)).toEqual([]);
    expect(normXforms('semitono')).toEqual([]);
    const x = normXforms([
      { kind: 'caleido', amount: 2, p: -1 },
      { kind: 'nada' },
      { kind: 'caleido', amount: 0.3 },
      { kind: 'bandas', on: false },
      null,
      { kind: 'semitono', amount: '0.5', p: 0.2 },
      { kind: 'contorno' },
      { kind: 'estela' },
    ]);
    expect(x.map(t => t.kind)).toEqual(['caleido', 'bandas', 'semitono', 'contorno']);
    expect(x.length).toBe(XFORM_MAX);
    expect(x[0]).toEqual({ kind: 'caleido', on: true, amount: 1, p: 0 });
    expect(x[1].on).toBe(false);
    expect(x[2].amount).toBe(0.5);
  });

  it('las animaciones por letra sólo existen donde tienen sentido', () => {
    expect(normAnim({ kind: 'ola', amount: 3, speed: 9 }, TEXT_ANIMS)).toEqual({ kind: 'ola', amount: 1, speed: 3 });
    expect(normAnim({ kind: 'latido' }, MSG_ANIMS)).toBeUndefined();
    expect(normAnim({ kind: 'color' }, TEXT_ANIMS)).toBeUndefined();
    expect(normAnim({ kind: 'color' }, MSG_ANIMS)).toEqual({ kind: 'color', amount: 0.5, speed: 1 });
    expect(normAnim(undefined, MSG_ANIMS)).toBeUndefined();
  });

  it('una receta con todo lo nuevo viaja como JSON sin cambiar, y lo desconocido se ignora', () => {
    const r = defaultRecipe();
    r.source = 'image';
    r.media.ref = { id: '0123456789abcdef', kind: 'image', w: 10, h: 10 };
    r.media.xform = [{ kind: 'semitono', on: true, amount: 0.8, p: 0.3 }, { kind: 'estela', on: false, amount: 0.5, p: 0.5 }];
    r.text.anim = { kind: 'explosion', amount: 0.6, speed: 1.2 };
    r.msg = { ...r.msg, on: true, mode: 'words', anim: { kind: 'color', amount: 1, speed: 0.5 } };
    const n = normalizeRecipe(json(r));
    expect(sameRecipe(n, r)).toBe(true);
    // an edit appends the new keys at the end: the normalised copy keeps that order
    expect(JSON.stringify(n)).toBe(JSON.stringify(r));
    const odd = normalizeRecipe({ ...json(r), msg: { ...r.msg, mode: 'baile' } });
    expect(odd.msg.mode).toBe('type');
  });

  it('cada transformación tiene nombre, línea, ajustes y valores iniciales; el catálogo sigue el orden de los motores', () => {
    expect(XFORMS.map(x => x.id)).toEqual(XFORM_KINDS);
    for (const x of XFORMS) {
      expect(x.name, x.id).toMatch(/\S/);
      expect(x.desc, x.id).toMatch(/\S/);
      expect(x.pFmt(x.defaults.p), x.id).toMatch(/\S/);
      expect(x.defaults.amount).toBeGreaterThan(0);
    }
    expect(xformK('bandas', 0)).toBe(2);
    expect(xformK('bandas', 1)).toBe(8);
    expect(xformK('caleido', 1)).toBe(12);
    expect(xformK('contorno', 1)).toBe(3);
  });

  it('sólo cuentan las transformaciones encendidas y con fuerza, y nunca sobre un patrón', () => {
    const r = defaultRecipe();
    r.media.xform = [{ kind: 'semitono', on: true, amount: 0.5, p: 0.5 }, { kind: 'bandas', on: false, amount: 1, p: 0.5 }, { kind: 'caleido', on: true, amount: 0, p: 0.5 }];
    expect(activeXforms(r, 'media').map(x => x.kind)).toEqual(['semitono']);
    expect(activeXforms(r, 'text').map(x => x.kind)).toEqual(['semitono']);
    expect(activeXforms(r, 'pattern')).toEqual([]);
    const st = xformStages([{ kind: 'arrastre', on: true, amount: 0.5, p: 0.5 }, { kind: 'desplazar', on: true, amount: 1, p: 0 }], 100, 40, 1.5);
    expect(st[0].k).toBe(24);
    expect(st[1].k).toBe(60);
    expect(trailDecay(0, 1)).toBe(1);
    expect(trailDecay(1, 1)).toBeCloseTo(Math.exp(-1));
  });
});

describe('transformaciones en la CPU', () => {
  const cols = 24, rows = 12;
  const grid = (f: (x: number, y: number) => [number, number, number]) => {
    const g = new Uint8Array(cols * rows * 3);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const [r, gg, b] = f(x, y); const i = (y * cols + x) * 3; g[i] = r; g[i + 1] = gg; g[i + 2] = b; }
    return g;
  };
  const env = { cols, rows, aspect: 1, time: 0, pat: new Uint8Array(cols * rows).fill(128), trail: new Uint8Array(cols * rows * 3) };
  const stage = (kind: (typeof XFORM_KINDS)[number], amount = 1, p = 0.5) => xformStages([{ kind, on: true, amount, p }], cols, rows, 1)[0];

  it('Bandas deja cada canal en pocas tintas', () => {
    const inp = grid((x, y) => [x * 10, y * 20, 128]);
    const out = new Uint8Array(inp.length);
    runStage(stage('bandas', 1, 0), inp, out, env);
    expect(new Set(out).size).toBeLessThanOrEqual(2);
  });

  it('Caleidoscopio con dos espejos es simétrico de izquierda a derecha', () => {
    const inp = grid((x, y) => [x * 9, y * 17, (x * y) % 255]);
    const out = new Uint8Array(inp.length);
    runStage(stage('caleido', 1, 0), inp, out, env);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols / 2; x++) {
      const a = (y * cols + x) * 3, b = (y * cols + (cols - 1 - x)) * 3;
      expect(out[a]).toBe(out[b]);
    }
  });

  it('sin fuerza, las que mezclan o desplazan dejan la fuente como está', () => {
    const inp = grid((x, y) => [x * 9, y * 17, 60]);
    for (const k of ['semitono', 'contorno', 'bandas', 'caleido', 'canales', 'bloques', 'ondular', 'desplazar', 'arrastre'] as const) {
      const out = new Uint8Array(inp.length);
      runStage(stage(k, 0), inp, out, env);
      expect(Array.from(out), k).toEqual(Array.from(inp));
    }
  });

  it('Estela: lo que se mueve deja rastro, lo quieto no', () => {
    const a = grid(x => (x === 5 ? [255, 255, 255] : [10, 10, 10]));
    const b = grid(x => (x === 9 ? [255, 255, 255] : [10, 10, 10]));
    const t0 = new Uint8Array(a.length), t1 = new Uint8Array(a.length);
    updateTrail(b, a, t0, t1, 0.8, true);
    expect(t1[(3 * cols + 5) * 3]).toBeGreaterThan(0);
    expect(t1[(3 * cols + 9) * 3]).toBeGreaterThan(0);
    expect(t1[(3 * cols + 15) * 3]).toBe(0);
    // the first frame has nothing to compare with: no trail
    updateTrail(b, a, t0, t1, 0.8, false);
    expect(t1.every(v => v === 0)).toBe(true);
  });
});

describe('letras que se mueven', () => {
  const idx = (c: string) => c.charCodeAt(0) % 60;
  it('el mensaje en ola conserva todas sus letras y las mueve sólo en vertical', () => {
    const lay = layoutMessage('hola terminal', 40, 12, 0.5, 0.5, 'center', false, idx);
    const count = (d: Uint8Array) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] * 256) n++; return n; };
    for (const t of [0, 0.4, 1.3, 2.9]) {
      const d = animateMessage(lay, { kind: 'ola', amount: 1, speed: 1 }, t, 12, 10);
      expect(count(d)).toBe(count(lay.data));
    }
    const moved = animateMessage(lay, { kind: 'ola', amount: 1, speed: 1 }, 0.7, 12, 10);
    expect(Array.from(moved)).not.toEqual(Array.from(lay.data));
    expect(movedCell(lay, { kind: 'color', amount: 1, speed: 1 }, 1, 12, [3, 4], 0)).toEqual([3, 4]);
  });

  it('palabra a palabra: el mensaje sólo muestra palabras enteras', () => {
    const lay = layoutMessage('uno dos tres', 40, 12, 0.5, 0.5, 'center', false, idx);
    expect(lay.spans).toEqual([[0, 3], [4, 7], [8, 12]]);
    const m = { ...defaultRecipe().msg, mode: 'words' as const, speed: 10 };
    for (let t = 0; t < 4; t += 0.05) {
      const st = messageState(m, lay.count, t, lay.spans);
      const shown = Math.floor(st.prog);
      expect(lay.spans.some(([a, b]) => shown > a && shown < b), `t=${t} prog=${st.prog}`).toBe(false);
      expect(st.cursorOn).toBe(false);
    }
  });

  it('una explosión vuelve a su sitio: fuera del estallido cada letra está donde va', () => {
    const slot = { k: 3, n: 8, word: 0, words: 1, cx: 40, cy: 0 };
    const still = letterPose({ kind: 'explosion', amount: 1, speed: 1 }, 0.5, slot, 100, 300);
    expect(still).toEqual({ dx: 0, dy: 0, rot: 0, scale: 1, grey: 1, glyph: null });
    const out = letterPose({ kind: 'explosion', amount: 1, speed: 1 }, 2.7, slot, 100, 300);
    expect(Math.hypot(out.dx, out.dy)).toBeGreaterThan(50);
  });
});
