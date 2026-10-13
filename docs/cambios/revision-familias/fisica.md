# Revisión de familias: física y movimiento

Familias: `fluido`, `agua`, `erosion`, `boids`, `gravedad`, `tela`, `chladni`. Rama `familias-fisica`, desde `6702598`.

## Cómo se midió

- Sonda temporal (`scripts/families-time.ts`) antes de tocar nada y después, con los JSON en `.cache/antes/` y `.cache/despues/` del worktree (no se suben):
  - `--seeds=3 --res=def --long=600` y `--res=min,max` antes; `--res=min,def,max --seeds=3 --long=600` después (tres semillas a la resolución por defecto, una en la mínima y otra en la máxima).
  - `model` es el % medio de cambio del raster en el medio segundo siguiente con la cámara quieta (el estado); `lit` es el % del lienzo con tinta (> 24/255).
  - En las tablas, cada momento va como `m` (model, %) · `l` (lit, %), media de las tres semillas a la resolución por defecto; «mín.» y «máx.» dan el peor `model` y el intervalo de `lit` en la resolución mínima y la máxima.
- Raster real mirado en PNG a 0 s, 10 s, 30 s, 2 min y 10 min (`scripts/families-viz.ts` y un script propio de pruebas por parámetros).
- Coste: `ms/paso × rate` en Node, a la resolución por defecto, y coste de dibujo por cuadro donde importa (agua). La máquina estuvo muy cargada por otros agentes (carga 6–13 en 4 núcleos) durante las sondas del «después»: las cifras de coste de esas sondas son cotas altas; las comparaciones directas antes/después se hicieron en el mismo momento.
- No pude correr `scripts/families-qa.mjs` (no hay Chromium de Playwright instalado en el contenedor). Las familias de este grupo son raster: el mismo modelo en TypeScript sirve a los dos motores.

## Decisiones por familia

### Fluido 2D (`fluido`)

Era la base más cercana a la «tinta/deformación orgánica», pero la tinta sólo entraba por los chorros y la caja cerrada la conservaba: Tinta en agua acababa en un gris uniforme (lit 87–92 % a la resolución por defecto, 100 % a 48 filas) y Tormenta también se llenaba (100 % a 48 filas). Arrancaba casi vacía.

Mecanismos nuevos (parámetros nuevos; con sus valores por defecto el modelo dibuja exactamente lo de antes):

- **Franjas** (`bands`) y **Renovación de las franjas** (`renew`): la tinta empieza en bandas de tinta y agua y vuelve a ellas despacio (una plantilla que ondula y se desplaza, sembrada con un generador propio para no alterar los chorros ni los obstáculos). La corriente las pliega, las estira y las enrosca; donde el agua se calma, vuelven. En la corriente desde la izquierda las bandas entran con el flujo por la entrada.
- **Bordes nítidos** (`sharp`): tinta y agua como dos líquidos que no se mezclan: el término de reacción de Allen–Cahn, c += k·c(1−c)(c−θ), con θ calculado para que la suma de la tinta no cambie en la caja cerrada (probado: sólo la disipación se lleva tinta). Con franjas, cada celda se inclina hacia su banda (θ desplazado por la plantilla), así que los bordes no luchan contra la renovación.
- **Qué echan los chorros** (`ink`): tinta, tinta y agua clara alternas, o nada (sólo remueven).
- **Contraste** (`contrast`): curva más empinada alrededor de la tinta a media fuerza.
- Vista **Curvas de nivel**: líneas de un píxel donde la tinta cruza seis niveles (sobre la tinta sin saturar).

Contrato: `{ param: 'jets', values: { '0': 'construccion' }, else: 'continuo' }`. Con 0 emisores no hay corriente propia: sólo el pincel.

### Agua (`agua`)

El coste estaba en el dibujo, no en la simulación: ≈ 0,2–0,3 ms por paso (15 ms por segundo simulado) frente a 6,4 ms (Piscina), 2,8 ms (Lluvia) y 6,6 ms (Canal) por cuadro a 96 filas, y el motor vivo dibuja en cada cuadro. Perfil de Piscina: 47 % en `Math.pow(nh, 50)` del brillo especular, ≈ 25 % en las cuatro muestras de luz por celda de las cáusticas.

