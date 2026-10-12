# Revisión de familias: vida y química

Revisión del PR #10 para el grupo «Vida y química»: `reaccion_difusion`, `physarum`, `lenia`, `automata` y `kuramoto`. Rama `familias-vida`, desde `6702598`.

Objetivo: fondos y composiciones que sigan cambiando sin reinicio, con contraste y bordes legibles en glifos, y que se vean igual a cualquier resolución. Cada preset queda como **continuo** o **construcción** (ninguno de este grupo es bucle), con la evidencia de la sonda temporal.

## Cómo se midió

- Sonda temporal (`scripts/families-time.ts`), compilada con esbuild. Antes: `.cache/antes-rd.json` y `.cache/antes-otros.json` (código de `6702598`); después: `.cache/despues-otros.json` y, para reacción–difusión (en varias tandas: una se cortó por el límite de tiempo de la tarea), `.cache/despues-rd-parte1.json` (Coral que respira), `.cache/despues-rd2.json`, `.cache/despues-rd3.json` (Isla), `.cache/despues-rd-caos.json` (Caos con su velocidad final) y `.cache/despues-rd-constr.json`; todo junto en `.cache/despues-todo.json`. Están en el worktree, sin subir. Órdenes:
  - `node .cache/families-time.mjs --ids=<familia> --seeds=3 --res=min,def,max --long=600` (tres semillas a la resolución por defecto con 0, 30, 60, 120 y 600 s; una semilla en la mínima con 0, 15, 30 y 60 s y en la máxima con 0, 15 y 30 s).
  - Los presets de construcción de reacción–difusión, con una semilla (`--presets=coral,mitosis,laberinto --seeds=1`).
- En las tablas, «m» es el cambio del modelo en el medio segundo siguiente (en % de la escala de grises) y «l» la parte del lienzo con tinta (%). Con varias semillas se da el intervalo. «Fallos» cuenta las muestras desde 15 s con `m = 0` o `l` fuera de 2–97 %. «ms/s» es el coste por segundo simulado en Node (media de las corridas por defecto; la máquina estaba compartida con otros agentes, así que es una cota alta).
- Rasters vistos en PNG (`scripts/families-viz.ts` y un arnés propio en `.cache/x.ts`) a 0, 30, 60, 120, 300 y 600 s.

## Resumen

- 30 presets (antes 20): 23 continuos y 7 construcciones; ninguno es bucle. Todos los continuos pasan la sonda de diez minutos con tres semillas a la resolución por defecto y con una semilla en la mínima y la máxima (`m` > 0 y tinta entre 2 y 97 % en todas las muestras desde 15 s).
- Construcciones conservadas y explicadas en `doc.time`: Coral químico, Células que se dividen (Mitosis), Laberinto, Colonia, Vida clásica, Continentes (Día y noche) y Pasadizos. Cada una salvo Colonia tiene ahora su versión continua trabajada: Coral que respira, Células sin fin, Laberinto que se rehace, Vida que no se apaga, Pasillos que se rehacen; y Continentes cede su sitio de fondo a Chispas.
- A-05 resuelto en las tres familias donde la resolución cambiaba el régimen (reacción–difusión, Lenia, osciladores): misma composición a cualquier número de filas, con la versión 1 conservada para las recetas guardadas.
- A-09: nombres visuales con el anterior o el científico en `aka` (Mitosis → Células que se dividen, Orbium → Nadadores, Organismos anulares → Anillos que nadan, Cerebro → Chispas, Día y noche → Continentes, Campo sincronizado → Ondas que cruzan); `aka` de familia con Gray–Scott, Lenia, Physarum, Kuramoto, Conway…
- A-06: `uses` en los 30 presets; `fondos/*` sólo en continuos que llenan el lienzo (comprobado en las pruebas propias).

Commits (rama `familias-vida`):

| SHA | Título |
|---|---|
| `eba4e01` | Reacción–difusión v2: rejilla fija (A-05), mapa vivo y heridas; cinco presets continuos |
| `c12a942` | Lenia v2: el radio crece con la rejilla (A-05), «Repoblar», bancos en formación y «Enjambre» |
| `d760245` | Autómatas: renovación por lluvia o por banda; Pasillos que se rehacen y Vida que no se apaga |
| `260e8bb` | Physarum: renovación de agentes; Meandros vivos y Red que se rehace |
| `be6dab1` | Osciladores v2: rejilla fija (A-05), vista «Frentes» y vórtices legibles; Espirales de luz |
| `194c790` | Familias de vida: Caos que respira a media velocidad, «Ondas que cruzan» y texto de Repoblar |
| `7ff911e` | Caos que respira: capa a 0,15 de velocidad y mareas al triple de ritmo |

## Decisiones por familia

