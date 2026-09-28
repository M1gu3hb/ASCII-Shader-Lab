/**
 * QA page of the in-browser cutout (not part of the site). Drives src/cutout exactly as the photo studio will:
 * consent dialog before any download, progress and cancel, automatic cut-out, point selection, refinement,
 * keep/remove brushes, previews on several backgrounds, transparent PNG export and timings.
 * `window.cutoutQA` exposes measurements for tests/e2e/cutout.spec.ts and the screenshot script.
 */
import type { CutoutCaps, CutoutModelId, Matte, ModelInfo, Progress, RefineOptions, SelectPoint, SelectSession } from '../src/cutout';

const cut = await import('../src/cutout');
const { CONSENT_TEXT } = cut;

const FIXTURES: Record<string, string> = {
  retrato: new URL('../tests/fixtures/photos/retrato-pelo.jpg', import.meta.url).href,
  guitarra: new URL('../tests/fixtures/photos/guitarra-mantas.jpg', import.meta.url).href,
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const view = $('view');
const marks = document.getElementById('marks') as unknown as SVGSVGElement;
const statusEl = $('status');
const progressEl = $<HTMLProgressElement>('progress');
const cancelBtn = $<HTMLButtonElement>('cancel');

type Bg = 'checker' | 'light' | 'dark' | 'contrast';
type View = 'cutout' | 'matte' | 'original';
type Tool = 'none' | 'keep' | 'remove' | 'select';

const S = {
  img: null as ImageBitmap | null,
  name: '',
  base: null as Matte | null,
  edited: null as Matte | null,
  refined: null as Matte | null,
  bg: 'checker' as Bg,
  view: 'cutout' as View,
  tool: 'none' as Tool,
  points: [] as SelectPoint[],
  session: null as SelectSession | null,
  refine: { ...cut.DEFAULT_REFINE } as RefineOptions,
  caps: null as CutoutCaps | null,
  job: null as AbortController | null,
  lastModel: '' as string,
  rows: [] as Array<Record<string, string | number>>,
  events: [] as string[],
};

/* ------------------------------------------------------------------ status */

function setStatus(label: string, p: number | null = null, busy = false) {
  statusEl.textContent = label;
  progressEl.hidden = !busy;
  if (busy) { if (p === null) progressEl.removeAttribute('value'); else progressEl.value = p; }
  cancelBtn.disabled = !busy;
}
const onProgress = (p: Progress) => setStatus(p.label, p.p, true);

async function runJob<T>(label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  S.job?.abort();
  const ctl = new AbortController();
  S.job = ctl;
  setStatus(label, null, true);
  try {
    const r = await fn(ctl.signal);
    setStatus('Listo.');
    return r;
  } catch (e) {
    const err = e as Error & { code?: string };
    S.events.push(`error:${err.code ?? err.name}:${err.message}`);
    setStatus(err.name === 'AbortError' || err.code === 'aborted' ? 'Cancelado.' : `No se pudo: ${err.message}`);
    return undefined;
  } finally {
    if (S.job === ctl) S.job = null;
    refreshModels();
  }
}
cancelBtn.addEventListener('click', () => S.job?.abort());

/* ------------------------------------------------------------------ environment and models */

async function showEnv() {
  S.caps = await cut.cutoutCaps();
  const c = S.caps;
  const mem = c.memoryGB !== undefined ? `${c.memoryGB} GB` : 'no la informa';
  $('env').textContent = `Aislamiento entre orígenes: ${crossOriginIsolated ? 'sí' : 'no'} · hilos WASM: ${c.threads ? Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)) : 1} · WebGPU: ${c.webgpu ? 'sí' : 'no'} · memoria: ${mem} · motor: ${c.backend}${c.phone ? ' · teléfono' : ''}`;
  await refreshModels();
}

const MB = (n: number) => `${Math.round(n / 1e6)} MB`;

async function refreshModels() {
  if (!S.caps) return;
  const ul = $('models');
  const items: HTMLElement[] = [];
  for (const m of S.caps.models) items.push(await modelItem(m));
  ul.replaceChildren(...items);
  const bytes = await cut.storedModelBytes();
  $('stored').textContent = bytes ? `Guardado en este navegador: ${MB(bytes)}.` : 'No hay modelos guardados en este navegador.';
}

const STATE_LABEL: Record<string, string> = { absent: 'sin descargar', downloading: 'descargando', cached: 'descargado', loading: 'preparando', ready: 'listo', error: 'error' };

async function modelItem(m: ModelInfo): Promise<HTMLElement> {
  const li = document.createElement('li');
  li.dataset.model = m.id;
  const state = m.available ? await cut.modelState(m.id) : 'absent';
  li.dataset.state = state;
  li.innerHTML = `<div class="head"><strong></strong><span class="state mono"></span></div><span class="hint"></span><span class="mono hint"></span>`;
  li.querySelector('strong')!.textContent = m.name;
  li.querySelector('.state')!.textContent = m.available ? `${STATE_LABEL[state]} · ${MB(m.bytes)} · ${m.backend}` : `no disponible · ${MB(m.bytes)}`;
  li.querySelectorAll('.hint')[0].textContent = m.blurb;
  li.querySelectorAll('.hint')[1].textContent = `Código ${m.licence.code} · pesos ${m.licence.weights}`;
  if (!m.available) {
    const p = document.createElement('p'); p.className = 'why'; p.textContent = m.why ?? ''; li.append(p);
    return li;
  }
  if (m.note) { const p = document.createElement('p'); p.className = 'note'; p.textContent = m.note; li.append(p); }
  const row = document.createElement('div');
  row.className = 'row';
  const have = state === 'cached' || state === 'ready';
  const main = document.createElement('button');
  main.type = 'button';
  if (!have) {
    main.textContent = `Descargar (${MB(m.bytes)})`;
    main.dataset.action = 'download';
    main.addEventListener('click', () => askAndDownload(m.id));
  } else if (m.id === 'select') {
    main.textContent = S.tool === 'select' && S.session ? 'Seleccionando…' : 'Seleccionar objeto';
    main.dataset.action = 'select';
    main.disabled = !S.img;
    main.addEventListener('click', () => startSelect());
  } else {
    main.textContent = 'Quitar fondo';
    main.dataset.action = 'run';
    main.disabled = !S.img;
    main.addEventListener('click', () => runModel(m.id as 'subject' | 'subject-hq' | 'portrait'));
  }
  row.append(main);
  if (have) {
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Borrar';
    del.dataset.action = 'forget';
    del.setAttribute('aria-label', `Borrar el modelo ${m.name} de este navegador`);
    del.addEventListener('click', async () => { await cut.forgetModel(m.id); if (m.id === 'select') endSelect(); await refreshModels(); });
    row.append(del);
  }
  li.append(row);
  return li;
}

/* ------------------------------------------------------------------ consent + download */

const dialog = $<HTMLDialogElement>('consent');

async function askAndDownload(id: CutoutModelId) {
  const info = await cut.consentInfo(id);
  $('c-title').textContent = `Descargar «${info.name}»`;
  $('c-size').textContent = `${info.size} · desde ${info.from} · una sola vez`;
  $('c-text').textContent = info.text;
  $('c-lic').textContent = info.licence;
  $('c-note').textContent = info.note ?? '';
  $('c-yes').textContent = `Descargar (${info.size})`;
  S.events.push(`consent-open:${id}`);
  const answer = await new Promise<string>(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
  S.events.push(`consent-${answer || 'dismiss'}:${id}`);
  if (answer !== 'yes') { setStatus('No se descargó nada.'); return; }
  await runJob(`Descargando ${info.name}…`, signal => cut.downloadModel(id, { onProgress, signal }));
}

$('forgetAll').addEventListener('click', async () => {
  await cut.forgetAllModels();
  endSelect();
  setStatus('Modelos borrados de este navegador.');
  await refreshModels();
});

/* ------------------------------------------------------------------ photo */

async function setImage(img: ImageBitmap, name: string) {
  endSelect();
  S.img?.close();
  S.img = img;
  S.name = name;
  S.base = S.edited = S.refined = null;
  S.points = [];
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.hidden = false;
  $('empty').hidden = true;
  const s = cut.suggestCutout(img);
  $('suggest').textContent = s.text;
  S.view = 'original';
  pressed('[data-view]', 'original');
  render();
  await refreshModels();
}

async function loadUrl(url: string, name: string) {
  const blob = await (await fetch(url)).blob();
  await setImage(await createImageBitmap(blob, { imageOrientation: 'from-image' }), name);
}

async function loadFile(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (k < 1) {
    const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
    bmp.close();
    await setImage(small, file.name);
  } else await setImage(bmp, file.name);
}

document.querySelectorAll<HTMLButtonElement>('[data-fixture]').forEach(b => b.addEventListener('click', () => loadUrl(FIXTURES[b.dataset.fixture!], b.dataset.fixture!)));
$<HTMLInputElement>('file').addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadFile(f); });
view.addEventListener('dragover', e => { e.preventDefault(); view.classList.add('drop'); });
view.addEventListener('dragleave', () => view.classList.remove('drop'));
view.addEventListener('drop', e => { e.preventDefault(); view.classList.remove('drop'); const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });

