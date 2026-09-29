/**
 * Animated previews of the library: small, low-resolution renders through the core Compositor (the same
 * code as the studio and the exports), on a sample photo or the studio's own. One scheduler for all the
 * cards: it renders one card per animation frame at most, only cards on screen, and stops completely when
 * none is visible or the picker closes. With reduced motion each card shows one still frame.
 */
import { Compositor } from '../../project/compositor';
import { evaluate } from '../../project/evaluate';
import type { Drawable } from '../../project/sources';
import type { AnimClip, LayerKind, Project } from '../../project/types';
import type { ParamValue } from '../../project/clips';
import { sampleProject, sampleProvider } from './samples';

export interface PreviewItem {
  template: string;
  kind: LayerKind;
  params?: Record<string, ParamValue>;
  reverse?: boolean;
  dur: number;
  /** Several clips instead of one (a choreography), over `dur` seconds. */
  clips?: AnimClip[];
}

interface Entry { canvas: HTMLCanvasElement; project: Project; dur: number; t: number; last: number; visible: boolean; drawn: boolean }

export const PREVIEW_W = 240, PREVIEW_H = 150;

export class PreviewScheduler {
  private compositor: Compositor;
  private entries = new Map<HTMLCanvasElement, Entry>();
  private io: IntersectionObserver | null = null;
  private raf = 0;
  private busy = false;
  private cursor = 0;
  private stopped = false;
  readonly reduced: boolean;
  /** Renders done (for tests and measurements). */
  renders = 0;

  constructor(o: { picture?: () => Drawable | null; root?: Element | null; reduced?: boolean; basic?: boolean } = {}) {
    this.compositor = new Compositor({ provider: sampleProvider(o.picture), maxEngines: 2, ...(o.basic ? { force: 'basic' as const } : {}) });
    this.reduced = o.reduced ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver(list => {
        for (const e of list) {
          const en = this.entries.get(e.target as HTMLCanvasElement);
          if (en) en.visible = e.isIntersecting;
        }
        this.kick();
      }, { root: o.root ?? null, rootMargin: '80px' });
    }
  }

  /** Starts previewing an item in a canvas; returns what stops it. */
  register(canvas: HTMLCanvasElement, item: PreviewItem): () => void {
    const project = sampleProject(item.template, item.kind, { w: PREVIEW_W, h: PREVIEW_H, cell: 5, clip: { params: item.params ?? {}, reverse: !!item.reverse, dur: item.dur } });
    if (item.clips) { project.layers[project.layers.length - 1].clips = item.clips; project.time.duration = item.dur; }
    const dur = Math.max(0.2, item.dur);
    this.entries.set(canvas, { canvas, project, dur, t: this.reduced ? dur * 0.6 : 0, last: 0, visible: !this.io, drawn: false });
    this.io?.observe(canvas);
    this.kick();
    return () => { this.io?.unobserve(canvas); this.entries.delete(canvas); };
  }

  private kick() {
    if (this.stopped || this.raf) return;
    if (![...this.entries.values()].some(e => e.visible && (!this.reduced || !e.drawn))) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    this.raf = 0;
    if (this.stopped) return;
    const list = [...this.entries.values()].filter(e => e.visible && (!this.reduced || !e.drawn));
    if (!list.length || this.busy) return;
    {
      const e = list[this.cursor++ % list.length];
      const now = performance.now();
      if (!this.reduced) {
        // each card runs its own clock, with a short rest at the end before it starts over
        e.t = e.last ? (e.t + (now - e.last) / 1000) % (e.dur + 0.6) : 0;
        e.last = now;
      }
      this.busy = true;
      void this.compositor.render(evaluate(e.project, Math.min(e.t, e.dur)), e.canvas, { scale: 1, quality: 'preview' })
        .catch(() => undefined)
        // the next card waits for the next animation frame: one render per frame at most, none when idle
        .finally(() => { this.busy = false; e.drawn = true; this.renders++; this.kick(); });
    }
  }

  /** Stops everything and frees the compositor (engines, canvases). */
  dispose(): void {
    this.stopped = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io?.disconnect();
    this.entries.clear();
    this.compositor.destroy();
  }
}
