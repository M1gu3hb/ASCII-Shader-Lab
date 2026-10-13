import type { SpaceId } from './spaces';

/**
 * Each space's weights over the styles, version 5. Fondos leans on calm fields and scenes but keeps colour;
 * Arte has every style; Imagen favours what reads over a photo; Texto what keeps the words legible; Terminal
 * what lives in 80 columns of ASCII.
 */
export const SPACE_ARCHS_V5: Record<SpaceId, Record<string, number>> = {
  fondos: { calma: 2.2, minimal: 1.3, organico: 1.4, escena: 1.4, cosmico: 1, particulas: 0.8, geometrico: 0.8, tinta: 0.8, vapor: 0.7, curvas: 0.6, neon: 0.6, op: 0.4, fractal: 0.5 },
  arte: {
    neon: 1, organico: 0.9, geometrico: 0.9, glitch: 0.8, cosmico: 0.9, tinta: 0.7, brutal: 0.7, vapor: 0.8, solidos: 1.1, op: 0.7, fractal: 0.9,
    retro: 0.6, grabado: 0.7, particulas: 1.1, curvas: 1, cartel: 0.9, escena: 1.1, calma: 0.5, minimal: 0.4,
  },
  media: { minimal: 0.8, neon: 1, retro: 1, tinta: 1, glitch: 0.9, brutal: 0.8, organico: 0.7, op: 0.5, geometrico: 0.6, cosmico: 0.5, cartel: 1, escena: 0.8, particulas: 0.5, calma: 0.5 },
  tipo: {
    tinta: 1, brutal: 1, neon: 1, retro: 0.8, glitch: 0.9, vapor: 0.8, minimal: 0.6, op: 0.6, geometrico: 0.6, organico: 0.5, cosmico: 0.5,
    fractal: 0.4, cartel: 1.2, particulas: 0.8, escena: 0.8, calma: 0.5, curvas: 0.4,
  },
  terminal: { retro: 1.8, solidos: 1.3, cosmico: 0.9, minimal: 0.7, glitch: 1, fractal: 0.9, geometrico: 0.8, op: 0.6, brutal: 0.6, particulas: 1, curvas: 0.8, escena: 0.7, cartel: 0.5 },
  componentes: { minimal: 2, neon: 1, organico: 1, geometrico: 1, tinta: 1, calma: 1.2, particulas: 0.6 },
};
