import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';
import { openStudio } from './helpers';

/**
 * What the browser keeps: two tabs never overwrite each other, the last action before leaving the page
 * is kept, and when the browser cannot keep anything the studio says so.
 */

/** Reads keys of the studio's IndexedDB store (keyval-store / keyval). */
async function idb(page: Page, keys: string[]): Promise<unknown[]> {
  return page.evaluate(keys => new Promise<unknown[]>((res, rej) => {
    const rq = indexedDB.open('keyval-store');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('keyval');
      const reqs = keys.map(k => tx.objectStore('keyval').get(k));
      tx.oncomplete = () => { rq.result.close(); res(reqs.map(r => r.result)); };
      tx.onerror = () => rej(tx.error);
    };
    rq.onerror = () => rej(rq.error);
  }), keys);
}
const indexIds = async (page: Page) => ((await idb(page, ['mt.v3.history']))[0] as { ids: string[] } | undefined)?.ids ?? [];
const favNames = async (page: Page) => (((await idb(page, ['mt.v2.favorites']))[0] ?? []) as Array<{ name: string }>).map(f => f.name);

async function mediaIds(page: Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>(res => {
    const rq = indexedDB.open('mt-media');
    rq.onupgradeneeded = () => rq.result.createObjectStore('blobs');
    rq.onsuccess = () => {
      const g = rq.result.transaction('blobs').objectStore('blobs').getAllKeys();
      g.onsuccess = () => { rq.result.close(); res(g.result as string[]); };
    };
  }));
}

const seed = async (page: Page) => (await page.locator('.seedline .ell').textContent())?.trim() ?? '';
const away = (page: Page) => page.locator('dialog.tab-away[open]');

