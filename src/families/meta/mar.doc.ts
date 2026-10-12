import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un mar de noche en perspectiva: la luna se rompe en una columna de destellos sobre las olas.',
  mechanism: 'Cada celda bajo el horizonte lanza un rayo desde una cámara sobre el agua y lo cruza con el plano del mar. La superficie es una suma de ocho olas con la relación de dispersión de aguas profundas (ω = √(g·k)): las olas largas corren más que las cortas y la suma no se repite. La normal sale del gradiente exacto de esa suma, y las olas más cortas que unas pocas celdas de agua se apagan con la distancia (sin ruido junto al horizonte). El rayo se refleja y lee el cielo en esa dirección, pesado por el término de Fresnel de Schlick: la luna, mucho más brillante que el cielo, se rompe en una columna de destellos (además, el reflejo de cada celda se desvía un poco por su cuenta, como facetas más pequeñas que una celda: la estela centellea). «Plancton» enciende las crestas con un parpadeo lento por celda. Sobre el horizonte, bruma, la luna con su halo y algunas estrellas.',
  time: 'Una función del tiempo: las ocho olas tienen frecuencias que no guardan proporción entre sí, así que sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Ocho olas, un plano de agua (la altura de las olas sólo cambia la luz, no el perfil del horizonte). La luna está siempre delante, entre izquierda y derecha.',
  sources: [
    { label: 'Radiant · Moonlit Ripple y Bioluminescence, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Relación de dispersión de las olas en aguas profundas', url: 'https://en.wikipedia.org/wiki/Dispersion_(water_waves)' },
    { label: 'Aproximación de Schlick al término de Fresnel', url: 'https://en.wikipedia.org/wiki/Schlick%27s_approximation' },
  ],
  hints: {
    waves: 'Altura de las olas: de agua quieta a mar picado.',
    scale: 'Largo de las olas: ondas cortas o mar de fondo.',
    wind: 'Dirección hacia la que corren las olas.',
    horizon: 'Altura del horizonte en el lienzo: más mar o más cielo.',
    moon: 'Tamaño de la luna; a cero, sin luna.',
    moonH: 'Altura de la luna sobre el horizonte: baja, alarga su estela.',
    moonX: 'Posición de la luna a izquierda o derecha.',
    plankton: 'Crestas que se encienden con un brillo propio.',
  },
  presets: {
    lago: 'Agua casi quieta y una estela fina bajo una luna alta.',
    mar_fondo: 'Olas largas y altas, luna baja a un lado y estela ancha y rota.',
    plancton: 'Sin luna: las crestas se encienden en verde azulado; mucho mar.',
    plata: 'Luna grande y horizonte bajo: un camino de plata que llega hasta abajo.',
  },
};
