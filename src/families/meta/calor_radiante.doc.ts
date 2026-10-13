import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Calor que irradia desde uno a tres focos: lenguas de temperatura que fluyen hacia fuera, aire que reverbera y brasas que vuelan.',
  mechanism: 'Un campo de temperatura nace de uno a tres focos y cae con la distancia. Antes, el espacio se dobla con el rotacional de un ruido fBm (sus derivadas, tomadas por diferencias): la reverberación del aire caliente, un flujo que se arremolina sin amontonarse. Alrededor del foco principal, un fBm leído en coordenadas polares —dirección y logaritmo de la distancia— da lenguas de calor que fluyen hacia fuera y cambian hasta dónde llega el calor; el calor sube (llega más lejos por encima), parpadea, y un calor ambiente tibio llena el resto. Las brasas salen disparadas de los focos, suben, dejan una estela corta y se enfrían al envejecer. La temperatura elige el carácter y el color con un mapa térmico: cuerpo negro, cámara térmica o brasa.',
  time: 'Una función del tiempo: las lenguas fluyen hacia fuera sin repetirse y cada brasa vive su vida a su ritmo; sigue cambiando sin reinicio. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Tres focos y treinta y dos brasas como mucho; las lenguas siguen al foco principal. No es una simulación de combustión: el calor no se propaga de celda en celda.',
  sources: [
    { label: 'Radiant · Smolder, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Ruido con rotacional (curl noise), de Robert Bridson', url: 'https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf' },
    { label: 'Radiación de cuerpo negro (el color según la temperatura)', url: 'https://es.wikipedia.org/wiki/Cuerpo_negro' },
  ],
  hints: {
    sources: 'De uno a tres focos de calor.',
    heat: 'Lo caliente que están los focos.',
    reach: 'Hasta dónde llega el calor de cada foco.',
    turb: 'Cuánto se rompe el calor en lenguas que salen del foco.',
    shimmer: 'La reverberación del aire caliente que lo ondula todo.',
    flow: 'Lo deprisa que las lenguas fluyen hacia fuera.',
    flicker: 'El parpadeo de los focos.',
    rise: 'Cuánto sube el calor: llega más lejos por encima y las brasas flotan.',
    embers: 'Cuántas brasas vuelan.',
    emberSpeed: 'Lo deprisa que salen disparadas.',
    emberLife: 'Cuánto tardan en enfriarse.',
    map: 'Los colores de la temperatura: cuerpo negro, cámara térmica o brasa.',
    ambient: 'El calor tibio que llena el resto del cuadro.',
  },
  presets: {
    rescoldo: 'Un solo foco que respira con lenguas de calor y brasas que suben despacio, en colores de cuerpo negro.',
    termografia: 'Tres focos vistos con una cámara térmica: violetas, magentas y amarillos, con el ambiente templado.',
    fragua: 'Un foco pequeño y muy caliente, muy turbulento, que escupe muchas chispas rápidas.',
    braseros: 'Dos braseros rojos con el aire reverberando y brasas que flotan mucho tiempo.',
  },
};
