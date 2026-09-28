# Exportaciones: qué se comprobó, cómo y qué no

Este documento recoge la verificación de **todas las exportaciones** de Monotrama hecha como lo haría alguien que se lleva
el resultado a otro proyecto: abriendo cada archivo con las herramientas reales, pegando el código en una web ajena y
ejecutando los scripts en una terminal de verdad. También dice, con la misma precisión, **lo que no se pudo comprobar**
en esta máquina y los límites conocidos.

La verificación es repetible: `scripts/verify-exports.mjs` vuelve a hacer las comprobaciones automáticas y termina con una
tabla PASS / FAIL / SKIP (ver [Cómo repetirla](#cómo-repetirla)).

## Entorno de la verificación

| Pieza | Versión |
| --- | --- |
| Sistema | Linux x86_64 (contenedor), sin GPU |
| Navegador | Chromium 141 (Playwright 1.56.1, *headless shell*), WebGL 2 por SwiftShader (ANGLE/Vulkan) |
| Node.js | 22.22.2 y 18.20.8 (`npx node@18`) |
| Python | 3.11.15 (sólo biblioteca estándar para los scripts; `pyte` 0.8.2 y `wcwidth` 0.9.1 para emular la terminal) |
| Video | FFmpeg / ffprobe 6.1.1 |
| Imagen | ImageMagick 6.9.12 (`identify`, `convert`, `compare -metric RMSE`) |
| Vector | rsvg-convert 2.58.0, Inkscape 1.2.2, `xmllint` (libxml 2.9.14) |
| GIF | gifsicle 1.94 |
| Terminal | pty real (`pty.fork` de Python; `script` de util-linux 2.39.3 disponible), bash 5.2, asciinema 2.4.0 |

Las piezas de prueba cubren: un patrón con efectos de píxel y velocidad 0,6 («patrón»), el mismo sin efectos («limpio»),
un texto con mensaje («texto»), una imagen sintética con color de la fuente y relleno de celda («imagen»), el preset de
terminal *donut.c* («terminal»), un mensaje con glifos dobles — japonés y emoji — sobre katakana de ancho medio («anchos»),
y juegos de caracteres que las tipografías incrustables no traen («bloques», «braille», «símbolos»).

El estudio se abre con «reducir movimiento» activado (así arranca en pausa en t = 0) y con un reloj simulado: cada
fotograma de animación dura exactamente 16 ms, de modo que se puede llevar el motor a un instante conocido y comparar
un fotograma de video con un PNG de **ese mismo instante**. Las comparaciones de imagen usan RMSE normalizado (0 = idénticas,
1 = opuestas); «desenfocado» es la misma medida tras un desenfoque gaussiano σ = 2 px, que compara composición y color sin
castigar el antialiasing de cada glifo.

**Resultado de la última ejecución completa** (versión final de la segunda pasada, con `VERIFY_CA`, ver abajo): 363 comprobaciones, **361 PASS, 2 FAIL, 0 SKIP**. Los 2 FAIL eran de medición, no de exportación: la captura de referencia del lienzo en la ventana de terminal (centrada en coordenadas fraccionarias) salía 1 px más alta; alineadas, el PNG coincide con el lienzo (RMSE 0,0010 y 0,0012). Con la captura corregida en el verificador, los grupos `imagen` y `terminal` dan **104 PASS, 0 FAIL**.
Con esa misma versión pasan también las 179 pruebas unitarias y las 105 e2e (escritorio y móvil).

## Matriz de compatibilidad

«Verificado» significa comprobado en esta sesión con la herramienta indicada. «No verificado» significa exactamente eso:
no hubo forma de probarlo aquí; no es una promesa en ningún sentido.

| Formato | Verificado aquí (herramienta → resultado) | No verificado aquí | Límites conocidos |
| --- | --- | --- | --- |
| **PNG** | `identify`: tamaño = lienzo (1002×808 en la prueba); `compare` contra una captura del lienzo en vivo en el mismo instante: RMSE **0,0000** (idéntico píxel a píxel) en las siete piezas a pantalla completa y 0,001 en las dos de terminal; «Vista ×2» 2004×1616, misma composición (RMSE tras reducir y desenfocar 0,001–0,03); tamaños fijos exactos (1920×1080, 1080×1080, 1080×1920, 1200×630, 3840×2160); PNG transparente con canal alfa real (mín. 0, máx. 1) | Importación en Figma, Photoshop, After Effects | El fondo transparente conserva sólo glifos y relleno de celda. En «Vista ×2/×3» los glifos se redibujan más nítidos; con tamaños de celda fraccionarios la rejilla puede variar en una columna |
| **WebP / JPEG** | `identify`: formato y tamaño correctos; RMSE contra el PNG 0,035 (WebP) y 0,037 (JPEG), calidad 0,92 | Soporte de WebP en editores antiguos | JPEG no admite transparencia (la interfaz lo desactiva) |
| **SVG contornos** | `xmllint` bien formado; `viewBox`, `width` y `height` = tamaño del lienzo; 0 referencias externas; lo rasterizan rsvg-convert, Inkscape y Chromium; sin efectos de píxel queda casi idéntico al PNG del mismo fotograma (RMSE desenfocado 0,007–0,027 en «limpio», «texto», «imagen» y «terminal»; braille 0,002–0,008); con efectos de píxel la diferencia sube a 0,097, como avisa la interfaz | Figma, Illustrator, Affinity, Sketch | Sin resplandor, bloom, barrido, curvatura, aberración, grano, parpadeo ni viñeta (la interfaz lo avisa). Bloques y braille van como geometría exacta de celda; en la vista dependen de la fuente del sistema (aviso). Los caracteres que la tipografía incrustable no trae (● ○ ◎, flechas, estrellas, música, cajas, katakana, CJK, emoji) quedan como `<text>` y dependen de las fuentes instaladas (aviso con el número de caracteres) |
| **SVG texto editable** | Igual que el anterior; `font-family` declarado; en Chromium RMSE desenfocado 0,009–0,031 | Figma, Illustrator | Necesita la tipografía instalada donde se abra: rsvg e Inkscape de esta máquina no la tienen y usan otra mono (RMSE desenfocado hasta 0,064) |
| **GIF** | `gifsicle --info`: 50 fotogramas, 0,04 s cada uno, total 2,00 s, *loop forever*; `ffprobe` lo lee; primer fotograma ≈ PNG (RMSE desenfocado 0,033, 128 colores) | Reproducción en Slack, GitHub, clientes de correo | Máximo 25 fps y 128 colores por fotograma. Los retardos de GIF son centésimas: se reparten para que la duración total sea exacta (p. ej. a 24 fps) |
| **WebM** | `ffprobe`: VP9, 30 fps, 2,000 s, 60 fotogramas; `ffmpeg -v error` decodifica sin errores; fotograma 0 = PNG en t = 0 y fotograma 24 = PNG en el mismo instante del motor (RMSE desenfocado 0,021; controles contra otros instantes 0,054 y 0,095) | Safari (reproducción de WebM), editores de video | Video YUV 4:2:0: los glifos finos de color pierden algo de croma (RMSE sin desenfocar ≈ 0,095). Tamaños grandes pueden superar lo que el codificador del navegador acepta (la interfaz lo dice) |
| **MP4 (H.264)** | Este Chromium **no codifica H.264** con WebCodecs (`VideoEncoder.isConfigSupported` con `avc1.*` = false a 640×360, 1280×720, 1366×768 y 1920×1080; HEVC tampoco): la interfaz no muestra el botón MP4 y explica por qué. El empaquetado MP4 se verificó aparte con **el mismo código de mediabunny** (`Mp4OutputFormat` con `fastStart: 'in-memory'`, `CanvasSource`, `QUALITY_HIGH`) usando VP9 y AV1: `ffprobe` lee `mov,mp4`, 45 fotogramas, 1,50 s, `moov` antes de `mdat`, decodifica sin errores | **La codificación H.264 en sí** (Chrome, Edge, Safari, Firefox) y la reproducción del MP4 resultante en QuickTime, Keynote, redes sociales y editores | Depende del navegador: si no codifica H.264, no hay MP4 (usa WebM o la grabación en directo) |
| **Grabación en directo** | `MediaRecorder` de este Chromium admite `video/webm` (VP8/VP9/AV1) y `video/mp4` genérico, pero **no** `video/mp4;codecs=avc1`; la grabación sale `.webm` VP9 y `ffprobe`/`ffmpeg` la leen sin errores | Safari (grabaría MP4/H.264), Firefox | Calidad según la fluidez del equipo; captura lo que se ve, incluido el cursor |
| **HTML para pegar** (fondo, portada, bloque) | En otra web (otro origen; servidor Node del verificador y, a mano, `python3 -m http.server`): se ve (desviación de luminancia 0,07–0,18), 0 errores de consola; al tamaño del lienzo del estudio y en t = 0 coincide con el PNG del estudio (RMSE desenfocado 0,004–0,020; la tipografía viene de Google Fonts en vez de la copia local del estudio); fuera de pantalla deja de dibujar (0 llamadas `drawArrays`); con «reducir movimiento» dibuja un fotograma y se queda quieto; sin WebGL 2 (tanto con `getContext` anulado como con Chromium `--disable-3d-apis`) no lanza excepciones, deja el color de fondo y muestra el póster | Safari, Firefox, móviles reales, CMS (WordPress, Webflow, Squarespace) | La tipografía viene de Google Fonts salvo que elijas «sin dependencias». Imagen/video deben servirse desde el mismo dominio o con CORS. Si una página mezcla exportaciones de versiones distintas, manda el primer motor que se cargue |
| **Página .html** | Funciona sola desde otro origen, 0 errores | — | Igual que el HTML para pegar |
| **Web Component** | `<monotrama-field>` + `monotrama-field.js` desde otro origen: se ve, se pausa fuera de pantalla, al quitar el elemento deja de dibujar (0 llamadas); atributo `poster` sin WebGL 2 | Safari, Firefox | Los cambios del atributo `recipe` después de montar no se observan |
| **React** | Proyecto Vite + React 19 desechable que importa el `.jsx` exportado: `vite build` compila; en `vite dev` con `StrictMode` (monta dos veces) y en el build se ve, 0 errores, desmontar quita los lienzos y deja de dibujar, volver a montar funciona; prop `poster` sin WebGL 2 | Next.js (SSR), CRA, React 18 | — |
| **Zona protegida** (opción del código: HTML, Web Component, React) | e2e (`tests/e2e/legibility.spec.ts`): el HTML exportado con «Degradado», pegado en otra página, añade entre el fondo y el contenido una capa `position:absolute` con `backdrop-filter: blur(…)`, `mask-image: linear-gradient(…)` y el color y la opacidad elegidos; el Web Component (`monotrama-field.js` descargado + su uso, en otra página) dibuja la misma capa dentro de su *shadow root* con los atributos `scrim`, `scrim-color`, `scrim-opacity` y `scrim-blur`; el componente de React pasa la prop `scrim` a `Monotrama.mount` (comprobado en el código generado; el proyecto de React de prueba no se volvió a ejecutar con esta opción); «Tras el texto» exporta la clase `.monotrama-zona` para tus bloques. En el estudio, la vista previa y la estimación de legibilidad usan la misma definición (`src/shared/scrim.ts`) | Safari y Firefox (`backdrop-filter` con y sin prefijo), móviles reales | Sin `backdrop-filter` queda sólo el color, que es lo que más ayuda a leer. El degradado es más fuerte a la izquierda en cajas anchas y abajo en las altas: si tu texto va en otro sitio, usa «Tras el texto» o «Toda la página». Con «Tras el texto» tienes que poner la clase en tus bloques |
| **Componentes** (Descifrar, Máquina de escribir, Imán, Estela, Halo, Indicadores, Barra de progreso, Rótulo) | «HTML para pegar» y «Módulo ES» en otra web: funcionan (texto resuelto, letras que huyen, estela y halo con píxeles dibujados, indicador que gira, barra al 42 %); «React» dentro del proyecto Vite (build y dev/StrictMode); Node, Python y Bash en una pty real con Ctrl+C (cursor restaurado) y con la salida redirigida; rótulo en texto, README, saludo de shell y JS | Safari, Firefox, terminales de Windows | Imán y Estela necesitan puntero. Con «reducir movimiento», Descifrar, Máquina de escribir e Indicadores quedan quietos (comprobado); Imán, Estela y Halo no animan por su cuenta (según el código, sin prueba automática) |
| **TXT** | UTF-8 válido; exactamente *filas* líneas; ancho de pantalla real ≤ *columnas* contando los glifos dobles como 2 (`wcwidth`) | — | Las líneas llevan los espacios finales recortados |
| **ANSI .ans** (16, 256, color real; con y sin fondo) | Sólo secuencias SGR válidas; cada línea mide exactamente *columnas* en pantalla y termina en `ESC[0m`; en un emulador (`pyte`) la pantalla es idéntica al TXT; `cat` en una pty real deja colores, cursor y `termios` como estaban | Terminales concretas (Windows Terminal, macOS Terminal, iTerm2) | «Color real» necesita una terminal con truecolor; 16 colores usa la paleta de la terminal |
| **HTML de texto** | UTF-8, título escapado, el `<pre>` conserva todas las filas (también una primera fila vacía) y su texto = TXT | — | Los glifos de ancho doble se ven a ~1,7 columnas en una fuente mono del navegador |
| **Script de Node (.mjs)** | En una pty: muestra fotogramas exactos (la pantalla emulada coincide con uno de los fotogramas incrustados), Ctrl+C restaura cursor, colores, ajuste de línea y pantalla principal, `termios` intacto; con la salida redirigida escribe un fotograma y termina (código 0); con `\| head` no imprime errores; funciona en Node 18.20.8 y 22 | Windows (cmd/PowerShell), macOS | Si la terminal es más pequeña, se recorta (no se deforma) |
| **Script de Python** | Igual que el de Node con `python3`; sólo importa biblioteca estándar (`base64, gzip, json, os, re, shutil, signal, sys, time`) | Windows (activa ANSI con `os.system("")`, sin probar), Python < 3.8 | — |
| **Saludo de shell** | `bash -i` lo imprime igual que el TXT; `bash` no interactivo no imprime nada (no rompe `scp`/`rsync`) | zsh (no instalado aquí), fish (no compatible: usa `case`/heredoc de sh) | — |
| **Para tu CLI (JS)** | En una pty la pantalla = TXT; redirigido a un archivo sale sin códigos de color | — | — |
| **asciinema .cast** | v2 válido (cabecera JSON, eventos `[tiempo, "o", datos]` con tiempos crecientes); la última pantalla es el último fotograma con el cursor visible; `asciinema cat` y `asciinema play` (×4) lo reproducen y terminan con código 0 | Reproductor web de asciinema, asciinema.org | — |
| **Receta .json / enlace** | (lo cubren las pruebas e2e del estudio) | — | — |

## Qué se arregló en esta pasada

- **Video, GIF y animaciones de terminal seguían otra velocidad.** El estudio avanza el tiempo a `motion.speed` por segundo,
  pero los clips renderizados avanzaban a 1: una pieza a velocidad 0,6 salía 1,67 veces más rápida. Medido antes del
  arreglo: el PNG en tiempo de motor 0,48 coincidía con el fotograma 14 del WebM en vez del 24. Ahora coincide el 24.
  El bucle perfecto dura `loop / speed` segundos reales y la interfaz lo usa como duración.
- **La grabación en directo guardaba VP9 dentro de un `.mp4`** (este Chromium acepta `video/mp4` genérico): no se abre en
  QuickTime ni Keynote. Ahora sólo sale `.mp4` si lleva H.264; si no, `.webm`.
- **MP4 desactivado sin explicación** cuando el navegador no codifica H.264: ahora lo dice.
- **SVG:** el tamaño coincide con el del lienzo (antes era la rejilla completa, p. ej. 1008×816 para un lienzo de 1002×808);
  los caracteres que la tipografía no trae ya no se dibujan como el glifo vacío `.notdef` (opentype `hasChar` devuelve
  siempre verdadero): van como texto y se avisa; el braille se dibuja con puntos exactos; `<use>` usa `xlink:href` para
  editores antiguos.
- **Texto y ANSI con glifos dobles** (CJK, emoji) desbordaban la línea (7 columnas en una rejilla de 6); ahora cada glifo
  doble ocupa su celda y la siguiente, y los caracteres de control o combinantes se vuelven espacios.
- **HTML de texto:** el analizador HTML se comía la primera fila si estaba vacía; el título no se escapaba.
- **Scripts de Node y Python:** redirigidos a un archivo no terminaban nunca (lo llenaban); con `| head` Node se caía con
  EPIPE y Python con `BrokenPipeError`; en «Sin color» quedaban restos del fotograma anterior; no respondían a SIGTERM
  (Python). Ahora escriben un fotograma y salen, recortan a la terminal y desactivan el ajuste de línea mientras se reproducen.
- **asciinema:** el salto de línea final desplazaba la última imagen una línea hacia arriba.
- **Saludo de shell:** sólo se imprime en sesiones interactivas.
- **Código exportado:** sin WebGL 2 ya no queda un hueco: se ve el color de fondo y, si lo das, un **póster**
  (`poster` en `Monotrama.mount`, atributo `poster` en `<monotrama-field>`, prop `poster` en React; botón
  «Descargar póster (PNG)» en la pestaña Código). `mount` no lanza excepciones. Con «reducir movimiento» se desactiva el
  puntero fantasma. El componente de React crea su propio lienzo en cada montaje: con `StrictMode` (que monta dos veces)
  el de antes reutilizaba un contexto WebGL ya liberado y se quedaba en blanco. Los títulos de piezas ya no pueden cerrar
  el comentario HTML del fragmento, y los atributos del Web Component se escapan bien.
- **Componentes:** Ctrl+C en el indicador de Node dejaba el cursor oculto; en Bash también, y una etiqueta con `%`
  rompía `printf`; el de Python imprimía una traza. La regla CSS de la máquina de escribir para «reducir movimiento» ya no
  afecta a todos los `[aria-hidden]` de la página anfitriona, y su texto para lectores de pantalla ya no duplica los puntos.
- **Licencia:** todo archivo exportado que contiene código lleva la cabecera MIT-0
  («Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.»).
  El `.cast` no la lleva porque es JSON (no admite comentarios); el arte (TXT, ANSI, SVG, imágenes) tampoco, porque es tuyo.
- Tamaños fijos exactos: «1920×1080» daba 1919×1080 con algunas alturas de ventana.

Pruebas de «antes y después» con el código original (commit `0505932`) frente al actual:

| Qué | Antes | Ahora |
| --- | --- | --- |
| Script de Node/Python redirigido a un archivo | no termina (3 s, sigue escribiendo) | escribe un fotograma y sale con código 0 |
| Script con `\| head` | Node: traza de EPIPE; Python: `BrokenPipeError` | sin errores |
| «Sin color» en una pty | la pantalla no coincide con ningún fotograma (restos del anterior) | coincide exactamente con un fotograma |
| Última pantalla del `.cast` | desplazada una línea | igual al último fotograma |
| `<pre>` con la primera fila vacía | 2 filas de 3 tras el análisis HTML | 3 de 3 |
| TXT con «こ» en una rejilla de 6 | 7 columnas | 6 columnas |
| Componente React en `vite dev` + `StrictMode` | lienzo 1×1 con el contexto WebGL perdido, imagen plana (desviación 0,005) | se ve (desviación 0,105) |
| Ctrl+C en el indicador de Node / Bash | cursor oculto al terminar; con `%` en la etiqueta, Bash imprimía «100 0sto…» | cursor visible, «✖ Cancelado» |
| WebM de una pieza a velocidad 0,6 | el PNG en tiempo 0,48 coincide con el fotograma 14 | coincide con el fotograma 24 (RMSE desenfocado 0,021) |
| Grabación en directo en este Chromium | `.mp4` con VP9 dentro | `.webm` VP9 |
| SVG de un lienzo de 1002×808 | 1008×816 | 1002×808 |

## Lo que no se pudo verificar aquí

- **La codificación H.264 (MP4)**: este Chromium no la ofrece, así que no se pudo generar ni un MP4 con H.264 desde el
  estudio. No se probó en Chrome, Edge, Safari ni Firefox, ni cómo se reproduce el resultado en QuickTime, Keynote,
  Instagram, TikTok o editores de video. Sí se verificó el empaquetado MP4 con otros códecs usando el mismo código.
- **Safari y Firefox**: ni WebCodecs, ni `MediaRecorder`, ni el código exportado, ni el estudio. Tampoco navegadores móviles
  reales (iOS, Android) ni una GPU real: todo el WebGL de esta sesión es SwiftShader.
- **Importación en aplicaciones de diseño**: Figma, Illustrator, Affinity, Sketch, Photoshop y After Effects no están aquí.
  El SVG se validó con xmllint, rsvg-convert, Inkscape 1.2 y Chromium.
- **Terminales concretas**: Windows (cmd, PowerShell, Windows Terminal), macOS Terminal, iTerm2, zsh (no instalado) y fish.
  La terminal verificada es una pty de Linux emulada con `pyte`, más la reproducción con asciinema 2.4.
- **Reproductor web de asciinema** y subida a asciinema.org.
- **Frameworks**: Next.js con SSR, Create React App y React 18 (se probó React 19 con Vite).
- **CMS y constructores de webs** (WordPress, Webflow, Squarespace): se probó una página HTML propia servida desde otro origen.
- **Pestaña en segundo plano**: la pausa fuera de pantalla se verificó con desplazamiento (IntersectionObserver); con la
  pestaña oculta la pausa depende del navegador (`requestAnimationFrame` se detiene), sin probar aquí.
- **Video como fuente** y **cámara**: no se exportó ningún clip con video de entrada; la cámara no se exporta como código.
- **Google Fonts**: en esta red el proxy vuelve a firmar HTTPS; se cargaron confiando sólo en su CA (`VERIFY_CA`).

## Límites conocidos

- Los efectos de píxel no existen en SVG; exporta PNG si los necesitas. La pestaña Vector lo avisa antes de exportar y
  muestra el fotograma actual junto al mismo fotograma sin esos efectos.
- La zona protegida del código depende de `backdrop-filter` para el desenfoque; sin él, sólo pinta el color.
- En la vista, los caracteres que no están en las tipografías incluidas (bloques, braille, cajas, flechas, katakana…) los
  dibuja la fuente del sistema: pueden cambiar de un equipo a otro. En el SVG, bloques y braille van como geometría exacta.
- MP4 sólo donde el navegador codifica H.264; si no, WebM o grabación en directo.
- El código exportado carga la tipografía desde Google Fonts salvo con «sin dependencias».
- Imagen o video de fondo en el código: mismo dominio o CORS.
- Los scripts de terminal no redimensionan la pieza: si la terminal es más pequeña, recortan.

## Cómo repetirla

```bash
npm run build
npx vite preview --port 4177 --strictPort &      # cualquier puerto libre
PORT=4177 npm run verify:exports                  # tabla PASS / FAIL / SKIP al final
```

Variables: `PORT` (puerto del estudio, 4173 por defecto), `SITE_PORT` (la «web ajena» desde otro origen; por defecto
`PORT + 100`, y el proyecto React en modo dev usa el siguiente), `OUT` (carpeta de artefactos; por defecto una temporal),
`ONLY` (grupos separados por comas: `imagen, vector, video, mp4, codigo, react, componentes, texto, terminal`),
`NODE18` (ruta a un Node 18; si no, prueba `npx -y node@18`) y `VERIFY_CA` (PEM de la CA de un proxy que vuelve a firmar
HTTPS, para que Chromium confíe sólo en ella). Cada herramienta que falte convierte sus comprobaciones en **SKIP** con el
motivo; nunca en FAIL. Herramientas usadas: Chromium (Playwright), ffmpeg/ffprobe, ImageMagick, rsvg-convert, Inkscape,
gifsicle, xmllint, python3 con `pyte` y `wcwidth` (`pip install pyte wcwidth`), asciinema (`pip install asciinema`), bash.
El ayudante de terminal está en `scripts/verify-exports.py`.
