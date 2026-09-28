/**
 * The library as the studio shows it: groups in Spanish, templates per kind of layer, a few ready-made
 * variants of templates (a template with chosen params, or reversed: «ASCII → Foto» is «Foto → ASCII»
 * played backwards), and new clips made from any of them.
 */
import { templateById, templates, type ParamValue, type TemplateDef, type TemplateGroup } from '../project/clips';
import { uid } from '../project/normalize';
import type { AnimClip, Ease, LayerKind } from '../project/types';

export const GROUPS: Array<{ id: TemplateGroup; name: string; blurb: string }> = [
  { id: 'entrada', name: 'Entradas', blurb: 'La capa aparece: al final del clip queda tal cual es.' },
  { id: 'salida', name: 'Salidas', blurb: 'La capa se va: al empezar el clip está tal cual es.' },
  { id: 'transformación', name: 'Transformaciones', blurb: 'La capa cambia de estilo, de forma o de lugar.' },
  { id: 'énfasis', name: 'Énfasis', blurb: 'Un momento que llama la atención y vuelve a la capa como estaba.' },
  { id: 'bucle', name: 'Bucles', blurb: 'Movimiento continuo que cierra sin salto.' },
];

/** An entry of the library: a template, or a variant of one (params and direction chosen). */
export interface LibraryItem {
  id: string;
  template: string;
  name: string;
  blurb: string;
  group: TemplateGroup;
  kinds: LayerKind[];
  dur: number;
  params: Record<string, ParamValue>;
  reverse: boolean;
  variant: boolean;
}

/** Variants worth a place of their own in the library. */
export const VARIANTS: Array<Omit<LibraryItem, 'kinds' | 'dur' | 'variant'> & { dur?: number }> = [
  { id: 'ascii-a-foto', template: 'foto-a-ascii', name: 'ASCII → Foto', blurb: '«Foto → ASCII» al revés: los caracteres se retiran y queda la foto, celda por celda.', group: 'salida', params: { modo: 'disolver' }, reverse: true },
  { id: 'ascii-a-foto-luces', template: 'foto-a-ascii', name: 'ASCII → Foto por luces', blurb: 'Los caracteres de las sombras se van primero; las luces quedan hasta el final.', group: 'salida', params: { modo: 'brillo' }, reverse: true },
  { id: 'desintegracion', template: 'dispersar', name: 'Desintegración', blurb: 'La capa se deshace en polvo de caracteres que el viento se lleva, de un lado al otro.', group: 'salida', params: { modo: 'desintegrar', orden: 'izquierda' }, reverse: false },
  { id: 'iris-cierra', template: 'iris', name: 'Iris que se cierra', blurb: 'El iris al revés: la capa se cierra hacia un punto.', group: 'salida', params: {}, reverse: true },
  { id: 'pixelado-sale', template: 'pixelado', name: 'Nítido a pixelado', blurb: 'La capa se va en bloques cada vez más grandes.', group: 'salida', params: {}, reverse: true },
  { id: 'lluvia-binaria', template: 'lluvia', name: 'Lluvia binaria', blurb: 'La lluvia de matriz con ceros y unos.', group: 'entrada', params: { glifos: 'binario' }, reverse: false },
  { id: 'escritura-lineas', template: 'escritura', name: 'Salida de terminal', blurb: 'Línea a línea con pausas, como la respuesta de un programa.', group: 'entrada', params: { unidad: 'linea', puntuacion: 0.6, irregular: 0.5 }, reverse: false, dur: 2 },
];

function itemOf(def: TemplateDef): LibraryItem {
  return { id: def.id, template: def.id, name: def.name, blurb: def.blurb, group: def.group, kinds: def.kinds, dur: def.dur, params: {}, reverse: false, variant: false };
}

/** Every library item (templates first, then variants of registered templates), optionally for one kind. */
export function libraryItems(kind?: LayerKind): LibraryItem[] {
  const out = templates(kind).map(itemOf);
  for (const v of VARIANTS) {
    const def = templateById(v.template);
    if (!def || (kind && !def.kinds.includes(kind))) continue;
    out.push({ ...v, kinds: def.kinds, dur: v.dur ?? def.dur, variant: true });
  }
  return out;
}

/** The library grouped (groups in their order, empty groups left out). */
export function libraryByGroup(kind?: LayerKind): Array<{ group: (typeof GROUPS)[number]; items: LibraryItem[] }> {
  const items = libraryItems(kind);
  return GROUPS.map(group => ({ group, items: items.filter(i => i.group === group.id) })).filter(g => g.items.length);
}

export const libraryItem = (id: string, kind?: LayerKind) => libraryItems(kind).find(i => i.id === id);

/** A new clip of a library item (or a template id) at `start`, with its suggested duration. */
export function newClip(item: LibraryItem | string, start: number, o: { dur?: number; ease?: Ease } = {}): AnimClip {
  const it = typeof item === 'string' ? libraryItem(item) ?? (templateById(item) ? itemOf(templateById(item)!) : null) : item;
  const template = it?.template ?? String(item);
  return {
    id: uid(), template, start: Math.max(0, start), dur: Math.max(0.05, o.dur ?? it?.dur ?? 1),
    params: { ...(it?.params ?? {}) }, reverse: it?.reverse ?? false, ease: o.ease ?? { kind: 'linear' }, repeat: 1, pingpong: false,
  };
}
