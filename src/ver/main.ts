/**
 * The public viewer (/ver/): a shared piece, full screen, exactly as it was seen where it was shared.
 *
 * The link carries the recipe and the frame it was seen in (src/shared/frame.ts): the canvas is laid out at
 * the frame's own size, drawn at a pixel ratio of 1 with the frame's cells, and scaled as a whole to fit the
 * screen, with the piece's background around it. So a piece made on a wide monitor keeps its composition on
 * a phone held upright (smaller, letterboxed), and never reflows to the screen that opens it.
 *
 * The page itself is tiny; the engine (WebGL 2, or the basic engine without it) is a chunk fetched once the
 * link is read. Nothing here needs storage, the clipboard or a permission, so it opens the same inside the
 * browsers of messaging apps. A person's photo, video or camera never travels in a link: the piece shows its
 * pattern instead, and says so.
 */
import '../shared/fonts.css';
import './viewer.css';
import { logoMark, wordmark } from '../shared/brand';
import { decodeRecipe, pieceHash, readPieceHash, type ShareView } from '../shared/share';
import { defaultFrame, describeFrame, encodeFrame, fitFrame, frameRecipe, gridOf, reduceFrame, type Frame } from '../shared/frame';
import { patternById } from '../engine/catalog';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';

const root = document.getElementById('ver')!;

const matches = (q: string) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };
const reduced = matches('(prefers-reduced-motion: reduce)');
const coarse = matches('(pointer: coarse)');

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  exit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** «faro-lunar-417» → «faro lunar 417»; the piece's own name when it has one. */
const titleOf = (r: Recipe) => r.meta.name?.trim() || r.meta.seed?.replace(/-/g, ' ') || '';

/** What the piece is, for screen readers (the canvas itself is only pixels). */
function describe(r: Recipe, f: Frame, playing: boolean): string {
  const pats = [...new Set(r.layers.filter(l => l.on).map(l => patternById(l.pattern).name))].join(', ');
  const src = r.source === 'text' ? `el texto «${r.text.content.slice(0, 80)}»` : r.source === 'pattern' ? '' : 'su patrón de fondo';
  const what = [src, pats && `patrones ${pats}`].filter(Boolean).join(' con ');
  const msg = r.msg.on && r.msg.text ? ` Mensaje: «${r.msg.text.slice(0, 80)}».` : '';
  return `Pieza de arte ASCII${playing ? ' en movimiento' : ' en pausa'}${what ? `: ${what}` : ''}. Colores ${r.color.stops.join(', ')} sobre ${r.color.bg}. Encuadre original ${describeFrame(f)}.${msg}`;
}

/* ------------------------------------------------------------------ */

function problem(title: string, body: string, studio?: string) {
  document.title = 'Pieza no disponible · GLYPHOS';
  const main = el('main', 'ver-problem');
  const brand = el('a', 'ver-brand');
  brand.href = '/';
  brand.setAttribute('aria-label', 'Ir a GLYPHOS, la portada');
  brand.innerHTML = logoMark(26) + wordmark(15, { className: 'ver-word' });
  const h = el('h1', undefined, title);
  const p = el('p', undefined, body);
  const acts = el('div', 'ver-problem-acts');
  const a1 = el('a', 'ver-btn primary', studio ? 'Abrir en el estudio' : 'Abrir el estudio');
  a1.href = studio ?? '/studio/';
  const a2 = el('a', 'ver-btn', 'Ir a GLYPHOS');
  a2.href = '/';
  acts.append(a1, a2);
  main.append(brand, h, p, acts);
  root.replaceChildren(main);
  root.dataset.state = 'error';
}

async function start() {
  const { code, view } = readPieceHash(location.hash);
  if (!code) {
    // a seed or a space (#seed=…, #space=…) belongs to the studio, as it always did
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('seed') || h.get('space')) { location.replace('/studio/' + location.hash); return; }
    problem('Este enlace no trae ninguna pieza', 'Los enlaces de GLYPHOS llevan la pieza después del «#». Pide que te lo envíen de nuevo, o crea la tuya en el estudio.');
    return;
  }
  const recipe = await decodeRecipe(code);
  if (!recipe) {
    problem('No se pudo leer esta pieza', 'Puede que el enlace se haya cortado al copiarlo o al enviarlo. Pide que te lo envíen de nuevo, completo, o crea la tuya en el estudio.');
    return;
  }
  await show(recipe, code, view);
}

/* ------------------------------------------------------------------ */

