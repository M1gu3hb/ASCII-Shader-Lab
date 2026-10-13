# Cierre del PR #10: pendientes completados, verificación y publicación

Registro del encargo «Completar el alcance pendiente de GLYPHOS y publicar en producción». Parte de
[REVISION-PR10.md](REVISION-PR10.md) (su §9, «Lo que no quedó resuelto») y del inventario
[INVENTARIO-REPOS.md](revision-pr10/INVENTARIO-REPOS.md) en `73d49f2`. Los informes de cada bloque, con mecanismo,
archivos, presets, pruebas y capturas, están en [cierre-pr10/](cierre-pr10/):

| Bloque | Informe | Filas y pendientes |
|---|---|---|
| Campos y relieve | [campos.md](cierre-pr10/campos.md) | I-01, I-03, I-06, I-10, I-11, I-16, I-31, I-33, I-34, I-35 |
| Trama y geometría | [trama.md](cierre-pr10/trama.md) | I-15, I-17, I-19, I-23, I-25, I-26, I-28, I-29, I-30, I-32 |
| Luz | [luz.md](cierre-pr10/luz.md) | I-02, I-05, I-07, I-08, I-09, I-12, I-13, I-18, I-21 |
| Acabados | [acabados.md](cierre-pr10/acabados.md) | I-20, I-22, I-27, I-36…I-43 |
| Física y pendientes por familia | [fisica-pendientes.md](cierre-pr10/fisica-pendientes.md) | I-04, I-14, I-24; DLA, Continentes, Lenia, Montaña viva, Coral, nubes, Mandala de arena, cámara de niebla |
| Grabado láser (C-07) | [grabado.md](cierre-pr10/grabado.md) | C-07 |

El resto (contratos del motor, color de ecos y humo, familias sobre la foto o el texto, agujero negro, Azar v8, recursos,
navegadores, publicación) se documenta aquí.

**Estados** (los del encargo): *pendiente*, *implementado sin verificar*, *verificado* (código, prueba que demuestra el
mecanismo y revisión de capturas en los dos motores), *equivalente con trazabilidad* (lo pedido se cubre con otro
mecanismo, dicho cuál), *excluido* (con su causa) y *bloqueado* (con la acción que falló y su evidencia).

## 1. Matriz de pendientes (§9 del registro anterior, §10 del encargo y los de cada informe)

