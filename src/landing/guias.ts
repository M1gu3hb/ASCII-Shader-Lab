/**
 * «Qué puedes hacer»: each guide card carries its example (scripts/seo.ts writes the picture; the loop is in
 * public/ex/guias/). The example shows and plays:
 *   - with a mouse, while the pointer is over the card (a click opens the guide, as any link);
 *   - with the keyboard, while the card has the focus (Enter opens the guide);
 *   - on a touch screen, after a first tap: the example grows under the row and plays, and a second tap
 *     opens the guide (a tap elsewhere, Escape or scrolling it away closes it). A screen reader hears so.
 * The loop is only fetched when a card first asks for it, plays only while shown and on screen, and never
 * with «reduce motion», «ahorro de datos» or the page paused: the picture stays.
 */

export interface GuideOptions {
  isPaused?: () => boolean;
  onPause?: (fn: (paused: boolean) => void) => void;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

export function mountGuides(root: ParentNode = document, o: GuideOptions = {}) {
  const cards = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.guide-card[data-loop]'));
  if (!cards.length) return;
  const moving = () => !reduced() && !saveData() && !(o.isPaused?.() ?? false);

  // one polite announcement per list: what a first tap did and what the next one does
  const say = document.createElement('p');
  say.className = 'vh';
  say.setAttribute('aria-live', 'polite');
  cards[0].closest('ul')?.after(say);

  const shown = new Set<HTMLAnchorElement>();
  const onScreen = new WeakMap<Element, boolean>();
  let open: HTMLAnchorElement | null = null;
  let lastPointer = '';

  const video = (card: HTMLAnchorElement) => {
    const box = card.querySelector<HTMLElement>('.gc-media');
    if (!box) return null;
    let v = box.querySelector('video');
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.tabIndex = -1;
      v.disablePictureInPicture = true;
      const base = card.dataset.loop!;
      for (const [ext, type] of [['mp4', 'video/mp4'], ['webm', 'video/webm']]) {
        const s = document.createElement('source');
        s.src = `${base}.${ext}`;
        s.type = type;
        v.append(s);
      }
      const vid = v;
      vid.addEventListener('playing', () => vid.classList.add('on'));
      box.append(vid);
    }
    return v;
  };

  const sync = (card: HTMLAnchorElement) => {
    const want = shown.has(card) && onScreen.get(card) !== false && moving();
    const v = want ? video(card) : card.querySelector('video');
    if (!v) return;
    if (want) void v.play().catch(() => undefined);
    else if (!v.paused) v.pause();
  };
  const show = (card: HTMLAnchorElement, on: boolean) => {
    if (on) shown.add(card); else shown.delete(card);
    sync(card);
  };

  const setOpen = (card: HTMLAnchorElement | null) => {
    if (open === card) return;
    if (open) {
      open.removeAttribute('data-open');
      open.querySelector('.gc-hint')?.remove();
      show(open, open === document.activeElement);
    }
    open = card;
    if (!card) return;
    card.setAttribute('data-open', '');
    const hint = document.createElement('span');
    hint.className = 'gc-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'Toca otra vez para abrir la guía →';
    card.append(hint);
    show(card, true);
    // the example opens under the row: bring it into view if it opened below the fold
    requestAnimationFrame(() => card.querySelector('.gc-media')?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }));
    say.textContent = `Ejemplo de «${card.querySelector('.gc-txt b')?.textContent ?? 'la guía'}» abierto. Toca otra vez para abrir la guía.`;
  };

  const io = new IntersectionObserver(es => es.forEach(e => {
    const card = e.target as HTMLAnchorElement;
    onScreen.set(card, e.isIntersecting);
    if (!e.isIntersecting && open === card) setOpen(null);
    sync(card);
  }));

  for (const card of cards) {
    io.observe(card);
    card.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
    card.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(card, true); });
    card.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && open !== card && document.activeElement !== card) show(card, false); });
    card.addEventListener('focus', () => { if (card.matches(':focus-visible')) show(card, true); });
    card.addEventListener('blur', () => { if (open !== card && !card.matches(':hover')) show(card, false); });
    card.addEventListener('click', e => {
      const touch = lastPointer === 'touch' || lastPointer === 'pen';
      lastPointer = '';
      // a mouse, the keyboard, or the second tap: the link does what links do
      if (!touch || open === card) return;
      e.preventDefault();
      setOpen(card);
    });
  }
  document.addEventListener('pointerdown', e => { if (open && !open.contains(e.target as Node)) setOpen(null); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(null); });
  o.onPause?.(() => cards.forEach(sync));
}
