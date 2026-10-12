import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Nubes con volumen que llenan el cuadro: un mar de nubes, un vuelo entre ellas, haces de luz o una nebulosa con estrellas.',
  mechanism: 'Cada celda recorre un rayo a través de una capa de densidad hecha con ruido fractal, recortada por la cobertura y erosionada en los bordes. La luz se apaga según la ley de Beer–Lambert; cada muestra mira hacia el sol para saber cuánta luz le llega y la reparte con una función de fase de Henyey–Greenstein (el borde plateado a contraluz). La nebulosa es otra escena: gas que brilla por sí mismo (más cerca de una estrella), cortado en filamentos y atravesado por franjas de polvo oscuro, delante de un campo de estrellas.',
  time: 'Continuo: el viento arrastra el ruido sin volver nunca al mismo sitio y, dentro de la capa o de la nebulosa, avanzas a través de ella. Al cruzar de cerca una nube puede llenar el cuadro unos segundos. Sin viento (0), la imagen se queda quieta.',
  limits: 'Hasta 64 pasos de rayo por celda, 5 hacia el sol por muestra iluminada y 3 por muestra de bruma; cada muestra son 4 o 5 octavas de ruido. La nebulosa, hasta 64 pasos sin mirar hacia la luz (seis octavas de ruido por paso).',
  sources: [
    { label: 'Maxime Heckel: Real-time dreamy cloudscapes with volumetric raymarching (sólo la técnica)', url: 'https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/' },
    { label: 'Hillaire (2016): Physically based sky, atmosphere and cloud rendering in Frostbite (curso de SIGGRAPH)', url: 'https://blog.selfshadow.com/publications/s2016-shading-course/' },
    { label: 'Ley de Beer–Lambert', url: 'https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law' },
  ],
  hints: {
    'cover': 'Cuánto cielo tapan las nubes; con 0, despejado.',
    'scale': 'Tamaño de las nubes.',
    'erosion': 'Deshilacha los bordes con un ruido más fino.',
    'wind': 'Velocidad con que se mueven las nubes.',
    'sun': 'Posición del sol: a tu espalda (0) o enfrente, a contraluz (1).',
    'absorb': 'Lo opacas que son: con más, el interior se oscurece y las bases se vuelven grises.',
    'steps': 'Pasos del rayo a través de la capa.',
    'camera': 'Dentro: vuelas a través de la capa. Haces: bajo la capa, en una bruma que el sol atraviesa por los huecos. Nebulosa: gas luminoso y polvo oscuro delante de las estrellas («Luz» mueve la estrella; «Absorción», el polvo).',
    'contrast': 'Oscurece la bruma y el cielo más tenues y aviva la luz: huecos negros y haces más nítidos (no cambia la nebulosa, que ya lleva su punto negro). 0: como antes.',
  },
  presets: {
    'banco': 'Un mar de nubes desde arriba, con el sol bajo que ilumina las cimas y el horizonte en bruma.',
    'nebulosa': 'Gas rosado que brilla alrededor de una estrella, franjas de polvo negro y estrellas al fondo, mientras avanzas despacio.',
    'haces': 'Bajo una capa casi cerrada: el sol entra por los huecos y dibuja columnas en la bruma.',
    'dentro': 'Vuelas entre nubes deshilachadas a contraluz, con huecos de cielo oscuro entre ellas.',
  },
};