/* ------------------------------------------------------------------ models */

function addRow(model: string, m: Matte) {
  const t = cut.cutoutTimings(m);
  if (!t) return;
  const f = (v?: number) => (v === undefined ? '—' : `${Math.round(v)}`);
  const row = { model, backend: `${t.backend}${t.threads > 1 ? `×${t.threads}` : ''}${t.upsample ? `/${t.upsample}` : ''}`, load: f(t.load), pre: f(t.pre), run: t.encode !== undefined ? `${f(t.encode)}+${f(t.run)}` : f(t.run), post: f(t.post), total: f(t.total) };
  S.rows.push({ ...row, loadMs: t.load ?? 0, preMs: t.pre, encodeMs: t.encode ?? 0, runMs: t.run, postMs: t.post, totalMs: t.total, w: m.w, h: m.h, choice: t.choice?.index ?? -1 });
  const tr = document.createElement('tr');
  for (const v of Object.values(row)) { const td = document.createElement('td'); td.textContent = String(v); tr.append(td); }
  $('times').prepend(tr);
}

async function runModel(id: 'subject' | 'subject-hq' | 'portrait') {
  if (!S.img) return;
  endSelect();
  const img = S.img;
  const m = await runJob('Recortando…', signal => cut.removeBackground(img, { model: id, onProgress, signal }));
  if (!m || img !== S.img) return;
  S.lastModel = id;
  setMatte(m);
  addRow(id, m);
}

