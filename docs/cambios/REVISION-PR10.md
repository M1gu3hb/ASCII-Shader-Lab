# Revisión del PR #10: correcciones, familias que siguen vivas, efectos nuevos y catálogo por uso

Fecha: 12 de octubre de 2026. Rama: `claude/new-session-7hc315` (PR #10). Punto de partida: `dd4d01e` (el estado que auditó la revisión).

Este registro dice qué había, qué se cambió, con qué pruebas y con qué resultado, y aparte lo que **no** quedó resuelto. El detalle por grupo de familias lo escribió quien hizo cada grupo, con sus mediciones de antes y después, en [`docs/cambios/revision-familias/`](revision-familias/). La matriz completa de familias y presets se genera desde las fichas: [`revision-pr10/MATRIZ-PRESETS.md`](revision-pr10/MATRIZ-PRESETS.md). El inventario de los ocho repositorios de referencia, con licencias y la decisión de cada efecto, está en [`revision-pr10/INVENTARIO-REPOS.md`](revision-pr10/INVENTARIO-REPOS.md).

## 1. Estado inicial (`dd4d01e`)

- **23 familias y 86 presets**, todos en Arte, en cuatro secciones por mecanismo («Vida y química», «Física y movimiento», «Forma y geometría», «Ciencia en 3D»). Ninguna en Fondos, Terminal, Texto ni Imagen.
- **Nombres técnicos** en muchos presets («Superposición 1s+2p», «Curva de Heighway»…) y ningún nombre alternativo para la búsqueda.
- **Construcciones que terminan**: la sonda temporal de partida (Node, resolución mínima, `.cache` de la sesión) encontró presets que se quedaban quietos o vacíos: Lenia «Orbium» con ~1 % de tinta, DLA entre 1 y 11 %, Sistemas L entre 0 y 11 %, Líneas de campo quietas desde los 15 s, Crecimiento diferencial «Medusa» congelado a los 15 s, WFC con pausas largas, erosión que apenas cambiaba.
- **La resolución cambiaba el régimen** (A-05): Lenia «Colonia» negra a 64 filas; Reacción–difusión «Coral» estable a 64 y no a 96.
- **Azar v6** leía los presets vivos de las familias: cambiar un preset cambiaba tiradas publicadas.
- **Primera vista del estudio**: 1 092 200 bytes de JS con ahorro de datos (límite 1 100 000): 8 KB de margen, que las familias nuevas iban a agotar.
- Los hallazgos A-01…A-12 de la auditoría, abajo.

## 2. Hallazgos A-01…A-12

| | Hallazgo | Causa | Corrección | Prueba (antes falla, ahora pasa) | Estado |
|---|---|---|---|---|---|
| A-01 | «Proyectos» del estudio de glifos cerraba el documento aunque el guardado hubiera fallado: se perdía la edición. | El botón cerraba sin mirar el resultado del guardado; los conflictos de sólo lectura no contaban como cambios sin guardar. | `saveNow()` devuelve el resultado; sólo se cierra con el guardado confirmado. Si falla, un aviso ofrece «Descargar una copia», «Seguir editando» o «Volver sin guardar» (`src/glifos/autosave.ts`, `ui/App.tsx`, `ui/projectCopy.ts`). | `tests/unit/glifos-autosave.test.ts` (sin espacio, almacén inaccesible, otra pestaña guardó antes, guardado confirmado, Ctrl+S); `tests/e2e/glifos.spec.ts` (con el estudio activado). | Resuelto |
| A-02 | Dos capas con la misma familia y la misma semilla compartían una sola simulación. | El anfitrión indexaba las ejecuciones por su clave en un `Map`, que no admite dos iguales. | Cada ejecución recuerda su capa de origen y sus ajustes; el emparejamiento prueba capa y ajustes antes que la clave sola (`src/families/host.ts`). | `tests/unit/family-host.test.ts`, «dos capas con la misma familia y semilla» (6 casos: estado propio, trazo propio, apagar y encender, reordenar, ajuste en vivo, exportación). | Resuelto |
| A-03 | Un fragmento de familia que no llegaba dejaba la capa «cargando» para siempre. | El fallo no se registraba, no había tiempo límite, y Chromium guarda en caché el import fallido: reintentar con la misma URL no pedía nada. | Error registrado, tiempo límite de 20 s, `retryFamily` y reintento con otra URL (`?reintento=N`, `src/shared/chunks.ts`); el panel dice qué falló y ofrece «Reintentar». | `family-host.test.ts` (rechazo, tiempo límite, reintento, las demás capas siguen); `tests/e2e/familias.spec.ts` (un 404 real y «Reintentar» sin recargar). | Resuelto |
| A-04 | Construcciones finitas ofrecidas como fondos; reversa como recurso universal. | Sin contrato temporal: nada distinguía un fondo continuo de una construcción que termina. | Contrato por preset: **continuo** (∞), **bucle exacto** (↻, con su periodo) o **construcción** (▣), según una regla de la familia que puede depender de varios ajustes. El panel y la biblioteca lo muestran; Fondos sólo ofrece continuos o bucles. Cada grupo creó versiones de verdad continuas (renovación de frentes, agentes, cristales, curvas, plantas, tableros; ver §3), sin reversa. | `families.test.ts` (todo preset tiene contrato y un bucle su periodo); `recipes-browser.test.ts` (Fondos sólo continuos o bucles); una prueba corta por preset continuo en cada `family-*.test.ts`; sonda de 10 minutos (§3). | Resuelto, con las excepciones de §9 |
| A-05 | La resolución cambia el régimen. | Física expresada en celdas, no en el dominio. | Reacción–difusión v2 y osciladores v2 en rejilla fija; Lenia v2 con radio que crece con la rejilla (mínimo 128 filas); DLA con caminantes que escalan; las recetas v1 conservan su camino exacto (`ModelConfig.v`). El panel dice qué hacen las filas en cada familia (`budget.resNote`). | Pruebas de cada familia en mínima, por defecto y máxima; sonda por grupo con `--res=min,def,max`. | Resuelto donde se midió; DLA de construcción a 160 filas sigue lento (§9) |
| A-06 | Los 86 presets sólo estaban en Arte, agrupados por mecanismo. | El catálogo listaba las familias aparte. | Catálogo por uso y apariencia (`src/studio/recipes/catalog.ts`, `src/families/uses.ts`): cada preset se ofrece donde dicen sus usos, con el mismo id en cada espacio. Fondos gana «Color que fluye», «Vivas» y «Materia y vidrio»; Arte junta Saturno y el agujero negro en «Figuras 3D y espacio». Sin cajón de «Ciencia». Cuatro recetas nuevas de vidrio delante (Fondos e Imagen). | `recipes-browser.test.ts` (cada preset una vez en cada espacio de sus usos, secciones existentes, sin «Ciencia», Saturno y el agujero negro juntos); `recetas-todas.spec.ts`. | Resuelto |
| A-07 | Faltaban pruebas de comportamiento en el tiempo, exportaciones y recursos. | — | Tiempo: contrato y prueba corta por preset continuo, sonda de 10 minutos. Exportaciones: `export-complete.test.ts`, `runtime-families.test.ts` (scripts por familia < 40 KB y tamaño de celda correcto en el HTML exportado). Recursos: `family-host.test.ts` (pasar 16 veces de cuatro capas a una no acumula ejecuciones), `glyphset-temp.test.ts`, `tests/e2e/recursos.spec.ts` (memoria con una y cuatro capas, dos motores). | Las citadas. | Resuelto |
| A-08 | El estudio de glifos debía quedar en pausa, fuera de lo público y con un camino de vuelta. | — | `VITE_GLIFOS_STUDIO=1` lo activa al compilar; sin la variable, `/studio/glifos/` muestra una página de pausa sin índice ni sitemap, el selector de juegos se oculta salvo que el navegador ya tenga juegos, y los juegos guardados siguen funcionando en el laboratorio. Ver §7. | `seo.test.ts`, `tests/e2e/seo.spec.ts`, `tests/e2e/glifos.spec.ts` («con el estudio en pausa, un juego que este navegador ya tiene se sigue usando»). | Resuelto |
| A-09 | Nombres técnicos. | — | Nombres visuales en todos los presets; el nombre científico y el anterior van en `aka` (preset y familia), que la búsqueda encuentra sin mostrarlos como nombre; el mecanismo, en «Cómo funciona». | `recipes-browser.test.ts` (la búsqueda encuentra cada `aka`). | Resuelto |
| A-10 | El presupuesto del cuadro no contaba el dibujo del raster ni la presentación. | Sólo medía los pasos del modelo. | El anfitrión mide lo que cuesta dibujar cada raster y lo reserva antes de dar pasos (`host.ts`); los grupos bajaron costes donde pesaban (agua: dibujo a la mitad o menos; reacción–difusión a 256 filas: 1082 → 160 ms por segundo simulado; espiras de las líneas de campo: ~440 → ≤122 ms). | `family-host.test.ts`, «el presupuesto del cuadro cubre también el dibujo del raster» (reloj simulado). | Resuelto |
| A-11 | Una exportación podía salir de un estado a medias. | El motor fijo daba un cuadro aunque la simulación no hubiera alcanzado su momento. | `renderComplete()` repite el cuadro hasta que ninguna familia queda a medias, con progreso, cancelación y un límite que dice qué familia no llegó (`src/studio/exporting.ts`); lo usan imagen, video, GIF, rejilla y fotogramas. | `export-complete.test.ts`; `family-host.test.ts` (repetir el cuadro llega exactamente al estado de una reconstrucción completa). | Resuelto |
| A-12 | La vista previa del estudio de glifos registraba juegos temporales y nunca los retiraba. | Cada edición creaba un juego nuevo en el registro y en las cachés del atlas. | `TempGlyphSets` (usar, asentar, liberar) y `retireGlyphSet`, que vacía las cachés de tinta y densidad del atlas (`src/glyphset/registry.ts`). | `glyphset-temp.test.ts`. | Resuelto |

### Otros fallos encontrados y corregidos durante la revisión

- **Familias analíticas vacías en el código exportado con WebGL 2** (existía antes de la revisión): el motor sólo pedía
  su GLSL al cambiar de receta y la página exportada monta su pieza al crear el motor. Ahora los dos motores piden las
  fichas, el código y el GLSL de la pieza inicial (`fcea515`); comprobado con las 39 familias y cubierto por
  `familias.spec.ts`.
- **Azar v6 leía los presets vivos**: cambiar un preset cambiaba tiradas publicadas. Quedó congelado
  (`families6-data.ts`) antes de tocar ningún preset.
- **Tamaño de celda en el motor básico del código exportado**: los gemelos de CPU que trabajan por celda leían una
  copia propia del tamaño y dibujaban con otra celda; ahora lo reciben del motor.
- **Introducidos y corregidos aquí mismo**: con el azar cargado a demanda, «Azar» y enseguida «Guardar» guardaba la pieza
  anterior (ahora las acciones esperan su turno); con las fichas cargadas a demanda, el motor básico del código exportado
  no las pedía (resuelto con lo anterior).

## 3. Familias y presets

- **Antes**: 23 familias, 86 presets. **Ahora**: 39 familias (16 nuevas), 203 presets (86 de antes con su id intacto y 117 nuevos): 146 continuos, 20 bucles exactos y 37 construcciones (que lo dicen).
- **Compatibilidad**: los 86 presets publicados dibujan exactamente lo mismo con sus parámetros originales (`tests/unit/families-compat.test.ts` con `fixtures/families-v1.json`, hash del raster). Donde un algoritmo tenía que cambiar con los mismos parámetros, la familia sube de versión y la v1 conserva su camino (reacción–difusión, Lenia, osciladores, agua, atractor). Ningún id de familia, preset o parámetro cambió y no se borró ningún preset.
- **Cómo se decidió cada cambio**: en los informes de grupo ([vida](revision-familias/vida.md), [crecimiento](revision-familias/crecimiento.md), [física](revision-familias/fisica.md), [figuras y espacio](revision-familias/figuras.md), [nuevas A](revision-familias/nuevas-a.md), [nuevas B](revision-familias/nuevas-b.md), [nuevas C](revision-familias/nuevas-c.md)), cada uno con su matriz por preset: apariencia y mecanismo, contrato, actividad a 0/30/60/120/600 s con varias semillas y resoluciones, ocupación, legibilidad, paleta y escala, usos, coste y el cambio hecho o la razón para conservarlo.
- **Matriz conjunta** después de unir todo: [`MATRIZ-PRESETS.md`](revision-pr10/MATRIZ-PRESETS.md), generada desde las fichas y una ejecución de la sonda sobre la rama final (una semilla por preset a la resolución por defecto, 0/30/60/120 s y 10 minutos).
- **Cambios compartidos que pidieron los grupos y se hicieron**: contrato temporal y figura que dependen de varios ajustes (`TimeRule` y `FamilyMeta.figure` como función; la figura también según la escala de la capa); tamaño de celda de los gemelos de CPU por `prep` (en el HTML exportado el motor básico dibujaba con otra celda); catálogo que lee `uses` y `aka`; sonda que aplica la escala de la capa a las analíticas y mide el dibujo; nota de resolución por familia; tiempo generoso para la compatibilidad cuando la máquina está cargada.
- **Carga diferida por efecto**: el código de cada familia (modelo, gemelo de CPU, GLSL, textos) es su propio fragmento, como antes. Ahora también sus fichas: la primera vista lleva sólo un índice generado (`src/families/index-data.ts`) y las fichas (`src/families/all.ts`) llegan cuando una pieza dibuja una familia, se abre el catálogo o el panel de una familia, con el azar, o en tiempo libre si el navegador no pide ahorrar datos.

## 4. V-01…V-10 y candidatos nuevos

Todo se dibuja con glifos. Las familias de color (V-01, V-02, V-03, V-04, V-07 y C-08) dan a cada celda su color propio («Colores de: la familia») y su luminancia elige el glifo; con «Por brillo» se tiñen con la paleta como cualquier patrón. Los dos motores dibujan lo mismo (raster r = 1; analíticas r ≥ 0,997 en brillo y en color, según la comparación de cada grupo).

| | Efecto | Cómo quedó | Presets | Destinos |
|---|---|---|---|---|
| V-01 | Corrientes de color | familia analítica de color `corrientes` | Corrientes de neón, Atardecer líquido, Tinta marmolada, Velo boreal, Remolino cromático | fondos/color, arte/organicas, arte/optica |
| V-02 | Membrana iridiscente | familia analítica de color `membrana` (película delgada con funciones CIE) | Lámina de jabón, Pompa flotante, Aceite en el asfalto, Pliegues de seda, Nácar en tus colores | fondos/color, fondos/materia, arte/figuras |
| V-03 | Cromado en tramas | familia analítica de color `cromado` | Gota de cromo, Lámina de cromo, Mercurio vivo, Anillo de oro, Rombo prismático | fondos/materia, arte/figuras, arte/geometricas, arte/optica, arte/organicas |
| V-04 | Paneles prismáticos | familia analítica de color `paneles` (bucle exacto de 60 s) | Vidrieras que giran, Abanico de cristal, Noria de color, Puerta giratoria | fondos/color, fondos/materia, arte/figuras, arte/geometricas |
| V-05 | Mosaico cinético | familia analítica `mosaico` (teselas de celdas exactas que voltean) | Ola de teselas, Anillos que voltean, Cartel de estadio, Mosaico dorado, Barrido de radar | fondos/geometricas, arte/geometricas |
| V-06 | Lluvia sobre vidrio | **vidrio delante** de cualquier fuente (`recipe.optics`, `lluvia`): las gotas refractan patrones, foto o texto; controles en Efectos → «Vidrio delante» | Recetas «Lluvia en la ventana» (Fondos) y «Tras la lluvia» (Imagen); el azar v7 lo pone a veces | fondos/materia, media/efectos |
| V-07 | Superficie que se abre | familia analítica de color `desgarro` | Grietas de luz, Papel rasgado, Película que arde, Trama descubierta, Velo de color | fondos/color, fondos/materia, arte/optica, arte/organicas |
| V-08 | Descargas eléctricas | familia analítica `descargas` | Anillo de arcos, Esfera de plasma, Tormenta seca, Chispa entre dos | fondos/vivas, arte/figuras, arte/optica, arte/organicas, terminal/figuras |
| V-09 | Ecos y realimentación | familia con memoria `ecos` (bucle de fotograma con zoom, remolino, espejos y tinta) | Tinta recursiva, Espejos, Túnel de ecos, Huracán, Marea de ecos | fondos/organicas, fondos/materia, fondos/espacio, arte/optica |
| V-10 | Vidrio acanalado | **vidrio delante** (`acanalado`, cinco perfiles) | Recetas «Tras el vidrio acanalado» (Fondos) y «Vidrio acanalado» (Imagen); el azar v7 lo pone a veces | fondos/materia, media/efectos |

Candidatos nuevos del inventario (efectos que no había ni en GLYPHOS ni en V-01…V-10):

| | Candidato | Familia | Presets | Destinos |
|---|---|---|---|---|
| C-01 | Lacería | `laceria` (por encima y por debajo según la topología) | Azulejo de ocho, Rosetón, Tracería, Estrella de diez | fondos/geometricas, arte/geometricas |
| C-02 | Humo rizado | `humo` (partículas por rotacional de ruido) | Espíritu, Fumarola, Nebulosa rizada, Hilos de seda | fondos/espacio, arte/figuras, arte/organicas |
| C-03 | Mar nocturno | `mar` | Luna sobre el lago, Mar de fondo, Plancton, Marea de plata | fondos/ondas, fondos/organicas |
| C-04 | Hipercubo | `hipercubo` (4D → 3D → 2D, bucles exactos) | Teseracto, Del revés, Veinticuatro celdas, Dieciséis celdas | arte/figuras, terminal/figuras |
| C-05 | Cámara de niebla | `niebla` (trazas de Lorentz) | Cámara de burbujas, Rayos cósmicos, Lluvia de pares, Fuente alfa | fondos/espacio, arte/curvas, terminal/consola |
| C-06 | Osciloscopio que se degrada | `osciloscopio` | Señal limpia, Interferencia, Grito, Fósforo lento | arte/curvas, terminal/consola |
| C-07 | Grabado láser | **aplazado**: necesita recorrer el texto como un camino ordenado, que el motor no tiene | — | — |
| C-08 | Marco vivo | `marco` (borde luminoso, color propio) | Marco de terminal, Neón doble, Latido, Humo de colores | arte/geometricas, terminal/consola |
| C-09 | Orden y caos | `orden_caos` (red que se funde y recristaliza) | Fusión, Cristalización radial, Onda de calor | fondos/geometricas, arte/geometricas |

## 5. Catálogo y azar

- **Biblioteca** (`src/studio/recipes/catalog.ts`): Fondos (ondas, orgánicas, color que fluye, vivas, materia y vidrio, geométricas, espacio, escenas), Arte (figuras 3D y espacio, orgánicas, curvas y fractales, geométricas, óptica, escenas), Imagen (clásicas, con efectos, escenas), Texto (letras animadas, letras con textura, mensajes, escenas), Terminal (figuras, clásicos de consola, curvas, escenas). Un preset de familia aparece en cada espacio que dicen sus usos con el mismo id (`familia:preset`); en Terminal se dibuja en ASCII a la proporción de la terminal; en Texto, como textura dentro de las palabras de la persona; en Imagen, sobre su foto (ningún preset declara Imagen todavía: ver §9).
- **Azar versión 7** (`src/random/families7.ts`): elige primero una sección de la biblioteca del espacio que tenga presets de familia y después uno de ellos; las familias de color conservan su color; a veces pone vidrio delante (Fondos, Arte, Imagen; nunca en Texto ni Terminal). Sus familias y presets quedan congelados en `families7-data.ts` (39 familias, 203 presets, generado una vez por `scripts/azar7-data.ts`) y `fixtures/generator-v7.json` fija 150 tiradas exactas. **Las versiones 1 a 6 no cambian**: la v6 quedó congelada sobre sus presets publicados (`families6-data.ts`) y sus 130 tiradas de referencia siguen idénticas; un enlace con `gen=6` teje lo mismo que antes.
- **El azar ya no viaja en la primera vista**: el generador se descarga con el primer «Azar», «Variar» o semilla, o en tiempo libre.

## 6. Licencias y fuentes

- **No se copió código** de ninguno de los ocho repositorios ni de las fuentes excluidas (Hydra, AS-StageFX, InfiniteTubes, OGL, Lamina, Shadertoy, CodePen). Los mecanismos se escribieron desde cero a partir de descripciones y artículos; cada familia cita sus fuentes y su licencia en su ficha (`doc.sources`) como «referencia de la idea».
- No se adaptó código de Paper Shaders, así que no hace falta su `NOTICE`. `THIRD_PARTY_NOTICES.md` no cambia: no hay dependencias nuevas.
- Problemas de licencia encontrados en las referencias (detalle en el inventario, §8): el «Rain on Glass» de Radiant deriva de codrops/RainEffect, que no es MIT (por eso V-06 se escribió desde cero); Paper Shaders fue PolyForm Shield entre la 0.0.47 y la 0.0.76; ShaderGradient no tiene archivo de licencia; los presets de Butterchurn son de autores de la comunidad y sus texturas no tienen procedencia; no se reutilizan nombres de celebridades o álbumes que usa Radiant.
- Revisiones exactas de cada repositorio y licencias en [`revision-pr10/licencias-repos.json`](revision-pr10/licencias-repos.json).

## 7. Estudio de glifos en pausa (A-08)

- **Sin `VITE_GLIFOS_STUDIO`** (el build público): `/studio/glifos/` es una página de pausa, sin índice para buscadores ni entrada en el sitemap; el laboratorio no enlaza al estudio; el selector de juegos de glifos se oculta salvo que el navegador ya tenga juegos. Los juegos guardados siguen en el navegador y el laboratorio los dibuja.
- **Para volver a abrirlo**: compilar con `VITE_GLIFOS_STUDIO=1` (variable de entorno del build o `.env`); la página, el sitemap y el selector vuelven solos. Las pruebas del estudio (`tests/e2e/glifos.spec.ts`) corren con esa variable.

## 8. Pruebas y resultados

Entorno: Linux, Node 22, Chromium 141 de Playwright con WebGL 2 por software (SwiftShader). Con varias tareas a la vez
en una máquina de 4 núcleos: las cifras de coste son cotas altas.

- **Unitarias** (`npx vitest run tests/unit`): 153 archivos y 2646 pruebas, todas pasan (al empezar la revisión: 126 y
  2251). Incluyen la batería genérica de las 39 familias (contrato, usos, periodo de los bucles, estado exacto,
  determinismo), la compatibilidad de los 86 presets publicados, una prueba de mecanismo por familia y una prueba corta
  por preset continuo, las versiones 1 a 7 del azar con sus tiradas de referencia, el catálogo por uso, el índice de
  familias, los recursos del anfitrión, el código exportado, el orden de las acciones mientras el azar llega y los
  hallazgos A-01…A-12.
- **Tipos**: `tsc --noEmit` sin errores.
- **Sonda temporal sobre la rama final** (`scripts/families-time.ts`, una semilla por preset a la resolución por
  defecto, 0/30/60/120 s y 10 minutos; los grupos la corrieron además con tres semillas y en las resoluciones mínima y
  máxima): los 166 presets continuos o en bucle siguen cambiando en todos los momentos medidos desde los 30 s y ninguno
  queda vacío (tinta ≥ 2 %). Pasan del 97 % de tinta los campos de color que llenan el cuadro a propósito (Corrientes de
  color, «Nácar en tus colores», «Lámina de cromo», «Mosaico dorado») y «Dentro de la nube» (§9). Resultados por preset en
  [MATRIZ-PRESETS.md](revision-pr10/MATRIZ-PRESETS.md).
- **Coste** (Node, la misma ejecución, con otras tres tareas en la máquina): pasan de 250 ms por segundo simulado en su
  pico cinco presets nuevos de reacción–difusión (257–444), tres de fluido (263–307) y «Espiras que laten» (279). En vivo,
  el presupuesto por cuadro (A-10) los hace ir más despacio en lugar de bloquear la página; en una máquina libre los
  grupos midieron menos (reacción–difusión a 256 filas, 160 ms). No se repitió con la máquina libre.
- **Código exportado**: el HTML de un preset de cada una de las 39 familias, abierto en Chromium con WebGL 2 y en
  Chromium sin WebGL (motor básico): las 78 páginas dibujan y no dan errores.
- **Primera vista del estudio** con ahorro de datos (límite sin tocar): 1 009 964 bytes de JS y 170 396 de CSS
  (al empezar: 1 092 200 de JS).
- **Pruebas de navegador** sobre el build de producción: ver §8.1.

### 8.1 Pruebas de navegador

Todas sobre el build de producción (`vite preview`), proyecto `desktop` de Playwright, un solo trabajador.

- **Subconjunto de la CI más las rutas tocadas** (`azar`, `perf`, `export`, `recetas`, `compartir`, `glifos`, además de
  los de la CI): 130 pasan, 4 omitidas y 1 fallo.
  - Las omitidas son pruebas del estudio de foto y del de glifos, en pausa.
  - El fallo esperaba el texto anterior de la descripción de «Figuras 3D y espacio». La prueba lee ahora la descripción
    del catálogo, y `recetas` con `recetas-mobile` dan 16 de 16.
- **Pruebas largas** (`familias`, `recetas-todas`, `recursos`): 21 de 21 pasan en 42,5 minutos.
  - **Familias:** las 39 abren desde Recetas, dibujan y muestran su panel, en WebGL 2 (6,2 min) y en el motor básico
    (1,4 min).
  - **Simulación y guardado:** se reinicia y avanza, su PNG sale de una copia, y guardada con ★ vuelve tras recargar.
  - **A-03:** un fragmento con 404 deja la capa en error y «Reintentar» la recupera.
  - **Código exportado:** el de corrientes, el plano hiperbólico y reacción–difusión dibuja en los dos motores.
  - **Recetas:** las 130 recetas y escenas de los cinco espacios abren en su espacio y dibujan, en los dos motores (los
    presets de familia los cubre `familias`, uno por familia).
  - **Memoria:** la de la página se estabiliza con 1 y con 4 capas de simulación, en los dos motores.
    - Es el montón de JS que da Chromium tras recoger la basura, a los 30 s, 2 min y 3,5 min. La memoria de la GPU no
      se mide.
    - Cifras de una segunda ejecución, también verde: una capa 6,9 → 7,3 → 7,4 MB en WebGL y 7,3 → 7,6 → 7,6 en el
      básico; cuatro capas 8,9 → 9,1 → 9,0 MB en WebGL y 10,1 → 9,4 → 9,4 en el básico.
- **Fallo de la propia prueba, corregido.** La primera ejecución larga agotó su tiempo (39 min) en la familia 17, «mar».
  - Es la primera familia sin preset en Arte, así que la prueba pasaba a Fondos y pulsaba la pestaña «Capas», que allí
    se llama «Forma». La espera no tenía límite propio.
  - La prueba usa ahora el nombre de cada espacio y falla en 15 s si la pestaña no aparece. No era un fallo del estudio:
    medidas paso a paso, las 16 primeras tardaron entre 11 y 19 s cada una en abrir y dibujar.
- **Preview de Vercel de `48c6925`** (no es producción): 7 pasan, con el mismo build que el local (mismo hash del
  fragmento del estudio).
  - El presupuesto de la primera vista, tres pruebas del azar y las tres del código exportado.
  - `0f426b0` sólo cambia una prueba.
- **CI** (`check.yml`: auditoría de dependencias, tipos, unitarias, build y nueve pruebas de navegador): sin fallos en
  `48c6925`, `0f426b0` y `9a8f34c`. El presupuesto de la primera vista no está en la CI: lo comprueba `perf`, corrida aquí y
  contra el preview.

## 9. Lo que no quedó resuelto

> **Cierre posterior.** Todo lo de esta lista se retomó en [CIERRE-PR10.md](CIERRE-PR10.md): allí está la matriz con el
> estado final de cada punto (implementado y verificado, equivalente, excluido con su causa o bloqueado por falta de
> hardware), con sus pruebas y commits. Esta sección se conserva como estaba.

- **Navegadores**: sólo Chromium 141 de Playwright con WebGL 2 por software (SwiftShader). No hay GPU real, ni teléfono real, ni Firefox, ni Safari en esta máquina: no se probó en ellos.
- **C-07 «Grabado láser»** aplazado (necesita un recorrido ordenado del texto).
- **Familias raster con color propio**: `ecos` y `humo` usan luminancia y la paleta de la pieza; dar color por celda a un raster pide un raster RGB en los dos motores.
- **Leer la fuente de la pieza desde una familia** (que el cromado llene de metal la foto o el texto, que el desgarro revele otra capa): no se hizo; usan formas propias. Por eso ningún preset declara Imagen.
- **Ocho de ocho parámetros en las analíticas** y el shader no recibe la versión de la familia: corregir el grano del disco del agujero negro a los 10 minutos pide un tercer bloque de parámetros.
- **Coste en máquina libre**: los picos de §8 se midieron con la máquina ocupada y no se repitieron en limpio.
- **Mejoras de patrones clásicos y recetas compuestas** del inventario («Mejora de…», «Preset nuevo de…», 43 filas): propuestas, no hechas en esta revisión.
- **Por familia** (evidencia en cada informe de grupo): DLA de construcción a 160 filas crece despacio; «Continentes» depende de la semilla y queda como construcción; «Nadadores» y «Anillos que nadan» ocupan poco (van como figuras); «Montaña viva» y «Coral que respira» son fondos lentos; nubes que en algunos momentos pasan de ~0,97 de tinta; «Mandala de arena» con un disco gris central en algunos modos; las trazas de la cámara de niebla se leen mejor con celdas de 16 px; picos de coste de `ecos` y `humo` medidos con la máquina cargada.
