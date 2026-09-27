import { AsciiEngine } from '../engine/engine';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import { attachEngine, pauseVideo, resumeVideo, stopCamera } from './media';
import { currentEntry, currentRecipe, setStats, setThumb, useStudio } from './store';
import { toast } from './toast';

/** One live engine drives the studio stage; the store is the single source of truth. */
let engine: AsciiEngine | null = null;
let unsub: (() => void) | null = null;
let thumbT = 0;

export const getEngine = () => engine;
export const studioFonts = createFontLoader({ google: false });

export function mountStudioEngine(canvas: HTMLCanvasElement): string | null {
  destroyStudioEngine();
  const s = useStudio.getState();
  let lastErr = 0;
  try {
    engine = new AsciiEngine(canvas, currentRecipe(s), {
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
        if (performance.now() - lastErr > 4000) { lastErr = performance.now(); toast('El motor no pudo compilar esa combinación. Prueba otra.'); }
      },
    });
  } catch (e) {
    return (e as Error).message === 'webgl2'
      ? 'Tu navegador no tiene WebGL 2 activo. Abre Monotrama en Chrome, Edge, Firefox o Safari actualizados.'
      : 'No se pudo iniciar el motor gráfico: ' + (e as Error).message;
  }
  attachEngine(engine);
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
  return null;
}

export function destroyStudioEngine() {
  unsub?.(); unsub = null;
  if (engine) engine.externalPulse = 0;
  attachEngine(null);
  engine?.destroy();
  engine = null;
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

/**
 * Shows a recipe on stage without touching the history (hold-to-compare: «ver original»);
 * null returns to the current piece. Any history change while it shows also returns to it.
 */
export function previewRecipe(r: ReturnType<typeof currentRecipe> | null) {
  if (!engine) return;
  engine.set(r ?? currentRecipe(), { transition: false });
  // a thumbnail taken while the original showed would label the edited piece with it: take it again
  if (!r) scheduleThumb();
}
