import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Burbujas que nacen siempre en los mismos puntos del fondo, suben bamboleándose, crecen y estallan en la superficie.',
  mechanism: 'Cinco a ocho puntos de nucleación fijos en el fondo sueltan burbujas, cada uno a su ritmo. Cada burbuja es una función del tiempo: nace en su instante, sube cada vez más deprisa (las grandes, más), crece a medida que sube, se bambolea de lado a lado y deja una estela corta que sigue su propio camino. Al llegar a la superficie estalla: un destello, una onda que corre por la superficie hacia los dos lados y tres gotitas que saltan y vuelven a caer. Una burbuja pequeña es un solo carácter, más claro cuanto más grande (con Geometría: ∘, ○, ◎); una grande se dibuja como un aro con su brillo. El líquido brilla un poco, los puntos de nucleación destellan y una línea de espuma marca la superficie.',
  time: 'Una función del tiempo: cada punto suelta burbujas a un ritmo distinto, así que la columna nunca se repite igual; sigue sin reinicio. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Ocho puntos como mucho y unas veinte burbujas en el aire por punto (con un ritmo mayor, el ritmo se limita para que ninguna desaparezca a medio subir). Las burbujas no chocan entre sí ni se juntan.',
  sources: [
    { label: 'Radiant · Champagne Fizz, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Nucleación (por qué las burbujas nacen siempre en los mismos puntos)', url: 'https://es.wikipedia.org/wiki/Nucleaci%C3%B3n' },
  ],
  hints: {
    sites: 'Cuántos puntos del fondo sueltan burbujas (de cinco a ocho columnas).',
    rate: 'Cuántas burbujas suelta cada punto por segundo (cada uno a su ritmo).',
    rise: 'Lo deprisa que suben: un líquido espeso o una gaseosa.',
    wobble: 'Cuánto se balancean de lado a lado al subir.',
    size: 'El tamaño de las burbujas.',
    spread: 'Cuánto cambian de tamaño unas de otras.',
    trail: 'La estela corta que dejan debajo.',
    surface: 'A qué altura está la superficie donde estallan.',
    burst: 'La fuerza del estallido: la onda y las gotitas que saltan.',
    foam: 'La espuma de la superficie.',
    liquid: 'El brillo propio del líquido detrás de las burbujas.',
    layout: 'Otra colocación de los puntos de nucleación.',
  },
  presets: {
    champan: 'Siete columnas de burbujas finas que suben deprisa en un líquido ámbar y estallan en una espuma fina.',
    sifon: 'Ocho columnas densas de burbujas diminutas, rectas y rápidas, con estelas largas: agua con gas.',
    lava_lenta: 'Pocas burbujas grandes y lentas que se balancean mucho y estallan con fuerza bajo una espuma espesa.',
    espuma: 'La superficie baja y una corona de espuma alta: las burbujas revientan en ella como en una cerveza.',
  },
};
