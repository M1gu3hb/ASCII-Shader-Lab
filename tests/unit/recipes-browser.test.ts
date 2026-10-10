import { describe, expect, it } from 'vitest';
import { defaultRecipe, type Recipe } from '../../src/engine/recipe';
import type { Entry } from '../../src/studio/history';
import { PRESETS, spaceAccepts } from '../../src/studio/presets';
import { SCENES } from '../../src/studio/scenes';
import { FAMILIES } from '../../src/families/registry';
import { CATEGORIES, allItems, filtersOf, itemNamed, itemsOf, moodOf, sectionOf, sectionsOf } from '../../src/studio/recipes/catalog';
import { fold, search, tokens } from '../../src/studio/recipes/search';
import { itemOfEntry, isShown, recentItems } from '../../src/studio/recipes/used';
import { keptKey } from '../../src/studio/recipes/kept';

/**
 * The lab's recipe catalogue (recipes/catalog.ts): every recipe and scene is listed once, in its own space,
 * under a section that exists; its recipe opens in that space; filters tell things apart; the search finds
 * what people type in Spanish; the history says which recipe a piece comes from and which were used lately.
 */

const SPACES = ['fondos', 'arte', 'media', 'tipo', 'terminal'] as const;

const entry = (label: string, space: Entry['space'], kind: Entry['kind'] = 'receta', edited = false): Entry => {
  const r = defaultRecipe();
  return { id: label + space + Math.random(), recipe: r, origin: r, kind, label, space, created: 0, edited };
};

describe('catálogo', () => {
  it('cada receta, cada escena y cada preset de familia aparece una vez, en su espacio', () => {
    const all = allItems();
    const families = FAMILIES.reduce((a, f) => a + f.presets.length, 0);
    const n = SPACES.reduce((a, sp) => a + PRESETS[sp].length, 0) + SCENES.length + families;
    // the visual families' presets are listed in Arte, each once
    for (const f of FAMILIES) for (const p of f.presets) expect(all.filter(i => i.space === 'arte' && i.kind === 'familia' && i.id === `${f.id}:${p.id}`)).toHaveLength(1);
    expect(all).toHaveLength(n);
    expect(new Set(all.map(i => i.key)).size).toBe(n);
    for (const sp of SPACES) {
      for (const p of PRESETS[sp]) expect(all.filter(i => i.space === sp && i.kind === 'receta' && i.id === p.id)).toHaveLength(1);
    }
    for (const s of SCENES) expect(all.filter(i => i.space === s.space && i.kind === 'escena' && i.id === s.id)).toHaveLength(1);
  });

  it('los nombres no se repiten dentro de un espacio (el historial reconoce la receta por su nombre)', () => {
    for (const sp of SPACES) {
      const names = itemsOf(sp).map(i => i.name);
      expect(new Set(names).size, sp).toBe(names.length);
    }
  });

  it('cada receta abre en su espacio: su receta encaja en él', () => {
    for (const it of allItems()) expect(spaceAccepts(it.space, it.make()), it.key).toBe(true);
  });

  it('las escenas y recetas de Imagen conservan la foto de la persona; las de Texto, sus palabras', () => {
    const photo: Recipe = { ...defaultRecipe(), source: 'image' };
    photo.media = { ...photo.media, ref: { kind: 'image', id: '0123456789abcdef', name: 'mi-foto.jpg', w: 800, h: 600 }, zoom: 1.3 };
    for (const it of itemsOf('media')) {
      const r = it.make(photo);
      expect(r.source, it.key).toBe('image');
      expect(r.media.ref?.id, it.key).toBe('0123456789abcdef');
      expect(r.media.zoom, it.key).toBe(1.3);
    }
    const words: Recipe = { ...defaultRecipe(), source: 'text' };
    words.text = { ...words.text, content: 'MIS PALABRAS' };
    for (const it of itemsOf('tipo')) {
      const r = it.make(words);
      if (r.source === 'text') expect(r.text.content, it.key).toBe('MIS PALABRAS');
    }
  });

  it('cada sección existe, y cada espacio lista sus secciones en orden, juntas', () => {
    for (const sp of SPACES) {
      const secs = sectionsOf(sp);
      expect(new Set(secs.map(s => s.cat.id)).size, sp).toBe(secs.length);
      expect(secs.reduce((a, s) => a + s.items.length, 0)).toBe(itemsOf(sp).length);
      for (const s of secs) expect(CATEGORIES[s.cat.id], s.cat.id).toBeTruthy();
      // the scenes come last, all together
      expect(secs[secs.length - 1].cat.id).toBe('escenas');
    }
    // Componentes shows the recipes of Fondos
    expect(itemsOf('componentes').map(i => i.key)).toEqual(itemsOf('fondos').map(i => i.key));
  });

  it('las secciones salen de lo que dibuja cada receta', () => {
    const arte = (id: string) => sectionOf('arte', id, PRESETS.arte.find(p => p.id === id)!.make());
    expect(arte('medusa-biologica')).toBe('figuras');
    expect(arte('mandelbrot-azul')).toBe('curvas');
    expect(arte('magma')).toBe('organicas');
    expect(arte('corrupto')).toBe('optica');
    expect(sectionOf('media', 'serigrafia', PRESETS.media.find(p => p.id === 'serigrafia')!.make())).toBe('efectos');
    expect(sectionOf('media', 'retrato', PRESETS.media.find(p => p.id === 'retrato')!.make())).toBe('clasicas');
    expect(sectionOf('tipo', 'ola', PRESETS.tipo.find(p => p.id === 'ola')!.make())).toBe('letras');
    expect(sectionOf('tipo', 'descifrar', PRESETS.tipo.find(p => p.id === 'descifrar')!.make())).toBe('mensajes');
    // a slow scene of a calm palette is calm; a fast glowing recipe is lively
    const calm = SCENES.find(s => s.mood === 'calma')!;
    expect(moodOf(defaultRecipe(), calm)).toBe('tranquilas');
    expect(moodOf(PRESETS.arte.find(p => p.id === 'hiperespacio')!.make())).toBe('expresivas');
  });

  it('los filtros separan algo: al menos dos recetas y no casi todas', () => {
    for (const sp of SPACES) {
      const f = filtersOf(sp);
      expect(f.length, sp).toBeGreaterThanOrEqual(3);
      for (const { cat, count } of f) {
        expect(count, `${sp}/${cat.id}`).toBeGreaterThanOrEqual(2);
        expect(count, `${sp}/${cat.id}`).toBeLessThanOrEqual(itemsOf(sp).length * 0.8);
        expect(itemsOf(sp).filter(i => i.cats.includes(cat.id))).toHaveLength(count);
      }
      expect(f.some(x => x.cat.id === 'escenas'), sp).toBe(true);
    }
    // Arte offers the moods and «Figuras 3D»
    const arte = filtersOf('arte').map(f => f.cat.id);
    expect(arte).toEqual(expect.arrayContaining(['figuras', 'curvas', 'tranquilas', 'expresivas', 'escenas']));
  });
});

