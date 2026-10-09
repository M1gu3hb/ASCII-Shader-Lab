import { createRenderer, loadBasicEngine, type CreatedRenderer } from '../engine/create';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import type { FamilyBundle } from '../families/host';
import { probeWebGL } from '../engine/support';
import { useCaps } from './caps';
import { attachEngine } from './media';
import { pickTransition, qualityFor, usePreview, type TransitionContext } from './preview';
import { currentRecipe, setStats, useStudio } from './store';
import { toast } from './toast';
import { installCheckpointLoader } from './familyState';
import { installGlyphSetLoader } from './glyphSets';

/**
 * One live renderer drives the studio stage; the store is the single source of truth.
 * The bridge owns the stage canvas: it creates it inside the container the Stage renders, because
 * createRenderer may swap it for a fresh one when WebGL fails late, and React must never hold that node.
 */
let engine: Renderer | null = null;
let host: HTMLElement | null = null;
let unsub: (() => void) | null = null;
let unsubQ: (() => void) | null = null;
let lostT = 0;
let unwatch: (() => void) | null = null;
/** Bumped by every mount and destroy: a mount still waiting for the basic engine's chunk knows it is stale. */
let mountGen = 0;

export const getEngine = () => engine;
export const studioFonts = createFontLoader({ google: false });

// the probe already knows when the stage will need the basic engine: fetch its chunk while the store hydrates
if (probeWebGL().reason !== 'ok') void loadBasicEngine().catch(() => undefined);

const NO_CANVAS = 'Este navegador no puede dibujar en un lienzo (ni WebGL ni Canvas 2D), así que el estudio no tiene dónde mostrar la pieza. Ábrelo en otro navegador, o actualiza este.';
const NO_BASIC = 'No se pudo descargar el motor básico, el que dibuja la pieza sin WebGL (quizá se cortó la conexión o hay una versión nueva del estudio). Recarga la página para seguir: tu historial y tu colección se quedan.';

/** Only the basic engine itself throwing 'canvas2d' means there is no canvas at all; anything else is its download. */
const noCanvas = (e: unknown) => e instanceof Error && e.message === 'canvas2d';

/**
 * Mounts the live renderer in `container`: the WebGL 2 engine when it works, the basic engine otherwise.
 * Only when not even Canvas 2D is available does the stage stay empty (caps.fatal says why).
 */
export async function mountStudioEngine(container: HTMLElement, o: { force?: 'basic'; families?: FamilyBundle | null } = {}): Promise<void> {
  destroyStudioEngine();
  // saved states of family layers come from this browser's store when a piece asks for one
  installCheckpointLoader();
  // glyph sets made in «Crea tus GLYPHOS» too
  installGlyphSetLoader();
  const gen = ++mountGen;
  host = container;
  const s = useStudio.getState();
  let lastErr = -Infinity, mounting = true;
  let created: CreatedRenderer;
  // a fresh canvas for each try (a canvas keeps the first kind of context it gave)
  const make = () => {
    const canvas = document.createElement('canvas');
    container.replaceChildren(canvas);
    return createRenderer(canvas, currentRecipe(), {
      library: PATTERN_GLSL,
      fonts: studioFonts,
      interactive: true,
      pointerTarget: 'canvas',
      // «Zoom con los dedos»: the stage never scrolls, so the wheel alone zooms there
      wheelZoom: true,
      adaptive: true,
      maxPixelRatio: 2,
      autoplay: s.playing,
      reducedMotion: false,
      onStats: st => setStats({ cols: st.cols, rows: st.rows, fps: st.fps, pr: st.pixelRatio }),
      onError: m => {
        if (performance.now() - lastErr < 4000) return;
        lastErr = performance.now();
        console.error('[glyphos]', m);
        // a WebGL failure while starting is not the piece's fault: the stage fell back to the basic engine
        if (mounting) return;
        toast(engine?.kind === 'basic' ? 'El motor básico no pudo dibujar esa combinación. Prueba otra.' : 'El motor no pudo compilar esa combinación. Prueba otra.');
      },
    }, o);
  };
  try {
    // the WebGL engine is ready when this resolves (a microtask later); the basic one after its chunk loads
    try { created = await make(); } catch (err) {
      // the basic engine's chunk did not arrive: once more after a moment (a dropped connection)
      if (noCanvas(err) || gen !== mountGen) throw err;
      await new Promise(r => setTimeout(r, 1000));
      if (gen !== mountGen) return;
      created = await make();
    }
  } catch (err) {
    mounting = false;
    if (gen !== mountGen) return;
    container.replaceChildren();
    useCaps.setState(noCanvas(err) ? { renderer: null, fatal: NO_CANVAS, fatalReload: false } : { renderer: null, fatal: NO_BASIC, fatalReload: true });
    return;
  }
  mounting = false;
  const e = created.renderer;
  // the stage went away (or mounted again) while the renderer was on its way
  if (gen !== mountGen) { e.destroy(); e.canvas.remove(); return; }
  engine = e;
  // the runs of the piece's families go on in the new engine (the stage moved to the basic engine)
  if (o.families) e.adoptFamilies(o.families);
  e.canvas.setAttribute('aria-hidden', 'true');
  useCaps.setState({ renderer: e.kind, gl: created.status, fatal: null, ...(o.force ? {} : { lost: false }) });
  if (e.kind === 'webgl2') watchContext(e.canvas);
  attachEngine(e);
  // preview quality (TopBar): only how the stage draws, never the recipe
  e.setQuality(qualityFor(usePreview.getState().quality, e.kind));
  unsubQ = usePreview.subscribe((q, p) => { if (q.quality !== p.quality && engine === e) e.setQuality(qualityFor(q.quality, e.kind)); });
  trackPointer(container);
  // the canvas says while the engine prepares a change or runs a transition (data-busy): what it shows
  // is not yet the current piece (tests wait on it before comparing the stage)
  let busyRaf = 0;
  const markBusy = () => {
    cancelAnimationFrame(busyRaf);
    const tick = () => {
      const b = engine === e && e.busy;
      e.canvas.toggleAttribute('data-busy', b);
      if (b) busyRaf = requestAnimationFrame(tick);
    };
    tick();
  };
  const follow = (r: Recipe, transition: ReturnType<typeof pickTransition>) => {
    e.set(r, { transition: transition ?? false });
    markBusy();
  };
  // the history may have moved while the basic engine's chunk was loading
  const now = useStudio.getState();
  if (currentRecipe(now) !== currentRecipe(s)) follow(currentRecipe(now), null);
  if (now.playing !== s.playing) { if (now.playing) e.play(); else e.pause(); }
  unsub = useStudio.subscribe((st, prev) => {
    if (engine !== e) return;
    if (st.change.n !== prev.change.n || st.cursor !== prev.cursor) {
      // the same piece on both sides (a new space that keeps it): nothing for a transition to show (the
      // stage re-forms out of glyphs instead, Stage.tsx)
      const same = currentRecipe(st) === currentRecipe(prev);
      const cause = same || st.change.kind === 'edit' || st.reducedMotion ? null : causeOf(st, prev);
      follow(currentRecipe(st), cause ? pickTransition({ cause, renderer: e.kind, pointer: recentPointer() }) : null);
    }
    if (st.playing !== prev.playing) { if (st.playing) e.play(); else e.pause(); }
  });
}

