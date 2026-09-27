import { glyphCurtain, weaveIntro, scrambleFrame } from '../src/shared/glyphfx';
const body = document.getElementById('body')!;
const texts: Record<string, string> = { a: 'Capas', b: 'Color', c: 'Glifos' };
for (const id of ['a', 'b', 'c']) document.getElementById(id)!.addEventListener('click', () => {
  body.innerHTML = `<b>${texts[id]}</b><p>Contenido nuevo de ${texts[id]}.</p>`;
  glyphCurtain(body, { bg: '#1e1c19', origin: 'left' });
  const b = body.querySelector('b')!; let f = 0; const t0 = performance.now();
  const tick = () => { const p = (performance.now() - t0) / 260; b.textContent = scrambleFrame(texts[id], p, { tick: f++ }); if (p < 1) requestAnimationFrame(tick); };
  tick();
});
(window as unknown as { intro: () => void }).intro = () => {
  const rects = [...document.querySelectorAll('.top,.panel,.tabs button,.card')].map((el, i) => ({ rect: el.getBoundingClientRect(), kind: (i === 1 ? 'panel' : 'control') as 'panel' | 'control' }));
  weaveIntro(rects);
};
