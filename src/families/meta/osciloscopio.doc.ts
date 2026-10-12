import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una traza de osciloscopio que pasa de la calma a la distorsión y se derrumba, una y otra vez, nunca igual.',
  mechanism: 'La señal limpia es una suma de armónicos cuya fase va corriendo, así que la traza no se detiene. Un ciclo lleva la envolvente de la calma a la crecida, al grito y al derrumbe, y con él una degradación que alimenta una cadena: modulación de frecuencia, recorte suave y después duro, reducción de bits (menos niveles y una muestra retenida a lo ancho) y ruido. La mezcla de esa cadena y el peso de los armónicos cambian de un ciclo a otro mientras la traza está plana. El brillo de cada celda sale de su distancia a la poligonal que une tres muestras de la traza, así que los escalones y los flancos verticales también se dibujan; la persistencia suma copias de un instante antes que se apagan, como el fósforo. La retícula es opcional.',
  time: 'Una función del tiempo: la envolvente vuelve en cada ciclo, pero la deriva de los armónicos y la mezcla de la degradación cambian siempre, y la envolvente vale lo mismo al principio y al final del ciclo (sin saltos). Sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 6 armónicos y 3 copias de persistencia. Es una traza en el tiempo (y frente a x), distinta de «Lissajous», que dibuja x contra y.',
  sources: [
    { label: 'Radiant · Signal Decay y Scream Wave, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Reducción de resolución en bits (bitcrushing)', url: 'https://en.wikipedia.org/wiki/Bitcrusher' },
  ],
  hints: {
    harmonics: 'Cuántos armónicos forman la señal: de un seno puro a una onda compleja.',
    degrade: 'Hasta dónde llega la degradación en lo más alto de cada ciclo.',
    cycle: 'Segundos de calma, crecida, grito y derrumbe.',
    noise: 'Ruido que la señal lleva siempre, además del que trae la degradación.',
    grid: 'La retícula del osciloscopio: completa, sólo los ejes o nada.',
    persist: 'Rastro que deja la traza, como el fósforo de una pantalla.',
    gain: 'Altura de la señal en la pantalla.',
    freq: 'Cuántas ondas caben a lo ancho.',
  },
  presets: {
    limpia: 'Un seno que corre despacio sobre la retícula; apenas se degrada.',
    interferencia: 'Cuatro armónicos que se llenan de escalones y ruido en cada ciclo.',
    grito: 'La señal crece hasta recortarse del todo y se derrumba, con un rastro largo.',
    fosforo: 'Una traza ámbar muy lenta que deja una estela larga.',
  },
};
