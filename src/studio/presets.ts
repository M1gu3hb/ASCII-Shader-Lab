import { CHARSETS, charsetById } from '../engine/catalog';
import { defaultRecipe, DEFAULT_LAYER, normalizeRecipe, type Layer, type Recipe } from '../engine/recipe';
import type { SpaceId } from '../random/spaces';

type Patch = {
  [K in keyof Recipe]?: K extends 'layers' ? Array<Partial<Layer>> : Recipe[K] extends object ? Partial<Recipe[K]> : Recipe[K];
};

export interface Preset { id: string; name: string; make: (base?: Recipe) => Recipe }

const cs = (id: string) => charsetById(id)?.chars ?? CHARSETS[0].chars;

function mk(p: Patch, keep?: (base: Recipe, r: Recipe) => void) {
  return (base?: Recipe): Recipe => {
    const r = defaultRecipe();
    for (const k of Object.keys(p) as Array<keyof Recipe>) {
      const v = p[k];
      if (k === 'layers') r.layers = (v as Array<Partial<Layer>>).map(l => ({ ...DEFAULT_LAYER, ...l }));
      else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(r[k] as object, v);
      else (r as unknown as Record<string, unknown>)[k] = v;
    }
    if (base && keep) keep(base, r);
    return normalizeRecipe(r);
  };
}

const keepMedia = (b: Recipe, r: Recipe) => {
  if (['image', 'video', 'camera'].includes(b.source)) { r.source = b.source; r.media = { ...b.media, mix: r.media.mix, blend: r.media.blend, reveal: r.media.reveal }; }
};
const keepText = (b: Recipe, r: Recipe) => {
  if (b.source === 'text' && b.text.content.trim()) r.text.content = b.text.content;
};

