import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';
import { finalRender, FOTO_PAUSED, FOTO_STUDIO, PHOTO, project } from './foto-helpers';

/**
 * Bridges between the lab and the photo studio: the switch in both top bars, «Llevar al estudio de foto»
 * (the lab piece and its photo become a project), «Abrir estilo en el laboratorio» (an ASCII layer's
 * recipe, with its photo, becomes a lab entry) and «Usar estilo del laboratorio» (lab pieces as styles).
 * Only a key travels in the address; the recipe goes through IndexedDB.
 *
 * While the photo studio is paused (the default build, VITE_FOTO_STUDIO unset) there is no bridge: the lab
 * does not offer it and keeps its own image, video and camera, and /studio/foto/ is a static «en revisión»
 * page that loads nothing of the studio and leaves the saved photo projects alone.
 */

// Chromium's fake camera, for the lab's camera while the photo studio is paused
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

const PUBLIC = 'Con VITE_FOTO_STUDIO=1 el estudio de foto y video es público: esta prueba es de la compilación con el estudio en pausa.';

test('laboratorio ⇄ foto y video: el interruptor, llevar la pieza, abrir el estilo y usar estilos del laboratorio', async ({ page }) => {
  test.skip(!FOTO_STUDIO, FOTO_PAUSED);
  const errors = await openStudio(page, '#space=media');
  // the switch in the lab's top bar
  const sw = page.getByRole('navigation', { name: 'Estudios de GLYPHOS' });
  await expect(sw.getByRole('link', { name: /Laboratorio|Lab/ })).toHaveAttribute('aria-current', 'page');
  // a photo in the lab
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Elegir imagen' }).first().click();
  await (await chooser).setFiles(PHOTO);
  await expect(page.locator('.prompt .card')).toHaveCount(0, { timeout: 30_000 });
  const labCharset = await page.evaluate(async () => {
    // the lab's current piece, as it is saved (its history index and entries in IndexedDB)
    const open = indexedDB.open('keyval-store');
    const db: IDBDatabase = await new Promise(r => { open.onsuccess = () => r(open.result); });
    const get = (k: string) => new Promise<unknown>(r => { const q = db.transaction('keyval').objectStore('keyval').get(k); q.onsuccess = () => r(q.result); });
    for (let i = 0; i < 40; i++) {
      const idx = await get('mt.v3.history') as { ids: string[]; cursor: number } | undefined;
      const e = idx ? await get('mt.v3.e:' + idx.ids[idx.cursor]) as { recipe: { glyph: { charset: string }; media: { ref?: { id?: string } } } } : null;
      if (e?.recipe.media.ref?.id) return e.recipe.glyph.charset;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  });
  expect(labCharset).not.toBeNull();

  // «Llevar al estudio de foto»
  await sw.getByRole('button', { name: /Foto y video|Foto/ }).click();
  await page.getByRole('menuitem', { name: /Llevar al estudio de foto/ }).click();
  await page.waitForURL(/\/studio\/foto\/\?*#p=/, { timeout: 45_000 });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await page.goto(page.url().replace('/studio/foto/', '/studio/foto/?qa'));
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'ascii']);
  expect(p.layers[1].style?.glyph.charset).toBe(labCharset);
  const photoSource = (p as unknown as { sources: Array<{ id: string; media: Array<{ id: string }> }> }).sources[0];
  expect((p.layers[1] as unknown as { source: string }).source).toBe(photoSource.id);
  // the switch here too, with «Foto y video» current
  await expect(page.getByRole('navigation', { name: 'Estudios de GLYPHOS' }).getByRole('link', { name: /Foto y video|Foto/ })).toHaveAttribute('aria-current', 'page');

  // «Usar estilo del laboratorio»: the lab's history is there to pick from
  await page.locator('.lr', { hasText: p.layers[1].name }).locator('.lr-main').click();
  await page.getByRole('button', { name: 'Usar estilo del laboratorio' }).click();
  const styles = page.getByRole('dialog', { name: 'Usar estilo del laboratorio' });
  await expect(styles.locator('.lab-card').first()).toBeVisible({ timeout: 20_000 });
  await styles.locator('.lab-card').first().click();
  await expect(styles).toBeHidden();

  // «Abrir estilo en el laboratorio»: a new lab entry with this layer's recipe and its photo
  await page.getByRole('button', { name: 'Abrir estilo en el laboratorio' }).click();
  await page.waitForURL(/\/studio\/$/, { timeout: 45_000 });
  await expect(page.locator('.toast', { hasText: 'Estilo abierto desde el estudio de foto' })).toBeVisible({ timeout: 30_000 });
  // its photo came along (the lab is not asking for one)
  await expect(page.locator('.prompt .card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** Drops a file on the lab's stage, like dragging it from the desktop. */
async function drop(page: Page, path: string, type: string) {
  const b64 = readFileSync(path).toString('base64');
  await page.evaluate(({ name, type, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name: path.slice(path.lastIndexOf('/') + 1), type, b64 });
}

test('en pausa: el laboratorio no lleva al estudio de foto y sigue abriendo imagen, video y cámara', async ({ page }) => {
  test.skip(FOTO_STUDIO, PUBLIC);
  const errors = await openStudio(page, '#space=media');
  // no «Laboratorio ⇄ Foto y video», no menu, no «Llevar al estudio de foto», no link
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Estudios de GLYPHOS' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Foto y video' })).toHaveCount(0);
  await expect(page.getByText('Llevar al estudio de foto')).toHaveCount(0);
  expect(await page.locator('a[href*="/studio/foto"]').count()).toBe(0);

  // an image, from the card's picker
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Elegir imagen' }).first().click();
  await (await chooser).setFiles(PHOTO);
  await expect(page.locator('.toast').filter({ hasText: 'Imagen cargada' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.prompt .card')).toHaveCount(0);

  // a video (VP9 in MP4), dropped on the stage
  await drop(page, join(import.meta.dirname, '../fixtures/video/recortado-sin-recomprimir.mp4'), 'video/mp4');
  await expect(page.locator('.toast').filter({ hasText: 'Video cargado' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.prompt .card')).toHaveCount(0);

  // the camera (Chromium's fake device)
  await page.goto('/studio/#space=media&source=camera');
  await page.reload();
  await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await page.locator('.prompt .card').getByRole('button', { name: 'Activar cámara' }).click();
  await expect(page.getByRole('button', { name: 'Apagar cámara' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.prompt .card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('en pausa: /studio/foto/ dice que está en revisión, fuera del índice, sin cargar el estudio ni tocar los proyectos guardados', async ({ page, request }) => {
  test.skip(FOTO_STUDIO, PUBLIC);
  // old links still answer (no 404), with the same isolation headers as the studio
  const res = await request.get('/studio/foto/');
  expect(res.status()).toBe(200);
  expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
  const html = await res.text();
  expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  expect(html).not.toContain('application/ld+json');

  const scripts: string[] = [];
  const errors: string[] = [];
  page.on('request', r => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/studio/foto/');
  // a project saved by the photo studio before the pause (idb-keyval: glyphos-projects / projects)
  const saved = { id: 'p-antes', name: 'Cartel de antes', updated: 1_700_000_000_000, layers: [{ id: 'l1', kind: 'photo' }] };
  const idb = (op: 'put' | 'get', value?: unknown) => page.evaluate(([op, value]) => new Promise<unknown>((res, rej) => {
    const rq = indexedDB.open('glyphos-projects');
    rq.onupgradeneeded = () => rq.result.createObjectStore('projects');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const db = rq.result;
      const tx = db.transaction('projects', op === 'put' ? 'readwrite' : 'readonly');
      const st = tx.objectStore('projects');
      const q = op === 'put' ? st.put(value, 'p-antes') : st.get('p-antes');
      q.onsuccess = () => { const out = q.result; tx.oncomplete = () => { db.close(); res(op === 'put' ? null : out); }; };
      q.onerror = () => rej(q.error);
    };
  }), [op, value] as const);
  await idb('put', saved);

  // an old address (a saved project, a piece sent from the lab) shows the same calm page
  for (const path of ['/studio/foto/', '/studio/foto/#p=p-antes', '/studio/foto/?qa#lab=abc']) {
    await page.goto(path);
    await page.reload();
    const main = page.locator('main[data-foto-review]');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('El estudio de foto y video está en revisión');
    await expect(main.getByText('Lo estamos afinando y todavía no está disponible.')).toBeVisible();
  }
  await expect(page).toHaveTitle('Estudio de foto y video en revisión · GLYPHOS');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir a GLYPHOS' })).toHaveAttribute('href', '/');
  expect(scripts, 'the page loads no script (nothing of the studio)').toEqual([]);
  expect(await idb('get')).toEqual(saved);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  // targets for a finger
  for (const a of await page.locator('main a').all()) {
    const b = (await a.boundingBox())!;
    expect(b.height, await a.innerText()).toBeGreaterThanOrEqual(44);
  }

  // «Ir al laboratorio»: the lab, with its image, video and camera
  await page.getByRole('link', { name: 'Ir al laboratorio' }).click();
  await expect(page).toHaveURL(/\/studio\/$/);
  await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
  // the lab did not touch the photo project either
  expect(await idb('get')).toEqual(saved);
  expect(errors).toEqual([]);
});
