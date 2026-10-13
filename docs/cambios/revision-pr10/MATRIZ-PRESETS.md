# Matriz de familias y presets (revisión del PR #10 y su cierre)

Generada por `scripts/families-matrix.ts` desde las fichas de las familias (`src/families/meta/*.ts`), la referencia de los 86 presets publicados antes de esta revisión (`tests/unit/fixtures/families-v1.json`) y una ejecución de la sonda temporal (`scripts/families-time.ts --seeds=1 --res=def --times=0,30,60,120 --long=600`, Node, sin navegador). No se edita a mano.

- **64 familias** (23 de antes y 41 nuevas) y **326 presets** (86 de antes, con su id, y 240 nuevos).
- Contrato temporal: 223 continuos (∞), 64 en bucle exacto (↻) y 39 construcciones (▣).
- **Actividad**: por cada momento, el % medio de cambio del campo en el medio segundo siguiente (para las simulaciones, con la cámara quieta: el estado) y el % del campo con tinta. Una construcción termina quieta por definición (cambio 0 al final); un fondo lento está bien si sigue cambiando. Mide cambio y ocupación del campo que los motores convierten en glifos: no mide belleza ni fotogramas por segundo en un dispositivo real. Las analíticas se muestrean en 96 × 48 con la escala de su capa.
- **Usos**: dónde lo ofrece la biblioteca (`espacio/sección`); el mismo preset puede estar en varios espacios con el mismo id. **Figura**: se dibuja en el centro (en lienzos verticales se ajusta al ancho); Fondos sólo ofrece lo que no lo es.
- Las decisiones, el antes y el después y lo que quedó sin resolver de cada grupo están en `docs/cambios/revision-familias/` (revisión) y `docs/cambios/cierre-pr10/` (cierre).

### Reacción–difusión (`reaccion_difusion`) — Vida y química, simulación, versión 2

También: Gray–Scott, Gray-Scott, reacción difusión, reaction–diffusion, patrones de Turing, Pearson.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `coral` | Coral químico | coral growth | ▣ Construcción | arte/organicas | no | 6,2 · 18,4 / 0,10 · 82,4 / 0,87 · 83,3 / 0,00 · 80,8 / 0,00 · 80,8 |
| `mitosis` | Células que se dividen | Mitosis | ▣ Construcción | arte/organicas | no | 6,0 · 27,1 / 0,33 · 44,0 / 0,35 · 44,2 / 0,05 · 44,3 / 0,00 · 44,3 |
| `laberinto` | Laberinto | huella dactilar, maze | ▣ Construcción | arte/organicas, tipo/texturas | no | 15,0 · 97,9 / 0,41 · 99,0 / 0,41 · 98,6 / 0,12 · 99,0 / 0,19 · 99,3 |
| `caos` | Caos que respira | caos, chaos | ∞ Continuo | fondos/vivas | no | 11,2 · 56,0 / 17,7 · 68,7 / 12,0 · 54,1 / 15,8 · 68,9 / 10,0 · 58,1 |
| `coral_vivo` (nuevo) | Coral que respira | coral continuo, heridas que sanan | ∞ Continuo | fondos/organicas, tipo/texturas | no | 10,3 · 77,5 / 1,3 · 81,2 / 2,2 · 81,5 / 1,4 · 81,2 / 1,8 · 81,7 |
| `laberinto_vivo` (nuevo) | Laberinto que se rehace | laberinto continuo, mareas | ∞ Continuo | fondos/organicas, tipo/texturas | no | 15,4 · 66,7 / 2,1 · 70,6 / 2,2 · 75,4 / 2,6 · 72,2 / 1,6 · 73,9 |
| `celulas` (nuevo) | Células sin fin | mitosis continua | ∞ Continuo | fondos/vivas | no | 8,9 · 36,7 / 3,3 · 43,7 / 2,6 · 35,0 / 2,4 · 35,4 / 2,4 · 34,5 |
| `corrientes` (nuevo) | Corrientes de puntos | franjas, gradiente de Pearson | ∞ Continuo | fondos/organicas | no | 12,3 · 59,6 / 2,1 · 74,9 / 1,2 · 73,6 / 1,5 · 73,1 / 1,6 · 74,4 |
| `isla` (nuevo) | Isla que respira | isla, máscara | ∞ Continuo | arte/organicas | no | 5,2 · 17,5 / 0,93 · 31,0 / 0,34 · 16,2 / 0,63 · 26,4 / 1,1 · 25,7 |

### Physarum (`physarum`) — Vida y química, simulación, versión 1

También: Physarum, moho mucilaginoso, slime mould, Jeff Jones, red de transporte.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `venacion` | Venación | — | ∞ Continuo | fondos/organicas, arte/organicas | no | 3,3 · 33,3 / 2,8 · 40,4 / 2,2 · 36,0 / 2,4 · 40,9 / 2,2 · 37,9 |
| `membrana` | Membrana | espuma | ∞ Continuo | fondos/organicas | no | 5,1 · 81,6 / 4,0 · 64,2 / 4,0 · 57,6 / 3,7 · 53,2 / 2,9 · 40,7 |
| `red` | Red eléctrica | — | ∞ Continuo | fondos/geometricas, fondos/organicas | no | 6,5 · 57,7 / 1,1 · 33,9 / 0,90 · 33,5 / 1,9 · 40,1 / 1,3 · 34,6 |
| `meandros` | Meandros | — | ∞ Continuo | fondos/organicas, tipo/texturas | no | 4,7 · 53,5 / 3,6 · 43,2 / 3,5 · 44,6 / 3,5 · 42,6 / 3,3 · 44,5 |
| `rehecha` (nuevo) | Red que se rehace | red viva, red de transporte | ∞ Continuo | fondos/organicas, tipo/texturas | no | 5,8 · 71,1 / 4,7 · 60,5 / 4,9 · 62,7 / 4,2 · 58,0 / 4,9 · 59,9 |

### Lenia (`lenia`) — Vida y química, simulación, versión 3

También: Lenia, Bert Chan, autómata celular continuo, continuous cellular automaton, vida artificial.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `orbium` | Nadadores | Orbium, banco de criaturas | ∞ Continuo | arte/organicas | no | 3,2 · 12,7 / 3,4 · 13,7 / 3,4 · 13,5 / 3,4 · 13,9 / 3,4 · 13,9 |
| `colonia` | Colonia | — | ▣ Construcción | arte/organicas | no | 12,1 · 21,5 / 0,20 · 17,5 / 0,22 · 17,4 / 0,14 · 17,2 / 0,16 · 17,5 |
| `anulares` | Anillos que nadan | Organismos anulares | ∞ Continuo | arte/organicas | no | 0,70 · 5,3 / 0,85 · 9,0 / 0,75 · 9,6 / 0,90 · 10,3 / 0,84 · 9,5 |
| `sopa` | Sopa primordial | gusanos | ∞ Continuo | fondos/organicas, tipo/texturas | no | 4,4 · 44,6 / 0,91 · 42,7 / 0,96 · 42,6 / 0,95 · 42,6 / 0,87 · 42,4 |
| `enjambre` (nuevo) | Enjambre | bacilos, bacterias | ∞ Continuo | fondos/vivas, fondos/organicas | no | 9,6 · 18,2 / 1,1 · 18,9 / 0,87 · 18,6 / 0,92 · 18,6 / 0,87 · 18,7 |

### Autómatas celulares (`automata`) — Vida y química, simulación, versión 1

También: autómata celular, Juego de la vida, Conway, Life-like, Generations.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `vida` | Vida clásica | Juego de la vida, Conway, Game of Life | ▣ Construcción | arte/geometricas, terminal/consola | no | 21,2 · 32,1 / 8,5 · 14,6 / 2,9 · 7,1 / 0,82 · 4,0 / 0,58 · 4,2 |
| `cerebro` | Chispas | Cerebro, Brian's Brain | ∞ Continuo | fondos/vivas, terminal/consola | no | 9,4 · 14,5 / 5,5 · 8,4 / 10,1 · 16,1 / 9,0 · 12,6 / 13,4 · 19,0 |
| `diaynoche` | Continentes | Día y noche, Day and Night | ▣ Construcción | arte/geometricas, terminal/consola | no | 25,7 · 74,4 / 3,9 · 53,4 / 1,9 · 51,7 / 1,8 · 51,6 / 1,1 · 51,0 |
| `pasadizos` | Pasadizos | laberinto, Maze | ▣ Construcción | arte/geometricas, terminal/consola | no | 2,3 · 9,8 / 0,00 · 49,8 / 0,00 · 49,8 / 0,00 · 49,8 / 0,00 · 49,8 |
| `pasillos` (nuevo) | Pasillos que se rehacen | laberinto continuo, Maze | ∞ Continuo | fondos/geometricas, terminal/consola, tipo/texturas | no | 1,6 · 56,6 / 1,4 · 56,3 / 1,7 · 56,5 / 1,8 · 56,1 / 1,5 · 56,9 |
| `vida_lluvia` (nuevo) | Vida que no se apaga | Juego de la vida, Conway, Game of Life | ∞ Continuo | fondos/vivas, terminal/consola | no | 17,3 · 48,5 / 6,0 · 16,7 / 7,0 · 19,9 / 7,6 · 20,9 / 6,8 · 19,4 |

### Osciladores acoplados (`kuramoto`) — Vida y química, simulación, versión 2

También: Kuramoto, Sakaguchi, osciladores de fase, sincronización, ondas espirales.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `remolinos` | Remolinos de fase | espirales de fase | ∞ Continuo | fondos/ondas | no | 14,9 · 85,6 / 14,5 · 76,4 / 14,4 · 81,1 / 16,0 · 81,3 / 16,1 · 82,8 |
| `sincronizado` | Ondas que cruzan | Campo sincronizado, ondas viajeras | ∞ Continuo | fondos/ondas | no | 24,6 · 80,1 / 24,9 · 79,3 / 25,3 · 79,4 / 24,8 · 79,9 / 24,8 · 78,9 |
| `destellos` | Destellos | luciérnagas | ∞ Continuo | fondos/vivas | no | 11,1 · 41,2 / 25,0 · 53,5 / 25,7 · 69,6 / 19,6 · 52,6 / 20,4 · 52,8 |
| `turbulencia` | Turbulencia | vórtices, defectos de fase | ∞ Continuo | fondos/vivas | no | 10,2 · 60,6 / 11,1 · 73,3 / 13,4 · 69,8 / 10,1 · 70,5 / 14,8 · 70,6 |
| `espirales` (nuevo) | Espirales de luz | ondas espirales, frentes de onda | ∞ Continuo | fondos/ondas, arte/curvas, terminal/consola | no | 16,2 · 48,4 / 14,9 · 40,7 / 15,0 · 43,5 / 17,0 · 49,9 / 16,0 · 44,3 |

### Agregación (DLA) (`dla`) — Vida y química, simulación, versión 2

También: DLA, agregación limitada por difusión, diffusion-limited aggregation, Witten–Sander, dendritas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `cristal` | Cristalización | — | ▣ Construcción | arte/organicas | no | 0,48 · 5,5 / 0,00 · 41,0 / 0,00 · 41,0 / 0,00 · 41,0 / 0,00 · 41,0 |
| `coral` | Arrecife | — | ▣ Construcción | arte/organicas | no | 0,24 · 6,5 / 0,09 · 18,0 / 0,03 · 24,6 / 0,00 · 34,0 / 0,00 · 34,0 |
| `raices` | Raíces eléctricas | — | ▣ Construcción | arte/organicas | no | 0,48 · 11,2 / 0,00 · 41,8 / 0,00 · 41,8 / 0,00 · 41,8 / 0,00 · 41,8 |
| `corona` | Corona | — | ▣ Construcción | arte/organicas | no | 1,0 · 9,5 / 0,00 · 40,1 / 0,00 · 40,1 / 0,00 · 40,1 / 0,00 · 40,1 |
| `colonias` | Colonias | — | ▣ Construcción | arte/organicas, tipo/texturas | no | 0,89 · 11,2 / 0,00 · 45,9 / 0,00 · 45,9 / 0,00 · 45,9 / 0,00 · 45,9 |
| `escarcha` (nuevo) | Escarcha viva | DLA en baño, sublimación, nucleación | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | 2,7 · 10,3 / 5,1 · 52,6 / 2,0 · 50,8 / 2,8 · 42,4 / 0,41 · 35,8 |
| `arrecife` (nuevo) | Arrecife sin fin | DLA desde una línea, dominio que avanza | ∞ Continuo | fondos/organicas, arte/organicas | no | 0,52 · 14,8 / 4,0 · 35,9 / 4,9 · 36,6 / 4,1 · 28,1 / 2,3 · 22,9 |
| `corona_viva` (nuevo) | Corona que respira | DLA en anillo, sublimación | ∞ Continuo | arte/organicas | no | 1,5 · 12,6 / 2,2 · 18,7 / 2,1 · 17,6 / 1,2 · 22,9 / 1,6 · 13,6 |

### Crecimiento diferencial (`crecimiento`) — Vida y química, simulación, versión 1

