/**
 * «Lo que haces aquí, funciona allá»: five destinations of one piece, each shown with the real file the
 * studio exported (public/ex/salidas/, made by scripts/posters.mjs). The panels are plain HTML; this island
 * adds the tab behaviour, the swap motion, and what each destination needs to come alive only once it is
 * chosen: the loop plays, the exported page loads in its frame, the terminal plays the frames stored in the
 * Node script itself.
 */
import { glyphCurtain } from '../shared/glyphfx';
import { isPaused, onPause, reduced } from './live';
import { resolveText } from './motion';
import { tabset } from './tabs';

export function mountSalidas(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('[role="tablist"]')!;
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const started = new Set<string>();
  const stops = new Map<string, () => void>();
  const starts = new Map<string, () => void>();

  const activate = (i: number, user: boolean) => {
    const tab = tabs.tabs[i];
    const id = tab.getAttribute('aria-controls')!;
    panels.forEach(p => { if (p.id !== id && !p.hidden) { p.hidden = true; stops.get(p.id)?.(); } });
    const p = panels.find(x => x.id === id)!;
    p.hidden = false;
    if (!started.has(id)) { started.add(id); setup(p); }
    starts.get(id)?.();
    if (user) {
      const art = p.querySelector<HTMLElement>('.sal-art');
      if (art) glyphCurtain(art, { bg: '#0c0b0a', origin: 'left', duration: 320, cell: 10 });
      const h = p.querySelector<HTMLElement>('h3');
      if (h) resolveText(h, 380);
    }
  };

  function setup(p: HTMLElement) {
    const kind = p.dataset.salida;
    if (kind === 'movimiento') setupVideo(p);
    if (kind === 'web') {
      const f = p.querySelector<HTMLIFrameElement>('iframe[data-src]');
      if (f) {
        f.src = f.dataset.src!;
        // the example page's piece follows «Pausar» too: its element (same origin) mounts again, still or moving
        const follow = () => {
          const field = f.contentDocument?.querySelector('glyphos-field');
          if (!field || field.hasAttribute('paused') === isPaused()) return;
          const next = field.cloneNode(true) as Element;
          next.toggleAttribute('paused', isPaused());
          field.replaceWith(next);
        };
        f.addEventListener('load', follow);
        onPause(follow);
      }
      // without WebGL 2 the example page is drawn by the basic engine it carries: say so when that is what you see
      void import('../engine/support').then(m => {
        const note = p.querySelector<HTMLElement>('[data-no-webgl]');
        const why = m.probeWebGL().reason;
        if (note && why !== 'ok' && why !== 'forced') note.hidden = false;
      });
    }
    if (kind === 'terminal') setupTerminal(p);
  }

  function setupVideo(p: HTMLElement) {
    const v = p.querySelector<HTMLVideoElement>('video');
    const btn = p.querySelector<HTMLButtonElement>('[data-play]');
    if (!v || !btn) return;
    let inView = false;
    const want = () => !isPaused() && !p.hidden && inView;
    const label = () => {
      const playing = !v.paused;
      btn.textContent = playing ? 'Pausar' : 'Reproducir';
      btn.setAttribute('aria-label', playing ? 'Pausar el video' : 'Reproducir el video');
    };
    const sync = () => { if (want()) void v.play().catch(() => undefined); else v.pause(); };
    // the poster waits for the tab (a video's poster downloads even while its panel is hidden)
    if (v.dataset.poster) v.poster = v.dataset.poster;
    v.removeAttribute('controls');
    v.preload = 'auto';
    v.addEventListener('play', label);
    v.addEventListener('pause', label);
    btn.hidden = false;
    btn.addEventListener('click', () => { if (v.paused) void v.play().catch(() => undefined); else v.pause(); });
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (!inView) v.pause(); else if (!reduced) sync(); }, { threshold: 0.25 }).observe(v);
    onPause(() => sync());
    starts.set(p.id, () => { if (!reduced) sync(); label(); });
    stops.set(p.id, () => v.pause());
    label();
  }

  function setupTerminal(p: HTMLElement) {
    const pre = p.querySelector<HTMLElement>('pre[data-frames]');
    const btn = p.querySelector<HTMLButtonElement>('[data-play]');
    if (!pre || !btn) return;
    let frames: string[] = [];
    let i = 0, timer = 0, inView = false, fps = 12;
    const playing = () => timer !== 0;
    const label = () => {
      btn.textContent = playing() ? 'Pausar' : 'Animar';
      btn.setAttribute('aria-label', playing() ? 'Pausar la animación de la terminal' : 'Animar la terminal');
    };
    const draw = () => { if (frames.length) { pre.innerHTML = frames[i]; i = (i + 1) % frames.length; } };
    const stop = () => { clearInterval(timer); timer = 0; label(); };
    const start = () => {
      if (playing() || !frames.length) return;
      timer = window.setInterval(() => { if (inView && !document.hidden) draw(); }, 1000 / fps);
      label();
    };
    btn.addEventListener('click', () => (playing() ? stop() : start()));
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); }).observe(pre);
    onPause(v => { if (v) stop(); else if (!p.hidden && frames.length) start(); });
    starts.set(p.id, () => { if (!isPaused()) start(); });
    stops.set(p.id, stop);
    void framesOf(pre.dataset.frames!).then(f => {
      if (!f) return;
      fps = f.fps;
      frames = f.frames.map(ansiToHtml);
      pre.classList.add('ansi');
      draw();
      btn.hidden = false;
      if (!isPaused() && !p.hidden) start();
      label();
    });
  }

  const tabs = tabset(list, (i, _t, user) => activate(i, user));
  activate(tabs.index, false);
}