| Familia | Antes | Qué cambió | Versión |
|---|---|---|---|
| Reacción–difusión | Coral, Mitosis y Laberinto llenaban el campo y se quedaban quietos (`m` 0 a los 10 min); el Laberinto dejaba el campo vacío con dos de cada tres semillas; a 64 filas todo terminaba en 15 s y a 256 tardaba 7 veces más y costaba ~1,2 s por segundo simulado; «Caos» cambiaba un 30 % cada medio segundo (ruido). | Rejilla química fija de 192 × 96 (A-05); «Mapa vivo» (heridas, mareas, franjas, isla) que hace variar la eliminación en el espacio y el tiempo sin bajarla nunca bajo la línea donde B inunda el campo; siembra «Ruido» en bloques. Los tres presets que terminan quedan como construcción; seis presets continuos. | 1 → 2 |
| Lenia | Orbium y Organismos anulares se morían o se quedaban en un 1–2 % del lienzo; Colonia a 64 filas quedaba negra; a 256 filas las criaturas eran la mitad de pequeñas. | El radio crece con la rejilla, con 128 filas como mínimo (A-05); «Repoblar»; bancos de criaturas en formación (paralelas, 4,5 radios), que ya no chocan; nuevo fondo «Enjambre». | 1 → 2 |
| Autómatas | Los cuatro presets se terminaban: Vida en ceniza (3–4 %), Cerebro y Día y noche se extinguían (0–2 %), Pasadizos se congelaba en 30 s. | «Renovación» por lluvia de semillas o por una banda que cruza el campo. Vida, Continentes (Día y noche) y Pasadizos quedan como construcción; Chispas (Cerebro) pasa a continuo; nuevos «Pasillos que se rehacen» y «Vida que no se apaga». | 1 |
| Physarum | Continuo, pero las redes se engrosaban en pocas celdas grandes y Meandros se apagaba poco a poco (17–22 % a los 10 min). | «Renovación» de agentes; Meandros con renovación; nuevo fondo «Red que se rehace». | 1 |
| Osciladores acoplados | Continuo; a 48 filas «Destellos» se volvía un destello del campo entero (l = 100 %); los vórtices eran puntos de 2 × 2 nodos. | Rejilla de osciladores fija de 96 × 48 (A-05); vórtices como discos legibles; vista «Frentes» y preset «Espirales de luz»; Campo sincronizado → «Ondas que cruzan». | 1 → 2 |

Compatibilidad: las recetas guardadas con la versión 1 conservan su camino (rejilla de 2 × filas en reacción–difusión, rejilla y radio en celdas en Lenia, media resolución en los osciladores) y los parámetros nuevos tienen por defecto el comportamiento anterior; los 86 presets publicados dibujan lo mismo (`tests/unit/families-compat.test.ts` en verde). A las filas por defecto, la versión 2 sin parámetros nuevos coincide byte a byte con la 1, salvo donde la versión 2 cambió a propósito la siembra («Ruido» de reacción–difusión en bloques, bancos de criaturas de Lenia en formación) y las marcas de vórtice de los osciladores (probado en `family-reaccion_difusion`, `family-lenia` y `family-kuramoto`). Los flujos aleatorios nuevos (mapa, heridas, renovación, repoblar) tienen su propia semilla, así que no alteran la siembra de antes, y entran en `snapshot()/restore()` (con pruebas de restauración exacta a mitad de mapa, herida, lluvia, banda, renovación de agentes y repoblado).

## Matriz por familia y preset

Columnas de cada matriz cualitativa: contrato; apariencia y mecanismo; cómo llena el lienzo; legibilidad en glifos; paleta, escala, detalle y profundidad; controles que se notan; usos; cambio hecho o razón para conservarlo. Debajo, la actividad medida antes y después (tablas de la sonda) y el coste.

### Reacción–difusión (`reaccion_difusion`, v2)

| ID | Nombre | Contrato | Apariencia y mecanismo | Llena / legibilidad | Paleta, escala, detalle | Controles efectivos | Usos | Cambio |
|---|---|---|---|---|---|---|---|---|
| `coral` | Coral químico | construcción | Gray–Scott F 0,0545 k 0,062 desde un cuadro central: ramas que crecen hasta cubrir el campo (~2 min) y se quedan quietas. | Lo cubre al final (81 % de tinta, blanco con huecos negros); al principio, sólo el centro. Bordes nítidos. | Arena sobre verde casi negro; franjas de ~5 filas a 96. | alimentación, eliminación, escala, vista. | arte/organicas | Conservado como construcción y explicado en `doc.time`; con la rejilla fija tarda lo mismo a 64 y a 256 filas (antes: 15 s a 64, sin terminar a 96). |
| `mitosis` | Células que se dividen (antes «Mitosis») | construcción | F 0,0367 k 0,0649 desde manchas: puntos que se estiran y se dividen hasta una red de puntos quieta (~2 min). | Lo cubre (44 %) en una trama de puntos. Puntos de ~4 filas: legibles. | Rosa sobre violeta oscuro. | alimentación, eliminación, escala. | arte/organicas | Nombre visual («Mitosis» en `aka`); construcción. |
| `laberinto` | Laberinto | construcción | F 0,029 k 0,057 desde ruido, vista en relieve: huella dactilar que se queda grabada. | Lo cubre (relieve con fondo gris: «tinta» 98–100 % por el gris de base, que es textura, no saturación). | Verde lima en relieve. | eliminación (franjas/puntos), difusión, vista. | arte/organicas, tipo/texturas | En v2 la siembra «Ruido» va en bloques de 3 × 3: antes dos de cada tres semillas dejaban el campo vacío (gris plano, `m` 0 desde el inicio). |
| `caos` | Caos que respira | continuo | F 0,018 k 0,051 con mareas: gusanos que nacen y chocan donde la eliminación es baja y anillos que se calman donde la marea sube. Contorno. | Lo cubre (55–74 %). Antes cambiaba un 30 % cada medio segundo (centelleo: se decorrelaciona en ~0,25 s); ahora un 10–18 %. | Cian sobre azul noche; contornos de una celda. | mapa, intensidad, ritmo, vista. | fondos/vivas | Mapa «Mareas» (ritmo 3) y capa a 0,15 de velocidad (`layer.speed`). |
| `coral_vivo` | Coral que respira | continuo | Química del coral con «Heridas» (intensidad 1, ritmo 0,6): cada pocos segundos se abre un claro que el coral vuelve a cerrar con ramas nuevas. | Lo cubre desde el principio (siembra en manchas, 78–83 %). | Melocotón sobre marrón muy oscuro; ramas de ~5 filas. | intensidad (tamaño de las heridas), ritmo (frecuencia). | fondos/organicas, tipo/texturas | Nuevo: versión continua trabajada de Coral químico. Cambio lento (≈1 % por medio segundo): fondo tranquilo. |
| `laberinto_vivo` | Laberinto que se rehace | continuo | Química del laberinto con «Mareas»: donde la marea sube las franjas se rompen en puntos; al bajar vuelven a trazarse en otra dirección. | Lo cubre (≈70 %); concentración en blanco y negro, bordes nítidos. | Azul hielo sobre negro azulado. | intensidad, ritmo. | fondos/organicas, tipo/texturas | Nuevo. |
| `celulas` | Células sin fin | continuo | Química de la mitosis con mareas fuertes (intensidad 1, ritmo 1,5): puntos que mueren bajo la marea y se dividen hacia los huecos; a ratos, gusanos. | Lo cubre (40–50 %). | Lila sobre violeta oscuro. | intensidad, ritmo. | fondos/vivas | Nuevo: versión continua de Mitosis. |
| `corrientes` | Corrientes de puntos | continuo | Química del laberinto con «Franjas»: bandas diagonales de puntos y de franjas paralelas que avanzan; cada frente reordena lo que pisa. | Lo cubre (≈70 %); composición en bandas. | Ámbar sobre negro cálido. | intensidad, ritmo. | fondos/organicas | Nuevo. |
| `isla` | Isla que respira | continuo | Química del coral dentro de una isla de orilla luminosa que crece y se encoge (periodo ~80 s, con tres lóbulos que giran); fuera, la química muere. | Figura centrada (14–40 %); no es fondo. | Verde agua sobre negro verdoso. | intensidad (cuánto muere fuera), ritmo. | arte/organicas | Nuevo: composición sobre una máscara de forma. |

