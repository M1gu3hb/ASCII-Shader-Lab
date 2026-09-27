import { AsciiEngine, PATTERNS, PATTERN_GLSL, defaultRecipe } from '../src/engine';

/**
 * Every pattern rendered once with the WebGL engine. Query parameters (all optional):
 *   t=3.3            time
 *   ids=nudo,planeta only these patterns;  family=solidos  only this family
 *   ab=0.2:0.2,0.8:0.8 one render per a:b pair (default: the layer defaults)
 *   cell=6           cell size in pixels;  size=960x540  canvas size
 */
const g = document.getElementById('g')!;
const off = document.createElement('canvas');
const params = new URLSearchParams(location.search);
const [W, H] = (params.get('size') ?? '480x270').split('x').map(Number);
const r = defaultRecipe();
r.glyph.cell = parseFloat(params.get('cell') ?? '6');
r.color.stops = ['#10131a', '#6ee7ff', '#fff4d6'];
r.color.bg = '#05060a';
r.interact.mode = 'none';
const errors: string[] = [];
const eng = new AsciiEngine(off, r, {
  library: PATTERN_GLSL, fixedSize: { width: W, height: H, pixelRatio: 1 }, autoplay: false,
  interactive: false, preserveDrawingBuffer: true, onError: m => errors.push(m),
});
const t = parseFloat(params.get('t') ?? '3.3');
const ids = params.get('ids')?.split(',');
const family = params.get('family');
const pairs = (params.get('ab') ?? '').split(',').filter(Boolean).map(s => s.split(':').map(Number) as [number, number]);
const list = PATTERNS.filter(p => (!ids || ids.includes(p.id)) && (!family || p.family === family));
await eng.ready();
for (const p of list) {
  for (const ab of pairs.length ? pairs : [null]) {
    const fig = document.createElement('figure');
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.width = W / 2 + 'px'; cv.style.height = H / 2 + 'px';
    const cap = document.createElement('figcaption');
    cap.textContent = p.id + ' · ' + p.name + (ab ? ` · ${p.a} ${ab[0]} · ${p.b} ${ab[1]}` : '');
    fig.append(cv, cap);
    g.append(fig);
    const layer = { ...r.layers[0], pattern: p.id, ...(ab ? { a: ab[0], b: ab[1] } : {}) };
    const rr = { ...defaultRecipe(), ...r, layers: [layer] };
    const before = errors.length;
    eng.set(rr);
    eng.renderAt(t);
    cv.getContext('2d')!.drawImage(off, 0, 0);
    if (errors.length > before) cap.textContent += ' ⚠ ERROR';
  }
}
(window as unknown as { __qa: unknown }).__qa = { errors, done: true };
