import { expect, test, type Page } from '@playwright/test';
import { normalizeRecipe, type Recipe } from '../../src/engine/recipe';
import { familyLayer, familyRecipe } from '../../src/families/recipes';
import '../../src/families/all';
import { familyById } from '../../src/families/registry';
import { encodeRecipe } from '../../src/shared/share';
import { openStudio } from './helpers';

/**
 * GPU resources of the WebGL studio (closing of PR #10). The page's WebGL 2 calls are counted: every texture,
 * framebuffer, renderbuffer, program, shader, buffer and vertex array created and not yet deleted, per context,
 * and the bytes the page asked for its textures and renderbuffers (texImage2D, texStorage2D,
 * renderbufferStorage: width × height × bytes of the format). That is what the page requests from the driver,
 * counted from its own calls: not a measurement of video memory (no web API gives one), and a driver may use
 * more or less. A lost context frees what it had (the counts of that context start again from zero).
 *
 * The bound: going through the same changes again (other sources, one to four layers, glass and effect shapes,
 * an export cancelled or finished, a lost and restored context) leaves the same live objects as the first time
 * round, so nothing piles up with use. A directed test (a few minutes): not part of the quick CI subset.
 */

declare global {
  interface Window { __gpu?: () => GpuCount }
}
interface GpuCount { contexts: number; tex: number; fbo: number; rb: number; prog: number; sh: number; buf: number; vao: number; bytes: number }

/** Runs in the page before its own code: wraps the WebGL 2 calls that make and free GPU objects. */
function countGpu() {
  const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const KINDS: Record<string, string> = { Texture: 'tex', Framebuffer: 'fbo', Renderbuffer: 'rb', Program: 'prog', Shader: 'sh', Buffer: 'buf', VertexArray: 'vao' };
  type Sets = Record<string, Set<unknown>> & { bytes: Map<unknown, number> };
  const live = new Map<WebGL2RenderingContext, Sets>();
  const setsOf = (gl: WebGL2RenderingContext): Sets => {
    let s = live.get(gl);
    if (!s) {
      s = Object.assign(Object.fromEntries(Object.values(KINDS).map(k => [k, new Set()])), { bytes: new Map() }) as Sets;
      live.set(gl, s);
      const own = s;
      (gl.canvas as EventTarget).addEventListener?.('webglcontextlost', () => { for (const k of Object.values(KINDS)) own[k].clear(); own.bytes.clear(); });
    }
    return s;
  };
  for (const [name, k] of Object.entries(KINDS)) {
    const make = P['create' + name], free = P['delete' + name];
    P['create' + name] = function (this: WebGL2RenderingContext, ...a: unknown[]) { const o = make.apply(this, a); if (o) setsOf(this)[k].add(o); return o; };
    P['delete' + name] = function (this: WebGL2RenderingContext, o: unknown) { if (o) { const s = setsOf(this); s[k].delete(o); s.bytes.delete(o); } return free.call(this, o); };
  }
  const BPP: Record<number, number> = { 0x8058: 4, 0x1908: 4, 0x1907: 3, 0x8051: 3, 0x8229: 1, 0x1903: 1, 0x1909: 1, 0x822b: 2, 0x881a: 8, 0x8814: 16, 0x822d: 2, 0x822e: 4, 0x822f: 4, 0x8230: 8, 0x8c43: 4, 0x81a5: 2, 0x81a6: 3, 0x88f0: 4, 0x8cac: 4, 0x8d48: 1 };
  const bound = (gl: WebGL2RenderingContext, target: number) => gl.getParameter(target === gl.TEXTURE_3D ? gl.TEXTURE_BINDING_3D : target === gl.TEXTURE_2D_ARRAY ? gl.TEXTURE_BINDING_2D_ARRAY : gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  const note = (gl: WebGL2RenderingContext, o: unknown, n: number) => { if (o) setsOf(gl).bytes.set(o, n); };
  const texImage = P.texImage2D;
  P.texImage2D = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    if (a[1] === 0) {
      const fmt = a[2] as number;
      let w = 0, h = 0;
      if (typeof a[3] === 'number' && typeof a[4] === 'number' && a.length >= 8) { w = a[3]; h = a[4]; } else {
        const src = a[a.length - 1] as { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number } | null;
        w = src?.videoWidth || src?.naturalWidth || src?.width || 0; h = src?.videoHeight || src?.naturalHeight || src?.height || 0;
      }
      if (a[0] === this.TEXTURE_2D) note(this, bound(this, this.TEXTURE_2D), w * h * (BPP[fmt] ?? 4));
    }
    return texImage.apply(this, a);
  };
  const texStorage = P.texStorage2D;
  P.texStorage2D = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    const [target, levels, fmt, w, h] = a as number[];
    note(this, bound(this, target), Math.round(w * h * (BPP[fmt] ?? 4) * (levels > 1 ? 4 / 3 : 1)));
    return texStorage.apply(this, a);
  };
  const tex3d = P.texImage3D;
  P.texImage3D = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    if (a[1] === 0 && typeof a[3] === 'number') note(this, bound(this, a[0] as number), (a[3] as number) * (a[4] as number) * (a[5] as number) * (BPP[a[2] as number] ?? 4));
    return tex3d.apply(this, a);
  };
  const rbStorage = P.renderbufferStorage;
  P.renderbufferStorage = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    note(this, this.getParameter(this.RENDERBUFFER_BINDING), (a[2] as number) * (a[3] as number) * (BPP[a[1] as number] ?? 4));
    return rbStorage.apply(this, a);
  };
  window.__gpu = () => {
    const c: GpuCount = { contexts: 0, tex: 0, fbo: 0, rb: 0, prog: 0, sh: 0, buf: 0, vao: 0, bytes: 0 };
    for (const [gl, s] of live) {
      if (gl.isContextLost()) continue;
      c.contexts++;
      for (const k of Object.values(KINDS)) (c as unknown as Record<string, number>)[k] += s[k].size;
      for (const n of s.bytes.values()) c.bytes += n;
    }
    return c;
  };
}

