/**
 * «Tira diez veces. Vuelve a la cuarta.»: a working miniature of the studio's dice. «Tirar» weaves a new
 * piece on the live stage (the studio's own roll(), which holds back what you just saw), every result
 * joins a strip you can go back to, and the contact sheet below (pre-rendered draws, one per style) opens
 * its piece on the stage. «Abrir en el estudio» carries the exact recipe in the link.
 */
import { defaultRecipe, type Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { archById, roll } from '../random';
import { encodeRecipe } from '../shared/share';
import { AZAR_GEN, AZAR_SPACE, CONTACTS, woven } from './azar-data';
import { live, morph, settled, still, track } from './live';

interface Result { r: Recipe; seed: string; name: string; btn: HTMLButtonElement }

/** A contact of the sheet (a figure in the HTML) becomes a button that weaves its piece on the stage. */
function asButton(li: HTMLElement): HTMLButtonElement {
  const seed = li.dataset.contact!;
  const c = CONTACTS.find(x => x.seed === seed);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.contact = seed;
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', `Tejer ${seed}${c ? ` (${c.name})` : ''} en el escenario`);
  const fig = li.querySelector('figure');
  if (fig) {
    const cap = document.createElement('span');
    cap.className = 'cap';
    const fc = fig.querySelector('figcaption');
    if (fc) cap.append(...Array.from(fc.childNodes));
    const img = fig.querySelector('img');
    if (img) btn.append(img);
    btn.append(cap);
    fig.replaceWith(btn);
  } else li.append(btn);
  return btn;
}

/** Results kept on this page (the studio keeps your last 1000 in the browser). */
const PAGE_MAX = 40;

export function mountAzar(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-azar]')!;
  const strip = root.querySelector<HTMLElement>('[data-azar-strip]')!;
  const count = root.querySelector<HTMLElement>('[data-azar-count]')!;
  const seedEl = root.querySelector<HTMLElement>('[data-azar-seed]')!;
  const open = root.querySelector<HTMLAnchorElement>('[data-azar-open]')!;
  const rollBtn = root.querySelector<HTMLButtonElement>('[data-azar-roll]')!;
  const prev = root.querySelector<HTMLButtonElement>('[data-azar-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-azar-next]')!;
  const contacts = Array.from(root.querySelectorAll<HTMLElement>('li[data-contact]')).map(asButton);

  const hist: Result[] = [];
  const seen = new Set<string>();
  let cur = -1;
  let engine: Renderer | null = null;
  let linkJob = 0;

  const archName = (r: Recipe) => archById(r.meta.arch)?.name ?? '';

  function paint() {
    const h = hist[cur];
    hist.forEach((x, i) => x.btn.setAttribute('aria-current', String(i === cur)));
    count.innerHTML = `<b>${cur + 1}</b> de ${hist.length}`;
    seedEl.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = h.seed;
    seedEl.append('semilla ', b, ` · ${h.name}`);
    prev.disabled = cur <= 0;
    next.disabled = cur >= hist.length - 1;
    contacts.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.contact === h.seed)));
    canvas.setAttribute('aria-label', `Resultado ${cur + 1} de ${hist.length}: semilla ${h.seed}, estilo ${h.name}`);
    const job = ++linkJob;
    void encodeRecipe({ ...h.r, meta: { ...h.r.meta, space: AZAR_SPACE } }).then(code => { if (job === linkJob) open.href = '/studio/#r=' + code; });
  }

  /** A thumbnail of what the stage shows once the change has landed (drawn from the live engine). */
  async function thumb(res: Result) {
    if (!engine) return;
    await settled(engine);
    if (hist[cur] !== res || engine.busy) return;
    const c = document.createElement('canvas');
    c.width = 168; c.height = 105;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    engine.drawTo(ctx, c.width, c.height);
    c.setAttribute('aria-hidden', 'true');
    res.btn.querySelector('canvas, img')?.remove();
    res.btn.prepend(c);
  }

  function add(r: Recipe, seed: string, img?: HTMLImageElement): Result {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const n = hist.length + 1;
    const name = archName(r);
    btn.setAttribute('aria-label', `Resultado ${n}: ${seed}, ${name}`);
    const num = document.createElement('span');
    num.textContent = String(n);
    num.setAttribute('aria-hidden', 'true');
    if (img) { const i = img.cloneNode() as HTMLImageElement; i.alt = ''; btn.append(i); }
    btn.append(num);
    li.append(btn);
    strip.append(li);
    const res: Result = { r, seed, name, btn };
    btn.addEventListener('click', () => go(hist.indexOf(res)));
    hist.push(res);
    if (hist.length > PAGE_MAX) { hist.shift()!.btn.parentElement!.remove(); }
    return res;
  }

  function show(i: number, how: 'roll' | 'back' | 'forward' | 'open') {
    const was = cur;
    cur = i;
    const r = still(structuredClone(hist[i].r));
    const t = how === 'roll' ? morph('disolucion', 0.85) : how === 'open' ? morph('iris', 0.8) : morph('barrido', 0.6, { dir: how === 'back' || i < was ? -1 : 1 });
    engine?.set(r, { transition: t });
    paint();
    hist[i].btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const go = (i: number) => { if (i >= 0 && i < hist.length && i !== cur) show(i, i < cur ? 'back' : 'forward'); };

  rollBtn.addEventListener('click', () => {
    const res = roll({ space: AZAR_SPACE, base: defaultRecipe(), seen, recent: hist.slice(-10).map(h => h.r), gen: AZAR_GEN });
    seen.add(res.fp);
    const r = res.recipe;
    r.interact.auto = true;
    const item = add(r, res.seed);
    show(hist.length - 1, 'roll');
    void thumb(item);
  });
  prev.addEventListener('click', () => go(cur - 1));
  next.addEventListener('click', () => go(cur + 1));
  contacts.forEach(btn => btn.addEventListener('click', () => {
    const seed = btn.dataset.contact!;
    const known = hist.findIndex(h => h.seed === seed);
    if (known >= 0) { go(known); return; }
    const d = CONTACTS.find(c => c.seed === seed);
    if (!d) return;
    const r = woven(d);
    r.interact.auto = true;
    add(r, seed, btn.querySelector('img') ?? undefined);
    show(hist.length - 1, 'open');
    canvas.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  // The strip starts with a few real results (in the HTML, so «going back» shows before any click): they
  // become the page's history, the last one on the stage (its image is the stage's poster).
  const seeded = Array.from(strip.querySelectorAll<HTMLElement>('li[data-seed]')).map(li => ({ li, c: CONTACTS.find(x => x.seed === li.dataset.seed) }));
  for (const { li, c } of seeded) {
    const img = li.querySelector('img') ?? undefined;
    li.remove();
    if (!c) continue;
    const r = woven(c);
    r.interact.auto = true;
    add(r, c.seed, img);
  }
  if (!hist.length) {
    const r = woven(CONTACTS[0]);
    r.interact.auto = true;
    add(r, CONTACTS[0].seed, contacts[0]?.querySelector('img') ?? undefined);
  }
  cur = hist.length - 1;
  const start = cur;
  const r0 = hist[cur].r;
  paint();
  void live(canvas, still(structuredClone(r0)), { maxPixelRatio: 1.25 }).then(e => {
    if (!e) return;
    engine = e;
    track(e);
    if (cur !== start) e.set(still(structuredClone(hist[cur].r)));
    void e.ready().then(() => { root.querySelector('.azar-stage img')?.remove(); canvas.parentElement!.dataset.live = e.kind; });
  });
}
