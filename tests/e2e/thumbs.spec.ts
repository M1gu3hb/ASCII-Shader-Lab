import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';
import { openStudio } from './helpers';

/** A small real PNG, white where `lit(x, y)` and black elsewhere (made here: no fixtures). */
function png(w: number, h: number, lit: (x: number, y: number) => boolean): Buffer {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.fill(lit(x / w, y / h) ? 255 : 0, y * row + 1 + x * 3, y * row + 4 + x * 3);
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
async function drop(page: Page, name: string, data: Buffer) {
  await page.evaluate(({ name, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, b64: data.toString('base64') });
}

/** Mean brightness of the left minus the right half, and of the top minus the bottom half, of a picture. */
const halves = (page: Page, url: string) => page.evaluate(async url => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 40; c.height = 24;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 40, 24);
  const d = x.getImageData(0, 0, 40, 24).data;
  let l = 0, r = 0, t = 0, b = 0;
  for (let y = 0; y < 24; y++) for (let i = 0; i < 40; i++) {
    const o = (y * 40 + i) * 4, v = d[o] + d[o + 1] + d[o + 2];
    if (i < 20) l += v; else r += v;
    if (y < 12) t += v; else b += v;
  }
  const n = 20 * 24 * 3;
  return { lr: (l - r) / n, tb: (t - b) * 40 / 24 / n };
}, url);

/**
 * History thumbnails: every entry gets its own picture, rendered from its own recipe, even when the
 * dice are rolled faster than a thumbnail can be made (the owner saw blank entries after quick rolls).
 * Under the software GPU of the test browser a render takes a while, hence the generous waits.
 */

interface Stored { ids: string[]; cursor: number; thumbs: Record<string, string>; bodies: Record<string, { thumbV?: string; created: number }> }

/** What IndexedDB holds: the history index, the entry records and the thumbnail records. */
const stored = (page: Page) => page.evaluate(() => new Promise<Stored>((res, rej) => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    const range = (p: string) => IDBKeyRange.bound(p, p + '￿');
    const tv = st.getAll(range('mt.v3.t:')), tk = st.getAllKeys(range('mt.v3.t:'));
    const ev = st.getAll(range('mt.v3.e:')), ek = st.getAllKeys(range('mt.v3.e:'));
    ek.onsuccess = () => {
      const thumbs: Stored['thumbs'] = {}, bodies: Stored['bodies'] = {};
      (tk.result as string[]).forEach((k, i) => { thumbs[k.slice(8)] = tv.result[i] as string; });
      (ek.result as string[]).forEach((k, i) => { bodies[k.slice(8)] = ev.result[i] as Stored['bodies'][string]; });
      res({ ids: g.result?.ids ?? [], cursor: g.result?.cursor ?? -1, thumbs, bodies });
    };
    ek.onerror = () => rej(ek.error);
  };
  req.onerror = () => rej(req.error);
}));

/** Ids of the history that still have no stored thumbnail. */
async function missing(page: Page) {
  const s = await stored(page);
  return s.ids.filter(id => !s.thumbs[id]);
}

/** Strip items in view that show no picture. */
const blankItems = (page: Page) => page.locator('.strip .thumb').evaluateAll(els => {
  const strip = els[0]?.closest('.strip')?.getBoundingClientRect();
  return els.map((el, i) => ({ i, bg: getComputedStyle(el).backgroundImage, r: el.getBoundingClientRect() }))
    .filter(x => strip && x.r.right > strip.left + 4 && x.r.left < strip.right - 4)
    .filter(x => !x.bg || x.bg === 'none').map(x => x.i + 1);
});

/** Colour histogram (4 levels per channel) of an image given as a data URL, centre-cropped to 16:10. */
const histOf = (page: Page, url: string) => page.evaluate(async url => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, a = 1.6;
  let sw = W, sh = W / a;
  if (sh > H) { sh = H; sw = H * a; }
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, 64, 40);
  const d = x.getImageData(0, 0, 64, 40).data, h = new Array(64).fill(0);
  for (let i = 0; i < d.length; i += 4) h[(d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6)]++;
  return h.map(v => v / (64 * 40));
}, url);

/**
 * Each sampled thumbnail is compared with the stage showing that entry (and the others sampled): it must
 * look most like its own entry. A picture on the wrong entry fails this. Transitions are turned off (in
 * the dice settings) and the animation paused, so the stage shows the piece itself.
 */