También: crecimiento diferencial, differential growth, differential line, inconvergent.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `coral` | Coral plegado | — | ▣ Construcción | arte/organicas | no | 1,5 · 8,5 / 0,47 · 28,7 / 0,00 · 28,6 / 0,00 · 28,6 / 0,00 · 28,6 |
| `corteza` | Corteza | — | ▣ Construcción | arte/organicas, tipo/texturas | no | 0,82 · 9,7 / 1,1 · 30,8 / 1,3 · 46,1 / 1,3 · 57,8 / 0,00 · 52,1 |
| `colonia` | Colonia de pliegues | — | ▣ Construcción | arte/organicas, tipo/texturas | no | 2,8 · 7,0 / 2,6 · 25,7 / 2,5 · 38,3 / 0,00 · 44,3 / 0,00 · 44,3 |
| `medusa` | Tentáculos radiales | — | ▣ Construcción | arte/organicas | no | 0,73 · 18,0 / 0,00 · 17,8 / 0,00 · 17,8 / 0,00 · 17,8 / 0,00 · 17,8 |
| `coral_vivo` (nuevo) | Arrecife que se renueva | crecimiento diferencial con renovación, coral plegado | ∞ Continuo | fondos/organicas, tipo/texturas | no | 2,0 · 10,9 / 2,8 · 32,1 / 4,8 · 44,8 / 4,0 · 51,2 / 3,8 · 52,6 |
| `meandros` (nuevo) | Meandros sin fin | crecimiento diferencial con historia, corteza | ∞ Continuo | fondos/organicas, arte/organicas | no | 0,67 · 8,9 / 0,97 · 30,9 / 1,7 · 48,1 / 0,91 · 35,7 / 0,86 · 35,1 |
| `colonia_viva` (nuevo) | Pliegues que se relevan | crecimiento diferencial con renovación, colonia de pliegues | ∞ Continuo | fondos/organicas, arte/organicas | no | 1,8 · 7,1 / 2,9 · 30,4 / 1,5 · 34,7 / 3,3 · 26,4 / 2,6 · 27,1 |

### Fluido 2D (`fluido`) — Física y movimiento, simulación, versión 2

