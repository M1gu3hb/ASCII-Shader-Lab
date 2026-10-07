import { build } from 'esbuild';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { unzip } from '../../src/shared/zip';
import { download, openStudio } from './helpers';

test('IndexedDB que no responde: el estudio abre protegido y permite descargar una sesión', async ({ page }) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => name === 'keyval-store' ? {} as IDBOpenDBRequest : open(name, version);
  });
  await openStudio(page);
  await expect(page.locator('.keep-chip')).toContainText('Los datos anteriores se conservan');
  const copy = await download(page, () => page.locator('.keep-chip').getByRole('button', { name: 'Guardar sesión' }).click());
  expect((await unzip(new Uint8Array(readFileSync(copy.path)))).map(f => f.name)).toContain('sesion.json');
});

test('el chunk de handoff bloqueado deja una salida en lugar de Cargando para siempre', async ({ page }) => {
  let blocked = 0, shared = '';
  await page.route(/\/assets\/handoff-[^/]+\.js$/, route => {
    // The shared implementation is also used by FotoSwitch at startup. Only fail the lazy wrapper.
    const url = route.request().url();
    if (!shared) shared = url;
    if (url === shared) return route.continue();
    blocked++; return route.abort();
  });
  await page.goto('/studio/#foto=prueba');
  await expect(page.locator('.seedline')).toBeVisible();
  await expect(page.locator('.studio-recovery')).toContainText('no pudo terminar de arrancar');
  expect(blocked).toBeGreaterThan(0);
  await expect(page.locator('.studio-recovery').getByRole('button', { name: 'Recargar' })).toBeVisible();
});

test('una excepción de render en la raíz conserva las recetas y ofrece una descarga independiente del motor', async ({ page }) => {
  const root = process.cwd();
  const module = await build({ stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { StudioBoundary } from './src/studio/Boundary';
    import { applyRecipe } from './src/studio/store'; import { defaultRecipe } from './src/engine/recipe';
    let root;
    export function crash(broken=true) {
      if(!root){ const r=defaultRecipe(); r.meta.name='Trabajo rescatable'; applyRecipe(r, 'importado', 'Trabajo rescatable'); root=createRoot(document.getElementById('root')); }
      function Broken(){throw new Error('Fallo de render inyectado');}
      function Healthy(){return React.createElement('p', {id:'healthy'}, 'El editor sigue abierto');}
      root.render(React.createElement(StudioBoundary, null, React.createElement(broken ? Broken : Healthy)));
    }`, resolveDir: root }, plugins: [{ name: 'exact-views-file', setup(b) { b.onResolve({ filter: /\/views\/views$/ }, a => ({ path: join(a.resolveDir, a.path + '.ts') })); } }], bundle: true, format: 'esm', write: false, loader: { '.css': 'empty' }, logLevel: 'silent' });
  await page.route('**/__recovery/root.js', r => r.fulfill({ body: Buffer.from(module.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  await page.evaluate(async () => { document.body.innerHTML = '<div id="root"></div>'; const m = await import('/__recovery/root.js' as string); m.crash(false); });
  await expect(page.locator('#healthy')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('Fallo asíncrono inyectado') })));
  await expect(page.locator('.studio-recovery')).toContainText('Una operación del estudio no pudo completarse');
  await expect(page.locator('#healthy')).toBeVisible();
  await page.evaluate(async () => { const m = await import('/__recovery/root.js' as string); m.crash(); });
  await expect(page.locator('.studio-recovery')).toContainText('error al dibujar la interfaz');
  const copy = await download(page, () => page.getByRole('button', { name: 'Guardar sesión' }).click());
  const files = await unzip(new Uint8Array(readFileSync(copy.path)));
  const session = JSON.parse(await files.find(f => f.name === 'sesion.json')!.text());
  expect(JSON.stringify(session)).toContain('Trabajo rescatable');
});

test('un shader fallido se intenta una vez y otra combinación sigue dibujando', async ({ page }) => {
  const module = await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
  await page.route('**/__recovery/engine.js', r => r.fulfill({ body: Buffer.from(module.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const result = await page.evaluate(async () => {
    const E = await import('/__recovery/engine.js' as string);
    const cv = document.createElement('canvas'), errors: string[] = [];
    const r = E.defaultRecipe(); r.layers[0].pattern = 'bad';
    const e = new E.AsciiEngine(cv, r, { library: { ...E.PATTERN_GLSL, bad: 'invalid GLSL for injected failure' }, googleFonts: false, fixedSize: { width: 160, height: 100, pixelRatio: 1 }, autoplay: false, interactive: false, onError: (m: string) => errors.push(m) });
    const gl = cv.getContext('webgl2')!, compile = gl.compileShader.bind(gl);
    let attempts = 0;
    gl.compileShader = shader => { attempts++; compile(shader); };
    await e.ready();
    const initial = attempts;
    for (let i = 0; i < 120; i++) e.renderAt(i / 60);
    const repeated = attempts - initial;
    e.set(E.defaultRecipe(), { transition: false });
    await e.ready(); e.renderAt(1);
    const img = await e.snapshot(0, 0, 160, 100);
    let ink = 0; if (img) for (let i = 3; i < img.data.length; i += 4) ink += img.data[i];
    e.destroy();
    return { errors: errors.length, initial, repeated, recovered: ink > 0 };
  });
  expect(result.errors).toBe(1);
  expect(result.initial).toBeGreaterThan(0);
  expect(result.repeated).toBe(0);
  expect(result.recovered).toBe(true);
});
