import { SPACE_ARCHS_V5 } from './v5';

export type SpaceId = 'fondos' | 'arte' | 'media' | 'tipo' | 'terminal' | 'componentes';

export interface SpaceInfo {
  id: SpaceId;
  name: string;
  short: string;
  blurb: string;
  /** archetype weights used by the dice in this space (the current generator version's; older ones: v1.ts, v2.ts) */
  archs: Record<string, number>;
}

export const SPACES: SpaceInfo[] = [
  {
    id: 'fondos', name: 'Fondos', short: 'Fondos',
    blurb: 'Fondos animados discretos, legibles bajo tu contenido y listos para pegar en una web.',
    archs: SPACE_ARCHS_V5.fondos,
  },
  {
    id: 'arte', name: 'Arte', short: 'Arte',
    blurb: 'Composiciones con capas, objetos en 3D, fractales y efectos. El azar sin frenos.',
    archs: SPACE_ARCHS_V5.arte,
  },
  {
    id: 'media', name: 'Imagen', short: 'Imagen',
    blurb: 'Tu foto, video o cámara convertidos en caracteres, procesados en tu navegador.',
    archs: SPACE_ARCHS_V5.media,
  },
  {
    id: 'tipo', name: 'Texto', short: 'Texto',
    blurb: 'Palabras como materia: tipografía rellena de patrón, mensajes que se escriben, se borran y se descifran.',
    archs: SPACE_ARCHS_V5.tipo,
  },
  {
    id: 'terminal', name: 'Terminal', short: 'Terminal',
    blurb: 'Piezas pensadas para la consola: rejillas de 80 columnas, ASCII puro, ANSI y animaciones que corren en tu shell.',
    archs: SPACE_ARCHS_V5.terminal,
  },
  {
    id: 'componentes', name: 'Componentes', short: 'Piezas',
    blurb: 'Piezas de interfaz listas para insertar: textos que se descifran, máquinas de escribir, cursores, spinners y más.',
    archs: SPACE_ARCHS_V5.componentes,
  },
];

export const spaceById = (id: string) => SPACES.find(s => s.id === id) ?? SPACES[0];

export type LockGroup = 'forma' | 'color' | 'glifos' | 'movimiento' | 'efectos' | 'fuente';

export const LOCK_NAMES: Record<LockGroup, string> = {
  forma: 'Forma', color: 'Color', glifos: 'Glifos', movimiento: 'Movimiento', efectos: 'Efectos', fuente: 'Origen',
};
export const LOCK_GROUPS = Object.keys(LOCK_NAMES) as LockGroup[];