También: Fluidos estables de Stam, Navier–Stokes incompresible, Simulación de fluidos, Tinta, Humo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tinta_agua` | Tinta en agua | Gotas de tinta, Inestabilidad de Rayleigh–Taylor | ∞ Continuo | fondos/organicas, arte/organicas | no | 7,1 · 9,6 / 16,8 · 28,5 / 12,7 · 26,5 / 15,6 · 24,8 / 13,3 · 25,2 |
| `marmol` (nuevo) | Mármol líquido | Marmoleado, Suminagashi, Ebru, Advección de un escalar pasivo | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | 24,7 · 49,7 / 13,6 · 56,9 / 8,8 · 58,2 / 7,5 · 56,1 / 7,3 · 57,5 |
| `manchas` (nuevo) | Manchas de tinta | Dos líquidos que no se mezclan, Allen–Cahn, Separación de fases | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | 33,5 · 60,4 / 29,1 · 50,3 / 28,6 · 64,2 / 30,7 · 49,4 / 32,5 · 58,1 |
| `corriente` (nuevo) | Corriente en capas | Calle de vórtices de Kármán, Flujo en un canal con obstáculos | ∞ Continuo | fondos/organicas, fondos/ondas | no | 19,3 · 63,1 / 23,4 · 64,5 / 23,3 · 68,9 / 23,4 · 68,9 / 24,0 · 64,4 |
| `humo_neon` | Humo de neón | Penacho por flotación | ∞ Continuo | fondos/organicas, arte/organicas | no | 4,6 · 22,4 / 8,1 · 54,3 / 8,1 · 49,1 / 7,6 · 43,0 / 7,5 · 58,1 |
| `humo_curvas` (nuevo) | Humo en curvas de nivel | Isolíneas de concentración | ∞ Continuo | fondos/organicas, arte/curvas, tipo/texturas | no | 7,6 · 12,1 / 19,9 · 20,8 / 14,8 · 19,0 / 12,5 · 17,3 / 14,9 · 19,3 |
| `tormenta` | Tormenta de vórtices | Refuerzo de vorticidad, Turbulencia | ∞ Continuo | fondos/organicas | no | 10,7 · 44,9 / 11,4 · 56,7 / 11,7 · 47,0 / 8,9 · 42,0 / 10,6 · 50,5 |
| `pilares` | Estela entre pilares | Calle de vórtices de Kármán, Vorticidad | ∞ Continuo | fondos/organicas, arte/organicas | no | 9,1 · 34,8 / 9,2 · 45,6 / 8,2 · 39,0 / 8,0 · 42,8 / 8,2 · 38,6 |
| `lazos` (nuevo) | Lazos de tinta | Emisores en órbita, Tinte que traza lazos, Refuerzo de vorticidad | ∞ Continuo | fondos/organicas, arte/organicas | no | 5,3 · 14,3 / 10,5 · 51,3 / 8,3 · 48,8 / 8,8 · 44,2 / 9,1 · 49,0 |
| `chorro` (nuevo) | Chorro sumergido | Chorro turbulento, Inestabilidad de Kelvin–Helmholtz, Capa de cizalla, Dos trazadores | ∞ Continuo | fondos/organicas, arte/organicas | no | 2,7 · 11,3 / 8,8 · 40,1 / 8,1 · 37,5 / 6,8 · 30,8 / 9,1 · 46,0 |

### Agua interactiva (`agua`) — Física y movimiento, simulación, versión 2

También: Ecuación de ondas, Cáusticas, Refracción, Agua.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `piscina` | Piscina con cáusticas | Cáusticas sobre baldosas | ∞ Continuo | fondos/ondas | no | 29,6 · 93,1 / 31,0 · 93,6 / 31,0 · 93,5 / 31,1 · 92,8 / 31,1 · 93,0 |
| `destellos` (nuevo) | Luz bajo el agua | Cáusticas, Red de luz | ∞ Continuo | fondos/ondas, tipo/texturas | no | 36,4 · 62,2 / 41,3 · 65,0 / 40,0 · 65,0 / 41,4 · 64,1 / 42,8 · 63,7 |
| `lluvia` | Lluvia sobre el estanque | Anillos de lluvia | ∞ Continuo | fondos/ondas | no | 18,0 · 50,9 / 18,2 · 51,1 / 17,3 · 51,4 / 17,6 · 49,0 / 17,5 · 50,4 |
| `canal` | Ondas en un canal | Doble rendija, Interferencia, Difracción | ∞ Continuo | fondos/ondas, arte/optica | no | 15,6 · 46,7 / 15,0 · 46,1 / 15,9 · 47,0 / 15,9 · 47,1 / 15,9 · 47,1 |

### Terreno que se erosiona (`erosion`) — Física y movimiento, simulación, versión 2

También: Erosión hidráulica, Erosión térmica, Levantamiento tectónico, Red de drenaje, Mapa de ríos.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `rios` (nuevo) | Mapa de ríos | Red de drenaje, Erosión y levantamiento | ∞ Continuo | fondos/organicas, fondos/materia, tipo/texturas | no | 2,6 · 69,9 / 2,0 · 72,8 / 2,0 · 73,3 / 2,1 · 71,1 / 2,0 · 65,5 |
| `costa` (nuevo) | Costa tallada | Relieve sombreado, Erosión y levantamiento | ∞ Continuo | fondos/materia | no | 2,4 · 61,5 / 2,2 · 71,8 / 2,1 · 74,8 / 2,1 · 77,5 / 1,8 · 74,7 |
| `montana` (nuevo) | Montaña viva | Levantamiento tectónico, Equilibrio dinámico | ∞ Continuo | arte/figuras | sí | 0,37 · 23,6 / 0,28 · 23,8 / 0,31 · 24,1 / 0,34 · 22,6 / 0,32 · 23,2 |
| `barrancos` | Barrancos | Erosión hidráulica | ▣ Construcción | arte/figuras | sí | 0,29 · 23,1 / 0,20 · 23,5 / 0,25 · 22,5 / 0,22 · 23,2 / 0,24 · 23,3 |
| `delta` | Ríos y delta | Sedimentación, Delta fluvial | ▣ Construcción | arte/figuras | sí | 0,29 · 24,3 / 0,21 · 22,5 / 0,17 · 22,5 / 0,30 · 24,2 / 0,32 · 23,7 |
| `mesetas` | Mesetas | Estratos, Terrazas, Erosión térmica | ▣ Construcción | arte/figuras | sí | 0,13 · 20,0 / 0,10 · 21,8 / 0,12 · 20,5 / 0,12 · 20,5 / 0,12 · 20,5 |

### Bandadas (boids) (`boids`) — Física y movimiento, simulación, versión 1

También: Boids, Reynolds, Bandada, Cardumen, Enjambre.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `murmuracion` | Murmuración | Bandada de estorninos | ∞ Continuo | fondos/vivas, fondos/organicas | no | 17,6 · 43,9 / 11,5 · 35,6 / 9,2 · 29,0 / 14,4 · 39,1 / 11,6 · 36,6 |
| `estelas` (nuevo) | Estelas de bandada | Rastros de boids | ∞ Continuo | fondos/vivas, fondos/organicas, arte/curvas | no | 7,9 · 48,2 / 5,7 · 47,0 / 4,9 · 43,4 / 4,5 · 35,6 / 5,8 · 57,5 |
| `cardumen` | Cardumen | Banco de peces, Depredador y presa | ∞ Continuo | fondos/vivas | no | 14,1 · 25,0 / 8,6 · 20,8 / 9,3 · 20,7 / 9,7 · 22,8 / 9,1 · 20,2 |
| `dispersion` | Dispersión | Poca cohesión | ∞ Continuo | fondos/vivas, tipo/texturas | no | 16,4 · 54,9 / 9,5 · 36,9 / 9,3 · 37,8 / 9,0 · 35,9 / 8,8 · 33,9 |

### Gravedad N-cuerpos (`gravedad`) — Física y movimiento, simulación, versión 1

También: N-body, Problema de los N cuerpos, Gravitación de Newton, Galaxia, Ondas de densidad.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `galaxia` | Galaxia espiral | Ondas de densidad, Órbitas de Lindblad, Lin–Shu | ∞ Continuo | arte/figuras | sí | 4,2 · 27,6 / 4,3 · 28,3 / 4,3 · 28,4 / 4,3 · 27,7 / 4,2 · 26,8 |
| `remolino` (nuevo) | Remolino de tres brazos | Galaxia espiral de cerca, Ondas de densidad | ∞ Continuo | fondos/espacio, arte/figuras | no | 7,3 · 38,3 / 7,3 · 39,0 / 7,2 · 40,4 / 7,3 · 39,4 / 7,3 · 38,4 |
| `choque` | Choque de cúmulos | Esferas de Plummer, Fusión de cúmulos | ▣ Construcción | arte/figuras | sí | 3,5 · 14,6 / 2,6 · 14,2 / 3,3 · 17,7 / 3,2 · 16,9 / 2,3 · 10,2 |
| `colapso` | Colapso frío | Colapso gravitatorio, Relajación violenta | ▣ Construcción | arte/figuras | sí | 8,9 · 37,0 / 2,8 · 20,5 / 2,7 · 20,0 / 2,9 · 20,9 / 2,7 · 21,1 |
| `binaria` | Estrella doble con anillo | Disco circumbinario | ∞ Continuo | arte/figuras | sí | 2,7 · 16,9 / 3,8 · 36,3 / 3,6 · 36,5 / 3,5 · 33,8 / 2,6 · 21,0 |

### Telas y cuerpos blandos (`tela`) — Física y movimiento, simulación, versión 2

También: XPBD, Dinámica basada en posiciones, Tela, Simulación de ropa.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `velo` | Velo al viento | Tela colgada de dos esquinas | ∞ Continuo | arte/figuras | sí | 6,8 · 37,0 / 5,3 · 28,0 / 3,6 · 35,1 / 4,2 · 35,6 / 5,2 · 36,2 |
| `bandera` | Bandera | Tela en el mástil | ∞ Continuo | arte/figuras | sí | 5,5 · 25,6 / 4,2 · 19,7 / 4,8 · 22,3 / 6,1 · 29,5 / 5,6 · 26,2 |
| `membrana` | Membrana elástica | Cama elástica, Colisión con una esfera | ∞ Continuo | arte/figuras | sí | 8,3 · 18,3 / 3,1 · 19,0 / 7,7 · 17,6 / 7,9 · 17,8 / 7,9 · 17,4 |
| `malla_cinetica` (nuevo) | Malla cinética | Kinetic grid, Red de muelles, Membrana tensa golpeada | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 13,5 · 74,1 / 17,4 · 74,1 / 18,4 · 74,2 / 14,1 · 74,2 / 14,5 · 74,1 |
| `cojin` (nuevo) | Cojín que respira | Cuerpo blando por presión, Soft body, Restricción de volumen | ∞ Continuo | arte/figuras | sí | 13,4 · 20,0 / 0,42 · 20,8 / 0,90 · 20,4 / 1,6 · 20,7 / 1,1 · 21,0 |

### Chladni y cimática (`chladni`) — Física y movimiento, simulación, versión 2

También: Figuras de Chladni, Cimática, Modos de vibración, Ondas estacionarias.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `arena` (nuevo) | Arena en todo el lienzo | Placa rectangular, Figuras de Chladni | ∞ Continuo | fondos/geometricas, tipo/texturas | no | 2,8 · 28,9 / 1,1 · 18,8 / 2,8 · 21,9 / 1,2 · 19,5 / 2,4 · 19,8 |
| `placa` | Placa resonante | Placa cuadrada, Modo fijo | ▣ Construcción | arte/geometricas | sí | 1,0 · 12,0 / 0,30 · 8,2 / 0,29 · 8,4 / 0,31 · 8,6 / 0,32 · 8,6 |
| `flor` | Flor nodal | Placa circular, Funciones de Bessel | ▣ Construcción | arte/geometricas | sí | 0,35 · 13,3 / 0,20 · 12,9 / 0,20 · 12,9 / 0,19 · 12,9 / 0,14 · 12,8 |
| `mandala` (nuevo) | Mandala de arena | Placa circular con secuencia de modos | ∞ Continuo | arte/geometricas | sí | 0,32 · 13,1 / 0,35 · 7,7 / 1,8 · 14,3 / 0,16 · 13,7 / 2,4 · 14,0 |
| `musical` | Arena musical | Secuencia rápida de modos | ∞ Continuo | arte/geometricas | sí | 0,64 · 9,6 / 0,85 · 9,3 / 1,7 · 10,8 / 2,6 · 7,5 / 1,3 · 7,8 |

### Humo rizado (`humo`) — Física y movimiento, simulación, versión 2 · **nueva**

También: curl noise, ruido rizado, rotacional de ruido, partículas de humo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `espiritu` (nuevo) | Espíritu | espíritu de partículas | ∞ Continuo | arte/figuras, arte/organicas | no | 2,5 · 9,9 / 7,6 · 27,3 / 3,8 · 16,9 / 5,7 · 27,4 / 4,3 · 17,7 |
| `fumarola` (nuevo) | Fumarola | columna de humo | ∞ Continuo | arte/organicas, arte/figuras | no | 1,1 · 3,2 / 2,1 · 14,0 / 3,1 · 16,5 / 2,5 · 13,6 / 2,7 · 17,4 |
| `nebulosa` (nuevo) | Nebulosa rizada | nebulosa de ruido rizado | ∞ Continuo | fondos/espacio, arte/organicas | no | 9,9 · 48,0 / 13,3 · 58,3 / 14,5 · 66,4 / 10,0 · 50,5 / 16,0 · 67,3 |
| `seda` (nuevo) | Hilos de seda | filamentos de ruido rizado | ∞ Continuo | arte/organicas | no | 4,8 · 20,5 / 5,3 · 28,5 / 6,1 · 36,7 / 6,9 · 33,4 / 5,4 · 28,3 |
| `incienso` (nuevo) | Incienso que se enfría | humo coloreado por edad | ∞ Continuo | arte/organicas, arte/figuras | no | 0,81 · 2,5 / 1,8 · 11,8 / 2,1 · 11,3 / 3,3 · 16,6 / 2,1 · 12,4 |
| `aurora` (nuevo) | Aurora de humo | humo coloreado por profundidad | ∞ Continuo | fondos/color, arte/organicas | no | 8,5 · 38,9 / 11,7 · 53,7 / 11,7 · 62,8 / 12,1 · 64,5 / 10,6 · 53,1 |
| `focos` (nuevo) | Humo de varios focos | humo coloreado por emisor | ∞ Continuo | fondos/color, arte/organicas | no | 6,3 · 30,1 / 5,3 · 34,5 / 8,3 · 40,0 / 6,3 · 36,5 / 7,6 · 48,8 |

### Descargas eléctricas (`descargas`) — Física y movimiento, analítica, versión 1 · **nueva**

También: arcos eléctricos, arco voltaico, rayos, tormenta eléctrica, descarga de plasma.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `anillo` (nuevo) | Anillo de arcos | arco voltaico | ∞ Continuo | arte/optica, arte/figuras | sí | 5,5 · 19,1 / 5,6 · 24,4 / 1,4 · 5,3 / 5,6 · 17,9 / 6,1 · 25,3 |
| `plasma` (nuevo) | Esfera de plasma | globo de plasma | ∞ Continuo | arte/optica, arte/figuras | sí | 1,3 · 10,3 / 2,9 · 17,9 / 1,6 · 9,2 / 2,4 · 9,9 / 2,4 · 15,5 |
| `tormenta` (nuevo) | Tormenta seca | rayos cielo-tierra | ∞ Continuo | fondos/vivas, arte/organicas | no | 7,1 · 47,8 / 6,2 · 43,3 / 5,5 · 43,5 / 5,6 · 45,7 / 5,6 · 36,8 |
| `chispa` (nuevo) | Chispa entre dos | arco entre electrodos | ∞ Continuo | terminal/figuras, arte/optica | sí | 1,4 · 1,2 / 1,9 · 4,9 / 1,9 · 3,2 / 2,9 · 5,8 / 1,9 · 4,6 |

### Mar nocturno (`mar`) — Física y movimiento, analítica, versión 1 · **nueva**

También: mar de noche, reflejo de luna, estela de luna, olas de aguas profundas, Fresnel.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `lago` (nuevo) | Luna sobre el lago | estela de luna | ∞ Continuo | fondos/ondas | no | 5,0 · 45,1 / 5,3 · 44,8 / 5,0 · 46,1 / 5,2 · 47,0 / 5,0 · 44,9 |
| `mar_fondo` (nuevo) | Mar de fondo | marejada | ∞ Continuo | fondos/ondas | no | 9,4 · 45,2 / 9,1 · 45,2 / 9,3 · 45,9 / 9,4 · 45,5 / 8,3 · 45,8 |
| `plancton` (nuevo) | Plancton | bioluminiscencia | ∞ Continuo | fondos/ondas, fondos/organicas | no | 15,2 · 57,4 / 18,0 · 58,3 / 18,3 · 65,5 / 18,8 · 65,6 / 18,9 · 57,6 |
| `plata` (nuevo) | Marea de plata | camino de luna | ∞ Continuo | fondos/ondas | no | 6,4 · 42,9 / 6,6 · 43,7 / 6,5 · 44,4 / 6,5 · 43,8 / 6,8 · 44,0 |

### Líneas de flujo (`flujo_ruido`) — Física y movimiento, simulación, versión 1 · **nueva**

También: flow field, campo de flujo de ruido, líneas de corriente, estelas de partículas, topología, ruido de gradiente.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `enredo` (nuevo) | Enredo denso | campo de flujo enredado, flow field | ∞ Continuo | fondos/organicas | no | 5,3 · 43,2 / 6,0 · 52,6 / 5,8 · 50,7 / 5,7 · 48,5 / 6,0 · 51,0 |
| `filamentos` (nuevo) | Filamentos largos | topología, líneas acumuladas | ∞ Continuo | fondos/organicas, arte/organicas | no | 2,0 · 25,8 / 2,0 · 60,3 / 1,8 · 60,9 / 1,8 · 62,7 / 2,0 · 66,1 |
| `viento` (nuevo) | Viento suave | corriente de aire, estelas de viento | ∞ Continuo | fondos/ondas, fondos/organicas | no | 10,1 · 75,7 / 9,6 · 82,6 / 9,1 · 77,4 / 9,2 · 79,6 / 8,2 · 67,0 |
| `remolinos` (nuevo) | Remolinos lentos | vórtices de ruido | ∞ Continuo | fondos/organicas | no | 5,3 · 42,6 / 3,6 · 70,7 / 3,6 · 80,5 / 3,3 · 55,4 / 3,7 · 68,8 |
| `tinta` (nuevo) | Tinta en papel | plumilla, líneas de tinta | ∞ Continuo | fondos/organicas, arte/organicas | no | 1,6 · 20,0 / 0,98 · 49,0 / 1,0 · 64,0 / 1,3 · 65,2 / 1,1 · 71,1 |

### Burbujas con nucleación (`burbujas`) — Física y movimiento, analítica, versión 1 · **nueva**

También: champán, efervescencia, burbujas de gas, puntos de nucleación, nucleation sites, champagne fizz, gaseosa, cava.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `champan` (nuevo) | Copa de champán | champagne, cava, burbujas finas | ∞ Continuo | fondos/materia, fondos/organicas | no | 3,8 · 76,1 / 3,4 · 75,8 / 3,7 · 75,6 / 3,5 · 74,3 / 3,9 · 76,0 |
| `sifon` (nuevo) | Agua con gas | soda, agua carbonatada, gaseosa | ∞ Continuo | fondos/organicas, fondos/materia | no | 4,0 · 86,1 / 4,5 · 86,9 / 4,6 · 86,5 / 4,0 · 84,9 / 3,7 · 88,7 |
| `lava_lenta` (nuevo) | Burbujas lentas de miel | líquido espeso, aceite, miel | ∞ Continuo | fondos/organicas, arte/organicas | no | 4,5 · 88,5 / 3,2 · 89,1 / 4,0 · 89,5 / 4,1 · 88,9 / 3,6 · 89,5 |
| `espuma` (nuevo) | Cerveza con espuma | cerveza, corona de espuma | ∞ Continuo | fondos/materia, fondos/organicas | no | 4,8 · 88,7 / 4,4 · 89,8 / 4,5 · 90,1 / 4,9 · 88,2 / 4,2 · 91,1 |

### Calor que irradia (`calor_radiante`) — Física y movimiento, analítica, versión 1 · **nueva**

También: brasas, rescoldo, calor, mapa térmico, cámara térmica, cuerpo negro, termografía, smolder, ascuas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `rescoldo` (nuevo) | Rescoldo que respira | smolder, ascuas | ∞ Continuo | arte/organicas | no | 2,5 · 40,6 / 3,0 · 53,5 / 2,6 · 53,6 / 2,6 · 47,6 / 2,3 · 48,2 |
| `termografia` (nuevo) | Cámara térmica | termografía, infrarrojo, mapa de calor | ∞ Continuo | arte/organicas, fondos/organicas | no | 3,1 · 100,0 / 3,2 · 100,0 / 2,9 · 100,0 / 2,9 · 100,0 / 3,1 · 100,0 |
| `fragua` (nuevo) | Fragua con chispas | forja, chispas | ∞ Continuo | arte/organicas | no | 3,3 · 25,1 / 3,0 · 23,4 / 3,3 · 21,8 / 3,2 · 28,5 / 3,0 · 26,8 |
| `braseros` (nuevo) | Dos braseros | brasero, carbón | ∞ Continuo | arte/organicas, fondos/organicas | no | 3,2 · 100,0 / 3,7 · 99,8 / 3,3 · 99,7 / 3,1 · 100,0 / 3,0 · 97,1 |

### Sistemas L (`sistema_l`) — Forma y geometría, geometría, versión 1

También: sistema de Lindenmayer, L-system, gramática de reescritura, tortuga, fractal de plantas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `helecho` | Helecho recursivo | — | ▣ Construcción | arte/organicas, arte/curvas | sí | 0,06 · 0,14 / 0,00 · 7,6 / 0,00 · 7,5 / 0,00 · 7,4 / 0,00 · 7,5 |
| `arbol3d` | Bosque de símbolos | árbol 3D | ▣ Construcción | arte/organicas, arte/figuras | sí | 0,03 · 0,08 / 0,00 · 10,7 / 0,00 · 11,2 / 0,00 · 11,6 / 0,00 · 11,6 |
| `raices` | Raíces | — | ▣ Construcción | arte/organicas | sí | 0,03 · 0,07 / 0,00 · 5,5 / 0,00 · 5,5 / 0,00 · 5,5 / 0,00 · 5,5 |
| `dragon` | Curva del dragón | Heighway, curva del dragón de Heighway | ▣ Construcción | arte/geometricas, arte/curvas | sí | 0,56 · 0,85 / 0,00 · 18,3 / 0,00 · 18,3 / 0,00 · 18,3 / 0,00 · 18,3 |
| `jardin` (nuevo) | Jardín que se renueva | helechos, sistema L en jardín | ∞ Continuo | arte/organicas, fondos/organicas | no | 1,5 · 24,4 / 1,6 · 21,4 / 0,63 · 18,5 / 2,5 · 19,6 / 2,2 · 18,3 |
| `raices_vivas` (nuevo) | Raíces que cuelgan | raíces, sistema L en jardín | ∞ Continuo | arte/organicas, fondos/organicas | no | 0,79 · 13,0 / 1,6 · 18,1 / 1,4 · 15,9 / 0,87 · 8,6 / 0,25 · 12,8 |
| `dragon_pliegue` (nuevo) | Dragón que se pliega | curva del dragón, plegado de papel, paperfolding, Heighway | ↻ Bucle (24 s) | arte/geometricas, arte/curvas | sí | 3,3 · 4,1 / 3,9 · 4,5 / 4,1 · 5,4 / 3,3 · 4,1 / 3,3 · 4,1 |

### Atractores extraños (`atractor`) — Forma y geometría, simulación, versión 2

También: atractor extraño, caos, Clifford, Peter de Jong, Lorenz, Thomas, Aizawa, Halvorsen.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `cintas` | Cintas plegadas | Cintas caóticas, atractor de Clifford | ∞ Continuo | arte/curvas | sí | 1,4 · 34,5 / 0,85 · 40,5 / 0,49 · 32,9 / 0,59 · 53,2 / 0,84 · 64,3 |
| `nube` | Velo enrollado | Nube orbital, atractor de Peter de Jong | ∞ Continuo | arte/curvas | sí | 0,40 · 33,4 / 0,58 · 37,9 / 0,30 · 33,8 / 0,49 · 32,5 / 0,29 · 30,9 |
| `lorenz` | Mariposa de estelas | Mariposa de Lorenz, atractor de Lorenz | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | 2,7 · 28,6 / 3,5 · 33,2 / 2,7 · 27,0 / 2,2 · 26,1 / 2,7 · 26,9 |
| `madeja` (nuevo) | Madeja | atractor de Thomas, Thomas | ∞ Continuo | arte/figuras, arte/curvas | sí | 1,1 · 13,4 / 1,1 · 14,5 / 0,89 · 14,1 / 1,1 · 13,9 / 0,69 · 12,5 |
| `ovillo` (nuevo) | Ovillo | atractor de Aizawa, Aizawa | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | 3,3 · 25,0 / 3,3 · 24,7 / 2,4 · 17,7 / 3,4 · 25,6 / 3,2 · 25,4 |
| `helice` (nuevo) | Hélice de tres aspas | atractor de Halvorsen, Halvorsen | ∞ Continuo | arte/figuras, arte/curvas | sí | 1,3 · 13,4 / 1,3 · 17,1 / 1,3 · 14,9 / 1,3 · 14,9 / 1,3 · 14,7 |

### Arquitectura por restricciones (`wfc`) — Forma y geometría, geometría, versión 1

También: Wave Function Collapse, WFC, colapso de función de onda, generación por restricciones, modelo de piezas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `placa` | Placa base | — | ▣ Construcción | arte/geometricas | no | 4,3 · 9,5 / 0,00 · 13,8 / 0,00 · 18,4 / 3,7 · 13,5 / 0,00 · 14,4 |
| `plano` | Plano de planta | — | ▣ Construcción | arte/geometricas | no | 4,5 · 8,0 / 4,1 · 27,7 / 4,6 · 46,7 / 0,00 · 76,2 / 4,5 · 38,4 |
| `acueducto` | Acueducto | — | ▣ Construcción | arte/geometricas | no | 6,0 · 19,2 / 0,00 · 33,7 / 6,2 · 19,2 / 3,5 · 7,6 / 0,00 · 21,8 |
| `laberinto` | Ciudad densa | — | ▣ Construcción | arte/geometricas, tipo/texturas | no | 4,5 · 16,4 / 31,8 · 4,6 / 0,00 · 46,7 / 0,00 · 47,3 / 0,00 · 46,3 |
| `placa_sin_fin` (nuevo) | Placa sin fin | WFC que avanza, circuitos | ∞ Continuo | fondos/geometricas, terminal/consola | no | 9,8 · 24,8 / 9,6 · 19,3 / 8,1 · 17,2 / 8,2 · 15,4 / 11,1 · 21,6 |
| `viaducto` (nuevo) | Viaducto en marcha | WFC que avanza, acueducto | ∞ Continuo | fondos/geometricas | no | 13,0 · 25,3 / 6,6 · 25,7 / 6,3 · 29,0 / 6,6 · 29,5 / 6,6 · 21,6 |
| `ciudad_viva` (nuevo) | Ciudad que se rehace | WFC por zonas, plano de planta | ∞ Continuo | fondos/geometricas, tipo/texturas | no | 0,46 · 70,8 / 1,3 · 66,5 / 1,3 · 65,4 / 2,3 · 67,9 / 1,9 · 66,2 |
| `onda` | La onda que colapsa | mapa de entropía | ▣ Construcción | arte/geometricas | no | 1,8 · 8,8 / 0,00 · 29,9 / 1,7 · 26,8 / 1,6 · 23,2 / 1,5 · 30,3 |

### Teselación hiperbólica (`hiperbolico`) — Forma y geometría, analítica, versión 1

También: plano hiperbólico, disco de Poincaré, teselación {p,q}, Escher, límite circular.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `triangulos` | Rosetones | Triángulos {7,3}, teselación {7,3}, grupo de triángulos (2,3,7) | ∞ Continuo | arte/geometricas | sí | 3,8 · 30,0 / 3,9 · 29,8 / 3,7 · 29,7 / 3,6 · 29,4 / 3,8 · 30,1 |
| `cuadrados` | Red curva | Cuadrados {4,5}, teselación {4,5} | ↻ Bucle (32 s) | arte/geometricas, terminal/figuras | sí | 2,2 · 23,2 / 2,0 · 23,3 / 2,2 · 23,1 / 2,0 · 23,2 / 2,0 · 23,2 |
| `estrellas` | Estrellas que menguan | Estrellas {6,4}, teselación {6,4} | ∞ Continuo | arte/geometricas | sí | 2,2 · 33,9 / 2,2 · 33,6 / 2,2 · 33,9 / 2,2 · 33,8 / 2,3 · 34,0 |
| `espejo` | Disco y su reflejo | Pentágonos y su reflejo {5,4}, teselación {5,4} | ↻ Bucle (20 s) | arte/geometricas, arte/optica | sí | 6,7 · 44,5 / 7,9 · 52,0 / 6,7 · 44,5 / 6,7 · 44,5 / 6,7 · 44,5 |
| `relieve` (nuevo) | Azulejos en relieve | teselación {6,4} en relieve, disco de Poincaré | ∞ Continuo | arte/geometricas, arte/figuras | sí | 2,0 · 31,6 / 2,0 · 32,2 / 2,0 · 31,7 / 2,0 · 31,7 / 2,2 · 31,5 |
| `mosaico` (nuevo) | Mosaico que fluye | teselación {5,4} en relieve, plano hiperbólico | ↻ Bucle (32 s) | fondos/geometricas, tipo/texturas | no | 5,4 · 80,0 / 5,8 · 79,9 / 5,2 · 80,2 / 5,5 · 80,3 / 5,5 · 80,3 |

### Orden y caos (`orden_caos`) — Forma y geometría, simulación, versión 1 · **nueva**

También: transición de fase, fusión y cristalización, red cristalina, phase transition.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `fusion` (nuevo) | Fusión | frente de fusión | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 11,0 · 70,6 / 17,7 · 68,9 / 29,3 · 69,0 / 35,8 · 72,1 / 35,1 · 65,0 |
| `radial` (nuevo) | Cristalización radial | nucleación, crecimiento de cristal | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 30,0 · 84,6 / 12,6 · 85,8 / 34,2 · 70,5 / 31,8 · 72,7 / 33,8 · 70,1 |
| `onda` (nuevo) | Onda de calor | banda de fusión | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 5,9 · 74,3 / 25,1 · 72,0 / 18,1 · 72,2 / 26,0 · 72,5 / 17,2 · 72,9 |

### Mosaico cinético (`mosaico`) — Forma y geometría, analítica, versión 1 · **nueva**

También: teselas que voltean, mosaico en ola, pared cinética, kinetic mosaic, split-flap.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `ola` (nuevo) | Ola de teselas | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 15,8 · 88,4 / 16,4 · 90,5 / 13,0 · 89,3 / 13,1 · 91,6 / 12,8 · 94,6 |
| `anillos` (nuevo) | Anillos que voltean | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 11,2 · 92,7 / 11,5 · 93,2 / 7,2 · 92,4 / 13,0 · 92,0 / 13,6 · 94,7 |
| `cartel` (nuevo) | Cartel de estadio | — | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 8,8 · 81,7 / 10,0 · 92,2 / 10,1 · 90,6 / 14,5 · 93,1 / 11,1 · 93,9 |
| `dorado` (nuevo) | Mosaico dorado | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 5,7 · 97,4 / 7,1 · 98,5 / 5,6 · 97,5 / 7,2 · 98,4 / 8,2 · 97,9 |
| `barrido` (nuevo) | Barrido de radar | — | ∞ Continuo | arte/geometricas, fondos/geometricas | no | 11,4 · 88,9 / 14,2 · 89,9 / 9,2 · 91,1 / 10,1 · 94,9 / 12,1 · 88,3 |

### Lacería (`laceria`) — Forma y geometría, analítica, versión 1 · **nueva**

También: estrellas entrelazadas, rosetas, girih, polígono estrellado, entrelazado alterno, tracería.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `nazari` (nuevo) | Azulejo de ocho | estrella de ocho puntas, dos cuadrados entrelazados | ↻ Bucle (32 s) | arte/geometricas, fondos/geometricas | no | 3,5 · 28,2 / 3,4 · 28,5 / 2,7 · 28,3 / 2,9 · 27,3 / 2,9 · 27,3 |
| `roseton` (nuevo) | Rosetón | rosa de doce | ↻ Bucle (32 s) | arte/geometricas | no | 2,8 · 17,2 / 2,8 · 17,1 / 2,7 · 17,0 / 3,6 · 17,7 / 3,6 · 17,7 |
| `traceria` (nuevo) | Tracería | hexagrama entrelazado | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 7,6 · 29,5 / 8,5 · 28,7 / 7,7 · 29,8 / 10,0 · 29,0 / 10,1 · 30,0 |
| `diez` (nuevo) | Estrella de diez | decágono estrellado | ∞ Continuo | arte/geometricas | no | 6,3 · 12,5 / 6,4 · 12,0 / 8,6 · 16,1 / 7,9 · 20,0 / 8,6 · 16,2 |

### Osciloscopio que se degrada (`osciloscopio`) — Forma y geometría, analítica, versión 1 · **nueva**

También: osciloscopio, forma de onda, bit crush, recorte, modulación de frecuencia, traza de fósforo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `limpia` (nuevo) | Señal limpia | seno con deriva | ∞ Continuo | terminal/consola, arte/curvas | no | 4,7 · 59,4 / 7,4 · 60,6 / 4,8 · 59,5 / 4,9 · 59,5 / 4,8 · 59,5 |
| `interferencia` (nuevo) | Interferencia | ruido y reducción de bits | ∞ Continuo | terminal/consola, arte/curvas | no | 3,6 · 13,6 / 3,8 · 13,4 / 4,2 · 13,1 / 4,1 · 13,5 / 4,3 · 13,9 |
| `grito` (nuevo) | Grito | distorsión extrema | ∞ Continuo | arte/curvas | no | 7,3 · 13,4 / 7,7 · 13,5 / 21,2 · 40,6 / 7,9 · 13,6 / 13,9 · 19,4 |
| `fosforo` (nuevo) | Fósforo lento | persistencia de fósforo | ∞ Continuo | terminal/consola | no | 3,8 · 60,4 / 0,71 · 59,7 / 10,7 · 62,8 / 6,2 · 60,4 / 5,3 · 60,4 |

### Marco vivo (`marco`) — Forma y geometría, analítica, versión 1 · **nueva**

También: borde luminoso, marco animado, cometas en el perímetro, rectángulo redondeado.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `terminal` (nuevo) | Marco de terminal | borde de consola | ∞ Continuo | terminal/consola, arte/geometricas | no | 1,5 · 16,6 / 1,7 · 16,2 / 1,5 · 16,3 / 1,7 · 16,9 / 1,5 · 16,5 |
| `neon` (nuevo) | Neón doble | cometas opuestos | ∞ Continuo | arte/geometricas | no | 3,4 · 22,7 / 3,2 · 22,8 / 2,8 · 21,6 / 3,3 · 22,0 / 2,7 · 21,5 |
| `latido` (nuevo) | Latido | pulso | ∞ Continuo | arte/geometricas | no | 0,95 · 10,5 / 14,0 · 9,4 / 0,66 · 9,4 / 4,7 · 9,7 / 0,61 · 11,0 |
| `humo` (nuevo) | Humo de colores | marco con humo | ∞ Continuo | arte/geometricas | no | 7,4 · 24,3 / 8,6 · 21,6 / 3,3 · 21,1 / 6,1 · 18,6 / 4,7 · 22,8 |

### Cuerdas vibrantes (`cuerdas`) — Forma y geometría, analítica, versión 1 · **nueva**

También: cuerda vibrante, ondas estacionarias, modos normales, arpa, cuerda pulsada, resonant strings.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `arpa` (nuevo) | Arpa en arpegio | arpa, arpegio | ↻ Bucle (6 s) | arte/geometricas | sí | 4,9 · 20,3 / 4,9 · 20,3 / 4,9 · 20,3 / 4,9 · 20,3 / 4,9 · 20,3 |
| `acorde` (nuevo) | Acorde rasgueado | rasgueo | ↻ Bucle (4 s) | arte/geometricas | sí | 11,4 · 30,1 / 1,0 · 16,3 / 11,4 · 30,1 / 11,4 · 30,1 / 11,4 · 30,1 |
| `grave` (nuevo) | Cuerda grave | onda estacionaria, modo fundamental | ↻ Bucle (8 s) | arte/geometricas | sí | 4,0 · 8,6 / 0,61 · 3,1 / 0,69 · 3,1 / 4,0 · 8,6 / 4,0 · 8,6 |
| `armonicos` (nuevo) | Armónicos alternos | modos superiores | ↻ Bucle (5 s) | fondos/geometricas, arte/geometricas | no | 6,3 · 27,1 / 6,3 · 27,1 / 6,3 · 27,1 / 6,3 · 27,1 / 6,3 · 27,1 |

### Grabado láser (`grabado`) — Forma y geometría, geometría, versión 1 · **nueva**

También: grabado láser, laser engraving, pirograbado, trayectoria de herramienta, toolpath, contornos de texto, marching squares, buril.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tu-palabra` (nuevo) | Tu palabra grabada | grabado del texto, contorno de letras | ∞ Continuo | tipo/texturas, terminal/consola | sí | 0,89 · 1,4 / 0,86 · 13,4 / 0,85 · 16,0 / 0,84 · 18,0 / 0,68 · 18,5 |
| `geometria` (nuevo) | Geometría | figuras grabadas, espirógrafo grabado | ∞ Continuo | arte/geometricas, terminal/figuras | sí | 1,9 · 2,6 / 1,8 · 10,3 / 1,0 · 8,0 / 1,6 · 9,3 / 2,0 · 10,1 |
| `firma` (nuevo) | Firma | firma pirograbada, escritura cursiva | ∞ Continuo | arte/curvas, terminal/figuras | sí | 0,72 · 1,4 / 0,77 · 14,8 / 0,81 · 19,4 / 0,68 · 18,2 / 0,92 · 21,7 |
| `placa` (nuevo) | Placa terminada | grabado que se queda, construcción | ▣ Construcción | tipo/texturas | sí | 1,0 · 1,8 / 0,00 · 19,5 / 0,00 · 19,5 / 0,00 · 19,5 / 0,00 · 19,5 |
| `luz` (nuevo) | Escritura de luz | estela que se apaga | ∞ Continuo | tipo/texturas, terminal/consola | sí | 1,2 · 2,0 / 0,31 · 1,9 / 1,5 · 4,1 / 1,2 · 2,9 / 1,2 · 2,6 |

