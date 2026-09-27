import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Horizontal access: what in the studio cuts content sideways without saying so.
 * - a container that clips (overflow hidden/auto/scroll/clip) content wider than itself;
 * - a control that sticks out of the window;
 * - the page itself scrolling sideways;
 * - a scrolling row (ScrollRow, [data-scrollrow]) with more content on a side and no chevron on that side.
 * Rows made with ScrollRow may scroll: that is their job, as long as they show where more waits.
 * Left out: text fields and code (they scroll their text), previews of the piece and of a page (they are
 * pictures of something else), the history strip (its own lane) and visually hidden text.
 */
export function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
      }
      return true;
    };
    const exempt = (el: Element) => !!el.closest([
      'canvas', 'textarea', 'input[type=text]', 'input[type=number]', '.code', '.ansi-pre', '.gh-pre', '.vw-area', '.cv-host', '[inert]',
      '.comp-demo', '.comp-stage', '.wl-art', '.sr-only', '.swatch', '.strip', '[data-scrollrow]',
    ].join(', '));
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
    const modal = document.querySelector('dialog[open]');
    const root: ParentNode = modal ?? document;
    for (const el of root.querySelectorAll('*')) {
      if (exempt(el) || el.clientWidth <= 1 || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        out.push(`recorta: ${name(el)} (${el.scrollWidth} > ${el.clientWidth}) «${(el.textContent ?? '').trim().slice(0, 40)}»`);
      }
    }
    for (const el of root.querySelectorAll('button, a[href], input, [role=tab], [role=radio], [role=combobox]')) {
      if (exempt(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`fuera de la ventana: ${name(el)} «${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}»`);
    }
    for (const row of root.querySelectorAll<HTMLElement>('[data-scrollrow]')) {
      const list = row.querySelector<HTMLElement>('.srow-list');
      if (!list || !visible(row)) continue;
      const max = list.scrollWidth - list.clientWidth;
      if (max <= 1) continue;
      const next = row.querySelector<HTMLElement>('.srow-next'), prev = row.querySelector<HTMLElement>('.srow-prev');
      if (list.scrollLeft < max - 1 && !(next && visible(next))) out.push(`fila sin aviso de «más»: ${name(list)}`);
      if (list.scrollLeft > 1 && !(prev && visible(prev))) out.push(`fila sin aviso a la izquierda: ${name(list)}`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push(`la página se desborda: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    return [...new Set(out)];
  });
}

/** Chooses an option of one of the studio's pickers (a button that opens a list). */
export async function choose(page: Page, picker: Locator | string, option: string | RegExp) {
  const btn = typeof picker === 'string' ? page.locator(picker) : picker;
  await btn.click();
  await page.getByRole('listbox').getByRole('option', { name: option }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Contrast ratio of two CSS colours (rgb/rgba strings). */
export function contrastOf(fg: string, bg: string): number {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  const lum = (c: number[]) => {
    const [r, g, b] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(parse(fg)), b = lum(parse(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text and background colours of every pressed, checked or selected control in view (background: the first opaque one up the tree). */
export function pressedColours(page: Page): Promise<Array<{ what: string; fg: string; bg: string }>> {
  return page.evaluate(() => {
    const out: Array<{ what: string; fg: string; bg: string }> = [];
    for (const el of document.querySelectorAll<HTMLElement>('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !(el.textContent ?? '').trim() || el.closest('[inert], .cv-host')) continue;
      if (el.getAttribute('role') === 'switch' || (el as HTMLInputElement).type === 'checkbox') continue;
      // pictures with a label drawn over them (style tiles, comparisons) carry their own backdrop
      if (getComputedStyle(el).backgroundImage !== 'none') continue;
      // the backgrounds up the tree, composited over the first opaque one (or the page's ink)
      const layers: number[][] = [];
      for (let e: HTMLElement | null = el; e; e = e.parentElement) {
        const v = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
        const a = v.length > 3 ? v[3] : v.length ? 1 : 0;
        if (a > 0) layers.push([v[0], v[1], v[2], a]);
        if (a >= 1) break;
      }
      let [r0, g0, b0] = [12, 11, 10];
      for (const [r1, g1, b1, a] of layers.reverse()) { r0 = r1 * a + r0 * (1 - a); g0 = g1 * a + g0 * (1 - a); b0 = b1 * a + b0 * (1 - a); }
      const bg = `rgb(${Math.round(r0)}, ${Math.round(g0)}, ${Math.round(b0)})`;
      out.push({ what: `${el.tagName.toLowerCase()}.${el.className} «${(el.textContent ?? '').trim().slice(0, 24)}»`, fg: getComputedStyle(el).color, bg });
    }
    return out;
  });
}
