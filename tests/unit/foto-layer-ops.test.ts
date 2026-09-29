import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine/recipe';
import { deleteLayer } from '../../src/foto/layerOps';
import { newLayer, projectFromImage } from '../../src/project/normalize';
import { openProject, setKey, undo, updateLayer, useProject } from '../../src/project/store';
import type { Project } from '../../src/project/types';
import { useToasts } from '../../src/studio/toast';

/** The studio's layer verbs (src/foto/layerOps.ts) outside the page: the status line needs a window and frames. */
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window ??= globalThis;
  g.requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0);
});

function project(): Project {
  const p = projectFromImage({ id: '0123456789abcdef', kind: 'image', w: 1200, h: 800 });
  const style = defaultRecipe();
  style.source = 'image';
  p.layers.push(newLayer('ascii', { name: 'ASCII', source: p.sources[0].id, style }));
  p.layers.push(newLayer('text', { name: 'Título' }));
  return p;
}
const P = () => useProject.getState().project!;
/** The action of the last toast (the «Deshacer» of a deletion). */
const toastAction = () => useToasts.getState().list.at(-1)?.action;
/** Runs it and lets what it started finish. */
const use = async (a: { run(): void } | undefined) => { a!.run(); await new Promise(r => setTimeout(r, 10)); };

beforeEach(() => { openProject(project()); useToasts.setState({ list: [] }); });

describe('deleting a layer and the toast\'s «Deshacer»', () => {
  it('brings back that layer (with its keys) even after other edits, and keeps those edits', async () => {
    const [photo, ascii] = P().layers;
    setKey(ascii.id, 'opacity', 0, 0.2);
    deleteLayer(ascii.id);
    expect(P().layers.map(l => l.id)).not.toContain(ascii.id);
    expect(P().tracks).toHaveLength(0);
    const act = toastAction();
    expect(act?.label).toBe('Deshacer');
    // another change before the toast is used
    updateLayer(photo.id, { visible: false });
    await use(act);
    expect(P().layers.map(l => l.id)).toEqual([photo.id, ascii.id, P().layers[2].id]);
    expect(P().layers[0].visible).toBe(false);
    expect(P().tracks.map(t => t.layer)).toEqual([ascii.id]);
    expect(useProject.getState().selection).toEqual([ascii.id]);
    // one undo step: the layer goes again, the other change stays
    undo();
    expect(P().layers.map(l => l.id)).not.toContain(ascii.id);
    expect(P().layers[0].visible).toBe(false);
  });

  it('right after the deletion it is the undo step itself', async () => {
    const before = P();
    const ascii = before.layers[1];
    deleteLayer(ascii.id);
    await use(toastAction());
    expect(P()).toBe(before);
    expect(useProject.getState().canRedo).toBe(true);
  });

  it('does nothing more when the layer is already back (Ctrl+Z first)', async () => {
    const [photo, ascii] = P().layers;
    updateLayer(photo.id, { opacity: 0.5 });
    deleteLayer(ascii.id);
    undo();
    const back = P();
    expect(back.layers.map(l => l.id)).toContain(ascii.id);
    await use(toastAction());
    expect(P()).toBe(back);
    expect(P().layers[0].opacity).toBe(0.5);
  });
});