### Mandala de capas (`mandala_capas`) — Forma y geometría, analítica, versión 1 · **nueva**

También: mandala, flor de la vida, semilla de la vida, espiral áurea, espiral logarítmica, rosetón, yantra.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `trono` (nuevo) | Trono dorado | golden throne, mandala dorado | ↻ Bucle (30 s) | arte/geometricas, arte/curvas | sí | 4,7 · 24,2 / 4,7 · 24,2 / 4,7 · 24,2 / 4,7 · 24,2 / 4,7 · 24,2 |
| `roseton` (nuevo) | Rosetón de doce | vidriera, rosa gótica | ↻ Bucle (48 s) | arte/geometricas | sí | 2,7 · 27,1 / 2,5 · 26,6 / 2,8 · 27,2 / 2,7 · 27,7 / 2,7 · 27,7 |
| `loto` (nuevo) | Loto que respira | flor de loto, semilla de la vida | ↻ Bucle (20 s) | arte/geometricas, arte/curvas | sí | 3,8 · 29,6 / 3,9 · 29,5 / 3,8 · 29,6 / 3,8 · 29,6 / 3,8 · 29,6 |
| `girasol` (nuevo) | Espirales de girasol | filotaxis, espiral áurea | ↻ Bucle (30 s) | arte/curvas, arte/geometricas | sí | 4,1 · 25,5 / 4,1 · 25,5 / 4,1 · 25,5 / 4,1 · 25,5 / 4,1 · 25,5 |

