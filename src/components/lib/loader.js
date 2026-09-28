// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Carga — una pantalla (o un bloque) de carga hecha de caracteres: el porcentaje en números grandes,
 * una barra con precisión de subcarácter y una línea de estado. Tú dices cuánto va; al terminar se
 * deshace en caracteres y se oculta.
 * Monotrama · sin dependencias.
 *
 *   const carga = loader(document.querySelector('.carga'), { label: 'Cargando el mapa' });
 *   carga.set(0.4, 'Descargando texturas');   // 0..1 (o null: sin porcentaje conocido)
 *   carga.done();                             // se deshace y se oculta
 *
 * - Es una barra de progreso de verdad para los lectores de pantalla (role="progressbar" con su valor y
 *   su texto); los caracteres son decorativos.
 * - Con «reducir movimiento» nada parpadea ni se deshace: el número y la barra cambian al instante.
 */
export const loaderDefaults = {
  label: 'Cargando',
  width: 28,                // caracteres de la barra
  bar: ' ▏▎▍▌▋▊▉█',         // de vacío a lleno dentro de una celda (el primero es el vacío)
  track: '·',               // lo que falta de la barra
  big: true,                // el porcentaje en números grandes
  color: '',                // '' = el color del texto; o un color para la barra y los números
  // monoespaciada, para que los números y la barra no se descuadren ('' = la tipografía de tu página)
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  hide: true,               // al terminar, ocultar el elemento (hidden)
  onDone: null,             // función a la que llamar cuando termina
};

const DIGITS = {
  0: ['███', '█ █', '█ █', '█ █', '███'], 1: [' █ ', '██ ', ' █ ', ' █ ', '███'], 2: ['███', '  █', '███', '█  ', '███'],
  3: ['███', '  █', ' ██', '  █', '███'], 4: ['█ █', '█ █', '███', '  █', '  █'], 5: ['███', '█  ', '███', '  █', '███'],
  6: ['███', '█  ', '███', '█ █', '███'], 7: ['███', '  █', ' █ ', ' █ ', ' █ '], 8: ['███', '█ █', '███', '█ █', '███'],
  9: ['███', '█ █', '███', '  █', '███'], '%': ['█ █', '  █', ' █ ', '█  ', '█ █'], '?': ['███', '  █', ' ██', '   ', ' █ '],
};
const RAMP = '@%#*+=-:. ';

/** The percentage in big digits (5 lines). */
export function bigNumber(text) {
  const rows = ['', '', '', '', ''];
  for (const ch of String(text)) {
    const g = DIGITS[ch] ?? DIGITS['?'];
    for (let r = 0; r < 5; r++) rows[r] += (rows[r] ? ' ' : '') + g[r];
  }
  return rows;
}

/** A bar `width` characters long at `v` (0..1), with sub-character precision. */
export function loaderBar(v, width, bar = loaderDefaults.bar, track = loaderDefaults.track) {
  const cells = Array.from(bar), n = cells.length - 1, f = Math.max(0, Math.min(1, v)) * width;
  let s = '';
  for (let i = 0; i < width; i++) {
    const k = Math.max(0, Math.min(1, f - i));
    s += k >= 1 ? cells[n] : k > 0 ? cells[Math.max(1, Math.round(k * n))] : track;
  }
  return s;
}

export function loader(el, options = {}) {
  const o = { ...loaderDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prevHidden = el.hidden;
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-label', o.label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.hidden = false;
  const pre = document.createElement('pre');
  pre.setAttribute('aria-hidden', 'true');
  pre.style.cssText = `margin:0;font:inherit;${o.fontFamily ? 'font-family:' + o.fontFamily + ';' : ''}line-height:1.15;white-space:pre;${o.color ? 'color:' + o.color : ''}`;
  el.replaceChildren(pre);
  let value = null, shown = 0, status = o.label, raf = 0, t = 0, last = 0, ending = -1, finished = false;

  function frame() {
    const lines = [];
    const known = value !== null;
    const pct = known ? Math.round(shown * 100) : null;
    if (o.big) lines.push(...bigNumber(known ? pct + '%' : '?'), '');
    let barLine;
    if (known) barLine = loaderBar(shown, o.width, o.bar, o.track);
    else {
      // no known progress: a block that travels back and forth
      const p = reduced ? 0.5 : 0.5 - 0.5 * Math.cos(t * 2.2);
      const at = Math.round(p * (o.width - 4));
      barLine = Array.from({ length: o.width }, (_, i) => (i >= at && i < at + 4 ? Array.from(o.bar).pop() : o.track)).join('');
    }
    lines.push('[' + barLine + ']' + (known ? ' ' + String(pct).padStart(3) + ' %' : ''));
    const dots = reduced || finished ? '' : '.'.repeat(Math.floor(t * 2.5) % 4);
    lines.push(status + dots);
    let text = lines.join('\n');
    if (ending >= 0) {
      // the loader comes apart: each character goes down a ramp to nothing, at its own moment
      const p = Math.min(1, (t - ending) / 0.45);
      text = Array.from(text).map((c, i) => {
        if (c === '\n' || c === ' ') return c;
        const s = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.6;
        const k = (p - s) / 0.4;
        return k <= 0 ? c : k >= 1 ? ' ' : RAMP[Math.min(RAMP.length - 1, Math.floor(k * RAMP.length))];
      }).join('');
      if (p >= 1) { finish(); return; }
    }
    pre.textContent = text;
  }
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    if (value !== null) shown = reduced ? value : shown + (value - shown) * Math.min(1, dt * 8);
    frame();
    if (!finished && !reduced) raf = requestAnimationFrame(tick);
  }
  function finish() {
    finished = true;
    cancelAnimationFrame(raf);
    pre.textContent = '';
    if (o.hide) el.hidden = true;
    el.setAttribute('aria-busy', 'false');
    if (typeof o.onDone === 'function') o.onDone();
  }
  el.setAttribute('aria-busy', 'true');
  if (reduced) frame(); else raf = requestAnimationFrame(tick);

  return {
    /** Progress 0..1 (null when it is not known) and, optionally, what is happening. */
    set(v, label) {
      value = v === null || v === undefined ? null : Math.max(0, Math.min(1, Number(v) || 0));
      if (label) status = String(label);
      if (value === null) { el.removeAttribute('aria-valuenow'); el.setAttribute('aria-valuetext', status); }
      else { el.setAttribute('aria-valuenow', String(Math.round(value * 100))); el.setAttribute('aria-valuetext', `${Math.round(value * 100)} % · ${status}`); }
      if (reduced) { shown = value ?? 0; frame(); }
    },
    /** The end: 100 %, then it comes apart and hides (at once with reduced motion). */
    done(label) {
      this.set(1, label);
      if (reduced) { finish(); return; }
      ending = t + 0.25;
    },
    destroy() {
      cancelAnimationFrame(raf);
      finished = true;
      pre.remove();
      for (const a of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-busy']) el.removeAttribute(a);
      el.hidden = prevHidden;
    },
  };
}
