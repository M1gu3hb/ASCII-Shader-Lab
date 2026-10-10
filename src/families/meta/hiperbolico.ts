import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'hiperbolico',
  name: 'Teselación hiperbólica',
  group: 'forma',
  kind: 'analytic',
  version: 1,
  params: [
    { key: 'p', label: 'Lados (p)', type: 'int', min: 3, max: 12, def: 7 },
    { key: 'q', label: 'Por vértice (q)', type: 'int', min: 3, max: 12, def: 3 },
    { key: 'motif', label: 'Motivo', type: 'choice', def: 'aristas', options: [
      { id: 'aristas', label: 'Aristas' }, { id: 'alternas', label: 'Teselas alternas' }, { id: 'estrella', label: 'Estrella' },
    ] },
    { key: 'width', label: 'Grosor', type: 'number', min: 0.3, max: 3, def: 1, step: 0.05 },
    { key: 'drift', label: 'Deriva', type: 'number', min: -1, max: 1, def: 0.3, step: 0.01 },
    { key: 'turn', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01 },
    { key: 'rim', label: 'Borde', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01 },
    { key: 'outside', label: 'Exterior', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
  ],
  presets: [
    { id: 'triangulos', name: 'Triángulos {7,3}', params: { p: 7, q: 3, motif: 'alternas', width: 0.8, drift: 0.3, turn: 0.1, rim: 0.4, outside: 0 }, look: { stops: ['#0a0710', '#f3e4c4'], bg: '#05040a', charset: ' .:-=+*#%@' } },
    { id: 'cuadrados', name: 'Cuadrados {4,5}', params: { p: 4, q: 5, motif: 'aristas', width: 1.2, drift: -0.25, turn: 0.15, rim: 0.3, outside: 0 }, look: { stops: ['#04100f', '#a6f0e0'], bg: '#020807', charset: ' .·:;+=#' } },
    { id: 'estrellas', name: 'Estrellas {6,4}', params: { p: 6, q: 4, motif: 'estrella', width: 0.7, drift: 0.2, turn: -0.12, rim: 0.35, outside: 0 }, look: { stops: ['#100a04', '#ffd38a'], bg: '#080502', charset: ' .-=+*#@' } },
    { id: 'espejo', name: 'Pentágonos y su reflejo {5,4}', params: { p: 5, q: 4, motif: 'aristas', width: 1, drift: 0.3, turn: 0, rim: 0.2, outside: 0.6 }, look: { stops: ['#0b0814', '#c9b8ff'], bg: '#05040c', charset: ' .:;+*#' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { },
  figure: true,
};