type StudioState = ReturnType<typeof useStudio.getState>;

/** What brought the new piece on stage, for the choice of its transition. */
function causeOf(st: StudioState, prev: StudioState): TransitionContext['cause'] {
  const e = st.entries[st.cursor];
  if (st.change.kind === 'roll') return e?.kind === 'variación' ? 'vary' : 'roll';
  if (st.change.kind === 'load') return e?.kind === 'espacio' ? 'space' : e?.kind === 'variación' ? 'vary' : 'open';
  // a step through the history (or a space that kept the piece)
  if (st.cursor === prev.cursor) return 'space';
  if (st.cursor === prev.cursor - 1) return 'back';
  if (st.cursor === prev.cursor + 1) return 'forward';
  return st.cursor < prev.cursor ? 'back' : 'jump';
}

/** Where the pointer was over the stage, and when: an iris opens there if it was a moment ago. */
let pointer: { x: number; y: number; t: number } | null = null;
let untrack: (() => void) | null = null;
function trackPointer(container: HTMLElement) {
  untrack?.();
  const move = (ev: PointerEvent) => {
    const rc = container.getBoundingClientRect();
    if (!rc.width || !rc.height) return;
    pointer = { x: (ev.clientX - rc.left) / rc.width, y: (ev.clientY - rc.top) / rc.height, t: performance.now() };
  };
  const leave = () => { pointer = null; };
  container.addEventListener('pointermove', move, { passive: true });
  container.addEventListener('pointerleave', leave);
  untrack = () => { container.removeEventListener('pointermove', move); container.removeEventListener('pointerleave', leave); };
}
const recentPointer = (): [number, number] | null =>
  pointer && performance.now() - pointer.t < 4000 && pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1 ? [pointer.x, pointer.y] : null;

/**
 * A GPU reset takes the WebGL context away; the browser usually hands it back within a moment. If it
 * does not, switch the stage to the basic engine instead of leaving it black.
 */
function watchContext(canvas: HTMLCanvasElement) {
  const onLost = () => {
    clearTimeout(lostT);
    lostT = window.setTimeout(() => {
      if (!host || engine?.canvas !== canvas) return;
      const time = engine.time;
      // the simulations live on the CPU: their state survives the lost context and carries on
      const families = engine.familyState();
      const gl = useCaps.getState().gl;
      void mountStudioEngine(host, { force: 'basic', families }).then(() => {
        if (engine) engine.time = time;
        useCaps.setState({ lost: true, gl: { ...gl, reason: 'blocked', detail: undefined } });
      });
    }, 3000);
  };
  const onRestored = () => clearTimeout(lostT);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  unwatch = () => { canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); };
}

export function destroyStudioEngine() {
  mountGen++;
  clearTimeout(lostT);
  unwatch?.(); unwatch = null;
  unsub?.(); unsub = null;
  unsubQ?.(); unsubQ = null;
  untrack?.(); untrack = null;
  if (engine) engine.externalPulse = 0;
  attachEngine(null);
  engine?.destroy();
  engine?.canvas.remove();
  engine = null;
  host = null;
}

/**
 * Shows a recipe on stage without touching the history (hold-to-compare: «ver original»);
 * null returns to the current piece. Any history change while it shows also returns to it.
 * (History thumbnails are rendered apart from the stage, see thumbs.ts, so this never reaches them.)
 */
export function previewRecipe(r: ReturnType<typeof currentRecipe> | null) {
  if (!engine) return;
  engine.set(r ?? currentRecipe(), { transition: false });
}