### Lenia (`lenia`, v2)

| ID | Nombre | Contrato | Apariencia y mecanismo | Llena / legibilidad | Paleta, escala, detalle | Controles efectivos | Usos | Cambio |
|---|---|---|---|---|---|---|---|---|
| `orbium` | Nadadores (antes «Orbium») | continuo | Ocho criaturas Orbium (μ 0,15, σ 0,0145, R 13) que nadan en formación, paralelas, sobre el toro; «Repoblar» como red de seguridad. | Figura repartida: 5 % de tinta, cada criatura de ~20 filas a 128. Antes: 1–5 %, y a los 2 min morían o estallaban. | Verde agua; cuerpo con estrías. | densidad (puestos de la formación), radio, vista. | arte/organicas | v2: banco en formación (antes ±14° de giro: chocaban); σ 0,015 → 0,0145 (con 0,015 un choque estallaba en gusanos que llenaban el campo). Estable 10 min con tres semillas y a 64/128/256 filas. |
| `colonia` | Colonia | construcción | Manchas (μ 0,12, σ 0,0145, R 16) que crecen y se parten en células hasta poblar el campo; luego casi quietas (`m` 0,2 %). | 17 % a cualquier resolución. Antes, a 64 filas, negro. | Ámbar sobre marrón oscuro. | μ, σ, radio, densidad. | arte/organicas | A-05 resuelto por la rejilla mínima de 128 y el radio que escala; contrato honesto: construcción. |
| `anulares` | Anillos que nadan (antes «Organismos anulares») | continuo | Núcleo de tres anillos (μ 0,19, σ 0,02, R 12): criaturas en forma de aro que se desplazan despacio en formación. | Figura: 3 % de tinta; aros de ~15 filas, legibles pero escasos. Antes: 1–2 % y extinción a los 2 min en dos de tres semillas. | Lavanda sobre negro violáceo. | densidad, radio. | arte/organicas | R 24 → 12 y densidad 1 (más aros), formación y «Repoblar». |
| `sopa` | Sopa primordial | continuo | Ruido en todo el campo (μ 0,15, σ 0,015, R 13) que se ordena en gusanos que se empujan sin parar; sólo contorno. | Lo cubre (33–45 %). | Paja sobre marrón negro; trazos de una celda. | μ, σ, vista. | fondos/organicas, tipo/texturas | «Repoblar» activado (no llega a actuar: ya era continuo); contrato continuo. |
| `enjambre` | Enjambre | continuo | Manchas (μ 0,12, σ 0,012, R 13) que se rompen en bacilos y anillos pequeños que se arremolinan en corrientes por todo el campo. | Lo cubre (17–19 %) con figuras pequeñas pero cerradas. | Verde menta sobre negro. | μ, σ, radio. | fondos/vivas, fondos/organicas | Nuevo fondo de Lenia con organismos legibles. |

Fondo frente a figura: «Sopa primordial» y «Enjambre» son fondos (llenan el lienzo); «Nadadores» y «Anillos que nadan» son figuras repartidas (arte/organicas), no fondos; «Colonia» es una construcción.

### Autómatas celulares (`automata`, v1)

