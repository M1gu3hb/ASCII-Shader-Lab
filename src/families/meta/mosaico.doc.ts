import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una pared de teselas que se dan la vuelta en olas; cada pasada descubre una imagen nueva.',
  mechanism: 'Cada tesela es un bloque exacto de celdas de carácter. Una ola recorre la pared (de lado, de arriba abajo, en diagonal, en anillos o como un barrido que gira) y, a su paso, cada tesela gira 180° sobre un eje: su cara se estrecha con el coseno del ángulo, se queda de canto como una franja de una celda (su borde dorado) y abre la otra cara. Lo que cubre cada celda se calcula con exactitud, así que el estrechamiento avanza celda a celda. La cara que descubre cada pasada es una imagen nueva: al azar por tesela o formas grandes y suaves que el frente dibuja sobre la pared. Cada tesela está un poco inclinada y una luz que se desplaza saca destellos entre pasada y pasada.',
  time: 'Sigue cambiando sin reinicio: cada pasada descubre una imagen que no se repite y la luz deriva. No es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Las teselas miden de 2 a 6 filas y un número impar de columnas, casi cuadradas con la proporción de celda por defecto (1,4); con otra proporción quedan algo más anchas o estrechas.',
  sources: [
    { label: 'Radiant · Gilt Mosaic (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
  ],
  hints: {
    size: 'Alto de cada tesela en filas de caracteres (el ancho se ajusta para que sea casi cuadrada).',
    dir: 'Por dónde avanza la ola y, con ella, el eje sobre el que gira cada tesela.',
    speed: 'Lo rápido que avanza la ola.',
    spacing: 'Distancia entre una ola y la siguiente: poca, muchas olas a la vez.',
    flip: 'Qué parte de cada pasada dura el giro: corto, un chasquido; largo, un giro lento.',
    scatter: 'Retraso al azar por tesela: el frente se deshilacha.',
    picture: 'Qué descubre cada pasada: teselas al azar (0) o formas grandes que cruzan la pared (1).',
    glints: 'Destellos de las teselas inclinadas bajo la luz que se mueve.',
  },
  presets: {
    ola: 'Olas de izquierda a derecha que van cambiando formas grandes, con brillos fríos.',
    anillos: 'Teselas pequeñas que voltean en anillos que salen del centro.',
    cartel: 'Teselas grandes que caen de arriba abajo, desordenadas, como un cartel de estadio que cambia de imagen.',
    dorado: 'Teselas pequeñas en diagonal, muy desordenadas, con destellos dorados.',
    barrido: 'Un barrido que gira como un radar y voltea la pared a su paso.',
  },
};