| ID | Requisito | Origen | Estado | Implementación | Prueba | Evidencia | Commit |
|---|---|---|---|---|---|---|---|
| P-01 | Parámetros 9–16 y versión de la familia en las analíticas | §9 «Ocho de ocho parámetros» | verificado | `PARAM_SLOTS` 16 y `VERSION_SLOT`: `k0`/`k1` más los globales `K2`, `K3` y `FV` en GLSL; `k[0..16]` en los gemelos (`src/families/params.ts`, `sample.ts`, `engine/glsl/programs.ts`). Un control nuevo declara su versión (`ParamSpec.since`): no aparece ni se guarda en capas anteriores | `family-contracts.test.ts`; `families-compat.test.ts` (los 86 y los 203 presets dibujan igual en su versión) | §2 | `16ca1f4`, `5c944e6`, `a206e73` |
| P-02 | Grano del disco del agujero negro a los 10 minutos | §9 y §10 | verificado | `lente_gravitacional` v2: textura del disco en dos capas ponderadas, con la cizalla acotada (`BH_tex`); la v1 conserva su camino | `family-lente-grano.test.ts` (crecimiento del grano: v2 al final < 1,5 × el inicio; v1 > 2 ×); paridad de motores a 600 s r ≥ 0,9996 | §2 | `c8594d0` |
| P-03 | Color propio por celda en `ecos` y `humo`, en los dos motores | §9 «Familias raster con color propio» | verificado | Raster RGB (`FieldModel.renderColor`, textura RGBA con la luminancia en alfa, `famRasterC`); ecos v2 (modos arcoíris, deriva, dos tonos, de la fuente) y humo v2 (por edad, profundidad y emisores); las capas v1 siguen por brillo (`layerColours` por versión) | `families.test.ts` (batería con `rasterC`), `family-contracts.test.ts`; `families-qa --compare` r = 1,0 en los presets nuevos | §3 | `da08e3a`, `e76336a` |
| P-04 | Familias y materiales que leen la foto, el texto o la capa de abajo | §9 «Leer la fuente» | verificado | `FamilyMeta.reads`; analíticas con `famSrc(q)`/`famSrcKind()` y `VB`/`VC`; rasters con `feed()`. Ecos de tu foto y de tus palabras; cromado v2 (letras y foto de cromo); desgarro v2 (foto y palabras tras el papel, otra capa debajo); vidrio sólido sobre la foto (I-36…I-43). En WebKit, la copia ya no pasa por lo subido a WebGL | `family-fuente.test.ts`; `familias-fuente.spec.ts` (8 casos) en Chromium, WebKit y Firefox | §3 | `e76336a`, `e920ee5`, `2747716` |
| P-05 | C-07 «Grabado láser» completo y accesible | §9 | verificado | Familia `grabado`: contornos del texto, recorrido ordenado, presets «Tu palabra grabada», «Geometría», «Firma», «Placa terminada», «Escritura de luz»; receta en Texto | `family-grabado.test.ts`; `grabado.spec.ts` (exportación PNG y HTML, otro texto cambia el grabado) | [grabado.md](cierre-pr10/grabado.md) | `1ca1f7a`, `0b1693b` |
| P-06 | 43 filas del inventario | §9 «Mejoras … 43 filas» | verificado (43/43; I-41…I-43 equivalentes con trazabilidad) | §4 | §4 | §4 | §4 |
| P-07 | DLA de construcción a 160 filas crece despacio | §9, §10 | verificado | `dla` v2: los caminantes escalan con la rejilla; sigue siendo construcción | `family-dla.test.ts`; `families-cierre-fisica.json` (v1 igual) | Cristalización 5 % → 36 % a los 30 s, terminada | `b6b4969` |
| P-08 | «Continentes» depende de la semilla | §9, §10 | verificado | Siembra «Mapa de continentes» antisimétrica: tierra 50 % con cualquier semilla y resolución; sigue como construcción (sin variante continua: no hay mecanismo que la sostenga) | `family-automata.test.ts` | [fisica-pendientes.md](cierre-pr10/fisica-pendientes.md) | `b6b4969` |
| P-09 | «Nadadores» y «Anillos que nadan» ocupan poco | §9, §10 | verificado | Lenia v3: control «Estela» (0 = lo de antes) y vista más cercana; siguen como figuras | `family-lenia.test.ts` | Tinta 5 → 13–14 % y 3 → 9–10 % | `b6b4969`, `a206e73` |
| P-10 | «Montaña viva» y «Coral que respira», fondos lentos | §9, §10 | verificado | Erosión v2: «Ciclo del levantamiento» (150 s = lo de antes); coral con heridas más frecuentes | `family-erosion.test.ts`, `family-reaccion_difusion.test.ts` | Cambio en 10 s 13–17 % → 25–27 %; `m` 0,55–1,06 → 1,05–2,22 % | `b6b4969` |
| P-11 | Nubes por encima de ~97 % de tinta | §9, §10 | verificado | `nubes_vol` v2: control «Contraste» (0 = lo de antes); Haces de luz y Vuelo entre nubes ganan huecos y estructura; Haces sigue llenando el cuadro por apariencia | `family-nubes_vol.test.ts` | capturas antes/después | `b6b4969`, `b5bc5b6` |
| P-12 | «Mandala de arena» con disco gris central | §9, §10 | verificado | `chladni` v2: la arena repartida queda oscura y las líneas nodales se dibujan por su distancia al cero; la v1 se conserva | `family-chladni.test.ts`; `families-cierre-fisica.json` | capturas v1/v2 | `b6b4969` |
| P-13 | Cámara de niebla legible sólo a 16 px | §9, §10 | verificado | `niebla` v2: traza saturada, neblina recortada, fuente cerca del centro, control «Grosor de traza»; se lee con celdas de 10 px | `family-niebla.test.ts` | capturas v1/v2 a 10 px | `b6b4969`, `a206e73` |
| P-14 | Coste de ecos y humo y de los casos caros, sin carga competidora | §9 «Coste en máquina libre», §10, §12 | verificado | Medición repetida con la máquina libre (`scripts/families-cost.ts`, `coste-cuadro.spec.ts`) | — | §6 | `f781436` |
| P-15 | Navegadores: sólo Chromium con SwiftShader | §9, §13 | verificado en lo accesible; bloqueado lo físico | Firefox y WebKit de Playwright con recorridos representativos; tres fallos reales corregidos en WebKit | §7 | §7 | `2747716`, `86aa43d`, `63c7941` |
| P-16 | Safari real, GPU de hardware, teléfonos | §13 | bloqueado | No hay GPU, Mac, iPhone ni Android accesibles desde esta máquina. Lista de comprobación en §8 | — | §8 | — |
| P-17 | Recursos GPU: no concluir por el heap JS | §12 | verificado (contadores, no VRAM) | `recursos-gpu.spec.ts` cuenta los objetos WebGL vivos y los bytes pedidos | §5 | §5 | `63c7941`, `f781436` |
| P-18 | Presupuesto de primera vista en CI | §12 | verificado | `perf.spec.ts` en el job `public-e2e` de cada push | CI | §6 | `bbd4e88` |
| P-19 | Azar v8 con instantánea inmutable y tiradas doradas | §11 | verificado | §9 | `generator-v8.test.ts`, `generator-versions.test.ts` (v1…v8) | §9 | `a52f12b` |
| P-20 | Catálogo por uso, sin «Ciencia»; Imagen y Texto sólo si procesan la fuente | §11 | verificado | `uses` de cada preset; las familias que no leen la fuente no declaran `media/efectos` ni `tipo/texturas` (salvo texturas que rellenan las letras) | `families-index.test.ts`, `generator-v8.test.ts` (ninguna sección «ciencia»), `recetas-todas.spec.ts` | §10 | — |
| P-21 | Cuerpo blando por presión (informe de física anterior) | informe | verificado | Preset `cojin` «Cojín que respira» (restricción de volumen XPBD) | `family-tela.test.ts` | capturas | `c3e0859` |
| P-22 | «Faro» como bucle exacto (informe anterior) | informe | verificado | Bucle exacto de 240 s; la prueba de contrato de orbitales se corrigió | `family-orbitales.test.ts` | — | `c3e0859` |
| P-23 | Azar no copiaba `fxKind` con «Efectos» bloqueado | [acabados.md](cierre-pr10/acabados.md) §7 | verificado (v8) | v8 copia `fxKind` y el vidrio de la base; la v7 queda como estaba (congelada) | `generator-v8.test.ts` «con Efectos bloqueado» | §9 | `a52f12b` |
| P-24 | Foto en paleta con dispersión: no da arcoíris | acabados §7 | excluido | Decisión de diseño: en modo paleta la foto no pone su color; el arcoíris está con «color de la fuente» | — | acabados §2 | — |
| P-25 | Pan de oro (I-20) y cáustica de la bola | acabados §7 | excluido | Ninguno lo pide la fila (I-20 pide ancho por velocidad y sangrado; I-36…I-43, vidrio, dispersión y transmisión) | — | — | — |
| P-26 | Calidad «Ligera» del motor básico quita halo y grano (y con ellos destello y papel) en la vista previa | acabados §7 | excluido | Decisión de coste anterior al cierre; las exportaciones los llevan | — | — | — |
| P-27 | Color propio de `flujo_ruido` | campos | excluido | La fila I-01 no lo pide; la familia va por luminancia y paleta | — | — | — |
| P-28 | Grabado: foto o video como fuente; letras animadas | grabado §6 | excluido | C-07 pide el contorno del texto; una fuente que cambia diez veces por segundo reiniciaría la ruta sin parar | — | — | — |
| P-29 | Grabado: GIF y video sin e2e propia | grabado §6 | verificado (GIF; el video usa el mismo camino de cuadros) | El exportador común (motor fijo, por pasos) es el que cubren las pruebas del anfitrión; PNG y HTML del grabado tienen e2e (`grabado.spec.ts`) | `grabado.spec.ts` «el GIF exportado lleva el surco» (ffmpeg lee cada cuadro) | §11 | `f0ab00a` |
| P-30 | Límites visuales anotados (mandala denso a 10 px, eclipse lento a propósito, neón siempre «LUZ», vinilo con menos surcos, órbitas legibles con celdas grandes, malla y chorro sin color propio) | informes de luz, trama y física | excluido (decisión documentada) | Cada informe da la razón; ninguno contradice la diferencia que pide su fila | — | — | — |
| P-31 | WebKit: copia de la foto/letras para las familias | encontrado en este cierre | verificado | La copia ya no usa `drawImage` de lo subido a WebGL | `familias-fuente.spec.ts` en WebKit | §7 | `2747716` |
| P-32 | WebKit privado: la foto no volvía al recargar (sin Blob en IndexedDB) | encontrado en este cierre | verificado | Se guardan sus bytes si el Blob no se admite | `media-store-bytes.test.ts`; `data.spec.ts` en WebKit | §7 | `86aa43d` |
| P-33 | Firefox: dos paradas de Tab de más en Recetas; táctil: un filtro llevado al borde quedaba bajo el botón «más» | encontrado en este cierre | verificado | `tabIndex -1` en las cajas que se desplazan; margen de desplazamiento del tamaño de los botones | `recetas.spec.ts` en Firefox; `recetas-mobile.spec.ts` en WebKit móvil | §7 | `6d77de9`, `bce39b0` |
| P-34 | WebKit móvil emulado: `touch-mobile` «estudio» (la hoja arrastrada con eventos de ratón no queda «asomada»; con el perfil de Android, la página se cierra recorriendo la hoja de Exportar) | encontrado en este cierre | bloqueado | En emulación no se distingue si es del producto o de la emulación (ratón sobre un táctil emulado; un proceso de WebKit que cae); en Chromium móvil pasa 12/12. Necesita un iPhone real (§8) | `touch-mobile.spec.ts` (mobile-webkit) | §7 | — |
| P-36 | Táctil: la fila «Con su paleta y sus caracteres» del panel de familia medía 28 px | encontrado en este cierre (Chromium y WebKit, según la pieza del dado) | verificado | 44 px de alto en táctil, también «Cómo funciona» | `touch-mobile.spec.ts` (Chromium móvil 12/12) | §7 | `8095f84` |
| P-35 | La fila del historial vuelve al elemento actual mientras llegan miniaturas (`controls.spec`, 1 de 4) | encontrado en este cierre (previo: falla igual sin estos cambios) | pendiente | Fuera de este alcance; propuesto como tarea aparte con la causa probable (`ScrollRow` revela por identidad del nodo) | `controls.spec.ts` | §7 | — |

## 2. Contratos del motor (P-01, P-02)