/**
 * The frames of an exported Node player (src/exporters/text.ts toNodePlayer): the script carries them
 * gzipped in base64, and so does the landing read them — what plays here is what `node` plays.
 */
async function framesOf(url: string): Promise<{ fps: number; frames: string[] } | null> {
  try {
    const src = await (await fetch(url)).text();
    const fps = Number(/const FPS = (\d+)/.exec(src)?.[1] ?? 12);
    const b64 = /Buffer\.from\("([A-Za-z0-9+/=]+)", 'base64'\)/.exec(src)?.[1];
    if (!b64 || typeof DecompressionStream === 'undefined') return null;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return { fps, frames: JSON.parse(text) as string[] };
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE16 = ['#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa', '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'];
const CUBE = [0, 95, 135, 175, 215, 255];
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
/** xterm's 256-colour palette. */
function xterm(n: number): string {
  if (n < 16) return BASE16[n];
  if (n < 232) { const i = n - 16; return hex(CUBE[Math.floor(i / 36)], CUBE[Math.floor(i / 6) % 6], CUBE[i % 6]); }
  const v = 8 + (n - 232) * 10;
  return hex(v, v, v);
}

/** One ANSI frame (SGR colours: 16, 256 or 24-bit foreground; resets) as HTML spans. */
export function ansiToHtml(frame: string): string {
  let out = '', color = '';
  const parts = frame.split(/\x1b\[([\d;]*)m/);
  let open = false;
  for (let k = 0; k < parts.length; k++) {
    if (k % 2 === 0) {
      const t = parts[k];
      if (!t) continue;
      if (color && !open) { out += `<span style="color:${color}">`; open = true; }
      out += esc(t);
      continue;
    }
    const codes = parts[k].split(';').map(Number);
    let next = color;
    for (let j = 0; j < codes.length; j++) {
      const c = codes[j];
      if (c === 0 || c === 39 || Number.isNaN(c)) next = '';
      else if (c === 38 && codes[j + 1] === 5) { next = xterm(codes[j + 2]); j += 2; }
      else if (c === 38 && codes[j + 1] === 2) { next = hex(codes[j + 2], codes[j + 3], codes[j + 4]); j += 4; }
      else if (c >= 30 && c <= 37) next = BASE16[c - 30];
      else if (c >= 90 && c <= 97) next = BASE16[c - 90 + 8];
      else if (c === 48 && (codes[j + 1] === 5 || codes[j + 1] === 2)) j += codes[j + 1] === 5 ? 2 : 4; // backgrounds: the frame's own
    }
    if (next !== color) { if (open) { out += '</span>'; open = false; } color = next; }
  }
  if (open) out += '</span>';
  return out;
}