- **Versión 1** (recetas guardadas): mismo dibujo byte a byte (la referencia de compatibilidad y 300 cuadros comparados por hash). La potencia sólo se calcula donde puede dar brillo (`nh > Hz`); es exacto porque para `nh < Hz` la potencia calculada queda decenas de ulp por debajo de la de referencia y `max(0, …)` da 0.
- **Versión 2** (algoritmo nuevo de dibujo, `version: 2`, el camino v1 se conserva para `cfg.v === 1`): una muestra de luz por celda con dos pasadas de suavizado y la potencia por cuadrados. Mismo estado del agua que la v1 (la semilla conserva la clave de la v1; probado). Diferencia media de dibujo frente a la v1: ≈ 9/255 en Piscina, 4,6/255 en Canal, 0 en Lluvia; menos del 0,3 % de las celdas difiere en más de un cuarto de la escala. A la vista son iguales.
- Coste por cuadro, mismo momento de la máquina: Piscina 6,35 → 3,25 ms; Lluvia 2,83 → 0,67 ms; Canal 6,62 → 2,44 ms (v1 con la potencia recortada: 5,79 / 1,62 / 3,79 ms).
- Cáusticas legibles: Piscina pasa a llovizna sobre agua honda (luz en celdas brillantes que tiemblan sobre las baldosas; antes, un fondo gris con anillos sueltos, lit 92 % casi plano). Nuevo **Luz bajo el agua**: sólo la luz que llega al fondo, cordones y manchas sobre negro (lit ≈ 63 %).

Contrato: `continuo` para toda la familia (con lluvia u oleaje). Sin lluvia ni oleaje el agua se calma hasta quedar lisa: lo dice `doc.time` (ver «Cambios compartidos»).

### Terreno que se erosiona (`erosion`)

La sonda base daba `model` 0,1–0,33 % sostenido: el agua sigue tallando pero cada vez más despacio; la cámara gira, el relieve casi no cambia. Decisión: sin levantamiento es una **construcción** (talla barrancos, ríos y terrazas y se va quedando quieta), y los fondos vivos necesitan **levantamiento continuo**.

- **Levantamiento** (`uplift`): tres dibujos de levantamiento sembrados (generador propio) que se relevan en un ciclo de 150 s; donde son positivos la corteza sube y donde son negativos se hunde, con techo y suelo suaves (el relieve está acotado; probado durante 2 minutos a `uplift` 1). La lluvia corta lo que sube y los ríos se reorganizan con las sierras: el equilibrio dinámico entre levantamiento y erosión fluvial (Cordonnier et al. 2016).
- **Encuadre** (`frame`, estructural): `maqueta` (la de antes) o `lienzo` (rejilla el doble de ancha que de alta, con las mismas celdas, vista desde arriba en todo el lienzo). El «mapa del agua» es el caudal: por dónde han corrido las gotas en los últimos segundos. En el lienzo el mar es oscuro con orillas claras, el relieve se ilumina con un sol más bajo y las gotas por paso son proporcionales al área del mapa (a 48 filas el mapa se inundaba de ríos: lit 97 %).

Contrato: `{ param: 'uplift', values: { '0': 'construccion' }, else: 'continuo' }`. Sin lluvia y con levantamiento, la tierra sube hasta el techo y se para (lo dice `doc.time`).

### Bandadas (`boids`)

Ya era continuo y legible; se mantiene el modelo. Murmuración, Cardumen y Dispersión no se detienen en diez minutos (`model` ≥ 7,6 % en todas las resoluciones). Nuevo **Estelas de bandada**: pocos agentes con estelas muy largas, cintas de luz que se cruzan (un fondo de líneas, distinto de las masas de Murmuración).

### Gravedad N-cuerpos (`gravedad`)

La galaxia no formaba brazos: un disco frío de 700 cuerpos con suma directa se calienta en unas vueltas y queda como un borrón (lit 22 → 13 % en 10 minutos). Con unos pocos miles de cuerpos auto-gravitantes los brazos no sobreviven; la solución es un modelo de brazos persistentes.

- Condición inicial **Galaxia de brazos** (`init: 'espiral'`, archivo `sims/gravedad-espiral.ts`): cada estrella recorre un óvalo cerrado visto desde el marco que gira con los brazos (aproximación de epiciclos de Lindblad: r = a(1 + e cos mψ)), girado un ángulo que crece con su tamaño. Los óvalos se apiñan en m brazos espirales (la onda de densidad cinemática que Lin y Shu convirtieron en teoría) que giran como un dibujo a la velocidad de patrón mientras las estrellas, con una curva de rotación plana, los atraviesan. Bulbo caliente, disco con respiración vertical, estrellas jóvenes que se encienden al cruzar el brazo y se apagan después; el enrollamiento y la excentricidad respiran en uno o dos minutos. 8 estrellas por cuerpo (hasta 9600), coste O(N). No suma parejas: lo dice «Cómo funciona».
- Parámetro **Brazos** (1–4). Probado: con 2 y 3 brazos, la componente de orden m del brillo en un anillo es la que domina y sigue igual después de 10 minutos.
- Colapso frío y Choque de cúmulos son **construcciones** (acaban en una bola que vibra casi quieta); se acercan (zoom 1,9 y 1,5) para que la nube llene el encuadre al empezar y el núcleo final no quede diminuto: Colapso pasa de lit 12–13 % sostenido a 23 %.

