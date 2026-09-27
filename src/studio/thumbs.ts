import { create } from 'zustand';
import { PATTERNS } from '../engine/catalog';
import { uniqueChars } from '../engine/atlas';
import type { Recipe } from '../engine/recipe';
import type { MediaEl, Renderer } from '../engine/renderer';
import { getEngine } from './engineBridge';
import { recipeVersion, thumbState, type Entry } from './history';
import { mediaBlob, mediaElement, useMedia } from './media';
import { canvasUrl, snapshotCanvas, stageSize, withOffscreen } from './offscreen';
import { setThumb, useStudio } from './store';

/**
 * History thumbnails. Every entry gets a picture rendered from its own recipe, with its own image or video,
 * at a fixed moment of its animation, by the studio's shared hidden renderer (offscreen.ts). Nothing is
 * captured from the stage, so a quick run of rolls, an edit or an undo can never put one entry's picture
 * on another: each render is tagged with the version of the recipe it drew, and the store only takes it
 * while the entry still has that recipe (setThumb).
 *
 * Order: the current entry, then the ones in view in the strip (from the middle out), then those made or
 * changed in this session. Entries stored without a thumbnail (older sessions) get theirs when they come
 * into view. One render at a time, in idle time, never while the stage is preparing or showing a
 * transition. A render that fails leaves a drawn stand-in (palette, glyphs, pattern name) and is tried
 * again later, less and less often.
 */

export const THUMB_W = 192, THUMB_H = 120;
/** Moment of the animation the picture shows (seconds of the piece's own clock). */
const THUMB_T = 4;
/** Render at this many times the thumbnail size, then scale down (smooth, and the glyphs stay legible). */
const OVERSAMPLE = 2.5;
const JOB_TIMEOUT = 20_000;
const BACKOFF = [2_000, 8_000, 30_000, 120_000];

interface ThumbsState {
  /** Entries whose picture is on its way (shown as «preparando»). */
  preparing: Record<string, true>;
  /** Drawn stand-ins for entries whose render failed or whose media is not here (never stored). */
  fallback: Record<string, string>;
}

export const useThumbs = create<ThumbsState>(() => ({ preparing: {}, fallback: {} }));

/** Strip items in view (indices), reported by the strip (Deck.tsx). */
let range: [number, number] = [0, -1];
/** Entries made or changed in this session: their pictures are made even when out of view. */
const touched = new Set<string>();
/** Failed renders: of which recipe version, how many times, and not before when. */
const fails = new Map<string, { v: string; tries: number; until: number; media: boolean }>();

/** Entries made from here on belong to this session (the first piece of a first visit comes before the strip). */
const sessionStart = Date.now() - 60_000;
let started = false;
let timer = 0;
let running = false;
/** The last key or pointer press: a render waits a moment after one, so what the person did comes first. */
let lastInput = 0;
const INPUT_QUIET_MS = 400;