const gpu = (page: Page) => page.evaluate(() => window.__gpu!());
const fmt = (c: GpuCount) => `${c.contexts} ctx · ${c.tex} tex · ${c.fbo} fbo · ${c.rb} rb · ${c.prog} prog · ${c.sh} sh · ${c.buf} buf · ${c.vao} vao · ${(c.bytes / 2 ** 20).toFixed(1)} MiB pedidos`;
/** The live objects, without the bytes (an export's sizes are its own). */
const objects = ({ bytes: _b, ...rest }: GpuCount) => rest;

function withLayers(r: Recipe, more: Array<[string, string]>) {
  more.forEach(([id, preset], i) => r.layers.push(familyLayer(familyById(id)!, `gpu-${i + 1}`, preset, { blend: 'screen', mix: 0.5 })));
  return r;
}
/** One analytic layer over the pattern source. */
const ONE = () => normalizeRecipe(familyRecipe('mar', familyById('mar')!.presets[0].id, undefined, 'gpu-0'));
/** Four layers (simulations and colour rasters), a ball of glass in front, the anamorphic flare. */
const FOUR = () => {
  const r = withLayers(familyRecipe('reaccion_difusion', 'coral', undefined, 'gpu-0'), [['ecos', 'tunel_arcoiris'], ['humo', 'aurora'], ['fluido', familyById('fluido')!.presets[0].id]]);
  r.optics = { kind: 'esfera', amount: 1, scale: 1.2, speed: 0.6, angle: 0, profile: 0, shine: 0.8, fog: 0, x: 0, y: 0, ior: 1.5, thick: 1, disp: 0.4, tint: '#ffffff' };
  r.fx.bloom = 0.6; r.fxKind = { bloom: 'anamorfico' };
  return normalizeRecipe(r);
};
/** Words as the source, a family made of them (chrome letters), on a sheet of folded paper. */
const WORDS = () => {
  const r = familyRecipe('cromado', 'letras', undefined, 'gpu-0');
  r.source = 'text';
  r.text = { ...r.text, content: 'HOLA', size: 0.9 };
  r.media = { ...r.media, mix: 1, blend: 'normal' };
  r.fx.grain = 0.7; r.fxKind = { grain: 'papel', fold: 'carta' };
  return normalizeRecipe(r);
};

/** The most the page asked for at once, over every piece shown (bytes). */
let peak = 0;
async function show(page: Page, code: string) {
  await page.evaluate(c => { location.hash = '#r=' + c; }, code);
  // the new piece is on stage, its families loaded and stepping, what it replaced released
  await page.waitForTimeout(5000);
  peak = Math.max(peak, (await gpu(page)).bytes);
}