describe('búsqueda', () => {
  const names = (q: string) => search(allItems(), q).map(i => i.name);

  it('sin acentos, mayúsculas ni signos', () => {
    expect(fold('¡Neón, AÑO!')).toBe('neon ano');
    expect(tokens('  Cáliz   cerámico ')).toEqual(['caliz', 'ceramico']);
    expect(names('neon')).toEqual(expect.arrayContaining(['Neón', 'Nudo de neón']));
    expect(names('NEÓN')).toEqual(names('neon'));
    expect(names('caliz ceramico')[0]).toBe('Cáliz cerámico');
  });

  it('el nombre primero; el principio de una palabra basta; los plurales encuentran el singular', () => {
    expect(names('medusa')[0]).toBe('Medusa bioluminiscente');
    expect(names('mandel')[0]).toBe('Atlas de Mandelbrot');
    expect(names('fractales')).toEqual(names('fractal'));
    expect(names('fractal')).toContain('Atlas de Mandelbrot');
  });

  it('por sección, ánimo, espacio o palabra clave; todas las palabras cuentan', () => {
    const d3 = search(allItems(), '3d');
    expect(d3.length).toBeGreaterThan(20);
    expect(d3.every(i => i.cats.includes('figuras') || i.words.includes('3d'))).toBe(true);
    expect(names('escena calma').length).toBeGreaterThan(3);
    expect(search(allItems(), 'escena calma').every(i => i.kind === 'escena')).toBe(true);
    expect(names('particulas').length).toBeGreaterThan(5);
    expect(search(allItems(), 'consola').some(i => i.space === 'terminal')).toBe(true);
    expect(search(allItems(), 'foto').filter(i => i.space === 'media').length).toBe(itemsOf('media').length);
    expect(names('zzqx')).toEqual([]);
  });
});

describe('historial', () => {
  it('la receta de la que viene una pieza: su nombre en su espacio', () => {
    const e = entry('Neón', 'tipo');
    expect(itemOfEntry(e)?.key).toBe('tipo/neon');
    expect(itemOfEntry(entry('Neón', 'media'))?.key).toBe('media/neon');
    expect(itemOfEntry(entry('Neón', 'tipo', 'azar'))).toBeUndefined();
    expect(itemOfEntry(entry('Atlas del enjambre', 'arte'))?.kind).toBe('escena');
    const item = itemNamed('tipo', 'Neón')!;
    expect(isShown(item, e)).toBe(true);
    expect(isShown(item, { ...e, edited: true })).toBe(false);
  });

  it('recientes: las elegidas, la última primero, una vez cada una, del espacio', () => {
    const list = [entry('Dona', 'arte'), entry('Marea', 'fondos'), entry('Julia', 'arte'), entry('Dona', 'arte'), entry('Bermellón', 'arte', 'inicio'), entry('Magma', 'arte', 'azar')];
    expect(recentItems(list, 'arte').map(i => i.name)).toEqual(['Dona', 'Julia']);
    expect(recentItems(list, 'fondos').map(i => i.name)).toEqual(['Marea']);
    expect(recentItems(list, 'arte', 1).map(i => i.name)).toEqual(['Dona']);
  });
});

describe('imágenes guardadas', () => {
  it('una clave corta y estable por imagen; otra receta, otra clave', () => {
    const a = keptKey('webgl|0.8|{"a":1}');
    expect(a).toBe(keptKey('webgl|0.8|{"a":1}'));
    expect(a).not.toBe(keptKey('webgl|0.8|{"a":2}'));
    expect(a).not.toBe(keptKey('basic|0.8|{"a":1}'));
    expect(a.length).toBeLessThan(40);
  });
});
