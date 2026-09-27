import { expect, type Page } from '@playwright/test';

/* Canvas and export-sheet checks shared by the basic-mode specs. */

/** Distinct colours in a canvas (scaled down): 1 means an empty or flat canvas. */
export async function colours(page: Page, selector: string): Promise<number> {
  return page.evaluate(sel => {
    const c = document.querySelector<HTMLCanvasElement>(sel);
    if (!c || !c.width || !c.height) return 0;
    const w = Math.min(200, c.width), h = Math.min(120, c.height);
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    const x = t.getContext('2d')!;
    x.drawImage(c, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return seen.size;
  }, selector);
}

export const drawn = (page: Page, selector: string) => expect.poll(() => colours(page, selector), { message: `${selector} draws`, timeout: 20_000 }).toBeGreaterThan(3);

/** The renderer kind behind a canvas: WebGL 2 context, 2D context, or none yet. */
export const contextOf = (page: Page, selector: string) => page.evaluate(sel => {
  const c = document.querySelector<HTMLCanvasElement>(sel);
  if (!c) return 'none';
  // a canvas keeps the context type it was first given: asking for the other one returns null
  if (c.getContext('webgl2')) return 'webgl2';
  return c.getContext('2d') ? '2d' : 'none';
}, selector);

export async function openExport(page: Page, tab: string) {
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: tab }).click();
}

/** Every video format is either a working button or a row that says why not. */
export async function honestVideoTab(page: Page) {
  for (const [button, row] of [['MP4 (H.264)', /MP4.*no disponible/], ['WebM', /WebM.*no disponible|MP4 y WebM: no disponibles/]] as const) {
    const btn = page.getByRole('button', { name: button, exact: true });
    await expect.poll(async () => (await btn.count()) + (await page.getByText(row).count()), { message: button }).toBeGreaterThan(0);
    if (await btn.count()) await expect(btn).toBeEnabled();
  }
}
