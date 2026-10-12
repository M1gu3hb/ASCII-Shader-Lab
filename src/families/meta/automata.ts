import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'automata',
  name: 'Autómatas celulares',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  aka: ['autómata celular', 'Juego de la vida', 'Conway', 'Life-like', 'Generations'],
  params: [
    { key: 'rule', label: 'Regla', type: 'choice', def: 'conway', options: [
      { id: 'conway', label: 'Vida de Conway (B3/S23)' }, { id: 'highlife', label: 'HighLife (B36/S23)' },
      { id: 'diaynoche', label: 'Día y noche (B3678/S34678)' }, { id: 'cerebro', label: 'Cerebro de Brian (B2/S/3)' },
      { id: 'starwars', label: 'Star Wars (B2/S345/4)' }, { id: 'coral', label: 'Coral (B3/S45678)' },
      { id: 'laberinto', label: 'Laberinto (B3/S12345)' }, { id: 'propia', label: 'Regla propia' },
    ] },
    { key: 'custom', label: 'Regla propia', type: 'text', def: 'B3/S23', max: 20, allowed: 'BSCbsc0123456789/', advanced: true },
    { key: 'neigh', label: 'Vecindad', type: 'choice', def: 'moore', options: [{ id: 'moore', label: 'Ocho vecinas' }, { id: 'vonneumann', label: 'Cuatro vecinas' }] },
    { key: 'density', label: 'Densidad inicial', type: 'number', min: 0.02, max: 0.9, def: 0.3, step: 0.01, rebuild: true },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'aleatoria', rebuild: true, options: [
      { id: 'aleatoria', label: 'Aleatoria' }, { id: 'centro', label: 'Centro' }, { id: 'simetrica', label: 'Simétrica' },
    ] },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'toro', options: [{ id: 'toro', label: 'Continuos' }, { id: 'cerrado', label: 'Cerrados' }] },
    { key: 'speed', label: 'Velocidad', type: 'int', min: 1, max: 30, def: 10, unit: 'gen/s' },
    { key: 'trail', label: 'Estela', type: 'choice', def: 'corta', options: [{ id: 'ninguna', label: 'Ninguna' }, { id: 'corta', label: 'Corta' }, { id: 'larga', label: 'Larga' }] },
    { key: 'renew', label: 'Renovación', type: 'choice', def: 'ninguna', options: [
      { id: 'ninguna', label: 'Ninguna' }, { id: 'lluvia', label: 'Lluvia de semillas' }, { id: 'banda', label: 'Banda que rehace' },
    ] },
    { key: 'renewRate', label: 'Ritmo de renovación', type: 'number', min: 0.05, max: 1, def: 0.5, step: 0.01 },
  ],
  presets: [
    { id: 'vida', name: 'Vida clásica', params: { rule: 'conway', neigh: 'moore', density: 0.3, seedShape: 'aleatoria', edges: 'toro', speed: 10, trail: 'corta' }, uses: ['arte/geometricas', 'terminal/consola'], aka: ['Juego de la vida', 'Conway', 'Game of Life'], look: { stops: ['#06100a', '#b8f5c0'], bg: '#030805', charset: ' .:+#@' } },
    { id: 'cerebro', name: 'Chispas', params: { rule: 'cerebro', neigh: 'moore', density: 0.2, seedShape: 'aleatoria', edges: 'toro', speed: 12, trail: 'corta', renew: 'lluvia', renewRate: 0.6 }, uses: ['fondos/vivas', 'terminal/consola'], aka: ['Cerebro', "Brian's Brain"], look: { stops: ['#0a0614', '#d6b8ff'], bg: '#05030a', charset: ' .-+*#' } },
    { id: 'diaynoche', name: 'Continentes', params: { rule: 'diaynoche', neigh: 'moore', density: 0.5, seedShape: 'aleatoria', edges: 'toro', speed: 10, trail: 'corta' }, uses: ['arte/geometricas', 'terminal/consola'], aka: ['Día y noche', 'Day and Night'], look: { stops: ['#05080f', '#cfe0ff'], bg: '#020408', charset: ' .:=#' } },
    { id: 'pasadizos', name: 'Pasadizos', params: { rule: 'laberinto', neigh: 'moore', density: 0.4, seedShape: 'centro', edges: 'cerrado', speed: 12, trail: 'ninguna' }, uses: ['arte/geometricas', 'terminal/consola'], aka: ['laberinto', 'Maze'], look: { stops: ['#0c0c06', '#f0f0b0'], bg: '#060603', charset: ' .|+#' } },
    { id: 'pasillos', name: 'Pasillos que se rehacen', params: { rule: 'laberinto', neigh: 'moore', density: 0.4, seedShape: 'aleatoria', edges: 'toro', speed: 12, trail: 'corta', renew: 'banda', renewRate: 0.5 }, uses: ['fondos/geometricas', 'terminal/consola', 'tipo/texturas'], aka: ['laberinto continuo', 'Maze'], look: { stops: ['#0a0c10', '#d8e6ff'], bg: '#05060a', charset: ' .:|+#' } },
    { id: 'vida_lluvia', name: 'Vida que no se apaga', params: { rule: 'conway', neigh: 'moore', density: 0.3, seedShape: 'aleatoria', edges: 'toro', speed: 10, trail: 'larga', renew: 'lluvia', renewRate: 0.5 }, uses: ['fondos/vivas', 'terminal/consola'], aka: ['Juego de la vida', 'Conway', 'Game of Life'], look: { stops: ['#0f0a04', '#ffd79a'], bg: '#080502', charset: ' .:+*#@' } },
  ],
  caps: {
    loop: false,
    // without renewal most rules settle (Life into ash, the maze rule into a finished maze); renewal keeps them going
    time: { param: 'renew', values: { ninguna: 'construccion' }, else: 'continuo' },
    basic: 'full', checkpoint: true,
    brushes: [{ id: 'dibujar', label: 'Dibujar', hint: 'Enciende celdas al azar donde tocas.' }, { id: 'borrar', label: 'Borrar', hint: 'Apaga las celdas de la zona.' }],
  },
  budget: { res: [32, 192, 64], rate: 30, warmup: 90 },
  wrap: 'repeat',
};
