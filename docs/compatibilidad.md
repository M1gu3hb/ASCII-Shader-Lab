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
  con el motor básico), de la pestaña Código y de la hoja de exportación en WebKit.

Ninguna de las tres es «funciona en tu dispositivo». Los motores de esta máquina no son los de un teléfono ni los de un
Safari de verdad (ver [Lo que falta](#lo-que-falta-y-por-qué)).

## Cómo leer las tablas

- **sí**: comprobado así en ese motor. **no, lo explica**: el estudio no lo ofrece ahí y dice por qué y qué usar.
  **—**: no aplica o no se hizo (se dice por qué en la nota).
- «Abrí el resultado» se refiere al archivo o la página **final**: el MP4 descargado, el `.zip` abierto en otro perfil, el
  código pegado en una web de otro origen. Los números están en [exportaciones.md](exportaciones.md).
- Las pruebas se corrieron sobre la versión final de esta rama con `scripts/verify-exports.mjs`
  (`BROWSER=chromium|chrome|firefox|webkit`) y las pruebas e2e; el resumen por grupo y motor está al final.
- «La pieza transformada» es una pieza de prueba con texto grande cuyas letras se mueven (ola), tres transformaciones de
  la fuente (semitono, ondular, canales) y un mensaje cuyas letras rebotan: se comprueba como cualquier otra.

## Chromium 141 (el de Playwright, WebGL 2 por software)

| Función | La interfaz lo ofrece | Prueba automática pasó | Abrí el resultado final y lo comprobé |
| --- | --- | --- | --- |
| Imagen PNG / WebP / JPEG, transparente, tamaños fijos | sí | sí | sí: tamaño exacto; PNG = lienzo en vivo (RMSE 0) |
| SVG (contornos y texto editable) | sí, con el aviso y la comparación de efectos de píxel antes de exportar | sí | sí: en Chromium, Chrome, Firefox, WebKit, rsvg-convert e Inkscape, contra el PNG |
| GIF | sí | sí | sí: 50 fotogramas, 2,00 s, bucle; se abre en los cuatro motores |
| Video WebM (VP9) | sí | sí | sí: 60 fotogramas, 2,00 s; fotogramas = PNG del mismo instante; se reproduce en los cuatro motores |
| Video MP4 (H.264) | no, lo explica (este Chromium no codifica H.264) | sí (que no hay botón y lo explica) | — (no hay archivo) |
| Grabación en directo | sí (WebM VP9) | sí | sí: se decodifica y se reproduce en los cuatro motores |
| Código: HTML para pegar, página, Web Component | sí, con la elección «Motor básico / Póster o color» y su peso | sí | sí: en otra web, imagen = PNG del estudio; se adapta, se pausa, se limpia |
| Código: React | sí | sí | sí: proyecto Vite + React 19, build y dev con StrictMode |
| Código sin WebGL 2 | sí (motor básico por defecto) | sí (WebGL 2 anulado y `--disable-3d-apis`) | sí: el motor básico dibuja lo mismo que el PNG del estudio |
| Texto, ANSI, HTML de texto, scripts de Node y Python, asciinema, saludo de shell, JS | sí | sí | sí: en una pty real (bash) emulada con pyte |
| Pieza transformada: imagen, video, código, texto | sí | sí | sí: PNG = lienzo (RMSE 0); fotogramas del WebM = PNG del mismo instante; el código pegado, con WebGL 2 y con el motor básico, = PNG del estudio; TXT, ANSI y scripts en la pty |
| Componentes de la biblioteca (14) | sí | sí | sí: «HTML para pegar» y «Módulo ES» en otra web y el `.jsx` en un proyecto de React (build y dev): cada uno hace lo suyo (la foto aparece bajo el cursor, la luz lo sigue, la barra avanza, el letrero desfila, el rótulo se lee, los enlaces se revuelven), quietos con «reducir movimiento» donde animan solos; las versiones de terminal en una pty |
| Proyecto `.zip` con foto o WebM | sí | sí | sí: abierto en otro perfil, receta idéntica, archivo original, misma imagen |
| Proyecto con MP4 H.264 | no, lo explica («este navegador no puede reproducir ese video») | sí (que lo dice) | — (el Chromium de Playwright no decodifica H.264) |
| Sesión y colección `.zip` | sí | sí | sí: abiertas en otro perfil, con sus archivos |
| Cámara: funciona / denegada / sin cámara / ocupada | sí; un mensaje para cada fallo | sí (dispositivo simulado; denegada y sin cámara provocadas en el navegador; ocupada simulada) | sí: la grabación de la cámara (WebM VP9) se decodifica y se reproduce en los cuatro motores (con muy pocos fotogramas: el lienzo dibuja poco con WebGL por software) |

## Google Chrome 154 estable (WebGL 2 por software)

| Función | La interfaz lo ofrece | Prueba automática pasó | Abrí el resultado final y lo comprobé |
| --- | --- | --- | --- |
| Imagen PNG / WebP / JPEG, transparente, tamaños fijos | sí | sí | sí: PNG = lienzo en vivo (RMSE 0); alfa real; tamaños fijos exactos |
| SVG (contornos y texto editable) | sí, con el aviso previo | sí | sí: contra el PNG en Chromium, Chrome, Firefox, WebKit, rsvg-convert e Inkscape |
| GIF | sí | sí | sí: 50 fotogramas, 2,00 s, bucle |
| Video WebM (VP9) | sí | sí | sí: fotogramas = PNG del mismo instante; se reproduce en los cuatro motores |
| Video MP4 (H.264) | sí | sí | sí: H.264 High 3.1, yuv420p, 30 fps, 60 fotogramas, índice al principio; `ffmpeg -v error` lo decodifica entero; fotogramas = PNG del mismo instante; se reproduce en Chrome, Firefox y WebKit |
| Grabación en directo | sí (MP4 H.264) | sí | sí: MP4 normal con el índice al principio; se reproduce en Chrome, Firefox y WebKit |
| Código: HTML para pegar, página, Web Component | sí, con la elección «Motor básico / Póster o color» y su peso | sí | sí: en otra web, al tamaño del estudio, imagen = PNG del estudio (RMSE 0, con Google Fonts cargada); se adapta, se pausa, se limpia |
| Código: React | sí | sí | sí: proyecto Vite + React 19, build y dev con StrictMode; desmontar limpia |
| Código sin WebGL 2 | sí (motor básico por defecto) | sí (WebGL 2 anulado y `--disable-3d-apis`) | sí: el motor básico = PNG del estudio (RMSE desenfocado 0,000–0,006); sin él, póster |
| Proyecto `.zip` con foto, MP4 o WebM | sí | sí | sí: los tres, abiertos en otro perfil, con su archivo y la misma imagen (RMSE 0) |
| Sesión y colección `.zip` | sí | sí | sí: abiertas en otro perfil, con sus archivos |
| Cámara: funciona / denegada / sin cámara / ocupada | sí; un mensaje para cada fallo | sí (dispositivo simulado; denegada y sin cámara provocadas en el navegador; ocupada simulada) | sí: la grabación de la cámara (MP4) se reproduce |
| Pieza transformada | sí | sí | sí: PNG, MP4, WebM y código = PNG del estudio |
| Texto, terminal y componentes | sí | no se corrió en Chrome (texto y terminal se comprueban en la terminal; los componentes, sólo en Chromium) | — |

## Firefox 142 (compilación de Playwright para Linux; sin WebGL 2 en esta máquina)

Aquí Firefox no tiene WebGL 2, así que el estudio arranca en **modo básico** (lo dice arriba, «MODO BÁSICO») y todo lo de
esta tabla sale del motor básico. En un Firefox con WebGL 2 el estudio usaría el motor normal: eso no se probó aquí.

| Función | La interfaz lo ofrece | Prueba automática pasó | Abrí el resultado final y lo comprobé |
| --- | --- | --- | --- |
| Imagen PNG / WebP / JPEG, transparente, tamaños fijos | sí | sí | sí: tamaño exacto; PNG = lienzo en vivo (RMSE 0); alfa real; tamaños fijos exactos |
| SVG (contornos y texto editable) | sí, con el mismo aviso previo | sí | sí: comparado con el PNG en Chromium, Chrome, Firefox, WebKit, rsvg-convert e Inkscape |
| GIF | sí | sí | sí: 50 fotogramas, 2,00 s, bucle; se abre en los cuatro motores |
| Video WebM (VP9) | sí | sí | sí: 60 fotogramas; fotogramas = PNG del mismo instante; se reproduce en los cuatro motores |
| Video MP4 (H.264) | sí (este Firefox codifica H.264 con WebCodecs) | sí | sí, desde el arreglo de esta pasada: `ffmpeg -v error` sin errores; H.264 High 3.1, yuv420p, 60 fotogramas, índice al principio; fotogramas = PNG del mismo instante; se reproduce en Chrome, Firefox y WebKit |
| Grabación en directo | sí (WebM VP8: su `MediaRecorder` no ofrece VP9 ni MP4) | sí | sí: se decodifica y se reproduce en los cuatro motores |
| Código: HTML para pegar, página, Web Component | sí, con la elección «Motor básico / Póster o color» | sí | sí: en otra web **dibuja el motor básico** (Firefox no tiene WebGL 2 aquí); al tamaño del estudio, igual al PNG del estudio salvo la tipografía (RMSE desenfocado 0,020–0,030: Google Fonts no carga en esta red); se adapta, se pausa, se limpia; sin motor básico, póster |
| Código: React | sí | sí | sí: proyecto Vite + React 19, build y dev con StrictMode, dibuja el motor básico; desmontar limpia |
| Proyecto `.zip` con foto, MP4 o WebM | sí | sí | sí: los tres, abiertos en otro perfil, con su archivo y la misma imagen |
| Sesión y colección `.zip` | sí | sí | sí |
| Cámara: funciona / denegada / sin cámara / ocupada | sí; un mensaje para cada fallo | sí (cámara simulada de Firefox; denegada y sin cámara provocadas con sus preferencias; ocupada simulada) | sí: la grabación de la cámara (WebM VP8) se reproduce |
| Pieza transformada | sí | sí | sí: PNG, MP4, WebM y código (motor básico) = PNG del estudio |
| Texto, terminal y componentes | sí | no se corrió en Firefox (texto y terminal se comprueban en la terminal; los componentes, sólo en Chromium) | — |

## WebKit 26 (compilación de Playwright para Linux; no es Safari)

Esta compilación tiene WebGL 2, pero no trae codificadores de video: no tiene `MediaRecorder` y, al preguntarle a
WebCodecs si puede codificar cualquier códec (`VideoEncoder.isConfigSupported`), **cierra la página** (comprobado también
en una página vacía, sin el estudio). Safari de verdad tiene `MediaRecorder` y WebCodecs; eso no se probó aquí.

| Función | La interfaz lo ofrece | Prueba automática pasó | Abrí el resultado final y lo comprobé |
| --- | --- | --- | --- |
| Hoja de exportación | sí (desde esta pasada: antes el cuerpo de todas las hojas quedaba en una línea y las opciones no se veían) | sí: el verificador mide que la hoja enseña sus opciones | — |
| Imagen PNG / WebP / JPEG, transparente, tamaños fijos | sí | sí | sí: tamaño exacto; PNG = lienzo ⟨WK-PNG⟩ |
| SVG (contornos y texto editable) | sí, con el aviso previo | sí | sí: se abre en los cuatro motores, rsvg-convert e Inkscape; la comparación con el PNG queda como dato (el PNG de WebKit dibuja los mismos caracteres con trazo más grueso) |
| GIF | sí | sí | sí: 50 fotogramas, 2,00 s, bucle |
| Video MP4 / WebM | no, lo explica («este navegador no trae codificadores de video… Usa el GIF»); el estudio no pregunta por los códecs, porque la pregunta cierra la página | sí (la explicación) | — (no hay archivo) |
| Grabación en directo | no, lo explica (no hay `MediaRecorder`) | sí (la explicación) | — |
| Abrir videos hechos en otros navegadores | — | sí | sí: el WebM, el MP4 H.264 y las grabaciones de Chromium, Chrome y Firefox se reproducen en `<video>` |
| Código: HTML para pegar, página, Web Component | sí, con la elección «Motor básico / Póster o color» | sí | sí: en otra web, con WebGL 2, ⟨WK-CODE⟩; se adapta, se pausa, se limpia; con WebGL 2 anulado, el motor básico ⟨WK-BASIC⟩ |
| Código: React | sí | sí | sí: build y dev con StrictMode; desmontar limpia |
| Pieza transformada | sí (sin video) | sí | sí: ⟨WK-TRANS⟩ |
| Proyecto `.zip` con foto, MP4 o WebM | sí | sí | sí: ⟨WK-PROJ⟩ |
| Proyecto o foto en una ventana privada | sí, y lo dice: «…el navegador no dejó guardarla. Se verá mientras no cierres la pestaña» | sí (perfil en memoria, donde IndexedDB rechaza archivos) | — |
| Sesión y colección `.zip` | sí | sí | sí |
| Cámara | — | — (el WebKit de Playwright no tiene cámara simulada) | — |

## Teléfonos (sólo emulados)

| Función | La interfaz lo ofrece | Prueba automática pasó | Abrí el resultado final y lo comprobé |
| --- | --- | --- | --- |
| Hoja de exportación (todas las pestañas) | sí | sí: en Chromium con la pantalla, el tacto y la densidad de un Pixel 7, cada pestaña cabe sin desbordar y sus botones miden al menos 44 px (`tests/e2e/touch-mobile.spec.ts`, `controls-mobile.spec.ts`) | — |
| Cualquier archivo exportado | sí | — | — (no se abrió ningún resultado en un teléfono, ni real ni emulado) |

## Resumen por grupo y motor

⟨RESUMEN⟩

## Lo que falta y por qué

- **Safari de verdad (macOS, iOS).** Aquí sólo hay WebKit 26 de Playwright para Linux (GTK, con GStreamer para el video). Comparte el motor de páginas con Safari, pero no su reproductor de video, sus códecs, su WebGL (Metal) ni su gestión de permisos. Nada de esta tabla dice «funciona en Safari».
- **Video, grabación y cámara en WebKit.** El WebKit de aquí no trae codificadores de video, ni `MediaRecorder`, ni cámara
  simulada: el video renderizado, la grabación en directo y la cámara no se probaron en ningún WebKit. Lo que sí se
  comprobó es que ahí el estudio lo explica y ofrece el GIF, y que los videos hechos en otros navegadores se reproducen.
- **Teléfonos reales (iOS, Android).** Las pruebas de móvil del estudio son Chromium con la pantalla, el tacto y la densidad de un Pixel 7 emulados: ni su GPU, ni su memoria, ni su batería, ni sus navegadores. La cámara del móvil, el guardado en la fototeca y compartir no se han probado.
- **GPU real.** Todo el WebGL de esta máquina es SwiftShader (por software). La fluidez medida aquí (y los pocos fotogramas de la grabación en directo) dice poco de un equipo con tarjeta gráfica.
- **Figma, Illustrator, Affinity, Sketch, Photoshop, After Effects, Premiere, Final Cut, DaVinci.** No están aquí. El SVG se abrió en cinco renderizadores (tres navegadores, rsvg-convert, Inkscape); los videos en ffprobe/ffmpeg y en los cuatro motores de navegador. La interfaz no dice que se haya comprobado en esas aplicaciones.
- **Redes sociales y mensajería** (Instagram, TikTok, WhatsApp, Slack, correo): no se ha subido nada. El MP4 es H.264 High, yuv420p, con el índice al principio, que es lo que suelen pedir; no se ha comprobado su recompresión.
- **Terminales de Windows y macOS** (cmd, PowerShell, Windows Terminal, Terminal.app, iTerm2), zsh y fish: la terminal comprobada es una pty de Linux con bash, emulada con pyte.
- **CMS y constructores** (WordPress, Webflow, Squarespace, Framer) y **Next.js con SSR**: se probó una web propia servida desde otro origen y un proyecto de Vite + React 19.
- **Pestaña en segundo plano.** El código deja de dibujar fuera de pantalla y oculto (comprobado); con la pestaña en segundo plano depende de que el navegador pare `requestAnimationFrame`, cosa que en modo sin ventana no se puede provocar.
- **Cámara ocupada de verdad.** Los navegadores de prueba no simulan una cámara que otra aplicación esté usando: ese caso se comprobó con la misma respuesta que da el navegador (`NotReadableError`), no con una cámara real.
- **Componentes, texto y terminal fuera de Chromium.** Los componentes de la biblioteca y los formatos de texto y
  terminal se comprobaron con el Chromium de Playwright (los de terminal no dependen del navegador; los componentes web,
  sí, y en Firefox y WebKit quedan sin comprobar).
- **Imágenes fijas con Estela.** Los clips preparan la estela antes del primer fotograma; una imagen fija (PNG, SVG, TXT)
  no, y no se comparó qué estela muestra frente al lienzo en vivo.
- **Google Fonts desde el código exportado.** En esta red un proxy vuelve a firmar HTTPS: sólo se cargan confiando en su CA (`VERIFY_CA`). Sin ella, el código usa la mono del sistema hasta que llega la fuente (o para siempre, con «Sin dependencias externas»).
