import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una red de relojes que se empujan entre vecinos: sincronía, ondas y remolinos de fase.',
  mechanism: 'Modelo de Kuramoto sobre una rejilla: cada punto es un oscilador con su propia frecuencia y adelanta o atrasa su fase hacia la de sus vecinos. Con poco acoplamiento cada uno va a su ritmo; con más, se forman ondas, zonas sincronizadas y remolinos alrededor de puntos donde la fase no está definida.',
  time: 'Evoluciona con memoria: la sincronía se gana y se pierde poco a poco. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de osciladores a media resolución (filas/2 × filas) con fase, frecuencia y destello en coma flotante; hasta 28 vecinos por nodo.',
  sources: [
    { label: 'Kuramoto (1975), según Acebrón et al. (2005): The Kuramoto model', url: 'https://doi.org/10.1103/RevModPhys.77.137' },
    { label: 'Sakaguchi y Kuramoto (1986): A soluble active rotator model', url: 'https://doi.org/10.1143/PTP.76.576' },
    { label: 'Dirk Brockmann: Spin Wheels (Complexity Explorables)', url: 'https://www.complexity-explorables.org/explorables/spin-wheels/' },
  ],
  hints: {
    'K': 'Fuerza con que cada oscilador tira de sus vecinos: más, más sincronía.',
    'spread': 'Diferencia típica entre las frecuencias propias: más diversidad, más desorden.',
    'freq': 'Vueltas por segundo del oscilador típico.',
    'neigh': 'Con cuántos vecinos se acopla cada oscilador: más alcance, ondas más anchas.',
    'lag': 'Retraso en el acoplamiento (Sakaguchi): convierte los remolinos quietos en espirales que giran.',
    'noise': 'Empujones al azar en cada paso.',
    'view': 'Fase: el ciclo como luz. Sincronía: cuánto coincide cada zona. Vórtices: los puntos sin fase. Destellos: un pulso cada vez que un oscilador completa su vuelta.',
  },
  presets: {
    'remolinos': 'Espirales que giran alrededor de puntos sin fase y se empujan en sus fronteras.',
    'sincronizado': 'Ondas largas que recorren el campo de lado a lado mientras todo late a la vez.',
    'destellos': 'Cada oscilador destella al cerrar su vuelta: frentes de luz que barren la oscuridad.',
    'turbulencia': 'Con mucho desfase las espirales se rompen: vórtices que nacen y se aniquilan sin parar.',
  },
};
