import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32, unzip } from '../../src/shared/zip';
import { download, openStudio } from './helpers';

/**
 * The collection outlives the history: a favourite whose result left the history still opens (with its
 * image), the whole collection travels as a .zip with its images, and the limits are said where they matter.
 */

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

async function drop(page: Page, name: string, type: string, data: Buffer) {
  await page.evaluate(({ name, type, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type, b64: data.toString('base64') });
}

const PHOTO = png(64, 40, [255, 91, 31]);
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Colección e historial' });
const prompt = (page: Page) => page.locator('.prompt .card');
async function sourceFile(page: Page) {
  await page.getByRole('tab', { name: 'Fuente' }).click();
  return page.locator('.panel');
}

test.describe('colección', () => {
  test('un favorito cuyo resultado ya no está en el historial se abre igual, con su imagen', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('3'); // Imagen
    await drop(page, 'foto-a.png', 'image/png', PHOTO);
    await expect((await sourceFile(page)).getByText('foto-a.png')).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: 'Guardado en tu colección' })).toBeVisible();
    // other results, then the history emptied: the favourite's own result is gone
    await page.keyboard.press('2'); // Arte
    await page.keyboard.press('r');
    await page.getByRole('button', { name: /^Colección/ }).click();
    page.once('dialog', d => void d.accept());
    await sheet(page).getByRole('button', { name: 'Vaciar historial' }).click();
    await expect(sheet(page).getByText(/^Historial: 1 de 1000/)).toBeVisible();
    await page.keyboard.press('Escape');
    // after the media clean-up and a reload
    await page.waitForTimeout(4000);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('1/1');
    await page.getByRole('button', { name: /^Colección/ }).click();
    await sheet(page).locator('.fav-card').first().getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page.locator('.seedline')).toContainText('2/2');
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await expect((await sourceFile(page)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
  });

  test('«Guardar colección» lleva las piezas y sus imágenes; en otro navegador se abre con ellas', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    await pa.keyboard.press('s'); // a pattern piece
    await pa.keyboard.press('3');
    await drop(pa, 'foto-a.png', 'image/png', PHOTO);
    await expect((await sourceFile(pa)).getByText('foto-a.png')).toBeVisible();
    await pa.keyboard.press('s');
    await expect(pa.locator('.toast').filter({ hasText: 'Guardado en tu colección' }).last()).toBeVisible();
    await pa.getByRole('button', { name: /^Colección/ }).click();
    // the limits, said where they matter
    await expect(sheet(pa).getByText(/Lo que guardas con ★ no se descarta nunca y no tiene un número fijo/)).toBeVisible();
    await expect(sheet(pa).getByText(/ahora usa [\d,]+ MB de [\d,.]+ (MB|GB)/)).toBeVisible();
    await expect(sheet(pa).getByText(/Guarda tus últimos 1000 resultados/)).toBeVisible();
    // a piece with an image offers its project beside the link
    await expect(sheet(pa).getByRole('button', { name: /Exportar proyecto de .* \(\.zip con su archivo\)/ })).toHaveCount(1);
    await expect(sheet(pa).getByRole('button', { name: /Copiar enlace a .* \(sólo la receta, sin su archivo\)/ })).toHaveCount(1);
    const file = await download(pa, () => sheet(pa).getByRole('button', { name: /^Guardar colección \(\.zip, con sus imágenes y videos\)/ }).click());
    expect(file.name).toMatch(/^monotrama-coleccion-\d{4}-\d{2}-\d{2}\.zip$/);
    const bytes = readFileSync(file.path);
    const files = await unzip(new Uint8Array(bytes));
    const names = files.map(f => f.name);
    expect(names).toContain('sesion.json');
    expect(names).toContain('LEEME.txt');
    expect(names.some(n => /^medios\/[0-9a-f]{16}-foto-a\.png$/.test(n))).toBe(true);
    const doc = JSON.parse(await files.find(f => f.name === 'sesion.json')!.text());
    expect(doc.scope).toBe('collection');
    expect(doc.entries).toEqual([]);
    expect(doc.favorites).toHaveLength(2);
    expect(await files.find(f => f.name === 'LEEME.txt')!.text()).toContain('2 piezas de tu colección');
    await a.close();

    const b = await browser.newContext();
    const pb = await b.newPage();
    await openStudio(pb);
    await drop(pb, file.name, 'application/zip', bytes);
    await expect(pb.locator('.toast').filter({ hasText: 'Colección abierta: 2 piezas nuevas' })).toBeVisible();
    // the history is left as it was
    await expect(pb.locator('.seedline')).toContainText('1/1');
    await pb.getByRole('button', { name: /^Colección/ }).click();
    await expect(sheet(pb).locator('.fav-card')).toHaveCount(2);
    await sheet(pb).locator('.fav-card').first().getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect((await sourceFile(pb)).getByText('foto-a.png')).toBeVisible();
    await expect(prompt(pb)).toHaveCount(0);
    // opened twice, nothing is duplicated
    await drop(pb, file.name, 'application/zip', bytes);
    await expect(pb.locator('.toast').filter({ hasText: 'Colección abierta: 0 piezas nuevas' })).toBeVisible();
    await b.close();
  });
});
