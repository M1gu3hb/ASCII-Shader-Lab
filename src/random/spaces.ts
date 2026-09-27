export type SpaceId = 'fondos' | 'arte' | 'media' | 'tipo' | 'terminal' | 'componentes';

export interface SpaceInfo {
  id: SpaceId;
  name: string;
  short: string;
  blurb: string;
  /** archetype weights used by the dice in this space */
  archs: Record<string, number>;
}

export const SPACES: SpaceInfo[] = [
  {
    id: 'fondos', name: 'Fondos', short: 'Fondos',
    blurb: 'Fondos animados discretos, legibles bajo tu contenido y listos para pegar en una web.',
    archs: { minimal: 2.2, organico: 1.8, geometrico: 1.2, cosmico: 1.1, tinta: 1.3, vapor: 0.7, neon: 0.7, op: 0.5, fractal: 0.5 },
  },
  {
    id: 'arte', name: 'Arte', short: 'Arte',
    blurb: 'Composiciones con capas, objetos en 3D, fractales y efectos. El azar sin frenos.',
    archs: { neon: 1, organico: 1, geometrico: 1, glitch: 0.9, cosmico: 1, tinta: 0.8, brutal: 0.9, vapor: 0.8, solidos: 1, op: 0.9, fractal: 0.9, retro: 0.7, grabado: 0.8 },
  },
  {
    id: 'media', name: 'Imagen', short: 'Imagen',
    blurb: 'Tu foto, video o cámara convertidos en caracteres, procesados en tu navegador.',
    archs: { minimal: 1, neon: 1, retro: 1, tinta: 1.2, glitch: 0.8, brutal: 1, organico: 0.7, op: 0.5, geometrico: 0.6, cosmico: 0.4 },
  },
  {
    id: 'tipo', name: 'Tipo', short: 'Tipo',
    blurb: 'Palabras como materia: tipografía rellena de patrón, mensajes que se escriben, se borran y se descifran.',
    archs: { tinta: 1.2, brutal: 1.1, neon: 1, retro: 0.9, glitch: 1, vapor: 0.7, minimal: 0.8, op: 0.6, geometrico: 0.6, organico: 0.5, cosmico: 0.4, fractal: 0.4 },
  },
  {
    id: 'terminal', name: 'Terminal', short: 'Terminal',
    blurb: 'Piezas pensadas para la consola: rejillas de 80 columnas, ASCII puro, ANSI y animaciones que corren en tu shell.',
    archs: { retro: 2, solidos: 1.2, cosmico: 1, minimal: 0.9, glitch: 1, fractal: 0.9, geometrico: 0.8, op: 0.6, brutal: 0.6 },
  },
  {
    id: 'componentes', name: 'Componentes', short: 'Piezas',
    blurb: 'Piezas de interfaz listas para insertar: textos que se descifran, máquinas de escribir, cursores, spinners y más.',
    archs: { minimal: 2, neon: 1, organico: 1, geometrico: 1, tinta: 1 },
  },
];

export const spaceById = (id: string) => SPACES.find(s => s.id === id) ?? SPACES[0];

export type LockGroup = 'forma' | 'color' | 'glifos' | 'movimiento' | 'efectos' | 'fuente';

export const LOCK_NAMES: Record<LockGroup, string> = {
  forma: 'Forma', color: 'Color', glifos: 'Glifos', movimiento: 'Movimiento', efectos: 'Efectos', fuente: 'Fuente',
};
export const LOCK_GROUPS = Object.keys(LOCK_NAMES) as LockGroup[];
