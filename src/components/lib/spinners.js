// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Indicadores de carga y barras de progreso ASCII, para la web y para la terminal.
 * Monotrama · sin dependencias.
 *
 *   spinner(el, 'braille');
 *   progress(el, { value: 0.42, style: 'bloques' });
 */
export const SPINNERS = {
  braille: { frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], interval: 80 },
  linea: { frames: ['|', '/', '-', '\\'], interval: 110 },
  puntos: { frames: ['.  ', '.. ', '...', ' ..', '  .', '   '], interval: 160 },
  trama: { frames: [' ', '░', '▒', '▓', '█', '▓', '▒', '░'], interval: 90 },
  barras: { frames: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'], interval: 70 },
  arco: { frames: ['◜', '◠', '◝', '◞', '◡', '◟'], interval: 100 },
  pulso: { frames: ['·', '•', '●', '•'], interval: 180 },
  rebote: { frames: ['[=   ]', '[ =  ]', '[  = ]', '[   =]', '[  = ]', '[ =  ]'], interval: 110 },
  orbita: { frames: ['◐', '◓', '◑', '◒'], interval: 120 },
  ascii: { frames: ['.', 'o', 'O', '@', '*', ' '], interval: 120 },
};

export function spinner(el, name = 'braille', interval) {
  const s = typeof name === 'string' ? SPINNERS[name] ?? SPINNERS.braille : { frames: name, interval: interval ?? 100 };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.setAttribute('role', 'status');
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Cargando');
  el.style.fontVariantNumeric = 'tabular-nums';
  el.style.whiteSpace = 'pre';
  let i = 0;
  el.textContent = s.frames[0];
  if (reduced) return { destroy() {} };
  const id = setInterval(() => { i = (i + 1) % s.frames.length; el.textContent = s.frames[i]; }, interval ?? s.interval);
  return { destroy() { clearInterval(id); } };
}

export const BAR_STYLES = {
  clasica: { l: '[', r: ']', full: '#', empty: '.', parts: [] },
  bloques: { l: '', r: '', full: '█', empty: '░', parts: ['▏', '▎', '▍', '▌', '▋', '▊', '▉'] },
  trama: { l: '▕', r: '▏', full: '▓', empty: '░', parts: ['▒'] },
  flechas: { l: '[', r: ']', full: '=', empty: ' ', parts: ['>'] },
  puntos: { l: '', r: '', full: '●', empty: '○', parts: ['◐'] },
};

/** Returns a progress bar as a string (useful in terminals too). */
export function progressText(value, width = 24, style = 'bloques') {
  const s = BAR_STYLES[style] ?? BAR_STYLES.bloques;
  const v = Math.max(0, Math.min(1, value));
  const exact = v * width;
  const full = Math.floor(exact);
  const frac = exact - full;
  let bar = s.full.repeat(full);
  if (full < width) {
    bar += s.parts.length && frac > 0 ? s.parts[Math.min(s.parts.length - 1, Math.floor(frac * s.parts.length))] : s.empty;
    bar += s.empty.repeat(Math.max(0, width - full - 1));
  }
  return `${s.l}${bar}${s.r} ${String(Math.round(v * 100)).padStart(3)}%`;
}

export function progress(el, options = {}) {
  const o = { value: 0, width: 24, style: 'bloques', ...options };
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.style.whiteSpace = 'pre';
  const set = v => {
    o.value = v;
    el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    el.textContent = progressText(v, o.width, o.style);
  };
  set(o.value);
  return { set, destroy() {} };
}
