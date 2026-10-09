# «Crea tus GLYPHOS»: el estudio de glifos

Página: `/studio/glifos/` (entrada propia, fuera del peso del laboratorio). Estado de lo entregado y pruebas: [`docs/cambios/FAMILIAS-Y-GLIFOS.md`](../cambios/FAMILIAS-Y-GLIFOS.md).

## Qué es

Un taller tipográfico para hacer dos clases de juegos de glifos:

- **Alfabeto (modo texto):** letras para palabras, con su propio ancho, márgenes y kerning, como una fuente. En el laboratorio dibuja las letras que tiene; las demás salen con la tipografía de la pieza, y el estudio lo dice.
- **Símbolos ASCII (modo ascii):** símbolos de celda fija para las piezas del laboratorio, con una **rampa** de vacío a lleno. La rampa se propone midiendo la tinta de cada símbolo en su celda y la persona la corrige (orden manual o un valor de tinta escrito). En un alfabeto no hay rampa: el significado de las letras no se reordena por tinta.

## Cómo se empieza

- **Dibujando:** pluma Bézier (nodos y manejadores, añadir y quitar nodos, abrir y cerrar trazos), lápiz, rectángulo y elipse.
- **Importando:** un PNG (con transparencia, o un dibujo oscuro sobre blanco), un SVG seguro, o la fuente propia de la persona (OTF, TTF o WOFF).
- **Desde una sola letra:** se dibuja o importa una letra, se marca como referencia (queda bloqueada) y el asistente propone el resto.

## Flujo

referencia → analizar estilo → proponer → comparar y corregir → aceptar → usar.

1. **Referencias:** caracteres de los que el asistente aprende (mejor H, O, n u o). Una referencia con dibujo se **bloquea automáticamente**: nada la cambia sin una acción explícita.
2. **Modelo de estilo editable:** grosor de asta, contraste, ángulo de la pluma, inclinación, anchura, redondez, altura x, altura de mayúsculas, remates y esquinas. **Cada propiedad dice de dónde sale** («medido en H», «ajustado por ti» o «predeterminado (no estimado)»); nunca se presenta como medido algo que no se midió.
3. **Proponer:** el asistente dibuja los caracteres pendientes a partir de **esqueletos propios** (trazos centrales diseñados para este proyecto, sin datos de fuentes de terceros) con el estilo, en tres variantes de diseño. Sólo cambia caracteres vacíos y propuestas no corregidas.
4. **Comparar y corregir:** variantes lado a lado; lo que la persona corrige queda marcado y ya no se regenera.
5. **Aceptar:** por letra, por la selección del tablero, por grupo o todas las propuestas. Sólo lo aceptado, dibujado o bloqueado va al laboratorio y a las exportaciones.

Estados del tablero: **vacío**, **dibujado**, **propuesto**, **aceptado**, **bloqueado**.

## Asistente local y capa neuronal

El asistente es **geométrico y local**: mide las referencias rasterizándolas (rachas horizontales y verticales en astas y barras, inclinación de las astas, proporciones, redondez de los ojos) y dibuja con esqueletos y una pluma de contraste variable. No envía nada fuera del navegador.

**No hay capa neuronal**, ni botón de «IA». Para tener una real haría falta, como mínimo:

- un servidor con GPU (VecGlypher 27B: ≈55 GB de pesos en BF16, vLLM sobre CUDA, una GPU de la clase de 80 GB o varias);
- aceptar los términos de Gemma, de los que derivan sus pesos;
- una acción explícita de envío de la referencia que diga a dónde va y para qué, y claves guardadas sólo en el servidor;
- aceptar sus límites: entrenado con 0–9, a–z y A–Z; los diacríticos son una limitación declarada.