| ID | Nombre | Contrato | Apariencia y mecanismo | Llena / legibilidad | Paleta, escala, detalle | Controles efectivos | Usos | Cambio |
|---|---|---|---|---|---|---|---|---|
| `vida` | Vida clásica | construcción | Conway B3/S23 desde una sopa al 30 %: se apaga en islas, osciladores y planeadores (3–4 % a los 10 min). | Ceniza dispersa al final. Celdas de 1 glifo. | Verde menta, estela corta. | regla, densidad, velocidad, estela. | arte/geometricas, terminal/consola | Contrato honesto: construcción (la sonda lo daba por vivo por los parpadeadores). |
| `cerebro` | Chispas (antes «Cerebro») | continuo | Brian's Brain B2/S/3 con lluvia leve (0,6): chispas que viajan y se reencienden. | 8–22 %, nunca vacío. Antes se extinguía a 64 filas (0–2 % a los 10 min). | Lila; estela corta. | velocidad, ritmo de renovación. | fondos/vivas, terminal/consola | Lluvia de semillas. |
| `diaynoche` | Continentes (antes «Día y noche») | construcción | B3678/S34678, bordes continuos: continentes que se redondean y lagos que se cierran hasta casi detenerse. | A 64 filas: continentes al 57–63 % en dos de tres semillas; la otra se apaga (1 %). A 32 filas el campo se llena entero. | Azul pálido. | densidad, bordes. | arte/geometricas, terminal/consola | Bordes «Cerrados» → «Continuos» (con bordes cerrados siempre se extinguía); el final depende de la semilla y se dice en `doc.time`. |
| `pasadizos` | Pasadizos | construcción | Laberinto B3/S12345 desde un cuadro central; termina en ~30 s y se queda quieto. | 50–55 %; pasillos de una celda. | Amarillo pálido sin estela. | densidad, siembra. | arte/geometricas, terminal/consola | Conservado como construcción. |
| `pasillos` | Pasillos que se rehacen | continuo | La misma regla de laberinto con «Banda»: un frente vertical cruza el campo cada ~33 s sembrando una franja que la regla vuelve a trazar; la estela marca el frente. | 56–57 %, cambio constante 1,4–1,9 %. | Azul acero. | ritmo de renovación (velocidad del frente), densidad. | fondos/geometricas, terminal/consola, tipo/texturas | Nuevo: versión continua de Pasadizos. |
| `vida_lluvia` | Vida que no se apaga | continuo | Conway con lluvia de semillas: cada gota despierta una reacción que se calma en islas y planeadores. | 13–26 %, nunca ceniza. | Ámbar; estela larga. | ritmo de renovación, estela. | fondos/vivas, terminal/consola | Nuevo: versión continua de Vida clásica. |

### Physarum (`physarum`, v1)

| ID | Nombre | Contrato | Apariencia y mecanismo | Llena / legibilidad | Paleta, escala, detalle | Controles efectivos | Usos | Cambio |
|---|---|---|---|---|---|---|---|---|
| `venacion` | Venación | continuo | Agentes de Jones desde un disco: un nudo central que extiende venas hasta cubrir el campo con una red de celdas grandes. | 32–43 %; venas de 2–3 celdas. | Lima sobre verde negro; brillo logarítmico. | ángulo, alcance, depósito, evaporación. | fondos/organicas, arte/organicas | Conservado (sigue cambiando 2,2 % a los 10 min). |
| `membrana` | Membrana | continuo | Espuma de celdas cerradas de paredes brillantes que se reacomoda. | 40 % a los 10 min (82 % al principio: se engrosa). | Coral sobre granate oscuro. | ángulo, giro, población. | fondos/organicas | Conservado. |
| `red` | Red eléctrica | continuo | Pocos agentes que miran lejos: hilos largos entre grandes celdas vacías. | 33–41 %; hilos gruesos con halo. | Azul eléctrico. | alcance, paso, evaporación. | fondos/geometricas, fondos/organicas | Conservado. |
| `meandros` | Meandros | continuo | Venas finas y sinuosas con puntas sueltas; renovación 0,4. | 43–45 % estable (antes bajaba al 17–22 % a los 10 min). | Lila. | renovación, ángulo. | fondos/organicas, tipo/texturas | Renovación de agentes. |
| `rehecha` | Red que se rehace | continuo | Malla fina de celdas desde agentes al azar con renovación 0,3: unas paredes se desvanecen mientras se trazan otras. | 57–73 %, cambio 4–5 %. Un grano leve de agentes recién llegados dentro de las celdas. | Verde agua. | renovación, población. | fondos/organicas, tipo/texturas | Nuevo. |

### Osciladores acoplados (`kuramoto`, v2)

| ID | Nombre | Contrato | Apariencia y mecanismo | Llena / legibilidad | Paleta, escala, detalle | Controles efectivos | Usos | Cambio |
|---|---|---|---|---|---|---|---|---|
| `remolinos` | Remolinos de fase | continuo | Kuramoto–Sakaguchi (desfase 0,8) desde vórtices sembrados: espirales que giran, vista de fase (degradado). | 76–87 %; degradados suaves, se leen como espirales de densidad. | Azul pálido. | acoplamiento, desfase, vecindad. | fondos/ondas | Rejilla fija (igual a 48 y a 192 filas). |
| `sincronizado` | Ondas que cruzan (antes «Campo sincronizado») | continuo | Ondas planas enrolladas en el toro que lo recorren mientras todo late. | 79–80 %; bandas anchas. | Verde limón. | frecuencia, desfase. | fondos/ondas | Nombre visual. |
| `destellos` | Destellos | continuo | Cada oscilador destella al cerrar su vuelta: frentes de luz que barren la oscuridad. | 41–80 %. Antes, a 48 filas, todo el campo destellaba a la vez (100 %). | Oro sobre negro. | acoplamiento, diversidad. | fondos/vivas | Rejilla fija: a 48 filas ya no se sincroniza entero (67 %). |
| `turbulencia` | Turbulencia | continuo | Mucho desfase: vórtices que nacen y se aniquilan, sobre la fase atenuada. | 53–78 %; cada vórtice es ahora un disco de ~3 nodos (antes, un punto de 2 × 2 nodos que no llegaba a un glifo). | Rosa. | desfase, acoplamiento. | fondos/vivas | Marcas de vórtice legibles (v2). |
| `espirales` | Espirales de luz | continuo | Las espirales de «Remolinos» con la vista «Frentes»: una línea fina y brillante por vuelta que gira sobre fondo oscuro. | 38–51 %; brazos de 1–2 glifos, muy legibles. | Cian sobre negro. | acoplamiento, desfase, vista. | fondos/ondas, arte/curvas, terminal/consola | Nuevo (vista «Frentes»). |

## Actividad medida (sonda temporal)

Cada fila: la resolución por defecto con sus semillas (intervalo entre semillas) y la última muestra a la resolución mínima y a la máxima. «ms/s» es el coste que midió la sonda con la máquina compartida por varios agentes (carga 4–8 en 4 núcleos); la medida en reposo está en «Coste». Reacción–difusión «después»: los presets de construcción con una semilla.

### Reacción–difusión

