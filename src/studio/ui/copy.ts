/**
 * What the studio's controls say about themselves: one short hint per control (shown on focus or
 * hover, and read by screen readers), a fuller explanation behind «?», and one line per option of the
 * pickers. Plain data, keyed by recipe path (layer settings as `layers.*.key`), so every control finds
 * its own text and a unit test can check that nothing is missing.
 */
import type { BlendMode, ColorMap, DitherKind, Fit, GlyphMode, InteractMode, MsgMode, SourceKind } from '../../engine/recipe';

export interface HelpText {
  /** One line: what the control does. */
  hint: string;
  /** A few sentences more, shown when «?» is pressed. */
  more?: string;
}

export const HELP: Record<string, HelpText> = {
  /* layers */
  'layers.*.pattern': { hint: 'El dibujo que se convierte en caracteres.', more: 'Cada patrón es una fórmula que se mueve sola. Puedes apilar hasta cuatro capas y mezclarlas: el dado de al lado prueba otro al azar.' },
  'layers.*.blend': { hint: 'Cómo se combina esta capa con las de debajo.', more: '«Normal» la pone encima; «Multiplicar» sólo oscurece; «Trama» sólo aclara; «Diferencia» invierte donde coinciden. El dibujo de cada opción muestra dos formas mezcladas así.' },
  'layers.*.mix': { hint: 'Cuánto se nota esta capa.', more: 'En la primera capa es su intensidad; en las demás, cuánto pesa la mezcla con lo que hay debajo. En 0 la capa no se ve.' },
  'layers.*.scale': { hint: 'Tamaño del dibujo: más escala, formas más grandes.' },
  'layers.*.speed': { hint: 'Qué tan rápido se mueve esta capa. Negativo la mueve al revés.' },
  'layers.*.rot': { hint: 'Gira el dibujo de esta capa.' },
  'layers.*.invert': { hint: 'Cambia lo lleno por lo vacío en esta capa.' },
  'layers.*.a': { hint: 'Ajuste propio de este patrón.', more: 'Cada patrón tiene dos ajustes propios; su nombre dice qué cambian (densidad, torsión, pétalos…). Muévelo y mira el lienzo.' },
  'layers.*.b': { hint: 'Segundo ajuste propio de este patrón.', more: 'Cada patrón tiene dos ajustes propios; su nombre dice qué cambian. Muévelo y mira el lienzo.' },
  'motion.warp': { hint: 'Retuerce todo el dibujo, como visto a través del agua.', more: 'Desplaza cada punto según un ruido que se mueve despacio. Poco da un temblor orgánico; mucho, formas líquidas que ya no se reconocen.' },
  'motion.warpScale': { hint: 'Pequeño: rizos finos. Grande: ondas amplias.' },

  /* colour */
  'color.bg': { hint: 'El color detrás de los caracteres (y de las celdas vacías).' },
  'color.mode': { hint: 'Colorea con tu paleta o con los colores de la propia imagen.' },
  'color.vivid': { hint: 'Aviva los colores de la imagen para que se lean en caracteres pequeños.' },
  'color.map': { hint: 'Cómo se reparten los colores de la paleta por la pieza.', more: '«Por brillo» pinta lo vacío con el primer color y lo lleno con el último. Las demás opciones reparten la paleta por la posición: de un lado a otro, desde el centro o girando, sin importar el brillo.' },
  'color.shade': { hint: 'Apaga los caracteres de las zonas oscuras.', more: 'En 0 todos los caracteres tienen el mismo brillo de su color; en 1, los de las zonas oscuras se dibujan más tenues, y la pieza gana volumen.' },
  'color.shift': { hint: 'Desliza la paleta: cada zona toma el color de al lado.' },
  'color.cycle': { hint: 'Hace que los colores recorran la paleta con el tiempo.', more: 'Positivo o negativo cambia el sentido. Valores pequeños dan un cambio lento, casi imperceptible; en 0 los colores quedan quietos.' },
  'color.hue': { hint: 'Gira todos los colores por el círculo cromático.' },
  'color.sat': { hint: 'Menos: tonos grises. Más: colores intensos.' },

  /* glyphs */
  'glyph.cell': { hint: 'Tamaño de cada carácter en pantalla, en píxeles.', more: 'Pequeña: más detalle y más caracteres (más trabajo para el equipo). Grande: más gráfica y ligera. Compara tres tamaños con la pieza actual:' },
  'glyph.aspect': { hint: 'Alto de la celda dividido por su ancho: 2 es como una terminal.', more: 'Los caracteres de las fuentes monoespaciadas son más altos que anchos. 1 da celdas cuadradas; 2, el doble de altas que anchas, como en una consola. Si exportas a texto, la proporción decide cuántas filas salen.' },
  'glyph.charset': { hint: 'Los caracteres que dibujan, del vacío al lleno.', more: 'Muchos caracteres dan degradados suaves; pocos, más contraste y carácter. Los juegos ASCII son los más seguros en una terminal o un README (sólo cambia la tipografía); los Unicode (bloques, braille, símbolos) pueden verse distintos, o descuadrados, según la fuente.' },
  'glyph.charsetText': { hint: 'Escribe tus propios caracteres, del más vacío al más lleno.' },
  'glyph.sort': { hint: 'Reordena tus caracteres según la tinta que tiene cada uno en esta fuente.', more: 'Útil si escribiste los caracteres a mano: el estudio mide cuánto ocupa cada uno y los coloca del más vacío al más lleno. Desactívalo si el orden lo quieres tú.' },
  'glyph.font': { hint: 'La tipografía con la que se dibujan los caracteres.' },
  'glyph.weight': { hint: 'Trazo más fino o más grueso de los caracteres.' },
  'glyph.scale': { hint: 'Tamaño del carácter dentro de su celda: más grande se superpone.' },
  'glyph.mode': { hint: 'Cómo elige cada celda su carácter.' },
  'glyph.words': { hint: 'Este texto se repite por la pieza, letra a letra.' },
  'glyph.jitter': { hint: 'Qué tan rápido cambian o se desplazan los caracteres.' },
  'glyph.edge': { hint: 'Dibuja contornos con | / - \\ donde hay bordes.', more: 'Busca los bordes de la imagen (cambios bruscos de brillo) y pone un trazo con su inclinación. Da un aire de dibujo a mano; en el modo Líneas marca cuánto borde hace falta para dibujar.' },
  'glyph.dither': { hint: 'Alterna caracteres vecinos para simular tonos intermedios.', more: 'El tramado (dither) reparte un patrón fino entre dos caracteres cuando un tono cae entre ellos: los degradados se ven más suaves con pocos caracteres. «Ordenado» usa una retícula regular; «Ruido», un grano al azar.' },
  'glyph.ditherKind': { hint: 'Retícula regular o grano al azar para el tramado.' },

  /* tone */
  'tone.bright': { hint: 'Aclara u oscurece toda la pieza.' },
  'tone.contrast': { hint: 'Separa claros y oscuros.', more: 'Alto marca las formas pero pierde matices; bajo conserva los grises y puede quedar plano. Compara tres contrastes con la pieza actual:' },
  'tone.gamma': { hint: 'Aclara u oscurece los tonos medios sin tocar el blanco ni el negro.', more: 'Por debajo de 1 los grises se aclaran (salen más caracteres llenos); por encima, se oscurecen. Útil para rescatar detalle en fotos muy oscuras o muy claras.' },
  'tone.levels': { hint: 'Reduce los tonos a unos pocos escalones, como un cartel.' },
  'tone.invert': { hint: 'Lo claro pasa a oscuro y al revés.' },

  /* motion */
  'motion.speed': { hint: 'Velocidad de toda la animación. En 0 queda quieta.' },
  'motion.hold': { hint: 'Anima a saltos, como stop motion: fotogramas por segundo.', more: 'En «fluido» la pieza se mueve en cada fotograma de la pantalla. Con un número, cambia sólo esas veces por segundo: 8 a 12 da un aire artesanal.' },
  'motion.loop': { hint: 'Funde el final con el principio: la animación se repite sin saltos.', more: 'Ideal para GIF, video y fondos que no deben «saltar». El número es la duración del bucle en segundos; el video y el GIF la usan para enlazar perfecto. Lo que tiene su propio ritmo (letras que se mueven, el mensaje, Ondular) va un poco más rápido o más lento para dar vueltas enteras en ese tiempo; la Estela, que recuerda lo que pasó, empieza vacía en el primer fotograma de un clip.' },
  'motion.pulse': { hint: 'Latido: la pieza se encoge y brilla al ritmo del tempo.' },
  'motion.bpm': { hint: 'Tempo del latido, en pulsos por minuto.' },
  'interact.mode': { hint: 'Qué le pasa a la pieza bajo el cursor o el dedo.' },
  'interact.strength': { hint: 'Cuánto se nota el efecto del cursor.' },
  'interact.radius': { hint: 'Tamaño de la zona que toca el cursor.' },
  'interact.auto': { hint: 'Si nadie mueve el ratón, un cursor invisible recorre la pieza.' },

  /* effects */
  'fx.glow': { hint: 'Cada carácter brilla un poco más allá de su contorno.' },
  'fx.bloom': { hint: 'Las zonas claras desprenden un halo sobre las vecinas.', more: 'Como una foto sobreexpuesta o una pantalla de neón: la luz se derrama fuera de los caracteres. Es un efecto de imagen: no va en las exportaciones de texto ni en el SVG.' },
  'fx.cellBg': { hint: 'Pinta el fondo de cada celda con el color de su carácter.', more: 'Convierte la pieza en un mosaico: cada celda se rellena con un tono más apagado de su color, y el carácter queda encima.' },
  'fx.scan': { hint: 'Franjas horizontales, como un monitor antiguo.' },
  'fx.curve': { hint: 'Curva la imagen como el cristal de un televisor de tubo (CRT).' },
  'fx.vig': { hint: 'Oscurece los bordes y lleva la mirada al centro.' },
  'fx.chroma': { hint: 'Separa el rojo y el azul hacia los lados, como una lente barata.' },
  'fx.flicker': { hint: 'Pequeñas variaciones de brillo, como una pantalla vieja.' },
  'fx.grain': { hint: 'Grano de película por encima de todo.' },
  'fx.grid': { hint: 'Dibuja las líneas de la rejilla de celdas.' },

  /* source */
  'source': { hint: 'Qué se convierte en caracteres.' },
  'media.rate': { hint: 'Velocidad de reproducción del video.' },
  'media.fit': { hint: 'Cómo encaja la imagen en el lienzo.' },
  'media.zoom': { hint: 'Acerca la imagen.' },
  'media.panX': { hint: 'Mueve la imagen a izquierda o derecha.' },
  'media.panY': { hint: 'Mueve la imagen arriba o abajo.' },
  'media.mirror': { hint: 'Voltea la imagen como en un espejo.' },
  'media.reveal': { hint: 'Deja ver la foto original detrás de los caracteres.' },
  'media.mix': { hint: 'Cuánto del patrón de capas se mezcla con la fuente.', more: 'En 0 sólo ves la imagen o el texto; al subirlo, el patrón de la pestaña de capas entra según el modo de mezcla.' },
  'media.blend': { hint: 'Cómo entra el patrón en la imagen o el texto.', more: '«Multiplicar» rellena la forma con el patrón; «Máscara» sólo lo muestra dentro de la forma; «Recorte» lo muestra fuera.' },
  'text.content': { hint: 'El texto que se dibuja con caracteres. Enter para otra línea.' },
  'text.font': { hint: 'La tipografía del texto grande (no la de los caracteres).' },
  'text.weight': { hint: 'Trazo más fino o más grueso del texto.' },
  'text.size': { hint: 'Tamaño del texto dentro del lienzo.' },
  'text.tracking': { hint: 'Espacio entre letras.' },
  'text.leading': { hint: 'Espacio entre líneas.' },
  'text.align': { hint: 'Alineación de las líneas del texto.' },
  'text.italic': { hint: 'Inclina el texto.' },
  'text.morph': { hint: 'Cada tantos segundos el texto se deshace en el patrón y vuelve.' },

  /* message */
  'msg.on': { hint: 'Un texto literal que vive en la rejilla, por encima de la pieza.' },
  'msg.text': { hint: 'Lo que dice el mensaje. Enter para otra línea.' },
  'msg.mode': { hint: 'Cómo aparece el mensaje.' },
  'msg.speed': { hint: 'Letras por segundo al escribir, borrar o descifrar.' },
  'msg.hold': { hint: 'Cuánto se queda el mensaje completo antes de borrarse.' },
  'msg.x': { hint: 'Posición horizontal del mensaje.' },
  'msg.y': { hint: 'Posición vertical del mensaje.' },
  'msg.align': { hint: 'Alineación de las líneas del mensaje.' },
  'msg.box': { hint: 'Una placa opaca detrás del texto para que se lea.' },
  'msg.cursor': { hint: 'Un bloque que parpadea tras la última letra.' },
  'msg.color': { hint: 'Por defecto el mensaje usa el color más claro de la paleta.' },
};

