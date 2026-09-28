// Hecho con GLYPHOS · https://glyphos-ascii.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Rótulo ASCII — convierte un texto en letras grandes hechas de caracteres, para README,
 * terminales, comentarios de código o la web.
 * GLYPHOS · sin dependencias (usa <canvas> para rasterizar la tipografía).
 *
 *   const txt = renderBanner('HOLA', { width: 60, style: 'bloques' });
 */
export const bannerDefaults = {
  width: 64,                // columnas
  style: 'bloques',         // 'bloques' | 'medios' | 'sombra' | 'almohadilla' | 'densidad' | 'braille'
  font: '"Helvetica Neue", Arial, sans-serif',
  weight: 900,
  aspect: 2,                // alto/ancho de una celda de terminal
  threshold: 0.5,
};

const RAMP = ' .:-=+*#%@';

export function renderBanner(text, options = {}) {
  const o = { ...bannerDefaults, ...options };
  const lines = String(text || ' ').split('\n');
  const cols = Math.max(4, Math.round(o.width));
  const cw = 8, ch = cw * o.aspect;          // one terminal cell, in canvas pixels
  const pxW = cols * cw;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const fs = 100;
  ctx.font = `${o.weight} ${fs}px ${o.font}`;
  const mw = Math.max(...lines.map(l => ctx.measureText(l).width), 1);
  const scale = (pxW * 0.96) / mw;
  const lineH = fs * 1.05 * scale;
  const pxH = Math.ceil(lineH * lines.length + 4);
  c.width = pxW; c.height = pxH;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pxW, pxH);
  ctx.fillStyle = '#fff';
  ctx.font = `${o.weight} ${fs * scale}px ${o.font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, pxW / 2, lineH * (i + 0.5) + 2));
  const img = ctx.getImageData(0, 0, pxW, pxH).data;
  const sample = (x0, y0, w, h) => {
    let s = 0, n = 0;
    for (let y = Math.floor(y0); y < Math.min(pxH, y0 + h); y++) for (let x = Math.floor(x0); x < Math.min(pxW, x0 + w); x++) { s += img[(y * pxW + x) * 4]; n++; }
    return n ? s / n / 255 : 0;
  };
  const rows = Math.ceil(pxH / ch);
  const BRAILLE = [[0, 0, 0x1], [0, 1, 0x2], [0, 2, 0x4], [1, 0, 0x8], [1, 1, 0x10], [1, 2, 0x20], [0, 3, 0x40], [1, 3, 0x80]];
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const x0 = col * cw, y0 = r * ch;
      if (o.style === 'medios') {
        const t = sample(x0, y0, cw, ch / 2) > o.threshold, b = sample(x0, y0 + ch / 2, cw, ch / 2) > o.threshold;
        line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
      } else if (o.style === 'braille') {
        let bits = 0;
        for (const [dx, dy, bit] of BRAILLE) if (sample(x0 + (dx * cw) / 2, y0 + (dy * ch) / 4, cw / 2, ch / 4) > o.threshold) bits |= bit;
        line += bits ? String.fromCharCode(0x2800 + bits) : ' ';
      } else {
        const v = sample(x0, y0, cw, ch);
        if (o.style === 'bloques') line += v > o.threshold ? '█' : ' ';
        else if (o.style === 'almohadilla') line += v > o.threshold ? '#' : ' ';
        else if (o.style === 'sombra') line += v > 0.8 ? '█' : v > 0.55 ? '▓' : v > 0.3 ? '▒' : v > 0.1 ? '░' : ' ';
        else line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const indent = Math.min(...out.filter(l => l.trim()).map(l => l.length - l.trimStart().length));
  return out.map(l => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

export function banner(el, text, options = {}) {
  el.setAttribute('aria-label', text);
  el.setAttribute('role', 'img');
  el.style.whiteSpace = 'pre';
  el.style.lineHeight = '1';
  el.textContent = renderBanner(text, options);
  return { destroy() { el.textContent = text; } };
}