async function show(recipe: Recipe, code: string, view: ShareView) {
  const frame = view.frame ?? defaultFrame(recipe);
  const studioHref = '/studio/#' + pieceHash(code, { frame });
  const name = titleOf(recipe);
  document.title = (name ? `${name} · ` : '') + 'Pieza de arte ASCII · GLYPHOS';
  // the piece's background frames it (letterbox), from the first paint
  document.documentElement.style.background = recipe.color.bg;
  document.body.style.background = recipe.color.bg;

  const wrap = el('div', 'ver');
  wrap.dataset.ui = 'on';
  const h1 = el('h1', 'sr-only', name ? `«${name}», una pieza de arte ASCII hecha con GLYPHOS` : 'Una pieza de arte ASCII hecha con GLYPHOS');

  const stage = el('div', 'ver-stage');
  stage.setAttribute('role', 'img');
  stage.dataset.state = 'loading';
  stage.dataset.frame = encodeFrame(frame);
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);

  const top = el('header', 'ver-top');
  const brand = el('a', 'ver-brand');
  brand.href = '/';
  brand.setAttribute('aria-label', 'Ir a GLYPHOS, la portada');
  brand.title = 'Ir a GLYPHOS';
  brand.innerHTML = logoMark(24) + wordmark(14, { className: 'ver-word' });
  top.append(brand);

  const notes = el('div', 'ver-notes');
  notes.setAttribute('role', 'status');

  const bar = el('div', 'ver-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Controles de la pieza');
  const play = el('button', 'ver-ib');
  play.type = 'button';
  const fsOk = !!(document.fullscreenEnabled || (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
  const full = el('button', 'ver-ib');
  full.type = 'button';
  full.innerHTML = ICON.full;
  full.setAttribute('aria-label', 'Pantalla completa (F)');
  full.title = 'Pantalla completa (F)';
  const cap = el('p', 'ver-cap');
  const capName = el('b', undefined, name || 'Pieza de arte ASCII');
  const capSub = el('span', undefined, `Hecha con GLYPHOS · encuadre original, ${describeFrame(frame)}`);
  cap.append(capName, capSub);
  const go = el('div', 'ver-go');
  const home = el('a', 'ver-btn ghost', 'Ir a GLYPHOS');
  home.href = '/';
  const open = el('a', 'ver-btn primary');
  open.href = studioHref;
  open.innerHTML = ICON.open;
  open.append(el('span', undefined, 'Abrir en el estudio'));
  open.title = 'Abre esta pieza en el estudio, como una entrada nueva de tu historial, para editarla o exportarla';
  go.append(home, open);
  bar.append(play, ...(fsOk ? [full] : []), cap, go);

  const live = el('p', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  wrap.append(h1, stage, top, notes, bar, live);
  root.replaceChildren(wrap);
  root.dataset.state = 'piece';

  /* ---------------- fit: the frame, scaled whole, centred ---------------- */
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const vw0 = stage.clientWidth || innerWidth, vh0 = stage.clientHeight || innerHeight;
  // the same composition with fewer pixels when it shows much smaller than it is (exact divisors only)
  const shown = fitFrame(frame, vw0, vh0).width * dpr;
  const { frame: drawn, divisor } = reduceFrame(frame, shown);
  stage.dataset.divisor = String(divisor);
  let cv = canvas;
  const place = () => {
    const vw = stage.clientWidth || innerWidth, vh = stage.clientHeight || innerHeight;
    const fit = fitFrame(drawn, vw, vh);
    cv.style.width = drawn.w + 'px';
    cv.style.height = drawn.h + 'px';
    cv.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
    rotateHint(vw, vh);
  };
  const rotateHint = (vw: number, vh: number) => {
    // a wide piece on a phone held upright (or the other way round) shows small: say it once it would help
    const portrait = vh > vw, wide = frame.w > frame.h * 1.25, tall = frame.h > frame.w * 1.25;
    const small = fitFrame(frame, vw, vh).scale < 0.6 * fitFrame(frame, vh, vw).scale;
    setNote('rotate', coarse && small && ((portrait && wide) || (!portrait && tall)) ? 'Gira el teléfono para verla más grande.' : null);
  };
  const noteEls = new Map<string, HTMLElement>();
  function setNote(id: string, text: string | null) {
    const had = noteEls.get(id);
    if (!text) { had?.remove(); noteEls.delete(id); return; }
    if (had) { had.textContent = text; return; }
    const p = el('p', 'ver-note', text);
    noteEls.set(id, p);
    notes.append(p);
  }
  place();
  if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(stage);
  else addEventListener('resize', place);

  const src = recipe.source;
  if (src === 'image' || src === 'video') {
    setNote('media', `Esta pieza se hizo con ${src === 'video' ? 'un video' : 'una imagen'} de quien la compartió, que no viaja en los enlaces: aquí ves su estilo con el patrón de fondo.`);
  } else if (src === 'camera') {
    setNote('media', 'Esta pieza usa la cámara de quien la mira. Aquí ves su patrón de fondo; ábrela en el estudio para verla con tu cámara.');
  }

  /* ---------------- controls: play, full screen, auto-hide ---------------- */
  let renderer: Renderer | null = null;
  let playing = !view.paused && !reduced;
  const setPlay = (on: boolean, say = true) => {
    playing = on;
    if (renderer) { if (on) renderer.play(); else renderer.pause(); }
    play.innerHTML = on ? ICON.pause : ICON.play;
    const label = on ? 'Pausar (espacio)' : 'Reproducir (espacio)';
    play.setAttribute('aria-label', label);
    play.title = label;
    stage.setAttribute('aria-label', describe(recipe, frame, on));
    if (say) live.textContent = on ? 'Reproduciendo' : 'En pausa';
    setNote('reduced', !on && reduced ? 'En pausa porque tu sistema pide menos movimiento. Pulsa reproducir para verla moverse.' : null);
    wake();
  };
  play.addEventListener('click', () => setPlay(!playing));

  const fsEl = () => document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
  const toggleFull = () => {
    if (!fsOk) return;
    const d = document as Document & { webkitExitFullscreen?: () => void };
    const r = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (fsEl()) (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
      else {
        const p = (r.requestFullscreen ?? r.webkitRequestFullscreen)?.call(r) as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      }
    } catch { /* not allowed here (an in-app browser): the piece already fills the window */ }
  };
  full.addEventListener('click', toggleFull);
  const onFs = () => {
    const on = !!fsEl();
    full.innerHTML = on ? ICON.exit : ICON.full;
    const label = on ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)';
    full.setAttribute('aria-label', label);
    full.title = label;
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // the controls step aside while the piece plays and nobody touches anything; they stay while paused,
  // while the pointer is on them and while they have the focus
  let hideT = 0;
  let over = false;
  function wake() {
    wrap.dataset.ui = 'on';
    clearTimeout(hideT);
    if (playing) hideT = window.setTimeout(() => { if (playing && !over && !bar.contains(document.activeElement) && !top.contains(document.activeElement)) wrap.dataset.ui = 'off'; }, 3200);
  }
  for (const b of [bar, top]) {
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; wake(); } });
    b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { over = false; wake(); } });
  }
  wrap.addEventListener('focusin', wake);
  wrap.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') wake(); }, { passive: true });
  // a tap on the piece shows the controls, or hides them when they are showing
  stage.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') return;
    if (wrap.dataset.ui === 'off') wake(); else { clearTimeout(hideT); wrap.dataset.ui = 'off'; }
  });
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const onControl = !!t?.closest('button, a, input, textarea, select');
    if ((e.key === ' ' || e.key === 'k' || e.key === 'K') && !onControl) { e.preventDefault(); setPlay(!playing); return; }
    if (e.key === 'f' || e.key === 'F') { toggleFull(); return; }
    if (e.key === 'Escape') {
      if (fsEl()) return; // the browser leaves full screen by itself
      if (wrap.dataset.ui === 'on') {
        clearTimeout(hideT);
        (document.activeElement as HTMLElement | null)?.blur?.();
        wrap.dataset.ui = 'off';
      } else wake();
      return;
    }
    if (e.key !== 'Tab') wake();
  });

  setPlay(playing, false);

  /* ---------------- the engine ---------------- */
  let mod: typeof import('./engine');
  try {
    mod = await import('./engine');
  } catch {
    stage.dataset.state = 'error';
    setNote('engine', 'No se pudo descargar el motor que dibuja la pieza (quizá se cortó la conexión). Recarga la página para intentarlo de nuevo.');
    return;
  }
  const r = frameRecipe(recipe, drawn);
  const got = await mod.mountPiece(cv, r, { playing, reduced, onError: () => undefined });
  if (!got) {
    stage.dataset.state = 'error';
    setNote('engine', 'Este navegador no puede dibujar la pieza (ni con WebGL ni con Canvas 2D). Ábrela en otro navegador, o en el estudio.');
    return;
  }
  renderer = got.renderer;
  cv = renderer.canvas;
  stage.dataset.renderer = renderer.kind;
  place();
  if (view.t) renderer.time = view.t;
  if (playing) renderer.play(); else renderer.pause();
  // fonts first: the piece is drawn with its own typeface, not a fallback, before it says it is ready
  await renderer.ready().catch(() => undefined);
  renderer.time = renderer.time;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!renderer) return;
    const g = gridOf(drawn);
    stage.dataset.grid = `${g.cols}x${g.rows}`;
    stage.dataset.state = 'ready';
  }));
  // the page went to the background: nothing to draw (the engine's own loop already stops with the tab)
  wake();
}

void start().catch(() => problem('No se pudo abrir esta pieza', 'Algo falló al leer el enlace. Pide que te lo envíen de nuevo, o crea la tuya en el estudio.'));
addEventListener('hashchange', () => location.reload());
