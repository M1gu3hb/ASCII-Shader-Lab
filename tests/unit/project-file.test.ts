import { describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine/recipe';
import { buildProjectFile, openProjectFile, PROJECT_JSON, type MediaSink } from '../../src/project/file';
import { newLayer, projectFromImage, uid } from '../../src/project/normalize';
import { projectMedia, projectMediaIds, rewriteMediaIds } from '../../src/project/refs';
import type { BlobResolver } from '../../src/project/sources';
import type { Project } from '../../src/project/types';
import { buildProject } from '../../src/shared/project';
import { buildSession } from '../../src/shared/session';
import { recipeFile } from '../../src/shared/share';
import { unzip, zip } from '../../src/shared/zip';

const PHOTO = 'a1a1a1a1a1a1a1a1', MATTE = 'b2b2b2b2b2b2b2b2', PAINT = 'c3c3c3c3c3c3c3c3', CUT = 'd4d4d4d4d4d4d4d4', GONE = 'e5e5e5e5e5e5e5e5';
const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) & 255);

/** A fake media store: id → bytes (and what was put back, in order). */
function fakeStore(files: Record<string, Uint8Array>) {
  const puts: Array<{ data: Uint8Array; meta: Parameters<MediaSink>[1] }> = [];
  const blob: BlobResolver = async id => (files[id] ? { blob: new Blob([files[id] as BlobPart], { type: 'image/png' }), name: `${id}.png`, type: 'image/png' } : null);
  return { blob, puts };
}

function sample(): Project {
  const p = projectFromImage({ id: PHOTO, kind: 'image', name: 'foto de mamá.png', type: 'image/png', size: 64, w: 800, h: 600 }, { duration: 3 });
  p.seed = 'fija';
  p.sources.push({ id: 'recorte', kind: 'cutout', name: 'Sujeto', media: [{ id: CUT, kind: 'image', name: 'sujeto.png', type: 'image/png', w: 800, h: 600 }], w: 800, h: 600, cutout: { from: p.sources[0].id, matte: { id: MATTE, kind: 'image', name: 'mate.png', type: 'image/png', w: 800, h: 600 } } });
  const g = newLayer('glyphs', {
    source: 'recorte',
    mask: { invert: false, feather: 3, opacity: 1, parts: [
      { kind: 'raster', op: 'add', media: { id: PAINT, kind: 'image', name: 'pintada.png', w: 800, h: 600 }, soft: 1, alpha: 1, origin: 'paint' },
      { kind: 'raster', op: 'subtract', media: { id: GONE, kind: 'image', name: 'perdida.png', w: 800, h: 600 }, soft: 0, alpha: 1 },
    ] },
    clips: [{ id: uid(), template: 'escritura', start: 0, dur: 2, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }],
  });
  p.layers.push(g);
  p.tracks.push({ layer: g.id, path: 'opacity', keys: [{ t: 0, v: 0, ease: { kind: 'in' } }, { t: 1, v: 1, ease: { kind: 'linear' } }] });
  return p;
}

const FILES: Record<string, Uint8Array> = { [PHOTO]: bytes(64, 1), [MATTE]: bytes(40, 2), [PAINT]: bytes(30, 3), [CUT]: bytes(50, 4) };

describe('project media', () => {
  it('lists every stored file once, with its role', () => {
    const p = sample();
    const m = projectMedia(p);
    expect(m.map(x => [x.ref.id, x.role])).toEqual([[PHOTO, 'original'], [CUT, 'recorte'], [MATTE, 'mate'], [PAINT, 'mascara'], [GONE, 'mascara']]);
    expect(projectMediaIds(p)).toEqual(new Set([PHOTO, CUT, MATTE, PAINT, GONE]));
    const q = rewriteMediaIds(sample(), new Map([[PHOTO, 'f0f0f0f0f0f0f0f0'], [PAINT, 'f1f1f1f1f1f1f1f1']]));
    expect(projectMediaIds(q)).toEqual(new Set(['f0f0f0f0f0f0f0f0', CUT, MATTE, 'f1f1f1f1f1f1f1f1', GONE]));
  });
});