### Fractales 3D (`fractal_3d`) — Figuras y espacio, analítica, versión 1

También: Mandelbulb, Mandelbox, Julia cuaterniónica, fractal 3D, ray marching.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `bulbo` | Bulbo | Bulbo clásico, Mandelbulb | ∞ Continuo | arte/figuras, arte/curvas | sí | 5,4 · 26,9 / 5,6 · 26,8 / 5,4 · 26,6 / 5,4 · 26,7 / 5,6 · 26,8 |
| `corte` | Bulbo abierto | Corte interior, Mandelbulb cortado | ↻ Bucle (50 s) | arte/figuras, arte/curvas | sí | 4,1 · 24,5 / 4,7 · 30,6 / 1,7 · 28,7 / 3,1 · 26,0 / 4,1 · 24,5 |
| `caja` | Caja plegada | Mandelbox | ↻ Bucle (10 s) | arte/figuras, arte/curvas, terminal/figuras | sí | 2,5 · 22,3 / 2,5 · 22,3 / 2,5 · 22,3 / 2,5 · 22,3 / 2,5 · 22,3 |
| `concha` (nuevo) | Concha | Julia cuaterniónica, conjunto de Julia 3D | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | 2,8 · 26,2 / 2,6 · 29,5 / 3,2 · 24,8 / 3,5 · 26,0 / 3,8 · 26,5 |
| `partida` (nuevo) | Concha partida | Julia cuaterniónica cortada | ∞ Continuo | arte/figuras, arte/curvas | sí | 2,8 · 26,0 / 3,4 · 22,8 / 2,2 · 24,5 / 2,5 · 24,1 / 2,3 · 27,0 |

### Nubes volumétricas (`nubes_vol`) — Figuras y espacio, analítica, versión 2

También: nubes, nube volumétrica, Beer–Lambert, Henyey–Greenstein, nebulosa, cielo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `banco` | Mar de nubes | Banco de nubes, nubes volumétricas | ∞ Continuo | fondos/organicas | no | 0,87 · 89,6 / 0,90 · 92,4 / 0,91 · 95,9 / 1,0 · 92,9 / 0,99 · 95,2 |
| `nebulosa` | Nebulosa | nebulosa de emisión, polvo interestelar | ∞ Continuo | fondos/espacio, arte/figuras | no | 3,9 · 84,2 / 4,0 · 74,4 / 3,3 · 72,6 / 2,8 · 40,6 / 3,3 · 55,2 |
| `haces` | Haces de luz | rayos crepusculares, dispersión de Mie | ∞ Continuo | fondos/organicas | no | 1,2 · 100,0 / 1,3 · 93,4 / 1,4 · 79,6 / 0,93 · 100,0 / 1,2 · 99,8 |
| `dentro` (nuevo) | Vuelo entre nubes | Nebulosa (dentro de la nube) | ∞ Continuo | fondos/organicas, tipo/texturas | no | 4,0 · 45,7 / 7,6 · 77,5 / 10,3 · 98,6 / 5,6 · 52,3 / 4,9 · 63,1 |

### Orbitales y superposiciones (`orbitales`) — Figuras y espacio, analítica, versión 1

También: orbital, orbitales atómicos, átomo de hidrógeno, función de onda, superposición cuántica.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `lobulos` | Lóbulos que laten | Lóbulos 3d, orbital 3dz², superposición 3d + 4f | ↻ Bucle (20 s) | arte/figuras, terminal/figuras | sí | 0,01 · 9,1 / 0,03 · 8,8 / 0,01 · 9,1 / 0,01 · 9,1 / 0,01 · 9,1 |
| `dipolo` | Nube pendular | Superposición 1s+2p (dipolo que oscila), dipolo, Lyman-alfa, superposición 1s + 2p | ↻ Bucle (4 s) | arte/figuras, terminal/figuras | sí | 0,42 · 15,8 / 0,47 · 15,7 / 0,42 · 15,8 / 0,42 · 15,8 / 0,42 · 15,8 |
| `anillos` | Anillos de cristal | Anillos 4f, orbital 4fz³, superposición 4f + 3p | ↻ Bucle (24 s) | arte/figuras | sí | 0,05 · 26,5 / 0,93 · 26,3 / 0,11 · 25,8 / 0,05 · 26,5 / 0,05 · 26,5 |
| `hibrido` | Faro | Híbrido sp (2s+2p), orbital híbrido sp | ↻ Bucle (240 s) | arte/figuras, terminal/figuras | sí | 0,11 · 13,8 / 0,10 · 13,5 / 0,04 · 14,2 / 0,08 · 19,9 / 0,08 · 19,9 |
| `estrella` (nuevo) | Estrella de cristal | orbital 4fxyz, superposición 4f + 3d | ∞ Continuo | arte/figuras | sí | 1,4 · 27,9 / 1,6 · 27,9 / 1,5 · 28,0 / 1,5 · 27,9 / 1,4 · 27,9 |

### Agujero negro (`lente_gravitacional`) — Figuras y espacio, analítica, versión 2

También: lente gravitacional, Schwarzschild, disco de acreción, horizonte de sucesos, Gargantua.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `disco` | Disco doblado | Disco de acreción, Gargantua | ∞ Continuo | arte/figuras, terminal/figuras | sí | 1,2 · 75,1 / 1,3 · 73,5 / 1,3 · 69,6 / 1,9 · 57,7 / 1,3 · 75,1 |
| `rejilla` | Rejilla curvada | Lente sobre la rejilla, lente gravitacional, anillo de Einstein | ↻ Bucle (10 s) | arte/figuras, arte/optica | sí | 10,0 · 20,8 / 10,0 · 20,8 / 10,0 · 20,8 / 10,0 · 20,8 / 10,0 · 20,8 |
| `canto` | Disco de canto | De canto | ∞ Continuo | arte/figuras, arte/optica | sí | 5,4 · 62,9 / 4,7 · 65,4 / 4,0 · 70,3 / 4,7 · 71,9 / 5,8 · 51,3 |
| `remolino` (nuevo) | Remolino | disco de acreción visto desde arriba | ∞ Continuo | arte/figuras | sí | 0,77 · 75,5 / 0,70 · 72,7 / 0,84 · 66,5 / 0,99 · 72,6 / 0,93 · 66,2 |
| `cerca` (nuevo) | Al borde de la sombra | primer plano del horizonte, esfera de fotones | ∞ Continuo | arte/figuras | sí | 1,3 · 74,4 / 1,4 · 70,9 / 1,5 · 70,8 / 1,7 · 70,6 / 1,9 · 72,6 |

### Líneas de campo (`campos_em`) — Figuras y espacio, geometría, versión 1

También: campo eléctrico, campo magnético, Coulomb, Biot–Savart, líneas de fuerza, electromagnetismo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `dipolo` | Arcos entre dos cargas | Dipolo eléctrico | ▣ Construcción | arte/figuras | sí | 2,5 · 4,8 / 0,00 · 16,2 / 0,00 · 15,5 / 0,00 · 15,4 / 0,00 · 17,2 |
| `repulsion` | Cargas que se repelen | cargas iguales, equipotenciales | ▣ Construcción | arte/figuras | sí | 1,7 · 77,6 / 0,00 · 83,2 / 0,00 · 84,1 / 0,00 · 84,7 / 0,00 · 82,8 |
| `helmholtz` | Dos anillos y su flujo | Espiras de Helmholtz, bobinas de Helmholtz | ▣ Construcción | arte/figuras | sí | 1,3 · 7,1 / 0,00 · 19,4 / 0,00 · 21,3 / 0,00 · 18,2 / 0,00 · 18,7 |
| `cuadrupolo` | Cuatro polos cruzados | Cuadrupolo | ▣ Construcción | arte/figuras | sí | 3,2 · 6,4 / 0,00 · 14,1 / 0,00 · 13,2 / 0,00 · 12,0 / 0,00 · 14,2 |
| `iman` | Imán | dipolo magnético | ▣ Construcción | arte/figuras | sí | 1,8 · 3,1 / 0,00 · 12,5 / 0,00 · 11,4 / 0,00 · 12,8 / 0,00 · 11,7 |
| `dipolo_vivo` (nuevo) | Cargas que giran | dipolo eléctrico en movimiento, cargas en órbita | ∞ Continuo | arte/figuras, arte/curvas | sí | 2,4 · 4,4 / 8,1 · 14,6 / 10,4 · 15,3 / 8,6 · 15,3 / 5,9 · 13,6 |
| `espiras_vivas` (nuevo) | Espiras que laten | espiras de Helmholtz, corriente que se invierte, anti-Helmholtz | ∞ Continuo | arte/figuras | sí | 1,9 · 6,9 / 4,1 · 19,1 / 6,5 · 23,2 / 6,7 · 18,6 / 5,0 · 19,6 |
| `imanes` (nuevo) | Imanes que bailan | dipolos magnéticos, reconexión de líneas | ∞ Continuo | arte/figuras, arte/curvas | sí | 2,8 · 5,1 / 6,8 · 13,5 / 5,6 · 12,8 / 7,1 · 14,3 / 7,5 · 14,9 |

### Cámara de niebla (`niebla`) — Figuras y espacio, simulación, versión 2 · **nueva**

También: cloud chamber, cámara de Wilson, cámara de burbujas, fuerza de Lorentz, trazas de partículas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `burbujas` (nuevo) | Cámara de burbujas | espirales de electrones | ∞ Continuo | terminal/consola, arte/curvas | no | 8,4 · 48,8 / 11,1 · 72,6 / 10,8 · 55,7 / 8,7 · 59,9 / 8,6 · 64,4 |
| `cosmicos` (nuevo) | Rayos cósmicos | muones cósmicos | ∞ Continuo | terminal/consola, fondos/espacio | no | 7,7 · 31,4 / 7,1 · 52,9 / 4,3 · 51,7 / 9,2 · 63,0 / 7,0 · 60,9 |
| `pares` (nuevo) | Lluvia de pares | creación de pares | ∞ Continuo | terminal/consola, arte/curvas | no | 7,6 · 42,1 / 10,6 · 67,1 / 8,1 · 63,1 / 10,2 · 71,7 / 8,2 · 64,5 |
| `fuente` (nuevo) | Fuente alfa | desintegración alfa | ∞ Continuo | terminal/consola | no | 5,1 · 17,7 / 5,1 · 21,8 / 3,0 · 11,6 / 4,7 · 17,9 / 5,6 · 29,7 |

