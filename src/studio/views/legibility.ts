import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import { gradientCover, gradientSide, type Scrim } from '../../shared/scrim';
import { sameRecipe } from '../../engine/recipe';
import { getEngine } from '../engineBridge';
import { currentRecipe } from '../store';
import { previewInk } from '../guide/paths';
import {
  applyScrim, measureRegion, resample, verdict, type Level, type Metrics, type RegionRole, type RegionSpec, type Rgb, type Verdict,
} from './readability';
import type { InkMode } from './views';

/**
 * The legibility meter of the previews with content on top («Fondo web», «Pantalla de móvil», and so the
 * fondo guide): reads the stage pixels behind each text region marked `data-legib`, several frames, and
 * publishes the verdict (readability.ts) for whatever shows it. One meter runs while its preview is on screen.
 */
export interface Estimate extends Verdict {
  /** Frames measured since the last change. */
  frames: number;
  /** The same background with the other text colour (the advice offers it when it reads better). */
  alt: Level | null;
  /** The text is light (the reasons say «claros» or «oscuros»). */
  light: boolean;
}

export const useLegibility = create<{ est: Estimate | null }>(() => ({ est: null }));

/** Frames measured before the estimate may say «se lee bien» (the background moves). */
export const MIN_FRAMES = 4;
/** The verdict is the worst of the last frames (about ten seconds of the animation). */
const WINDOW = 8;

/** Colour of the page text: near black on light backgrounds and white on dark ones, unless chosen. */
export const inkFor = (mode: InkMode, bg: string) => (mode === 'light' ? '#ffffff' : mode === 'dark' ? '#111111' : previewInk(bg));

interface Box { x: number; y: number; w: number; h: number }
interface Found { spec: RegionSpec; lines: Box[]; margin: number }

const rgbOf = (s: string): [Rgb, number] => {
  const m: string[] = s.match(/[\d.]+/g) ?? [];
  const n = (i: number) => Number(m[i] ?? 0) || 0;
  return [[n(0), n(1), n(2)], m.length > 3 ? n(3) : 1];
};
const ROLES: RegionRole[] = ['headline', 'body', 'button', 'nav'];

/** The text regions inside `root`, their line boxes in the canvas's own CSS px (the phone is drawn scaled). */
function regionsOf(root: HTMLElement, cr: DOMRect, k: number): Found[] {
  const out: Found[] = [];
  root.querySelectorAll<HTMLElement>('[data-legib]').forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [...range.getClientRects()].filter(r => r.width >= 2 && r.height >= 2)
      .map(r => ({ x: (r.left - cr.left) / k, y: (r.top - cr.top) / k, w: r.width / k, h: r.height / k }));
    if (!lines.length) return;
    let alpha = 1;
    for (let e: HTMLElement | null = el; e && e !== root.parentElement; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity);
    const [text, ta] = rgbOf(cs.color);
    const [fill, fa] = rgbOf(cs.backgroundColor);
    const size = parseFloat(cs.fontSize) || 16, weight = parseInt(cs.fontWeight, 10) || 400;
    const role = (ROLES as string[]).includes(el.dataset.legib ?? '') ? (el.dataset.legib as RegionRole) : 'body';
    out.push({
      spec: { id: el.dataset.legibId ?? `${role}-${i}`, role, name: el.dataset.legibName ?? role, text, alpha: alpha * ta, large: size >= 24 || (size >= 18.66 && weight >= 700), fill: fa >= 0.9 ? fill : null },
      lines, margin: Math.max(2, Math.round(size * 0.25)),
    });
  });
  return out;
}

/** Per pixel of `box`, how much of the protected zone covers it. */
function coverOf(root: HTMLElement, scrim: Scrim, cr: DOMRect, k: number, box: Box, w: number, h: number): Float32Array | null {
  const layer = root.parentElement?.querySelector<HTMLElement>('.vw-scrim');
  const cover = new Float32Array(w * h);
  const rel = (r: DOMRect) => ({ x: (r.left - cr.left) / k, y: (r.top - cr.top) / k, w: r.width / k, h: r.height / k });
  if (scrim.shape === 'block') {
    const shields = [...root.querySelectorAll<HTMLElement>('.pc-shield')].map(s => rel(s.getBoundingClientRect()));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = box.x + x + 0.5, py = box.y + y + 0.5;
      if (shields.some(s => px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h)) cover[y * w + x] = 1;
    }
    return cover;
  }
  if (!layer) return null;
  const L = rel(layer.getBoundingClientRect());
  const side = gradientSide(L.w, L.h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = box.x + x + 0.5, py = box.y + y + 0.5;
    const inside = px >= L.x && px < L.x + L.w && py >= L.y && py < L.y + L.h;
    const t = side === 'left' ? (px - L.x) / L.w : (L.y + L.h - py) / L.h;
    cover[y * w + x] = !inside ? 0 : scrim.shape === 'full' ? 1 : gradientCover(t);
  }
  return cover;
}

/** Testing aid: localStorage 'mt.debugLegib' = '1' leaves the last measurement in window.__mtLegib. */
const debug = () => { try { return localStorage.getItem('mt.debugLegib') === '1'; } catch { return false; } };

