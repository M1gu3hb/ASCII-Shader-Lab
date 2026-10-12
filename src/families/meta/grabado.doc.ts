import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una punta incandescente recorre tus palabras, una figura o una firma y deja un surco en relieve que se enfría, entre chispas y humo.',
  mechanism: 'Con texto en la pieza, la capa lee la máscara de tus letras y saca sus contornos con marching squares (el borde exterior y los huecos de la O, la B o la A; la tilde de la ñ y los acentos son piezas propias); dentro de cada letra añade cortes paralelos, curvas de nivel de la distancia al borde. Sin texto graba una palabra propia con un trazo sencillo, una figura (polígono, estrella, espirógrafo, rosa, Lissajous) o una firma cursiva hecha de curvas de Catmull–Rom. Los trazos se ordenan letra a letra por cercanía y se unen con desplazamientos rectos con el láser apagado: la punta va cuatro veces más rápida y no graba nada entre un contorno y otro. La punta avanza por longitud de arco a la velocidad elegida y deja calor; el calor se enfría y, mientras está caliente, cava: el surco se ensancha y se hace hondo detrás de la punta. El surco se dibuja como relieve, con su normal bajo una luz desde arriba a la izquierda (una pared iluminada, otra en sombra), y el corte fresco guarda un tono templado unos segundos. Las chispas salen hacia atrás y hacia arriba, caen con gravedad y se apagan; el humo sube, ondula y se abre.',
  time: 'Continuo con «Enfría y sigue grabando»: al terminar la forma se enfría un segundo y la punta empieza otra pasada desde donde está (las mismas palabras con los cortes interiores desplazados medio paso, la figura o la firma siguientes) mientras los surcos viejos se borran según la persistencia; no reinicia ni es periódico. Con «Una vez y se queda» es una construcción: graba, se enfría y se queda quieto. Escribir otro texto, cambiar el origen o los cortes empieza otra ruta desde la punta y lo grabado se disuelve en medio segundo. Arranca con 0,4 s grabados y se puede guardar su estado.',
  limits: 'La ruta se lee de la máscara del texto en una rejilla de hasta 384 × 192 muestras: letras muy pequeñas o finas pueden quedar sin contorno. Hasta 5 cortes paralelos, 320 chispas y 240 bocanadas de humo. Con foto o video como fuente no la lee: graba su palabra propia. La palabra propia admite mayúsculas y minúsculas sin distinguir, cifras, signos comunes, tildes, diéresis, ñ y ç; «|» parte la línea.',
  sources: [
    { label: 'Lorensen y Cline (1987): Marching Cubes (marching squares es su versión en el plano)', url: 'https://doi.org/10.1145/37402.37422' },
    { label: 'Felzenszwalb y Huttenlocher (2012): Distance Transforms of Sampled Functions', url: 'https://doi.org/10.4086/toc.2012.v008a019' },
    { label: 'Douglas y Peucker (1973): simplificación de polilíneas', url: 'https://doi.org/10.3138/FM57-6770-U75U-7727' },
    { label: 'Catmull y Rom (1974): A class of local interpolating splines', url: 'https://doi.org/10.1016/B978-0-12-079050-0.50020-5' },
  ],
  hints: {
    origen: 'Texto: tus palabras (en Texto); sin texto en la pieza graba la palabra propia. Forma: figuras geométricas. Curva: una firma cursiva.',
    palabra: 'Lo que graba cuando la pieza no tiene texto (Fondos, Terminal), con un trazo sencillo. Vacía: graba una figura. «|» parte la línea.',
    velocidad: 'Lo rápido que avanza la punta mientras graba (en alturas del lienzo por segundo); los desplazamientos van cuatro veces más rápidos.',
    grosor: 'Ancho del surco que deja la punta.',
    pasadas: 'Cortes paralelos por trazo: dentro de cada letra o figura, o a los lados de la línea de la palabra propia y de la firma.',
    chispas: 'Cuántas chispas saltan de la punta mientras corta.',
    humo: 'Cuánto humo sube del corte.',
    persistencia: 'Cuánto dura el surco antes de borrarse (sólo «Enfría y sigue grabando»): de una estela que se apaga en un segundo a un grabado que dura minutos.',
    material: 'La placa: acero cepillado y latón (surco claro sobre fondo oscuro) o madera (surco quemado sobre la veta).',
    figura: 'Con «Forma»: una figura distinta en cada pasada o siempre la misma clase.',
    ciclo: 'Qué hace al terminar: enfría y sigue con otra pasada (continuo) o se queda con la placa terminada (construcción).',
  },
  presets: {
    'tu-palabra': 'Tus palabras en acero: contorno y dos cortes paralelos dentro de cada letra, letra a letra, con chispas; el grabado dura minutos.',
    geometria: 'Figuras que cambian en cada pasada (polígonos, estrellas, espirógrafos, rosas) en latón, rápidas, con dos contornos concéntricos.',
    firma: 'Una firma cursiva quemada en madera, despacio y con humo; cada pasada, otra firma.',
    placa: 'Tus palabras en latón con cuatro cortes por letra, una sola vez: se enfría y se queda la placa terminada.',
    luz: 'La punta corre sobre tus palabras y el surco se apaga casi enseguida: una estela de luz que escribe.',
  },
};