### Hipercubo (`hipercubo`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: teseracto, tesseract, 16 celdas, 24 celdas, politopo 4D, proyección 4D.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `teseracto` (nuevo) | Teseracto | hipercubo que gira | ↻ Bucle (40 s) | arte/figuras, terminal/figuras | sí | 5,7 · 20,6 / 4,1 · 20,2 / 5,5 · 21,0 / 5,7 · 20,6 / 5,7 · 20,6 |
| `reves` (nuevo) | Del revés | el cubo interior pasa afuera | ↻ Bucle (20 s) | arte/figuras | sí | 4,5 · 18,4 / 4,4 · 17,9 / 4,5 · 18,4 / 4,5 · 18,4 / 4,5 · 18,4 |
| `celdas24` (nuevo) | Veinticuatro celdas | icositetracoro | ↻ Bucle (60 s) | arte/figuras | sí | 6,7 · 32,6 / 7,0 · 32,4 / 6,7 · 32,6 / 6,7 · 32,6 / 6,7 · 32,6 |
| `celdas16` (nuevo) | Dieciséis celdas | hexadecacoro, ortoplex 4D | ↻ Bucle (48 s) | arte/figuras, terminal/figuras | sí | 3,1 · 15,8 / 2,6 · 15,6 / 3,4 · 15,9 / 3,3 · 15,9 / 3,3 · 15,9 |

### Jade de ruido (`jade_ruido`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: esfera de ruido, blob, esfera desplazada, ruido periódico, torsión, paleta coseno, noise sphere.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `jade` (nuevo) | Jade que respira | esfera de jade | ↻ Bucle (12 s) | arte/figuras | sí | 1,7 · 13,8 / 2,3 · 16,5 / 1,7 · 13,8 / 1,7 · 13,8 / 1,7 · 13,8 |
| `iris` (nuevo) | Burbuja iridiscente | blob iridiscente, gradiente esférico | ↻ Bucle (10 s) | arte/figuras, arte/optica | sí | 2,9 · 13,7 / 2,9 · 13,7 / 2,9 · 13,7 / 2,9 · 13,7 / 2,9 · 13,7 |
| `magma` (nuevo) | Corazón de magma | esfera de lava | ↻ Bucle (16 s) | arte/figuras | sí | 1,3 · 11,4 / 1,7 · 8,8 / 2,2 · 15,1 / 1,8 · 15,3 / 1,8 · 15,3 |
| `oceano` (nuevo) | Gota de océano torcida | esfera retorcida | ↻ Bucle (14 s) | arte/figuras | sí | 2,9 · 15,8 / 3,2 · 17,4 / 3,5 · 15,8 / 4,0 · 18,7 / 2,8 · 15,0 |

### Eclipse total (`eclipse_total`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: eclipse de sol, corona solar, anillo de diamante, perlas de Baily, protuberancias, viento solar, totalidad.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `diamante` (nuevo) | Anillo de diamante | eclipse glow, segundo contacto | ∞ Continuo | arte/figuras | sí | 0,74 · 12,8 / 0,79 · 12,8 / 0,86 · 13,2 / 0,78 · 14,4 / 0,76 · 14,6 |
| `totalidad` (nuevo) | Totalidad serena | corona de mínimo solar | ∞ Continuo | arte/figuras | sí | 0,78 · 17,9 / 0,78 · 18,4 / 0,83 · 14,0 / 0,82 · 15,2 / 0,80 · 15,0 |
| `tormenta` (nuevo) | Corona en tormenta | máximo solar, eyección coronal | ∞ Continuo | arte/figuras | sí | 1,3 · 15,2 / 1,3 · 14,4 / 1,4 · 14,7 / 1,3 · 15,2 / 1,2 · 14,7 |
| `perlas` (nuevo) | Perlas de Baily | tercer contacto | ∞ Continuo | arte/figuras | sí | 0,81 · 11,4 / 0,89 · 14,4 / 0,91 · 13,4 / 0,86 · 14,0 / 0,87 · 13,0 |

### Disco de vinilo (`vinilo`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: vinilo, tocadiscos, surcos, LP, disco, difracción, red de difracción, vinyl grooves.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tocadiscos` (nuevo) | Tocadiscos | vinyl grooves, LP | ↻ Bucle (36 s) | arte/figuras | sí | 1,5 · 29,5 / 1,4 · 29,4 / 1,5 · 29,3 / 1,4 · 29,5 / 1,5 · 29,3 |
| `arcoiris` (nuevo) | Surcos de arcoíris | difracción, red de difracción | ↻ Bucle (24 s) | arte/figuras, arte/optica | sí | 4,6 · 34,2 / 4,5 · 34,2 / 4,6 · 34,2 / 4,6 · 34,2 / 4,6 · 34,2 |
| `single` (nuevo) | Single de 45 | sencillo, single | ↻ Bucle (20 s) | arte/figuras | sí | 1,4 · 21,9 / 1,3 · 21,8 / 1,4 · 21,9 / 1,4 · 21,9 / 1,4 · 21,9 |
| `pizarra` (nuevo) | Disco de pizarra | 78 rpm, gramófono | ↻ Bucle (30 s) | arte/figuras | sí | 1,0 · 32,0 / 1,0 · 32,0 / 1,0 · 32,0 / 1,0 · 32,0 / 1,0 · 32,0 |

### Corrientes de color (`corrientes`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: mesh gradient, degradado de malla, gradiente de malla, interpolación de Shepard.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `neon` (nuevo) | Corrientes de neón | — | ∞ Continuo | fondos/color | no | 2,5 · 73,2 / 1,2 · 89,9 / 2,2 · 70,7 / 2,8 · 90,0 / 1,5 · 100,0 |
| `atardecer` (nuevo) | Atardecer líquido | — | ∞ Continuo | fondos/color | no | 1,5 · 88,3 / 3,0 · 92,3 / 2,1 · 88,3 / 0,78 · 100,0 / 1,2 · 93,7 |
| `marmolada` (nuevo) | Tinta marmolada | — | ∞ Continuo | fondos/color, arte/organicas | no | 6,5 · 61,5 / 5,5 · 88,3 / 3,2 · 80,3 / 4,4 · 89,6 / 8,7 · 86,8 |
| `boreal` (nuevo) | Velo boreal | — | ∞ Continuo | fondos/color | no | 2,5 · 92,1 / 1,6 · 88,8 / 1,1 · 88,9 / 2,2 · 96,7 / 4,1 · 100,0 |
| `remolino` (nuevo) | Remolino cromático | — | ∞ Continuo | fondos/color, arte/optica | no | 4,0 · 76,4 / 2,2 · 83,4 / 1,4 · 75,7 / 1,4 · 100,0 / 5,0 · 83,1 |

### Ecos y realimentación (`ecos`) — Color, materia y óptica, simulación, versión 2 · **nueva**