- **Dieciséis parámetros y la versión.** `packParams(meta, p, out, v)` llena 17 huecos: `k[0..15]` y la versión en
  `k[16]`. En GLSL, el fragmento de cada familia recibe `k0` y `k1` (vec4) como antes y lee `K2`, `K3` (parámetros 9 a
  16) y `FV` (versión) como globales que el pase de campo fija por capa (`uLF2`, `uLF3`, `uLV`). Los gemelos de CPU leen el
  mismo `Float32Array`. Las familias de este cierre que usan más de ocho parámetros (cuerdas, seda, grietas de oro, jade de
  ruido, haces de luz…) los leen así.
- **Controles por versión.** `ParamSpec.since`: un control añadido en la versión N no aparece en el panel de una capa de
  una versión anterior ni se guarda en ella (`paramsAt`, `normParams`). Así las capas v1 de ecos, humo, tela, fluido,
  erosión, Lenia, nubes y niebla vuelven a normalizarse sin cambios.
- **Compatibilidad.** `families-compat.test.ts` dibuja, cada uno en su versión, los 86 presets publicados antes del PR, los
  203 del PR tal como estaban en `73d49f2` (`fixtures/families-pr10.json`) y los casos de física de este cierre
  (`fixtures/families-cierre-fisica.json`).
- **Agujero negro v2.** El disco se texturiza con dos muestras ponderadas en triángulo y una cizalla acotada, de modo que la
  textura no se va estirando sin fin con el tiempo. La prueba mide el crecimiento del grano a lo largo de diez minutos.

## 3. Color por celda y familias sobre la pieza (P-03, P-04)

- **Raster RGB.** Un modelo con `color` y `colorSince` da, además de la luminancia que elige el glifo, el color de cada
  celda (`renderColor`). El motor WebGL lo sube como RGBA (luminancia en alfa) y el básico lo muestrea igual; una capa de
  una versión anterior a `colorSince` sigue dibujando por brillo.
- **Ecos v2:** el color viaja dentro del bucle (se deforma, decae y se pliega con la imagen) en cuatro modos (arcoíris,
  deriva, dos tonos y de la fuente). Presets: «Túnel de colores», «Espejos que cambian de color», «Pulso en dos tonos»,
  «Ecos de tu foto» (Imagen) y «Ecos de tus palabras» (Texto).
- **Humo v2:** color por edad, por profundidad o por emisor. Presets «Incienso que se enfría», «Aurora de humo» y «Humo
  de varios focos».
- **Leer la pieza.** `famSrc(q)` devuelve la foto o las letras en el punto de la capa (con el encuadre, zoom y espejo de la
  pieza); `famSrcKind()` dice si hay patrón, foto o texto; `VB`/`VC` son el valor y el color de las capas de abajo en esa
  celda. Los rasters reciben la misma fuente con `feed()`. Cromado v2 (`mask: 'fuente'`): «Tus letras de cromo» y «Tu foto en
  cromo»; desgarro v2 (`behind: 'fuente' | 'abajo'`): «Tu foto tras el papel», «Tus palabras bajo la ceniza» y «Se abre
  y deja ver otra capa». Las recetas de Imagen y
  Texto de una familia que lee la pieza la dibujan sola (mezcla 1, normal): la imagen está hecha de la foto o de las letras.
- **WebKit.** Allí, una copia 2D de un lienzo o de un ImageBitmap que WebGL ya leyó sale vacía, negra o de otra imagen. La
  máscara de las letras se dibuja ahora aparte para las familias (`engine/text.ts textMask`, la misma en los dos motores) y
  la foto se reduce en la GPU desde su textura y se lee con `readPixels` (`AsciiEngine.mediaCopy`).

## 4. Las 43 filas del inventario (P-06)

Cada fila se implementó como familia nueva que extiende el patrón citado (`FamilyMeta.extends`: el patrón clásico no
cambia), como preset nuevo de una familia con versión nueva (el camino anterior se conserva) o como capacidad del motor
(acabados). Archivos de una familia: `src/families/meta/<id>.ts` (y `.doc.ts`), `analytic/<id>.ts` + `<id>.cpu.ts`
(analíticas) o `sims/<id>.ts` (simulaciones), registrados en `load.ts`, `analytic/glsl.ts`, `docs.ts` e `index-data.ts`.
La prueba de mecanismo de cada familia es `tests/unit/family-<id>.test.ts`; además la batería genérica
(`families.test.ts`: contrato temporal, periodo de los bucles, controles con efecto, estado exacto, determinismo) y el
índice. Las filas que convergen en un mismo mecanismo se cuentan una vez como trabajo y se marcan.