describe('project file', () => {
  it('round trip: the same project (new id), every file back byte for byte, the missing one reported', async () => {
    const p = sample();
    const { blob } = fakeStore(FILES);
    const file = await buildProjectFile(p, { blob });
    const entries = await unzip(file);
    const names = entries.map(e => e.name);
    expect(names[0]).toBe(PROJECT_JSON);
    expect(names).toContain('LEEME.txt');
    expect(names.filter(n => n.startsWith('medios/'))).toEqual([`medios/${PHOTO}-foto de mamá.png`, `medios/${CUT}-sujeto.png`, `medios/${MATTE}-mate.png`, `medios/${PAINT}-pintada.png`]);
    const readme = await entries.find(e => e.name === 'LEEME.txt')!.text();
    expect(readme).toMatch(/no estaba\s+guardados|no estaba/);
    expect(readme).toContain('/studio/foto/');

    const stored = new Map<string, Uint8Array>();
    const sink: MediaSink = async (data, meta) => { stored.set(`${meta.name}`, data); return Object.keys(FILES).find(k => FILES[k].length === data.length && FILES[k].every((v, i) => v === data[i]))!; };
    const res = await openProjectFile(file, { store: sink });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.restored).toBe(4);
    expect(res.missing.map(m => m.id)).toEqual([GONE]);
    expect(res.project.id).not.toBe(p.id);
    expect(res.project.meta.openedFrom).toBe(p.id);
    const strip = (x: Project) => ({ ...x, id: '', updated: 0, meta: {} });
    expect(strip(res.project)).toEqual(strip(p));
    expect(stored.get('foto de mamá.png')).toEqual(FILES[PHOTO]);
  });

  it('rewrites media ids when the store names a file differently', async () => {
    const { blob } = fakeStore(FILES);
    const file = await buildProjectFile(sample(), { blob });
    let n = 0;
    const res = await openProjectFile(file, { store: async () => `9999999999999${String(n++).padStart(3, '0')}` });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = [...projectMediaIds(res.project)];
    expect(ids.filter(id => id.startsWith('9999'))).toHaveLength(4);
    expect(ids).toContain(GONE);
  });

  it('opens a project JSON on its own (without files)', async () => {
    const p = sample();
    const res = await openProjectFile(new Blob([JSON.stringify(p)]), { store: async () => 'x' });
    expect(res.ok && res.project.layers.length).toBe(2);
    expect(res.ok && res.missing.length).toBe(5);
  });

  it('tells a lab project, a lab session and a lab recipe apart (and gives the recipe back)', async () => {
    const r = defaultRecipe();
    r.meta.name = 'Pieza';
    const lab = await openProjectFile(await buildProject(r));
    expect(lab).toMatchObject({ ok: false, reason: 'proyecto-laboratorio' });
    expect(!lab.ok && lab.recipe?.meta.name).toBe('Pieza');
    const ses = await openProjectFile(await buildSession({ entries: [], favorites: [], cursor: 0 }));
    expect(ses).toMatchObject({ ok: false, reason: 'sesion-laboratorio' });
    const rec = await openProjectFile(new Blob([recipeFile(r)]));
    expect(rec).toMatchObject({ ok: false, reason: 'receta-laboratorio' });
    expect(!rec.ok && rec.message).toMatch(/laboratorio/);
  });

  it('refuses garbage safely', async () => {
    const cases: Blob[] = [
      new Blob([new Uint8Array([1, 2, 3])]),
      new Blob(['{"hola": 1}']),
      new Blob(['no es json']),
      new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9])]),
      await zip([{ name: 'otra-cosa.txt', data: 'hola' }]),
      await zip([{ name: PROJECT_JSON, data: '{"glyphos":"project","project":' }]),
      await zip([{ name: PROJECT_JSON, data: '{"glyphos":"project","project":{"kind":"otra"}}' }]),
    ];
    for (const b of cases) {
      const res = await openProjectFile(b, { store: async () => { throw new Error('no debería guardar nada'); } });
      expect(res.ok).toBe(false);
      expect(!res.ok && res.message.length).toBeGreaterThan(10);
    }
    // a truncated project file
    const { blob } = fakeStore(FILES);
    const good = await buildProjectFile(sample(), { blob });
    const cut = good.slice(0, Math.floor(good.size / 2));
    expect((await openProjectFile(cut)).ok).toBe(false);
  });

  it('a damaged manifest entry is skipped, not trusted', async () => {
    const p = sample();
    const doc = { glyphos: 'project', version: 1, project: p, media: [{ id: PHOTO, path: '../../etc/passwd' }, null, 7, { id: PAINT, path: `medios/${PAINT}-x.png`, kind: 'image' }] };
    const file = await zip([{ name: PROJECT_JSON, data: JSON.stringify(doc) }, { name: `medios/${PAINT}-x.png`, data: FILES[PAINT] }]);
    const got: string[] = [];
    const res = await openProjectFile(file, { store: async (_d, m) => { got.push(m.name); return PAINT; } });
    expect(res.ok && res.restored).toBe(1);
    expect(got).toHaveLength(1);
  });
});
