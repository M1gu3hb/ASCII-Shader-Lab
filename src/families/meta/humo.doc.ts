import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Miles de partículas de humo que se enroscan en filamentos y volutas alrededor de un punto que orbita, sube o deambula.',
  mechanism: 'Ruido rizado: cada partícula se mueve con el rotacional de un potencial de tres ruidos de gradiente 3D que se deslizan despacio en el tiempo (v = ∇ × Ψ). El rotacional no tiene divergencia, así que el flujo no amontona ni vacía: estira el humo en filamentos y remolinos. Una correa suave tira hacia el objetivo sólo más allá de un radio, y un empuje vertical hace subir la columna. Cada partícula tiene una vida que se agota; al acabarse renace dentro de una esfera alrededor del objetivo (o de uno de seis emisores que deambulan cuando no hay objetivo). Se dibuja con una cámara que orbita despacio: cada partícula es un trazo corto en la dirección de su movimiento, más brillante cuanto más cerca, que aparece y se apaga con su edad y se oscurece donde otras partículas le tapan la luz (relieve). Desde la versión 2 el humo tiene color propio: cada partícula lleva un tono según su edad (nace cálido y se enfría y agrisa al apagarse), su profundidad (cerca cálido, lejos frío) o el foco del que salió; se acumula con el mismo peso que su luz a media resolución, se suaviza una vez y se lee como dirección de color, así que volutas y filamentos conservan tonos coherentes en lugar de un ruido multicolor. El glifo se elige por la luminancia y se tiñe con ese color cuando la pieza toma los colores de la familia.',
  time: 'Continuo: el humo se renueva sin parar y el ruido se desliza sin repetirse; la cámara gira con el reloj de la capa. No tiene bucle perfecto. Arranca con 2 s de calentamiento y se puede guardar su estado.',
  limits: 'Hasta 12 000 partículas (3 ruidos de gradiente por partícula y paso), 3 muestras por trazo, densidad para la sombra a media resolución, 6 emisores sin objetivo. Color (versión 2): cuatro acumuladores a media resolución (rgb y peso), una pasada de suavizado. «Un tono por foco» sólo distingue focos sin objetivo (seis emisores); con un objetivo se colorea por edad.',
  sources: [
    { label: 'Bridson, Hourihan y Nordenstam (2007): Curl-Noise for Procedural Fluid Flow', url: 'https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf' },
    { label: 'The Spirit (MIT, © 2015 Edan Kwan): partículas por ruido rizado alrededor de un objetivo; referencia de la idea, no se copió código', url: 'https://github.com/edankwan/The-Spirit' },
    { label: 'Perlin (2002): Improving Noise (ruido de gradiente con interpolación quíntica)', url: 'https://doi.org/10.1145/566654.566636' },
  ],
  hints: {
    count: 'Cuántas partículas forman el humo: más, volutas más llenas.',
    target: 'Dónde nace el humo: un punto que orbita, un foco fijo abajo, o varios emisores que deambulan y llenan el volumen.',
    scale: 'Tamaño de los rizos: pequeño, hebras finas y nerviosas; grande, volutas amplias.',
    speed: 'Lo rápido que el flujo arrastra el humo.',
    life: 'Cuánto vive cada partícula antes de renacer: más vida, estelas más largas.',
    attract: 'Fuerza de la correa que devuelve el humo hacia el objetivo cuando se aleja.',
    radius: 'Tamaño de la esfera donde renace el humo.',
    rise: 'Empuje vertical: positivo, el humo sube como si estuviera caliente; negativo, cae.',
    orbit: 'Velocidad de giro de la cámara alrededor del humo (con signo).',
    tilt: 'Altura de la cámara: de mirar desde abajo a mirar desde arriba.',
    zoom: 'Acerca o aleja la cámara.',
    trail: 'Largo del trazo de cada partícula: de polvo suelto a filamentos.',
    shadow: 'Cuánto se oscurecen las partículas tapadas por otras: da volumen y relieve.',
    gain: 'Exposición de la densidad.',
    color: 'De qué depende el color del humo (se ve cuando la pieza usa «Colores de la familia»): su edad, su profundidad o el foco del que sale.',
    hue: 'Tono de partida: el del humo recién nacido, el más cercano o el del primer foco.',
    spread: 'Hacia dónde gira el color desde el tono de partida (y cuánto): 0, un solo tono; positivo o negativo, el humo cambia de color hacia un lado u otro del círculo.',
  },
  presets: {
    espiritu: 'El objetivo orbita despacio y deja detrás una estela que se enrosca en volutas: una figura de humo que vuela.',
    fumarola: 'Un foco fijo abajo y un empuje hacia arriba: una columna que sube, se ensancha y se deshilacha.',
    nebulosa: 'Seis emisores que deambulan en un volumen amplio, rizos grandes y flujo lento: nubes con bordes de filamento que llenan el lienzo.',
    seda: 'Rizos pequeños, flujo rápido y trazos largos: hebras de seda que se cruzan.',
    incienso: 'Una columna fina que sube desde abajo: el humo nace anaranjado y se enfría hacia el rojo, el magenta y el gris mientras se deshace.',
    aurora: 'Nubes que llenan el volumen con el color de su profundidad: verdes cerca, azules y violetas lejos.',
    focos: 'Seis focos que deambulan, cada uno con su tono entre el magenta y el naranja: hebras que se cruzan sin mezclarse en barro.',
  },
};