function setMatte(m: Matte) {
  S.base = m;
  S.edited = { w: m.w, h: m.h, alpha: new Uint8ClampedArray(m.alpha) };
  S.view = 'cutout';
  pressed('[data-view]', 'cutout');
  refineNow();
  $<HTMLButtonElement>('savePng').disabled = false;
  $<HTMLButtonElement>('saveMatte').disabled = false;
}

/* ------------------------------------------------------------------ selection */

async function startSelect() {
  if (!S.img) return;
  const img = S.img;
  endSelect();
  const s = await runJob('Analizando la imagen…', signal => cut.selectObject(img, { onProgress, signal }));
  if (!s || img !== S.img) { s?.dispose(); return; }
  S.session = s;
  setTool('select');
  setStatus('Toca el objeto que quieres (Mayús + clic: lo que no).');
  await refreshModels();
}

function endSelect() {
  S.session?.dispose();
  S.session = null;
  S.points = [];
  if (S.tool === 'select') setTool('none');
  drawPoints();
}

let decodeChain: Promise<unknown> = Promise.resolve();
function updateSelection() {
  drawPoints();
  const s = S.session;
  if (!s) return;
  const pts = S.points.slice();
  decodeChain = decodeChain.then(async () => {
    if (s !== S.session) return;
    setStatus('Ajustando la selección…', null, true);
    try {
      const m = await s.mask(pts);
      if (s !== S.session) return;
      S.lastModel = 'select';
      setMatte(m);
      addRow(`select (${pts.length} p.)`, m);
      setStatus(pts.length ? `Selección con ${pts.length} punto${pts.length > 1 ? 's' : ''}.` : 'Sin puntos.');
    } catch (e) { setStatus(`No se pudo: ${(e as Error).message}`); }
  });
}