También: video feedback, realimentación de vídeo, feedback loop, bucle de realimentación, droste.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tinta` (nuevo) | Tinta recursiva | laberintos de Turing por realimentación | ∞ Continuo | fondos/organicas, arte/optica | no | 19,2 · 29,1 / 32,8 · 56,7 / 39,3 · 53,3 / 37,1 · 57,8 / 41,5 · 60,1 |
| `espejos` (nuevo) | Espejos | caleidoscopio recursivo, droste | ∞ Continuo | fondos/materia, arte/optica | no | 21,1 · 72,4 / 26,7 · 79,9 / 20,3 · 69,2 / 22,1 · 75,8 / 26,0 · 63,1 |
| `tunel` (nuevo) | Túnel de ecos | túnel de realimentación | ∞ Continuo | fondos/espacio, arte/optica | no | 18,1 · 85,6 / 35,4 · 70,5 / 26,4 · 75,2 / 21,1 · 85,1 / 17,6 · 92,3 |
| `huracan` (nuevo) | Huracán | remolino de realimentación, espiral logarítmica | ∞ Continuo | fondos/espacio, arte/optica | no | 40,4 · 57,2 / 46,6 · 55,1 / 43,1 · 54,8 / 41,4 · 51,1 / 42,7 · 57,7 |
| `marea` (nuevo) | Marea de ecos | realimentación con trama | ∞ Continuo | fondos/materia | no | 10,0 · 40,1 / 17,7 · 57,6 / 26,8 · 48,7 / 28,6 · 66,4 / 15,7 · 37,5 |
| `tunel_arcoiris` (nuevo) | Túnel de colores | túnel de realimentación en color | ∞ Continuo | fondos/color, arte/optica | no | 10,2 · 97,9 / 17,4 · 88,6 / 21,1 · 87,5 / 17,4 · 90,6 / 11,0 · 96,3 |
| `espejos_deriva` (nuevo) | Espejos que cambian de color | caleidoscopio recursivo en color | ∞ Continuo | fondos/color, arte/optica | no | 12,5 · 88,5 / 19,7 · 88,2 / 20,5 · 82,1 / 19,7 · 89,2 / 16,6 · 83,9 |
| `pulso_dos` (nuevo) | Pulso en dos tonos | realimentación con dos tonos | ∞ Continuo | fondos/color, arte/optica | no | 22,2 · 31,8 / 43,6 · 56,7 / 19,5 · 25,6 / 31,6 · 41,6 / 33,0 · 45,3 |
| `tu_foto` (nuevo) | Ecos de tu foto | realimentación de vídeo sobre la imagen, video feedback | ∞ Continuo | media/efectos | no | 4,5 · 22,1 / 7,7 · 25,5 / 8,0 · 30,6 / 8,0 · 55,4 / 6,9 · 32,4 |
| `tus_palabras` (nuevo) | Ecos de tus palabras | túnel de letras, texto en realimentación | ∞ Continuo | tipo/texturas | no | 3,3 · 35,9 / 3,8 · 52,4 / 4,2 · 48,8 / 4,0 · 54,5 / 3,6 · 74,0 |

### Membrana iridiscente (`membrana`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: película delgada, interferencia de película delgada, thin-film interference, pompa de jabón, iridiscencia, colores de Newton.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `jabon` (nuevo) | Lámina de jabón | película de jabón que drena | ∞ Continuo | fondos/materia, fondos/color | no | 5,9 · 85,7 / 6,8 · 88,3 / 5,8 · 83,2 / 6,2 · 80,6 / 6,5 · 89,1 |
| `pompa` (nuevo) | Pompa flotante | burbuja de jabón | ∞ Continuo | arte/figuras | no | 0,88 · 23,0 / 0,89 · 23,1 / 0,87 · 23,7 / 1,0 · 22,6 / 0,98 · 22,3 |
| `aceite` (nuevo) | Aceite en el asfalto | mancha de aceite sobre agua | ∞ Continuo | fondos/materia | no | 2,2 · 81,7 / 2,4 · 86,6 / 2,3 · 87,8 / 2,3 · 85,6 / 2,6 · 84,7 |
| `pliegues` (nuevo) | Pliegues de seda | — | ∞ Continuo | fondos/materia, fondos/color | no | 1,7 · 76,4 / 1,8 · 75,1 / 1,7 · 75,0 / 1,9 · 77,8 / 1,8 · 75,5 |
| `nacar` (nuevo) | Nácar en tus colores | interferencia sobre la paleta | ∞ Continuo | fondos/color | no | 8,0 · 97,8 / 8,6 · 98,5 / 8,5 · 96,9 / 9,3 · 91,5 / 9,1 · 97,0 |

### Paneles prismáticos (`paneles`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: paneles de color, láminas translúcidas, composición alfa de atrás adelante, color panels.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `vidrieras` (nuevo) | Vidrieras que giran | — | ↻ Bucle (60 s) | fondos/color, fondos/materia | no | 12,8 · 92,8 / 12,6 · 92,7 / 12,8 · 92,8 / 12,8 · 92,8 / 12,8 · 92,8 |
| `abanico` (nuevo) | Abanico de cristal | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | 8,0 · 44,8 / 8,0 · 44,6 / 8,0 · 44,8 / 8,0 · 44,8 / 8,0 · 44,8 |
| `noria` (nuevo) | Noria de color | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | 8,9 · 51,1 / 9,0 · 51,2 / 8,9 · 51,1 / 8,9 · 51,1 / 8,9 · 51,1 |
| `puerta` (nuevo) | Puerta giratoria | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | 12,2 · 51,5 / 12,4 · 51,9 / 12,2 · 51,5 / 12,2 · 51,5 / 12,2 · 51,5 |

### Cromado en tramas (`cromado`) — Color, materia y óptica, analítica, versión 2 · **nueva**

También: bandas cromadas, reflejo metálico, campo de borde, dispersión cromática.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `gota` (nuevo) | Gota de cromo | gota cromada | ∞ Continuo | arte/optica, arte/figuras | sí | 2,5 · 17,4 / 2,6 · 17,3 / 2,6 · 17,3 / 2,6 · 17,3 / 2,5 · 17,3 |
| `lamina` (nuevo) | Lámina de cromo | cromo líquido, campo de bandas | ∞ Continuo | fondos/materia | no | 14,8 · 98,8 / 14,3 · 98,6 / 15,4 · 98,3 / 15,5 · 97,9 / 15,2 · 98,7 |
| `mercurio` (nuevo) | Mercurio vivo | metabolas cromadas | ∞ Continuo | arte/organicas, arte/optica | sí | 5,2 · 22,0 / 3,5 · 17,9 / 4,1 · 20,3 / 4,0 · 19,8 / 3,6 · 17,7 |
| `anillo` (nuevo) | Anillo de oro | oro pulido | ∞ Continuo | arte/geometricas, arte/optica | sí | 2,2 · 22,8 / 2,6 · 22,5 / 2,4 · 22,6 / 2,6 · 22,4 / 2,6 · 22,7 |
| `prisma` (nuevo) | Rombo prismático | aberración cromática | ∞ Continuo | arte/geometricas, arte/optica | sí | 2,3 · 16,1 / 2,3 · 16,0 / 2,3 · 16,0 / 2,2 · 15,9 / 2,2 · 15,9 |
| `letras` (nuevo) | Tus letras de cromo | texto cromado, letras metálicas | ∞ Continuo | tipo/texturas | no | 0,29 · 3,4 / 0,28 · 3,4 / 0,28 · 3,4 / 0,30 · 3,4 / 0,28 · 3,4 |
| `foto` (nuevo) | Tu foto en cromo | foto cromada, relieve metálico de la imagen | ∞ Continuo | media/efectos | no | 0,80 · 5,6 / 0,82 · 5,4 / 0,77 · 5,5 / 0,81 · 5,5 / 0,78 · 5,5 |

### Superficie que se abre (`desgarro`) — Color, materia y óptica, analítica, versión 2 · **nueva**

También: papel rasgado, desgarro, quemado, máscara de desgarro, fBm anisótropo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `grietas` (nuevo) | Grietas de luz | desgarros desfasados | ∞ Continuo | fondos/materia, arte/organicas | no | 2,1 · 33,9 / 1,8 · 37,0 / 1,9 · 31,6 / 2,0 · 31,2 / 2,0 · 32,9 |
| `rasgado` (nuevo) | Papel rasgado | torn paper | ∞ Continuo | arte/organicas, arte/optica | no | 0,11 · 8,9 / 3,7 · 19,4 / 0,35 · 29,1 / 0,08 · 9,9 / 0,11 · 8,7 |
| `quemado` (nuevo) | Película que arde | burning film, quemado | ∞ Continuo | fondos/materia, arte/organicas | no | 3,1 · 32,8 / 4,1 · 20,0 / 1,1 · 33,6 / 1,2 · 39,1 / 4,2 · 27,9 |
| `trama` (nuevo) | Trama descubierta | revelado de trama | ∞ Continuo | fondos/materia, arte/optica | no | 1,5 · 23,6 / 1,8 · 30,0 / 4,1 · 26,0 / 1,7 · 34,0 / 6,4 · 37,1 |
| `velo` (nuevo) | Velo de color | corrientes detrás | ∞ Continuo | fondos/color, fondos/materia | no | 3,2 · 38,8 / 3,3 · 37,9 / 4,0 · 38,3 / 6,2 · 35,6 / 5,3 · 41,2 |
| `foto` (nuevo) | Tu foto tras el papel | revelado de imagen, papel rasgado sobre la foto | ∞ Continuo | media/efectos | no | 2,8 · 37,8 / 3,0 · 44,7 / 2,5 · 34,8 / 3,0 · 45,8 / 3,0 · 37,9 |
| `palabras` (nuevo) | Tus palabras bajo la ceniza | texto que se revela al quemarse | ∞ Continuo | tipo/texturas | no | 6,2 · 64,2 / 5,4 · 65,5 / 6,4 · 69,7 / 4,3 · 65,3 / 4,5 · 59,0 |
| `capas` (nuevo) | Se abre y deja ver otra capa | desgarro sobre una capa | ∞ Continuo | arte/optica, fondos/materia | no | 2,6 · 32,6 / 1,9 · 33,8 / 2,2 · 29,0 / 2,2 · 29,6 / 2,4 · 30,1 |

### Metal fundido (`metal_fundido`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: oro líquido, metal líquido, relieve especular, Fresnel, domain warping, metabolas, mármol metálico.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `oro` (nuevo) | Oro fundido | oro líquido, liquid gold | ∞ Continuo | fondos/materia, arte/organicas | no | 17,5 · 56,9 / 16,6 · 53,4 / 13,8 · 49,1 / 18,7 · 55,9 / 16,5 · 55,0 |
| `plata` (nuevo) | Plata líquida | azogue, gotas de plata | ∞ Continuo | fondos/materia, arte/organicas | no | 10,2 · 61,3 / 10,4 · 56,8 / 9,0 · 65,0 / 9,8 · 56,6 / 10,8 · 57,0 |
| `cobre` (nuevo) | Cobre batido | cobre martillado | ∞ Continuo | fondos/materia | no | 2,5 · 56,7 / 2,5 · 58,0 / 2,5 · 58,8 / 2,4 · 59,9 / 2,4 · 49,0 |
| `marea` (nuevo) | Marea de oro lenta | bronce que fluye | ∞ Continuo | fondos/materia | no | 15,8 · 78,3 / 14,8 · 83,3 / 16,6 · 81,5 / 17,3 · 81,3 / 16,9 · 78,7 |
| `iris` (nuevo) | Metal de la paleta | metal iridiscente, aceite sobre metal | ∞ Continuo | arte/organicas, fondos/materia | no | 24,4 · 59,9 / 22,2 · 59,1 / 20,6 · 58,0 / 22,1 · 56,6 / 20,6 · 57,9 |

### Seda especular (`seda`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: tela de seda, satén, brillo especular, Blinn–Phong, Kajiya–Kay, brillo anisótropo, olas facetadas, low poly, Phong.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `seda` (nuevo) | Seda que respira | seda especular, silk groove | ∞ Continuo | fondos/materia, fondos/ondas | no | 2,9 · 61,7 / 4,6 · 73,0 / 3,9 · 74,9 / 3,3 · 78,3 / 4,5 · 78,7 |
| `cascada` (nuevo) | Cascada de seda | vetas de seda, silk cascade, brillo anisótropo | ∞ Continuo | fondos/materia | no | 4,4 · 76,8 / 6,0 · 79,7 / 5,1 · 80,3 / 4,0 · 66,6 / 3,8 · 76,2 |
| `olas` (nuevo) | Olas facetadas | mar low poly, malla de olas, waves | ∞ Continuo | fondos/ondas | no | 4,7 · 100,0 / 5,1 · 100,0 / 5,2 · 100,0 / 5,6 · 100,0 / 5,2 · 100,0 |
| `saten` (nuevo) | Satén facetado | seda low poly | ∞ Continuo | fondos/geometricas, fondos/materia | no | 3,8 · 89,5 / 3,5 · 86,0 / 4,9 · 81,9 / 4,2 · 86,4 / 4,0 · 82,6 |
| `velos` (nuevo) | Velos de seda | capas translúcidas | ∞ Continuo | fondos/materia | no | 2,4 · 80,3 / 2,3 · 100,0 / 2,3 · 76,5 / 3,9 · 96,2 / 2,2 · 99,6 |

### Grietas de oro (`grietas_oro`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: kintsugi, fractura dorada, grietas que crecen, oro fundido, Voronoi, gilded fracture.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `kintsugi` (nuevo) | Oro que sangra | kintsugi, fractura dorada | ↻ Bucle (14 s) | fondos/organicas, arte/organicas | no | 0,31 · 54,4 / 3,1 · 59,9 / 6,3 · 72,3 / 8,8 · 91,7 / 7,8 · 89,6 |
| `brasa` (nuevo) | Tierra en brasa | grietas de lava, suelo volcánico | ∞ Continuo | fondos/organicas | no | 0,27 · 44,5 / 12,1 · 97,0 / 9,8 · 83,5 / 12,1 · 98,1 / 10,2 · 83,8 |
| `porcelana` (nuevo) | Porcelana rota | loza agrietada, craquelado | ↻ Bucle (20 s) | arte/organicas, fondos/organicas | no | 0,22 · 56,5 / 5,6 · 77,3 / 0,22 · 56,5 / 0,22 · 56,5 / 0,22 · 56,5 |
| `cobre` (nuevo) | Grietas de cobre | fisuras de cobre | ∞ Continuo | fondos/organicas | no | 2,5 · 49,7 / 2,1 · 46,7 / 2,0 · 60,5 / 1,7 · 48,4 / 3,3 · 50,8 |

### Haces de luz (`haces_luz`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: luz volumétrica, volumetric light, rayos de luz en la niebla, láser, foco, cañón de luz, polvo en el aire, efecto Tyndall.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `laberinto` (nuevo) | Laberinto láser | láseres en la niebla, laser labyrinth | ∞ Continuo | fondos/color, arte/optica | no | 7,7 · 13,8 / 4,1 · 11,6 / 8,3 · 17,0 / 10,4 · 16,8 / 8,9 · 15,0 |
| `discoteca` (nuevo) | Discoteca en el humo | luces de discoteca, club | ∞ Continuo | fondos/color, arte/optica | no | 11,7 · 16,3 / 16,4 · 23,2 / 13,4 · 16,9 / 13,5 · 19,5 / 12,4 · 16,1 |
| `faros` (nuevo) | Haces lentos en la bruma | faros en la niebla | ∞ Continuo | fondos/color | no | 3,7 · 24,7 / 3,3 · 16,4 / 2,8 · 24,2 / 4,2 · 27,1 / 4,0 · 28,2 |
| `terciopelo` (nuevo) | Foco de terciopelo | velvet spotlight, polvo en el foco, escenario | ∞ Continuo | fondos/color | no | 2,4 · 57,5 / 3,0 · 53,8 / 1,9 · 54,4 / 2,9 · 57,6 / 1,5 · 55,9 |
| `escenario` (nuevo) | Dos focos fríos | cañones de luz, concierto | ∞ Continuo | fondos/color | no | 3,8 · 21,4 / 5,7 · 19,7 / 3,5 · 17,8 / 5,1 · 23,8 / 3,7 · 22,7 |

### Talla de diamante (`talla_diamante`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: talla brillante, diamante, facetas, fuego del diamante, dispersión, centelleo, talla princesa, talla rosa, gema.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `brillante` (nuevo) | Brillante que gira | diamond caustics, talla brillante | ↻ Bucle (24 s) | arte/geometricas, arte/optica | sí | 3,8 · 26,0 / 3,9 · 26,0 / 3,6 · 26,0 / 3,8 · 26,0 / 3,8 · 26,0 |
| `princesa` (nuevo) | Princesa de fuego | talla princesa, dispersión | ↻ Bucle (30 s) | arte/geometricas, arte/optica | sí | 4,5 · 18,9 / 4,5 · 18,9 / 4,5 · 18,9 / 4,5 · 18,9 / 4,5 · 18,9 |
| `rosa_antigua` (nuevo) | Rosa antigua | talla rosa, diamante antiguo | ↻ Bucle (40 s) | arte/geometricas | sí | 3,9 · 19,2 / 3,7 · 19,2 / 4,0 · 19,2 / 3,9 · 19,2 / 3,9 · 19,2 |
| `hielo` (nuevo) | Destello helado | centelleo, escarcha | ↻ Bucle (12 s) | arte/optica | sí | 4,7 · 23,0 / 4,6 · 23,0 / 4,7 · 23,0 / 4,7 · 23,0 / 4,7 · 23,0 |

### Letrero de neón (`neon_tubos`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: neón, rótulo luminoso, tubos de neón, cartel de neón, neon sign, neon revival, luminoso.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `letrero` (nuevo) | Letrero de bar | neon revival, rótulo | ↻ Bucle (12 s) | arte/geometricas, arte/figuras | sí | 4,6 · 18,4 / 1,3 · 40,2 / 4,6 · 18,4 / 4,6 · 18,4 / 4,6 · 18,4 |
| `corazon` (nuevo) | Corazón que zumba | corazón de neón | ↻ Bucle (9 s) | arte/geometricas, arte/figuras | sí | 1,4 · 22,8 / 1,4 · 22,8 / 7,8 · 2,2 / 1,4 · 22,8 / 7,8 · 2,2 |
| `estrella` (nuevo) | Estrella de motel | estrella de neón | ↻ Bucle (10 s) | arte/geometricas | sí | 0,23 · 22,7 / 0,23 · 22,7 / 0,23 · 22,7 / 0,23 · 22,7 / 0,23 · 22,7 |
| `arcos` (nuevo) | Arcoíris de tubos | arcos de neón | ↻ Bucle (16 s) | arte/geometricas | sí | 2,3 · 11,1 / 0,19 · 9,7 / 0,00 · 3,6 / 0,74 · 27,9 / 0,74 · 27,9 |
| `luz` (nuevo) | La palabra LUZ | palabra de neón | ↻ Bucle (10 s) | arte/geometricas, terminal/figuras | sí | 5,4 · 15,9 / 5,4 · 15,9 / 5,4 · 15,9 / 5,4 · 15,9 / 5,4 · 15,9 |

### Lluvia digital sobre agua (`lluvia_agua`) — Física y movimiento, analítica, versión 1 · **nueva**

También: lluvia digital, lluvia de código, digital rain, ondas amortiguadas, impactos sobre el agua.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `consola` (nuevo) | Lluvia de consola sobre agua | lluvia digital, matrix rain | ∞ Continuo | terminal/consola, fondos/ondas | no | 12,3 · 53,5 / 10,4 · 52,7 / 10,9 · 52,0 / 12,5 · 59,0 / 12,1 · 54,1 |
| `aguacero` (nuevo) | Aguacero digital | tormenta de datos | ∞ Continuo | fondos/ondas, terminal/consola | no | 15,6 · 43,7 / 15,6 · 39,7 / 16,7 · 45,2 / 15,3 · 40,4 / 15,7 · 41,7 |
| `estanque` (nuevo) | Gotas sobre el estanque | ondas en el agua quieta | ∞ Continuo | fondos/ondas | no | 13,1 · 63,7 / 12,5 · 65,3 / 12,4 · 66,4 / 13,1 · 68,6 / 12,8 · 63,2 |
| `espejo` (nuevo) | Espejo de código | reflejo del código | ∞ Continuo | terminal/consola, fondos/ondas | no | 14,9 · 77,1 / 12,5 · 78,9 / 15,1 · 83,3 / 14,5 · 80,3 / 13,7 · 78,0 |

### Tejido de bandas (`tejido_bandas`) — Forma y geometría, analítica, versión 1 · **nueva**

También: tejido, telar, urdimbre y trama, ligamento, tafetán, sarga, weave.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `oro_verde` (nuevo) | Bandas de oro y verde | tejido en bloques, franjas de colores | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 5,1 · 95,2 / 5,0 · 95,3 / 3,9 · 92,8 / 4,6 · 94,8 / 4,7 · 93,2 |
| `sarga` (nuevo) | Sarga en diagonal | tela vaquera, twill | ∞ Continuo | fondos/geometricas, fondos/materia | no | 6,4 · 94,6 / 6,5 · 90,6 / 5,7 · 93,8 / 5,6 · 94,7 / 5,6 · 94,8 |
| `cuadros` (nuevo) | Cuadros que se cruzan | tafetán a cuadros, tela escocesa | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 3,4 · 96,6 / 6,8 · 87,5 / 2,3 · 93,8 / 5,5 · 100,0 / 2,4 · 93,8 |
| `seda` (nuevo) | Cinta de seda | raso, cintas entrelazadas | ∞ Continuo | arte/geometricas, fondos/materia | no | 3,3 · 98,3 / 2,9 · 96,7 / 2,8 · 96,6 / 2,4 · 96,8 / 11,3 · 96,2 |

### Estática de barras (`estatica_vhs`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: barras de color, carta de ajuste, VHS, error de seguimiento, tracking, líneas de barrido, estática.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `carta` (nuevo) | Carta de ajuste que se derrite | barras de color, carta de ajuste | ↻ Bucle (12 s) | terminal/consola, arte/geometricas, fondos/color | no | 3,1 · 90,9 / 4,5 · 93,1 / 3,1 · 90,9 / 3,1 · 90,9 / 3,1 · 90,9 |
| `cinta` (nuevo) | Cinta gastada | VHS gastado, error de seguimiento | ↻ Bucle (8 s) | terminal/consola, fondos/color | no | 5,2 · 96,8 / 8,7 · 97,4 / 7,5 · 97,7 / 5,2 · 96,8 / 5,2 · 96,8 |
| `deshielo` (nuevo) | Deshielo de color | barras que gotean | ↻ Bucle (20 s) | arte/geometricas, fondos/color | no | 1,5 · 88,3 / 2,5 · 91,6 / 1,5 · 88,3 / 1,5 · 88,3 / 1,5 · 88,3 |
| `paleta` (nuevo) | Barras de neón | barras de tu paleta | ↻ Bucle (16 s) | fondos/color, arte/geometricas | no | 2,8 · 67,9 / 6,5 · 75,7 / 5,6 · 74,3 / 4,4 · 72,9 / 4,4 · 72,9 |

### Estratos (`estratos`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: estratos plegados, pliegues y fallas, corte geológico, sedimentos, anticlinal, sinclinal.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `canon` (nuevo) | Paredes de cañón | estratos de arenisca, corte geológico | ∞ Continuo | fondos/organicas, arte/organicas | no | 3,3 · 100,0 / 3,9 · 100,0 / 3,3 · 100,0 / 3,3 · 100,0 / 3,7 · 100,0 |
| `plegado` (nuevo) | Pliegues apretados | anticlinal y sinclinal | ∞ Continuo | fondos/organicas, arte/organicas | no | 7,8 · 100,0 / 7,7 · 100,0 / 7,8 · 100,0 / 7,6 · 100,0 / 8,5 · 100,0 |
| `fallas` (nuevo) | Fallas en escalera | fallas normales, bloques desplazados | ∞ Continuo | fondos/geometricas, arte/organicas | no | 3,1 · 100,0 / 3,2 · 100,0 / 3,7 · 100,0 / 3,1 · 100,0 / 4,5 · 100,0 |
| `acuarela` (nuevo) | Capas de acuarela | estratos pintados, sedimentos de colores | ∞ Continuo | fondos/color, fondos/organicas | no | 2,7 · 100,0 / 2,6 · 100,0 / 2,6 · 100,0 / 3,2 · 100,0 / 2,2 · 100,0 |

### Puntos en órbita (`puntos_orbita`) — Forma y geometría, analítica, versión 1 · **nueva**

También: órbita de puntos, dot orbit, celdas de Voronoi, trama de puntos que giran.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `confeti` (nuevo) | Confeti en órbita | puntos que giran | ∞ Continuo | fondos/geometricas, arte/geometricas | no | 1,9 · 91,4 / 1,9 · 91,0 / 1,9 · 90,8 / 1,8 · 90,6 / 1,8 · 79,6 |
| `reloj` (nuevo) | Engranaje de puntos | rejilla regular de órbitas | ∞ Continuo | fondos/geometricas, terminal/figuras | no | 2,4 · 38,3 / 2,5 · 38,3 / 2,5 · 38,3 / 2,5 · 38,1 / 2,3 · 38,2 |
| `vitral` (nuevo) | Vitral con lunas | celdas de color con satélites | ∞ Continuo | fondos/color, arte/geometricas | no | 1,5 · 100,0 / 1,6 · 100,0 / 1,6 · 100,0 / 1,6 · 100,0 / 1,8 · 100,0 |
| `polvo` (nuevo) | Polvo que gira | nube de puntos finos | ∞ Continuo | fondos/geometricas, fondos/espacio | no | 4,8 · 32,0 / 4,6 · 32,5 / 4,8 · 32,3 / 4,7 · 33,3 / 4,8 · 33,4 |

### Anillo de humo (`anillo_humo`) — Física y movimiento, analítica, versión 1 · **nueva**

También: smoke ring, aro de humo, ruido polar, vórtice anular.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `aro` (nuevo) | Aro de humo | anillo de humo | ↻ Bucle (16 s) | arte/organicas, arte/figuras | sí | 3,1 · 14,1 / 2,5 · 14,2 / 2,1 · 14,4 / 3,3 · 15,8 / 3,3 · 15,8 |
| `incienso` (nuevo) | Incienso que se abre | humo que se deshilacha | ↻ Bucle (24 s) | arte/organicas, arte/figuras | sí | 3,5 · 12,6 / 2,5 · 12,3 / 2,8 · 11,7 / 3,5 · 12,6 / 3,5 · 12,6 |
| `corona` (nuevo) | Corona de fuego | anillo incandescente | ↻ Bucle (12 s) | arte/figuras, arte/optica | sí | 4,3 · 24,4 / 4,5 · 26,3 / 4,3 · 24,4 / 4,3 · 24,4 / 4,3 · 24,4 |
| `halo` (nuevo) | Halo frío | anillo de niebla | ↻ Bucle (20 s) | arte/organicas, arte/figuras | sí | 3,2 · 41,8 / 2,9 · 45,4 / 3,2 · 41,8 / 3,2 · 41,8 / 3,2 · 41,8 |

### Rejilla de puntos (`rejilla_puntos`) — Forma y geometría, analítica, versión 1 · **nueva**

También: campo de puntos, dots, malla de puntos en perspectiva, plano que ondula.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `campo` (nuevo) | Campo de puntos | rejilla de puntos que ondula | ∞ Continuo | fondos/geometricas, fondos/ondas | no | 13,3 · 22,9 / 13,1 · 22,7 / 13,1 · 22,8 / 13,3 · 22,5 / 12,8 · 22,6 |
| `marejada` (nuevo) | Marejada de puntos | olas de puntos | ∞ Continuo | fondos/ondas, terminal/consola | no | 9,8 · 18,3 / 10,0 · 18,9 / 9,6 · 18,5 / 9,9 · 18,6 / 10,0 · 18,3 |
| `gota` (nuevo) | Gota sobre la rejilla | onda circular de puntos | ∞ Continuo | fondos/geometricas, fondos/ondas | no | 16,0 · 27,9 / 15,3 · 28,1 / 16,0 · 28,0 / 14,7 · 27,1 / 15,7 · 28,4 |
| `llanura` (nuevo) | Llanura en calma | puntos casi quietos | ∞ Continuo | fondos/geometricas, fondos/espacio | no | 16,3 · 38,8 / 16,1 · 38,3 / 16,2 · 38,1 / 16,7 · 39,4 / 16,2 · 39,2 |

### Globo de constelaciones (`globo_puntos`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: globo de puntos, esfera de nodos, red sobre una esfera, globe, mapa de conexiones.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `red` (nuevo) | Red alrededor del mundo | globo de constelaciones | ↻ Bucle (40 s) | arte/figuras, terminal/figuras | sí | 3,8 · 16,1 / 4,0 · 16,1 / 4,0 · 16,9 / 3,8 · 16,1 / 3,8 · 16,1 |
| `nodos` (nuevo) | Esfera de nodos | puntos sobre una esfera | ↻ Bucle (60 s) | arte/figuras, arte/geometricas | sí | 5,2 · 19,6 / 5,4 · 19,8 / 5,2 · 19,6 / 5,2 · 19,6 / 5,2 · 19,6 |
| `rutas` (nuevo) | Rutas que vuelan | arcos sobre el globo | ↻ Bucle (30 s) | arte/figuras, terminal/figuras | sí | 3,0 · 10,1 / 3,0 · 10,1 / 3,0 · 10,1 / 3,0 · 10,1 / 3,0 · 10,1 |
| `malla` (nuevo) | Malla de constelaciones | red densa | ↻ Bucle (48 s) | arte/figuras, arte/geometricas | sí | 4,8 · 27,5 / 5,1 · 27,4 / 4,7 · 26,9 / 5,0 · 27,3 / 5,0 · 27,3 |

### Arcos parciales (`arcos_parciales`) — Forma y geometría, analítica, versión 1 · **nueva**

También: anillos incompletos, arcos que giran, rings, órbitas inclinadas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `orbitas` (nuevo) | Órbitas inclinadas | arcos parciales | ↻ Bucle (24 s) | arte/figuras, arte/geometricas | sí | 0,86 · 10,4 / 0,63 · 9,9 / 0,75 · 9,6 / 0,86 · 10,4 / 0,86 · 10,4 |
| `barrido` (nuevo) | Barrido de arcos | arcos planos | ↻ Bucle (16 s) | arte/geometricas, terminal/figuras | sí | 3,7 · 8,0 / 3,8 · 7,6 / 3,7 · 7,7 / 3,7 · 8,0 / 3,7 · 8,0 |
| `saturnal` (nuevo) | Anillos rotos | anillos muy inclinados | ↻ Bucle (18 s) | arte/figuras, arte/geometricas | sí | 0,73 · 10,3 / 0,64 · 12,0 / 0,44 · 9,7 / 0,64 · 12,0 / 0,44 · 9,7 |
| `engranaje` (nuevo) | Engranaje de arcos | arcos triples | ↻ Bucle (30 s) | arte/geometricas, arte/figuras | sí | 2,6 · 11,9 / 2,6 · 11,9 / 2,6 · 11,9 / 2,6 · 11,9 / 2,6 · 11,9 |

### Anillos de tronco (`anillos_tronco`) — Vida y química, analítica, versión 1 · **nueva**

También: anillos de crecimiento, corte de tronco, dendrocronología, madera, trunk.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tronco` (nuevo) | Tronco que respira | anillos de crecimiento | ∞ Continuo | fondos/organicas, arte/organicas | no | 24,4 · 99,5 / 23,4 · 99,5 / 23,6 · 99,6 / 25,1 · 99,5 / 23,8 · 99,5 |
| `rodaja` (nuevo) | Rodaja que crece | corte de tronco, el árbol engorda | ▣ Construcción | arte/organicas, arte/figuras | sí | 1,3 · 5,0 / 0,26 · 93,6 / 0,00 · 99,4 / 0,00 · 99,4 / 0,00 · 99,4 |
| `nudo` (nuevo) | Vetas apretadas | madera de crecimiento lento | ∞ Continuo | fondos/organicas, terminal/consola | no | 17,9 · 100,0 / 16,8 · 100,0 / 17,4 · 100,0 / 15,9 · 100,0 / 18,0 · 100,0 |
| `ondas` (nuevo) | Ondas de savia | anillos anchos y regulares | ∞ Continuo | fondos/organicas, arte/organicas | no | 15,4 · 100,0 / 15,5 · 100,0 / 15,1 · 100,0 / 15,0 · 100,0 / 15,0 · 100,0 |
