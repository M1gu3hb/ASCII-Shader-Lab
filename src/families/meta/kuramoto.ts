import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'kuramoto',
  name: 'Osciladores acoplados',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Una red de relojes que se empujan entre vecinos: sincronía, ondas y remolinos de fase.',
  mechanism: 'Modelo de Kuramoto sobre una rejilla: cada punto es un oscilador con su propia frecuencia y adelanta o atrasa su fase hacia la de sus vecinos. Con poco acoplamiento cada uno va a su ritmo; con más, se forman ondas, zonas sincronizadas y remolinos alrededor de puntos donde la fase no está definida.',
  time: 'Evoluciona con memoria: la sincronía se gana y se pierde poco a poco. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'K', label: 'Acoplamiento', type: 'number', min: 0, max: 6, def: 3, step: 0.05, hint: 'Fuerza con que cada oscilador tira de sus vecinos: más, más sincronía.' },
    { key: 'spread', label: 'Diversidad', type: 'number', min: 0, max: 0.5, def: 0.02, step: 0.005, digits: 3, unit: 'Hz', hint: 'Diferencia típica entre las frecuencias propias: más diversidad, más desorden.' },
    { key: 'freq', label: 'Frecuencia media', type: 'number', min: 0, max: 2, def: 0.45, step: 0.01, unit: 'Hz', hint: 'Vueltas por segundo del oscilador típico.' },
    { key: 'neigh', label: 'Vecindad', type: 'choice', def: 'r2', options: [
      { id: 'n4', label: '4 vecinos' }, { id: 'n8', label: '8 vecinos' }, { id: 'r2', label: 'Radio 2' }, { id: 'r3', label: 'Radio 3' },
    ], hint: 'Con cuántos vecinos se acopla cada oscilador: más alcance, ondas más anchas.' },
    { key: 'lag', label: 'Desfase', type: 'number', min: 0, max: 1.5, def: 0.8, step: 0.01, unit: 'rad', hint: 'Retraso en el acoplamiento (Sakaguchi): convierte los remolinos quietos en espirales que giran.' },
    { key: 'noise', label: 'Ruido', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Empujones al azar en cada paso.' },
    { key: 'init', label: 'Fase inicial', type: 'choice', def: 'espirales', rebuild: true, options: [
      { id: 'aleatoria', label: 'Aleatoria' }, { id: 'ondas', label: 'Ondas' }, { id: 'espirales', label: 'Espirales' },
    ] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'fase', options: [
      { id: 'fase', label: 'Fase' }, { id: 'sincronia', label: 'Sincronía' }, { id: 'vortices', label: 'Vórtices' }, { id: 'destellos', label: 'Destellos' },
    ], hint: 'Fase: el ciclo como luz. Sincronía: cuánto coincide cada zona. Vórtices: los puntos sin fase. Destellos: un pulso cada vez que un oscilador completa su vuelta.' },
  ],
  presets: [
    { id: 'remolinos', name: 'Remolinos de fase', desc: 'Espirales que giran alrededor de puntos sin fase y se empujan en sus fronteras.', params: { K: 3, spread: 0.02, freq: 0.45, neigh: 'r2', lag: 0.8, noise: 0, init: 'espirales', view: 'fase' }, look: { stops: ['#060a14', '#cfe2ff'], bg: '#03050a', charset: ' .:-=+*#%@' } },
    { id: 'sincronizado', name: 'Campo sincronizado', desc: 'Ondas largas que recorren el campo de lado a lado mientras todo late a la vez.', params: { K: 3, spread: 0.02, freq: 0.4, neigh: 'r2', lag: 0.3, noise: 0, init: 'ondas', view: 'fase' }, look: { stops: ['#0a0c06', '#e8f0b0'], bg: '#050603', charset: ' .-~=≈#' } },
    { id: 'destellos', name: 'Destellos', desc: 'Cada oscilador destella al cerrar su vuelta: frentes de luz que barren la oscuridad.', params: { K: 4, spread: 0.06, freq: 0.6, neigh: 'r3', lag: 0.5, noise: 0, init: 'aleatoria', view: 'destellos' }, look: { stops: ['#0c0804', '#ffd890'], bg: '#060402', charset: ' .·:*#@' } },
    { id: 'turbulencia', name: 'Turbulencia', desc: 'Con mucho desfase las espirales se rompen: vórtices que nacen y se aniquilan sin parar.', params: { K: 4, spread: 0.05, freq: 0.5, neigh: 'r3', lag: 1, noise: 0, init: 'aleatoria', view: 'vortices' }, look: { stops: ['#100608', '#ffb0c0'], bg: '#080304', charset: ' .:o@' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'empujar', label: 'Empujar fase', hint: 'Adelanta la fase donde tocas: lanza una onda o abre un remolino.' }],
  },
  budget: { res: [48, 192, 96], rate: 20, warmup: 200, limits: 'Rejilla de osciladores a media resolución (filas/2 × filas) con fase, frecuencia y destello en coma flotante; hasta 28 vecinos por nodo.' },
  sources: [
    { label: 'Kuramoto (1975), según Acebrón et al. (2005): The Kuramoto model', url: 'https://doi.org/10.1103/RevModPhys.77.137' },
    { label: 'Sakaguchi y Kuramoto (1986): A soluble active rotator model', url: 'https://doi.org/10.1143/PTP.76.576' },
    { label: 'Dirk Brockmann: Spin Wheels (Complexity Explorables)', url: 'https://www.complexity-explorables.org/explorables/spin-wheels/' },
  ],
  wrap: 'repeat',
};
