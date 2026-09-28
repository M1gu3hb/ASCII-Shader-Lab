import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * «Bucle perfecto» in both engines' pixels: with a loop of L seconds the frame at t = L is the frame at t = 0
 * (what a looping GIF or video joins), for what moves on its own clock: letters that move, the message (its
 * typing and its colours), Ondular, the words of «Palabras», the colour cycle and the warp. The WebGL shaders
 * and their JavaScript twins agree. (tests/unit/loop.test.ts checks the functions they share.)
 */
test('con «Bucle perfecto» el final de la pieza enlaza con su principio, en los dos motores', async ({ page }) => {
  test.setTimeout(180_000);
  const out = await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' });
  await page.route('**/__loop/engine.js', r => r.fulfill({ body: Buffer.from(out.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const res = await page.evaluate(async () => {
    const E = await import('/__loop/engine.js' as string);
    const W = 256, H = 160, L = 6;
    const img = document.createElement('canvas'); img.width = 200; img.height = 120;
    const x = img.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 200, 120); g.addColorStop(0, '#102030'); g.addColorStop(1, '#ffcc88');
    x.fillStyle = g; x.fillRect(0, 0, 200, 120); x.fillStyle = '#fff'; x.beginPath(); x.arc(120, 60, 30, 0, 7); x.fill();
    const shot = async (kind: string, r: unknown, t: number) => {
      const cv = document.createElement('canvas');
      const errs: string[] = [];
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: W, height: H, pixelRatio: 1 }, autoplay: false, interactive: false, preserveDrawingBuffer: true, onError: (m: string) => errs.push(m) };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, r, opts) : new E.BasicEngine(cv, r, opts);
      if ((r as { source: string }).source === 'image') e.setMedia('image', img);
      await e.ready();
      e.renderAt(t, t);
      const s = await e.snapshot(0, 0, W, H);
      e.destroy();
      if (errs.length) throw new Error(errs[0]);
      return s!.data;
    };
    const mad = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let d = 0;
      for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return d / (a.length / 4) / 3;
    };
    type R = ReturnType<typeof E.defaultRecipe>;
    const base = (f: (r: R) => void) => { const r = E.defaultRecipe(); r.interact.mode = 'none'; r.glyph.cell = 7; r.color.stops = ['#10131a', '#6ee7ff', '#fff4d6']; f(r); return r; };
    const cases: Record<string, (r: R) => void> = {
      'texto con Ola': r => { r.source = 'text'; r.text.content = 'HOLA'; r.text.anim = { kind: 'ola', amount: 0.8, speed: 1.1 }; },
      'texto con Explosión': r => { r.source = 'text'; r.text.content = 'LUZ'; r.text.anim = { kind: 'explosion', amount: 0.8, speed: 1.3 }; },
      'foto con Ondular': r => { r.source = 'image'; r.media.xform = [{ kind: 'ondular', on: true, amount: 0.6, p: 0.3 }]; },
      'mensaje que se escribe': r => { r.msg = { ...r.msg, on: true, text: 'hola mundo antiguo', mode: 'type', speed: 7 }; },
      'mensaje con color por letra': r => { r.msg = { ...r.msg, on: true, text: 'hola mundo', mode: 'static', anim: { kind: 'color', amount: 1, speed: 1.2 } }; },
      'mensaje en ola que desfila': r => { r.msg = { ...r.msg, on: true, text: 'hola mundo', mode: 'marquee', speed: 7, anim: { kind: 'ola', amount: 1, speed: 1 } }; },
      'Palabras, ciclo de color y deformación': r => { r.glyph.mode = 'words'; r.glyph.jitter = 0.4; r.color.cycle = 0.05; r.motion.warp = 0.6; },
    };
    const seam: Record<string, number> = {}, without: Record<string, number> = {}, parity: Record<string, number> = {};
    for (const [name, f] of Object.entries(cases)) {
      const r = base(f); r.motion.loop = L;
      for (const kind of ['webgl', 'basic']) seam[`${name} · ${kind}`] = mad(await shot(kind, r, 0), await shot(kind, r, L));
      parity[name] = mad(await shot('webgl', r, L * 0.37), await shot('basic', r, L * 0.37));
      const r0 = base(f);
      without[name] = mad(await shot('webgl', r0, 0), await shot('webgl', r0, L));
    }
    return { seam, without, parity };
  });
  for (const [name, v] of Object.entries(res.seam)) expect(v, `sin costura: ${name}`).toBeLessThan(0.01);
  // (and the check sees a seam when there is one: without a loop these pieces do not come back at t = 6)
  for (const [name, v] of Object.entries(res.without)) expect(v, `sin bucle: ${name}`).toBeGreaterThan(0.2);
  for (const [name, v] of Object.entries(res.parity)) expect(v, `WebGL y básico: ${name}`).toBeLessThan(0.5);
});