Antes (`6702598`):

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reaccion_difusion/coral | 96 | 3 | m6.2 l18 | m0.1 l82 | m0.9 l83 | m0.0 l81 | m0.0 l81 | 64: m0.0 l81 @60s | 256: m0.6 l81 @30s | 245 | 64: 3/3 96: 3/12 |
| reaccion_difusion/mitosis | 96 | 3 | m6.0–9.9 l22–27 | m0.2–0.3 l44–45 | m0.1–0.4 l44–45 | m0.0–0.6 l44–45 | m0.0–0.0 l44–45 | 64: m0.0 l44 @60s | 256: m0.3 l44 @30s | 196 | 96: 2/12 |
| reaccion_difusion/laberinto | 96 | 3 | m0.0–13.9 l99–100 | m0.0–0.5 l99–100 | m0.0–0.2 l98–100 | m0.0–0.2 l98–100 | m0.0–0.1 l99–100 | 64: m0.2 l100 @60s | 256: m0.4 l98 @30s | 195 | 64: 3/3 96: 12/12 256: 2/2 |
| reaccion_difusion/caos | 96 | 3 | m28.6–30.9 l73–77 | m28.0–30.6 l68–77 | m29.2–32.6 l63–76 | m29.5–31.3 l55–68 | m30.1–33.8 l57–63 | 64: m32.6 l62 @60s | 256: m31.0 l68 @30s | 185 | — |

Después:

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reaccion_difusion/coral | 96 | 1 | m6.2 l18 | m0.1 l82 | m0.9 l83 | m0.0 l81 | m0.0 l81 | 64: m0.9 l85 @60s | 256: m0.1 l83 @30s | 208 | 96: 1/4 |
| reaccion_difusion/mitosis | 96 | 1 | m6.0 l27 | m0.3 l44 | m0.4 l44 | m0.0 l44 | m0.0 l44 | 64: m0.3 l45 @60s | 256: m0.3 l45 @30s | 161 | 96: 1/4 |
| reaccion_difusion/laberinto | 96 | 1 | m15.0 l98 | m0.4 l99 | m0.4 l99 | m0.1 l99 | m0.2 l99 | 64: m0.4 l99 @60s | 256: m0.4 l99 @30s | 166 | 64: 3/3 96: 4/4 256: 2/2 |
| reaccion_difusion/isla | 96 | 3 | m5.2–5.8 l17–18 | m0.9–1.3 l31–35 | m0.3–0.3 l16–18 | m0.6–1.7 l24–26 | m1.1–1.1 l24–26 | 64: m0.3 l16 @60s | 256: m0.9 l31 @30s | 308 | — |
| reaccion_difusion/coral_vivo | 96 | 3 | m7.0–10.3 l77–79 | m0.7–1.0 l82–83 | m0.6–1.1 l82–83 | m0.7–1.1 l82–83 | m0.7–0.8 l82–83 | 64: m0.5 l83 @60s | 256: m0.9 l83 @30s | 335 | — |
| reaccion_difusion/laberinto_vivo | 96 | 3 | m14.2–19.3 l65–77 | m2.1–2.7 l70–76 | m2.1–2.4 l72–75 | m2.3–2.6 l72–77 | m1.6–2.3 l70–74 | 64: m2.2 l76 @60s | 256: m2.1 l71 @30s | 380 | — |
| reaccion_difusion/celulas | 96 | 3 | m4.1–8.9 l37–52 | m2.6–3.6 l41–52 | m2.6–4.6 l35–51 | m2.2–2.4 l30–42 | m2.4–3.2 l31–52 | 64: m2.6 l35 @60s | 256: m3.3 l45 @30s | 219 | — |
| reaccion_difusion/corrientes | 96 | 3 | m12.3–17.8 l33–60 | m2.0–2.1 l71–75 | m1.2–2.1 l73–74 | m1.5–1.9 l73–75 | m1.6–3.3 l69–74 | 64: m1.2 l75 @60s | 256: m2.1 l76 @30s | 196 | — |
| reaccion_difusion/caos | 96 | 3 | m11.2–17.9 l56–65 | m12.5–17.7 l60–74 | m12.0–18.3 l54–70 | m13.3–15.8 l66–69 | m10.0–15.2 l58–73 | 64: m11.7 l55 @60s | 256: m17.3 l70 @30s | 27 | — |

### Lenia

Antes (`6702598`):

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lenia/orbium | 128 | 3 | m3.3–3.3 l5–5 | m1.6–3.4 l2–5 | m1.6–2.5 l2–4 | m0.0–1.7 l0–2 | m0.0–1.6 l0–2 | 64: m3.3 l5 @60s | 256: m0.8 l1 @30s | 62 | 128: 3/12 256: 2/2 |
| lenia/colonia | 128 | 3 | m10.2–12.3 l18–21 | m0.2–0.3 l17–17 | m0.2–0.2 l17–17 | m0.1–0.2 l17–18 | m0.2–0.2 l17–18 | 64: m0.0 l0 @60s | 256: m0.2 l17 @30s | 50 | 64: 3/3 |
| lenia/anulares | 128 | 3 | m1.0–1.1 l4–5 | m1.3–1.3 l5–5 | m0.5–1.3 l3–5 | m0.1–0.4 l1–3 | m0.0–0.4 l1–2 | 64: m1.7 l6 @60s | 256: m0.3 l1 @30s | 55 | 128: 5/12 256: 2/2 |
| lenia/sopa | 128 | 3 | m4.2–4.8 l45–45 | m0.9–1.6 l43–44 | m1.0–1.3 l42–43 | m0.9–1.0 l42–43 | m0.7–0.9 l42–43 | 64: m0.8 l43 @60s | 256: m1.2 l43 @30s | 52 | — |

