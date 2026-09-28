# Compatibilidad: qué ofrece el estudio, qué pasó una prueba y qué se abrió de verdad

Tres preguntas distintas, que aquí no se mezclan:

- **La interfaz lo ofrece**: en ese navegador, el estudio muestra el botón o la opción (o explica por qué no está y qué usar
  en su lugar). Es lo que ve una persona; no dice nada de si el resultado es bueno.
- **Prueba automática pasó**: una comprobación del verificador (`scripts/verify-exports.mjs`) o de las pruebas e2e corrió
  en ese motor y pasó: el botón existe, el archivo se genera, el código no lanza excepciones, las cuentas cuadran.
- **Abrí el resultado final y lo comprobé**: el archivo o la página que sale del estudio se abrió en ese motor o con esa
  herramienta y se comparó con la vista previa (tamaño, encuadre, duración, número de fotogramas, texto, colores, imagen al
  mismo instante). Aquí «abrir» lo hizo el verificador con herramientas reales (ffprobe/ffmpeg, ImageMagick, rsvg-convert,
  Inkscape, una pty con pyte, los propios navegadores); además se miraron a ojo capturas del código pegado (con WebGL 2 y
  con el motor básico) y de la pestaña Código.

Ninguna de las tres es «funciona en tu dispositivo». Los motores de esta máquina no son los de un teléfono ni los de un
Safari de verdad (ver [Lo que falta](#lo-que-falta-y-por-qué)).

(borrador en curso: las tablas se completan con las ejecuciones finales)