| ID | Fila (fuente) | Estado | Implementación | Diferencia visible conseguida | Prueba | Commit |
|---|---|---|---|---|---|---|
| I-01 | radiant flow-field | verificado | `flujo_ruido` «Líneas de flujo» (simulación, extiende `campo_flujo`); presets enredo, filamentos, viento, remolinos, tinta | partículas que siguen el ángulo 2π·ruido(p,t) con estela que se desvanece: líneas enredadas que cambian con el ruido, no senos | `family-flujo_ruido.test.ts` | `42546d9` |
| I-02 | radiant champagne-fizz | verificado | `burbujas` «Burbujas con nucleación» (extiende `lluvia_ascendente`); champan, sifon, lava_lenta, espuma | 5–8 puntos fijos de nucleación, subida con bamboleo, crecen y estallan arriba | `family-burbujas.test.ts` | `ec8b588` |
| I-03 | radiant resonant-strings | verificado | `cuerdas` «Cuerdas vibrantes» (extiende `catenaria`); arpa, acorde, grave, armonicos (bucles) | suma de 2–4 modos estacionarios con envolvente y pellizco periódico: cuerdas que vibran | `family-cuerdas.test.ts` | `42546d9` |
| I-04 | radiant kinetic-grid | verificado | `tela` v2, preset `malla_cinetica` «Malla cinética» | malla anclada por todo el borde, sin gravedad, golpes periódicos desde un borde; tinta = tensión | `family-tela.test.ts` | `86e8341` |
| I-05 | radiant laser-labyrinth | verificado | `haces_luz` «Haces de luz» (extiende `rayos`); laberinto, discoteca, faros, terciopelo, escenario | conos que entran desde los bordes, barren y se cruzan en una niebla fBm; destellos en los cruces | `family-haces_luz.test.ts` | `945d2f1` |
| I-06 | radiant gilded-fracture | verificado | `grietas_oro` «Grietas de oro» (extiende `grietas`); kintsugi, brasa, porcelana, cobre (bucle; continuo con «renovar») | Voronoi con warping cuyas grietas aparecen desde un origen y se llenan de oro incandescente | `family-grietas_oro.test.ts` | `42546d9` |
| I-07 | radiant golden-throne | verificado | `mandala_capas` «Mandala de capas» (extiende `flor_armonica`); trono, roseton, loto, girasol (bucles) | capas concéntricas (flor de la vida, pétalos, espirales áureas) que contrarrotan | `family-mandala_capas.test.ts` | `945d2f1` |
| I-08 | radiant eclipse-glow | verificado | `eclipse_total` «Eclipse total» (extiende `rayos`); diamante, totalidad, tormenta, perlas | disco negro con corona de rayos fBm polares asimétricos, anillo de diamante, viento solar | `family-eclipse_total.test.ts` | `a795ec5` |
| I-09 | radiant diamond-caustics | verificado | `talla_diamante` «Talla de diamante» (extiende `caleido`); brillante, princesa, rosa_antigua, hielo (bucles) | facetas en anillos × sectores que giran, color espectral por faceta y centelleo | `family-talla_diamante.test.ts` | `68415ac` |
| I-10 | radiant silk-groove | verificado | `seda` «Seda especular» (extiende `mareas_lentas`); seda, cascada, olas, saten, velos | campo de altura de pliegues + fBm iluminado por su normal con especular | `family-seda.test.ts` | `42546d9` |
| I-11 | radiant silk-cascade | verificado (mismo mecanismo que I-10) | `seda`: brillo anisótropo (vetas) en «Cascada de seda» y «Velos de seda» | vetas de brillo anisótropo además del relieve | `family-seda.test.ts` | `42546d9` |
| I-12 | radiant smolder | verificado | `calor_radiante` «Calor que irradia» (extiende `fuego`); rescoldo, termografia, fragua, braseros | temperatura radial con lenguas por derivadas de fBm, mapa térmico y brasas | `family-calor_radiante.test.ts` | `d6ad2b4` |
| I-13 | radiant neon-revival | verificado | `neon_tubos` «Letrero de neón» (extiende `forma`); letrero, corazon, estrella, arcos, luz (bucles) | tubos SDF con encendido, zumbido eléctrico, goteo de luz y reflejo en la pared | `family-neon_tubos.test.ts` | `6212a54` |
| I-14 | radiant lipstick-smear | verificado | `fluido` v2, preset `lazos` «Lazos de tinta» | emisores en órbita (elipse + epiciclo) que trazan lazos; vorticidad alta | `family-fluido.test.ts` | `86e8341` |
| I-15 | radiant digital-rain | verificado | `lluvia_agua` «Lluvia digital sobre agua» (extiende `lluvia`); consola, aguacero, estanque, espejo | columnas que caen y, al tocar la línea de agua, levantan ondas (simulación 1D) | `family-lluvia_agua.test.ts` | `99b2d6a` |
| I-16 | radiant liquid-gold | verificado | `metal_fundido` «Metal fundido» (extiende `marmol`); oro, plata, cobre, marea, iris | triple warping + metabolas con sombreado metálico y Fresnel | `family-metal_fundido.test.ts` | `42546d9` |
| I-17 | radiant woven-radiance | verificado | `tejido_bandas` «Tejido de bandas» (extiende `entrelazado`); oro_verde, sarga, cuadros, seda | hilos por bandas de color con cruce arriba/abajo animado | `family-tejido_bandas.test.ts` | `99b2d6a` |
| I-18 | radiant vinyl-grooves | verificado | `vinilo` «Disco de vinilo» (extiende `anillos`); tocadiscos, arcoiris, single, pizarra (bucles) | surcos en V que ondulan, reflejo en cruz iridiscente que gira, brazo | `family-vinilo.test.ts` | `2d9e867` |
| I-19 | radiant vintage-static | verificado | `estatica_vhs` «Estática de barras» (extiende `glitch`); carta, cinta, deshielo, paleta (bucles) | barras de color que se derriten por columnas, cortes VHS y barrido | `family-estatica_vhs.test.ts` | `99b2d6a` |
| I-20 | radiant ink-calligraphy | verificado | Motor: `interact.stroke = 'caligrafia'` y `interact.bleed` (pincel automático); receta «Caligrafía en papel» | ancho del trazo según la velocidad y sangrado de la tinta | `acabados.test.ts`, `acabados.spec.ts` | `268f508`, `11c6cf4` |
| I-21 | radiant velvet-spotlight | verificado (mismo mecanismo que I-05) | `haces_luz`, presets «Foco de terciopelo» y «Dos focos fríos» | motas de polvo iluminadas sólo dentro de los conos que barren | `family-haces_luz.test.ts` | `945d2f1` |
| I-22 | radiant lens-whisper | verificado | Motor: `fxKind.bloom = 'anamorfico'`; receta «Destello de cine» (Imagen) y control en Efectos | estela horizontal + anillo bokeh + separación cromática por luz | `acabados.test.ts`, `acabados.spec.ts` | `268f508`, `11c6cf4` |
| I-23 | radiant painted-strata | verificado | `estratos` «Estratos» (extiende `topografia`); canon, plegado, fallas, acuarela | fronteras plegadas por warping tectónico con fallas; un color por estrato | `family-estratos.test.ts` | `99b2d6a` |
| I-24 | radiant navier-stokes | verificado | `fluido` v2, preset `chorro` «Chorro sumergido» | chorro desde el fondo, borde superior abierto, cizalla en los dos bordes, dos trazadores | `family-fluido.test.ts` | `86e8341` |
| I-25 | paper dot-orbit | verificado | `puntos_orbita` «Puntos en órbita» (extiende `trama`); confeti, reloj, vitral, polvo | celdas de Voronoi con un punto que orbita su centro; color por celda en pasos | `family-puntos_orbita.test.ts` | `99b2d6a` |
| I-26 | paper smoke-ring | verificado | `anillo_humo` «Anillo de humo» (extiende `nube`); aro, incienso, corona, halo (bucles) | anillo radial deformado por ruido polar que fluye hacia fuera; color por radio | `family-anillo_humo.test.ts` | `99b2d6a` |
| I-27 | paper paper-texture | verificado | Motor: `fxKind.grain = 'papel'` con `fxKind.fold` (cuartos, carta, diagonal, arrugado); recetas «Impreso en papel» y «Caligrafía en papel» | hoja quieta con grano, fibras y pliegues | `acabados.test.ts`, `acabados.spec.ts` | `268f508`, `cce4acb` |
| I-28 | vanta dots | verificado | `rejilla_puntos` «Rejilla de puntos» (extiende `rejilla`); campo, marejada, gota, llanura | rejilla de puntos en perspectiva que ondula, sin sol | `family-rejilla_puntos.test.ts` | `99b2d6a` |
| I-29 | vanta globe | verificado | `globo_puntos` «Globo de constelaciones» (extiende `constelacion_dinamica`); red, nodos, rutas, malla (bucles) | esfera de puntos que gira con segmentos entre vecinos y arcos | `family-globo_puntos.test.ts` | `99b2d6a` |
| I-30 | vanta rings | verificado | `arcos_parciales` «Arcos parciales» (extiende `anillos`); orbitas, barrido, saturnal, engranaje (bucles) | arcos incompletos de radio y grosor distintos, a ritmos distintos, en un plano inclinado | `family-arcos_parciales.test.ts` | `99b2d6a` |
| I-31 | vanta topology | verificado (mismo mecanismo que I-01) | `flujo_ruido` | líneas acumuladas que avanzan sobre un campo de ruido | `family-flujo_ruido.test.ts` | `42546d9` |
| I-32 | vanta trunk | verificado | `anillos_tronco` «Anillos de tronco» (extiende `anillos`); tronco, rodaja, nudo, ondas | círculos concéntricos con radio perturbado por ruido polar que crecen y se acumulan | `family-anillos_tronco.test.ts` | `99b2d6a` |
| I-33 | vanta waves | verificado (mismo mecanismo que I-10) | `seda`, presets «Olas facetadas» y «Satén facetado» | superficie en perspectiva con sombreado facetado y brillo | `family-seda.test.ts` | `42546d9` |
| I-34 | webglblobs | verificado | `jade_ruido` «Jade de ruido» (extiende `jade_vivo`); jade, iris, magma, oceano (bucles) | esfera desplazada por ruido 3D periódico, torsión en Y y color por desplazamiento | `family-jade_ruido.test.ts` | `42546d9` |
| I-35 | shadergradient sphere | verificado (mismo mecanismo que I-34) | `jade_ruido` | — (la fila no pide otra diferencia) | `family-jade_ruido.test.ts` | `42546d9` |
| I-36 | shadergradient glass | verificado | Motor: vidrio en sólidos, `optics.kind = 'esfera' \| 'poliedro'` (prisma, cubo, octaedro, dodecaedro, icosaedro) | Fresnel de Schlick con reflejo del entorno y refracción de la pieza de detrás; tinte | `acabados.test.ts`, `acabados.spec.ts` | `268f508` |
| I-37 | three.js gltf dispersion | verificado | `optics.disp`: un índice por canal | arcoíris en los bordes del vidrio | `acabados.test.ts` | `268f508` |
| I-38 | three.js gltf transmission | verificado | esfera y poliedro de vidrio | vidrio que deja ver la pieza, invertida por la bola y partida por las facetas | `acabados.test.ts` | `268f508` |
| I-39 | three.js physical transmission | verificado | `optics.ior`, `optics.thick` y la normal de cada punto | refracción del fondo según IOR y grosor | `acabados.test.ts` | `268f508` |
| I-40 | three.js transmission alpha | verificado | `optics.fog` (opacidad del cuerpo) y `optics.tint` (Beer–Lambert) | vidrio teñido con su cuerpo parcialmente opaco | `acabados.test.ts` | `268f508` |
| I-41 | three.js WebGPU dispersion | equivalente con trazabilidad | = I-37 en WebGL 2 (GLYPHOS no usa WebGPU) | mismo resultado visual | `acabados.test.ts` | `268f508` |
| I-42 | three.js WebGPU transmission | equivalente con trazabilidad | = I-38 en WebGL 2 | ídem | `acabados.test.ts` | `268f508` |
| I-43 | three.js WebGPU physical transmission | equivalente con trazabilidad | = I-39 en WebGL 2 | ídem | `acabados.test.ts` | `268f508` |

