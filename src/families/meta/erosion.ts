import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'erosion',
  name: 'Terreno que se erosiona',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  extends: 'topografia',
  params: [
    { key: 'shape', label: 'Relieve inicial', type: 'choice', def: 'cordillera', rebuild: true, options: [
      { id: 'cordillera', label: 'Cordillera' }, { id: 'ladera', label: 'Ladera hacia el mar' }, { id: 'meseta', label: 'Meseta' },
    ] },
    { key: 'height', label: 'Altura', type: 'number', min: 0.2, max: 1, def: 0.6, step: 0.01, rebuild: true },
    { key: 'scale', label: 'Escala del ruido', type: 'number', min: 1.5, max: 8, def: 3, step: 0.1, rebuild: true },
    { key: 'rain', label: 'Lluvia', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'erode', label: 'Erosión', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'deposit', label: 'Depósito', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'capacity', label: 'Capacidad', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'evap', label: 'Evaporación', type: 'number', min: 0, max: 1, def: 0.3, step: 0.01 },
    { key: 'talus', label: 'Pendiente de talud', type: 'number', min: 15, max: 75, def: 40, step: 1, unit: '°' },
    { key: 'strata', label: 'Estratos', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'view', label: 'Vista', type: 'choice', def: 'relieve', options: [
      { id: 'relieve', label: 'Relieve 3D' }, { id: 'agua', label: 'Mapa del agua' }, { id: 'alturas', label: 'Mapa de alturas' },
    ] },
    { key: 'orbit', label: 'Giro de cámara', type: 'number', min: -2, max: 2, def: 0.5, step: 0.01, unit: 'vueltas/min' },
    { key: 'pitch', label: 'Inclinación', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01 },
  ],
  presets: [
    { id: 'barrancos', name: 'Barrancos', params: { shape: 'cordillera', height: 0.75, scale: 3, rain: 0.7, erode: 0.9, deposit: 0.3, capacity: 0.8, evap: 0.3, talus: 45, strata: 0, view: 'relieve', orbit: 0.6, pitch: 0.45 }, look: { stops: ['#0b0906', '#e8c9a0'], bg: '#060503', charset: ' .:-=+*#%@' } },
    { id: 'delta', name: 'Ríos y delta', params: { shape: 'ladera', height: 0.6, scale: 2.5, rain: 0.6, erode: 0.6, deposit: 0.7, capacity: 0.6, evap: 0.08, talus: 40, strata: 0, view: 'relieve', orbit: 0.4, pitch: 0.6 }, look: { stops: ['#04100c', '#7fe0c0', '#effff8'], bg: '#020806', charset: ' .·:;=+#' } },
    { id: 'mesetas', name: 'Mesetas', params: { shape: 'meseta', height: 0.8, scale: 4, rain: 0.2, erode: 0.5, deposit: 0.4, capacity: 0.5, evap: 0.4, talus: 22, strata: 1, view: 'relieve', orbit: 0.5, pitch: 0.2 }, look: { stops: ['#120806', '#ffb27a'], bg: '#090403', charset: ' .-=+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: {
    res: [48, 160, 112], rate: 30, warmup: 30,
  },
  wrap: 'clamp',
  figure: true,
};
