# GLYPHOS — ASCII Shader Lab

**Haz arte ASCII que se mueve.** Con tus fotos, video, texto o el azar: explora sin configurar nada, guarda lo que te guste y llévalo a tu web, a un video o a tu terminal. *Teje luz con caracteres.*

GLYPHOS es un estudio de arte ASCII en tiempo real que corre en el navegador: fondos animados para web, composiciones abstractas, imagen, video y cámara convertidos en caracteres, tipografía animada, piezas para terminal y una biblioteca de componentes listos para insertar. Todo se puede guardar, reabrir, compartir y exportar como archivo o como código que funciona.

El sitio público es el **laboratorio** (`/studio/`), donde el dado teje piezas completas y tu imagen, tu video o tu cámara se vuelven caracteres. El **estudio de foto y video** (`/studio/foto/`), donde tu foto o tu video se vuelven capas y sólo las partes que eliges pasan a caracteres, está **en revisión**: el código sigue aquí, pero la compilación pública no lo enlaza ni lo indexa, y su dirección muestra una página «en revisión» (ver [«Estudio de foto y video»](#estudio-de-foto-y-video)).

- Sitio: https://glyphos-ascii.vercel.app (`monotrama.vercel.app` y `ascii-shader-lab.vercel.app` redirigen aquí, con la misma ruta y el mismo enlace).
- Antes se llamó **Monotrama**: sus recetas (`.monotrama.json`), proyectos (`.monotrama.zip`), sesiones, colecciones, enlaces y el código exportado (`<monotrama-field>`, `Monotrama.mount`) siguen abriéndose y funcionando. Lo nuevo sale como GLYPHOS (`.glyphos.json`, `.glyphos.zip`, `<glyphos-field>`, `Glyphos.mount`). Marca: `public/brand/glyphos/`.
- Laboratorio: `/studio/` · Foto y video (en revisión): `/studio/foto/` · Guías: `/imagen-a-ascii/`, `/video-a-ascii/`, `/fondos-ascii/`, `/texto-animado-ascii/`, `/arte-ascii-terminal/` · Licencia: `/licencia/`.
- El prototipo original de un solo archivo se conserva en [`legacy/ASCII Shader Lab.html`](legacy/ASCII%20Shader%20Lab.html); sus ajustes JSON se abren en el estudio.

Desarrollado por [Morphiq](https://morphiq.com.mx).

## Comandos

Requisitos: Node 20 o superior.

```bash
npm install            # dependencias
npm run dev            # desarrollo: http://localhost:5173 (portada), /studio/, /imagen-a-ascii/…
npm run build          # tipos + build de producción en dist/ (incluye robots.txt y sitemap.xml)
npm run preview        # sirve dist/ en http://localhost:4173 (404 y /studio → /studio/ como en Vercel)
npm test               # pruebas unitarias (Vitest)
npm run test:e2e       # pruebas de punta a punta (Playwright, contra el build)
npm run check          # tipos + unitarias + build
npm run verify:exports # verificador de exportaciones (ver abajo)
VITE_FOTO_STUDIO=1 npm run dev    # con el estudio de foto y video (en revisión; sin la variable, /studio/foto/ dice «en revisión»)
VITE_FOTO_STUDIO=1 npm run build  # compilación con el estudio de foto y video, sus enlaces y su entrada en el sitemap
```

- Las pruebas e2e usan Chromium de Playwright con WebGL por software (SwiftShader); funcionan sin GPU. `PW_PORT` cambia el puerto (útil con varias copias a la vez) y `BASE_URL=https://glyphos-ascii.vercel.app npm run test:e2e` las corre contra el sitio publicado.
- Verificador de exportaciones: `npm run build && npx vite preview --port 4177 --strictPort &` y luego `PORT=4177 npm run verify:exports`. Imprime una tabla PASS/FAIL/SKIP. Usa, si están instalados, ffmpeg/ffprobe, ImageMagick, rsvg-convert, Inkscape, gifsicle, xmllint y Python con `pip install pyte wcwidth asciinema`; si falta una herramienta, marca SKIP. `ONLY=imagen,vector,video,mp4,codigo,react,componentes,texto,terminal` corre sólo esos grupos.
- Paridad del motor básico: `node scripts/basic-parity.mjs [--quick]` compara los dos motores patrón por patrón (`--solo creativo` sólo transformaciones y letras).
- Variedad del dado: `node scripts/azar-report.mjs` tira cientos de veces por espacio y cuenta estilos, patrones y objetos 3D.
- Carteles y textos de ejemplo de las guías: `node scripts/posters.mjs`. Medios de la portada (hoja de contactos del dado y la pieza «Saturno» exportada a PNG, SVG, MP4, WebM, Web Component, script de terminal y receta en `public/ex/salidas/` con su `manifest.json`): `node scripts/posters.mjs --portada` (usa Google Chrome para el MP4 si está instalado). Logo de Morphiq: `scripts/seo-logo.sh <original.png>`. Avisos de terceros: `node scripts/third-party.mjs` (`--check` en CI).
- Páginas de QA en `npm run dev`: `/dev/patterns.html`, `/dev/scene.html`, `/dev/basic.html` (WebGL frente a motor básico), `/dev/glyphfx.html` (apertura tejida y cortinas de glifos, con botón «Tejer» y movimiento bajo), `/dev/landing.html` (lo que usa `posters.mjs --portada`). Del estudio de foto y video: `/dev/project.html` (el compositor; `?motor=basico` sin WebGL 2), `/dev/fx.html` (acabados), `/dev/glyphs.html` (caracteres reales y juegos de caracteres), `/dev/foto-tools.html` (herramientas de selección; `?foto=guitarra|retrato|sintetica`), `/dev/anim.html` y `/dev/timeline.html` (biblioteca de animaciones y línea de tiempo), `/dev/posters.html` (carteles), `/dev/video.html` (exportación de video, seguimiento y recorte de video). El estudio mismo acepta `?qa` (`/studio/foto/?qa`): expone `window.__foto` para las pruebas y no cambia nada más.
- La página de QA del recorte (`/dev/cutout.html`) no va en el sitio: se compila aparte con `npx vite build --config scripts/cutout-qa.config.ts` (sale en `dist-qa/`), se sirve con `npx vite preview --config scripts/cutout-qa.config.ts --port 4195 --strictPort` y sus pruebas corren con `BASE_URL=http://localhost:4195 npx playwright test tests/e2e/cutout.spec.ts`. Sin esa página, cada prueba se omite y dice cómo compilarla.
- **Pruebas con los modelos de recorte**: `node scripts/fetch-models.mjs --out .cache/modelos --backend wasm --only select,portrait` baja una copia local verificada (SHA-256; «Retrato» y «Seleccionar objeto», unos 47 MB; sin `--only`, también «Sujeto», 192 MB). Las pruebas que usan modelos (`cutout`, `foto-studio`, `escenarios`, `video`) nunca llaman a Hugging Face: sus direcciones se desvían a esa copia (`GLYPHOS_MODELS_DIR` cambia la carpeta); si falta, se omiten con el comando que la crea. `GLYPHOS_E2E_SUBJECT=0` omite el modelo grande. `tests/e2e/escenarios.spec.ts` recorre los escenarios completos (retrato con pelo, objeto sobre fondo cargado, varias zonas, PNG transparente, cartel, animación al revés, reabrir un proyecto, recetas antiguas y teléfono vertical) y guarda sus capturas en la carpeta `ESCENARIOS_SHOTS` si la defines. Son lentas: córrelas con `--workers=1`.

## Cómo está hecho

```
src/
  engine/        motor WebGL2 y motor básico Canvas 2D (engine/basic), receta, catálogo, atlas, diagnóstico WebGL
  project/       el proyecto del estudio de foto y video: contrato (types.ts), evaluate(proyecto, t), compositor, máscaras, fuentes, archivo .glyphos.zip, carteles, ajustes guardados
  fx/            acabados sobre píxeles (tramados, semitono, brillo, sombra, paletas limitadas…), en CPU
  glyphs/        caracteres reales: rejilla, juegos de caracteres, dibujo y salidas de texto (TXT, ANSI, SVG)
  anim/          biblioteca de animaciones (plantillas, coreografías, llaves, curvas)
  cutout/        recorte en el navegador: modelos, consentimiento, descarga verificada, worker de ONNX Runtime Web, refinado de bordes
  video/         exportación de video y GIF con sonido, reloj de reproducción, seguimiento de objetos, recorte de video
  foto/          la aplicación del estudio de foto y video (React + zustand): herramientas, capas, inspector, línea de tiempo, exportación, extras
  random/        azar con semilla: PRNG, semillas en palabras, arquetipos, paletas, mutación, huellas
  exporters/     formateadores puros: texto/ANSI/HTML/asciicast/scripts, SVG, código web
  runtime/       el motor empaquetado para webs de terceros (Glyphos.mount, <glyphos-field>)
  components/    biblioteca de piezas en JS puro (descifrar, máquina de escribir, imán, estela, halo…)
  studio/        la aplicación (React + zustand): guías, vistas de destino, historial, medios, exportación
    ui/          controles propios: ScrollRow (filas desplazables con aviso de «más»), Picker (lista accesible con vista previa), ayuda progresiva, editor de rampas
    motion/      identidad de movimiento: cortinas de glifos por contexto, etiquetas que se resuelven, apertura tejida
  landing/       la portada (HTML estático + islas en TypeScript)
  pages/         las guías públicas (demo perezosa, ejemplos)
  shared/        tokens, logo, enlaces, zip, proyecto, sesión, datos del sitio (site.ts), glyphfx (movimiento con glifos), scrim (zona protegida)
scripts/         plugins de Vite (runtime, SEO), verificadores, generadores de carteles y avisos
tests/unit, tests/e2e
docs/exportaciones.md   qué produce cada formato y cómo se comprobó
docs/compatibilidad.md  función × navegador: lo que ofrece la interfaz, lo que pasó una prueba automática y lo que se abrió y comprobó a mano
```

### Dos motores, la misma receta

Una **receta** (`Recipe`) es JSON plano que describe la pieza entera. `createRenderer()` (`src/engine/create.ts`) elige el motor:

- **WebGL 2** (`AsciiEngine`): simulación, campo con hasta 4 capas de 55 patrones (13 de ellos objetos 3D: dona, vóxeles, cristales, planeta, nudo…) y 11 mezclas (shader generado por receta con sólo los patrones usados), hasta 4 transformaciones de la fuente, letras que se mueven, selección de glifos, bloom y composición con el atlas al tamaño exacto de la celda.
- **Motor básico Canvas 2D** (`src/engine/basic`): traducción línea a línea de los mismos shaders a JavaScript, con el mismo atlas. Se usa cuando WebGL 2 no está disponible (aceleración gráfica desactivada, GPU bloqueada, navegador antiguo) o cuando se pide con `?motor=basico` o `localStorage['mt.motor'] = 'basico'`. Medido contra WebGL (SwiftShader, `scripts/basic-parity.mjs`): 53 de 55 patrones con correlación ≥ 0.999, planeta 0.998 y julia 0.988; las 47 plantillas ≥ 0.992; las 10 transformaciones 1.000 (pilas ≥ 0.998) y las animaciones de letras 1.000. Es más lento: las piezas pesadas (curvatura CRT, resplandor) bajan a 15 fps. Se descarga sólo cuando hace falta.
- `probeWebGL()` / `explainWebGL()` (`src/engine/support.ts`) dan la causa exacta y los pasos en español. El estudio muestra un aviso «Modo básico» con «¿Por qué?»; la portada y las guías también dibujan sin WebGL 2.
- El código exportado incluye por defecto el motor básico, sólo con los patrones que usa la pieza (unos 19 KB gzip más): sin WebGL 2, la pieza se sigue moviendo, más despacio. La pestaña Código muestra la elección y el peso; «Póster o color» da la versión ligera, que sin WebGL 2 deja el póster que indiques o el color de fondo.

### Azar con memoria

- **Semillas legibles** (`faro-lunar-417`): misma semilla + mismo espacio + mismo estilo + misma versión del generador → misma pieza. La versión actual es la 4 (`GEN_VERSION`); las versiones 1 a 3 siguen disponibles (`#seed=…&gen=1`), así que los enlaces antiguos dan la misma pieza que antes.
- 14 **estilos** (arquetipos), **bloqueos** por grupo, **huellas** y una penalización por lo reciente para no repetirte lo que acabas de ver (sin prometer que una combinación no vuelva nunca). En el espacio de imagen, el dado propone también transformaciones.
- **Miniaturas**: cada entrada del historial se dibuja desde su propia receta (a t = 4 s) en segundo plano, con una huella de la receta para no mostrar nunca la de otra; mientras tanto se ve «preparando». Aguantan ráfagas de tiradas, recargas, pérdida de WebGL y historiales antiguos sin miniatura.
- **Transiciones** entre piezas en seis estilos (Tejido, Disolución, Lluvia, Iris, Barrido, Mosaico) y **Calidad de la vista previa** (Auto, Alta, Equilibrada, Ligera; `localStorage['mt.v3.preview']`): el cambio se prepara (shader, fuentes) antes de que empiece la transición; «Ligera» baja resolución, cuadros y movimiento de la interfaz.
- **Historial**: guarda los **últimos 1000 resultados** en este navegador (IndexedDB, escritura incremental). Al pasar de 1000 se descartan los más antiguos que **no** estén en tu colección ni sean el actual; avisa al 90 % y al primer descarte, con «Guardar sesión». Un contador lo dice siempre. Se guarda también al ocultar la pestaña.
- Tirar desde un resultado antiguo añade al final; las ediciones enmiendan la entrada, con deshacer/rehacer por entrada, «ver original» (mantener pulsado) y «restaurar».
- Para probar la poda: `localStorage.setItem('mt.histLimit', '10')` (sólo pruebas).

### Qué se guarda y cómo se comparte

| | Qué contiene | ¿Incluye tu imagen/video? | Exactitud |
| --- | --- | --- | --- |
| Semilla | el nombre que usó el dado | no | depende de la versión del generador; sin tus ediciones |
| Receta `.json` | todos los ajustes | no (sólo nombre y medidas) | exacta |
| Enlace | la receta comprimida tras el `#` (nunca llega a un servidor) | no, ni su nombre | exacta; quien lo abre elige su propia imagen |
| Favorito (★) | receta en la colección de este navegador | sí, guardada en este navegador | exacta |
| Proyecto `.glyphos.zip` (también abre los `.monotrama.zip` de antes; los `.glyphos.zip` del estudio de foto y video se abren allí, y el laboratorio lo dice) | receta + archivo original + LEEME.txt | sí | exacta y completa, en cualquier equipo |
| Colección `.zip` | tus favoritos con sus imágenes y videos | sí | exacta |
| Sesión `.zip` | historial + colección (+ medios opcionales) | opcional | exacta |
| Rampa propia | tus caracteres ordenados, en este navegador (`mt.v2.ramps`, hasta 40) | — | la receta lleva los caracteres, así que enlaces y proyectos no dependen de ella |

- Las imágenes (≤ 40 MB) y videos (≤ 200 MB) que cargas se guardan en IndexedDB (`mt-media`) con su contenido original, identificados por su contenido (SHA-256; en archivos de más de 16 MB, tamaño más tres muestras para no duplicar el archivo en memoria); volver en el historial o abrir un favorito los recupera. Lo más grande funciona mientras la pestaña esté abierta (y no viaja al estudio de foto: el laboratorio lo dice). La cámara nunca se guarda, salvo la imagen fija que pides al llevar una pieza de cámara al estudio de foto. Lo que ya nada usa se borra solo.
- **Una pestaña a la vez**: si abres el estudio en otra pestaña, la nueva toma el control (Web Locks + BroadcastChannel) y la anterior guarda, se detiene y ofrece «Usar aquí»; así dos pestañas no se pisan el historial ni la colección. Si IndexedDB no está disponible o está lleno, el estudio lo dice («Sin guardar» / «Sin espacio») y ofrece guardar la sesión en un archivo.
- Al abrir una sesión que pasa de 1000 resultados se descartan los más antiguos por fecha, y el aviso dice cuántos antes de hacerlo.
- Antes de copiar el enlace de una pieza con imagen o video, el estudio avisa de que el archivo no viaja y ofrece exportar el proyecto.
- Borrar los datos del sitio en el navegador borra historial, colección y medios; el estudio pide almacenamiento persistente y muestra el uso.

### Empezar, comparar y previsualizar

- **Guías** (primera visita, botón «Guías», tecla G o `/studio/?camino=foto|fondo|palabra`; también `/studio/#space=media&source=video|image|camera`): convertir una foto en ASCII (termina en PNG ×2 y texto), crear un fondo para tu web (control «Presencia», legibilidad estimada y zona protegida, termina en código HTML/Web Component/React) y animar una palabra (termina en GIF, video si el navegador puede codificarlo, o snippet). Cada paso es una entrada normal del historial; el paso se anuncia («Paso 1 de 4») a los lectores de pantalla.
- **Comparar**: miniaturas bajo/medio/alto para tamaño de celda y contraste; muestras de juegos de caracteres y paletas.
- **Vistas de destino** (selector «Vista», con icono y descripción): Libre, Fondo web (con contenido encima), Pantalla de móvil (una web de 390×844 con tu pieza de fondo), Tarjeta (360×225), Historia / Reel 9:16 (video vertical de 1080×1920; puedes marcar dónde suelen ir los textos y botones de las apps), README (imagen + texto de 80 columnas como en GitHub) y Terminal. El lienzo real toma el tamaño del destino, así que lo que ves es lo que exportas. «Exportar para este destino» abre el formato adecuado.
- **Legibilidad (estimación)** en Fondo web y Pantalla de móvil: mide cada región de texto (titular, párrafo, botón) contra la pieza en varios cuadros —la parte que queda bajo 4.5:1 y 3:1, la textura de los glifos y la peor décima parte— y sólo dice «se lee bien» cuando los números lo sostienen. **Zona protegida** (Suave, Media, Fuerte) pone un velo detrás del contenido; va también en el código exportado (opción `scrim`, clase `.glyphos-zona`). `localStorage['mt.debugLegib'] = '1'` deja la última medición en `window.__mtLegib`.
- **En vivo**: el micrófono (sólo al pulsar) marca el pulso; cursor y tacto con linterna, ondas, lupa, empuje, remolino, borrador, pincel y caos; modo exposición.

### Crear: transformaciones, letras que se mueven y rampas propias

- **Transformar** (pestaña de Imagen y de Tipo): hasta 4 transformaciones de la fuente aplicadas en orden, cada una con su cantidad, un parámetro, interruptor y orden editable: Semitono, Contorno neón, Bandas, Arrastre (pixel sort), Desplazar con el patrón, Caleidoscopio, Ondular, Estela (sólo video y cámara), Canales RGB y Píxeles grandes. Van en la receta (`media.xform`; las recetas sin ella quedan idénticas) y funcionan en los dos motores y en todas las exportaciones.
- **Letras que se mueven**: el texto grande (Ola, Rebote, Latido, Revolver, Palabra a palabra, Explosión, Luz que recorre) y el mensaje (Ola, Rebote, Revolver, Explosión, Color por letra y el modo «Palabra a palabra»). Son función del tiempo de la pieza; con «Bucle perfecto» cada efecto ajusta su velocidad para dar un número entero de ciclos, así que el video y el GIF enlazan sin costura (salvo la Estela, cuyo rastro empieza vacío en el primer cuadro del clip). Sin bucle, las piezas se dibujan igual que antes.
- **Editor de rampas** (Glifos): escribe caracteres o palabras, ve la tinta que deja cada glifo con la fuente de la pieza, ordénalos por densidad y guárdalos en «Tus rampas».
- Plantillas nuevas: Serigrafía, Neón, Caleidoscopio, Píxel ordenado y Vidrio (Imagen); Ola, Estallido, Palabra a palabra y Cartel (Tipo).
- **Componentes** (14, cada uno en HTML, módulo ES y React, sin dependencias y con cabecera MIT-0): descifrar, máquina de escribir, imán, estela, halo, spinners, barra de progreso, banner, y los nuevos Revelar (foto ASCII que descubre el original bajo el cursor), Foco (fondo de sección que ilumina el cursor o el foco), Pantalla de carga (`progressbar` real), Separador (ticker con pausa), Letras de bloque (dos fuentes, con acentos y ñ; también como CLI de Node) y Enlaces con interferencia (su nombre accesible nunca cambia).

### Movimiento e interfaz

- El estudio se abre tejiendo su interfaz con caracteres (unos 2,4 s, una vez por sesión del navegador; cualquier tecla, clic, toque o rueda lo termina; la interfaz real funciona debajo desde el primer cuadro).
- Todo contenido que cambia se descompone y recompone con glifos según el contexto (una pestaña es ligera, un cambio de espacio es más rico; las etiquetas se resuelven desde la rampa). Nunca retrasa el cambio ni bloquea la entrada.
- La calidad «Ligera» pone `data-motion="low"` en `<html>` (efectos a la mitad, los ligeros fuera); con «reducir movimiento» no corre ninguno.
- Avisos y notas en un solo lugar, bajo la barra de vistas, sin tapar controles. Las filas que no caben (espacios, recetas, historial, vistas) se desplazan con rueda, trackpad, teclado o dedo y avisan de lo que queda a cada lado.

### Exportaciones

Sólo se ofrece lo que el navegador puede producir; lo demás aparece como explicación con la alternativa. Detalle, herramientas y resultados en [`docs/exportaciones.md`](docs/exportaciones.md).

| Formato | Qué obtienes | Límites |
| --- | --- | --- |
| PNG / WebP / JPEG | re-render a ×2, ×3, 1080p, 4K, cuadrado, vertical, 1200×630; fondo transparente | WebP/JPEG sólo si el navegador los codifica |
| SVG | contorno real de cada glifo; bloques y braille como geometría exacta | sin efectos de píxel; caracteres fuera de la fuente quedan como texto |
| MP4 / WebM | render fotograma a fotograma con WebCodecs (mediabunny) | MP4 sólo si el navegador codifica H.264 (comprobado con Chrome 154 y Firefox 142; al de Firefox se le repara la cabecera H.264 al guardar); sin audio; la cámara sólo en directo; la Estela se calienta antes del primer cuadro para que el bucle enlace |
| Grabación en directo | MediaRecorder del lienzo | formato según el navegador; calidad según la fluidez |
| GIF | hasta 25 fps, 128 colores por fotograma | mejor corto y pequeño |
| TXT / ANSI / HTML | rejilla exacta del motor; ANSI 16, 256 o color real; glifos anchos ocupan dos celdas | — |
| Terminal animada | scripts Node (18+) y Python sin dependencias, asciinema `.cast`, saludo de shell | Ctrl+C restaura la terminal; redirigidos escriben un fotograma |
| Código | HTML para pegar, página, Web Component, React (seguro en StrictMode); motor básico o póster de respaldo | sin WebGL 2 dibuja el motor básico incluido (o, en la versión ligera, el póster); al quitarlo de la página libera su contexto |
| Receta / Proyecto / Sesión | ver la tabla anterior | — |

Verificado sobre la versión final con herramientas reales (identify/compare, rsvg-convert, Inkscape, gifsicle, ffprobe/ffmpeg, pyte en una pty, Node 18 y 22, Python 3, React 19 con Vite) y abriendo cada archivo o código pegado en el navegador: ejecución completa con el Chromium de Playwright, 690 comprobaciones (680 PASS, 0 FAIL, 10 SKIP); y los grupos que dependen del navegador en Chrome 154 (295 PASS, 0 FAIL), Firefox 142 (293 PASS, 0 FAIL) y WebKit 26 (254 PASS, 2 FAIL: el código de la pieza transformada con WebGL 2, ver «Pendiente»). La tabla función × navegador que separa «la interfaz lo ofrece», «prueba automática pasó» y «abrí el resultado final» está en [`docs/compatibilidad.md`](docs/compatibilidad.md). No verificado: Safari de verdad, teléfonos reales, apps de diseño (Figma, Illustrator…) y terminales de Windows/macOS.

### Sitio público y SEO

- `src/shared/site.ts` es la única fuente de URLs, títulos, descripciones e imágenes sociales, y de `FOTO_STUDIO` (`VITE_FOTO_STUDIO=1` en el entorno de la compilación; sin ella el estudio de foto y video está en pausa: fuera del sitemap, sin JSON-LD, `noindex`, y los bloques `<!-- @foto-on -->…<!-- @foto-end -->` de las páginas desaparecen mientras los `@foto-off` aparecen). La variable va en el entorno, no en un `.env`: el build se detiene si la encuentra sólo ahí; `scripts/seo-plugin.ts` genera en el build las etiquetas `<head>` (canonical, Open Graph, Twitter), el JSON-LD (WebSite, Organization, WebApplication, WebPage, BreadcrumbList), `robots.txt`, `sitemap.xml` y la cabecera y el pie compartidos. Para añadir una página: entrada en `PAGES` + HTML con `<!-- @head -->`.
- La portada muestra las creaciones del propio estudio: un escenario vivo con los seis espacios (pestañas con teclado), un dado que funciona con su historial y una hoja de contactos de 14 tiradas, y los archivos reales exportados de una misma pieza por destino. Sus islas se cargan cerca de su sección cuando la página está en reposo (un clic anterior se repite al montar), como mucho 3 lienzos WebGL vivos y en pausa fuera de pantalla. Los tamaños de archivo que cita salen de `public/ex/salidas/manifest.json` (`@salida:clave`), así que nunca citan un número viejo.
- **Search Console**: define la variable `GOOGLE_SITE_VERIFICATION` en Vercel (sólo el valor de `content="…"`) y vuelve a desplegar; la etiqueta aparece en todas las páginas. Luego envía `https://glyphos-ascii.vercel.app/sitemap.xml`.

### Rendimiento (medido en laboratorio, no son datos de campo)

Lighthouse 12 móvil (4× CPU, red simulada) y web-vitals en Pixel 7 emulado, sobre `vite preview`, GPU por software y CPU compartida; medianas de ejecuciones intercaladas antes/después:

| | Antes | Después |
| --- | --- | --- |
| Portada: CLS | 0.119 | 0 |
| Portada: LCP (Lighthouse) | 2.84 s | 2.66 s |
| Portada: JS inicial | 81 KB | 61 KB |
| Guías: CLS | 0.126 | 0 |
| Estudio: JS inicial (gzip) | 216 KB | 163 KB |
| Estudio con 1000 resultados: fotograma de montaje | 0.9–1.0 s | 0.3 s |

Tercera pasada (Lighthouse 12, Chromium con SwiftShader, mediana de 3 intercaladas, máquina compartida: el TBT varía mucho): portada móvil LCP 2.62 → 2.72 s, CLS 0 → 0, TBT 3.67 → 2.98 s; escritorio LCP 0.61 → 0.66 s, TBT 1.91 → 1.13 s; JS inicial de la portada 33.7 → 20.7 KB gzip (el HTML crece de 5.8 a 12.5 KB porque la hoja de contactos y los destinos están en la página). El h1 sigue siendo el LCP.

Fase 4 (estudio de foto y video; `vite preview`, Chromium con SwiftShader, 3 cargas por página): la portada carga lo mismo (83 KB de JS transferidos, CLS 0); la primera vista del laboratorio pasa de 253 a 267 KB de JS transferidos (con «ahorro de datos»: el dock, la hoja con alturas, el modo inmersivo, la cámara y el interruptor; del estudio de foto sólo trae 1 KB), con LCP y CLS iguales (CLS 0.001). Ni la portada ni el laboratorio descargan nada del estudio de foto (recorte, ONNX Runtime, animación, compositor).

Qué se hizo: motor básico, hoja de exportación, colección, componentes y codificadores de video se cargan bajo demanda (`tests/e2e/perf.spec.ts` lo vigila); fuentes de respaldo con métricas ajustadas; miniaturas del historial perezosas. El INP en laboratorio lo domina el dibujo por software: no se afirma que se cumplan las Core Web Vitals sin datos reales.

### Privacidad y accesibilidad

- Nada se sube: imágenes, video, cámara y micrófono se procesan en el navegador; cámara y micrófono sólo al pulsar. CSP estricta y `Permissions-Policy` limitan todo al propio sitio; la única excepción son las descargas de los modelos de recorte desde Hugging Face (`connect-src`), que sólo ocurren cuando aceptas una y nunca llevan tus archivos.
- `prefers-reduced-motion`: el estudio arranca en pausa, sin apertura tejida, sin cortinas de glifos ni transiciones; la portada empieza en pausa y los componentes quedan quietos. La cabecera de la portada tiene «Pausar» para toda la página.
- Revisión con axe (sin incidencias graves ni críticas), foco visible y atrapado en los diálogos, teclado completo (atajos con `?`), objetivos táctiles de 44 px en teléfonos, hoja de ajustes con asa sobre el dado.

## Estudio de foto y video

> **En revisión.** La compilación pública (sin variables) no lo enlaza ni lo promociona: no hay tarjeta en la portada, ni interruptor «Laboratorio ⇄ Foto y video», ni «Llevar al estudio de foto»; no está en el sitemap ni en los datos estructurados. `/studio/foto/` responde con una página estática «en revisión» (`noindex`, sin scripts: no carga el estudio ni toca los proyectos guardados en el navegador) que lleva al laboratorio y a la portada; el laboratorio conserva imagen, video y cámara, y si recibe un proyecto (`.glyphos.zip` con `proyecto.glyphos.json`) o un ajuste (`.glyphos-ajuste.json`) del estudio dice que el estudio está en revisión y que el archivo está intacto. Con `VITE_FOTO_STUDIO=1` todo vuelve a ser como se describe abajo. Pendientes y hallazgos para su próxima fase: [`docs/ESTUDIO-FOTO-VIDEO-PENDIENTES.md`](docs/ESTUDIO-FOTO-VIDEO-PENDIENTES.md). Sus pruebas (`tests/e2e/foto-*.spec.ts`) se omiten en la compilación normal y corren con `VITE_FOTO_STUDIO=1 PW_PORT=<puerto libre> npx playwright test foto-`.

`/studio/foto/` es un editor no destructivo: tu foto o tu video quedan intactos y todo lo demás son capas que se pueden cambiar, ocultar o quitar.

- **Capas**: foto, ASCII (el motor del laboratorio dibuja los caracteres como luz: una imagen, no texto), **caracteres reales** (texto de verdad: se copia y se exporta como TXT, ANSI, HTML o SVG), texto y formas (marcos, líneas, miras, llamadas con etiqueta). Cada capa tiene opacidad, fusión, posición, acabados y máscara. Los estilos del laboratorio se usan en una capa ASCII («Usar estilo del laboratorio») y una capa vuelve al laboratorio («Abrir estilo en el laboratorio»); en el laboratorio, «Llevar al estudio de foto» convierte la pieza en un proyecto con su foto.
- **Zonas**: rectángulo, elipse, polígono, lazo, contorno preciso, color, objeto (puntos que se ajustan solos, con «no es esto»), degradado entre foto y caracteres, y pinceles para pasar a ASCII, borrar el efecto o restaurar el original. Cada zona suma, resta o interseca y tiene borde suave o duro; la máscara lista sus partes y se ve en tinte o en grises.
- **Quitar fondo** en el navegador: recorte automático del sujeto o de una persona, afinado del borde (suavizar, desplazar, descontaminar el color del fondo viejo, pasada de detalle), pinceles de conservar y quitar, selección por color y vistas sobre cuadros, claro, oscuro y contraste. El recorte se usa como capa, como máscara de otra capa (sujeto o fondo) o como PNG transparente. Sin descargar ningún modelo, las demás herramientas siguen funcionando.
- **Acabados** (22): tramado con 17 métodos, semitono, sombreado cruzado, pixelado, bordes, niveles, umbral, posterizar, invertir, monocromo, duotono, paletas limitadas, aberración cromática, brillo, sombra, viñeta, desenfoque de movimiento, desenfoque, nitidez, grano, ruido y líneas de barrido.
- **Animación**: 53 plantillas (escritura de terminal y al revés, la imagen formándose desde un carácter, resolución que sube o baja, fragmentos que se dispersan y vuelven, foto ⇄ ASCII, parpadeos, zonas que cambian de estilo…), coreografías de entrada, centro y salida, llaves con curvas y bucles, y una línea de tiempo con reproducir, al revés de verdad, región de bucle y arrastre. Una secuencia de fotos se vuelve animación; el paralaje mueve sujeto y fondo por separado; tus palabras pueden llenar la figura.
- **Explorar**: el dado cambia la capa elegida o toda la composición (con candados); cada resultado es una versión, con favoritas, variantes enlazadas, comparar dos y volver exacto a cualquiera. Antes y después con divisor.
- **Carteles**: 10 composiciones editoriales (cartel anotado, parches redondos, página de revista, tríptico, hoja de contactos, retícula suiza…) para A4, A3, Carta y Tabloide a 300 ppp (con sangrado de 3 mm si lo pides) o para redes (4:5, 9:16, 1:1, 16:9). Sus textos siguen siendo capas de texto editables.
- **Proyectos**: se guardan solos en este navegador (IndexedDB) con sus archivos originales; el archivo `.glyphos.zip` los lleva a otro equipo con capas, máscaras, recortes, animaciones y medios. Los ajustes de una foto se guardan (`.glyphos-ajuste.json`) y se aplican a otra.
- **Video**: un video entra como fuente y sus cuadros pasan por las mismas capas; al exportarlo a video, el sonido original va copiado o recodificado cuando el navegador puede hacerlo.
- **Teléfono**: modo inmersivo (la pieza y cuatro acciones al alcance del pulgar) y una hoja con herramientas, capas, ajustes, tiempo y explorar; un dedo dibuja, dos mueven y acercan.

**Vista previa = exportación**: la vista y el archivo salen de la misma llamada (`evaluate` + `Compositor.render`), a otra escala; las pruebas comparan el PNG a 1× con la vista al 100 % píxel a píxel.

| Formato | Qué obtienes | Límites |
| --- | --- | --- |
| PNG | la composición, con transparencia real; a la medida del proyecto, un múltiplo o un destino | el más pesado |
| JPEG / WebP | archivos ligeros | sólo si el navegador los codifica; JPEG sin transparencia (va sobre el fondo del proyecto) |
| Por separado | una capa sola, su máscara (grises o alfa), el original sin tocar, el recorte y su mate | — |
| TXT / ANSI / HTML / SVG con texto | los caracteres tal como se dibujan | sólo de capas de **caracteres reales**; el SVG con texto depende de la fuente de quien lo abre |
| SVG vectorial | caracteres, textos y formas como vectores con sus fuentes | sólo cuando la composición es de caracteres reales, textos y formas; si no, se ofrece «SVG con imagen», que no gana nitidez |
| Terminal y web | `.cast` de asciinema, reproductores Node y Python, HTML animado, código para tu web, saludo de la terminal, paquete README | los animados necesitan una capa de caracteres que cambie con el tiempo |
| MP4 / WebM | cuadro a cuadro con WebCodecs (mediabunny), con el sonido del video cuando se puede | el códec depende del navegador (MP4: H.264, AV1 o VP9; WebM: VP9, VP8 o AV1) y la hoja dice cuál usará; transparencia sólo si el navegador la escribe y se lee de vuelta; hasta 4K |
| GIF | la animación, con paleta común o por cuadro, con o sin tramado | 256 colores, transparencia de 1 bit, sin sonido, hasta 1080 px |
| Cuadros PNG (.zip) | un PNG por cuadro, idéntico a la vista | sin sonido; pesa mucho |
| Proyecto `.glyphos.zip` | todo para reabrirlo | — |

**Modelos de recorte**: «Sujeto» (BiRefNet_lite a 512 px, pesos MIT; 192 MB en WASM o 99 MB con WebGPU), «Sujeto (alta definición)» (1024 px, sólo con WebGPU, 115 MB), «Retrato» (MODNet, Apache-2.0, unos 7 MB en WASM o 13 MB con WebGPU) y «Seleccionar objeto» (EdgeTAM, Apache-2.0, 21 MB con WebGPU o 41 MB en WASM). Sólo modelos cuyo código **y** cuyos pesos tienen licencia permisiva (por eso no los RMBG de BRIA, de uso no comercial). Autores, enlaces y la nota sobre los datos de entrenamiento: [`/licencia/`](licencia/index.html#modelos-de-recorte); el registro, fijado por versión y huella: `src/cutout/models.ts`.

**Consentimiento y privacidad**: ningún modelo viene con el sitio. Antes de descargar uno, el estudio dice cuál es, cuánto pesa, de dónde viene y su licencia, y no descarga nada sin tu «sí». Se descarga una vez desde Hugging Face (o desde una copia del propio sitio si existe `/models/manifest.json`), se comprueba su SHA-256 y queda guardado en este navegador; se borra desde «Ajustes del estudio». **Tus fotos y videos no salen del equipo**: el recorte corre en un worker con ONNX Runtime Web (WebGPU o WASM), y para los hilos de WASM la página va aislada (COOP/COEP sólo en `/studio/foto/`). Tiempos medidos aquí (laboratorio: WASM con 2 hilos, CPU compartida, no datos de campo): «Retrato» 1–3 s por foto; «Sujeto» 9–19 s y unos 3 GB de memoria; «Seleccionar objeto» analiza la foto en 1–4 s y responde a cada punto en menos de medio segundo.

## Licencias

- **Código del editor y del sitio**: MIT (`LICENSE`, © 2026 Morphiq).
- **Código que exporta el estudio** (runtime, snippets, componentes, scripts de terminal): **MIT-0** (`LICENSES/MIT-0.txt`): úsalo, modifícalo y véndelo sin atribución, en proyectos personales o comerciales. Cada archivo exportado lo dice en su cabecera.
- **Lo que creas** (imágenes, video, texto, recetas) es tuyo. Eres responsable de los derechos de las imágenes o videos que cargas.
- **Marcas**: los nombres y logos de GLYPHOS y de Morphiq no se licencian (`TRADEMARKS.md`).
- **Terceros**: `THIRD_PARTY_NOTICES.md` (React, zustand, idb-keyval, mediabunny —MPL-2.0, sin modificar, sólo en el editor—, gifenc, opentype.js, ONNX Runtime Web y sus dependencias, y tipografías SIL OFL). Los modelos de recorte no vienen con el sitio: se descargan con permiso y tienen sus propias licencias (MIT y Apache-2.0). Resumen en `/licencia/`.

## Despliegue

Proyecto de Vercel **`ascii-shader-lab`** conectado a este repositorio: **cada push a `main` publica producción**; las demás ramas generan vistas previas. `vercel.json` fija cabeceras de seguridad, caché y la redirección de `ascii-shader-lab.vercel.app`. Producción se compila sin `VITE_FOTO_STUDIO` (estudio de foto y video en revisión); una vista previa con el estudio necesita esa variable en su compilación (ver `docs/ESTUDIO-FOTO-VIDEO-PENDIENTES.md`).

## Decisiones importantes

- **Motor básico traducido, no simplificado**: portar los 45 patrones y los efectos permite que un navegador sin WebGL vea la misma pieza (más lenta) en lugar de una aproximación; la paridad se mide, no se supone.
- **Honestidad antes que botones**: el historial dice su límite, los enlaces dicen lo que no llevan y la exportación sólo ofrece lo que se puede producir.
- **Medios locales por contenido (SHA-256)**: la misma foto no se guarda dos veces y los proyectos son reproducibles en otro equipo sin servidor.
- **Vistas con el lienzo real**: previsualizar cambiando el tamaño del elemento reproduce exactamente lo que harán el código exportado y los tamaños fijos.
- **Vite multipágina, React sólo en el estudio**; portada y guías son HTML estático indexable con islas perezosas.

## Pendiente / ideas siguientes

- Compilación de shaders asíncrona (`KHR_parallel_shader_compile`) y captura de miniaturas sin lectura síncrona de la GPU: son los mayores bloqueos que quedan al tirar el dado.
- Probar en Safari real, en teléfonos reales y en Edge; abrir los SVG en Figma e Illustrator; terminales de Windows y macOS (lo pendiente y por qué, en [`docs/compatibilidad.md`](docs/compatibilidad.md)).
- WebKit: el código pegado de la «pieza transformada» con WebGL 2 dibuja el texto grande algo más fino que el PNG del estudio (RMSE 0.061 frente a 0.03 del resto); con el motor básico coincide. Causa sin encontrar.
- Sincronía con el BPM de una canción; simulaciones con estado (reacción-difusión, vida) como capas; fuentes FIGlet para las letras de bloque.
- Propuestas para decidir aparte (no hechas): un dominio propio en lugar de `glyphos-ascii.vercel.app`; una galería pública de piezas compartidas (necesita servidor, moderación y consentimiento; las piezas locales no se publican ni se indexan); sincronizar la colección entre equipos; buscar y etiquetar en la colección; comparar dos piezas lado a lado.