Contrato: `{ param: 'init', values: { choque: 'construccion', colapso: 'construccion' }, else: 'continuo' }`.

### Telas (`tela`)

Velo al viento sí se veía morir: la cámara orbitaba y a los 2 minutos lo mostraba de canto (lit 34 → 8 → 5 % en 10 minutos, `model` 0,66 %). No es la tela la que se para: es el encuadre.

- Parámetro **Ángulo de vista** (`angle`, 0 = el de antes, exacto). Velo y Bandera dejan de orbitar (`turn` 0) y se miran desde un ángulo fijo (−25° y 35°). La bandera, menos rígida y con más viento, se ve de lado y sus ondas viajan hasta el borde.
- Las ráfagas, sembradas, nunca se paran del todo (mínimo ≈ 5 % del viento medio): Velo y Bandera son continuos (`model` ≥ 2,5 % en todas las resoluciones a los 10 minutos). Membrana: la esfera que sube y baja la mantiene viva.
- Cuerpos blandos por presión: no resuelto (límite conocido, ahora escrito en `limits`).

Contrato: `continuo`. Sin viento ni esfera que se mueva la tela cae y se queda colgando (lo dice `doc.time`; ver «Cambios compartidos»).

### Chladni y cimática (`chladni`)

Sí: con modo fijo la arena se queda quieta. Placa resonante y Flor nodal dibujan su figura en unos segundos y la sostienen (sólo tiembla el grano: `model` 0,65–1,3 % a los 10 minutos). Se conservan como **construcciones**. Arena musical (ciclo rápido) es continua.

- Forma de placa nueva **Todo el lienzo**: rectangular, el doble de ancha que de alta, celdas cuadradas (u = cos nπX cos mπY + c cos mπX cos nπY, X ∈ [0, 2]); los granos saltan lo mismo en los dos ejes. En esa placa el tono descuenta el de un reparto uniforme: mientras la arena migra de un modo a otro el lienzo no se llena de gris (a 48 filas llegaba al 97 %).
- Presets continuos nuevos: **Arena en todo el lienzo** (fondo geométrico, ciclo lento) y **Mandala de arena** (placa circular, ciclo lento).

Contrato: `{ param: 'seq', values: { fijo: 'construccion' }, else: 'continuo' }`.

## Matriz por familia y preset

Columnas de actividad: `0 s · 30 s · 60 s · 120 s · 600 s`, cada una `m%/l%`.

### Fluido 2D — rate 30, filas [48, 192, 128]