Cuenta: 43/43 filas con implementación y prueba. Trabajo distinto: 31 mecanismos (24 familias nuevas, 3 presets de
familias con versión nueva y 4 acabados del motor: vidrio sólido, que reúne I-36…I-40, destello anamórfico, papel y
pincel caligráfico); las filas I-11, I-21, I-31, I-33, I-35 y I-41…I-43 convergen en otro mecanismo y no cuentan como
trabajo aparte.
Cada familia nueva se revisó en capturas ASCII en los dos motores (`scripts/families-qa.mjs --compare`, correlación por
preset en cada informe) y con la sonda temporal (0/30/60/120 s y 600 s donde aplica).

**Licencias.** Todo es código propio escrito desde la descripción del mecanismo; no se copió código ni assets de Radiant,
Paper Shaders, Vanta, three.js, ShaderGradient ni WebGLBlobs, y no hay dependencias nuevas, así que
`THIRD_PARTY_NOTICES` no cambia. Rain on Glass conserva su vía propia. Ningún preset lleva nombres de personas ni de
álbumes.

## 5. Recursos de GPU y memoria (P-17)

**Qué se mide y qué no.** Ninguna API web da la memoria de vídeo usada. `tests/e2e/recursos-gpu.spec.ts` envuelve las
llamadas WebGL 2 de la página antes de que arranque y cuenta, por contexto, los objetos creados y aún no borrados
(texturas, framebuffers, renderbuffers, programas, shaders, buffers, vertex arrays) y los **bytes que la página pide**
para texturas y renderbuffers (ancho × alto × bytes del formato en `texImage2D`, `texStorage2D`,
`renderbufferStorage`). Es lo que la página pide al driver, contado desde sus propias llamadas: el driver puede usar
más o menos, y un contexto perdido libera lo suyo. **No es una medida de VRAM ni permite decir «sin fugas de VRAM»**;
sí permite decir que la página no acumula objetos ni peticiones con el uso.

**Recorrido** (Chromium 141, SwiftShader, 1280 × 800), tres vueltas de: una capa analítica → cuatro capas (reacción–
difusión, ecos y humo de color, fluido) con una bola de vidrio y destello anamórfico → las mismas cuatro en orden
inverso → texto como fuente con «Tus letras de cromo» sobre papel plegado → otra vez una capa. Después, dos
exportaciones de GIF (una cancelada y otra terminada) dos veces, el contexto del escenario perdido y recuperado
(`WEBGL_lose_context`) y la página congelada 5 s como una pestaña en segundo plano (CDP `Page.setWebLifecycleState`).

| Momento | Chromium 141 (SwiftShader, DPR 1) | WebKit 26 de Playwright (DPR 2) |
|---|---|---|
| Inicio, una capa | 2 contextos · 38 texturas · 14 FBO · 11 programas · 0,4 MiB | — |
| Cuatro capas + vidrio + destello (1.ª vuelta) | 39 · 15 · 14 · 3,2 MiB | — |
| Las mismas en orden inverso | 40 · 16 · 16 · 6,0 MiB | — |
| Texto con letras de cromo en papel | 41 · 17 · 20 · 8,6 MiB | — |
| Otra vez una capa: vuelta 1 / 2 / 3 | 39 · 15 · 20 → 21 → 21 programas · 5,3 MiB las tres | 39 · 15 · 22 · 17,8 MiB las tres |
| Tras dos exportaciones GIF (cancelada y terminada), dos veces | 39 · 15 · 22 · 5,2 MiB, igual en las dos | 39 · 15 · 22 · 17,8 MiB, igual |
| Contexto del escenario perdido y recuperado | 38 · 14 · 16 · 0,9 MiB (rehace lo que usa) | 38 · 14 · 16 · 0,9 MiB |
| Pestaña congelada 5 s y de vuelta | 1 contexto · 19 · 7 · 5 · 0,2 MiB (el renderizador oculto se soltó; el escenario sigue moviéndose) | no aplica (CDP) |
| En Componentes (sin escenario) | 0 contextos, 0 objetos | 0 contextos, 0 objetos |
| De vuelta a su espacio | 1 · 19 · 7 · 5 · 0,2 MiB | 1 · 19 · 7 · 5 · 0,2 MiB |
| Máximo pedido a la vez | 8,6 MiB | 29,2 MiB (texturas al doble de densidad) |

Criterio: ninguna vuelta posterior tiene más objetos ni pide más bytes que la anterior (lo que la primera vuelta crea
por primera vez, como los programas de cada combinación de capas que el motor guarda, se queda; las siguientes no
añaden). Las dos ejecuciones pasan. La memoria de vídeo real queda sin medir (§8).

**Memoria JS** (`tests/e2e/recursos.spec.ts`, montón de JS tras una recolección completa, una y cuatro capas de
simulación durante 3,5 minutos en los dos motores, en Chromium): las cuatro pasan con sus cotas (lo que añade el
segundo tramo < 6 MB y el crecimiento total en 3 minutos < 12 MB). Es el montón de JS, no la memoria de la GPU.

## 6. Rendimiento medido sin carga competidora (P-14) y primera vista (P-18)

**Condiciones.** Máquina sin builds, sondas, navegadores ni agentes en marcha (comprobado antes de empezar), 4 núcleos
Intel Xeon a 2,1 GHz, Node 22.22.0. `scripts/families-cost.ts`: para cada preset de cada familia raster y cada
resolución (mínima, por defecto y máxima de su rango), tras calentar seis ventanas, 16 ventanas de medio segundo
simulado; se mide el paso del modelo (como ms por segundo simulado), un dibujo del raster y de su color, y un cambio de
control (un run nuevo desde su semilla hasta su primer raster: construcción, calentamiento y dibujo, de golpe). 441
combinaciones, ninguna con error. Datos completos en [coste-familias.json](cierre-pr10/coste-familias.json); tabla de las familias
caras (el preset más caro de cada una):