function png(w: number, h: number): Buffer {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * row + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = 91; raw[o + 2] = y * 6; }
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function drop(page: Page, name: string, data: Buffer) {
  await page.evaluate(({ name, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, b64: data.toString('base64') });
}

test.describe('lo que guarda el navegador', () => {
  test('dos pestañas: la más nueva toma el estudio y ninguna borra lo de la otra', async ({ browser }) => {
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    await openStudio(a);
    await a.keyboard.press('r');
    await expect(a.locator('.seedline')).toContainText('2/2');
    await a.keyboard.press('r');
    await expect(a.locator('.seedline')).toContainText('3/3');
    const seedA = await seed(a);
    await a.keyboard.press('s');
    await expect(a.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');

    // B opens: A saves, stops and says so; B has everything A did
    const b = await ctx.newPage();
    await openStudio(b);
    await expect(away(a)).toBeVisible();
    await expect(away(a)).toContainText('Lo que hiciste aquí ya está guardado');
    await expect(b.locator('.seedline')).toContainText('3/3');
    await expect(b.locator('.seedline .ell')).toHaveText(seedA);
    await b.keyboard.press('r');
    await expect(b.locator('.seedline')).toContainText('4/4');
    const seedB = await seed(b);
    await b.keyboard.press('s');
    await expect(b.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => favNames(b)).toHaveLength(2);

    // A: «Usar aquí» takes it back, with B's work; now B is the one that stops
    await a.getByRole('button', { name: 'Usar aquí' }).click();
    await expect(a.locator('.seedline')).toContainText('4/4', { timeout: 45_000 });
    await expect(a.locator('.seedline .ell')).toHaveText(seedB);
    await expect(away(b)).toBeVisible();
    expect(await indexIds(a)).toHaveLength(4);
    expect(await favNames(a)).toHaveLength(2);
    await a.getByRole('button', { name: /Colección/ }).click();
    await expect(a.locator('.fav-card')).toHaveCount(2);
    await ctx.close();
  });

  test('una pestaña en pausa no borra las imágenes que usa la otra', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext();
    const b = await ctx.newPage();
    await openStudio(b);
    const a = await ctx.newPage();
    await openStudio(a);
    await expect(away(b)).toBeVisible();
    await drop(a, 'foto-a.png', png(64, 40));
    await expect.poll(() => mediaIds(a)).toHaveLength(1);
    await expect(a.locator('.prompt .card')).toHaveCount(0);
    await a.keyboard.press('s');
    await expect(a.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    // as if loaded long ago: past the grace period that protects files not yet in a recipe
    await a.evaluate(() => new Promise<void>(res => {
      const rq = indexedDB.open('mt-media');
      rq.onsuccess = () => {
        const st = rq.result.transaction('blobs', 'readwrite').objectStore('blobs');
        const c = st.openCursor();
        c.onsuccess = () => { const cur = c.result; if (!cur) { rq.result.close(); res(); return; } cur.update({ ...cur.value, added: Date.now() - 10 * 60_000 }); cur.continue(); };
      };
    }));
    // B's clean-up (12 s after it loaded) and A's own both come and go
    await a.waitForTimeout(14_000);
    expect(await mediaIds(a)).toHaveLength(1);
    await a.reload();
    await expect(a.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await expect(a.locator('.prompt .card')).toHaveCount(0);
    await ctx.close();
  });

  test('lo último antes de recargar o cerrar se guarda', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await openStudio(page);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
    await page.waitForTimeout(1200);
    // a roll and, at once, a reload: the debounced save has not run yet
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('3/3');
    const s3 = await seed(page);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('3/3', { timeout: 45_000 });
    await expect(page.locator('.seedline .ell')).toHaveText(s3);
    // a star and, at once, the tab closes
    await page.waitForTimeout(1200);
    await page.keyboard.press('s');
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await page.close({ runBeforeUnload: true });
    const again = await ctx.newPage();
    await openStudio(again);
    expect(await favNames(again)).toHaveLength(1);
    await ctx.close();
  });

  test('sin IndexedDB, el estudio dice que no guarda', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('bloqueado', 'SecurityError'); } }));
    const page = await ctx.newPage();
    const errors = await openStudio(page);
    await expect(page.locator('.keep-chip')).toContainText('Sin guardar');
    await expect(page.locator('.keep-chip')).toContainText('se pierden al cerrar la pestaña');
    await page.keyboard.press('r');
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: 'está en tu colección sólo hasta que cierres la pestaña' })).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: 'Guardado en tu colección' })).toHaveCount(0);
    await page.getByRole('button', { name: /Colección/ }).click();
    await expect(page.locator('.keep-warn')).toContainText('Este navegador no deja guardar');
    await expect(page.locator('dialog.sheet[open]')).toContainText('sólo mientras no cierres la pestaña');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('sin espacio, el estudio lo dice y lo guardado sigue ahí', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
        if (localStorage.getItem('zz.lleno') === '1' && this.name === 'keyval') throw new DOMException('lleno', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    const page = await ctx.newPage();
    await openStudio(page);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
    await expect.poll(() => indexIds(page)).toHaveLength(2);
    await page.evaluate(() => localStorage.setItem('zz.lleno', '1'));
    await page.keyboard.press('r');
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: 'el navegador no tiene espacio para guardarla' })).toBeVisible();
    await expect(page.locator('.keep-chip')).toContainText('Sin espacio');
    expect(await indexIds(page)).toHaveLength(2);
    await ctx.close();
  });

  test('un historial del formato anterior que siguió creciendo se une al actual', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
    await expect.poll(() => indexIds(page)).toHaveLength(2);
    const [first] = await indexIds(page);
    // a tab of the previous version, open during the update, kept its whole history in the v2 record
    await page.evaluate(first => new Promise<void>((res, rej) => {
      const rq = indexedDB.open('keyval-store');
      rq.onsuccess = () => {
        const tx = rq.result.transaction('keyval', 'readwrite');
        const entry = (id: string, seed: string) => ({ id, seed, kind: 'azar', space: 'arte', created: Date.now(), edited: false, recipe: { v: 2, glyph: { cell: 12 } }, origin: { v: 2, glyph: { cell: 12 } } });
        tx.objectStore('keyval').put({ v: 2, entries: [entry(first, 'ya-estaba-1'), entry('viejo-nuevo', 'otra-pestana-2')], cursor: 1 }, 'mt.v2.history');
        tx.oncomplete = () => { rq.result.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    }), first);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('/3', { timeout: 45_000 });
    await page.locator('.thumb').nth(2).click();
    await expect(page.locator('.seedline .ell')).toHaveText('otra-pestana-2');
    expect((await idb(page, ['mt.v2.history']))[0]).toBeUndefined();
    expect(await indexIds(page)).toHaveLength(3);
  });

  test('abrir una sesión más antigua en un historial lleno descarta lo más antiguo por fecha, y lo dice antes', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    for (let i = 2; i <= 4; i++) { await pa.keyboard.press('r'); await expect(pa.locator('.seedline')).toContainText(`${i}/${i}`); }
    await pa.getByRole('button', { name: /Colección/ }).click();
    const [dl] = await Promise.all([pa.waitForEvent('download'), pa.getByRole('button', { name: 'Guardar sesión' }).click()]);
    const sess = await dl.path();
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(sess!);
    await a.close();

    const b = await browser.newContext();
    await b.addInitScript(() => localStorage.setItem('mt.histLimit', '10'));
    const pb = await b.newPage();
    await openStudio(pb);
    for (let i = 2; i <= 9; i++) { await pb.keyboard.press('r'); await expect(pb.locator('.seedline')).toContainText(`${i}/${i}`); }
    const mine = await seed(pb);
    let asked = '';
    pb.once('dialog', d => { asked = d.message(); void d.accept(); });
    await pb.getByRole('button', { name: /Colección/ }).click();
    const [chooser] = await Promise.all([pb.waitForEvent('filechooser'), pb.getByRole('button', { name: 'Abrir sesión' }).click()]);
    await chooser.setFiles({ name: 'glyphos-sesion.zip', mimeType: 'application/zip', buffer: bytes });
    await expect(pb.locator('.toast').filter({ hasText: 'Sesión abierta: 4 resultados añadidos' })).toBeVisible();
    // 9 + 4 = 13 over 10: the three oldest by date go, all from the older session (its current one stays)
    expect(asked).toContain('se descartan los 3 resultados más antiguos por fecha (3 de la sesión)');
    expect(asked).not.toContain('de tu historial');
    await expect(pb.locator('.toast').filter({ hasText: 'se descartaron los 3 resultados más antiguos' })).toBeVisible();
    await pb.keyboard.press('Escape');
    await expect(pb.locator('.thumb')).toHaveCount(10);
    await pb.locator('.thumb').nth(8).click();
    await expect(pb.locator('.seedline .ell')).toHaveText(mine);
    await b.close();
  });

  test('«Vaciar historial» borra también la foto recién cargada que ya nadie usa', async ({ page }) => {
    await openStudio(page);
    await drop(page, 'foto-a.png', png(64, 40));
    await expect.poll(() => mediaIds(page)).toHaveLength(1);
    await page.keyboard.press('1'); // Fondos: a pattern piece, the photo stays only in the history
    await expect(page.locator('.seedline')).toContainText('/');
    page.once('dialog', d => void d.accept());
    await page.getByRole('button', { name: /Colección/ }).click();
    await page.getByRole('button', { name: 'Vaciar historial' }).click();
    await expect.poll(() => mediaIds(page), { timeout: 10_000 }).toHaveLength(0);
  });
});