function drawPoints() {
  const list = $('points');
  list.replaceChildren(...S.points.map((p, i) => {
    const li = document.createElement('li');
    li.textContent = `${p.positive ? 'Es parte' : 'No es parte'} (${Math.round(p.x)}, ${Math.round(p.y)})`;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Quitar';
    b.setAttribute('aria-label', `Quitar el punto ${i + 1}`);
    b.addEventListener('click', () => { S.points.splice(i, 1); updateSelection(); });
    li.append(b);
    return li;
  }));
  $<HTMLButtonElement>('clearPoints').disabled = !S.points.length;
  // Marks over the canvas, in its displayed size.
  const r = canvas.getBoundingClientRect(), v = view.getBoundingClientRect();
  marks.setAttribute('style', `left:${r.left - v.left}px;top:${r.top - v.top}px;width:${r.width}px;height:${r.height}px`);
  marks.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
  const k = canvas.width / Math.max(1, r.width);
  marks.innerHTML = S.points.map(p => `<g transform="translate(${p.x} ${p.y})"><circle r="${11 * k}" fill="${p.positive ? '#2fbf71' : '#ff5b1f'}" stroke="#fff" stroke-width="${2.5 * k}"/><path d="M${-5 * k} 0H${5 * k}${p.positive ? `M0 ${-5 * k}V${5 * k}` : ''}" stroke="#fff" stroke-width="${2.5 * k}"/></g>`).join('');
}
$('clearPoints').addEventListener('click', () => { S.points = []; updateSelection(); });

/* ------------------------------------------------------------------ refine + render */

let refineTimer = 0;
function refineSoon() { clearTimeout(refineTimer); refineTimer = window.setTimeout(refineNow, 90); }

function refineNow() {
  if (!S.img || !S.edited) { render(); return; }
  const t = performance.now();
  S.refined = cut.refineMatte(S.img, S.edited, S.refine);
  S.events.push(`refine:${Math.round(performance.now() - t)}ms`);
  render();
}

let cutoutCache: { m: Matte; d: number; canvas: HTMLCanvasElement } | null = null;

function render(fast = false) {
  if (!S.img) return;
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  if (S.view === 'original' || !S.refined) { ctx.drawImage(S.img, 0, 0); drawPoints(); return; }
  if (S.view === 'matte') { ctx.drawImage(cut.matteToCanvas(S.refined, 'gray'), 0, 0); drawPoints(); return; }
  paintBackground(ctx, W, H, S.bg);
  const d = fast ? 0 : S.refine.decontaminate;
  if (!cutoutCache || cutoutCache.m !== S.refined || cutoutCache.d !== d) {
    cutoutCache = { m: S.refined, d, canvas: cut.cutoutCanvas(S.img, S.refined, { decontaminate: d }) };
  }
  ctx.drawImage(cutoutCache.canvas, 0, 0);
  drawPoints();
}

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Bg) {
  if (bg === 'light') { ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, W, H); return; }
  if (bg === 'dark') { ctx.fillStyle = '#0c0b0a'; ctx.fillRect(0, 0, W, H); return; }
  if (bg === 'contrast') { ctx.fillStyle = '#22e05a'; ctx.fillRect(0, 0, W, H); return; }
  const s = Math.max(8, Math.round(Math.max(W, H) / 64));
  ctx.fillStyle = '#d9d9d9'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9a9a9a';
  for (let y = 0; y < H; y += s) for (let x = ((y / s) % 2) * s; x < W; x += 2 * s) ctx.fillRect(x, y, s, s);
}

function pressed(sel: string, value: string) {
  document.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.setAttribute('aria-pressed', String(Object.values(b.dataset)[0] === value)));
}

document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach(b => b.addEventListener('click', () => { S.bg = b.dataset.bg as Bg; pressed('[data-bg]', S.bg); if (S.view === 'original') { S.view = 'cutout'; pressed('[data-view]', 'cutout'); } render(); }));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view as View; pressed('[data-view]', S.view); render(); }));

