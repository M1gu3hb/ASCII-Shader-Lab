import { WORD_ACCENT, WORD_H, WORD_INK, WORD_W } from './brandArt.ts';

/**
 * GLYPHOS symbol: a halftone ramp across a 4×4 grid of dots that ends in a block cursor. Measured from the
 * official artwork (public/brand/glyphos-symbol.png): dots on a 7.5 step, radii growing along the diagonal,
 * a 6 × 6 square in the last cell.
 */
export function logoMark(size = 28, opts: { ink?: string; dot?: string; accent?: string; title?: string } = {}): string {
  const dot = opts.dot ?? 'currentColor', accent = opts.accent ?? 'var(--signal, #ff5b1f)';
  const bg = opts.ink ? `<rect width="32" height="32" rx="7" fill="${opts.ink}"/>` : '';
  const title = opts.title ? `<title>${opts.title}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img"${opts.title ? '' : ' aria-hidden="true"'}>${title}${bg}${symbolArt(dot, accent)}</svg>`;
}

const RADII = [1, 1.6, 2.1, 2.5, 2.8, 2.8, 2.8];
/** The symbol's dots and square in its 32 × 32 box (content from 2 to 30). */
function symbolArt(dot: string, accent: string): string {
  let dots = '';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (x === 3 && y === 3) continue;
    dots += `<circle cx="${4.5 + x * 7.5}" cy="${4.5 + y * 7.5}" r="${RADII[x + y]}"/>`;
  }
  return `<g fill="${dot}">${dots}</g><rect class="mt-cursor" x="24" y="24" width="6" height="6" fill="${accent}"/>`;
}

const ACCENT = '#ff5b1f';

/** The GLYPHOS wordmark as inline SVG: the letters take the text colour (currentColor), the accent stays orange. */
export function wordmark(height = 20, opts: { title?: string; className?: string } = {}): string {
  const w = Math.round((height * WORD_W) / WORD_H * 10) / 10;
  const label = opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORD_W} ${WORD_H}" width="${w}" height="${height}"${opts.className ? ` class="${opts.className}"` : ''}${label} focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${WORD_INK}"/><path fill="${ACCENT}" fill-rule="evenodd" d="${WORD_ACCENT}"/></svg>`;
}

/** Symbol and wordmark side by side, as in the official lockup (symbol as tall as the letters, a 0.14 gap). */
export function lockup(height = 40, opts: { dot?: string; ink?: string; title?: string } = {}): string {
  const H = WORD_H, gap = Math.round(H * 0.138), W = H + gap + WORD_W;
  const w = Math.round((height * W) / H * 10) / 10;
  const dot = opts.dot ?? 'currentColor', ink = opts.ink ?? 'currentColor';
  const label = opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${w}" height="${height}"${label} focusable="false">`
    + `<svg x="0" y="0" width="${H}" height="${H}" viewBox="2 2 28 28">${symbolArt(dot, ACCENT)}</svg>`
    + `<g transform="translate(${H + gap} 0)"><path fill="${ink}" fill-rule="evenodd" d="${WORD_INK}"/><path fill="${ACCENT}" fill-rule="evenodd" d="${WORD_ACCENT}"/></g></svg>`;
}

export const BRAND = {
  name: 'GLYPHOS',
  /** The name it had until September 2026: old files, links and exported code still say it. */
  formerName: 'Monotrama',
  tagline: 'Teje luz con caracteres',
  repo: 'https://github.com/M1gu3hb/ASCII-Shader-Lab',
};