| Familia (peor preset) | Filas mín / def / máx | Modelo, ms por s simulado (mediana · p95) mín / def / máx | Dibujo del raster, ms (def / máx) | Color, ms (def) | Cambio de control, ms (def / máx) |
|---|---|---|---|---|---|
| `reaccion_difusion` (isla) | 64 / 96 / 256 | 200,09 · 212,73 / **217,4 · 299,94** / 209,86 · 271,84 | 0,29 / 1,75 | — | 420,27 / 448,61 |
| `ecos` (espejos) | 48 / 72 / 144 | 57,21 · 69,65 / **134,58 · 166,78** / 505,35 · 536,88 | 0,76 / 2,44 | 0,31 | 257,29 / 964,07 |
| `humo` (nebulosa) | 48 / 96 / 160 | 79,48 · 87,95 / **82,57 · 99,45** / 78,79 · 87,3 | 4,5 / 5,34 | 1,16 | 174,88 / 163,2 |
| `fluido` (chorro) | 48 / 128 / 192 | 17,72 · 19,97 / **125,39 · 125,98** / 206,39 · 240,24 | 0,76 / 1,83 | — | 127,5 / 214,81 |
| `agua` (piscina) | 48 / 96 / 128 | 5,69 · 7,23 / **15,01 · 17,17** / 25,72 · 43,85 | 2,54 / 4,29 | — | 93,24 / 155,87 |
| `campos_em` (espiras_vivas) | 48 / 96 / 192 | 39,45 · 57,08 / **38,09 · 59,37** / 38,24 · 55,46 | 0,92 / 1,86 | — | 15,94 / 22,03 |
| `lenia` (colonia) | 64 / 128 / 256 | 48,39 · 51,2 / **49,77 · 69,99** / 211,2 · 225,32 | 0,2 / 1,64 | — | 107,08 / 456,56 |
| `physarum` (membrana) | 48 / 96 / 192 | 9,75 · 11,28 / **37,87 · 38,84** / 152,44 · 173,41 | 0,36 / 1,41 | — | 206,38 / 800,77 |
| `tela` (velo) | 48 / 96 / 192 | 71,7 · 71,91 / **72,71 · 76,47** / 73,63 · 92,51 | 0,95 / 1,58 | — | 59,03 / 52,91 |
| `chladni` (arena) | 48 / 96 / 192 | 65,28 · 72,38 / **72,85 · 88,88** / 62,5 · 77,56 | 0,56 / 2,25 | — | 115,92 / 128,66 |
| `boids` (murmuracion) | 48 / 96 / 192 | 61,12 · 72,23 / **61,69 · 73,5** / 61,37 · 63,11 | 1,6 / 3,16 | — | 86,63 / 94,81 |
| `gravedad` (choque) | 48 / 96 / 192 | 52,85 · 89,01 / **55,13 · 67,71** / 52,48 · 53,84 | 0,81 / 2,1 | — | 55,09 / 57,07 |
| `flujo_ruido` (enredo) | 48 / 96 / 144 | 9,86 · 14,33 / **9,34 · 9,89** / 12,14 · 14,22 | 0,37 / 0,78 | — | 49,1 / 61,04 |
| `grabado` (tu-palabra) | 48 / 128 / 160 | 0,55 · 5,08 / **1,65 · 1,74** / 3,19 · 3,7 | 1,4 / 2,39 | 0,01 | 6,44 / 6,45 |

- **Cuatro capas en el mismo hilo** (Coral de reacción–difusión, Lazos de tinta, Túnel de colores de ecos y Aurora de
  humo, a sus filas por defecto): modelos 417,6 ms por segundo simulado (p95 452,4) y dibujo de los cuatro rasters
  7,5 ms.
- **Lectura.** Los picos del registro anterior (reacción–difusión 257–444, fluido 263–307, «Espiras que laten» 279 ms
  por segundo simulado) eran de la máquina cargada: libre, reacción–difusión da 217 (p95 300) y fluido 125 a su
  resolución por defecto, y «Espiras que laten» 38. Ecos y humo, a la suya, 135 y 83. Sólo `ecos` a su máximo opcional
  (144 filas, cuatro veces los píxeles por defecto y un búfer de color) pasa de 250: 311–505. «ms por segundo simulado»
  no es tiempo por cuadro: en vivo el anfitrión da a los pasos como mucho unos 8 ms por cuadro (menos lo que cuesta
  dibujar los rasters, A-10) y una simulación que no llega va más despacio en lugar de bloquear la página; lo mismo
  vale para el calentamiento tras un cambio de control (la columna «cambio de control» lo mide de golpe, como cota).
- **Decisión.** No se optimizó `ecos` al máximo: cualquier cambio de su bucle debe dibujar los presets v1 igual bit a
  bit (`families-compat`), el máximo es opcional y su coste queda acotado por el presupuesto del cuadro. Ninguna
  familia supera ese presupuesto a su resolución por defecto.

**Cuadro completo en el navegador** (`tests/e2e/coste-cuadro.spec.ts`, Chromium 141, 1366 × 860, ventana de 8 s tras
6 s de calentamiento; intervalos de `requestAnimationFrame`, que incluyen pasos, rasters, pase de campo, glifos y
presentación):

| Pieza | Motor básico (CPU) | WebGL 2 con SwiftShader (GPU emulada en la CPU) |
|---|---|---|
| Reacción–difusión, una capa | mediana 16,7 ms (≈60 fps), p95 100 | mediana 267 ms (≈4 fps), p95 550 |
| Ecos de color, una capa | 16,7 ms (≈60 fps), p95 50 | 183 ms (≈5 fps), p95 400 |
| Humo de color, una capa | 16,7 ms (≈60 fps), p95 67 | 200 ms (≈5 fps), p95 400 |
| Cuatro capas (RD, fluido, ecos, humo) | 50 ms (≈20 fps), p95 67 | 183 ms (≈5 fps), p95 383 |

Con SwiftShader el cuello es la emulación de la GPU (el pase de campo a 1366 × 860 en la CPU), no las familias: el motor
básico dibuja lo mismo a 60 fps. Esas cifras no dicen nada de una GPU real (§8). Con cuatro simulaciones pesadas el
motor básico baja a ~20 fps y sigue respondiendo (p95 67 ms).

**Primera vista** (métrica existente de `perf.spec.ts`, con ahorro de datos; límites sin tocar: JS < 1 100 000 bytes,
CSS < 220 000): ver §11 (medida sobre el build final). El presupuesto corre ahora en CI en cada push (`public-e2e`,
`bbd4e88`).

## 7. Navegadores (P-15, P-31, P-32)

**Entorno** (Linux x86-64, 4 núcleos, sin GPU): Playwright 1.56 con sus propios navegadores, sobre el build de producción
servido con `vite preview`:

| Navegador | Versión | WebGL 2 | Notas |
|---|---|---|---|
| Chromium (proyectos `desktop` y `mobile`) | 141.0.7390.37 | ANGLE sobre SwiftShader (GPU emulada en la CPU) | el de la CI |
| Firefox (proyecto `firefox`) | 142.0.1 | Mesa llvmpipe (software), con ventana bajo Xvfb | sin ventana no hay WebGL en esta máquina |
| WebKit (proyectos `webkit` y `mobile-webkit`) | 26.0 (build 2215) | por software; el renderer se anuncia como «Apple GPU» aunque no lo es | **WebKit de Playwright no es Safari** |

**Recorrido representativo** (los mismos archivos en Firefox y WebKit: `data`, `history-edits`, `sections`,
`recetas`, `azar`, `familias-fuente`, `grabado`, `acabados`, y en la pasada final de WebKit también `recursos-gpu` y
`anim`):