/** Help for a recipe path (layer settings share one entry). */
export function helpFor(path: string): HelpText | undefined {
  return HELP[path] ?? HELP[path.replace(/^layers\.\d+\./, 'layers.*.')];
}

/* ------------------------------------------------------------------ */
/* One line per option                                                  */
/* ------------------------------------------------------------------ */

export const CHARSET_ASCII_LINE = 'ASCII puro: lo más seguro en terminales y README.';
export const CHARSET_UNICODE_LINE = 'Unicode: puede verse distinto según la fuente.';

export const COLOR_MAP_DESC: Record<ColorMap, string> = {
  luma: 'Lo vacío toma el primer color; lo lleno, el último.',
  x: 'La paleta va de izquierda a derecha.',
  y: 'La paleta va de arriba abajo.',
  radial: 'Del centro hacia los bordes.',
  angle: 'Gira alrededor del centro, como un reloj.',
  noise: 'Manchas de color que se desplazan despacio.',
};

export const BLEND_DESC: Record<BlendMode, string> = {
  normal: 'Encima de lo de abajo, según su fuerza.',
  add: 'Suma la luz: donde coinciden, se aclara.',
  multiply: 'Sólo oscurece: rellena la forma con el patrón.',
  screen: 'Sólo aclara, como dos proyectores.',
  overlay: 'Más contraste: aclara lo claro y oscurece lo oscuro.',
  difference: 'Invierte donde coinciden: efectos ópticos.',
  lighten: 'Se queda con lo más claro de las dos.',
  darken: 'Se queda con lo más oscuro de las dos.',
  mask: 'Sólo se ve dentro de la forma de abajo.',
  cutout: 'Hace un agujero con su forma.',
  subtract: 'Resta su luz a lo de abajo.',
};

