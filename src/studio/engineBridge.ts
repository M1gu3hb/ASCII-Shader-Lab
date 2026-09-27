import { createRenderer } from '../engine/create';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Renderer } from '../engine/renderer';
import { useCaps } from './caps';
import { attachEngine, pauseVideo, resumeVideo, stopCamera } from './media';
import { currentEntry, currentRecipe, setStats, setThumb, useStudio } from './store';
import { toast } from './toast';

/**
 * One live renderer drives the studio stage; the store is the single source of truth.
 * The bridge owns the stage canvas: it creates it inside the container the Stage renders, because
 * createRenderer may swap it for a fresh one when WebGL fails late, and React must never hold that node.
 */
let engine: Renderer | null = null;
let host: HTMLElement | null = null;
let unsub: (() => void) | null = null;
let thumbT = 0;
let lostT = 0;
let unwatch: (() => void) | null = null;

export const getEngine = () => engine;
export const studioFonts = createFontLoader({ google: false });

const NO_CANVAS = 'Este navegador no puede dibujar en un lienzo (ni WebGL ni Canvas 2D), así que el estudio no tiene dónde mostrar la pieza. Ábrelo en otro navegador, o actualiza este.';

/**
 * Mounts the live renderer in `container`: the WebGL 2 engine when it works, the basic engine otherwise.
 * Only when not even Canvas 2D is available does the stage stay empty (caps.fatal says why).
 */
export function mountStudioEngine(container: HTMLElement, o: { force?: 'basic' } = {}) {
  destroyStudioEngine();
  host = container;
  const s = useStudio.getState();
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  let lastErr = 0, mounting = true;
  let created;
  try {
    created = createRenderer(canvas, currentRecipe(s), {
      library: PATTERN_GLSL,
      fonts: studioFonts,
      interactive: true,
      pointerTarget: 'canvas',
      adaptive: true,
      maxPixelRatio: 2,
      autoplay: s.playing,
      reducedMotion: false,
      onStats: st => setStats({ cols: st.cols, rows: st.rows, fps: st.fps }),
      onError: m => {
        console.error('[monotrama]', m);
        // a WebGL failure while starting is not the piece's fault: the stage fell back to the basic engine
        if (mounting) return;
        if (performance.now() - lastErr > 4000) {
          lastErr = performance.now();
          toast(engine?.kind === 'basic' ? 'El motor básico no pudo dibujar esa combinación. Prueba otra.' : 'El motor no pudo compilar esa combinación. Prueba otra.');
        }
      },
    }, o);
  } catch {
    mounting = false;
    container.replaceChildren();
    useCaps.setState({ renderer: null, fatal: NO_CANVAS });
    return;
  }
  mounting = false;
  const e = created.renderer;
  engine = e;
  e.canvas.setAttribute('aria-hidden', 'true');
  useCaps.setState({ renderer: e.kind, gl: created.status, fatal: null, ...(o.force ? {} : { lost: false }) });
  if (e.kind === 'webgl2') watchContext(e.canvas);
  attachEngine(e);
  let prevSource = currentRecipe(s).source;
  unsub = useStudio.subscribe((st, prev) => {
    if (!engine) return;
    if (st.change.n !== prev.change.n || st.cursor !== prev.cursor) {
      const r = currentRecipe(st);
      engine.set(r, { transition: st.change.kind !== 'edit' && !st.reducedMotion });
      if (r.source !== prevSource) {
        if (prevSource === 'camera') stopCamera();
        if (prevSource === 'video') pauseVideo();
        if (r.source === 'video') resumeVideo();
        prevSource = r.source;
      }
      scheduleThumb();
    }
    if (st.playing !== prev.playing) { if (st.playing) engine.play(); else engine.pause(); }
  });
  scheduleThumb();
}

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
      const gl = useCaps.getState().gl;
      mountStudioEngine(host, { force: 'basic' });
      if (engine) engine.time = time;
      useCaps.setState({ lost: true, gl: { ...gl, reason: 'blocked', detail: undefined } });
    }, 3000);
  };
  const onRestored = () => clearTimeout(lostT);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  unwatch = () => { canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); };
}

export function destroyStudioEngine() {
  clearTimeout(lostT);
  unwatch?.(); unwatch = null;
  unsub?.(); unsub = null;
  if (engine) engine.externalPulse = 0;
  attachEngine(null);
  engine?.destroy();
  engine?.canvas.remove();
  engine = null;
  host = null;
}

function scheduleThumb() {
  clearTimeout(thumbT);
  thumbT = window.setTimeout(() => {
    const e = currentEntry();
    if (!e || !engine) return;
    const url = captureThumb(192, 120);
    if (url) setThumb(e.id, url);
  }, 1100);
}

export function captureThumb(w: number, h: number): string | null {
  if (!engine) return null;
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    engine.renderNow();
    const W = engine.canvas.width, H = engine.canvas.height, a = w / h;
    let sw = W, sh = W / a;
    if (sh > H) { sh = H; sw = H * a; }
    ctx.drawImage(engine.canvas, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, w, h);
    const url = c.toDataURL('image/webp', 0.72);
    return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}