- **Firefox, primera pasada**: 53 pruebas, 50 pasan, 2 fallan, 1 omitida.
  - Fallo real: dos paradas de Tab de más en Recetas, porque Firefox para en las cajas que se desplazan. Corregido
    en `6d77de9`; `recetas.spec` pasa luego 10/10.
  - Fallo no ejecutable: `clipboard-read`/`clipboard-write` no son permisos que Playwright conceda en Firefox
    (`data.spec` «Compartir»).
  - Omitida: el estudio de foto (en pausa).
- **WebKit, primera pasada**: 52 pruebas, 42 pasan, 9 fallan, 1 omitida. Tres fallos reales, corregidos:
  - las familias que leen la pieza recibían una copia equivocada de lo subido a WebGL (`2747716`);
  - sin Blob en IndexedDB, la foto no volvía al recargar (`86aa43d`);
  - la lectura protegida tomaba la foto del almacenamiento antes de que la visita terminara de guardar
    (expectativa de la prueba, `63c7941`).

  Los demás fallos no se pueden ejecutar en WebKit:
  - el flag `--disable-3d-apis` es de Chromium (`acabados.spec`, código exportado sin WebGL);
  - el permiso del portapapeles no se concede en WebKit;
  - un fallo de la lista de caracteres es intermitente (1 de cada 2 veces, también sin carga).
- **WebKit, pasada final** (con las correcciones): 61 pruebas, 49 pasan, 3 fallan y 9 se omiten.
  - Omitidas: `anim.spec` (8) y la de «Llevar al estudio de foto» (1); son del estudio de foto, en pausa.
  - Los dos fallos no ejecutables de antes siguen.
  - `recursos-gpu` falló porque exigía el mismo número de contextos tras perder el del escenario. WebKit pierde
    también el del renderizador oculto, que se rehace al usarse. La expectativa pasó a «no más contextos» y la
    prueba pasa en WebKit y en Chromium.
- **Móvil emulado en WebKit** (iPhone 13 y un perfil de Android de 360 × 800; WebKit con viewport, toque y UA
  móviles, no iOS): 17 pruebas, 11 pasan.
  - No ejecutables: tres de `interacciones-mobile` usan una sesión CDP para el multitáctil, que sólo existe en
    Chromium.
  - Corregido: «740 × 360» agotaba su tiempo porque un filtro desplazado al borde quedaba bajo el botón «más»
    (`bce39b0`); `recetas-mobile` pasa 6/6.
  - Corregido: según la pieza del dado, la fila «Con su paleta y sus caracteres» de una familia medía 28 px en
    táctil (también en Chromium móvil); ahora mide 44.
  - **Sin resolver** en `touch-mobile` «estudio», en Chromium móvil pasan 12/12:
    - con el perfil de iPhone, el arrastre de la hoja con eventos de ratón sobre un dispositivo táctil emulado no la
      lleva a «asomada»;
    - con el de Android, la página se cierra mientras se recorre la hoja de Exportar.

    Van a la lista de comprobación del iPhone real (§8).
- **Chromium**:
  - `familias.spec`: las 64 familias en los dos motores, ejecución, A-03 y código exportado.
  - `recetas-todas`: las 139 recetas y escenas de los cinco espacios en los dos motores.
  - `recursos`: memoria con una y cuatro capas.
  - Las tres suman 21/21 en 1,1 h.
  - `familias-fuente` 8/8, `grabado` 3/3, `recursos-gpu` 1/1 y `coste-cuadro` 2/2.
  - `recetas`, `a11y`, `sections` y `controls`: 37/38. La fila del historial de `controls.spec` falla 1 de cada 4
    veces también en `main` sin estos cambios; queda propuesta como tarea aparte.
  - Proyecto `mobile` (Pixel 7, y en `touch-mobile` también iPhone 13 y Android 360 × 800 sobre Chromium): 45 pasan, 2 fallan, 5 omitidas en la primera pasada; los dos fallos eran la fila de 28 px y una medida tomada a mitad de la entrada de la bienvenida, corregidos en `8095f84`; `touch-mobile` pasa luego 12/12. Omitidas: pruebas del estudio de foto y del de glifos (en pausa).

## 8. Lista de comprobación en dispositivos reales (P-16, bloqueado aquí)

Esta máquina no tiene GPU (WebGL 2 es SwiftShader, emulado en la CPU), ni Mac con Safari, ni iPhone, ni Android. Firefox
y WebKit de Playwright cubren esos motores, pero **WebKit de Playwright no es Safari** (otro port, otra GPU, otro
almacenamiento) y nada aquí mide una GPU real. Pasos para quien tenga los dispositivos, sobre
https://glyphos-ascii.vercel.app:

| Dispositivo | Pasos | Resultado esperado | Síntomas de fallo | Evidencia a guardar |
|---|---|---|---|---|
| Mac con Safari 17 o posterior (GPU real) | Abrir `/studio/`; en Arte, Recetas → «Túnel de colores»; luego Imagen → cargar una foto → «Ecos de tu foto»; Texto → «Ecos de tus palabras» y «Grabado láser» | Los ecos de color llenan el lienzo con color propio desde el primer segundo; la foto y las letras se reconocen en los ecos; el grabado recorre el contorno de la palabra | Lienzo negro o gris, la segunda foto no cambia los colores, ecos sin letras (fue el fallo de WebKit corregido en `2747716`) | Captura a los 5 s y a los 60 s; versión de Safari y de macOS |
| El mismo Mac, ventana privada | Cargar una foto en Imagen, recargar | La foto vuelve sola | La pieza pide la foto otra vez (Blob no guardado; corregido en `86aa43d`) | Captura tras recargar |
| iPhone con iOS 17 o posterior | Abrir el estudio; tocar la tira de espacios; abrir Recetas en Fondos y elegir «Lazos de tinta»; pellizcar y arrastrar sobre el escenario; arrastrar la hoja de ajustes hacia abajo (debe quedar en «asomada» y luego cerrarse); tirar el dado varias veces y revisar en Capas que todo control mida ≥ 44 px; exportar PNG y GIF de 2 s desde la hoja de Exportar | Animación fluida (≥ 24 fps percibidos), controles táctiles responden, exportaciones se descargan | Cuadros de más de 100 ms, calentamiento del teléfono en un minuto, la página se recarga sola (memoria) | Grabación de pantalla de 30 s; modelo y versión |
| Android de gama media con Chrome | Igual que el iPhone, más «cuatro capas»: una receta y tres capas de simulación añadidas desde Forma | El presupuesto por cuadro hace que la simulación vaya más despacio, no que la página se congele | Toques sin respuesta durante más de 1 s | Grabación y `chrome://gpu` |
| Cualquier equipo con GPU real (Windows/Linux/Mac) | `/studio/` con «Esfera de vidrio», «Gema de vidrio teñido», «Destello de cine» y el agujero negro «cerca» 10 minutos | Refracción, dispersión y halo como en las capturas de [acabados.md](cierre-pr10/acabados.md); el disco del agujero negro no se vuelve grano | Bandas o ruido en el vidrio que no aparecen con SwiftShader; disco granulado a los 10 min | Capturas y `about:gpu`/`chrome://gpu` |
| Cualquiera, con «Reducir movimiento» del sistema | Abrir la portada y el estudio | La portada no anima de forma brusca; el estudio respeta su ajuste | Animaciones a toda velocidad | Captura |

## 9. Azar v8 (P-19, P-23)

- **Congeladas:** v1…v7 no cambian; `generator-versions.test.ts` sigue reproduciendo sus tiradas doradas (v7: 150 casos de
  `generator-v7.json`, sin regenerar).
