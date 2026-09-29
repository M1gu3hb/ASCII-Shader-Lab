import { describe, expect, it, vi } from 'vitest';

// (the studio's toasts and status line are UI: not needed here)
vi.mock('../../src/studio/toast', () => ({ toast: () => {} }));
vi.mock('../../src/foto/ui', () => ({ say: () => {} }));

import { replaceSource } from '../../src/foto/layerOps';
import { newLayer, projectFromImage } from '../../src/project/normalize';
import { openProject, useProject } from '../../src/project/store';

describe('layer operations', () => {
  it('«Cambiar foto»: the layers and the colour masks that read the old picture read the new one', () => {
    const p = projectFromImage({ id: 'a1b2c3d4e5f60718', kind: 'image', w: 64, h: 64, name: 'a.png' });
    const src = p.sources[0].id;
    const ascii = newLayer('ascii', { name: 'ASCII', source: src });
    ascii.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'color', op: 'add', source: src, color: '#ffffff', tol: 0.2, soft: 0.1, alpha: 1 }] };
    p.layers.push(ascii);
    openProject(p);
    replaceSource(p.layers[0].id, { id: 'b1b2c3d4e5f60718', kind: 'image', w: 64, h: 64, name: 'b.png' });
    const q = useProject.getState().project!;
    expect(q.sources.map(s => s.media[0].id)).toEqual(['b1b2c3d4e5f60718']);
    const now = q.sources[0].id;
    expect((q.layers[1] as { source: string }).source).toBe(now);
    // the old source is gone: a colour mask left on it would come out empty and hide the whole layer
    expect((q.layers[1].mask!.parts[0] as { source: string }).source).toBe(now);
  });
});
