// Hecho con GLYPHOS · https://glyphos-ascii.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Enlaces con interferencia — al pasar el cursor o al llegar con el teclado, el texto del enlace se
 * revuelve un instante en caracteres y vuelve. Para un menú, un pie de página o una lista de enlaces.
 * GLYPHOS · sin dependencias.
 *
 *   glitchLinks(document.querySelector('nav'), { color: '#ff5b1f' });
 *
 * - Sólo toca los enlaces (y botones, si lo pides) que tienen texto sin otros elementos dentro.
 * - El texto del enlace no se toca: la interferencia es una capa encima, oculta para los lectores de
 *   pantalla (el nombre del enlace no cambia) y que desaparece al terminar. Sirve también con React.
 * - Mantiene el ancho de cada letra con tipografías monoespaciadas; con otras puede moverse un poco.
 * - Con «reducir movimiento» no hay interferencia.
 */
export const glitchDefaults = {
  selector: 'a[href]',      // qué elementos (dentro del contenedor) reciben la interferencia
  chars: '!<>-_\\/[]{}=+*^?#01',
  duration: 320,            // ms
  color: '',                // color de los caracteres revueltos ('' = el del enlace)
};

export function glitchLinks(root, options = {}) {
  const o = { ...glitchDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pool = Array.from(o.chars);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const live = new Map();

  function play(a) {
    if (reduced || live.has(a) || a.childElementCount || !a.textContent.trim()) return;
    const text = a.textContent;
    const letters = Array.from(text);
    const layer = document.createElement('span');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:absolute;left:0;top:0;white-space:pre;pointer-events:none;-webkit-text-fill-color:currentColor';
    const pos = a.style.position, fill = a.style.webkitTextFillColor;
    if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
    // the link's own letters stay (and keep their underline), only unpainted while the layer shows
    a.style.webkitTextFillColor = 'transparent';
    a.append(layer);
    const t0 = performance.now();
    const end = () => {
      cancelAnimationFrame(state.raf);
      layer.remove();
      a.style.webkitTextFillColor = fill;
      a.style.position = pos;
      live.delete(a);
    };
    const state = { raf: 0, end };
    const frame = now => {
      const p = (now - t0) / o.duration;
      if (p >= 1 || !a.isConnected) { end(); return; }
      // a band of noise sweeps across the word and leaves it as it was
      let html = '', noise = '';
      const flush = () => { if (noise) html += o.color ? `<span style="color:${o.color};-webkit-text-fill-color:${o.color}">${esc(noise)}</span>` : esc(noise); noise = ''; };
      letters.forEach((c, i) => {
        const at = i / Math.max(1, letters.length - 1);
        if (c === ' ' || Math.abs(at - p * 1.3 + 0.15) > 0.22) { flush(); html += esc(c); }
        else noise += pool[(Math.random() * pool.length) | 0];
      });
      flush();
      layer.innerHTML = html;
      state.raf = requestAnimationFrame(frame);
    };
    live.set(a, state);
    frame(t0);
  }

  const onEnter = e => { const a = e.target.closest?.(o.selector); if (a && root.contains(a)) play(a); };
  root.addEventListener('pointerover', onEnter);
  root.addEventListener('focusin', onEnter);
  return {
    destroy() {
      root.removeEventListener('pointerover', onEnter);
      root.removeEventListener('focusin', onEnter);
      for (const s of [...live.values()]) s.end();
    },
  };
}
