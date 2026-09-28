# Exportaciones: qué se comprobó, cómo y qué no

Este documento recoge la verificación de **todas las exportaciones** de Monotrama hecha como lo haría alguien que se lleva
el resultado a otro proyecto: abriendo cada archivo con las herramientas reales, pegando el código en una web ajena y
ejecutando los scripts en una terminal de verdad. También dice, con la misma precisión, **lo que no se pudo comprobar**
en esta máquina y los límites conocidos.

La verificación es repetible: `scripts/verify-exports.mjs` vuelve a hacer las comprobaciones automáticas, en el navegador
que elijas (Chromium, Chrome, Firefox o WebKit), y termina con una tabla PASS / FAIL / SKIP por grupo y por motor (ver
[Cómo repetirla](#cómo-repetirla)).

## Entorno de la verificación

| Pieza | Versión |
| --- | --- |
| Sistema | Linux x86_64 (contenedor), sin GPU, 4 CPU compartidas con otras tareas |
| Navegadores | Chromium 141 (Playwright 1.56.1, *headless shell*) y Google Chrome 154 estable, los dos con WebGL 2 por SwiftShader (ANGLE); Firefox 142.0.1 y WebKit 26 (compilaciones de Playwright para Linux; Firefox sin WebGL 2 en esta máquina, WebKit con WebGL 2) |
| Node.js | 22.22.2 y 18.20.8 (`npx node@18`) |
| Python | 3.11.15 (sólo biblioteca estándar para los scripts; `pyte` 0.8.2 y `wcwidth` 0.9.1 para emular la terminal) |
| Video | FFmpeg / ffprobe 6.1.1 (con libx264 y libvpx para fabricar los videos de prueba) |
| Imagen | ImageMagick 6.9.12 (`identify`, `convert`, `compare -metric RMSE`) |
| Vector | rsvg-convert 2.58.0, Inkscape 1.2.2, `xmllint` (libxml 2.9.14) |
| GIF | gifsicle 1.94 |
| Terminal | pty real (`pty.fork` de Python; `script` de util-linux 2.39.3 disponible), bash 5.2, asciinema 2.4.0 |

Qué comprueba cada motor, y qué no, está en [compatibilidad.md](compatibilidad.md): allí se separan lo que la interfaz
ofrece, lo que una prueba automática comprobó y lo que se abrió de verdad.

Las piezas de prueba cubren: un patrón con efectos de píxel y velocidad 0,6 («patrón»), el mismo sin efectos («limpio»),
un texto con mensaje («texto»), una imagen sintética con color de la fuente y relleno de celda («imagen»), el preset de
terminal *donut.c* («terminal»), un mensaje con glifos dobles — japonés y emoji — sobre katakana de ancho medio («anchos»),
y juegos de caracteres que las tipografías incrustables no traen («bloques», «braille», «símbolos»). Para proyectos y
sesiones se fabrican con ffmpeg e ImageMagick archivos realistas: una foto de 4032×3024 (12 megapíxeles, 2,3 MB), un MP4
H.264 High de 1280×720 y 4 s con movimiento, y un WebM VP9 de 1280×720 y 4 s con movimiento.

El estudio se abre con «reducir movimiento» activado (así arranca en pausa en t = 0) y con un reloj simulado: cada
fotograma de animación dura exactamente 16 ms, de modo que se puede llevar el motor a un instante conocido y comparar
un fotograma de video con un PNG de **ese mismo instante**. La grabación en directo, la cámara y los proyectos van en
tiempo real, en páginas y perfiles aparte. Las comparaciones de imagen usan RMSE normalizado (0 = idénticas, 1 = opuestas);
«desenfocado» es la misma medida tras un desenfoque gaussiano σ = 2 px, que compara composición y color sin castigar el
antialiasing de cada glifo. Los archivos finales se abren además en los cuatro motores de navegador: los videos en
`<video>` (tiene que cargar, dar su tamaño y su duración, avanzar y dibujar un fotograma), las imágenes y el SVG en `<img>`.

**Resultado de la última ejecución completa** (versión final de la segunda pasada, con `VERIFY_CA`, ver abajo): 363 comprobaciones, **361 PASS, 2 FAIL, 0 SKIP**. Los 2 FAIL eran de medición, no de exportación: la captura de referencia del lienzo en la ventana de terminal (centrada en coordenadas fraccionarias) salía 1 px más alta; alineadas, el PNG coincide con el lienzo (RMSE 0,0010 y 0,0012). Con la captura corregida en el verificador, los grupos `imagen` y `terminal` dan **104 PASS, 0 FAIL**.
Con esa misma versión pasan también las 179 pruebas unitarias y las 105 e2e (escritorio y móvil).

## Matriz de compatibilidad

«Verificado» significa comprobado en esta sesión con la herramienta indicada. «No verificado» significa exactamente eso:
no hubo forma de probarlo aquí; no es una promesa en ningún sentido.

| Formato | Verificado aquí (herramienta → resultado) | No verificado aquí | Límites conocidos |
| --- | --- | --- | --- |
| **PNG** | `identify`: tamaño = lienzo (1022×808 en la prueba); `compare` contra una captura del lienzo en vivo en el mismo instante: RMSE **0,0000** (idéntico píxel a píxel) en las siete piezas a pantalla completa y 0,001 en las dos de terminal; «Vista ×2» 2044×1616, misma composición (RMSE tras reducir y desenfocar 0,001–0,03); tamaños fijos exactos (1920×1080, 1080×1080, 1080×1920, 1200×630, 3840×2160); PNG transparente con canal alfa real (mín. 0, máx. 1); se abre con su tamaño en Chromium, Chrome, Firefox y WebKit | Importación en Figma, Photoshop, After Effects | El fondo transparente conserva sólo glifos y relleno de celda. En «Vista ×2/×3» los glifos se redibujan más nítidos; con tamaños de celda fraccionarios la rejilla puede variar en una columna |
| **WebP / JPEG** | `identify`: formato y tamaño correctos; RMSE contra el PNG 0,035 (WebP) y 0,037 (JPEG), calidad 0,92; se abren en los cuatro motores | Soporte de WebP en editores antiguos | JPEG no admite transparencia (la interfaz lo desactiva) |
| **SVG contornos** | `xmllint` bien formado; `viewBox`, `width` y `height` = tamaño del lienzo; 0 referencias externas; lo muestran Chromium, Chrome, Firefox y WebKit (como `<img>`) y lo rasterizan rsvg-convert e Inkscape; sin efectos de píxel, los seis quedan casi idénticos al PNG del mismo fotograma (RMSE desenfocado 0,007–0,027 en «limpio», «texto», «imagen» y «terminal»; braille 0,002–0,008); con efectos de píxel la diferencia sube a 0,096, y la pestaña Vector lo dice **antes** de exportar y lo enseña: el fotograma actual junto al mismo sin efectos de píxel (comprobado que las dos imágenes están) | Figma, Illustrator, Affinity, Sketch | Sin resplandor, bloom, barrido, curvatura, aberración, grano, parpadeo ni viñeta (la interfaz lo avisa). Bloques y braille van como geometría exacta de celda; en la vista dependen de la fuente del sistema (aviso). Los caracteres que la tipografía incrustable no trae (● ○ ◎, flechas, estrellas, música, cajas, katakana, CJK, emoji) quedan como `<text>` y dependen de las fuentes instaladas (aviso con el número de caracteres): con glifos dobles, 0,018 en Chromium frente a 0,066 en WebKit |
| **SVG texto editable** | Igual que el anterior; `font-family` declarado; RMSE desenfocado 0,009–0,031 en Chromium y Chrome, 0,011–0,040 en Firefox, 0,011–0,036 en Inkscape, 0,027–0,065 en WebKit y rsvg-convert | Figma, Illustrator | Necesita la tipografía instalada donde se abra: los motores de esta máquina que no la encuentran usan otra mono |
| **GIF** | `gifsicle --info`: 50 fotogramas, 0,04 s cada uno, total 2,00 s, *loop forever*; `ffprobe` lo lee; primer fotograma ≈ PNG (RMSE desenfocado 0,034, 128 colores); se abre en los cuatro motores | Reproducción en Slack, GitHub, clientes de correo | Máximo 25 fps y 128 colores por fotograma. Los retardos de GIF son centésimas: se reparten para que la duración total sea exacta (p. ej. a 24 fps) |
| **WebM** | `ffprobe`: VP9, 30 fps, 2,000 s, 60 fotogramas; `ffmpeg -v error` decodifica sin errores; fotograma 0 = PNG en t = 0 y fotograma 24 = PNG en el mismo instante del motor (RMSE desenfocado 0,021; controles contra otros instantes 0,054 y 0,095); se reproduce en `<video>` en Chromium, Chrome, Firefox y WebKit (carga, 2,00 s, el tiempo avanza, dibuja) | Safari de verdad (el WebKit de aquí usa GStreamer), editores de video | Video YUV 4:2:0: los glifos finos de color pierden algo de croma (RMSE sin desenfocar ≈ 0,095). Tamaños grandes pueden superar lo que el codificador del navegador acepta (la interfaz lo dice) |
| **MP4 (H.264)** | Con **Google Chrome 154** (que sí codifica H.264 con WebCodecs; el Chromium de Playwright no): `ffprobe`: H.264 perfil High, nivel 3.1, yuv420p, 30 fps, 2,000 s, 60 fotogramas, marca `isom`, `moov` antes de `mdat` (se puede reproducir mientras se descarga); `ffmpeg -v error` lo decodifica entero sin errores; fotograma 0 = PNG en t = 0 (RMSE desenfocado 0,022) y fotograma 24 = PNG del mismo instante del motor (0,033; controles 0,092 y 0,061); se reproduce en `<video>` en Chrome, Firefox y WebKit (carga, 2,00 s, el tiempo avanza, dibuja). Con **Firefox 142** (que aquí también codifica H.264, en modo básico) pasan las mismas comprobaciones desde que el estudio corrige la descripción H.264 que entrega su codificador (ver [tercera pasada](#qué-se-arregló-en-la-tercera-pasada)). En el Chromium de Playwright el estudio no ofrece el botón y dice por qué (comprobado) | QuickTime, Keynote, redes sociales y editores; Safari y Edge | Depende del navegador: si no codifica H.264, no hay MP4 (usa WebM o la grabación en directo). El Chromium de Playwright ni lo codifica ni lo reproduce (no trae códecs propietarios): el estudio no ofrece el botón y lo explica |
| **Grabación en directo** | Chromium: `MediaRecorder` graba WebM VP9 (no admite `video/mp4;codecs=avc1`); Chrome 154: MP4 H.264; Firefox 142: WebM VP8 (su `MediaRecorder` no ofrece VP9 ni MP4). Al detener, la grabación se reescribe sin recodificar: WebM con su duración y sin canal alfa declarado, o MP4 normal con el índice al principio (comprobado con ffprobe; antes el WebM no traía duración y declaraba alfa, y el WebKit de aquí no lo abría). Se decodifica sin errores y se reproduce en Chromium, Chrome, Firefox y WebKit (el MP4, en los tres que traen H.264) | Safari (grabaría MP4/H.264) | Guarda lo que el lienzo dibuja en ese momento: aquí, con WebGL por software y la CPU compartida, entre 0,5 y 2 fotogramas por segundo; en un equipo con GPU, los que dibuje su lienzo. Captura lo que se ve, incluido el cursor |
| **HTML para pegar** (fondo, portada, bloque) | En otra web (otro origen): se ve (desviación de luminancia 0,09–0,18), 0 errores de consola; al tamaño del lienzo del estudio y en t = 0 coincide con el PNG del estudio (RMSE desenfocado 0,002–0,013 con WebGL 2 y **lo mismo con el motor básico**, con WebGL 2 anulado); sigue el tamaño de su contenedor (el lienzo pasa de 760×420 a 520×300 y sigue dibujando); fuera de pantalla y oculto (`display:none`) deja de dibujar y vuelve al verse; si la página quita el bloque, se detiene, deja de pedir fotogramas y libera el contexto WebGL; con «reducir movimiento» dibuja un fotograma y se queda quieto; en Chromium con `--disable-3d-apis` dibuja el motor básico (contexto 2D) y, en la versión ligera, se ve el póster | Safari de verdad, móviles reales, CMS (WordPress, Webflow, Squarespace) | Sin WebGL 2, el motor básico va más lento (hasta 30 fps) y añade unos 52 KB (19 KB con gzip). La tipografía viene de Google Fonts salvo que elijas «sin dependencias». Imagen/video deben servirse desde el mismo dominio o con CORS. Si una página mezcla exportaciones de versiones distintas, manda el primer motor que se cargue |
| **Página .html** | Funciona sola desde otro origen, 0 errores | — | Igual que el HTML para pegar |
| **Web Component** | `<monotrama-field>` + `monotrama-field.js` desde otro origen, con el uso normal (`<script defer>` y la etiqueta ya en la página): su imagen coincide con el PNG del estudio (RMSE desenfocado 0,002–0,013), se pausa fuera de pantalla; al quitar el elemento, 0 dibujos, 0 `requestAnimationFrame` y el contexto WebGL liberado; sin WebGL 2 dibuja el motor básico, y con `no-basic` muestra el póster | Safari de verdad | Los cambios del atributo `recipe` después de montar no se observan |
| **React** | Proyecto Vite + React 19 desechable que importa el `.jsx` exportado (con y sin motor básico): `vite build` compila; en `vite dev` con `StrictMode` (monta dos veces) y en el build se ve, 0 errores; desmontar quita los lienzos y deja 0 dibujos, 0 `requestAnimationFrame` y 0 contextos WebGL vivos; volver a montar funciona; sin WebGL 2 dibuja el motor básico, y la versión ligera muestra su póster | Next.js (SSR), CRA, React 18 | — |
| **Zona protegida** (opción del código: HTML, Web Component, React) | e2e (`tests/e2e/legibility.spec.ts`): el HTML exportado con «Degradado», pegado en otra página, añade entre el fondo y el contenido una capa `position:absolute` con `backdrop-filter: blur(…)`, `mask-image: linear-gradient(…)` y el color y la opacidad elegidos; el Web Component (`monotrama-field.js` descargado + su uso, en otra página) dibuja la misma capa dentro de su *shadow root* con los atributos `scrim`, `scrim-color`, `scrim-opacity` y `scrim-blur`; el componente de React pasa la prop `scrim` a `Monotrama.mount` (comprobado en el código generado; el proyecto de React de prueba no se volvió a ejecutar con esta opción); «Tras el texto» exporta la clase `.monotrama-zona` para tus bloques. En el estudio, la vista previa y la estimación de legibilidad usan la misma definición (`src/shared/scrim.ts`) | Safari y Firefox (`backdrop-filter` con y sin prefijo), móviles reales | Sin `backdrop-filter` queda sólo el color, que es lo que más ayuda a leer. El degradado es más fuerte a la izquierda en cajas anchas y abajo en las altas: si tu texto va en otro sitio, usa «Tras el texto» o «Toda la página». Con «Tras el texto» tienes que poner la clase en tus bloques |
| **Componentes** (Descifrar, Máquina de escribir, Imán, Estela, Halo, Indicadores, Barra de progreso, Rótulo) | «HTML para pegar» y «Módulo ES» en otra web: funcionan (texto resuelto, letras que huyen, estela y halo con píxeles dibujados, indicador que gira, barra al 42 %); «React» dentro del proyecto Vite (build y dev/StrictMode); Node, Python y Bash en una pty real con Ctrl+C (cursor restaurado) y con la salida redirigida; rótulo en texto, README, saludo de shell y JS | Safari, Firefox, terminales de Windows | Imán y Estela necesitan puntero. Con «reducir movimiento», Descifrar, Máquina de escribir e Indicadores quedan quietos (comprobado); Imán, Estela y Halo no animan por su cuenta (según el código, sin prueba automática) |
| **Proyecto (.zip)** con foto, MP4 o WebM | Con archivos de verdad (foto de 12 MP, MP4 H.264 y WebM VP9 con movimiento): el `.zip` lleva el original byte a byte (SHA-256), la receta nombra el archivo con su tamaño y medidas, y la pestaña Receta lo dice antes de exportar; abierto en un perfil nuevo del navegador, la pieza vuelve con su archivo sin pedirlo, la receta es idéntica, tras recargar sigue ahí (IndexedDB) y su PNG es igual al del perfil original (RMSE 0,0000; en el video, en el mismo instante) | Otros equipos y sistemas | El Chromium de Playwright no abre MP4 H.264: el estudio lo dice («Este navegador no puede reproducir ese video…») |
| **Sesión (.zip)** y **colección (.zip)** | La sesión lleva historial, colección y cada archivo original (SHA-256); abierta en un perfil nuevo, las piezas vuelven con sus archivos y la colección con las suyas; la colección `.zip`, abierta en otro perfil, trae su pieza con su foto | — | Al abrir una sesión que pasa de 1000 resultados se descartan los más antiguos (el aviso lo dice antes) |
| **Cámara** | Con la cámara simulada del navegador: se ve en el lienzo y cambia; la hoja explica que no hay render fotograma a fotograma; la grabación en directo es un video que se decodifica y se reproduce en los cuatro motores. Permiso denegado y ninguna cámara, provocados de verdad en el navegador: el estudio explica cada caso y qué hacer; cámara ocupada, con la respuesta del navegador simulada (`NotReadableError`) | Cámaras reales, móviles, una cámara ocupada de verdad | La cámara no se exporta como código ni se guarda |
| **TXT** | UTF-8 válido; exactamente *filas* líneas; ancho de pantalla real ≤ *columnas* contando los glifos dobles como 2 (`wcwidth`) | — | Las líneas llevan los espacios finales recortados |
| **ANSI .ans** (16, 256, color real; con y sin fondo) | Sólo secuencias SGR válidas; cada línea mide exactamente *columnas* en pantalla y termina en `ESC[0m`; en un emulador (`pyte`) la pantalla es idéntica al TXT; `cat` en una pty real deja colores, cursor y `termios` como estaban | Terminales concretas (Windows Terminal, macOS Terminal, iTerm2) | «Color real» necesita una terminal con truecolor; 16 colores usa la paleta de la terminal |
| **HTML de texto** | UTF-8, título escapado, el `<pre>` conserva todas las filas (también una primera fila vacía) y su texto = TXT | — | Los glifos de ancho doble se ven a ~1,7 columnas en una fuente mono del navegador |
| **Script de Node (.mjs)** | En una pty: muestra fotogramas exactos (la pantalla emulada coincide con uno de los fotogramas incrustados), Ctrl+C restaura cursor, colores, ajuste de línea y pantalla principal, `termios` intacto; con la salida redirigida escribe un fotograma y termina (código 0); con `\| head` no imprime errores; funciona en Node 18.20.8 y 22 | Windows (cmd/PowerShell), macOS | Si la terminal es más pequeña, se recorta (no se deforma) |
| **Script de Python** | Igual que el de Node con `python3`; sólo importa biblioteca estándar (`base64, gzip, json, os, re, shutil, signal, sys, time`) | Windows (activa ANSI con `os.system("")`, sin probar), Python < 3.8 | — |
| **Saludo de shell** | `bash -i` lo imprime igual que el TXT; `bash` no interactivo no imprime nada (no rompe `scp`/`rsync`) | zsh (no instalado aquí), fish (no compatible: usa `case`/heredoc de sh) | — |
| **Para tu CLI (JS)** | En una pty la pantalla = TXT; redirigido a un archivo sale sin códigos de color | — | — |
| **asciinema .cast** | v2 válido (cabecera JSON, eventos `[tiempo, "o", datos]` con tiempos crecientes); la última pantalla es el último fotograma con el cursor visible; `asciinema cat` y `asciinema play` (×4) lo reproducen y terminan con código 0 | Reproductor web de asciinema, asciinema.org | — |
| **Receta .json / enlace** | (lo cubren las pruebas e2e del estudio) | — | — |

## Qué se arregló en la tercera pasada

- **Sin WebGL 2, el código exportado ya se mueve.** Antes quedaba el póster o el color de fondo. Ahora el código lleva, por
  defecto, el motor básico (Canvas 2D, el mismo que usa el estudio sin WebGL 2) y sólo los patrones que usa la pieza, en
  versión para el procesador. La pestaña Código lo dice antes de copiar, con lo que añade («Motor básico (+52 KB)») y el
  peso del código resultante (en bruto y con gzip), y deja elegir «Póster o color» para un código más ligero. En Firefox 142
  de esta máquina (sin WebGL 2) y en Chromium con `--disable-3d-apis` el código dibuja la pieza, y al tamaño del lienzo del
  estudio coincide con su PNG.
- **El Web Component arrancaba antes de tener sus patrones.** Con el uso normal (`<script defer>` y la etiqueta ya en la
  página), el navegador crea el elemento mientras el archivo lo define, antes de registrar los patrones: se veía el
  campo vacío con la viñeta (desviación de luminancia 0,047 frente a 0,12 del mismo fondo bien dibujado). Ahora arranca
  una microtarea después; el verificador compara su imagen con el PNG del estudio, no sólo que «se mueva».
- **Un bloque pegado que la página quita seguía vivo.** Si una web cambia de vista sin recargar y retira el bloque, el
  motor seguía pidiendo fotogramas y conservaba su contexto WebGL. Ahora, cuando su lienzo sale del documento, se detiene
  y lo libera (el Web Component y el componente de React ya lo hacían al desmontarse).
- **Una primera visita elegía otros caracteres.** La rampa de caracteres se ordena midiendo la tinta de cada uno en la
  tipografía de la pieza; si se medía antes de que la tipografía llegara, se guardaba el orden de la tipografía de reserva
  para toda la página. La misma pieza, reabierta después (o su código en otra web), salía con otros caracteres: RMSE 0,154
  entre el PNG de la primera visita y el de la misma pieza tras recargar. Ahora se mide otra vez cuando termina de cargar
  una tipografía: RMSE 0.
- **Grabación en directo.** El WebM de `MediaRecorder` no trae duración ni índice y, grabado desde un lienzo, declara un
  canal alfa: el reproductor de WebKit (GStreamer) se negaba a abrirlo. El MP4 de Chrome sale en fragmentos. Ahora se
  reescribe sin recodificar (los mismos paquetes de video) en un WebM normal o un MP4 con el índice al principio. Una
  grabación que el navegador entrega vacía ya no se descarga como archivo roto: se explica. Si el grabador ya se había
  parado solo, «Detener y guardar» ya no se queda esperando.
- **MP4 desde Firefox.** Firefox 142 (Linux) codifica H.264, pero entrega la descripción del flujo (la que va en la
  cabecera del MP4) con el primer byte de cada conjunto de parámetros repetido: la cabecera nombraba un SPS que no existe
  y ffmpeg avisaba «sps_id 1 out of range» al decodificarlo. Los navegadores de aquí lo reproducían porque leen los
  parámetros que van dentro del video; un editor o un reproductor que se fíe sólo de la cabecera puede rechazarlo. Ahora
  el estudio corrige esa descripción antes de escribir el archivo (sin tocar el video) y el MP4 se decodifica sin errores.
- **Cámara.** Todos los fallos decían «Revisa el permiso del navegador». Ahora el estudio distingue permiso denegado,
  pregunta cerrada sin responder, bloqueo del sistema, ninguna cámara, cámara ocupada por otra aplicación, página no segura
  y navegador que no deja pedirla, y dice qué hacer en cada caso. Una cámara que llega a abrirse pero no se reproduce se
  apaga (antes quedaba encendida, con su luz); si se desconecta a mitad, lo dice en lugar de congelar el último fotograma.
- **El verificador** seguía usando los `<select>` nativos que la interfaz ya no tiene: no podía correr sobre la versión
  actual. Ahora usa los selectores de la interfaz, corre en cuatro motores y guarda en qué motor pasó cada comprobación.

Pruebas de «antes y después» de la tercera pasada (versión de partida `23f2757` frente a la actual):

| Qué | Antes | Ahora |
| --- | --- | --- |
| Código exportado en Firefox 142 de esta máquina (sin WebGL 2) | color de fondo o póster, sin animación | el motor básico dibuja la pieza; al tamaño del estudio, RMSE desenfocado 0,020 contra su PNG |
| Web Component con `<script defer>` y la etiqueta ya en la página | campo vacío con la viñeta (desviación 0,047) | la pieza (desviación 0,12–0,14; su PNG, RMSE desenfocado 0,002–0,013) |
| Bloque pegado que la página quita | sigue pidiendo fotogramas, contexto WebGL vivo | 0 `requestAnimationFrame`, contexto liberado |
| PNG de una pieza con foto: primera visita frente a la misma pieza tras recargar | RMSE 0,154 (otros caracteres) | RMSE 0 |
| Grabación en directo WebM (Chromium) en el WebKit de esta máquina | error 4 (declara canal alfa, sin duración) | se reproduce, con su duración |
| MP4 renderizado en Firefox 142, `ffmpeg -v error` | «sps_id 1 out of range» (la cabecera describe un SPS 14 y un PPS que apunta a un SPS 1; el video usa el SPS 0) | sin errores |
| Cámara con el permiso denegado / sin cámara | «No se pudo abrir la cámara. Revisa el permiso del navegador.» en los dos casos | un mensaje para cada caso, con qué hacer |

## Qué se arregló en la segunda pasada

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

- **Safari y teléfonos reales.** El WebKit de aquí es la compilación de Playwright para Linux (GTK, con GStreamer para el
  video): comparte el motor de páginas con Safari, pero no su reproductor, sus códecs, su WebGL ni sus permisos. Los
  teléfonos sólo se emularon en Chromium (tamaño, tacto y densidad de un Pixel 7). Tampoco hay GPU real: todo el WebGL de
  esta sesión es SwiftShader.
- **Aplicaciones**: Figma, Illustrator, Affinity, Sketch, Photoshop, After Effects y editores de video no están aquí. El SVG
  se validó con xmllint, rsvg-convert, Inkscape 1.2 y cuatro motores de navegador; los videos, con ffprobe/ffmpeg y
  cuatro motores. La interfaz no dice que se haya comprobado en esas aplicaciones.
- **Redes sociales, mensajería y QuickTime/Keynote**: no se ha subido ni abierto nada allí. El MP4 es H.264 High,
  yuv420p, con el índice al principio, que es lo que suelen pedir.
- **Terminales concretas**: Windows (cmd, PowerShell, Windows Terminal), macOS Terminal, iTerm2, zsh (no instalado) y fish.
  La terminal verificada es una pty de Linux emulada con `pyte`, más la reproducción con asciinema 2.4.
- **Reproductor web de asciinema** y subida a asciinema.org.
- **Frameworks**: Next.js con SSR, Create React App y React 18 (se probó React 19 con Vite).
- **CMS y constructores de webs** (WordPress, Webflow, Squarespace): se probó una página HTML propia servida desde otro origen.
- **Pestaña en segundo plano**: la pausa fuera de pantalla y oculta (`display:none`) está comprobada; con la pestaña en
  segundo plano depende de que el navegador pare `requestAnimationFrame`, y en modo sin ventana no se puede provocar.
- **Cámara ocupada de verdad** y cámaras reales: se usó la cámara simulada de cada navegador; «ocupada» se comprobó con
  la respuesta que da el navegador en ese caso (`NotReadableError`), no con otra aplicación usándola.
- **Google Fonts**: en esta red el proxy vuelve a firmar HTTPS; se cargaron en Chromium y Chrome confiando sólo en su CA
  (`VERIFY_CA`). Firefox y WebKit no la cargan aquí y usan la mono del sistema (las comparaciones lo tienen en cuenta).

## Límites conocidos

- Los efectos de píxel no existen en SVG; exporta PNG si los necesitas. La pestaña Vector lo avisa antes de exportar y
  muestra el fotograma actual junto al mismo fotograma sin esos efectos.
- Sin WebGL 2, el código dibuja con el motor básico: la misma pieza, más despacio (hasta 30 fps, y 15 si va justo) y
  con más trabajo para el procesador. Añade unos 52 KB (19 KB con gzip). Con «Póster o color» el código pesa eso menos y,
  sin WebGL 2, no se mueve.
- La zona protegida del código depende de `backdrop-filter` para el desenfoque; sin él, sólo pinta el color.
- En la vista, los caracteres que no están en las tipografías incluidas (bloques, braille, cajas, flechas, katakana…) los
  dibuja la fuente del sistema: pueden cambiar de un equipo a otro. En el SVG, bloques y braille van como geometría exacta.
- MP4 sólo donde el navegador codifica H.264; si no, WebM o grabación en directo.
- La grabación en directo guarda lo que el lienzo dibuja mientras grabas: su fluidez es la del equipo.
- El código exportado carga la tipografía desde Google Fonts salvo con «sin dependencias».
- Imagen o video de fondo en el código: mismo dominio o CORS.
- Los scripts de terminal no redimensionan la pieza: si la terminal es más pequeña, recortan.

## Cómo repetirla

```bash
npm run build
npx vite preview --port 4196 --strictPort &                    # cualquier puerto libre
PORT=4196 npm run verify:exports                                # todo, en el Chromium de Playwright
# los mismos grupos que dependen del navegador, con tres piezas, en los otros tres motores
BROWSER=chrome  PORT=4196 ONLY=imagen,vector,video,mp4,codigo,react,proyectos,camara PIECES=patron,imagen,limpio npm run verify:exports
BROWSER=firefox PORT=4196 ONLY=imagen,vector,video,mp4,codigo,react,proyectos,camara PIECES=patron,imagen,limpio npm run verify:exports
BROWSER=webkit  PORT=4196 ONLY=imagen,vector,video,mp4,codigo,react,proyectos,camara PIECES=patron,imagen,limpio npm run verify:exports
```

Son exactamente las cuatro ejecuciones cuyo resultado resume [compatibilidad.md](compatibilidad.md#resumen-por-grupo-y-motor).
Texto, terminal y componentes se corrieron sólo con el Chromium de Playwright (los archivos de texto y terminal se
comprueban en la terminal, no en el navegador; los componentes web, en otros motores, quedan sin comprobar). En esta red,
la ejecución completa y la de Chrome llevan además `VERIFY_CA` (la CA del proxy) para cargar Google Fonts.

Al final imprime cada comprobación con el motor en el que corrió y una tabla PASS / FAIL / SKIP por grupo y motor; lo
guarda también en `results.json` y `summary.json` dentro de `OUT`.

Variables:

- `BROWSER`: el navegador que maneja el estudio y visita el código pegado: `chromium` (el de Playwright, por defecto),
  `chrome` (Google Chrome estable instalado en el sistema: es el que codifica H.264), `firefox` o `webkit`.
- `PW_EXTRA`: carpeta con las compilaciones `firefox-N` y `webkit-N` de Playwright si no están en la carpeta de navegadores
  por defecto (aquí, `/opt/pw-extra`).
- `PLAY`: motores en los que se abren los archivos finales (video en `<video>`, SVG, imágenes); por defecto
  `chromium,chrome,firefox,webkit`, los que haya.
- `ONLY`: grupos separados por comas: `imagen`, `vector`, `video` (incluye `webm`, `gif`, `directo` y `reproduccion`), `mp4`,
  `codigo`, `react`, `componentes`, `texto`, `terminal`, `proyectos`, `camara`. `PIECES` limita las piezas de prueba
  (`patron,imagen`…) mientras se desarrolla.
- `PORT` (puerto del estudio, 4173 por defecto), `SITE_PORT` (la «web ajena» en otro origen; por defecto `PORT + 100`, y el
  proyecto React en modo dev usa el siguiente), `OUT` (carpeta de artefactos), `NODE18` (ruta a un Node 18; si no, prueba
  `npx -y node@18`) y `VERIFY_CA` (PEM de la CA de un proxy que vuelve a firmar HTTPS, para que Chromium confíe sólo en ella).

Cada herramienta o motor que falte convierte sus comprobaciones en **SKIP** con el motivo; nunca en FAIL. Herramientas:
ffmpeg/ffprobe, ImageMagick, rsvg-convert, Inkscape, gifsicle, xmllint, python3 con `pyte` y `wcwidth`
(`pip install pyte wcwidth`), asciinema (`pip install asciinema`), bash. El ayudante de terminal está en
`scripts/verify-exports.py`.