async function thumbsMatchStage(page: Page, sample: number) {
  const s = await stored(page);
  const n = s.ids.length, pick = [...new Set(Array.from({ length: sample }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, sample - 1))))];
  await page.getByRole('button', { name: 'Ajustes del azar' }).click();
  await page.getByRole('group', { name: 'Transición', exact: true }).getByRole('button', { name: 'Ninguna' }).click();
  await page.keyboard.press('Escape');
  if (await page.getByRole('button', { name: 'Pausar animación' }).count()) await page.getByRole('button', { name: 'Pausar animación' }).click();
  const stage: number[][] = [], thumbs: number[][] = [];
  for (const i of pick) {
    const item = page.locator('.strip .thumb').nth(i);
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await expect(page.locator('.seedline')).toContainText(`${i + 1}/${n}`);
    // the stage shows the clicked piece only once its change is prepared (a slow compile on a busy machine)
    await page.waitForTimeout(300);
    await expect(page.locator('.stage canvas[data-busy]')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(1200);
    const shot = await page.locator('.stage canvas').first().screenshot();
    stage.push(await histOf(page, 'data:image/png;base64,' + shot.toString('base64')));
    thumbs.push(await histOf(page, s.thumbs[s.ids[i]]));
  }
  const l1 = (a: number[], b: number[]) => a.reduce((t, v, k) => t + Math.abs(v - b[k]), 0);
  const ranks = thumbs.map((t, i) => stage.filter((st, j) => j !== i && l1(t, st) < l1(t, stage[i])).length);
  return { checked: pick.length, first: ranks.filter(r => r === 0).length, ranks };
}

async function allThumbs(page: Page, o: { timeout?: number; sample?: number } = {}) {
  await expect.poll(() => missing(page), { timeout: o.timeout ?? 240_000, intervals: [1000] }).toEqual([]);
  await expect.poll(() => blankItems(page), { timeout: 30_000 }).toEqual([]);
  // each is marked with the version of the recipe it shows (the current one may still be on its way)
  await expect.poll(async () => { const t = await stored(page); return t.ids.filter(id => !t.bodies[id]?.thumbV).map(id => `${t.ids.indexOf(id) + 1}:${(t.bodies[id] as { kind?: string }).kind}`); }, { timeout: 60_000 }).toEqual([]);
  // all different, except entries with the same recipe (a favourite opened again): each from its own recipe
  const t = await stored(page);
  const byVersion = new Map(t.ids.map(id => [t.bodies[id].thumbV, t.thumbs[id]]));
  expect(new Set(t.ids.map(id => t.thumbs[id])).size).toBe(byVersion.size);
  if (o.sample) {
    const m = await thumbsMatchStage(page, o.sample);
    expect(m.first, `rangos ${m.ranks.join(',')}`).toBeGreaterThanOrEqual(m.checked - 1);
    expect(Math.max(...m.ranks)).toBeLessThanOrEqual(1);
  }
}