Paleta, escala y profundidad: dos tonos con contraste alto en los presets de tinta (mármol, manchas, corriente, tinta en agua); humo con degradados; curvas de nivel como líneas de una celda. Los controles con más efecto visual: Franjas, Bordes nítidos, Contraste, Vorticidad, Fuerza, Disipación.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste (ms/s sim.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tinta_agua` Tinta en agua | Gotas de tinta pesada que caen en bocanadas, se abren en hongos de borde neto y se posan en un charco al fondo | continuo | 4,6/11 · 8,7/90 · 10,2/91 · 9,7/92 · 8,8/87; mín. l22–100 (lleno) | 6,3/9 · 16,5/27 · 13,4/26 · 14,1/25 · 14,1/25; mín. m≥8,1 l16–40; máx. m≥16,5 l8–26 | Fondo oscuro con masas blancas en la mitad superior y un charco abajo; bordes de una celda | 48–192, 3 semillas: estable | fondos/organicas, arte/organicas | Disipación 0,12→0,22, bordes nítidos 0,35, contraste 0,4, más fuerza: ya no se llena de gris | 100 → ≈ 170 (bordes nítidos y chorros más fuertes) |
| `marmol` Mármol líquido (nuevo) | Bandas de tinta y agua que tres remolinos lentos pliegan en ojos y espirales; las franjas vuelven donde el agua se calma | continuo | — | 27,8/51 · 11,2/58 · 10,9/57 · 10,8/58 · 11,3/58; mín. m≥6,1 l61–64; máx. m≥13,8 l48–57 | Llena el lienzo desde el primer cuadro; blanco y negro de bordes netos | estable | fondos/organicas, arte/organicas, tipo/texturas | Nuevo | ≈ 125 |
| `manchas` Manchas de tinta (nuevo) | Tinta y agua clara que no se mezclan: masas que se estiran, se parten y se vuelven a juntar | continuo | — | 30,3/61 · 28,7/60 · 30,9/56 · 26,7/56 · 30,0/57; mín. m≥17,5 l59–74; máx. m≥29,1 l58–65 | Llena; contraste máximo | estable | fondos/organicas, arte/organicas, tipo/texturas | Nuevo | ≈ 115 |
| `corriente` Corriente en capas (nuevo) | Capas de tinta que entran por la izquierda, rodean tres pilares y se enroscan en estelas | continuo | — | 20,3/65 · 20,9/67 · 19,8/65 · 21,5/68 · 21,8/65; mín. m≥8,6 l67–72; máx. m≥24,0 l61–66 | Llena; franjas horizontales que se rompen detrás de los pilares | estable | fondos/organicas, fondos/ondas | Nuevo | ≈ 85 |
| `humo_neon` Humo de neón | Columnas que suben por flotación y se deshilachan | continuo | 5,3/24 · 9,0/57 · 8,9/61 · 10,6/55 · 8,9/59; mín. l47–96 | 4,8/23 · 7,9/49 · 7,6/49 · 9,1/47 · 7,6/50; mín. m≥5,7 l44–89; máx. m≥5,8 l19–49 | Mitad inferior más densa; degradados suaves | estable | fondos/organicas, arte/organicas | Contraste 0,25 | 94 → ≈ 95 |
| `humo_curvas` Humo en curvas de nivel (nuevo) | Penachos de humo dibujados sólo con sus curvas de nivel | continuo | — | 7,6/12 · 16,3/19 · 16,1/19 · 14,2/18 · 14,0/19; mín. m≥17,3 l18–29; máx. m≥12,0 l10–17 | Líneas de una celda sobre negro: textura gráfica de contornos | estable | fondos/organicas, arte/curvas, tipo/texturas | Nuevo (vista Curvas de nivel) | ≈ 80; dibujo ≈ 2,7 ms/cuadro |
| `tormenta` Tormenta de vórtices | Ocho chorros veloces con vorticidad alta | continuo | 13,3/47 · 12,6/74 · 13,5/71 · 12,3/73 · 12,9/65; mín. l82–100 (lleno) | 10,6/40 · 10,3/50 · 11,3/48 · 10,0/47 · 10,8/46; mín. m≥7,7 l67–96; máx. m≥10,9 l42–53 | Llena con remolinos; más zonas oscuras que antes | estable (a 48 filas, hasta 96 %) | fondos/organicas | Disipación 0,7→0,9 y contraste 0,35 | 107 → ≈ 110 |
| `pilares` Estela entre pilares | Corriente que rodea cuatro pilares (vista de vorticidad) | continuo | 9,6/38 · 10,8/45 · 10,3/43 · 10,1/42 · 10,5/41 | igual (parámetros nuevos en su valor neutro) | Llena; pilares y estelas | estable | fondos/organicas, arte/organicas | Sin cambio de aspecto: ya cumplía | 118 (referencia) |

### Agua — rate 60, filas [48, 128, 96], versión 2

Escala: celdas de luz de unas 3–6 celdas; profundidad sugerida por la refracción de las baldosas y el brillo especular. Controles con más efecto: Lluvia, Tamaño de gota, Amortiguación, Profundidad, Vista.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `piscina` Piscina con cáusticas | Llovizna sobre agua honda: la luz se junta en celdas brillantes que tiemblan sobre las baldosas | continuo | 14,1/92 · 14,0/92 · 14,1/92 · 13,9/92 · 14,9/92 (gris casi plano con anillos sueltos) | 29,9/93 · 30,5/93 · 31,8/93 · 31,1/93 · 30,8/93; mín. m≥16,8 l88–89; máx. m≥32,1 l94 | Llena; ocupación alta pero con contraste fuerte (luz y lechada oscura) | estable | fondos/ondas | Lluvia 5→12, gota 2,2→1,6, amortiguación 0,55→0,3, profundidad 0,8→1 | pasos 11 → ≈ 23 ms/s; dibujo 6,35 → 3,25 ms/cuadro |
| `destellos` Luz bajo el agua (nuevo) | Sólo la luz que llega al fondo: cordones y manchas que bailan sobre negro | continuo | — | 38,1/62 · 41,0/65 · 41,6/64 · 41,6/64 · 43,2/63; mín. m≥34,7 l61–63; máx. m≥46,4 l59–64 | Llena; blanco sobre negro | estable | fondos/ondas, tipo/texturas | Nuevo | pasos ≈ 24 ms/s; dibujo ≈ 2,5 ms/cuadro |
| `lluvia` Lluvia sobre el estanque | Anillos que se cruzan y rebotan en las rocas (vista de la superficie) | continuo | 17,9/51 · 17,7/50 · 18,1/50 · 18,0/49 · 17,9/50 | igual | Llena | estable | fondos/ondas | Sólo el dibujo más barato | dibujo 2,83 → 0,67 ms/cuadro |
| `canal` Ondas en un canal | Olas planas que pasan por dos rendijas y se abren en franjas de interferencia | continuo | 15,7/47 · 14,9/47 · 15,9/47 · 15,9/47 · 15,9/47 | igual en estado; dibujo v2 | Llena | estable | fondos/ondas, arte/optica | Sólo el dibujo más barato | dibujo 6,62 → 2,44 ms/cuadro |

### Terreno que se erosiona — rate 30, filas [48, 160, 112], figura

Profundidad: maqueta en 3D (voxel space) o relieve sombreado desde arriba; detalle de ríos de una celda. Controles con más efecto: Levantamiento, Lluvia, Erosión, Evaporación, Encuadre, Vista.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rios` Mapa de ríos (nuevo) | Mapa que llena el lienzo: ríos que se ramifican hasta la costa y cambian de cauce mientras las sierras suben | continuo | — | 2,6/71 · 2,0/73 · 1,9/69 · 1,9/64 · 1,9/60; mín. m≥1,7 l68–71; máx. m≥1,8 l64–68 | Llena; ríos claros de una celda sobre relieve oscuro | 48–160, 3 semillas: estable | fondos/organicas, fondos/materia, tipo/texturas | Nuevo | ≈ 6 ms/s; dibujo ≈ 2,5 ms/cuadro |
| `costa` Costa tallada (nuevo) | Ladera que baja al mar vista desde arriba: barrancos sombreados por un sol bajo que la lluvia ahonda mientras la tierra sube | continuo | — | 2,5/63 · 2,1/72 · 2,2/76 · 2,1/78 · 1,8/74; mín. m≥1,8 l54–73; máx. m≥1,8 l55–65 | Llena salvo el mar; relieve con sombras | 48–160, 3 semillas: estable | fondos/materia | Nuevo | ≈ 15 ms/s; dibujo ≈ 2,2 ms/cuadro |
| `montana` Montaña viva (nuevo) | Maqueta de cordillera que la tierra sigue levantando; la lluvia la talla sin terminar | continuo (lento) | — | 0,28/24 · 0,22/24 · 0,22/24 · 0,26/24 · 0,25/24; mín. m≥0,33 l23; máx. m≥0,18 l23–24 | Figura en el centro (24 %) | estable | arte/figuras | Nuevo (levantamiento 0,35) | ≈ 17 ms/s |
| `barrancos` Barrancos | Lluvia fuerte sobre una cordillera: surcos profundos | construcción | 0,29/24 · 0,21/24 · 0,26/23 · 0,23/24 · 0,25/24 | igual | Figura | estable | arte/figuras | Declarado construcción; sin cambio de aspecto | ≈ 13 ms/s |
| `delta` Ríos y delta | Ladera al mar: ríos que dejan su sedimento abajo | construcción | 0,29/24 · 0,23/22 · 0,18/22 · 0,32/24 · 0,33/24 | igual | Figura | estable | arte/figuras | Declarado construcción | ≈ 15 ms/s |
| `mesetas` Mesetas | Estratos duros: bordes en terrazas | construcción | 0,13/20 · 0,10/22 · 0,12/21 · 0,12/20 · 0,12/20 | igual | Figura | estable | arte/figuras | Declarado construcción | ≈ 11 ms/s |

### Bandadas — rate 30, filas [48, 192, 96]

Trazos de unas dos celdas por agente sobre una estela que se desvanece; densidad cambiante entre grupos y vacío. Controles con más efecto: Alineación, Cohesión, Depredadores, Estela, Cantidad.

| Preset | Aspecto y mecanismo | Contrato | Antes = después (salvo nuevos) | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `murmuracion` Murmuración | Bandada enorme que se curva en eses; un halcón le abre huecos | continuo | 16,9/43 · 12,1/36 · 11,3/34 · 13,6/38 · 10,9/34; mín. m≥7,6 l34–62; máx. m≥12,8 l28–29 | Masas que cruzan el toro | estable | fondos/vivas, fondos/organicas | Usos; sin cambio de aspecto | ≈ 60 ms/s |
| `estelas` Estelas de bandada (nuevo) | Pocos agentes con estelas muy largas: cintas de luz | continuo | 8,0/49 · 6,4/58 · 6,1/58 · 5,2/48 · 7,0/65; mín. m≥6,5 l59–80; máx. m≥6,5 l20–29 | Líneas finas que se cruzan; llena | estable | fondos/vivas, fondos/organicas, arte/curvas | Nuevo | ≈ 30 ms/s |
| `cardumen` Cardumen | Bancos apretados que esquivan a tres depredadores entre rocas | continuo | 13,6/24 · 9,5/21 · 9,4/21 · 9,7/22 · 9,5/21; mín. m≥9,4 l28–38; máx. m≥8,9 l17–20 | Grupos sueltos y anillos de roca | estable | fondos/vivas | Usos | ≈ 40–55 ms/s |
| `dispersion` Dispersión | Poca cohesión: grupos pequeños que se cruzan | continuo | 16,1/54 · 10,0/38 · 8,6/35 · 9,4/37 · 10,0/38; mín. m≥11,3 l50–85; máx. m≥10,4 l23–27 | Textura de trazos | estable | fondos/vivas, tipo/texturas | Usos | ≈ 20–35 ms/s |

### Gravedad N-cuerpos — rate 30, filas [48, 192, 96], figura

Puntos de una celda con estela; profundidad por inclinación de la cámara y brillo por masa o velocidad. Controles con más efecto: Condiciones iniciales, Brazos, Zoom, Inclinación, Estela.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `galaxia` Galaxia espiral | Dos brazos nítidos que giran sin deshacerse; estrellas jóvenes que se encienden en ellos | continuo | 4,2/22 · 3,7/19 · 3,6/17 · 3,6/17 · 3,0/13 (disco que se calienta en un borrón) | 4,2/27 · 4,2/27 · 4,3/27 · 4,2/27 · 4,4/27; mín. m≥3,3 l39–41; máx. m≥5,7 l24–25 | Figura en el centro (≈ 60 % del alto); brazos de 2–3 celdas | estable | arte/figuras | Galaxia de brazos (órbitas de Lindblad); 800 cuerpos (6400 estrellas), estela 0,15 | pasos 50 → ≈ 15 ms/s; dibujo 1,9 → ≈ 1,4 ms/cuadro |
| `remolino` Remolino de tres brazos (nuevo) | Galaxia de tres brazos casi de frente y muy de cerca: los brazos llenan el lienzo | continuo | — | 7,3/39 · 7,3/39 · 7,2/40 · 7,2/38 · 7,4/38; mín. m≥8,8 l71–74; máx. m≥9,3 l34–35 | Brazos que salen del lienzo | estable | fondos/espacio, arte/figuras | Nuevo | pasos ≈ 20 ms/s; dibujo ≈ 1,8 ms/cuadro |
| `choque` Choque de cúmulos | Dos cúmulos que se cruzan y se funden | construcción | 3,0/9 · 2,5/9 · 3,1/11 · 3,1/11 · 2,2/7 | 3,6/14 · 2,5/13 · 3,2/17 · 3,2/17 · 2,1/9 | Figura; acaba en una bola | estable | arte/figuras | Construcción declarada; zoom 1,2→1,5, estela 0,4→0,6 | ≈ 50 ms/s |
| `colapso` Colapso frío | Nube que llena el lienzo, cae, rebota y queda en núcleo con halo | construcción | 5,2/20 · 1,8/12 · 1,9/12 · 2,0/13 · 2,0/13 | 8,9/37 · 3,2/23 · 3,1/23 · 3,1/23 · 3,0/23 | Empieza llenando; acaba en núcleo con estelas | estable | arte/figuras | Construcción declarada; zoom 1→1,9, estela 0,7→0,8 | ≈ 50 ms/s |
| `binaria` Estrella doble con anillo | Dos estrellas que agitan un anillo | continuo | 2,7/17 · 3,9/37 · 3,7/37 · 3,5/34 · 2,7/21 | igual | Figura | estable | arte/figuras | Usos | ≈ 40 ms/s |

### Telas — rate 30, filas [48, 192, 96], figura

Triángulos sombreados (Lambert) y malla; profundidad por sombreado y búfer de profundidad. Controles con más efecto: Viento, Rigidez, Ángulo de vista, Vista.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `velo` Velo al viento | Tela colgada de dos esquinas, casi de frente: pliegues que se hinchan con cada ráfaga | continuo | 6,7/34 · 3,8/25 · 2,1/18 · 1,4/8 · 0,7/5 (de canto) | 7,7/36 · 4,9/31 · 4,3/33 · 4,7/36 · 4,6/34; mín. m≥3,6 l28–37; máx. m≥5,3 l28–37 | Figura grande; grises con pliegues | estable | arte/figuras | `turn` 0,12→0, ángulo −25° | ≈ 75–110 ms/s |
| `bandera` Bandera | Mástil visto de lado: ondas que viajan al borde libre | continuo | 6,4/33 · 6,2/31 · 7,0/33 · 6,0/25 · 6,7/33 | 5,4/23 · 5,1/23 · 7,1/27 · 5,9/26 · 5,6/25; mín. m≥2,6 l21–34; máx. m≥4,4 l19–32 | Malla y sombreado; se leen las ondas | estable | arte/figuras | `turn` 0, ángulo 35°, rigidez 0,85→0,7, viento 2→2,4 | ≈ 50–70 ms/s |
| `membrana` Membrana elástica | Lámina sujeta por las esquinas que una esfera golpea desde abajo | continuo | 8,3/18 · 3,2/19 · 7,7/18 · 8,0/18 · 7,8/17 | igual | Malla en perspectiva | estable | arte/figuras | Usos | ≈ 50 ms/s |

### Chladni — rate 30, filas [48, 192, 96], figura

Densidad de arena con persistencia; líneas nodales de 1–2 celdas. Controles con más efecto: Secuencia, Forma de placa, Modo n/m, Agitación.

| Preset | Aspecto y mecanismo | Contrato | Antes | Después | Lienzo y glifos | Res./semillas | Usos | Cambio | Coste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `arena` Arena en todo el lienzo (nuevo) | Placa rectangular que ocupa el lienzo y cambia de modo despacio: celosías y rombos que se deshacen y se rehacen | continuo | — | 2,7/29 · 1,6/23 · 3,4/25 · 1,3/20 · 2,6/21; mín. m≥0,5 l25–35; máx. m≥2,1 l16–34 | Llena; líneas claras de 1–2 celdas sobre oscuro | 48–192, 3 semillas: estable | fondos/geometricas, tipo/texturas | Nuevo | ≈ 70 ms/s |
| `placa` Placa resonante | Placa cuadrada en modo fijo: la arena traza su figura y la sostiene | construcción | 2,6/41 · 1,3/22 · 1,3/21 · 1,2/21 · 1,2/19 | igual | Figura cuadrada | estable | arte/geometricas | Declarado construcción | ≈ 45–55 ms/s |
| `flor` Flor nodal | Placa circular en modo fijo: radios y anillos | construcción | 1,4/25 · 0,8/17 · 0,7/16 · 0,7/15 · 0,7/15 | igual | Figura circular | estable | arte/geometricas | Declarado construcción | ≈ 45–55 ms/s |
| `mandala` Mandala de arena (nuevo) | Placa circular con ciclo lento de modos | continuo | — | 1,3/24 · 1,2/27 · 3,5/30 · 0,9/21 · 3,0/28; mín. m≥0,8 l25–32; máx. m≥2,5 l23–30 | Figura circular | estable | arte/geometricas | Nuevo | ≈ 60 ms/s |
| `musical` Arena musical | Modos que cambian cada pocos segundos | continuo | 2,0/28 · 2,4/27 · 3,2/31 · 6,2/35 · 4,4/35 | igual | Figura cuadrada | estable | arte/geometricas | Usos | ≈ 60–70 ms/s |

## Coste

Con la máquina libre, al empezar (`ms/paso × rate`, resolución por defecto): Fluido 94–118 ms por segundo simulado, Agua 11–20 (pasos) más 5,4–9,6 ms por cuadro de dibujo, Terreno 11–14, Bandadas 19–60, Gravedad 40–52, Telas 48–76, Chladni 43–61. Todos por debajo de 250.

Después, la máquina no volvió a estar libre (otros agentes, carga 6–14 en 4 núcleos). Para no comparar cifras infladas, cada preset nuevo o cambiado se midió alternando rondas cortas con un preset de su familia cuyo código no cambió (Fluido: Estela entre pilares; Terreno: Barrancos; Bandadas: Dispersión; Gravedad: Estrella doble; Telas: Membrana; Chladni: Placa resonante; Agua: los pasos de Lluvia), y el coste estimado es esa razón por el coste de la referencia en la máquina libre. Son las cifras «≈» de las tablas; el dibujo de Agua y de la galaxia se comparó directamente en el mismo momento. Todo queda por debajo de 250 ms por segundo simulado; el más caro es Tinta en agua (≈ 170, antes 100) por los bordes nítidos y los chorros más fuertes.

- Agua: dibujo por cuadro 6,35 → 3,25 ms (Piscina), 2,83 → 0,67 (Lluvia), 6,62 → 2,44 (Canal), medidos en el mismo momento. Los pasos de Piscina y Luz bajo el agua cuestan el doble que antes (≈ 23 ms/s) porque llueve más.
- Galaxia: pasos ≈ 50 → 15 ms/s (sin suma de parejas) y dibujo ≈ 1,9 → 1,4 ms por cuadro, después de cambiar las manchas gaussianas por depósito bilineal y suavizado (con manchas costaba el doble que el N-cuerpos).
- Las incertidumbres de estas razones son grandes (la carga cambia entre rondas): una medida en una máquina libre las afinaría.

## Cambios compartidos que necesitaría (no hechos)

1. **Contrato temporal con más de un parámetro.** `TimeRule` sólo mira un parámetro. En Agua el régimen depende de Lluvia y Oleaje (sin los dos el agua se calma); en Telas, de Viento y Esfera; en Fluido, de Emisores y Franjas (0 emisores con franjas en la corriente sigue siendo continuo, y la regla dice construcción). Haría falta una regla con varias condiciones (p. ej. `{ all: [{ param, values }] }`) o una función. Mientras tanto: Agua y Telas declaran `continuo` y su `doc.time` explica el caso que se calma; Fluido usa los emisores.
2. **`figure` por preset.** `figure` es de la familia y sólo cambia la escala en lienzos verticales (`figureFit`). Erosión y Chladni tienen ahora presets que llenan el lienzo (encuadre «Lienzo entero», placa «Todo el lienzo») y Gravedad uno que lo llena de cerca (Remolino): en un lienzo más alto que ancho se encogerían como una figura. Haría falta `figure` en el preset, o una regla por parámetro como la del tiempo.
3. **Chromium para `families-qa.mjs`** en el contenedor de los agentes (no está instalado), para la comparación de los dos motores.

## Lo que no quedó resuelto

- **Cuerpos blandos por presión** en Telas: no se modelan (sólo láminas). Escrito en `limits`.
- **Erosión en maqueta**: Montaña viva es continua pero lenta (`model` ≈ 0,2–0,3 %), como pide un relieve que sube y se talla; a la vista cambia sobre todo con el giro de la cámara. Los fondos vivos de la familia son los del lienzo entero (`model` ≈ 1,5–2 %).
- **Mandala de arena**: en algunos modos de la secuencia sembrada (n alto) el centro de la placa casi no vibra y la arena se queda repartida: un disco gris uniforme durante ese modo. Es la física del modelo (el paso mínimo de los granos es 0,015 de la amplitud); cambiarlo para los presets existentes rompería la compatibilidad y no lo hice con un parámetro nuevo.
- **Tormenta de vórtices a 48 filas** llega al 96 % de ocupación en algún momento (antes, 100 %): dentro del margen, pero justo.
- **Agua v2** no es idéntica a la v1 byte a byte (diferencia media ≈ 9/255 en Piscina); por eso es otra versión de algoritmo y las recetas v1 conservan su dibujo.
- **Coste medido con la máquina cargada**: las sondas del «después» corrieron con carga 6–13 en 4 núcleos (otros agentes). Todos los presets quedan por debajo de 250 ms por segundo simulado incluso así, salvo lo dicho en la tabla de coste; las cifras exactas en una máquina libre serán menores.
- `scripts/families-qa.mjs` no se pudo correr (sin navegador).
- Con la máquina muy cargada, una ejecución de la batería con todos los archivos en paralelo agotó una vez los 5 s de `reaccion_difusion/mitosis` en `families-compat` (familia de otro grupo, código sin tocar); repetida, pasa (ver «Verificación»).

## Verificación

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{fluido,agua,erosion,boids,gravedad,tela,chladni}.test.ts`: 9 archivos, 322 pruebas en verde. La referencia de compatibilidad (86 presets originales) sigue igual: con los parámetros originales cada familia dibuja lo mismo (Agua, por su camino de la versión 1).
- `tests/unit/families.test.ts`: sólo dos entradas nuevas en `INERT` (`fluido.renew`: sólo cuenta con franjas; `gravedad.arms`: sólo cuenta con la galaxia de brazos).
- Pruebas propias nuevas: una por preset continuo (a la resolución mínima, el raster cambia y la ocupación queda entre 2 % y 97 %), conservación de la tinta con bordes nítidos, franjas que vuelven, estado exacto con franjas, levantamiento y galaxia de brazos, brazos que persisten 10 minutos, placa del lienzo, agua v2 frente a v1 y ángulo de la tela.
- Sonda temporal después: los 35 presets, tres semillas a la resolución por defecto con 10 minutos, una en la mínima y otra en la máxima. Ningún preset continuo se queda quieto ni sale de 2–97 % de ocupación en ninguna muestra tras el calentamiento (JSON en `.cache/despues/`; Mapa de ríos, Costa tallada, Arena en todo el lienzo, Galaxia espiral y Remolino se volvieron a medir tras sus últimos ajustes).
- No corrido: `scripts/families-qa.mjs` (sin Chromium de Playwright en el contenedor).
