import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un teseracto (o un 16 celdas, o un 24 celdas) que gira en cuatro dimensiones y se vuelve del revés.',
  mechanism: 'Los vértices de un politopo regular de cuatro dimensiones (el teseracto tiene 16 y 32 aristas; el 16 celdas, 8 y 24; el 24 celdas, 24 y 96) giran en los planos xw, yw y zw. Después se proyectan en perspectiva de 4D a 3D desde un ojo situado en w = D (cada punto se escala por D/(D − w)) y de 3D a la pantalla con una cámara que da una vuelta por ciclo. Cada arista se dibuja con un grosor y un brillo que dependen de w a lo largo de ella: lo que está más cerca del ojo en 4D es más grueso y más claro, y por eso el cubo interior crece hasta ser el exterior. Los vértices son puntos; la estela repite la figura unos instantes antes, cada vez más tenue.',
  time: 'Bucle exacto: cada plano da un número entero de vueltas por ciclo y la cámara una, así que la figura y su estela vuelven exactamente a su inicio cuando acaba el ciclo (los segundos de «Ciclo»).',
  limits: 'Tres politopos regulares (hasta 24 vértices y 96 aristas) y tres copias de estela. Los giros son números enteros de vueltas por ciclo: así el bucle es exacto.',
  sources: [
    { label: 'Radiant · Tesseract Shadow (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Teseracto', url: 'https://en.wikipedia.org/wiki/Tesseract' },
    { label: '24 celdas', url: 'https://en.wikipedia.org/wiki/24-cell' },
  ],
  hints: {
    poly: 'Qué politopo de cuatro dimensiones gira.',
    xw: 'Vueltas por ciclo en el plano xw (entra y sale de la cuarta dimensión de lado).',
    yw: 'Vueltas por ciclo en el plano yw (de arriba abajo).',
    zw: 'Vueltas por ciclo en el plano zw (en profundidad).',
    cycle: 'Segundos que tarda en volver exactamente a su inicio.',
    dist4: 'Distancia del ojo en 4D: cerca, perspectiva fuerte (cubo interior pequeño); lejos, casi paralela.',
    width: 'Grosor de las aristas, en celdas.',
    trail: 'Copias tenues de la figura unos instantes antes.',
  },
  presets: {
    teseracto: 'El hipercubo girando en xw e yw: dos cubos que se intercambian, con estela corta.',
    reves: 'Sólo el giro xw, con perspectiva fuerte: el cubo interior pasa a ser el exterior una y otra vez.',
    celdas24: 'El 24 celdas, 96 aristas finas que giran en tres planos: una red densa que respira.',
    celdas16: 'El 16 celdas, de aristas gruesas y estela larga, girando rápido.',
  },
};