const slider = (id: string, key: keyof RefineOptions, fmt: (v: number) => string) => {
  const input = $<HTMLInputElement>(id);
  const out = $(`o-${id}`);
  input.addEventListener('input', () => { S.refine[key] = Number(input.value); out.textContent = fmt(S.refine[key]); refineSoon(); });
};
slider('feather', 'feather', v => `${v} px`);
slider('shift', 'shift', v => `${v > 0 ? '+' : ''}${v} px`);
slider('detail', 'detail', v => v.toFixed(2));
slider('decon', 'decontaminate', v => v.toFixed(2));
const size = $<HTMLInputElement>('size'), hard = $<HTMLInputElement>('hard');
size.addEventListener('input', () => { $('o-size').textContent = `${size.value} px`; });
hard.addEventListener('input', () => { $('o-hard').textContent = Number(hard.value).toFixed(2); });

/* ------------------------------------------------------------------ pointer: points and brushes */

function setTool(t: Tool) {
  S.tool = t;
  pressed('[data-tool]', t === 'select' ? '' : t);
  view.classList.toggle('select', t === 'select');
  view.classList.toggle('brush', t === 'keep' || t === 'remove');
}
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.addEventListener('click', () => {
  if (S.tool === 'select' && b.dataset.tool !== 'none') endSelect();
  setTool(b.dataset.tool as Tool);
}));

const toSource = (e: PointerEvent | MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
};

canvas.addEventListener('click', e => {
  if (S.tool !== 'select' || !S.session) return;
  const p = toSource(e);
  S.points.push({ x: p.x, y: p.y, positive: !e.shiftKey });
  updateSelection();
});

let stroke: Array<{ x: number; y: number; pressure?: number }> | null = null;
canvas.addEventListener('pointerdown', e => {
  if ((S.tool !== 'keep' && S.tool !== 'remove') || !S.edited) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toSource(e);
  stroke = [{ ...p, pressure: e.pointerType === 'pen' ? e.pressure : undefined }];
  cut.applyBrush(S.edited, stroke, S.tool, Number(size.value), Number(hard.value), { inPlace: true });
  S.refined = cut.refineMatte(S.img!, S.edited, { ...S.refine, detail: 0, decontaminate: 0 });
  render(true);
});
canvas.addEventListener('pointermove', e => {
  if (!stroke || !S.edited || (S.tool !== 'keep' && S.tool !== 'remove')) return;
  const events = e.getCoalescedEvents?.() ?? [e];
  for (const ev of events) {
    const p = toSource(ev);
    const last = stroke[stroke.length - 1];
    const next = { ...p, pressure: ev.pointerType === 'pen' ? ev.pressure : undefined };
    cut.applyBrush(S.edited, [last, next], S.tool, Number(size.value), Number(hard.value), { inPlace: true });
    stroke.push(next);
  }
  S.refined = cut.refineMatte(S.img!, S.edited, { ...S.refine, detail: 0, decontaminate: 0 });
  render(true);
});
const endStroke = () => { if (!stroke) return; stroke = null; refineNow(); };
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

/* ------------------------------------------------------------------ export */

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const base = () => (S.name || 'foto').replace(/\.[a-z]+$/i, '');
$('savePng').addEventListener('click', async () => { if (S.img && S.refined) download(await cut.cutoutBlob(S.img, S.refined, S.refine), `${base()}-recorte.png`); });
$('saveMatte').addEventListener('click', async () => { if (S.refined) download(await cut.matteBlob(S.refined, 'gray'), `${base()}-mascara.png`); });

/* ------------------------------------------------------------------ QA hooks */

function polygonMask(poly: number[], w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < poly.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, poly[i], poly[i + 1]);
  ctx.closePath();
  ctx.fill();
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
  return out;
}

async function pngStats(blob: Blob) {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  let a0 = 0, a255 = 0, soft = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) a0++; else if (d[i] === 255) a255++; else soft++; }
  return { w: bmp.width, h: bmp.height, bytes: blob.size, type: blob.type, alpha0: a0, alpha255: a255, soft };
}

