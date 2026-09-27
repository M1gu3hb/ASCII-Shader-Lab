import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32, unzip } from '../../src/shared/zip';
import { download, openStudio } from './helpers';

/** A small real PNG (gradient in one colour), made here so the tests need no fixtures. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3, k = (x + y) / (w + h);
    raw[o] = rgb[0] * k; raw[o + 1] = rgb[1] * k; raw[o + 2] = rgb[2] * k;
  }
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

/** Drops a file on the stage, like dragging it from the desktop. */
async function drop(page: Page, name: string, type: string, data: Buffer) {
  await page.evaluate(({ name, type, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type, b64: data.toString('base64') });
}

const A = png(64, 40, [255, 91, 31]);
const B = png(48, 48, [80, 160, 255]);

async function sourceFile(page: Page) {
  await page.getByRole('tab', { name: 'Fuente' }).click();
  return page.locator('.panel');
}
const prompt = (page: Page) => page.locator('.prompt .card');

test.describe('historial y medios locales', () => {
  test('una imagen cargada vuelve sola al recargar la página', async ({ page }) => {
    const errors = await openStudio(page);
    await drop(page, 'foto-a.png', 'image/png', A);
    await expect((await sourceFile(page)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    await page.waitForTimeout(900);
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible();
    await expect((await sourceFile(page)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);

    // if the stored file disappears (data cleared elsewhere), the piece says what is missing
    await page.evaluate(() => new Promise<void>((res, rej) => {
      const rq = indexedDB.open('mt-media');
      rq.onsuccess = () => { const tx = rq.result.transaction('blobs', 'readwrite'); tx.objectStore('blobs').clear(); tx.oncomplete = () => { rq.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
      rq.onerror = () => rej(rq.error);
    }));
    await page.reload();
    await expect(prompt(page)).toContainText('Esta pieza usaba «foto-a.png» (64×40), que no está guardada en este navegador. Vuelve a elegirla o usa otra.');
    expect(errors).toEqual([]);
  });

  test('al ir atrás y adelante, cada pieza recupera su propia imagen', async ({ page }) => {
    await openStudio(page);
    await drop(page, 'foto-a.png', 'image/png', A);                 // 1: image A
    await expect((await sourceFile(page)).getByText('foto-a.png')).toBeVisible();
    await page.keyboard.press('r');                                  // 2: pattern
    await expect(page.locator('.seedline')).toContainText('2/2');
    await page.keyboard.press('r');                                  // 3: image B
    await expect(page.locator('.seedline')).toContainText('3/3');
    await drop(page, 'foto-b.png', 'image/png', B);
    await expect((await sourceFile(page)).getByText('foto-b.png')).toBeVisible();

    const back = page.locator('.deck .nav button').first(), fwd = page.locator('.deck .nav button').nth(1);
    await back.click();
    await expect(page.locator('.seedline')).toContainText('2/3');
    await expect(prompt(page)).toHaveCount(0);
    await back.click();
    await expect(page.locator('.seedline')).toContainText('1/3');
    await expect(page.locator('.panel').getByText('foto-a.png')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    await fwd.click();
    await fwd.click();
    await expect(page.locator('.seedline')).toContainText('3/3');
    await expect(page.locator('.panel').getByText('foto-b.png')).toBeVisible();
  });

  test('un proyecto exportado se abre con su imagen en otro navegador', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    await pa.keyboard.press('3'); // Imagen
    await drop(pa, 'foto-a.png', 'image/png', A);
    await expect((await sourceFile(pa)).getByText('foto-a.png')).toBeVisible();
    await pa.keyboard.press('e');
    await pa.getByRole('tab', { name: 'Receta' }).click();
    await expect(pa.getByText(/La receta y la imagen original «foto-a.png»/)).toBeVisible();
    const zipFile = await download(pa, () => pa.getByRole('button', { name: 'Exportar proyecto (.zip)' }).click());
    expect(zipFile.name).toMatch(/\.monotrama\.zip$/);
    const bytes = readFileSync(zipFile.path);
    const files = await unzip(new Uint8Array(bytes));
    expect(files.map(f => f.name)).toEqual(['receta.monotrama.json', 'medios/foto-a.png', 'LEEME.txt']);
    expect(Buffer.from(await files[1].read()).equals(A)).toBe(true);
    // the space travels too: the piece reopens in Imagen, not in whatever space the other browser is in
    expect(JSON.parse(await files[0].text()).recipe.meta.space).toBe('media');
    await a.close();

    // a browser that has never seen the image
    const b = await browser.newContext();
    const pb = await b.newPage();
    await openStudio(pb);
    await drop(pb, 'pieza.monotrama.zip', 'application/zip', bytes);
    await expect(pb.locator('.toast').filter({ hasText: 'Proyecto abierto' })).toBeVisible();
    await expect(pb.locator('.seedline')).toContainText('2/2');
    await expect(pb.locator('.spaces').getByRole('button', { name: 'Imagen' })).toHaveAttribute('aria-pressed', 'true');
    await expect((await sourceFile(pb)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(pb)).toHaveCount(0);
    await pb.waitForTimeout(900);
    await pb.reload();
    await expect((await sourceFile(pb)).getByText('foto-a.png')).toBeVisible();
    await b.close();
  });

  test('copiar el enlace de una pieza con imagen pide confirmación y el enlace no lleva la imagen', async ({ browser }) => {
    const a = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const pa = await a.newPage();
    await openStudio(pa);
    // a pattern piece copies directly
    await pa.keyboard.press('l');
    await expect(pa.locator('.toast').filter({ hasText: 'Enlace copiado' })).toBeVisible();
    await expect(pa.getByRole('dialog', { name: 'Compartir el enlace' })).toHaveCount(0);

    await drop(pa, 'foto-a.png', 'image/png', A);
    await expect((await sourceFile(pa)).getByText('foto-a.png')).toBeVisible();
    await pa.keyboard.press('l');
    const sheet = pa.getByRole('dialog', { name: 'Compartir el enlace' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Exportar proyecto (.zip con la imagen)' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden();

    // same question from the Receta tab
    await pa.keyboard.press('e');
    await pa.getByRole('tab', { name: 'Receta' }).click();
    await pa.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Copiar enlace sin la imagen' }).click();
    await expect(pa.locator('.toast').filter({ hasText: 'Enlace copiado (sin la imagen)' })).toBeVisible();
    const link = await pa.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/studio\/#r=z/);
    await a.close();

    const b = await browser.newContext();
    const pb = await b.newPage();
    await pb.goto(link);
    await expect(prompt(pb)).toContainText('Esta pieza se hizo con una imagen propia que no viaja en los enlaces. Elige una tuya para verla; mientras tanto ves el patrón de fondo.');
    await expect(prompt(pb)).toContainText('64×40');
    await expect(prompt(pb)).not.toContainText('foto-a');
    await b.close();
  });

  test('guardar la sesión y abrirla en otro navegador', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    await drop(pa, 'foto-a.png', 'image/png', A);
    await expect((await sourceFile(pa)).getByText('foto-a.png')).toBeVisible();
    await pa.keyboard.press('r');
    await pa.keyboard.press('s');
    await expect(pa.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await pa.getByRole('button', { name: /Colección/ }).click();
    await expect(pa.getByText('Historial: 2 de 1000 · lo guardado con ★ no se descarta')).toBeVisible();
    await expect(pa.getByText(/Incluir en la sesión las imágenes y videos \(1,/)).toBeVisible();
    const sess = await download(pa, () => pa.getByRole('button', { name: 'Guardar sesión' }).click());
    expect(sess.name).toMatch(/^monotrama-sesion-\d{4}-\d{2}-\d{2}\.zip$/);
    const sessBytes = readFileSync(sess.path); // downloads go away with their context
    const names = (await unzip(new Uint8Array(sessBytes))).map(f => f.name);
    expect(names).toContain('sesion.json');
    expect(names.some(n => /^medios\/[0-9a-f]{16}-foto-a\.png$/.test(n))).toBe(true);
    await a.close();

    const b = await browser.newContext();
    const pb = await b.newPage();
    await openStudio(pb);
    await pb.getByRole('button', { name: /Colección/ }).click();
    const [chooser] = await Promise.all([pb.waitForEvent('filechooser'), pb.getByRole('button', { name: 'Abrir sesión' }).click()]);
    await chooser.setFiles({ name: sess.name, mimeType: 'application/zip', buffer: sessBytes });
    await expect(pb.locator('.toast').filter({ hasText: 'Sesión abierta: 2 resultados añadidos' })).toBeVisible();
    await expect(pb.getByText('Historial: 3 de 1000 · lo guardado con ★ no se descarta')).toBeVisible();
    await expect(pb.locator('.fav-card')).toHaveCount(1);
    await pb.keyboard.press('Escape');
    await expect(pb.locator('.seedline')).toContainText('3/3');
    await pb.locator('.thumb').nth(1).click();
    await expect((await sourceFile(pb)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(pb)).toHaveCount(0);
    await b.close();
  });

  test('al pasar el límite se descartan los más antiguos, nunca lo guardado con ★', async ({ page }) => {
    // testing aid: a limit of 10 instead of 1000 (read once at load)
    await page.addInitScript(() => localStorage.setItem('mt.histLimit', '10'));
    await openStudio(page);
    await page.keyboard.press('s'); // the welcome piece goes to the collection
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    for (let i = 2; i <= 9; i++) {
      await page.keyboard.press('r');
      await expect(page.locator('.seedline')).toContainText(`${i}/${i}`);
    }
    const near = page.locator('.toast').filter({ hasText: 'Tu historial va por 9 de 10 resultados' });
    await expect(near).toBeVisible();
    await expect(page.locator('.strip')).toHaveAttribute('aria-label', 'Historial: 9 de 10 · lo guardado con ★ no se descarta');
    const sess = await download(page, () => near.getByRole('button', { name: 'Guardar sesión' }).click());
    expect(sess.name).toMatch(/^monotrama-sesion-.*\.zip$/);

    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('10/10');
    await page.keyboard.press('r');
    await expect(page.locator('.toast').filter({ hasText: 'Tu historial llegó a 10: se descartó el resultado más antiguo' })).toBeVisible();
    await expect(page.locator('.seedline')).toContainText('10/10');
    await expect(page.locator('.thumb')).toHaveCount(10);
    await expect(page.locator('.thumb').first().locator('.star')).toBeVisible();
    await page.getByRole('button', { name: /Colección/ }).click();
    await expect(page.getByText('Historial: 10 de 10 · lo guardado con ★ no se descarta')).toBeVisible();
    await expect(page.getByText('En esta visita se descartó 1 resultado.')).toBeVisible();
  });

  test('un historial guardado con el formato anterior se conserva entero', async ({ page }) => {
    await openStudio(page);
    await page.waitForTimeout(2500); // let the first save settle
    // replace what is stored with a v2 history (one record, as before this change)
    await page.evaluate(() => new Promise<void>((res, rej) => {
      const rq = indexedDB.open('keyval-store');
      rq.onsuccess = () => {
        const tx = rq.result.transaction('keyval', 'readwrite');
        const st = tx.objectStore('keyval');
        st.clear();
        const entry = (id: string, seed: string, cell: number) => ({ id, seed, kind: 'azar', space: 'arte', created: Date.now(), edited: false, recipe: { v: 2, glyph: { cell } }, origin: { v: 2, glyph: { cell } } });
        st.put({ v: 2, entries: [entry('v2a', 'uno-viejo-1', 12), entry('v2b', 'dos-viejo-2', 14), entry('v2c', 'tres-viejo-3', 16)], cursor: 1 }, 'mt.v2.history');
        tx.oncomplete = () => { rq.result.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    }));
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('2/3');
    await expect(page.locator('.seedline .ell')).toHaveText('dos-viejo-2');
    // v3 written, v2 gone
    const keys = await page.evaluate(() => new Promise<string[]>(res => {
      const rq = indexedDB.open('keyval-store');
      rq.onsuccess = () => { const g = rq.result.transaction('keyval').objectStore('keyval').getAllKeys(); g.onsuccess = () => { rq.result.close(); res(g.result as string[]); }; };
    }));
    expect(keys).toContain('mt.v3.history');
    expect(keys).toContain('mt.v3.e:v2a');
    expect(keys).not.toContain('mt.v2.history');
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('2/3');
    await page.locator('.thumb').nth(2).click();
    await expect(page.locator('.seedline .ell')).toHaveText('tres-viejo-3');
  });
});
