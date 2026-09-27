import { AsciiEngine, PATTERNS, PATTERN_GLSL, defaultRecipe } from '../src/engine';

const g = document.getElementById('g')!;
const off = document.createElement('canvas');
const r = defaultRecipe();
r.glyph.cell = 6;
r.color.stops = ['#10131a', '#6ee7ff', '#fff4d6'];
r.color.bg = '#05060a';
r.interact.mode = 'none';
const errors: string[] = [];
const eng = new AsciiEngine(off, r, {
  library: PATTERN_GLSL, fixedSize: { width: 480, height: 270, pixelRatio: 1 }, autoplay: false,
  interactive: false, preserveDrawingBuffer: true, onError: m => errors.push(m),
});
const params = new URLSearchParams(location.search);
const t = parseFloat(params.get('t') ?? '3.3');
await eng.ready();
for (const p of PATTERNS) {
  const fig = document.createElement('figure');
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = 270;
  const cap = document.createElement('figcaption');
  cap.textContent = p.id + ' · ' + p.name;
  fig.append(cv, cap);
  g.append(fig);
  const rr = defaultRecipe();
  Object.assign(rr, { ...r, layers: [{ ...r.layers[0], pattern: p.id }] });
  const before = errors.length;
  eng.set(rr);
  eng.renderAt(t);
  cv.getContext('2d')!.drawImage(off, 0, 0);
  if (errors.length > before) cap.textContent += ' ⚠ ERROR';
}
(window as unknown as { __qa: unknown }).__qa = { errors, done: true };