Después:

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lenia/orbium | 128 | 3 | m3.4–3.4 l5–5 | m3.4–3.5 l5–5 | m3.4–3.4 l5–5 | m3.4–3.4 l5–5 | m3.4–3.5 l5–5 | 64: m3.4 l5 @60s | 256: m3.5 l5 @30s | 49 | — |
| lenia/colonia | 128 | 3 | m10.2–12.3 l18–21 | m0.2–0.3 l17–17 | m0.2–0.2 l17–17 | m0.1–0.2 l17–18 | m0.2–0.2 l17–18 | 64: m0.2 l17 @60s | 256: m0.1 l17 @30s | 79 | — |
| lenia/anulares | 128 | 3 | m0.8–1.0 l3–3 | m0.9–1.1 l3–3 | m0.3–0.9 l3–3 | m0.2–1.2 l3–3 | m0.8–1.0 l3–3 | 64: m0.9 l3 @60s | 256: m0.9 l3 @30s | 85 | — |
| lenia/sopa | 128 | 3 | m4.2–4.8 l45–45 | m0.9–1.6 l43–44 | m1.0–1.3 l42–43 | m0.9–1.0 l42–43 | m0.7–0.9 l42–43 | 64: m1.0 l43 @60s | 256: m0.4 l33 @30s | 116 | — |
| lenia/enjambre | 128 | 3 | m9.6–14.4 l18–26 | m0.9–1.1 l19–19 | m0.9–1.1 l18–19 | m0.8–0.9 l18–19 | m0.8–0.9 l18–19 | 64: m0.9 l19 @60s | 256: m0.2 l17 @30s | 116 | — |

### Autómatas celulares

Antes (`6702598`):

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| automata/vida | 64 | 3 | m21.2–22.7 l32–34 | m4.5–8.5 l9–15 | m2.9–6.7 l7–12 | m0.8–7.9 l4–14 | m0.3–0.6 l3–4 | 32: m6.0 l9 @60s | 192: m6.5 l11 @30s | 1 | — |
| automata/cerebro | 64 | 3 | m9.1–12.1 l14–19 | m6.4–12.8 l8–20 | m3.1–13.2 l5–21 | m1.4–6.6 l2–10 | m0.4–1.4 l0–2 | 32: m1.8 l3 @60s | 192: m7.8 l11 @30s | 1 | 64: 3/12 |
| automata/diaynoche | 64 | 3 | m25.2–28.7 l69–73 | m2.8–3.7 l25–32 | m1.8–2.1 l12–19 | m0.8–3.1 l4–16 | m0.2–0.2 l1–1 | 32: m0.2 l1 @60s | 192: m3.6 l35 @30s | 1 | 32: 3/3 64: 3/12 |
| automata/pasadizos | 64 | 3 | m2.1–3.1 l10–11 | m0.0 l50–53 | m0.0 l50–53 | m0.0 l50–53 | m0.0 l50–53 | 32: m0.0 l55 @60s | 192: m1.2 l37 @30s | 1 | 32: 3/3 64: 12/12 |

Después:

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| automata/vida | 64 | 3 | m21.2–22.7 l32–34 | m4.5–8.5 l9–15 | m2.9–6.7 l7–12 | m0.8–7.9 l4–14 | m0.3–0.6 l3–4 | 32: m6.0 l9 @60s | 192: m6.5 l11 @30s | 2 | — |
| automata/cerebro | 64 | 3 | m9.4–13.9 l15–22 | m5.5–7.1 l8–11 | m6.6–12.0 l10–20 | m8.0–9.0 l11–13 | m11.2–13.4 l17–19 | 32: m5.2 l6 @60s | 192: m11.2 l17 @30s | 1 | — |
| automata/diaynoche | 64 | 3 | m27.9–29.8 l74–79 | m3.8–4.6 l19–58 | m0.9–4.5 l4–60 | m0.2–2.8 l1–63 | m0.2–1.0 l1–57 | 32: m0.0 l100 @60s | 192: m4.1 l57 @30s | 2 | 32: 1/3 64: 2/12 |
| automata/pasadizos | 64 | 3 | m2.1–3.1 l10–11 | m0.0 l50–53 | m0.0 l50–53 | m0.0 l50–53 | m0.0 l50–53 | 32: m0.0 l55 @60s | 192: m1.2 l37 @30s | 2 | 32: 3/3 64: 12/12 |
| automata/pasillos | 64 | 3 | m1.5–1.6 l56–57 | m1.4–1.5 l56–57 | m1.6–1.7 l56–57 | m1.8–1.9 l56–56 | m1.4–1.6 l57–57 | 32: m2.1 l56 @60s | 192: m1.1 l56 @30s | 4 | — |
| automata/vida_lluvia | 64 | 3 | m17.3–20.2 l48–55 | m6.0–10.1 l17–26 | m4.8–7.0 l13–20 | m7.3–9.2 l20–25 | m5.4–6.8 l15–19 | 32: m3.1 l10 @60s | 192: m10.7 l28 @30s | 4 | — |

### Physarum

Antes (`6702598`):

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| physarum/venacion | 96 | 3 | m3.3–4.2 l33–39 | m2.6–3.2 l38–43 | m2.2–2.6 l32–43 | m2.4–2.5 l38–42 | m2.2–2.3 l37–38 | 48: m2.4 l48 @60s | 192: m2.6 l29 @30s | 27 | — |
| physarum/membrana | 96 | 3 | m5.1–6.0 l82–85 | m4.0–4.4 l61–64 | m3.9–4.0 l57–60 | m3.3–3.7 l51–53 | m2.9–3.0 l40–41 | 48: m4.0 l59 @60s | 192: m4.2 l64 @30s | 47 | — |
| physarum/red | 96 | 3 | m4.0–8.5 l49–63 | m1.0–1.1 l34–34 | m0.8–0.9 l33–33 | m1.7–2.0 l33–40 | m1.3–2.8 l35–41 | 48: m1.9 l49 @60s | 192: m1.2 l30 @30s | 24 | — |
| physarum/meandros | 96 | 3 | m3.5–3.9 l46–49 | m1.7–1.8 l30–33 | m1.4–1.8 l25–31 | m1.2–1.6 l22–28 | m0.8–1.2 l17–22 | 48: m1.3 l26 @60s | 192: m1.9 l29 @30s | 23 | — |