test.describe('recursos de GPU del estudio (WebGL 2)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('fuentes, capas, vidrio y acabados, exportaciones y un contexto perdido: lo vivo vuelve a lo mismo en cada vuelta', async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(countGpu);
    const [one, four, words] = await Promise.all([encodeRecipe(ONE()), encodeRecipe(FOUR()), encodeRecipe(WORDS())]);
    const errors = await openStudio(page, `#r=${one}`);
    await expect.poll(async () => (await gpu(page)).contexts, { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(4000);
    const start = await gpu(page);
    const notes = [`inicio (una capa): ${fmt(start)}`];

    // 1. the same round of pieces three times: one layer → four layers with glass and flare → words on paper → one layer
    const rounds: GpuCount[] = [];
    for (let k = 0; k < 3; k++) {
      await show(page, four);
      if (k === 0) notes.push(`cuatro capas + vidrio + destello: ${fmt(await gpu(page))}`);
      await show(page, words);
      if (k === 0) notes.push(`palabras de cromo en papel: ${fmt(await gpu(page))}`);
      await show(page, one);
      rounds.push(await gpu(page));
      notes.push(`vuelta ${k + 1}, otra vez una capa: ${fmt(rounds[k])}`);
      console.log(notes.at(-1));
    }
    // what the first round made for the first time (programs of each layout, kept in the engine's cache) may stay;
    // the later rounds add nothing
    expect(objects(rounds[2]), notes.join('\n')).toEqual(objects(rounds[1]));
    expect(rounds[2].bytes, notes.join('\n')).toBe(rounds[1].bytes);
    for (const k of ['tex', 'fbo', 'rb', 'buf', 'vao'] as const) expect(rounds[2][k], `${k}\n${notes.join('\n')}`).toBeLessThanOrEqual(rounds[0][k]);

    // 2. exports: a GIF cancelled and one finished, twice; what they made is freed with them
    const gifSheet = async () => {
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Video y GIF' }).click();
      await page.getByLabel('Duración (s)').fill('1');
      await page.getByRole('radio', { name: '320 px' }).click();
    };
    const exportRound = async () => {
      await gifSheet();
      await page.getByRole('button', { name: 'Descargar GIF' }).click();
      await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.toast').filter({ hasText: 'Exportación cancelada' }).last()).toBeVisible();
      await page.waitForTimeout(1500);
      await gifSheet();
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.getByRole('button', { name: 'Descargar GIF' }).click()]);
      expect(d.suggestedFilename()).toMatch(/\.gif$/);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(3000);
      return gpu(page);
    };
    const ex1 = await exportRound();
    const ex2 = await exportRound();
    notes.push(`tras exportar (1): ${fmt(ex1)}`, `tras exportar (2): ${fmt(ex2)}`);
    expect(objects(ex2), notes.join('\n')).toEqual(objects(ex1));
    expect(ex2.contexts, notes.join('\n')).toBe(rounds[2].contexts);

    // 3. the stage's context lost and given back: it makes again what it needs, no more than it had
    const before = await gpu(page);
    await page.evaluate(async () => {
      const ext = document.querySelector<HTMLCanvasElement>('.stage canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      ext.loseContext();
      await new Promise(r => setTimeout(r, 600));
      ext.restoreContext();
    });
    await page.waitForTimeout(5000);
    const after = await gpu(page);
    notes.push(`antes de perder el contexto: ${fmt(before)}`, `contexto recuperado: ${fmt(after)}`);
    expect(await page.locator('.stage canvas').first().evaluate(c => (c as HTMLCanvasElement).getContext('webgl2')?.isContextLost())).toBe(false);
    for (const k of ['tex', 'fbo', 'rb', 'prog', 'buf', 'vao'] as const) expect(after[k], `${k}\n${notes.join('\n')}`).toBeLessThanOrEqual(before[k]);
    expect(after.tex, notes.join('\n')).toBeGreaterThan(0);
    expect(after.contexts).toBe(before.contexts);

    const summary = notes.join('\n') + `\nmáximo pedido a la vez: ${(peak / 2 ** 20).toFixed(1)} MiB`;
    test.info().annotations.push({ type: 'gpu', description: summary });
    console.log(summary);
    expect(errors).toEqual([]);
  });
});
