import { CHARSETS, charsetById } from '../engine/catalog';
import { defaultRecipe, DEFAULT_LAYER, normalizeRecipe, type Layer, type Recipe, type Xform, type XformKind } from '../engine/recipe';
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
  if (['image', 'video', 'camera'].includes(b.source)) {
    // the photo and its framing stay; the recipe brings its own mix and transformations (or none)
    const xf = r.media.xform;
    r.source = b.source;
    r.media = { ...b.media, mix: r.media.mix, blend: r.media.blend, reveal: r.media.reveal };
    if (xf?.length) r.media.xform = xf; else delete r.media.xform;
  }
};
const X = (kind: XformKind, amount: number, p: number): Xform => ({ kind, on: true, amount, p });
const keepText = (b: Recipe, r: Recipe) => {
  if (b.source === 'text' && b.text.content.trim()) r.text.content = b.text.content;
};

export const PRESETS: Record<Exclude<SpaceId, 'componentes'>, Preset[]> = {
  fondos: [
    { id: 'mareas-de-seda', name: 'Mareas de seda', make: mk({ layers: [{ pattern: 'mareas_lentas', a: .32, b: .55 }], glyph: { cell: 12, charset: cs('suave') }, color: { stops: ['#132338', '#527997', '#c5dad9'], bg: '#081525' }, motion: { speed: .24 }, fx: { vig: .22 } }) },
    { id: 'arena-zen', name: 'Arena zen', make: mk({ layers: [{ pattern: 'jardin_zen', a: .43, b: .55 }], glyph: { cell: 11, charset: cs('lineas') }, color: { stops: ['#514b46', '#bca990', '#f4e5c8'], bg: '#2b2929' }, motion: { speed: .2 } }) },
    { id: 'niebla-en-capas', name: 'Niebla en capas', make: mk({ layers: [{ pattern: 'bruma_lejana', a: .48, b: .42 }], glyph: { cell: 13, charset: cs('medios') }, color: { stops: ['#344357', '#839ba7', '#e8ebdc'], bg: '#101a28' }, motion: { speed: .25 }, fx: { vig: .18 } }) },
    { id: 'luciernagas-noche', name: 'Luciérnagas', make: mk({ layers: [{ pattern: 'luciernagas', a: .45, b: .65 }], glyph: { cell: 8, charset: cs('puntos') }, color: { stops: ['#163229', '#77be82', '#f9e8a9'], bg: '#07151a' }, motion: { speed: .6 }, fx: { glow: .27 } }) },
    { id: 'lluvia-estanque', name: 'Lluvia en el estanque', make: mk({ layers: [{ pattern: 'lluvia_mansa', a: .52, b: .4 }], glyph: { cell: 9, charset: cs('puntos') }, color: { stops: ['#162a32', '#65999b', '#d7e7de'], bg: '#091721' }, motion: { speed: .5 } }) },
    { id: 'bambu-tinta', name: 'Bambú en tinta', make: mk({ layers: [{ pattern: 'bambu', a: .32, b: .52 }], glyph: { cell: 8, charset: cs('lineas') }, color: { stops: ['#233d2e', '#749976', '#d9dec7'], bg: '#101d19' }, motion: { speed: .35 } }) },
    { id: 'aire-respira', name: 'Aire que respira', make: mk({ layers: [{ pattern: 'respiracion', a: .38, b: .5 }], glyph: { cell: 10, charset: cs('suave') }, color: { stops: ['#2b3150', '#8d9bbf', '#e6e3ed'], bg: '#151928' }, motion: { speed: .42 }, fx: { glow: .12 } }) },
    { id: 'estuarios', name: 'Estuarios', make: mk({ layers: [{ pattern: 'estuario', a: .35, b: .52 }], glyph: { cell: 11, charset: cs('suave') }, color: { stops: ['#143738', '#58948f', '#dbdcbb'], bg: '#071d24' }, motion: { speed: .28 } }) },
    { id: 'corrientes-de-aire', name: 'Corrientes de aire', make: mk({ layers: [{ pattern: 'campo_flujo', a: .41, b: .3 }], glyph: { cell: 11, charset: cs('lineas') }, color: { stops: ['#1e3451', '#789abb', '#d8e7e9'], bg: '#0a1a2e' }, motion: { speed: .35 } }) },
    { id: 'curvas-terreno', name: 'Curvas de terreno', make: mk({ layers: [{ pattern: 'topografia', a: 0.48, b: 0.38 }], glyph: { cell: 11, charset: cs('lineas'), font: 'plex' }, color: { stops: ['#141c20', '#40606a', '#c6dac8'], bg: '#081015' }, motion: { speed: 0.24 }, fx: { vig: 0.2 }, interact: { mode: 'lens', strength: 0.3 } }) },
    { id: 'dunas-de-viento', name: 'Dunas de viento', make: mk({ layers: [{ pattern: 'dunas', a: 0.36, b: 0.54 }], glyph: { cell: 12, charset: cs('suave'), font: 'plex' }, color: { stops: ['#4b2f3a', '#cb7867', '#f0c5a3'], bg: '#1d1624' }, motion: { speed: 0.2 }, fx: { vig: 0.23 }, interact: { mode: 'ripple', strength: 0.24 } }) },
    { id: 'tela-quieta', name: 'Tela quieta', make: mk({ layers: [{ pattern: 'entrelazado', a: 0.32, b: 0.4 }], glyph: { cell: 13, charset: cs('cajas'), font: 'martian' }, color: { stops: ['#2d2527', '#bc8a79', '#ede0cf'], bg: '#15151b' }, motion: { speed: 0.18 }, fx: { grain: 0.08 }, interact: { mode: 'repel', strength: 0.24 } }) },
    { id: 'placa-electronica', name: 'Placa electrónica', make: mk({ layers: [{ pattern: 'circuitos', a: 0.32, b: 0.5 }], glyph: { cell: 10, charset: cs('simbolos'), font: 'jetbrains' }, color: { stops: ['#071a21', '#198f83', '#b2f7d7'], bg: '#040d12' }, motion: { speed: 0.4 }, fx: { glow: 0.28, vig: 0.35 }, interact: { mode: 'light', strength: 0.35 } }) },
    { id: 'bruma', name: 'Bruma', make: mk({ layers: [{ pattern: 'nube', scale: 0.8, a: 0.35, b: 0.2 }], motion: { speed: 0.35, warp: 0.3 }, glyph: { cell: 14, charset: cs('minimo'), font: 'plex', weight: 300 }, color: { stops: ['#1a1d22', '#6f7682'], bg: '#0d0f12' }, interact: { mode: 'light', strength: 0.35, radius: 0.2 }, fx: { vig: 0.3 } }) },
    { id: 'papel-vivo', name: 'Papel vivo', make: mk({ layers: [{ pattern: 'trama', a: 0.3, b: 0.6 }], motion: { speed: 0.4 }, glyph: { cell: 13, charset: cs('puntos') }, color: { stops: ['#e6dfd0', '#b9ae9b', '#6d6556'], bg: '#f2ecdf' }, interact: { mode: 'repel', strength: 0.5, radius: 0.2 } }) },
    { id: 'marea', name: 'Marea', make: mk({ layers: [{ pattern: 'ondas', a: 0.2, b: 0.5 }, { pattern: 'interferencia', blend: 'multiply', mix: 0.5, scale: 0.7 }], motion: { speed: 0.5 }, glyph: { cell: 12, charset: cs('suave') }, color: { stops: ['#0f2a4a', '#3f6d9e', '#a7c2e0'], bg: '#0a1f3a' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.15 } }) },
    { id: 'constelacion', name: 'Constelación', make: mk({ layers: [{ pattern: 'estrellas', a: 0.3, b: 0.4 }, { pattern: 'nube', blend: 'screen', mix: 0.35, scale: 0.6 }], motion: { speed: 0.4 }, glyph: { cell: 12, charset: cs('estrellas') }, color: { stops: ['#1b1638', '#5a4f9c', '#d9d4ff'], bg: '#080614' }, interact: { mode: 'swirl', strength: 0.5, radius: 0.22 }, fx: { glow: 0.3 } }) },
    { id: 'reticula', name: 'Retícula', make: mk({ layers: [{ pattern: 'hex', a: 0.25, b: 0.2 }], motion: { speed: 0.45 }, glyph: { cell: 13, charset: cs('cajas') }, color: { stops: ['#1b1a18', '#595347', '#b8ad97'], bg: '#0f0e0c' }, interact: { mode: 'lens', strength: 0.6, radius: 0.2 } }) },
    { id: 'ambar-lento', name: 'Ámbar lento', make: mk({ layers: [{ pattern: 'crestas', a: 0.3, b: 0.3 }], motion: { speed: 0.3, warp: 0.2 }, glyph: { cell: 12, charset: cs('clasico') }, color: { stops: ['#2a1600', '#8a5a14', '#d9a55a'], bg: '#110900' }, interact: { mode: 'light', strength: 0.4, radius: 0.18 }, fx: { vig: 0.4 } }) },
    // a planet at the side, leaving the middle to the page's content
    { id: 'orbita', name: 'Órbita', make: mk({ layers: [{ pattern: 'planeta', a: 0.45, b: 0.25, x: 0.55, y: -0.06, scale: 0.72, speed: 0.6 }, { pattern: 'estrellas', blend: 'screen', mix: 0.35, a: 0.2, b: 0.3 }], motion: { speed: 0.35 }, glyph: { cell: 11, charset: cs('puntos'), font: 'plex', weight: 300 }, color: { stops: ['#211e3b', '#625b99', '#cbc5f2'], bg: '#0b0a16' }, interact: { mode: 'swirl', strength: 0.35, radius: 0.22 }, fx: { vig: 0.35 } }) },
    { id: 'relieve', name: 'Relieve', make: mk({ layers: [{ pattern: 'voxeles', a: 0.3, b: 0.2, speed: 0.6 }], motion: { speed: 0.4 }, glyph: { cell: 10, charset: cs('lineas'), font: 'jetbrains', weight: 300 }, color: { stops: ['#18222b', '#40566a', '#8fa8bb'], bg: '#0c1116' }, interact: { mode: 'light', strength: 0.35, radius: 0.2 }, fx: { vig: 0.3 } }) },
  ],
  arte: [
    { id: 'infinito-de-bern', name: 'Infinito de Bernoulli', make: mk({ layers: [{ pattern: 'lemniscata', a: .52, b: .35 }], glyph: { cell: 7, charset: cs('lineas') }, color: { stops: ['#1a3a46', '#82c1bf', '#f4e7ca'], bg: '#071a23' }, motion: { speed: .22 } }) },
    { id: 'gielis', name: 'Superfórmula', make: mk({ layers: [{ pattern: 'superformula', a: .48, b: .67 }], glyph: { cell: 7, charset: cs('puntos') }, color: { stops: ['#263352', '#9b89c7', '#eee4e9'], bg: '#101325' }, motion: { speed: .55 } }) },
    { id: 'pendulo-de-tinta', name: 'Armonógrafo de tinta', make: mk({ layers: [{ pattern: 'armonografo', a: .48, b: .36 }], glyph: { cell: 6, charset: cs('lineas') }, color: { stops: ['#3c2d3b', '#b182a1', '#f5dace'], bg: '#160f1c' }, motion: { speed: .38 }, fx: { glow: .16 } }) },
    { id: 'cadenas-suspendidas', name: 'Cadenas suspendidas', make: mk({ layers: [{ pattern: 'catenaria', a: .42, b: .38 }], glyph: { cell: 7, charset: cs('clasico') }, color: { stops: ['#3a434d', '#9cadb4', '#f0eacb'], bg: '#131b22' }, motion: { speed: .3 } }) },
    { id: 'circulos-anidados', name: 'Círculos anidados', make: mk({ layers: [{ pattern: 'apolonio', a: .38, b: .46 }], glyph: { cell: 7, charset: cs('puntos') }, color: { stops: ['#293322', '#9aaf7e', '#fff3c8'], bg: '#10170f' }, motion: { speed: .24 } }) },
    { id: 'flor-harmonica', name: 'Flor armónica', make: mk({ layers: [{ pattern: 'flor_armonica', a: .34, b: .42 }], glyph: { cell: 7, charset: cs('suave') }, color: { stops: ['#352d55', '#a88bbd', '#f1dde5'], bg: '#171328' }, motion: { speed: .48 }, fx: { glow: .15 } }) },
    { id: 'estrella-de-mar', name: 'Estrella de mar', make: mk({ layers: [{ pattern: 'estrella_mar', a: .38, b: .45 }], glyph: { cell: 7, charset: cs('puntos') }, color: { stops: ['#2d4c5c', '#f19c83', '#ffe2b6'], bg: '#091e2a' }, motion: { speed: .45 } }) },
    { id: 'simbiosis-viva', name: 'Simbiosis viva', make: mk({ layers: [{ pattern: 'simbiosis', a: .45, b: .63 }], glyph: { cell: 7, charset: cs('detallado') }, color: { stops: ['#20445e', '#7ee3cf', '#f6edd2'], bg: '#071521' }, motion: { speed: .85 }, fx: { glow: .2 } }) },
    { id: 'pendulos-cineticos', name: 'Péndulos cinéticos', make: mk({ layers: [{ pattern: 'pendulos', a: .55, b: .5 }], glyph: { cell: 7, charset: cs('clasico') }, color: { stops: ['#363748', '#c19a83', '#fff0d8'], bg: '#141522' }, motion: { speed: .9 } }) },
    { id: 'cinta-luminosa', name: 'Cinta luminosa', make: mk({ layers: [{ pattern: 'cinta_ola', a: .5, b: .4 }], glyph: { cell: 7, charset: cs('suave') }, color: { stops: ['#263056', '#7fb5da', '#eef2f5'], bg: '#0c1026' }, motion: { speed: .75 }, fx: { glow: .3 } }) },
    { id: 'jade-palpitante', name: 'Jade palpitante', make: mk({ layers: [{ pattern: 'jade_vivo', a: .52, b: .75 }], glyph: { cell: 7, charset: cs('detallado') }, color: { stops: ['#204234', '#6cb793', '#e1f3c7'], bg: '#091b17' }, motion: { speed: .64 } }) },
    { id: 'caliz-ceramico', name: 'Cáliz cerámico', make: mk({ layers: [{ pattern: 'caliz', a: .48, b: .3 }], glyph: { cell: 7, charset: cs('clasico') }, color: { stops: ['#3b3442', '#ad97a5', '#fff0d7'], bg: '#14131c' }, motion: { speed: .35 } }) },
    { id: 'medusa-biologica', name: 'Medusa bioluminiscente', make: mk({ layers: [{ pattern: 'medusa', a: .53, b: .46 }], glyph: { cell: 6, charset: cs('puntos') }, color: { stops: ['#1f3963', '#74c5de', '#e4eeec'], bg: '#061224' }, motion: { speed: .55 }, fx: { glow: .3 } }) },
    { id: 'orbitales-pacificas', name: 'Orbitales pacíficas', make: mk({ layers: [{ pattern: 'esferas_orbita', a: .47, b: .55 }], glyph: { cell: 7, charset: cs('clasico') }, color: { stops: ['#262b48', '#8e9dd7', '#f5e9c9'], bg: '#0d1121' }, motion: { speed: .65 } }) },
    { id: 'espiral-semillas', name: 'Jardín de semillas', make: mk({ layers: [{ pattern: 'filotaxis', a: 0.5, b: 0.68 }], glyph: { cell: 8, charset: cs('puntos'), font: 'plex' }, color: { stops: ['#143727', '#70b388', '#f6e8aa'], bg: '#07180f' }, motion: { speed: 0.4 }, fx: { glow: 0.25, vig: 0.35 }, interact: { mode: 'swirl', strength: 0.35 } }) },
    { id: 'mandelbrot-azul', name: 'Atlas de Mandelbrot', make: mk({ layers: [{ pattern: 'mandelbrot', a: 0.28, b: 0.7 }], glyph: { cell: 7, charset: cs('detallado'), font: 'jetbrains' }, color: { stops: ['#080f28', '#194489', '#40b9c8', '#fcdda4'], bg: '#030611' }, motion: { speed: 0.35 }, fx: { glow: 0.23, vig: 0.34 }, interact: { mode: 'lens', strength: 0.5 } }) },
    { id: 'tapiz-infinito', name: 'Tapiz infinito', make: mk({ layers: [{ pattern: 'sierpinski', a: 0.45, b: 0.55 }], glyph: { cell: 8, charset: cs('bloques'), font: 'jetbrains' }, color: { stops: ['#331c2b', '#dc6a66', '#f4d5b1'], bg: '#150d19' }, motion: { speed: 0.35 }, fx: { grain: 0.08 }, interact: { mode: 'lens', strength: 0.48 } }) },
    { id: 'cinco-ejes', name: 'Cinco ejes', make: mk({ layers: [{ pattern: 'quasicristal', a: 0.52, b: 0.76 }], glyph: { cell: 8, charset: cs('geometria'), font: 'martian' }, color: { stops: ['#1a1634', '#8d66e8', '#eacffb'], bg: '#090715' }, motion: { speed: 0.38 }, fx: { glow: 0.3, bloom: 0.26 }, interact: { mode: 'swirl', strength: 0.35 } }) },
    { id: 'curvas-de-tinta', name: 'Curvas de tinta', make: mk({ layers: [{ pattern: 'espirografo', a: 0.34, b: 0.46 }], glyph: { cell: 7, charset: cs('lineas'), font: 'jetbrains' }, color: { stops: ['#1b2026', '#486881', '#b9d2d3'], bg: '#070d12' }, motion: { speed: 0.35 }, fx: { glow: 0.16 }, interact: { mode: 'lens', strength: 0.4 } }) },
    { id: 'obelisco-de-tinta', name: 'Obelisco de tinta', make: mk({ layers: [{ pattern: 'obelisco', a: 0.4, b: 0.45 }], glyph: { cell: 8, charset: cs('clasico'), font: 'plex' }, color: { stops: ['#28292d', '#a7b7bf', '#f6f0de'], bg: '#080b12' }, motion: { speed: 0.5 }, fx: { vig: 0.35 }, interact: { mode: 'light', strength: 0.4 } }) },
    { id: 'prisma-de-luz', name: 'Prisma de luz', make: mk({ layers: [{ pattern: 'prisma', a: 0.46, b: 0.6 }], glyph: { cell: 8, charset: cs('detallado'), font: 'jetbrains' }, color: { stops: ['#14204b', '#3874d6', '#bbecfa', '#f7f3dc'], bg: '#030a19' }, motion: { speed: 0.55 }, fx: { bloom: 0.4, glow: 0.3 }, interact: { mode: 'lens', strength: 0.45 } }) },
    { id: 'arena-en-suspension', name: 'Arena en suspensión', make: mk({ layers: [{ pattern: 'reloj_arena', a: 0.36, b: 0.75 }], glyph: { cell: 8, charset: cs('puntos'), font: 'plex' }, color: { stops: ['#272325', '#b09170', '#fff1cb'], bg: '#0c0b11' }, motion: { speed: 0.56 }, fx: { grain: 0.1, vig: 0.32 }, interact: { mode: 'light', strength: 0.35 } }) },
    { id: 'bermellon', name: 'Bermellón', make: mk({ layers: [{ pattern: 'marmol', a: 0.45, b: 0.35, scale: 0.9 }, { pattern: 'anillos', blend: 'multiply', mix: 0.55, scale: 0.8, a: 0.25, b: 0.3 }], motion: { speed: 0.6 }, glyph: { cell: 11, charset: cs('detallado'), font: 'jetbrains', weight: 500 }, color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.35, vig: 0.45, bloom: 0.25 } }) },
    { id: 'dona', name: 'Dona', make: mk({ layers: [{ pattern: 'dona', a: 0.4, b: 0.5 }, { pattern: 'estrellas', blend: 'screen', mix: 0.5, scale: 1.2 }], motion: { speed: 0.9 }, glyph: { cell: 9, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#0c1b12', '#3fd17f', '#e8fff0'], bg: '#030805' }, interact: { mode: 'lens', strength: 0.5, radius: 0.18 }, fx: { bloom: 0.5, glow: 0.3, vig: 0.4 } }) },
    { id: 'hiperespacio', name: 'Hiperespacio', make: mk({ layers: [{ pattern: 'hiper', a: 0.6, b: 0.4 }, { pattern: 'galaxia', blend: 'screen', mix: 0.45, scale: 1.4 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#110b2b', '#6a3cff', '#7fe7ff', '#ffffff'], bg: '#04020c' }, interact: { mode: 'swirl', strength: 0.6, radius: 0.25 }, fx: { bloom: 0.8, glow: 0.4, vig: 0.5 } }) },
    { id: 'optica', name: 'Óptica', make: mk({ layers: [{ pattern: 'moire', a: 0.3, b: 0.6 }, { pattern: 'anillos', blend: 'difference', mix: 1, a: 0.3, b: 0.9 }], motion: { speed: 0.6 }, glyph: { cell: 9, charset: cs('bloques'), font: 'martian', weight: 700 }, tone: { contrast: 1.6, levels: 3 }, color: { stops: ['#0a0a0a', '#f2f2f2'], bg: '#050505' }, interact: { mode: 'lens', strength: 0.8, radius: 0.22 } }) },
    { id: 'magma', name: 'Magma', make: mk({ layers: [{ pattern: 'fuego', a: 0.5, b: 0.6 }, { pattern: 'crestas', blend: 'overlay', mix: 0.5, scale: 1.3 }], motion: { speed: 0.9, warp: 0.2 }, glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#12030a', '#8a0f2e', '#ff5a1f', '#ffd166', '#fff7e0'], bg: '#050103' }, interact: { mode: 'paint', strength: 0.6, radius: 0.12 }, fx: { bloom: 0.7, glow: 0.4 } }) },
    { id: 'julia', name: 'Julia', make: mk({ layers: [{ pattern: 'julia', a: 0.35, b: 0.4 }], motion: { speed: 0.7 }, glyph: { cell: 8, charset: cs('braille'), font: 'jetbrains' }, color: { stops: ['#0b1026', '#1f6f9f', '#57f0a2', '#d6a3ff'], bg: '#03050f', cycle: 0.05 }, interact: { mode: 'lens', strength: 0.7, radius: 0.2 }, fx: { glow: 0.3, bloom: 0.4 } }) },
    { id: 'vapor', name: 'Vapor', make: mk({ layers: [{ pattern: 'rejilla', a: 0.5, b: 0.4 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: cs('clasico'), font: 'space' }, color: { stops: ['#2a1b5c', '#ff71ce', '#01cdfe', '#fffb96'], bg: '#130a2b', map: 'y' }, interact: { mode: 'ripple', strength: 0.5, radius: 0.15 }, fx: { glow: 0.5, bloom: 0.6, scan: 0.35, vig: 0.4 } }) },
    { id: 'corrupto', name: 'Corrupto', make: mk({ layers: [{ pattern: 'glitch', a: 0.5, b: 0.5 }, { pattern: 'ruido', blend: 'difference', mix: 0.3 }], motion: { speed: 1, hold: 10 }, glyph: { cell: 10, charset: cs('hex'), font: 'vt', mode: 'density' }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f' }, interact: { mode: 'scramble', strength: 0.8, radius: 0.2 }, fx: { chroma: 0.6, scan: 0.4, flicker: 0.3, grain: 0.2 } }) },
    { id: 'saturno', name: 'Saturno', make: mk({ layers: [{ pattern: 'planeta', a: 0.55, b: 0.3, speed: 0.8 }, { pattern: 'estrellas', blend: 'screen', mix: 0.55, scale: 1.3, a: 0.3, b: 0.5 }], motion: { speed: 0.7 }, glyph: { cell: 8, charset: cs('detallado'), font: 'plex', weight: 400 }, color: { stops: ['#15122b', '#b0703a', '#f2c98a', '#fff4dc'], bg: '#07060f' }, interact: { mode: 'swirl', strength: 0.4, radius: 0.22 }, fx: { bloom: 0.35, glow: 0.25, vig: 0.5 } }) },
    { id: 'nudo', name: 'Nudo de neón', make: mk({ layers: [{ pattern: 'nudo', a: 0.4, b: 0.1 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: cs('simbolos'), font: 'martian', weight: 600 }, tone: { contrast: 1.3 }, color: { stops: ['#1a0433', '#ff2e97', '#ffb3e1', '#39f3ff'], bg: '#07010f', map: 'angle', cycle: 0.04 }, interact: { mode: 'ripple', strength: 0.5, radius: 0.15 }, fx: { glow: 0.55, bloom: 0.7, vig: 0.45 } }) },
    { id: 'mercurio', name: 'Mercurio', make: mk({ layers: [{ pattern: 'metabolas', a: 0.55, b: 0.65 }], motion: { speed: 0.8 }, glyph: { cell: 7, charset: cs('braille'), font: 'jetbrains' }, tone: { contrast: 1.3 }, color: { stops: ['#141619', '#7d858f', '#e9edf2', '#ffffff'], bg: '#08090b' }, interact: { mode: 'lens', strength: 0.6, radius: 0.2 }, fx: { bloom: 0.3, vig: 0.4 } }) },
    { id: 'geoda', name: 'Geoda', make: mk({ layers: [{ pattern: 'cristales', a: 0.85, b: 0.7 }, { pattern: 'nube', blend: 'screen', mix: 0.3, scale: 0.7, a: 0.3 }], motion: { speed: 0.6 }, glyph: { cell: 8, charset: cs('geometria'), font: 'jetbrains' }, color: { stops: ['#061426', '#1f6f9f', '#7fe7ff', '#f0fdff'], bg: '#020913' }, interact: { mode: 'light', strength: 0.5, radius: 0.2 }, fx: { glow: 0.4, bloom: 0.6, chroma: 0.15, vig: 0.5 } }) },
    { id: 'mecanismo', name: 'Mecanismo', make: mk({ layers: [{ pattern: 'engranajes', a: 0.35, b: 0.35 }, { pattern: 'trama', blend: 'multiply', mix: 0.35, a: 0.4, b: 0.2 }], motion: { speed: 0.6 }, glyph: { cell: 8, charset: cs('clasico'), font: 'courier', edge: 0.4 }, tone: { contrast: 1.6, gamma: 0.85 }, color: { stops: ['#e4dccb', '#8a8173', '#1c1a17'], bg: '#f2ecdf' }, interact: { mode: 'erase', strength: 0.6, radius: 0.12 }, fx: { grain: 0.12 } }) },
    // the bases of DNA as the glyphs of the helix
    { id: 'helice', name: 'Doble hélice', make: mk({ layers: [{ pattern: 'adn', a: 0.45, b: 0.5 }], motion: { speed: 0.8 }, glyph: { cell: 9, charset: ' .:acgtACGT', sort: true, font: 'space' }, color: { stops: ['#0b2e24', '#2ee59d', '#d6ffe9'], bg: '#04110c', map: 'y' }, interact: { mode: 'scramble', strength: 0.5, radius: 0.18 }, fx: { glow: 0.35, bloom: 0.4 } }) },
    { id: 'coral', name: 'Coral', make: mk({ layers: [{ pattern: 'giroide', a: 0.3, b: 0.55 }], motion: { speed: 0.7, warp: 0.08 }, glyph: { cell: 8, charset: cs('suave'), font: 'plex', weight: 500 }, color: { stops: ['#2a0f14', '#c44d4d', '#ff8f7a', '#ffe1d6'], bg: '#12070a' }, interact: { mode: 'ripple', strength: 0.5, radius: 0.14 }, fx: { glow: 0.3, vig: 0.5 } }) },
  ],
  media: [
    { id: 'retrato', name: 'Retrato', make: mk({ source: 'image', layers: [{ pattern: 'nube' }], glyph: { cell: 8, charset: cs('detallado'), edge: 0.25 }, color: { mode: 'source', stops: ['#1d1b18', '#ede6da'], bg: '#0b0a09', vivid: 0.55 }, interact: { mode: 'lens', strength: 0.6, radius: 0.18 }, fx: { vig: 0.3 } }, keepMedia) },
    { id: 'periodico', name: 'Periódico', make: mk({ source: 'image', glyph: { cell: 7, charset: cs('clasico'), dither: 0.7, font: 'plex' }, tone: { contrast: 1.25 }, color: { stops: ['#e2ddd3', '#4d4a45', '#0f0f0f'], bg: '#ebe7df' }, interact: { mode: 'erase', strength: 0.7, radius: 0.12 }, fx: { grain: 0.15 } }, keepMedia) },
    { id: 'fosforo', name: 'Fósforo', make: mk({ source: 'image', glyph: { cell: 9, aspect: 1.7, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, interact: { mode: 'scramble', strength: 0.6, radius: 0.15 }, fx: { scan: 0.6, curve: 0.45, vig: 0.6, bloom: 0.5 } }, keepMedia) },
    { id: 'bloques', name: 'Bloques', make: mk({ source: 'image', glyph: { cell: 14, aspect: 1.1, charset: cs('bloques'), font: 'jetbrains' }, color: { mode: 'source', vivid: 0.8, stops: ['#000000', '#ffffff'], bg: '#050505' }, interact: { mode: 'repel', strength: 0.5, radius: 0.18 }, fx: { cellBg: 0.35 } }, keepMedia) },
    { id: 'contornos', name: 'Contornos', make: mk({ source: 'image', glyph: { cell: 8, mode: 'lines', edge: 0.55, charset: cs('clasico') }, color: { stops: ['#ffffff'], bg: '#0a0a0a' }, interact: { mode: 'light', strength: 0.5, radius: 0.2 } }, keepMedia) },
    { id: 'revelado', name: 'Revelado', make: mk({ source: 'image', glyph: { cell: 10, charset: cs('suave') }, color: { stops: ['#1b0f2e', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'erase', strength: 0.8, radius: 0.12 }, media: { reveal: 0 } }, keepMedia) },
    // transformations of the photo (engine/xform.ts)
    { id: 'serigrafia', name: 'Serigrafía', make: mk({ source: 'image', media: { xform: [X('bandas', 1, 0.08), X('semitono', 1, 0.12)] }, glyph: { cell: 7, aspect: 1.2, charset: cs('puntos'), font: 'jetbrains' }, color: { mode: 'source', vivid: 0.85, stops: ['#1d1b18', '#ede6da'], bg: '#0e0d0c' }, interact: { mode: 'lens', strength: 0.5, radius: 0.16 } }, keepMedia) },
    { id: 'neon', name: 'Neón', make: mk({ source: 'image', media: { xform: [X('contorno', 1, 0.45), X('canales', 0.5, 0.02)] }, glyph: { cell: 7, charset: cs('detallado'), font: 'jetbrains', weight: 600 }, tone: { contrast: 1.15 }, color: { mode: 'source', vivid: 1, stops: ['#0b0a09', '#ede6da'], bg: '#050405' }, interact: { mode: 'light', strength: 0.5, radius: 0.2 }, fx: { glow: 0.3, bloom: 0.45, vig: 0.35 } }, keepMedia) },
    { id: 'caleidoscopio', name: 'Caleidoscopio', make: mk({ source: 'image', media: { xform: [X('caleido', 1, 0.4), X('ondular', 0.3, 0.2)] }, glyph: { cell: 8, charset: cs('detallado'), font: 'jetbrains', weight: 500 }, tone: { contrast: 1.35, gamma: 0.75 }, color: { mode: 'source', vivid: 0.8, stops: ['#1d1b18', '#ede6da'], bg: '#0b0a09' }, interact: { mode: 'swirl', strength: 0.45, radius: 0.22 }, fx: { vig: 0.45, glow: 0.25 } }, keepMedia) },
    { id: 'ordenado', name: 'Píxel ordenado', make: mk({ source: 'image', media: { xform: [X('arrastre', 0.6, 0.25), X('canales', 0.45, 0.25)] }, glyph: { cell: 8, aspect: 1.5, charset: cs('hex'), font: 'vt' }, color: { mode: 'source', vivid: 0.9, stops: ['#1a0433', '#ff2e97'], bg: '#07010f' }, interact: { mode: 'scramble', strength: 0.6, radius: 0.16 }, fx: { scan: 0.35, chroma: 0.2, bloom: 0.35 } }, keepMedia) },
    { id: 'vidrio', name: 'Vidrio', make: mk({ source: 'image', layers: [{ pattern: 'causticas', a: 0.35, b: 0.45, scale: 1.1, speed: 0.6 }], media: { xform: [X('desplazar', 0.45, 0.15)] }, glyph: { cell: 8, charset: cs('clasico'), font: 'plex' }, color: { stops: ['#041a24', '#1f6f9f', '#7fe7ff', '#f0fdff'], bg: '#020b10' }, interact: { mode: 'ripple', strength: 0.5, radius: 0.14 }, fx: { glow: 0.3, vig: 0.4 } }, keepMedia) },
  ],
  tipo: [
    { id: 'trama', name: 'Trama', make: mk({ source: 'text', text: { content: 'TRAMA', font: 'martian', weight: 800, size: 0.95 }, layers: [{ pattern: 'franjas', a: 0.25, b: 0.35 }], media: { mix: 0.55, blend: 'multiply' }, tone: { contrast: 1.45, gamma: 0.9 }, glyph: { cell: 9, charset: cs('clasico'), edge: 0.3 }, color: { stops: ['#e4dccb', '#8a8173', '#1c1a17'], bg: '#f2ecdf' }, interact: { mode: 'repel', strength: 0.5, radius: 0.15 } }, keepText) },
    { id: 'neon', name: 'Neón', make: mk({ source: 'text', text: { content: 'SEÑAL', font: 'sans', weight: 900, size: 0.9 }, layers: [{ pattern: 'plasma', a: 0.4, b: 0.5 }], media: { mix: 0.7, blend: 'multiply' }, glyph: { cell: 8, charset: cs('detallado') }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f', map: 'x' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.6, bloom: 0.6 } }, keepText) },
    { id: 'descifrar', name: 'Descifrar', make: mk({ source: 'text', text: { content: 'ECO', font: 'serif', weight: 400, italic: true, size: 1 }, layers: [{ pattern: 'nube', scale: 0.8 }], media: { mix: 0.5, blend: 'multiply' }, glyph: { cell: 9, charset: cs('letras'), font: 'plex' }, color: { stops: ['#dfe3ea', '#4a6fa5', '#10245a'], bg: '#f4f5f2' }, msg: { on: true, text: 'lo que se escribe también se borra', mode: 'decode', y: 0.88, box: 0.9, speed: 16 }, interact: { mode: 'scramble', strength: 0.7, radius: 0.15 } }, keepText) },
    { id: 'maquina', name: 'Máquina', make: mk({ source: 'pattern', layers: [{ pattern: 'nube', a: 0.4 }], glyph: { cell: 12, charset: cs('clasico'), font: 'vt' }, color: { stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600' }, msg: { on: true, text: 'Querida persona que lee:\nesto se escribe solo,\nletra por letra,\ny luego se borra.', mode: 'type', speed: 14, box: 0.92, align: 'left', x: 0.5, y: 0.5 }, interact: { mode: 'light', strength: 0.4, radius: 0.2 }, fx: { scan: 0.3, vig: 0.5, bloom: 0.4 } }) },
    { id: 'disolver', name: 'Disolver', make: mk({ source: 'text', text: { content: 'LUZ', font: 'martian', weight: 800, size: 0.9, morph: 8 }, layers: [{ pattern: 'causticas', a: 0.4, b: 0.4 }], glyph: { cell: 9, charset: cs('detallado') }, color: { stops: ['#041a24', '#0f7a6b', '#57f0a2', '#d6a3ff'], bg: '#020b10' }, interact: { mode: 'ripple', strength: 0.6, radius: 0.14 }, fx: { glow: 0.4 } }, keepText) },
    { id: 'palabras', name: 'Palabras', make: mk({ source: 'text', text: { content: 'HOLA', font: 'sans', weight: 900 }, glyph: { cell: 9, mode: 'words', words: 'HOLA MUNDO · HELLO WORLD · OLÁ MUNDO · ', font: 'martian', weight: 700 }, color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'lens', strength: 0.6, radius: 0.18 } }, keepText) },
    // letters that move (engine/letters.ts)
    { id: 'ola', name: 'Ola', make: mk({ source: 'text', text: { content: 'ONDA', font: 'martian', weight: 800, size: 0.9, anim: { kind: 'ola', amount: 0.7, speed: 0.9 } }, layers: [{ pattern: 'ondas', a: 0.25, b: 0.45, scale: 0.9 }], media: { mix: 0.45, blend: 'multiply' }, glyph: { cell: 9, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#041a24', '#0f7a6b', '#57f0a2', '#e6fff4'], bg: '#020b10' }, interact: { mode: 'ripple', strength: 0.5, radius: 0.14 }, fx: { glow: 0.3 } }, keepText) },
    { id: 'estallido', name: 'Estallido', make: mk({ source: 'text', text: { content: 'LUZ', font: 'sans', weight: 900, size: 0.85, anim: { kind: 'explosion', amount: 0.7, speed: 1 } }, media: { xform: [X('estela', 0.9, 0.3)] }, layers: [{ pattern: 'plasma', a: 0.4, b: 0.5 }], glyph: { cell: 8, charset: cs('detallado'), font: 'jetbrains' }, color: { stops: ['#1a0433', '#ff2e97', '#ffd166', '#fff7e0'], bg: '#07010f', map: 'luma' }, interact: { mode: 'none' }, fx: { glow: 0.5, bloom: 0.8, vig: 0.4 } }, keepText) },
    { id: 'palabra', name: 'Palabra a palabra', make: mk({ source: 'text', text: { content: 'LO QUE\nSE ESCRIBE\nTAMBIÉN BAILA', font: 'sans', weight: 900, size: 0.9, leading: 0.95, anim: { kind: 'palabras', amount: 0.5, speed: 1 } }, layers: [{ pattern: 'nube', scale: 0.8, a: 0.4 }], media: { mix: 0.3, blend: 'multiply' }, glyph: { cell: 7, charset: cs('medios'), font: 'jetbrains' }, color: { stops: ['#1d1b18', '#8a8173', '#ede6da'], bg: '#0b0a09' }, interact: { mode: 'repel', strength: 0.4, radius: 0.15 }, fx: { vig: 0.35 } }, keepText) },
    { id: 'cartel', name: 'Cartel', make: mk({ source: 'text', text: { content: 'EN VIVO', font: 'martian', weight: 800, size: 0.95, anim: { kind: 'brillo', amount: 0.75, speed: 1.2 } }, media: { xform: [X('semitono', 1, 0.1)] }, glyph: { cell: 6, aspect: 1.1, charset: cs('puntos'), font: 'jetbrains' }, color: { stops: ['#2b0d06', '#ff5b1f', '#ffd166', '#ffe9c7'], bg: '#0b0708' }, msg: { on: true, text: 'esta noche, a las nueve', mode: 'words', y: 0.9, box: 0.9, speed: 12, anim: { kind: 'color', amount: 1, speed: 1 } }, interact: { mode: 'light', strength: 0.4, radius: 0.2 }, fx: { bloom: 0.4 } }, keepText) },
    // a Möbius band turning above a line that deciphers itself
    { id: 'cinta', name: 'Una sola cara', make: mk({ layers: [{ pattern: 'moebius', a: 0.55, b: 0.1, y: -0.08, scale: 1.1 }], motion: { speed: 0.5 }, glyph: { cell: 9, charset: cs('clasico'), font: 'plex', weight: 500 }, tone: { gamma: 0.6, contrast: 1.25 }, color: { stops: ['#dfe3ea', '#4a6fa5', '#10245a'], bg: '#f4f5f2' }, msg: { on: true, text: 'una cinta con una sola cara', mode: 'decode', y: 0.86, box: 0.9, speed: 14 }, interact: { mode: 'repel', strength: 0.5, radius: 0.16 } }) },
  ],
  terminal: [
    { id: 'terminal-prisma', name: 'Prisma ANSI', make: mk({ layers: [{ pattern: 'prisma', a: 0.38, b: 0.26 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#293e54', '#8fbed4', '#ffffff'], bg: '#050b12' }, motion: { speed: 0.5 }, interact: { mode: 'none' } }) },
    { id: 'terminal-obelisco', name: 'Obelisco ASCII', make: mk({ layers: [{ pattern: 'obelisco', a: 0.3, b: 0.48 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#234d36', '#89cba3', '#e5f7dd'], bg: '#031009' }, motion: { speed: 0.5 }, interact: { mode: 'none' } }) },
    { id: 'terminal-espirografo', name: 'Curva de consola', make: mk({ layers: [{ pattern: 'espirografo', a: 0.38, b: 0.42 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#2f4227', '#b4d58d', '#f3ffd9'], bg: '#081109' }, motion: { speed: 0.34 }, interact: { mode: 'none' } }) },
    { id: 'consola', name: 'Consola', make: mk({ layers: [{ pattern: 'lluvia', a: 0.4, b: 0.4 }], glyph: { cell: 10, aspect: 2, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, msg: { on: true, text: '> hola, terminal', mode: 'type', x: 0.06, y: 0.9, align: 'left', box: 0.95, speed: 12 }, interact: { mode: 'scramble', strength: 0.6, radius: 0.2 }, fx: { scan: 0.5, curve: 0.35, vig: 0.5, bloom: 0.4 } }) },
    { id: 'donut', name: 'donut.c', make: mk({ layers: [{ pattern: 'dona', a: 0.3, b: 0.5 }], glyph: { cell: 9, aspect: 2, charset: '.,-~:;=!*#$@'.replace(/^/, ' '), font: 'jetbrains', sort: false }, color: { stops: ['#ffffff'], bg: '#0a0a0a' }, motion: { speed: 1 }, interact: { mode: 'none' } }) },
    { id: 'radar', name: 'Radar', make: mk({ layers: [{ pattern: 'radar', a: 0.4, b: 0.3 }], glyph: { cell: 10, aspect: 2, charset: cs('clasico'), font: 'vt' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' }, fx: { scan: 0.4, bloom: 0.5, vig: 0.4 }, interact: { mode: 'light', strength: 0.3 } }) },
    { id: 'ecualizador', name: 'Ecualizador', make: mk({ layers: [{ pattern: 'ecualizador', a: 0.4, b: 0.3 }], glyph: { cell: 10, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f', map: 'y' }, motion: { hold: 12 }, fx: { bloom: 0.4 } }) },
    { id: 'ambar', name: 'Ámbar', make: mk({ layers: [{ pattern: 'plasma', a: 0.3, b: 0.4 }], glyph: { cell: 10, aspect: 2, charset: cs('detallado'), font: 'vt' }, color: { stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600' }, fx: { scan: 0.6, curve: 0.4, vig: 0.6, bloom: 0.5, flicker: 0.2 }, interact: { mode: 'ripple', strength: 0.5 } }) },
    { id: 'cubo', name: 'Cubo', make: mk({ layers: [{ pattern: 'cubo', a: 0.2, b: 0.7 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#8ac7ff', '#ffffff'], bg: '#050a12' }, interact: { mode: 'none' } }) },
    { id: 'icosaedro', name: 'Icosaedro', make: mk({ layers: [{ pattern: 'poliedro', a: 0.7, b: 0.75 }], glyph: { cell: 9, aspect: 2, charset: cs('clasico'), font: 'jetbrains' }, color: { stops: ['#3a3a3a', '#d8d8d8', '#ffffff'], bg: '#0a0a0a' }, motion: { speed: 0.8 }, interact: { mode: 'none' } }) },
    { id: 'ciudad', name: 'Ciudad', make: mk({ layers: [{ pattern: 'voxeles', a: 0.65, b: 0.35 }], glyph: { cell: 10, aspect: 2, charset: cs('clasico'), font: 'vt' }, color: { stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600' }, msg: { on: true, text: '> sobrevolando la ciudad', mode: 'type', x: 0.06, y: 0.08, align: 'left', box: 0.95, speed: 12 }, interact: { mode: 'light', strength: 0.4 }, fx: { scan: 0.45, vig: 0.5, bloom: 0.35 } }) },
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