Después:

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| physarum/venacion | 96 | 3 | m3.3–4.2 l33–39 | m2.6–3.2 l38–43 | m2.2–2.6 l32–43 | m2.4–2.5 l38–42 | m2.2–2.3 l37–38 | 48: m2.4 l48 @60s | 192: m2.6 l29 @30s | 24 | — |
| physarum/membrana | 96 | 3 | m5.1–6.0 l82–85 | m4.0–4.4 l61–64 | m3.9–4.0 l57–60 | m3.3–3.7 l51–53 | m2.9–3.0 l40–41 | 48: m4.0 l59 @60s | 192: m4.2 l64 @30s | 50 | — |
| physarum/red | 96 | 3 | m4.0–8.5 l49–63 | m1.0–1.1 l34–34 | m0.8–0.9 l33–33 | m1.7–2.0 l33–40 | m1.3–2.8 l35–41 | 48: m1.9 l49 @60s | 192: m1.2 l30 @30s | 24 | — |
| physarum/meandros | 96 | 3 | m4.5–4.7 l49–54 | m3.4–3.9 l43–44 | m3.5–4.1 l43–45 | m3.5–3.6 l42–44 | m3.3–3.4 l44–45 | 48: m3.1 l38 @60s | 192: m3.6 l44 @30s | 23 | — |
| physarum/rehecha | 96 | 3 | m5.8–6.9 l71–73 | m4.7–5.2 l57–62 | m4.7–5.2 l63–63 | m4.2–5.4 l58–66 | m4.3–4.9 l58–62 | 48: m5.1 l58 @60s | 192: m4.2 l59 @30s | 34 | — |

### Osciladores acoplados

Antes (`6702598`):

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kuramoto/remolinos | 96 | 3 | m14.9–15.2 l80–87 | m14.5–15.9 l76–85 | m14.4–17.0 l80–85 | m16.0–17.0 l81–82 | m16.1–16.7 l81–83 | 48: m16.3 l75 @60s | 192: m15.4 l82 @30s | 6 | — |
| kuramoto/sincronizado | 96 | 3 | m24.6–25.0 l80–80 | m24.7–25.0 l79–80 | m24.7–25.3 l79–80 | m24.8–25.0 l80–80 | m24.8–24.9 l79–80 | 48: m25.1 l80 @60s | 192: m24.7 l79 @30s | 12 | — |
| kuramoto/destellos | 96 | 3 | m11.1–33.0 l41–80 | m18.3–25.0 l54–61 | m17.0–25.7 l42–70 | m15.3–21.0 l50–55 | m18.2–20.4 l53–58 | 48: m27.7 l100 @60s | 192: m20.6 l55 @30s | 13 | 48: 1/3 |
| kuramoto/turbulencia | 96 | 3 | m8.2–9.8 l54–72 | m6.4–9.5 l60–67 | m7.7–10.8 l47–61 | m6.0–9.3 l57–65 | m7.5–11.9 l60–62 | 48: m9.0 l57 @60s | 192: m9.5 l62 @30s | 8 | — |

Después:

| preset | res | seeds | 0 s | 30 s | 60 s | 120 s | 600 s | mín. (último) | máx. (último) | ms/s | fallos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kuramoto/remolinos | 96 | 3 | m14.9–15.2 l80–87 | m14.5–15.9 l76–85 | m14.4–17.0 l80–85 | m16.0–17.0 l81–82 | m16.1–16.7 l81–83 | 48: m15.0 l79 @60s | 192: m14.6 l76 @30s | 16 | — |
| kuramoto/sincronizado | 96 | 3 | m24.6–25.0 l80–80 | m24.7–25.0 l79–80 | m24.7–25.3 l79–80 | m24.8–25.0 l80–80 | m24.8–24.9 l79–80 | 48: m25.4 l79 @60s | 192: m24.9 l79 @30s | 13 | — |
| kuramoto/destellos | 96 | 3 | m11.1–33.0 l41–80 | m18.3–25.0 l54–61 | m17.0–25.7 l42–70 | m15.3–21.0 l50–55 | m18.2–20.4 l53–58 | 48: m27.0 l67 @60s | 192: m25.1 l53 @30s | 17 | — |
| kuramoto/turbulencia | 96 | 3 | m10.2–11.4 l61–78 | m7.5–11.1 l64–73 | m9.7–13.4 l53–70 | m7.5–11.7 l60–70 | m8.9–14.8 l67–71 | 48: m14.1 l66 @60s | 192: m11.1 l73 @30s | 19 | — |
| kuramoto/espirales | 96 | 3 | m10.1–17.9 l29–51 | m14.9–15.6 l41–45 | m15.0–16.5 l43–47 | m13.7–17.0 l38–50 | m14.3–16.0 l40–45 | 48: m16.4 l40 @60s | 192: m15.0 l40 @30s | 14 | — |

## Coste (A-10)

Medido en reposo con `.cache/bench2.ts` (Node, a la resolución por defecto de cada preset, ms por paso × pasos por segundo × velocidad de la capa del preset); el presupuesto es ≲ 250 ms por segundo simulado.

| Familia | Presets | ms por segundo simulado |
|---|---|---|
| Reacción–difusión | coral 166, células que se dividen 158, laberinto 158, caos 92 (capa a 0,15: 27 en la sonda), coral que respira 155, laberinto que se rehace 189, células sin fin 197, corrientes 207, isla 206 | 92–207 |
| Lenia | nadadores 40, colonia 48, anillos 39, sopa 47, enjambre 51 | 39–51 |
| Autómatas | todos | 1–2 |
| Physarum | venación 18, membrana 40, red 15, meandros 15, red que se rehace 20 | 15–40 |
| Osciladores | remolinos 4, ondas 4, destellos 8, turbulencia 8, espirales 5 | 4–8 |

