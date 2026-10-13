import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'corrientes',
  name: 'Corrientes de color',
  group: 'materia',
  kind: 'analytic',
  version: 1,
  color: true,
  aka: ['mesh gradient', 'degradado de malla', 'gradiente de malla', 'interpolación de Shepard'],
  params: [
    { key: 'spots', label: 'Corrientes', type: 'int', min: 2, max: 8, def: 5 },
    { key: 'swirl', label: 'Remolino', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01 },
    { key: 'warp', label: 'Deformación', type: 'number', min: 0, max: 1, def: 0.55, step: 0.01 },
    { key: 'speed', label: 'Velocidad', type: 'number', min: 0.05, max: 1, def: 0.3, step: 0.01 },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.5, max: 2.2, def: 1, step: 0.01 },
    { key: 'contrast', label: 'Contraste', type: 'number', min: 0, max: 1, def: 0.55, step: 0.01 },
    { key: 'grain', label: 'Textura', type: 'number', min: 0, max: 1, def: 0.12, step: 0.01 },
    { key: 'glyph', label: 'Carácter según', type: 'choice', def: 'brillo', options: [
      { id: 'brillo', label: 'El brillo' }, { id: 'bordes', label: 'Los bordes' }, { id: 'ambos', label: 'Ambos' },
    ] },
  ],
  presets: [
    { id: 'neon', name: 'Corrientes de neón', uses: ['fondos/color'], params: { spots: 5, swirl: 0.45, warp: 0.55, speed: 0.32, scale: 1, contrast: 0.55, grain: 0.12, glyph: 'brillo' },
      look: { stops: ['#060716', '#2a1c6e', '#d83a9a', '#2fd6e8', '#f2f0ff'], bg: '#04050d', charset: ' .:-=+*#%@', colorMode: 'source', vivid: 0.15 } },
    { id: 'atardecer', name: 'Atardecer líquido', uses: ['fondos/color'], params: { spots: 6, swirl: 0.22, warp: 0.85, speed: 0.2, scale: 1.2, contrast: 0.28, grain: 0.3, glyph: 'brillo' },
      look: { stops: ['#1a0b14', '#6e1f3a', '#e0583a', '#f6b04a', '#fff1c9'], bg: '#0e0609', charset: ' .,:;=+*#', colorMode: 'source', vivid: 0.1 } },
    { id: 'marmolada', name: 'Tinta marmolada', uses: ['fondos/color', 'arte/organicas'], params: { spots: 7, swirl: 0.7, warp: 0.95, speed: 0.24, scale: 0.9, contrast: 0.95, grain: 0.04, glyph: 'bordes' },
      look: { stops: ['#0b0a0a', '#1f4f6e', '#b33a2e', '#e9e2d0'], bg: '#070606', charset: " .'`-~=+*#", colorMode: 'source', vivid: 0.3 } },
    { id: 'boreal', name: 'Velo boreal', uses: ['fondos/color'], params: { spots: 3, swirl: 0.15, warp: 0.6, speed: 0.14, scale: 1.7, contrast: 0.4, grain: 0.18, glyph: 'ambos' },
      look: { stops: ['#02060a', '#0f4d3a', '#3fd38a', '#9b6bff'], bg: '#010407', charset: ' .:-=+*#', colorMode: 'source', vivid: 0.2 } },
    { id: 'remolino', name: 'Remolino cromático', uses: ['fondos/color', 'arte/optica'], params: { spots: 6, swirl: 1, warp: 0.3, speed: 0.36, scale: 1, contrast: 0.72, grain: 0.08, glyph: 'brillo' },
      look: { stops: ['#0a0614', '#7a3dff', '#ff3d6e', '#ffd23d', '#3dd6ff'], bg: '#06040c', charset: ' .:+*#%@', colorMode: 'source', vivid: 0.25 } },
  ],
  caps: { loop: true, time: 'continuo', basic: 'full', checkpoint: false },
  budget: {},
};
