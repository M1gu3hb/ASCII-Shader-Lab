import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'crecimiento',
  name: 'Crecimiento diferencial',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'sep', label: 'Separación', type: 'number', min: 0.03, max: 0.12, def: 0.07, step: 0.001, digits: 3 },
    { key: 'att', label: 'Atracción', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'ali', label: 'Alineación', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'edge', label: 'Arista máxima', type: 'number', min: 0.3, max: 1, def: 0.55, step: 0.01 },
    { key: 'sprout', label: 'Brotes', type: 'number', min: 0, max: 3, def: 0.5, step: 0.05 },
    { key: 'shape', label: 'Forma inicial', type: 'choice', def: 'circulo', rebuild: true, options: [
      { id: 'circulo', label: 'Círculo' }, { id: 'linea', label: 'Línea' }, { id: 'varias', label: 'Varias semillas' }, { id: 'estrella', label: 'Estrella' },
    ] },
    { key: 'bound', label: 'Límite', type: 'choice', def: 'circulo', options: [{ id: 'circulo', label: 'Círculo' }, { id: 'rect', label: 'Marco' }] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'trazo', options: [
      { id: 'trazo', label: 'Trazo' }, { id: 'relleno', label: 'Relleno' }, { id: 'historia', label: 'Historia' },
    ] },
  ],
  presets: [
    { id: 'coral', name: 'Coral plegado', params: { sep: 0.07, att: 0.5, ali: 0.5, edge: 0.55, sprout: 0.5, shape: 'circulo', bound: 'circulo', view: 'relleno' }, look: { stops: ['#160807', '#ffb3a0'], bg: '#0b0403', charset: ' .:-=+*#' } },
    { id: 'corteza', name: 'Corteza', params: { sep: 0.07, att: 0.8, ali: 0.6, edge: 0.55, sprout: 0.3, shape: 'linea', bound: 'rect', view: 'historia' }, look: { stops: ['#0d0a05', '#e9d3a5'], bg: '#070502', charset: ' .,:;!|' } },
    { id: 'colonia', name: 'Colonia de pliegues', params: { sep: 0.075, att: 0.6, ali: 0.7, edge: 0.5, sprout: 0.4, shape: 'varias', bound: 'rect', view: 'trazo' }, look: { stops: ['#04100a', '#a8f0c6'], bg: '#020805', charset: ' .·:oO@' } },
    { id: 'medusa', name: 'Tentáculos radiales', params: { sep: 0.085, att: 0.6, ali: 0.4, edge: 0.4, sprout: 0.3, shape: 'estrella', bound: 'circulo', view: 'trazo' }, look: { stops: ['#0a0716', '#d3c4ff'], bg: '#05030c', charset: ' .:-=+#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 150 },
  wrap: 'clamp',
};