export const GLYPH_MODE_DESC: Record<GlyphMode, string> = {
  density: 'Cada celda elige el carácter según su brillo.',
  lines: 'Sólo contornos: trazos | / - \\ donde hay bordes.',
  scramble: 'Caracteres al azar que cambian sin parar; el brillo sigue mandando.',
  words: 'Tu texto se repite por la pieza, letra a letra.',
};
/** A few characters that show each mode at a glance. */
export const GLYPH_MODE_ICON: Record<GlyphMode, string> = { density: '.:#@', lines: '/|\\-', scramble: 'k?7}', words: 'Aa' };

export const INTERACT_DESC: Record<InteractMode, string> = {
  none: 'El cursor no toca la pieza.',
  light: 'Ilumina alrededor del cursor.',
  ripple: 'Cada movimiento deja ondas, como en el agua.',
  lens: 'Agranda lo que hay bajo el cursor.',
  repel: 'Aparta los caracteres a su paso.',
  swirl: 'Los hace girar alrededor del cursor.',
  erase: 'Borra caracteres; con una foto, deja ver el original.',
  paint: 'Pinta con el cursor; el trazo se desvanece.',
  scramble: 'Revuelve los caracteres bajo el cursor.',
};
export const INTERACT_ICON: Record<InteractMode, string> = {
  none: '·', light: '◌', ripple: '≈', lens: '◎', repel: '↔', swirl: '@', erase: '░', paint: '▞', scramble: '?!',
};

