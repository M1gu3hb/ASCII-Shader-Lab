import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Arcos eléctricos que saltan entre conductores en movimiento, se ramifican y se renuevan; o rayos de una tormenta.',
  mechanism: 'Cada arco proyecta la celda sobre el segmento entre sus dos conductores y toma el punto del eje desplazado de lado por tres octavas de ruido, que se anula en los extremos. El brillo es un núcleo fino 1/(1 + d²/w²) más un halo cercano y otro amplio, según la distancia a ese punto (proyectar y desplazar aproxima la distancia a la curva, suficiente a tamaño de celda). Cada arco vive unos segundos, se apaga despacio y vuelve a formarse con otra forma, y lo mismo sus dos ramas: nada se enciende ni se apaga de golpe. «Tormenta» dibuja rayos del cielo al suelo con un líder que baja, ramas y un canal que se apaga despacio, bajo una franja de nubes que se ilumina un poco.',
  time: 'Una función del tiempo: los conductores siguen órbitas lentas y cada arco y cada rama renuevan su forma en ciclos de duración distinta. Sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 6 conductores (o 6 rayos), con dos ramas por arco. El parpadeo es lento (por debajo de 3 Hz) y suave: el brillo nunca depende de destellos fuertes; en «Tormenta», el destello de las nubes sólo crece con «Parpadeo».',
  sources: [
    { label: 'Radiant · Voltage Arc, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Radiant · Thunder Sermon (MIT; referencia de la variante tormenta, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Pautas de accesibilidad: tres destellos o menos (WCAG 2.3.1)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html' },
  ],
  hints: {
    layout: 'Arcos en anillo entre conductores, desde un conductor central, o rayos de tormenta.',
    count: 'Cuántos conductores (o cuántos rayos en la tormenta).',
    jag: 'Cuánto se retuercen los arcos.',
    branches: 'Largo y presencia de las ramas.',
    crackle: 'Lo rápido que cambia la forma de cada arco.',
    glow: 'Halo alrededor de los arcos.',
    flicker: 'Un pulso de brillo lento y suave; en la tormenta, cuánto se iluminan las nubes.',
    motion: 'Lo rápido que se mueven los conductores (o lo frecuentes que son los rayos).',
  },
  presets: {
    anillo: 'Cuatro conductores en órbita con arcos entre vecinos y uno que cruza de vez en cuando.',
    plasma: 'Un conductor central que lanza arcos muy retorcidos hacia cinco más.',
    tormenta: 'Rayos ramificados que bajan de una franja de nubes, uno tras otro.',
    chispa: 'Un solo arco ámbar entre dos electrodos, nervioso y con pocas ramas.',
  },
};