const hexRgb = (h: string): Rgb => { const n = parseInt(h.replace('#', '').slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Measures the preview whose content is `root` while `on`: a few frames quickly after each change (the
 * background moves), then one every 1.2 s, keeping the worst of the last eight. `key` is whatever changes
 * what is measured (the piece, the text colour, the protected zone). «Se lee bien» is only said after
 * four frames; a problem is said as soon as it is seen.
 */
export function useLegibilityMeter(on: boolean, root: RefObject<HTMLElement | null>, ink: string, scrim: Scrim | null, key: unknown) {
  // an estimate is only true while its preview is there
  useEffect(() => () => useLegibility.setState({ est: null }), []);
  useEffect(() => {
    if (!on) { useLegibility.setState({ est: null }); return; }
    let alive = true, n = 0, t = 0, busy = false;
    const frames = new Map<string, Metrics[]>(), alts = new Map<string, Metrics[]>();
    const light = ink.toLowerCase() === '#ffffff';
    const altInk: Rgb = light ? [17, 17, 17] : [255, 255, 255];
    useLegibility.setState({ est: null });
    const push = (map: Map<string, Metrics[]>, id: string, m: Metrics) => {
      const list = map.get(id) ?? [];
      list.push(m);
      if (list.length > WINDOW) list.shift();
      map.set(id, list);
    };
    const sample = async (): Promise<boolean> => {
      const eng = getEngine();
      const el = root.current;
      // only the piece that is being judged: not the previous one while the new one is prepared or fades in
      if (!eng || !el || document.hidden || eng.busy || !sameRecipe(eng.recipe, currentRecipe())) return false;
      const c = eng.canvas;
      if (!c.clientWidth || !c.clientHeight) return false;
      const cr = c.getBoundingClientRect();
      const k = cr.width / c.clientWidth, dp = c.width / c.clientWidth;
      const found = regionsOf(el, cr, k);
      if (!found.length) return false;
      const pad = scrim ? Math.ceil(scrim.blur * 2) : 0;
      const boxes = found.map(f => {
        const m = f.margin + pad;
        const x0 = Math.max(0, Math.floor(Math.min(...f.lines.map(l => l.x)) - m)), y0 = Math.max(0, Math.floor(Math.min(...f.lines.map(l => l.y)) - m));
        const x1 = Math.min(c.clientWidth, Math.ceil(Math.max(...f.lines.map(l => l.x + l.w)) + m)), y1 = Math.min(c.clientHeight, Math.ceil(Math.max(...f.lines.map(l => l.y + l.h)) + m));
        return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
      });
      // one frame, read right away (a live WebGL canvas keeps its pixels only until it is shown)
      eng.renderNow();
      const shots = await Promise.all(boxes.map(b => eng.snapshot(b.x * dp, b.y * dp, b.w * dp, b.h * dp)));
      if (!alive) return false;
      found.forEach((f, i) => {
        const img = shots[i], b = boxes[i];
        if (!img) return;
        const data = resample(img.data, img.width, img.height, b.w, b.h);
        const mask = new Uint8Array(b.w * b.h);
        for (const l of f.lines) {
          for (let y = Math.max(0, Math.floor(l.y - f.margin - b.y)); y < Math.min(b.h, Math.ceil(l.y + l.h + f.margin - b.y)); y++) {
            for (let x = Math.max(0, Math.floor(l.x - f.margin - b.x)); x < Math.min(b.w, Math.ceil(l.x + l.w + f.margin - b.x)); x++) mask[y * b.w + x] = 1;
          }
        }
        let s = { w: b.w, h: b.h, data, mask } as Parameters<typeof measureRegion>[1];
        if (scrim) s = applyScrim(s, { color: hexRgb(scrim.color), opacity: scrim.opacity, blur: scrim.blur }, coverOf(el, scrim, cr, k, b, b.w, b.h));
        push(frames, f.spec.id, measureRegion(f.spec, s));
        push(alts, f.spec.id, measureRegion({ ...f.spec, text: altInk }, s));
      });
      n++;
      if (debug()) (window as unknown as { __mtLegib?: unknown }).__mtLegib = { n, boxes, found, frames: Object.fromEntries(frames), dp, k, ink };
      const v = verdict(found.map(f => f.spec), frames);
      if (!v.regions.length) return true;
      const alt = verdict(found.map(f => ({ ...f.spec, text: altInk })), alts).level;
      // «se lee bien» waits for enough frames; a problem shows at once
      useLegibility.setState({ est: v.level === 'buena' && n < MIN_FRAMES ? null : { ...v, frames: n, alt, light } });
      return true;
    };
    const loop = async () => {
      if (!alive || busy) return;
      busy = true;
      let ok = false;
      try { ok = await sample(); } catch { /* a canvas we cannot read: no estimate */ }
      busy = false;
      if (alive) t = window.setTimeout(() => void loop(), !ok ? 300 : n < MIN_FRAMES ? 350 : 1200);
    };
    // the first sample lets a style's crossfade settle
    t = window.setTimeout(() => void loop(), 450);
    return () => { alive = false; clearTimeout(t); };
  }, [on, root, ink, scrim?.color, scrim?.opacity, scrim?.blur, scrim?.shape, key]);
}