Una función de Vercel no es una GPU y el modelo no puede descargarse como dependencia del arranque. GLYPHOS no contrata ni activa esa infraestructura; queda como requisito externo documentado. La investigación de modelos está en [`INVESTIGACION-FAMILIAS-2026-10-09.md`](INVESTIGACION-FAMILIAS-2026-10-09.md#4-capa-neuronal-para-glifos).

## Modelo de datos

- **Documento editable** (`src/glifos/doc.ts`, formato 1): id, revisión, nombre, modo, métricas (unidades por eme, ascendente, descendente, altura x, mayúsculas, celda, márgenes por defecto), glifos por **código de punto** (nunca mitades UTF-16), contornos con nodos y manejadores absolutos, componentes con anclas (los acentos se construyen con base + marca y conservan una posición movida a mano), capa de imagen no destructiva, kerning, rampa, estilo, referencias, guías, autoría y licencia, y las revisiones usadas en el laboratorio.
- **Juego compilado** (`src/glyphset/set.ts`, formato 1): lo que dibujan los motores. Contornos en unidades de fuente (M, L, Q, C, Z absolutos), glifos de píxeles, métricas, rampa y kerning. Se nombra por el **hash de sus bytes**: la misma forma es el mismo juego en cualquier sitio, y una pieza nombra exactamente el dibujo con que se hizo.

La separación importa: el documento puede cambiar sin que cambien las piezas que ya usan una revisión; «Usar en el laboratorio» guarda una revisión nueva y el laboratorio la ofrece.

## Persistencia y protección

- IndexedDB propia (`glyphos-glifos`): documentos, resúmenes, imágenes y juegos compilados.
- **Autoguardado** un momento después de cada cambio y al ocultar o dejar la página; si quedan cambios sin guardar, el navegador pregunta antes de salir.
- **Otra pestaña** que guarda el mismo proyecto hace que ésta deje de escribir (nunca dos pestañas pisándose).
- **Lectura fallida:** un documento que no se puede leer se conserva aparte, se lista como dañado y se puede descargar tal cual; ningún guardado lo sobrescribe.
- **Versión futura:** se abre sólo para mirar y no se sobrescribe.
- **Límites:** 1 200 caracteres, 300 contornos y 6 000 nodos por glifo, 64 imágenes, juegos de hasta 6 MB.
- **Fusión sin duplicados:** importar el mismo proyecto dos veces no lo duplica; uno más viejo entra como copia; uno más nuevo pregunta.
- **Recursos referenciados:** borrar un proyecto nunca borra un juego que use una pieza del laboratorio (el laboratorio le dice al estudio cuáles usa).

## Importación segura de SVG

Analizador XML propio (no se inserta nada en el DOM). Rechaza `<!DOCTYPE>` y `<!ENTITY>`. Sólo lee `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline` y `polygon`, con una lista cerrada de atributos geométricos y transformaciones; ignora scripts, enlaces, imágenes, estilos y manejadores de eventos. Límites: 1 MB, 5 000 elementos, 32 niveles de anidamiento y 20 000 nodos.

## Exportaciones

- **Proyecto** (`.glyphos-glifos`, un ZIP): documento, imágenes, juego usado en el laboratorio y un LÉEME. Se comprueba al abrirlo (hash de cada juego y de cada imagen, tipos de imagen, límites).
- **Fuente OpenType (.otf, CFF):** `.notdef` y espacio incluidos; `cmap` formato 4 y 12 (caracteres fuera del plano básico); kerning en una tabla `kern` heredada, porque opentype.js 1.3.4 no escribe ni `kern` ni `GPOS`. Antes de ofrecerla se **vuelve a leer** y se **prueba en el navegador** (FontFace). Nunca se renombra a TTF. No lleva glifos de píxeles, hinting, GSUB ni GPOS.
- **SVG** por carácter y hoja completa.
- **Atlas PNG + manifiesto** con el orden (rampa o código), las métricas y la regla de colocación, idéntica a la de los motores.

## En el laboratorio y fuera de él

- La receta nombra el juego (`glyph.set`, formato 3). Lo dibujan el motor WebGL 2, el motor básico, las miniaturas, la vista, el visor, las sesiones y los proyectos, el SVG de contornos y el código exportado (que lleva el juego dentro y lo registra con `Glyphos.registerGlyphSet`).
- **Texto, ANSI y HTML de texto** llevan caracteres, no dibujos: se ven con la tipografía de quien los abre. El panel de exportación lo explica.
- **Los enlaces no llevan juegos de glifos.** Una pieza abierta desde un enlace en un navegador sin ese juego se dibuja con la tipografía de la receta **y lo avisa** (en el laboratorio y en el visor); para llevar el juego hay que pasar el proyecto, la sesión o el paquete. Nunca hay sustitución callada.
