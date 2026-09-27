/**
 * «Seis talleres, un solo telar»: one live stage and the studio's six spaces as tabs. Choosing a space
 * weaves the stage into a real piece of that space (the engine's own transitions), swaps the line of what
 * you make there and the link that opens it in the studio. «Otro ejemplo» walks through a few presets.
 * Loaded when the section comes near (src/landing/main.ts).
 */
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { glyphCurtain } from '../shared/glyphfx';
import { syntheticPhoto } from '../shared/sample';
import { PRESETS } from '../studio/presets';
import { magnet } from '../components/lib/magnet.js';
import { scramble } from '../components/lib/scramble.js';
import { progress, spinner } from '../components/lib/spinners.js';
import { typewriter } from '../components/lib/typewriter.js';
import { live, morph, reduced, still, track } from './live';
import { swapText } from './motion';
import { tabset } from './tabs';

type Space = 'fondos' | 'arte' | 'media' | 'tipo' | 'terminal' | 'componentes';
interface Example { name: string; make: () => Recipe }

const SPACE_NAME: Record<Space, string> = { fondos: 'Fondos', arte: 'Arte', media: 'Imagen', tipo: 'Tipo', terminal: 'Terminal', componentes: 'Piezas' };

function ex(space: keyof typeof PRESETS, id: string, tweak?: (r: Recipe) => void): Example {
  const p = PRESETS[space].find(x => x.id === id)!;
  return { name: p.name, make: () => { const r = p.make(); r.interact.auto = true; tweak?.(r); return still(r); } };
}

const EXAMPLES: Record<Space, Example[]> = {
  fondos: [ex('fondos', 'marea'), ex('fondos', 'orbita'), ex('fondos', 'papel-vivo')],
  arte: [ex('arte', 'saturno'), ex('arte', 'geoda'), ex('arte', 'nudo')],
  media: [ex('media', 'retrato', r => { r.glyph.cell = 7; }), ex('media', 'fosforo'), ex('media', 'bloques')],
  tipo: [ex('tipo', 'neon'), ex('tipo', 'disolver'), ex('tipo', 'trama')],
  terminal: [ex('terminal', 'donut'), ex('terminal', 'radar'), ex('terminal', 'consola')],
  // the interface pieces sit on a quiet background, as they would on a page
  componentes: [ex('fondos', 'bruma', r => { r.color.stops = ['#16181c', '#4a505a']; })],
};

const ARIA: Partial<Record<Space, string>> = {
  fondos: 'con un titular, un párrafo y un botón de ejemplo encima',
  media: 'sobre una foto de paisaje generada en tu navegador',
  terminal: 'dibujado como en una terminal de 80 columnas',
};