test.describe('miniaturas del historial', () => {
  test.describe.configure({ timeout: 300_000 });

  test('una ráfaga de tiradas rápidas (tecla R) deja una miniatura en cada resultado, la suya', async ({ page }) => {
    const errors = await openStudio(page);
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('r');
      await page.waitForTimeout(100);
    }
    await expect(page.locator('.seedline')).toContainText('17/17');
    await allThumbs(page, { sample: 5 });
    expect(errors).toEqual([]);
  });

  test('ráfagas con clics, cambios de espacio y pasos atrás y adelante', async ({ page }) => {
    const errors = await openStudio(page);
    const dice = page.getByRole('button', { name: /Azar/ });
    for (let i = 0; i < 8; i++) await dice.click();
    await page.keyboard.press('2');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('r'); await page.waitForTimeout(80); }
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('1');
    for (let i = 0; i < 4; i++) await dice.click();
    await page.keyboard.press('ArrowLeft');
    await allThumbs(page, { sample: 4 });
    expect(errors).toEqual([]);
  });

  test('recargar en mitad de una ráfaga: las entradas guardadas reciben su miniatura', async ({ page }) => {
    await openStudio(page);
    for (let i = 0; i < 12; i++) { await page.keyboard.press('r'); await page.waitForTimeout(60); }
    // saved without their pictures (the page goes away before any is made)
    await expect.poll(async () => (await stored(page)).ids.length, { timeout: 15_000 }).toBe(13);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('13/13', { timeout: 45_000 });
    await allThumbs(page);
  });

  test('Variar, Explorar y abrir un favorito: cada entrada con la suya, y la colección también', async ({ page }) => {
    const errors = await openStudio(page);
    await page.keyboard.press('r');
    for (let i = 0; i < 3; i++) await page.keyboard.press('v');
    await page.keyboard.press('x');
    const cand = page.locator('.explore-grid button').nth(2);
    await expect(cand).not.toHaveText(/tejiendo/, { timeout: 60_000 });
    await cand.click();
    await page.keyboard.press('s');
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('r');
    await page.getByRole('button', { name: /Colección/ }).click();
    await page.locator('.fav-card .img').first().click();
    await expect(page.locator('.seedline')).toContainText('8/8');
    await allThumbs(page);
    // the favourite got the picture of its recipe too
    await page.getByRole('button', { name: /Colección/ }).click();
    await expect.poll(() => page.locator('.fav-card .img').first().evaluate(el => getComputedStyle(el).backgroundImage), { timeout: 30_000 }).toMatch(/^url\("data:image/);
    expect(errors).toEqual([]);
  });

  test('una pieza con imagen muestra su propia imagen, aunque el escenario muestre otra', async ({ page }) => {
    const errors = await openStudio(page);
    const A = png(64, 64, x => x < 0.5), B = png(64, 64, (_x, y) => y < 0.5);
    await drop(page, 'mitad-izquierda.png', A);                         // 1: image A (light on the left)
    await page.getByRole('tab', { name: 'Origen' }).click();
    await expect(page.locator('.panel').getByText('mitad-izquierda.png')).toBeVisible();
    await page.keyboard.press('r');                                      // 2: a pattern
    await expect(page.locator('.seedline')).toContainText('2/2');
    await page.keyboard.press('r');                                      // 3: image B (light on top)
    await expect(page.locator('.seedline')).toContainText('3/3');
    await drop(page, 'mitad-arriba.png', B);
    await expect(page.locator('.panel').getByText('mitad-arriba.png')).toBeVisible();
    await allThumbs(page);
    // made again with B on stage: entry 1 has to bring its own picture back from the browser's store
    await page.evaluate(() => new Promise<void>((res, rej) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const tx = req.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').delete(IDBKeyRange.bound('mt.v3.t:', 'mt.v3.t:\uffff'));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      };
    }));
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('3/3', { timeout: 45_000 });
    await expect(page.locator('.panel').getByText('mitad-arriba.png')).toBeVisible();
    await allThumbs(page);
    const s = await stored(page);
    const one = await halves(page, s.thumbs[s.ids[0]]), three = await halves(page, s.thumbs[s.ids[2]]);
    // left and right differ in entry 1 (image A), top and bottom in entry 3 (image B)
    expect(Math.abs(one.lr), JSON.stringify(one)).toBeGreaterThan(Math.abs(one.tb) + 10);
    expect(Math.abs(three.tb), JSON.stringify(three)).toBeGreaterThan(Math.abs(three.lr) + 10);
    expect(errors).toEqual([]);
  });

  test('si WebGL se pierde a mitad de un cambio, el escenario sigue en el motor básico y las miniaturas también', async ({ page }) => {
    const errors = await openStudio(page);
    await page.keyboard.press('r');
    // lost while the new piece is getting ready (or its transition runs)
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.stage canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('.bm-basic')).toContainText('WebGL dejó de responder', { timeout: 15_000 });
    for (let i = 0; i < 4; i++) { await page.keyboard.press('r'); await page.waitForTimeout(150); }
    await expect(page.locator('.seedline')).toContainText('6/6');
    await allThumbs(page);
    expect(errors).toEqual([]);
  });

  test('un historial guardado sin miniaturas (versiones anteriores) las recibe al verse en la tira', async ({ page }) => {
    await openStudio(page);
    for (let i = 0; i < 24; i++) { await page.keyboard.press('r'); await page.waitForTimeout(40); }
    await expect.poll(async () => (await stored(page)).ids.length, { timeout: 15_000 }).toBe(25);
    // as an earlier version left it: no thumbnail records, no versions, made two days ago
    await page.evaluate(() => new Promise<void>((res, rej) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const tx = req.result.transaction('keyval', 'readwrite');
        const st = tx.objectStore('keyval');
        const range = (p: string) => IDBKeyRange.bound(p, p + '￿');
        st.delete(range('mt.v3.t:'));
        const cur = st.openCursor(range('mt.v3.e:'));
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const v = { ...c.value, created: Date.now() - 2 * 86400_000 };
          delete v.thumbV;
          c.update(v);
          c.continue();
        };
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      };
    }));
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('25/25', { timeout: 45_000 });
    // the ones in view first
    await expect.poll(() => blankItems(page), { timeout: 120_000, intervals: [1000] }).toEqual([]);
    const early = await missing(page);
    expect(early.length).toBeGreaterThan(0);
    // then the rest, as the strip is scrolled back to its start (a few items at a time, like a person would)
    const strip = page.locator('.strip');
    for (let k = 0; k < 12 && (await missing(page)).length; k++) {
      // at once (the strip scrolls smoothly otherwise): the items checked next are the ones in view
      await strip.evaluate(el => { el.style.scrollBehavior = 'auto'; el.scrollLeft = Math.max(0, el.scrollLeft - el.clientWidth * 0.8); });
      await page.waitForTimeout(300);
      await expect.poll(() => blankItems(page), { timeout: 120_000, intervals: [1000] }).toEqual([]);
    }
    await allThumbs(page);
  });
});
