import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una lámina de metal líquido que fluye: oro, plata o cobre con relieve, gotas que se funden y reflejos que corren.',
  mechanism: 'Es el mármol convertido en relieve. Un ruido fractal se deforma tres veces seguidas (cada deformación mueve el punto donde lee la siguiente) y da la altura de la superficie; encima, unas gotas de metabolas (Σ r²/d² con un umbral suave) se redondean y se funden entre sí. La normal de esa altura refleja la mirada hacia un estudio de fotografía (suelo oscuro, una franja clara en el horizonte y una caja de luz arriba) y hacia una luz principal con su brillo de Blinn. El reflejo se tiñe con la reflectancia del metal y se vuelve blanco en los bordes rasantes (Fresnel de Schlick): por eso el oro parece oro y no amarillo plano. El carácter sale del brillo reflejado.',
  time: 'Una función del tiempo: las tres deformaciones se desplazan a ritmos distintos y las gotas siguen trayectorias sin proporción entre sí, así que el metal fluye sin reinicio y no es periódico. «Bucle perfecto» lo funde con su inicio, como cualquier patrón.',
  limits: 'Cada celda evalúa la altura tres veces (para la normal): siete ruidos fractales de cuatro octavas cada vez y cinco gotas. El estudio es fijo (no refleja otras capas) y el relieve sólo cambia la luz, no el contorno.',
  sources: [
    { label: 'Radiant · static/liquid-gold.html, de Paul Bakaus (MIT, «Copyright (c) 2025 Paul Bakaus»; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Inigo Quilez · Domain warping (técnica de deformar el dominio de un ruido)', url: 'https://iquilezles.org/articles/warp/' },
    { label: 'Aproximación de Schlick al término de Fresnel', url: 'https://en.wikipedia.org/wiki/Schlick%27s_approximation' },
    { label: 'Modelo de reflexión de Blinn–Phong', url: 'https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model' },
  ],
  hints: {
    metal: 'Qué metal refleja: oro, plata, cobre o los colores de la paleta de la pieza.',
    scale: 'Tamaño de las ondas del metal: grandes masas o un martillado fino.',
    warp: 'Cuánto se retuerce la superficie: de ondas suaves a remolinos de mármol.',
    drops: 'Gotas que se redondean y se funden sobre la lámina; a cero, sin gotas.',
    speed: 'Velocidad a la que fluye el metal.',
    relief: 'Altura del relieve: más relieve, reflejos más quebrados.',
    shine: 'Brillo de la luz principal: de satinado a pulido espejo.',
    light: 'Desde dónde llega la luz (gira el estudio que se refleja).',
  },
  presets: {
    oro: 'Oro con remolinos y algunas gotas: la referencia del efecto.',
    plata: 'Plata pulida con muchas gotas grandes que se juntan y se separan.',
    cobre: 'Ondas pequeñas y mucho relieve: un cobre martillado que apenas se mueve.',
    marea: 'Grandes masas de oro muy torcidas y sin gotas, que fluyen despacio.',
    iris: 'El metal toma los colores de la paleta: un reflejo iridiscente de aceite.',
  },
};
