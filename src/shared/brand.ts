/** Monotrama logo: a halftone ramp across a 4×4 character grid that ends in a block cursor. */
export function logoMark(size = 28, opts: { ink?: string; dot?: string; accent?: string; title?: string } = {}): string {
  const dot = opts.dot ?? 'currentColor', accent = opts.accent ?? 'var(--signal, #ff5b1f)';
  const radii = [1, 1.6, 2.1, 2.5, 2.8, 2.8, 2.8];
  let dots = '';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (x === 3 && y === 3) continue;
    dots += `<circle cx="${7 + x * 6}" cy="${7 + y * 6}" r="${radii[x + y]}"/>`;
  }
  const bg = opts.ink ? `<rect width="32" height="32" rx="7" fill="${opts.ink}"/>` : '';
  const title = opts.title ? `<title>${opts.title}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img"${opts.title ? '' : ' aria-hidden="true"'}>${title}${bg}<g fill="${dot}">${dots}</g><rect class="mt-cursor" x="22" y="22" width="6" height="6" fill="${accent}"/></svg>`;
}

export const BRAND = {
  name: 'Monotrama',
  tagline: 'Teje luz con caracteres',
  repo: 'https://github.com/M1gu3hb/ASCII-Shader-Lab',
};