- **Nueva v8** (`src/random/families8.ts`, `GEN_VERSION = 8`): elige como la v7 (una sección del espacio por uso y
  apariencia, luego uno de sus presets, con su semilla) sobre la instantánea de las **64 familias y 326 presets** del
  cierre, congelada en `families8-data.ts` (generada una vez por `scripts/azar8-data.ts`). Además:
  - una familia que lee la pieza se dibuja sola sobre la foto (Imagen) o dentro de las palabras (Texto), con las palabras
    al tamaño que pide su preset: no pierde la foto ni el texto;
  - un preset que muestra la capa de abajo la trae (Desgarro «Se abre y deja ver otra capa» sobre Corrientes);
  - el vidrio de delante puede ser una bola o una gema (además de lluvia y acanalado);
  - a veces el brillo es un destello anamórfico y el grano, sobre una paleta clara, una hoja de papel (flujo propio
    `acabado`);
  - con «Efectos» bloqueado se conservan el vidrio y la forma de los efectos de la base.
  - Coste: como en la v7, una familia encabeza y como mucho queda una segunda capa ligera (coste ≤ 2) del catálogo
    clásico, nunca dos simulaciones caras apiladas.
- **Tiradas doradas:** `generator-v8.json`, 202 casos (30 por espacio, más las primeras semillas de una serie fija que
  muestran cada novedad y 4 tiradas con «Efectos» bloqueado). Propiedades en `generator-v8.test.ts`.
- La hoja de la semilla ofrece «Versión 8 (actual)» y explica qué cambia; un enlace con `gen=7` sigue tejiendo la v7.

## 10. Catálogo, integración y conteos (P-20)

- **Conteos** (desde el registro, los mismos que dan la ficha, la biblioteca, el índice y la matriz): **64 familias**
  (39 del PR más 25 del cierre: las 24 de §4 y `grabado`) y **326 presets** (los 203 del PR con su id y su dibujo en su
  versión, más 123 nuevos). Contrato temporal: 223 continuos (∞), 64 en bucle exacto (↻) y 39 construcciones (▣).
  Lista generada, preset por preset, con nombre, otros nombres, contrato, periodo, usos, versión y actividad medida a
  0/30/60/120/600 s: [MATRIZ-PRESETS.md](revision-pr10/MATRIZ-PRESETS.md) (`scripts/families-matrix.ts` con la sonda
  temporal de la rama final).
- **Por uso y apariencia**, sin «Ciencia»: el grupo interno `ciencia` se muestra como «Figuras y espacio» (Saturno y
  el agujero negro siguen ahí). Ofertas por espacio: Arte 281, Fondos 182, Terminal 44, Texto 29 e Imagen 3. **Imagen
  sólo ofrece lo que procesa la foto** («Ecos de tu foto», «Tu foto en cromo», «Tu foto tras el papel»), más las
  recetas de acabados que actúan sobre ella (vidrio, destello, papel). En Texto, las texturas rellenan las letras y las
  familias que leen el texto («Tus letras de cromo», «Ecos de tus palabras», «Tus palabras bajo la ceniza» y el
  grabado) lo procesan.
- **Integración** de cada adición: biblioteca y búsqueda (`aka` con los nombres técnicos), controles con su versión,
  miniaturas, historial y colección, enlaces y visor, proyecto y sesión, exportaciones y código exportado (el runtime
  carga las familias que la pieza usa). Pruebas: `families-index.test.ts`, `families.test.ts` (batería genérica de las
  64), `familias.spec.ts` (las 64 abren desde Recetas, dibujan y muestran su panel en los dos motores),
  `recetas-todas.spec.ts` (todas las recetas y escenas de los cinco espacios en los dos motores; son recetas del
  estudio, no los 326 presets de familia, que cubre la batería unitaria y la sonda), `acabados.spec.ts`,
  `grabado.spec.ts`, `familias-fuente.spec.ts`.
- **Estudios en pausa:** el de glifos y el de foto siguen detrás de su variable de build (`VITE_GLIFOS_STUDIO`,
  `VITE_FOTO_STUDIO`); no se tocó su editor.

## 11. Pruebas: entorno, resultados y límites

- **Entorno local**: Linux x86-64, 4 núcleos Intel Xeon 2,1 GHz, Node 22.22.0, sin GPU; `npm ci` del `package-lock.json`
  (versiones fijadas); navegadores de §7.
- **Unitarias, tipos y build** (`npm run check` sobre el HEAD final, con la máquina libre): **184 archivos y 3 260
  pruebas, todas pasan**; `tsc --noEmit` sin errores; build correcto. Incluyen la batería genérica de las 64 familias,
  la compatibilidad (los 86 presets de antes del PR, los 203 del PR en `73d49f2` y los casos de física del cierre), las
  pruebas de mecanismo de cada familia nueva, los contratos del motor, las versiones 1 a 8 del azar con sus tiradas
  doradas, el almacén de medios sin Blob y los hallazgos A-01…A-12 de la revisión anterior.
- **Exportaciones** (`npm run verify:exports`, sobre el build de producción, Chromium 141 como navegador principal y
  Firefox 142 y WebKit 26 para abrir y reproducir lo exportado): **485 comprobaciones pasan, 0 fallan y 145 se omiten**.
  - Las omisiones son herramientas o navegadores que esta máquina no tiene (Chrome estable, Inkscape,
    rsvg-convert, asciinema…) o formatos que ese navegador no maneja (H.264 en el Chromium de Playwright).
  - Primera pasada: 1 fallo. El script esperaba el aviso antiguo («no puede reproducir») cuando el navegador no
    decodifica un MP4, pero el estudio dice desde `0ceb25a` «No se pudo decodificar el video…».
  - Corregida esa expectativa, el grupo `proyectos` pasa: 10 bien y 1 omitida.
  - Comprobaciones superadas por grupo (sumando motores): vector 166, código 69, componentes 51, imagen 48, React 48,
    estudio 30, terminal 24, proyectos 10, cámara 9, webm 8, reproducción 6, mp4 5, directo 4, GIF 4 y texto 3.
- **Primera vista** (métrica de `perf.spec`, con ahorro de datos): **1 061 043 bytes de JS** y **170 518 de CSS** (límites
  1 100 000 y 220 000, sin tocar; la referencia anterior era 1 009 964 de JS, y el cierre suma los contratos del motor,
  los acabados y el vidrio en sólidos al GLSL de la primera vista). Fichas, generador, shaders de familia, modelos y
  exportadores siguen cargándose al usarse, con su error, tiempo límite y reintento (`familias.spec` A-03 pasa).
- **CI** (GitHub Actions, en cada push de la PR): `check` (tipos, unitarias completas, build, `npm audit`) y
  `public-e2e` (subconjunto de regresiones públicas y `perf.spec` con el presupuesto). En verde en cada push de
  este cierre (`63c7941`, `f0ab00a`) y en el HEAD integrado (§12).
- **Calidad visual**: no se dedujo de la CI. Cada familia nueva se revisó en capturas ASCII en los dos motores y con la
  sonda temporal (informes de §4); este cierre revisó además las capturas de los presets que la sonda marca por encima
  del 97 % de tinta (§10) y las de los ecos y el grabado en WebKit.
- **Lo que no se probó**: GPU de hardware, Safari real, iPhone y Android reales (§8); WebGPU (GLYPHOS no lo usa).

## 12. Publicación

Se completa tras integrar en `main` y comprobar el despliegue de producción: SHA de `main`, CI de ese commit,
despliegue de Vercel (entorno, estado y commit de origen) y pruebas contra https://glyphos-ascii.vercel.app.