Object.assign(window, {
  cutoutQA: {
    events: S.events,
    fixture: async (name: 'retrato' | 'guitarra') => { await loadUrl(FIXTURES[name], name); return { w: S.img!.width, h: S.img!.height }; },
    state: () => ({ hasImage: !!S.img, hasMatte: !!S.refined, view: S.view, bg: S.bg, tool: S.tool, points: S.points.length, selecting: !!S.session, status: statusEl.textContent }),
    rows: () => S.rows,
    iou: (poly: number[]) => {
      const m = S.refined!;
      const ref = polygonMask(poly, m.w, m.h);
      let inter = 0, uni = 0;
      for (let i = 0; i < ref.length; i++) { const a = m.alpha[i] >= 128, b = ref[i] >= 128; if (a && b) inter++; if (a || b) uni++; }
      return uni ? inter / uni : 1;
    },
    matteStats: () => {
      const m = S.refined!;
      let sum = 0, opaque = 0, clear = 0, soft = 0;
      for (const v of m.alpha) { sum += v; if (v === 255) opaque++; else if (v === 0) clear++; else soft++; }
      return { w: m.w, h: m.h, mean: sum / m.alpha.length / 255, opaque, clear, soft };
    },
    exportStats: async () => pngStats(await cut.cutoutBlob(S.img!, S.refined!, S.refine)),
    /** Same guided upsampling on WebGL2 and on the CPU, from the current model matte downsampled to 256 px. */
    guidedParity: () => {
      const m = S.base!;
      const k = 256 / Math.max(m.w, m.h), lw = Math.max(1, Math.round(m.w * k)), lh = Math.max(1, Math.round(m.h * k));
      const c = new OffscreenCanvas(lw, lh);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(cut.matteToCanvas(m, 'gray'), 0, 0, lw, lh);
      const d = ctx.getImageData(0, 0, lw, lh).data;
      const low: Matte = { w: lw, h: lh, alpha: new Uint8ClampedArray(lw * lh) };
      for (let i = 0; i < low.alpha.length; i++) low.alpha[i] = d[i * 4];
      let t = performance.now();
      const gpu = (() => { try { return cut.upsampleMatte(S.img!, low, m.w, m.h, 0.7, 'gl'); } catch { return null; } })();
      const glMs = performance.now() - t;
      t = performance.now();
      const cpu = cut.upsampleMatte(S.img!, low, m.w, m.h, 0.7, 'cpu');
      const cpuMs = performance.now() - t;
      if (!gpu) return { gl: false, maxDiff: -1, over1: -1, glMs, cpuMs };
      let maxDiff = 0, over1 = 0;
      for (let i = 0; i < cpu.alpha.length; i++) { const dd = Math.abs(cpu.alpha[i] - gpu.alpha[i]); if (dd > maxDiff) maxDiff = dd; if (dd > 1) over1++; }
      return { gl: true, maxDiff, over1, glMs, cpuMs };
    },
    setRefine: (o: Partial<RefineOptions>) => { Object.assign(S.refine, o); refineNow(); },
    /** Calls the API directly (no dialog): must refuse a model that was not downloaded. */
    tryRemoveBackground: async (model: 'subject' | 'subject-hq' | 'portrait') => {
      try { await cut.removeBackground(S.img!, { model }); return 'ok'; } catch (e) { return (e as { code?: string }).code ?? (e as Error).name; }
    },
    modelState: (id: CutoutModelId) => cut.modelState(id),
    /** Video-like throughput: n frames of w × h (the current photo resized) through matteFrame, ms per frame. */
    throughput: async (model: 'subject' | 'subject-hq' | 'portrait', n = 6, w = 640, h = 360, upsample = false, size?: number) => {
      const ms: number[] = [];
      for (let i = 0; i < n; i++) {
        const frame = await createImageBitmap(S.img!, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        const t = performance.now();
        const r = await cut.matteFrame(frame, { model, upsample, size });
        ms.push(Math.round(performance.now() - t));
        if (i === n - 1) return { ms, low: [r.low.w, r.low.h], out: [r.matte.w, r.matte.h], backend: r.timings.backend, threads: r.timings.threads };
      }
      return { ms };
    },
    storedBytes: () => cut.storedModelBytes(),
    brush: (points: Array<{ x: number; y: number }>, mode: 'keep' | 'remove', sizePx: number, hardness = 1) => {
      cut.applyBrush(S.edited!, points, mode, sizePx, hardness, { inPlace: true });
      refineNow();
      return S.refined!.alpha[Math.round(points[0].y) * S.refined!.w + Math.round(points[0].x)];
    },
  },
});

await showEnv();
setStatus('Listo.');
document.documentElement.dataset.ready = '1';
