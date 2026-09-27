// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Máquina de escribir — escribe frases, las sostiene y las borra; el borrado puede «marchitar»
 * cada letra por una rampa de densidad (@ # * + - . ) en vez de retroceder.
 * Monotrama · sin dependencias.
 *
 *   typewriter(el, { phrases: ['hola', 'mundo'], erase: 'decay' });
 */
export const typewriterDefaults = {
  phrases: ['Teje luz con caracteres.', 'Escribe. Borra. Repite.', 'Hola, terminal.'],
  typeSpeed: 55,          // ms por letra
  deleteSpeed: 28,        // ms por letra al borrar
  hold: 1600,             // ms con la frase completa
  cursor: 'block',        // 'block' | 'bar' | 'underscore' | 'none'
  erase: 'decay',         // 'decay' | 'backspace'
  ramp: '@#*+=-:. ',      // de lleno a vacío, para el borrado 'decay'
  loop: true,
};

const CURSORS = { block: '█', bar: '▏', underscore: '_', none: '' };

export function typewriter(el, options = {}) {
  const o = { ...typewriterDefaults, ...options };
  const phrases = (Array.isArray(o.phrases) ? o.phrases : String(o.phrases).split('\n')).filter(Boolean);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.textContent = '';
  const sr = document.createElement('span');
  sr.textContent = phrases.map(p => (/[.!?…:;]$/.test(p) ? p : p + '.')).join(' ');
  sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  vis.style.whiteSpace = 'pre-wrap';
  const cur = document.createElement('span');
  cur.setAttribute('aria-hidden', 'true');
  cur.className = 'mt-tw-cursor';
  cur.textContent = CURSORS[o.cursor] ?? '';
  cur.style.cssText = 'display:inline-block;margin-left:.04em;animation:mt-blink 1s steps(2,start) infinite';
  if (!document.getElementById('mt-blink-style')) {
    const st = document.createElement('style');
    st.id = 'mt-blink-style';
    st.textContent = '@keyframes mt-blink{to{visibility:hidden}}@media (prefers-reduced-motion:reduce){.mt-tw-cursor{animation:none!important}}';
    document.head.appendChild(st);
  }
  el.append(sr, vis, cur);
  if (reduced || !phrases.length) { vis.textContent = phrases[0] ?? ''; return { destroy() { el.textContent = phrases[0] ?? ''; } }; }

  const ramp = Array.from(o.ramp);
  let timer = 0, alive = true;
  const wait = ms => new Promise(r => { timer = setTimeout(r, ms); });

  async function run() {
    let k = 0;
    while (alive) {
      const chars = Array.from(phrases[k % phrases.length]);
      cur.style.animationPlayState = 'paused';
      for (let i = 1; i <= chars.length && alive; i++) {
        vis.textContent = chars.slice(0, i).join('');
        await wait(o.typeSpeed * (chars[i - 1] === ' ' ? 0.6 : 0.7 + Math.random() * 0.6));
      }
      cur.style.animationPlayState = 'running';
      await wait(o.hold);
      if (!alive) return;
      if (!o.loop && k === phrases.length - 1) return;
      cur.style.animationPlayState = 'paused';
      if (o.erase === 'decay') {
        // every letter withers through the ramp, starting from the end, as a wave
        const life = chars.map((_, i) => -(chars.length - 1 - i) * 0.6);
        let done = false;
        while (!done && alive) {
          done = true;
          let s = '';
          for (let i = 0; i < chars.length; i++) {
            life[i] += 1;
            if (life[i] <= 0) { s += chars[i]; done = false; }
            else if (life[i] < ramp.length) { s += chars[i] === ' ' ? ' ' : ramp[Math.floor(life[i])]; done = false; }
          }
          vis.textContent = s.replace(/\s+$/, '');
          await wait(o.deleteSpeed);
        }
      } else {
        for (let i = chars.length; i >= 0 && alive; i--) {
          vis.textContent = chars.slice(0, i).join('');
          await wait(o.deleteSpeed);
        }
      }
      await wait(300);
      k++;
    }
  }
  run();
  return { destroy() { alive = false; clearTimeout(timer); el.textContent = phrases[0] ?? ''; } };
}