export function mountTelar(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('[role="tablist"]')!;
  const panel = root.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!;
  const caps = root.querySelector<HTMLElement>('.t-caps')!;
  const hudL = stage.querySelector<HTMLElement>('[data-hud-l]');
  const hudR = stage.querySelector<HTMLElement>('[data-hud-r]');
  const termTitle = stage.querySelector<HTMLElement>('[data-term-title]');
  const more = root.querySelector<HTMLElement>('[data-more]');
  const moreBtn = root.querySelector<HTMLButtonElement>('[data-more-btn]');
  const moreName = root.querySelector<HTMLElement>('[data-more-name]');

  const at: Record<Space, number> = { fondos: 0, arte: 0, media: 0, tipo: 0, terminal: 0, componentes: 0 };
  let space: Space = 'fondos';
  let engine: Renderer | null = null;
  let wanted: Recipe = EXAMPLES.fondos[0].make();
  let stopPieces: (() => void) | null = null;

  const describe = () => {
    const e = EXAMPLES[space][at[space]];
    const extra = ARIA[space] ? `, ${ARIA[space]}` : '';
    canvas.setAttribute('aria-label', space === 'componentes'
      ? 'Piezas de interfaz en vivo: descifrar, máquina de escribir, imán, indicadores y barra de progreso, sobre un fondo tranquilo'
      : `${SPACE_NAME[space]}: «${e.name}» en vivo${extra}`);
    if (hudL) swapText(hudL, `${SPACE_NAME[space]} · ${space === 'componentes' ? 'piezas' : e.name}`.toUpperCase());
    if (hudR) hudR.textContent = `${reduced ? 'quieto' : 'en vivo'} · ${at[space] + 1}/${EXAMPLES[space].length}`;
    if (termTitle) termTitle.textContent = `${e.name} — pieza.mjs`;
    if (moreName) moreName.textContent = `Ejemplo ${at[space] + 1} de ${EXAMPLES[space].length}: ${e.name}`;
    if (more) more.hidden = EXAMPLES[space].length < 2;
  };

  const show = (how: 'space' | 'example') => {
    wanted = EXAMPLES[space][at[space]].make();
    const t = how === 'space' ? morph('tejido', 0.9) : morph('barrido', 0.7, { dir: 1 });
    engine?.set(wanted, { transition: t });
    describe();
  };

  const select = (i: number, user: boolean) => {
    const tab = list.querySelectorAll<HTMLElement>('[role="tab"]')[i];
    const next = tab.dataset.space as Space;
    const changed = next !== space;
    space = next;
    panel.setAttribute('aria-labelledby', tab.id);
    stage.classList.toggle('term', space === 'terminal');
    stage.querySelectorAll<HTMLElement>('[data-over]').forEach(o => { o.hidden = o.dataset.over !== space; });
    caps.querySelectorAll<HTMLElement>('[data-cap]').forEach(c => { c.hidden = c.dataset.cap !== space; });
    if (user && changed) glyphCurtain(caps, { bg: '#0c0b0a', origin: 'left', duration: 260, cell: 9 });
    stopPieces?.();
    stopPieces = space === 'componentes' ? startPieces(stage) : null;
    if (changed || !user) show('space');
  };

  const tabs = tabset(list, (i, _t, user) => select(i, user));
  moreBtn?.addEventListener('click', () => {
    at[space] = (at[space] + 1) % EXAMPLES[space].length;
    show('example');
  });
  select(tabs.index, false);

  void live(canvas, wanted, { maxPixelRatio: 1.25 }).then(e => {
    if (!e) return;
    engine = e;
    track(e);
    e.setMedia('image', syntheticPhoto());
    // a space chosen while the engine was on its way
    if (e.recipe.meta !== wanted.meta) e.set(wanted);
    void e.ready().then(() => { stage.querySelector('img')?.remove(); });
  });
}

/** Real interface components from the Piezas space (src/components/lib), running while the tab is shown. */
function startPieces(stage: HTMLElement): () => void {
  const box = stage.querySelector<HTMLElement>('[data-over="componentes"]');
  if (!box) return () => undefined;
  const stops: Array<() => void> = [];
  const q = <T extends HTMLElement>(s: string) => box.querySelector<T>(s);
  const big = q('[data-pc-scramble]');
  if (big) stops.push(scramble(big, { trigger: 'loop', duration: 1300, loopDelay: 2400, chars: '#%*+=-:.' }).destroy);
  const type = q('[data-pc-type]');
  if (type) stops.push(typewriter(type, { phrases: ['> hola, mundo', 'Escribe. Borra. Repite.', 'Se escribe sola.'], typeSpeed: 55, hold: 1300 }).destroy);
  box.querySelectorAll<HTMLElement>('[data-spin]').forEach(el => stops.push(spinner(el, el.dataset.spin || 'braille').destroy));
  const bar = q('[data-pc-bar]');
  if (bar) {
    const p = progress(bar, { value: 0.64, width: 22, style: 'bloques' });
    let v = 0.1;
    const id = reduced ? 0 : window.setInterval(() => { v = v >= 1 ? 0 : Math.min(1, v + 0.02); p.set(v); }, 90);
    stops.push(() => clearInterval(id));
  }
  const word = q('[data-pc-magnet]');
  if (word) stops.push(magnet(word, { radius: 90, force: 22, accent: '#ff5b1f' }).destroy);
  return () => stops.forEach(s => s());
}
