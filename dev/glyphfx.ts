import { glyphCurtain, weaveIntro, scrambleFrame } from '../src/shared/glyphfx';

/* QA for the motion primitives: tabs swap content (curtain + scrambled title); «Tejer» plays the studio's
   opening over the fake top bar, panel and deck (any key or click ends it); «Movimiento bajo» sets
   data-motion="low" on <html> (the studio does it with the preview quality «Ligera»). */
const body = document.getElementById('body')!;
const texts: Record<string, string> = { a: 'Capas', b: 'Color', c: 'Glifos' };
for (const id of ['a', 'b', 'c']) document.getElementById(id)!.addEventListener('click', () => {
  body.innerHTML = `<b>${texts[id]}</b><p>Contenido nuevo de ${texts[id]}.</p>`;
  glyphCurtain(body, { bg: '#1e1c19', origin: 'left', duration: 200, cell: 8 });
  const b = body.querySelector('b')!; let f = 0; const t0 = performance.now();
  const tick = () => { const p = (performance.now() - t0) / 260; b.textContent = scrambleFrame(texts[id], p, { tick: f++ >> 1 }); if (p < 1) requestAnimationFrame(tick); };
  tick();
});
const intro = () => {
  const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
  weaveIntro([
    { rect: rect('.top'), kind: 'panel', bg: '#0c0b0a' },
    { rect: rect('.panel'), kind: 'panel', bg: '#151412' },
    ...[...document.querySelectorAll('.tabs button')].map(el => ({ rect: el.getBoundingClientRect(), kind: 'control' as const })),
    { rect: rect('.card'), kind: 'control' },
    { rect: rect('.deck'), kind: 'panel', bg: '#151412' },
  ]);
};
document.getElementById('intro')!.addEventListener('click', e => { e.stopPropagation(); setTimeout(intro, 0); });
document.getElementById('low')!.addEventListener('change', e => {
  if ((e.target as HTMLInputElement).checked) document.documentElement.dataset.motion = 'low'; else delete document.documentElement.dataset.motion;
});
(window as unknown as { intro: () => void }).intro = intro;
