/**
 * QA page of the timeline (not part of the production build): the timeline mounted on a sample project,
 * with the project rendered above it by the core Compositor (once per change of project or time, at most
 * one render at a time). window.qa drives it from tests/e2e/anim.spec.ts.
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-800.css';
import '../src/shared/tokens.css';
import { Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Compositor } from '../src/project/compositor';
import { evaluate } from '../src/project/evaluate';
import { newLayer, newProject } from '../src/project/normalize';
import * as store from '../src/project/store';
import type { Project } from '../src/project/types';
import { easeFromPreset } from '../src/anim/index';
import { Timeline, createClock } from '../src/foto/timeline/index';
import { sampleLayer, sampleProvider, PHOTO } from '../src/foto/timeline/samples';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const status = (s: string) => { $('#status').textContent = s; };

const errors: string[] = [];
window.addEventListener('error', e => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => errors.push(String((e.reason as Error)?.message ?? e.reason)));
const origError = console.error.bind(console);
console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); origError(...a); };

/* ------------------------------------------------------------------ the sample project */

function sample(): Project {
  const p = newProject({ name: 'Línea de tiempo de muestra', w: 800, h: 500, duration: 8, bg: '#0c0b0a' });
  p.seed = 'linea';
  p.time.fps = 30;
  p.sources.push(PHOTO);
  const photo = newLayer('photo', { id: 'foto', name: 'Foto', source: PHOTO.id, fit: 'cover' });
  const ascii = sampleLayer('ascii', '', PHOTO.id, 7);
  ascii.id = 'ascii'; ascii.name = 'ASCII (retrato)';
  ascii.clips = [
    { id: 'c-entra', template: 'foto-a-ascii', start: 0.4, dur: 2, params: { modo: 'ruido' }, reverse: false, ease: easeFromPreset('suave'), repeat: 1, pingpong: false },
    { id: 'c-glitch', template: 'glitch', start: 3, dur: 1.2, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false },
    { id: 'c-sale', template: 'dispersar', start: 5.6, dur: 2, params: { modo: 'explosion' }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false },
  ];
  const glyphs = sampleLayer('glyphs', '', PHOTO.id, 8);
  glyphs.id = 'caracteres'; glyphs.name = 'Caracteres';
  glyphs.span = { in: 2.5, out: 8 };
  glyphs.opacity = 0.85;
  glyphs.clips = [
    { id: 'c-recompone', template: 'recomponer', start: 2.5, dur: 2, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false },
    { id: 'c-onda', template: 'onda', start: 4, dur: 3, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false },
  ];
  const title = newLayer('text', {
    id: 'titulo', name: 'Título', text: 'GLYPHOS · la luz se vuelve letra', font: 'martian', weight: 800, size: 0.06, color: '#ede6da', align: 'left',
    box: { x: 0.06, y: 0.07, w: 0.9 }, tracking: 0.02, leading: 1.1, italic: false, upper: false,
    clips: [{ id: 'c-escribe', template: 'escritura', start: 0, dur: 2.2, params: { irregular: 0.4 }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }],
  });
  p.layers.push(photo, ascii, glyphs, title);
  p.tracks.push(
    { layer: 'titulo', path: 'xf.y', keys: [{ t: 0, v: 0.04, ease: easeFromPreset('frena') }, { t: 1.5, v: 0, ease: { kind: 'linear' } }] },
    { layer: 'titulo', path: 'color', keys: [{ t: 2.5, v: '#ede6da', ease: { kind: 'linear' } }, { t: 4, v: '#ff5b1f', ease: { kind: 'hold' } }] },
    { layer: 'ascii', path: 'opacity', keys: [{ t: 0, v: 1, ease: { kind: 'linear' } }, { t: 3, v: 0.8, ease: easeFromPreset('suave') }, { t: 5, v: 1, ease: { kind: 'linear' } }] },
  );
  return p;
}

/* ------------------------------------------------------------------ preview */

const params = new URLSearchParams(location.search);
const BASIC = params.get('motor') === 'basico';
const compositor = new Compositor({ provider: sampleProvider(), ...(BASIC ? { force: 'basic' as const } : {}) });
const canvas = $('#preview') as HTMLCanvasElement;
let renders = 0, busy = false, again = false, lastMs = 0;
async function draw() {
  if (busy) { again = true; return; }
  const p = store.useProject.getState().project;
  if (!p) return;
  busy = true;
  try {
    const r = await compositor.render(evaluate(p, store.useProject.getState().time), canvas, { scale: 0.75 });
    lastMs = r.ms;
    renders++;
  } finally {
    busy = false;
    if (again) { again = false; void draw(); }
  }
}
let scheduled = 0;
const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; void draw(); }); };
store.useProject.subscribe((s, prev) => { if (s.project !== prev.project || s.time !== prev.time) schedule(); });

/* ------------------------------------------------------------------ timeline */

const commits: Array<{ phase: string; ms: number }> = [];
const compact = params.get('compact') === '1' || innerWidth < 640;
const clock = createClock({
  get: () => store.useProject.getState().time, set: t => store.setTime(t), duration: () => store.useProject.getState().project?.time.duration ?? 1,
  loop: () => !!store.useProject.getState().project?.time.loop, fps: () => store.useProject.getState().project?.time.fps ?? 30,
});
const said: string[] = [];

function mount() {
  createRoot($('#tl')).render(
    <StrictMode>
      <Profiler id="timeline" onRender={(_id, phase, ms) => { commits.push({ phase, ms }); if (commits.length > 400) commits.shift(); }}>
        <Timeline clock={clock} compact={compact} basicPreviews={BASIC} onSay={s => { said.push(s); $('#say').textContent = s; }} />
      </Profiler>
    </StrictMode>,
  );
}

const qa = {
  ready: false,
  error: '',
  errors,
  said,
  commits,
  get renders() { return renders; },
  get lastMs() { return lastMs; },
  store,
  clock,
  project: () => store.useProject.getState().project!,
  time: () => store.useProject.getState().time,
  clip: (id: string) => store.useProject.getState().project!.layers.flatMap(l => l.clips).find(c => c.id === id) ?? null,
  track: (layer: string, path: string) => store.useProject.getState().project!.tracks.find(t => t.layer === layer && t.path === path) ?? null,
  reset() { store.openProject(sample(), { select: ['ascii'] }); },
  /** Waits until the preview has drawn what the store holds now. */
  async settle() { for (let i = 0; i < 200 && (busy || scheduled || again); i++) await new Promise(r => setTimeout(r, 25)); },
};
(window as unknown as { qa: typeof qa }).qa = qa;

async function main() {
  status('cargando fuentes…');
  await document.fonts.ready;
  store.openProject(sample(), { select: ['ascii'] });
  mount();
  schedule();
  await new Promise(r => setTimeout(r, 50));
  await qa.settle();
  status(`listo · ${compact ? 'modo compacto' : 'escritorio'}${BASIC ? ' · motor básico' : ''}`);
  qa.ready = true;
}
main().catch(e => { qa.error = String((e as Error)?.stack ?? e); status('error: ' + (e as Error).message); console.error(e); });
