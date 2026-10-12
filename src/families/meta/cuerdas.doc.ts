import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cuerdas tensas que se pulsan una tras otra y vibran con sus armónicos, dejan una estela y sueltan polvo de resina.',
  mechanism: 'Donde la catenaria cuelga quieta, aquí cada cuerda está sujeta por sus dos extremos y vibra. Una cuerda pulsada en una fracción p de su largo toma la forma de un triángulo, que es la suma de sus modos estacionarios: Σ aₙ·sin(nπs) con aₙ = 2·sin(nπp)/(n²π²·p(1 − p)). Se suman los primeros uno a cuatro modos; cada uno oscila como cos(ωₙt) y se apaga como e^(−γₙt), más deprisa los agudos (la envolvente). «Rigidez» estira los armónicos altos (ωₙ = n·ω₁·√(1 + B·n²)). Cada cuerda se pulsa una vez por ciclo (en arpegio, en acorde o alternas), y en los últimos instantes del ciclo el dedo la vuelve a tensar hasta la forma del pulso, así que soltarla no es un salto. Pulsar en el centro anula los armónicos pares; cerca del extremo, el sonido «brilla» con muchos. «Estela» añade el velo que barre una cuerda vibrando, más claro en los extremos del recorrido, y del punto de pulsación salta un poco de polvo de resina que flota y cae.',
  time: 'Bucle exacto de «Ciclo» segundos: cada cuerda sólo depende del tiempo desde su propio pulso (módulo el ciclo), así que todo vuelve a empezar igual.',
  limits: 'Hasta doce cuerdas y cuatro modos por cuerda; ocho motas de resina por pulso. Las cuerdas son ideales (sin acoplamiento entre ellas ni sonido).',
  sources: [
    { label: 'Radiant · static/resonant-strings.html, de Paul Bakaus (MIT, «Copyright (c) 2025 Paul Bakaus»; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Cuerda vibrante: ecuación de onda y modos normales', url: 'https://en.wikipedia.org/wiki/String_vibration' },
    { label: 'Inarmonicidad de las cuerdas rígidas', url: 'https://en.wikipedia.org/wiki/Inharmonicity' },
  ],
  hints: {
    strings: 'Cuántas cuerdas hay.',
    modes: 'Cuántos armónicos suman su vibración (1: una onda pura).',
    pluck: 'Dónde se pulsa: cerca del extremo, más armónicos; en el centro, sólo los impares.',
    amp: 'Cuánto se aparta la cuerda al pulsarla.',
    period: 'Cada cuánto se pulsa cada cuerda: la duración del bucle.',
    freq: 'Lo deprisa que vibra la cuerda.',
    decay: 'Lo deprisa que se apaga la vibración.',
    pattern: 'Orden de los pulsos: una tras otra, casi a la vez, o pares e impares alternados.',
    exposure: 'El velo que deja la cuerda al vibrar, como en una foto de larga exposición.',
    rosin: 'Polvo de resina que salta al pulsar.',
    width: 'Grosor de las cuerdas.',
    stiff: 'Rigidez: los armónicos altos se desafinan y la forma se tuerce.',
    length: 'Largo de las cuerdas.',
    spread: 'Ancho que ocupan todas las cuerdas.',
    tune: 'Las cuerdas de la derecha más cortas y agudas: la silueta de un arpa.',
  },
  presets: {
    arpa: 'Nueve cuerdas de arpa pulsadas una tras otra, de grave a agudo.',
    acorde: 'Seis cuerdas rasgueadas casi a la vez, pulsadas cerca del extremo: muchos armónicos y mucha resina.',
    grave: 'Una sola cuerda grave pulsada en el centro, con un gran velo de larga exposición.',
    armonicos: 'Doce cuerdas finas que vibran por pares e impares con sus armónicos altos.',
  },
};