export const SOURCE_DESC: Record<SourceKind, string> = {
  pattern: 'Patrones animados: la pieza se dibuja sola.',
  text: 'Un texto grande hecho de caracteres.',
  image: 'Una foto tuya; se procesa en tu navegador.',
  video: 'Un video tuyo, fotograma a fotograma.',
  camera: 'Tu cámara en directo (sólo al pulsar).',
};

export const MSG_MODE_DESC: Record<MsgMode, string> = {
  static: 'Siempre visible, sin animación.',
  type: 'Se escribe letra a letra y luego se borra.',
  decode: 'Aparece desde caracteres al azar, como descifrándose.',
  marquee: 'Desfila de lado a lado, como un letrero.',
  words: 'Aparece palabra a palabra y se va del mismo modo.',
};
export const MSG_MODE_ICON: Record<MsgMode, string> = { static: 'Ab', type: 'A_', decode: '#?b', marquee: '→A', words: 'A·B' };

export const FIT_DESC: Record<Fit, string> = {
  cover: 'Llena el lienzo y recorta lo que sobra.',
  contain: 'Se ve completa; puede dejar bandas vacías.',
  stretch: 'Llena el lienzo deformándola.',
};

export const DITHER_DESC: Record<DitherKind, string> = {
  bayer: 'Retícula regular, como la impresión de un periódico.',
  noise: 'Grano al azar, más orgánico.',
};
export const DITHER_ICON: Record<DitherKind, string> = { bayer: '▚', noise: '░' };