Mejoras: reacción–difusión a 256 filas pasa de 1082 ms (v1, rejilla = raster) a 160 ms (v2, rejilla fija) por segundo simulado; Lenia ya no baja de 128 filas (a 64 costaba menos, pero no vivía); los osciladores a 192 filas pasan de una rejilla de 192 × 96 a una de 96 × 48. El mapa vivo añade ~20–25 % al paso de reacción–difusión (una reconstrucción del mapa cada 20 pasos y la eliminación leída por celda). Intenté acelerar el paso de Gray–Scott sin cambiar su aritmética (funciones de módulo con los búferes como argumentos, columnas interiores sin tablas de vecinos): no hubo ganancia medible y lo dejé en la forma más simple.

## Paridad entre motores

`npx vite --port 5237` y `node scripts/families-qa.mjs --url=http://localhost:5237 --ids=reaccion_difusion,physarum,lenia,automata,kuramoto --compare`: 30 presets sin errores, `r = 1,0000` en todos (glifos idénticos 99,9–100 %, tinta igual en los dos motores). Dos avisos 403 de un recurso externo de la página de pruebas, ajenos a las familias.

## Verificación

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{reaccion_difusion,physarum,lenia,automata,kuramoto}.test.ts`: 7 archivos, 303 pruebas en verde. Pruebas nuevas: rejilla fija y versión 1 conservada (reacción–difusión, Lenia, osciladores), contrato temporal de cada preset y que los usos `fondos/*` sólo vayan a presets continuos, restauración exacta con mapa, heridas, lluvia, banda, renovación de agentes y repoblado, una herida vacía un claro y siembra su centro, «Repoblar» devuelve la vida a un campo vacío, Colonia ya no queda negra a 64 filas, y una prueba corta por preset continuo (sigue cambiando, ni vacío ni lleno).
- `INERT` en `families.test.ts`: `amp` y `drift` de reacción–difusión (sólo cuentan con un mapa vivo), `renewRate` de autómatas (sólo con renovación) y `renew` de Lenia (sólo actúa cuando la materia cae a la mitad; en la prueba corta no pasa).

## Cambios compartidos que harían falta (no hechos)

1. **Generador versión 6** (`src/random/families6.ts`): elige `rng.pick(meta.presets)` de la lista viva y construye la capa con `famFor` (versión actual y todos los parámetros). Cualquier preset, parámetro o versión nuevos cambian las tiradas publicadas: `tests/unit/generator-versions.test.ts` falla en `arte/faro-v6-603` (Lenia: ahora hay cinco presets, el parámetro `renew` y la versión 2). Afecta a todos los grupos de esta revisión. Propuesta: que la versión 6 lea una copia congelada de la tabla de presets publicada (id, parámetros y versión de familia 1 de los 86 presets, la misma que guarda `tests/unit/fixtures/families-v1.json`) o pasar a la versión 7 del generador con la lista nueva.
2. **Pista de la resolución** (`src/studio/ui/FamilyControls.tsx`): dice «Más filas: más detalle y más trabajo». En reacción–difusión y osciladores (v2) más filas sólo afinan el dibujo de la misma simulación y cuestan casi lo mismo; en Lenia, por debajo de 128 filas se dibujan 128. Haría falta una pista por familia (un campo opcional en `FamilyMeta`, p. ej. `resHint`, que cambiaría `types.ts`) o una frase genérica («Más filas: dibujo más fino; en algunas familias también más detalle y más trabajo»).
3. **Contrato por más de un parámetro** (`TimeRule` en `types.ts`): sólo mira un parámetro. En autómatas y Lenia el contrato depende de la regla y de la renovación a la vez; lo resolví con la renovación como clave (sin ella, construcción), pero así una regla que nunca se calma sin renovación (Cerebro en un campo grande) se marcaría como construcción. Los presets son honestos; las combinaciones libres, aproximadas.

## Lo que no quedó resuelto

- **Continentes (Día y noche)**: con bordes continuos, a 64 filas dos de tres semillas dejan continentes estables (57–63 %) y una se apaga (1 %); a 32 filas el campo se llena entero (100 %). Es una construcción y su texto lo dice, pero el final depende de la semilla. Probé lluvia de semillas para hacerlo continuo: seguía cayendo a todo encendido o casi vacío según la semilla, así que no lo ofrezco como fondo.
- **Pasadizos, Vida clásica, Coral químico, Células que se dividen, Laberinto y Colonia** siguen terminando (contrato «construcción»): la sonda marca sus muestras quietas como fallo, por definición. Cada uno tiene su versión continua salvo Colonia (Lenia no tiene un régimen que llene el campo y siga cambiando con esas manchas; «Enjambre» ocupa ese lugar como fondo).
- **Lenia a 256 filas**: «Sopa primordial» y «Enjambre» cambian menos a los 30 s que a 128 (`m` 0,4 y 0,2 frente a 0,9–1,0) con la misma ocupación; la sonda sólo mide 30 s a la máxima y no pude comprobar si se igualan más tarde.
- **Nadadores y Anillos que nadan** ocupan un 5 % y un 3 % del lienzo: son figuras repartidas, no fondos, y así están clasificados. Con σ 0,015 (el Orbium clásico) los bancos estallaban en gusanos; con 0,0145 son estables diez minutos con tres semillas, pero no probé todas las combinaciones de radio y densidad que permite el panel.
- **Red que se rehace** deja un grano leve de agentes recién llegados dentro de las celdas.
- **Coral que respira** cambia despacio (≈1 % por medio segundo) y es claro en un 82 %: un fondo tranquilo; quien lo quiera más oscuro tiene la vista «Contorno».