export const PRESETS: Record<Exclude<SpaceId, 'componentes'>, Preset[]> = {
  fondos: [
    { id: 'bruma', name: 'Bruma', make: mk({ layers: [{ pattern: 'nube', scale: 0.8, a: 0.35, b: 0.2 }], motion: { speed: 0.35, warp: 0.3 }, glyph: { cell: 14, charset: cs('minimo'), font: 'plex', weight: 300 }, color: { stops: ['#1a1d22', '#6f7682'], bg: '#0d0f12' }, interact: { mode: 'light', strength: 0.35, radius: 0.2 }, fx: { vig: 0.3 } }) },
    { id: 'papel-vivo', name: 'Papel vivo', make: mk({ layers: [{ pattern: 'trama', a: 0.3, b: 0.6 }], motion: { speed: 0.4 }, glyph: { cell: 13, charset: cs('puntos') }, color: { stops: ['#e6dfd0', '#b9ae9b', '#6d6556'], bg: '#f2ecdf' }, interact: { mode: 'repel', strength: 0.5, radius: 0.2 } }) },
    { id: 'marea', name: 'Marea', make: mk({ layers: [{ pattern: 'ondas', a: 0.2, b: 0.5 }, { pattern: 'interferencia', blend: 'multiply', mix: 0.5, scale: 0.7 }], motion: { speed: 0.5 }, glyph: { cell: 12, charset: cs('suave') }, color: { stops: ['#0f2a4a', '#3f6d9e', '#a7c2e0'], bg: '#0a1f3a' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.15 } }) },
    { id: 'constelacion', name: 'Constelación', make: mk({ layers: [{ pattern: 'estrellas', a: 0.3, b: 0.4 }, { pattern: 'nube', blend: 'screen', mix: 0.35, scale: 0.6 }], motion: { speed: 0.4 }, glyph: { cell: 12, charset: cs('estrellas') }, color: { stops: ['#1b1638', '#5a4f9c', '#d9d4ff'], bg: '#080614' }, interact: { mode: 'swirl', strength: 0.5, radius: 0.22 }, fx: { glow: 0.3 } }) },
    { id: 'reticula', name: 'Retícula', make: mk({ layers: [{ pattern: 'hex', a: 0.25, b: 0.2 }], motion: { speed: 0.45 }, glyph: { cell: 13, charset: cs('cajas') }, color: { stops: ['#1b1a18', '#595347', '#b8ad97'], bg: '#0f0e0c' }, interact: { mode: 'lens', strength: 0.6, radius: 0.2 } }) },
    { id: 'ambar-lento', name: 'Ámbar lento', make: mk({ layers: [{ pattern: 'crestas', a: 0.3, b: 0.3 }], motion: { speed: 0.3, warp: 0.2 }, glyph: { cell: 12, charset: cs('clasico') }, color: { stops: ['#2a1600', '#8a5a14', '#d9a55a'], bg: '#110900' }, interact: { mode: 'light', strength: 0.4, radius: 0.18 }, fx: { vig: 0.4 } }) },
  ],
  arte: [
    { id: 'bermellon', name: 'Bermellón', make: mk({ layers: [{ pattern: 'marmol', a: 0.45, b: 0.35, scale: 0.9 }, { pattern: 'anillos', blend: 'multiply', mix: 0.55, scale: 0.8, a: 0.25, b: 0.3 }], motion: { speed: 0.6 }, glyph: { cell: 11, charset: cs('detallado'), font: 'jetbrains', weight: 500 }, color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.35, vig: 0.45, bloom: 0.25 } }) },
    { id: 'dona', name: 'Dona', make: mk({ layers: [{ pattern: 'dona', a: 0.4, b: 0.5 }, { pattern: 'estrellas', blend: 'screen', mix: 0.5, scale: 1.2 }], motion: { speed: 0.9 }, glyph: { cell: 9, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#0c1b12', '#3fd17f', '#e8fff0'], bg: '#030805' }, interact: { mode: 'lens', strength: 0.5, radius: 0.18 }, fx: { bloom: 0.5, glow: 0.3, vig: 0.4 } }) },
    { id: 'hiperespacio', name: 'Hiperespacio', make: mk({ layers: [{ pattern: 'hiper', a: 0.6, b: 0.4 }, { pattern: 'galaxia', blend: 'screen', mix: 0.45, scale: 1.4 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#110b2b', '#6a3cff', '#7fe7ff', '#ffffff'], bg: '#04020c' }, interact: { mode: 'swirl', strength: 0.6, radius: 0.25 }, fx: { bloom: 0.8, glow: 0.4, vig: 0.5 } }) },
    { id: 'optica', name: 'Óptica', make: mk({ layers: [{ pattern: 'moire', a: 0.3, b: 0.6 }, { pattern: 'anillos', blend: 'difference', mix: 1, a: 0.3, b: 0.9 }], motion: { speed: 0.6 }, glyph: { cell: 9, charset: cs('bloques'), font: 'martian', weight: 700 }, tone: { contrast: 1.6, levels: 3 }, color: { stops: ['#0a0a0a', '#f2f2f2'], bg: '#050505' }, interact: { mode: 'lens', strength: 0.8, radius: 0.22 } }) },
    { id: 'magma', name: 'Magma', make: mk({ layers: [{ pattern: 'fuego', a: 0.5, b: 0.6 }, { pattern: 'crestas', blend: 'overlay', mix: 0.5, scale: 1.3 }], motion: { speed: 0.9, warp: 0.2 }, glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#12030a', '#8a0f2e', '#ff5a1f', '#ffd166', '#fff7e0'], bg: '#050103' }, interact: { mode: 'paint', strength: 0.6, radius: 0.12 }, fx: { bloom: 0.7, glow: 0.4 } }) },
    { id: 'julia', name: 'Julia', make: mk({ layers: [{ pattern: 'julia', a: 0.35, b: 0.4 }], motion: { speed: 0.7 }, glyph: { cell: 8, charset: cs('braille'), font: 'jetbrains' }, color: { stops: ['#0b1026', '#1f6f9f', '#57f0a2', '#d6a3ff'], bg: '#03050f', cycle: 0.05 }, interact: { mode: 'lens', strength: 0.7, radius: 0.2 }, fx: { glow: 0.3, bloom: 0.4 } }) },
    { id: 'vapor', name: 'Vapor', make: mk({ layers: [{ pattern: 'rejilla', a: 0.5, b: 0.4 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: cs('clasico'), font: 'space' }, color: { stops: ['#2a1b5c', '#ff71ce', '#01cdfe', '#fffb96'], bg: '#130a2b', map: 'y' }, interact: { mode: 'ripple', strength: 0.5, radius: 0.15 }, fx: { glow: 0.5, bloom: 0.6, scan: 0.35, vig: 0.4 } }) },
    { id: 'corrupto', name: 'Corrupto', make: mk({ layers: [{ pattern: 'glitch', a: 0.5, b: 0.5 }, { pattern: 'ruido', blend: 'difference', mix: 0.3 }], motion: { speed: 1, hold: 10 }, glyph: { cell: 10, charset: cs('hex'), font: 'vt', mode: 'density' }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f' }, interact: { mode: 'scramble', strength: 0.8, radius: 0.2 }, fx: { chroma: 0.6, scan: 0.4, flicker: 0.3, grain: 0.2 } }) },
  ],
  media: [
    { id: 'retrato', name: 'Retrato', make: mk({ source: 'image', layers: [{ pattern: 'nube' }], glyph: { cell: 8, charset: cs('detallado'), edge: 0.25 }, color: { mode: 'source', stops: ['#1d1b18', '#ede6da'], bg: '#0b0a09', vivid: 0.55 }, interact: { mode: 'lens', strength: 0.6, radius: 0.18 }, fx: { vig: 0.3 } }, keepMedia) },
    { id: 'periodico', name: 'Periódico', make: mk({ source: 'image', glyph: { cell: 7, charset: cs('clasico'), dither: 0.7, font: 'plex' }, tone: { contrast: 1.25 }, color: { stops: ['#e2ddd3', '#4d4a45', '#0f0f0f'], bg: '#ebe7df' }, interact: { mode: 'erase', strength: 0.7, radius: 0.12 }, fx: { grain: 0.15 } }, keepMedia) },
    { id: 'fosforo', name: 'Fósforo', make: mk({ source: 'image', glyph: { cell: 9, aspect: 1.7, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, interact: { mode: 'scramble', strength: 0.6, radius: 0.15 }, fx: { scan: 0.6, curve: 0.45, vig: 0.6, bloom: 0.5 } }, keepMedia) },
    { id: 'bloques', name: 'Bloques', make: mk({ source: 'image', glyph: { cell: 14, aspect: 1.1, charset: cs('bloques'), font: 'jetbrains' }, color: { mode: 'source', vivid: 0.8, stops: ['#000000', '#ffffff'], bg: '#050505' }, interact: { mode: 'repel', strength: 0.5, radius: 0.18 }, fx: { cellBg: 0.35 } }, keepMedia) },
    { id: 'contornos', name: 'Contornos', make: mk({ source: 'image', glyph: { cell: 8, mode: 'lines', edge: 0.55, charset: cs('clasico') }, color: { stops: ['#ffffff'], bg: '#0a0a0a' }, interact: { mode: 'light', strength: 0.5, radius: 0.2 } }, keepMedia) },
    { id: 'revelado', name: 'Revelado', make: mk({ source: 'image', glyph: { cell: 10, charset: cs('suave') }, color: { stops: ['#1b0f2e', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'erase', strength: 0.8, radius: 0.12 }, media: { reveal: 0 } }, keepMedia) },
  ],
  tipo: [
    { id: 'trama', name: 'Trama', make: mk({ source: 'text', text: { content: 'TRAMA', font: 'martian', weight: 800, size: 0.95 }, layers: [{ pattern: 'franjas', a: 0.25, b: 0.35 }], media: { mix: 0.55, blend: 'multiply' }, tone: { contrast: 1.45, gamma: 0.9 }, glyph: { cell: 9, charset: cs('clasico'), edge: 0.3 }, color: { stops: ['#e4dccb', '#8a8173', '#1c1a17'], bg: '#f2ecdf' }, interact: { mode: 'repel', strength: 0.5, radius: 0.15 } }, keepText) },
    { id: 'neon', name: 'Neón', make: mk({ source: 'text', text: { content: 'SEÑAL', font: 'sans', weight: 900, size: 0.9 }, layers: [{ pattern: 'plasma', a: 0.4, b: 0.5 }], media: { mix: 0.7, blend: 'multiply' }, glyph: { cell: 8, charset: cs('detallado') }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f', map: 'x' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.6, bloom: 0.6 } }, keepText) },
    { id: 'descifrar', name: 'Descifrar', make: mk({ source: 'text', text: { content: 'ECO', font: 'serif', weight: 400, italic: true, size: 1 }, layers: [{ pattern: 'nube', scale: 0.8 }], media: { mix: 0.5, blend: 'multiply' }, glyph: { cell: 9, charset: cs('letras'), font: 'plex' }, color: { stops: ['#dfe3ea', '#4a6fa5', '#10245a'], bg: '#f4f5f2' }, msg: { on: true, text: 'lo que se escribe también se borra', mode: 'decode', y: 0.88, box: 0.9, speed: 16 }, interact: { mode: 'scramble', strength: 0.7, radius: 0.15 } }, keepText) },
    { id: 'maquina', name: 'Máquina', make: mk({ source: 'pattern', layers: [{ pattern: 'nube', a: 0.4 }], glyph: { cell: 12, charset: cs('clasico'), font: 'vt' }, color: { stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600' }, msg: { on: true, text: 'Querida persona que lee:\nesto se escribe solo,\nletra por letra,\ny luego se borra.', mode: 'type', speed: 14, box: 0.92, align: 'left', x: 0.5, y: 0.5 }, interact: { mode: 'light', strength: 0.4, radius: 0.2 }, fx: { scan: 0.3, vig: 0.5, bloom: 0.4 } }) },
    { id: 'disolver', name: 'Disolver', make: mk({ source: 'text', text: { content: 'LUZ', font: 'martian', weight: 800, size: 0.9, morph: 8 }, layers: [{ pattern: 'causticas', a: 0.4, b: 0.4 }], glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#041a24', '#0f7a6b', '#57f0a2', '#d6a3ff'], bg: '#020b10' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.4 } }, keepText) },
    { id: 'palabras', name: 'Palabras', make: mk({ source: 'text', text: { content: 'HOLA', font: 'sans', weight: 900 }, glyph: { cell: 9, mode: 'words', words: 'HOLA MUNDO · HELLO WORLD · OLÁ MUNDO · ', font: 'martian', weight: 700 }, color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'lens', strength: 0.6, radius: 0.18 } }, keepText) },
  ],
  terminal: [
    { id: 'consola', name: 'Consola', make: mk({ layers: [{ pattern: 'lluvia', a: 0.4, b: 0.4 }], glyph: { cell: 10, aspect: 2, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, msg: { on: true, text: '> hola, terminal', mode: 'type', x: 0.06, y: 0.9, align: 'left', box: 0.95, speed: 12 }, interact: { mode: 'scramble', strength: 0.6, radius: 0.2 }, fx: { scan: 0.5, curve: 0.35, vig: 0.5, bloom: 0.4 } }) },
    { id: 'donut', name: 'donut.c', make: mk({ layers: [{ pattern: 'dona', a: 0.3, b: 0.5 }], glyph: { cell: 9, aspect: 2, charset: '.,-~:;=!*#$@'.replace(/^/, ' '), font: 'jetbrains', sort: false }, color: { stops: ['#ffffff'], bg: '#0a0a0a' }, motion: { speed: 1 }, interact: { mode: 'none' } }) },
    { id: 'radar', name: 'Radar', make: mk({ layers: [{ pattern: 'radar', a: 0.4, b: 0.3 }], glyph: { cell: 10, aspect: 2, charset: cs('clasico'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, fx: { scan: 0.4, bloom: 0.5, vig: 0.4 }, interact: { mode: 'light', strength: 0.3 } }) },
    { id: 'ecualizador', name: 'Ecualizador', make: mk({ layers: [{ pattern: 'ecualizador', a: 0.4, b: 0.3 }], glyph: { cell: 10, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f', map: 'y' }, motion: { hold: 12 }, fx: { bloom: 0.4 } }) },
    { id: 'ambar', name: 'Ámbar', make: mk({ layers: [{ pattern: 'plasma', a: 0.3, b: 0.4 }], glyph: { cell: 10, aspect: 2, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600' }, fx: { scan: 0.6, curve: 0.4, vig: 0.6, bloom: 0.5, flicker: 0.2 }, interact: { mode: 'ripple', strength: 0.5 } }) },
    { id: 'cubo', name: 'Cubo', make: mk({ layers: [{ pattern: 'cubo', a: 0.2, b: 0.7 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#8ac7ff', '#ffffff'], bg: '#050a12' }, interact: { mode: 'none' } }) },
  ],
};

export function presetsFor(space: SpaceId): Preset[] {
  return space === 'componentes' ? PRESETS.fondos : PRESETS[space];
}

const ASCII_ONLY = /^[\x20-\x7e]*$/;

export function spaceAccepts(space: SpaceId, r: Recipe): boolean {
  switch (space) {
    case 'fondos': return r.source === 'pattern';
    case 'arte': return r.source === 'pattern' || r.source === 'text';
    case 'media': return r.source === 'image' || r.source === 'video' || r.source === 'camera';
    case 'tipo': return r.source === 'text' || r.msg.on;
    case 'terminal': return r.glyph.aspect >= 1.7 && ASCII_ONLY.test(r.glyph.charset);
    default: return true;
  }
}

/**
 * Where a piece opened from a file goes: the space it records; else the current one if it fits there;
 * else Imagen for a photo, a video or the camera (the next «Azar» elsewhere would drop the file).
 */
export function spaceForOpened(r: Recipe, current: SpaceId): SpaceId {
  const recorded = r.meta.space as SpaceId | undefined;
  if (recorded && recorded !== 'componentes' && PRESETS[recorded]) return recorded;
  if (current !== 'componentes' && spaceAccepts(current, r)) return current;
  if (spaceAccepts('media', r)) return 'media';
  return current === 'componentes' ? 'arte' : current;
}

export function starterFor(space: SpaceId): Recipe {
  return presetsFor(space)[0].make();
}