/** One line per font (what it looks like and where it shines). */
export const FONT_DESC: Record<string, string> = {
  system: 'La monoespaciada de tu sistema: cambia según el equipo.',
  jetbrains: 'Mono moderna y clara; buena en tamaños pequeños.',
  plex: 'Mono de IBM, sobria y técnica.',
  martian: 'Mono ancha y geométrica, la de GLYPHOS.',
  space: 'Mono con curvas de los años 70.',
  fira: 'Mono de programación; aquí sin ligaduras.',
  vt: 'Terminal de los 80: píxeles grandes y altos.',
  pixel: 'Píxel de videojuego de 8 bits.',
  silkscreen: 'Píxel fino y compacto.',
  silk: 'Píxel fino y compacto.',
  serif: 'Serifa elegante; no es monoespaciada.',
  sans: 'Palo seco pesada, para titulares.',
  courier: 'La máquina de escribir de siempre.',
};

/** One line per pattern: what it draws. */
export const PATTERN_DESC: Record<string, string> = {
  nube: 'Nubes suaves que se deslizan.',
  marmol: 'Vetas retorcidas, como piedra pulida.',
  crestas: 'Crestas afiladas, como montañas o llamas.',
  fuego: 'Llamas que suben.',
  aurora: 'Cortinas de luz ondulantes.',
  causticas: 'Reflejos de luz en el fondo del agua.',
  lava: 'Burbujas que se funden, como una lámpara de lava.',
  celulas: 'Células con relieve, como piel o espuma.',
  grietas: 'Grietas de barro seco.',
  anillos: 'Círculos concéntricos que laten.',
  cuadros: 'Cuadros concéntricos.',
  rayos: 'Rayos desde el centro.',
  tablero: 'Tablero de ajedrez que ondula.',
  truchet: 'Laberinto de curvas que se enlazan.',
  hex: 'Panal de hexágonos.',
  trama: 'Puntos de imprenta, como un cómic.',
  moire: 'Líneas finas que vibran al cruzarse.',
  rombos: 'Rombos en retícula.',
  franjas: 'Franjas diagonales en movimiento.',
  caleido: 'Espejos de caleidoscopio.',
  ondas: 'Ondas que avanzan.',
  interferencia: 'Dos ondas que se cruzan.',
  plasma: 'Plasma de colores que se mezcla.',
  lissajous: 'Curvas de osciloscopio.',
  ecualizador: 'Barras de un ecualizador de audio.',
  horizonte: 'Líneas de montaña hacia el horizonte.',
  radar: 'Barrido de radar con estela.',
  tunel: 'Túnel infinito hacia el centro.',
  espiral: 'Espiral que gira.',
  estrellas: 'Cielo de estrellas que titilan.',
  hiper: 'Estrellas a toda velocidad, hacia ti.',
  galaxia: 'Galaxia espiral.',
  rejilla: 'Suelo de rejilla hacia el horizonte.',
  dona: 'Una dona 3D que gira (el clásico donut.c).',
  esfera: 'Una esfera iluminada que rota.',
  cubo: 'Un cubo 3D que gira.',
  nudo: 'Un nudo de tubo con rayas que corren por él.',
  poliedro: 'Un sólido de caras planas: del octaedro al balón.',
  giroide: 'Una esfera porosa, como coral o esponja.',
  moebius: 'Una cinta con una sola cara que da vueltas.',
  adn: 'Una doble hélice con sus peldaños, girando.',
  planeta: 'Un planeta con anillos que proyectan sombra.',
  voxeles: 'Un vuelo sobre un paisaje de bloques.',
  metabolas: 'Gotas de metal que se funden y se separan.',
  engranajes: 'Dos engranajes que encajan y giran.',
  cristales: 'Un racimo de cristales facetados.',
  julia: 'Fractal de Julia que respira.',
  rosa: 'Rosa polar de pétalos.',
  degradado: 'Degradado lineal que ondula.',
  forma: 'Un polígono, con o sin relleno.',
  estrella: 'Una estrella de puntas.',
  latido: 'Un corazón que late.',
  lluvia: 'Columnas que caen, como en Matrix.',
  glitch: 'Bandas de error digital.',
  ruido: 'Estática de televisor.',
};

/** Where the views take the piece (the view bar says one line under the selector). */
export const VIEW_OVERLAY_LABEL = 'Zonas de interfaz de Reels/TikTok/Stories (aproximadas)';
