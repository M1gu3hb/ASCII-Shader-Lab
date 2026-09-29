/**
 * Small pictures of projects (versions, the saved list, templates, lab styles), made one at a time with a
 * compositor of their own (two ASCII engines at most, so the viewport keeps its WebGL budget), released
 * after a while without work.
 */
import { Compositor } from '../project/compositor';
import { thumbnail } from '../project/export';
import type { Project } from '../project/types';

let comp: Compositor | null = null;
let idleT = 0;
let chain: Promise<unknown> = Promise.resolve();

function compositor(): Compositor {
  clearTimeout(idleT);
  return (comp ??= new Compositor({ maxEngines: 2 }));
}

function releaseSoon() {
  clearTimeout(idleT);
  idleT = window.setTimeout(() => { comp?.destroy(); comp = null; }, 20_000);
}

/** A data URL of the project at time t, `width` px wide (WebP when this browser encodes it). */
export function projectThumb(p: Project, width = 240, t = 0): Promise<string | null> {
  const job = chain.then(async () => {
    try { return await thumbnail(p, { width, t, compositor: compositor() }); } catch { return null; } finally { releaseSoon(); }
  });
  chain = job.catch(() => null);
  return job;
}

/** Frees the thumbnail engines now (leaving the editor). */
export function releaseThumbs() {
  clearTimeout(idleT);
  comp?.destroy();
  comp = null;
}