/** Starts the pipeline (once; the strip calls it when it mounts). */
export function startThumbs() {
  if (started) return;
  started = true;
  for (const e of useStudio.getState().entries) if (e.created >= sessionStart) touched.add(e.id);
  useStudio.subscribe((st, prev) => {
    if (st.entries === prev.entries && st.cursor === prev.cursor) return;
    if (st.entries !== prev.entries) noteChanges(st.entries, prev.entries);
    // becoming the current entry again is a new chance for a render that failed
    const cur = st.entries[st.cursor];
    if (cur && prev.entries[prev.cursor]?.id !== cur.id) fails.delete(cur.id);
    schedule(0);
  });
  // the stage now shows an image or video: entries waiting for that file may render
  useMedia.subscribe((m, p) => {
    if (m.image?.id === p.image?.id && m.video?.id === p.video?.id && m.camera === p.camera) return;
    for (const [id, f] of fails) if (f.media) fails.delete(id);
    schedule(0);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  const input = () => { lastInput = performance.now(); };
  addEventListener('keydown', input, { capture: true, passive: true });
  addEventListener('pointerdown', input, { capture: true, passive: true });
  schedule(300);
}

/** The strip's visible items changed (scrolling, resizing, a new entry). */
export function setStripRange(from: number, to: number) {
  if (range[0] === from && range[1] === to) return;
  range = [from, to];
  schedule(0);
}

function noteChanges(entries: Entry[], prev: Entry[]) {
  const before = new Map(prev.map(e => [e.id, e]));
  for (const e of entries) {
    const old = before.get(e.id);
    if (!old || old.recipe !== e.recipe) touched.add(e.id);
    before.delete(e.id);
  }
  // gone (pruned, history cleared): forget them
  if (before.size) {
    const fb = { ...useThumbs.getState().fallback };
    let changed = false;
    for (const id of before.keys()) {
      touched.delete(id);
      fails.delete(id);
      if (fb[id]) { delete fb[id]; changed = true; }
    }
    if (changed) useThumbs.setState({ fallback: fb });
  }
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

const idle = (fn: () => void) =>
  (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 16));

function schedule(delay: number) {
  if (!started || timer || running) return;
  timer = window.setTimeout(() => { timer = 0; idle(() => void pump()); }, delay);
}

/** Whether an entry needs a render now, given why it is a candidate. */
function needs(e: Entry, current: boolean, now: number): boolean {
  const st = thumbState(e);
  if (st === 'ok') return false;
  // pictures from before versions were kept are probably right: made again only for the current entry
  if (st === 'legacy' && !current) return false;
  const f = fails.get(e.id);
  if (f && f.v === recipeVersion(e.recipe) && f.until > now) return false;
  return true;
}

/** The next entry to render, and every entry waiting (for the «preparando» marks). */
function candidates(): { next: Entry | null; waiting: Set<string> } {
  const s = useStudio.getState(), now = Date.now();
  const list = s.entries, waiting = new Set<string>();
  let next: Entry | null = null;
  const consider = (e: Entry | undefined, current = false) => {
    if (!e || waiting.has(e.id) || !needs(e, current, now)) return;
    waiting.add(e.id);
    next ??= e;
  };
  consider(list[s.cursor], true);
  // in view, from the middle of what shows outwards; then a few items either side (the next to scroll in)
  const from = Math.max(0, range[0]), to = Math.min(list.length - 1, range[1]);
  if (to >= from) {
    const mid = (from + to) >> 1;
    for (let k = 0; k <= to - from; k++) consider(list[k % 2 ? mid - ((k + 1) >> 1) : mid + (k >> 1)]);
    for (let k = 1; k <= 6; k++) { consider(list[to + k]); if (from - k >= 0) consider(list[from - k]); }
  }
  // made or changed in this session, newest first
  if (touched.size) {
    const byId = new Map(list.map(e => [e.id, e]));
    for (const id of [...touched].reverse()) {
      const e = byId.get(id);
      if (!e) { touched.delete(id); continue; }
      if (thumbState(e) === 'ok') { touched.delete(id); continue; }
      consider(e);
    }
  }
  return { next, waiting };
}

function markWaiting(waiting: Set<string>) {
  const cur = useThumbs.getState().preparing;
  const keys = Object.keys(cur);
  if (keys.length === waiting.size && keys.every(k => waiting.has(k))) return;
  const preparing: Record<string, true> = {};
  for (const id of waiting) preparing[id] = true;
  useThumbs.setState({ preparing });
}

async function pump() {
  if (running) return;
  if (document.hidden) return;                // resumes on visibilitychange
  // the stage is getting a new piece ready, or showing a transition: its frames come first
  if (getEngine()?.busy) { schedule(150); return; }
  const quiet = performance.now() - lastInput;
  if (quiet < INPUT_QUIET_MS) { schedule(INPUT_QUIET_MS - quiet + 20); return; }
  const { next, waiting } = candidates();
  markWaiting(waiting);
  if (!next) {
    // the soonest retry of a failed render
    const soon = Math.min(...[...fails.values()].map(f => f.until).filter(u => Number.isFinite(u)));
    if (Number.isFinite(soon)) schedule(Math.max(200, soon - Date.now()));
    return;
  }
  running = true;
  try {
    await withTimeout(renderEntry(next), JOB_TIMEOUT);
  } catch {
    fail(next, false);
  } finally {
    running = false;
    schedule(30);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('tiempo agotado')), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

/* ------------------------------------------------------------------ */
/* Rendering one entry                                                 */
/* ------------------------------------------------------------------ */

const entryById = (id: string) => useStudio.getState().entries.find(e => e.id === id);
const isCurrent = (id: string) => { const s = useStudio.getState(); return s.entries[s.cursor]?.id === id; };

async function renderEntry(e: Entry) {
  const r = e.recipe, v = recipeVersion(r);
  const media = await mediaFor(r, isCurrent(e.id));
  if (media === 'missing') { fail(e, true); return; }
  const { cssW, cssH } = stageSize();
  const aspect = THUMB_W / THUMB_H;
  const regW = Math.min(cssW, cssH * aspect), regH = regW / aspect;
  const pr = Math.min(1, (THUMB_W * OVERSAMPLE) / regW);
  const pic = await withOffscreen({ cssW, cssH, pixelRatio: pr }, r, async eng => {
    // the entry may have changed while waiting for its turn
    if (recipeVersion(entryById(e.id)?.recipe ?? r) !== v) return null;
    if (media) giveMedia(eng, r, media.el);
    eng.set(r);
    await eng.ready();
    eng.renderAt(THUMB_T, THUMB_T);
    // the centre of the render, cropped to the thumbnail's shape and scaled down
    const W = eng.canvas.width, H = eng.canvas.height, sw = regW * pr, sh = regH * pr;
    const c = await snapshotCanvas(eng, (W - sw) / 2, (H - sh) / 2, sw, sh, THUMB_W, THUMB_H);
    if (!c) throw new Error('sin imagen');
    return c;
  });
  if (!pic) return;
  const url = await canvasUrl(pic, 0.78);
  if (!url) throw new Error('sin imagen');
  if (setThumb(e.id, url, v)) {
    fails.delete(e.id);
    const fb = useThumbs.getState().fallback;
    if (fb[e.id]) { const next = { ...fb }; delete next[e.id]; useThumbs.setState({ fallback: next }); }
  }
}

function giveMedia(eng: Renderer, r: Recipe, el: MediaEl) {
  for (const k of ['image', 'video', 'camera'] as const) eng.setMedia(k, k === r.source ? el : null);
}

/* ------------------------------------------------------------------ */
/* The entry's own media                                               */
/* ------------------------------------------------------------------ */

type Media = { el: MediaEl } | null | 'missing';

/** Recently decoded files by id (many entries share one photo): a couple, released when unused. */
const decoded = new Map<string, { el: MediaEl; at: number }>();
let decodedT = 0;

function keepDecoded(id: string, el: MediaEl) {
  decoded.delete(id);
  decoded.set(id, { el, at: Date.now() });
  while (decoded.size > 2) {
    const [k, v] = decoded.entries().next().value!;
    decoded.delete(k);
    if ('close' in v.el && typeof v.el.close === 'function') v.el.close();
  }
  clearTimeout(decodedT);
  decodedT = window.setTimeout(() => {
    for (const v of decoded.values()) if ('close' in v.el && typeof v.el.close === 'function') v.el.close();
    decoded.clear();
  }, 30_000);
}

/**
 * The picture or video frame an entry was made with: what the stage shows when it is that file, else the
 * file from this tab or the browser's media store. The camera only while it is on and the entry is the
 * current one. 'missing' when there is nothing to draw it with (the stand-in is drawn instead).
 */
async function mediaFor(r: Recipe, current: boolean): Promise<Media> {
  const src = r.source;
  if (src === 'camera') {
    const cam = mediaElement('camera');
    return current && cam ? { el: cam } : 'missing';
  }
  if (src !== 'image' && src !== 'video') return null;
  const ref = r.media.ref?.kind === src ? r.media.ref : undefined;
  const onStage = mediaElement(src), shown = useMedia.getState()[src];
  // recipes from before media references: whatever the stage has, while it is the current entry
  if (!ref) return current && onStage ? { el: onStage } : 'missing';
  if (!ref.id) return 'missing';
  if (onStage && shown?.id === ref.id) return { el: onStage };
  const hit = decoded.get(ref.id);
  if (hit) return { el: hit.el };
  const found = await mediaBlob(ref.id).catch(() => null);
  if (!found) return 'missing';
  const el = src === 'image' ? await decodeSmall(found.blob) : await videoFrame(found.blob);
  if (!el) return 'missing';
  keepDecoded(ref.id, el);
  return { el };
}

const MEDIA_MAX = 1024;

async function decodeSmall(blob: Blob): Promise<MediaEl | null> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const k = Math.min(1, MEDIA_MAX / Math.max(bmp.width, bmp.height));
    if (k >= 1) return bmp;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c;
  } catch {
    return null;
  }
}

/** One frame of a stored video (a fifth of the way in, at most a second), copied to a canvas. */
function videoFrame(blob: Blob): Promise<HTMLCanvasElement | null> {
  return new Promise(res => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (c: HTMLCanvasElement | null) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      v.removeAttribute('src'); v.load();
      URL.revokeObjectURL(url);
      res(c);
    };
    const t = setTimeout(() => finish(null), 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.addEventListener('loadeddata', () => { v.currentTime = Math.min(1, (Number.isFinite(v.duration) ? v.duration : 0) * 0.2); }, { once: true });
    v.addEventListener('seeked', () => {
      const k = Math.min(1, MEDIA_MAX / Math.max(v.videoWidth, v.videoHeight, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
      try { c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); finish(c); } catch { finish(null); }
    }, { once: true });
    v.addEventListener('error', () => finish(null), { once: true });
    v.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Stand-in pictures                                                   */
/* ------------------------------------------------------------------ */

function fail(e: Entry, media: boolean) {
  const v = recipeVersion(e.recipe), prev = fails.get(e.id);
  const tries = prev && prev.v === v ? prev.tries + 1 : 1;
  // missing media: tried again when the stage shows a file (see startThumbs), not on a clock
  const until = media ? Infinity : tries > BACKOFF.length ? Infinity : Date.now() + BACKOFF[tries - 1];
  fails.set(e.id, { v, tries, until, media });
  const fb = useThumbs.getState().fallback;
  if (!e.thumb || media) {
    const url = standIn(e.recipe, media);
    if (url) useThumbs.setState({ fallback: { ...fb, [e.id]: url } });
  }
}

const MEDIA_NOTE: Partial<Record<Recipe['source'], string>> = { image: 'sin su imagen', video: 'sin su video', camera: 'cámara' };

/**
 * A picture drawn from the recipe alone: its background, its palette, a run of its glyphs in the palette's
 * colours and the name of its pattern (and a note when its image, video or camera is not here).
 */
export function standIn(r: Recipe, media = false): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = THUMB_W; c.height = THUMB_H;
    const x = c.getContext('2d')!;
    x.fillStyle = r.color.bg;
    x.fillRect(0, 0, THUMB_W, THUMB_H);
    const stops = r.color.stops.length ? r.color.stops : ['#ffffff'];
    const g = x.createLinearGradient(0, 0, THUMB_W, 0);
    stops.forEach((s, i) => g.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, s));
    x.fillStyle = g;
    x.fillRect(0, THUMB_H - 10, THUMB_W, 10);
    const ramp = uniqueChars(r.glyph.charset).filter(ch => ch.trim());
    const glyphs = (ramp.length ? ramp : ['#']).slice(-8);
    x.font = '600 26px "JetBrains Mono", ui-monospace, monospace';
    x.textBaseline = 'middle';
    glyphs.forEach((ch, i) => {
      x.fillStyle = stops[Math.min(stops.length - 1, Math.floor((i / Math.max(1, glyphs.length - 1)) * (stops.length - 1) + 0.5))];
      x.fillText(ch, 10 + i * 22, 58);
    });
    const layer = r.layers.find(l => l.on) ?? r.layers[0];
    const name = r.source === 'text' ? 'texto' : PATTERNS.find(p => p.id === layer?.pattern)?.name ?? layer?.pattern ?? '';
    x.font = '500 12px "JetBrains Mono", ui-monospace, monospace';
    x.fillStyle = stops[stops.length - 1];
    x.globalAlpha = 0.85;
    x.fillText(media ? MEDIA_NOTE[r.source] ?? name : name, 10, 18);
    const url = c.toDataURL('image/webp', 0.8);
    return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

/** Testing and diagnostics: how many entries wait, and how many stand-ins show. */
export function thumbsStatus() {
  return { preparing: Object.keys(useThumbs.getState().preparing).length, fallback: Object.keys(useThumbs.getState().fallback).length, running };
}
