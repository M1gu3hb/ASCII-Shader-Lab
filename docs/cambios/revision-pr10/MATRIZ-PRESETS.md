# Matriz de familias y presets (revisión del PR #10)

Generada por `scripts/families-matrix.ts` desde las fichas de las familias (`src/families/meta/*.ts`), la referencia de los 86 presets publicados antes de esta revisión (`tests/unit/fixtures/families-v1.json`) y una ejecución de la sonda temporal (`scripts/families-time.ts --seeds=1 --res=def --times=0,30,60,120 --long=600`, Node, sin navegador). No se edita a mano.

- **39 familias** (23 de antes y 16 nuevas) y **203 presets** (86 de antes, con su id, y 117 nuevos).
- Contrato temporal: 146 continuos (∞), 20 en bucle exacto (↻) y 37 construcciones (▣).
- **Actividad**: por cada momento, el % medio de cambio del campo en el medio segundo siguiente (para las simulaciones, con la cámara quieta: el estado) y el % del campo con tinta. Una construcción termina quieta por definición (cambio 0 al final); un fondo lento está bien si sigue cambiando. Mide cambio y ocupación del campo que los motores convierten en glifos: no mide belleza ni fotogramas por segundo en un dispositivo real. Las analíticas se muestrean en 96 × 48 con la escala de su capa.
- **Usos**: dónde lo ofrece la biblioteca (`espacio/sección`); el mismo preset puede estar en varios espacios con el mismo id. **Figura**: se dibuja en el centro (en lienzos verticales se ajusta al ancho); Fondos sólo ofrece lo que no lo es.
- Las decisiones, el antes y el después y lo que quedó sin resolver de cada grupo están en `docs/cambios/revision-familias/`.

### Reacción–difusión (`reaccion_difusion`) — Vida y química, simulación, versión 2

También: Gray–Scott, Gray-Scott, reacción difusión, reaction–diffusion, patrones de Turing, Pearson.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `coral` | Coral químico | coral growth | ▣ Construcción | arte/organicas | no | — |
| `mitosis` | Células que se dividen | Mitosis | ▣ Construcción | arte/organicas | no | — |
| `laberinto` | Laberinto | huella dactilar, maze | ▣ Construcción | arte/organicas, tipo/texturas | no | — |
| `caos` | Caos que respira | caos, chaos | ∞ Continuo | fondos/vivas | no | — |
| `coral_vivo` (nuevo) | Coral que respira | coral continuo, heridas que sanan | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |
| `laberinto_vivo` (nuevo) | Laberinto que se rehace | laberinto continuo, mareas | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |
| `celulas` (nuevo) | Células sin fin | mitosis continua | ∞ Continuo | fondos/vivas | no | — |
| `corrientes` (nuevo) | Corrientes de puntos | franjas, gradiente de Pearson | ∞ Continuo | fondos/organicas | no | — |
| `isla` (nuevo) | Isla que respira | isla, máscara | ∞ Continuo | arte/organicas | no | — |

### Physarum (`physarum`) — Vida y química, simulación, versión 1

También: Physarum, moho mucilaginoso, slime mould, Jeff Jones, red de transporte.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `venacion` | Venación | — | ∞ Continuo | fondos/organicas, arte/organicas | no | — |
| `membrana` | Membrana | espuma | ∞ Continuo | fondos/organicas | no | — |
| `red` | Red eléctrica | — | ∞ Continuo | fondos/geometricas, fondos/organicas | no | — |
| `meandros` | Meandros | — | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |
| `rehecha` (nuevo) | Red que se rehace | red viva, red de transporte | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |

### Lenia (`lenia`) — Vida y química, simulación, versión 2

También: Lenia, Bert Chan, autómata celular continuo, continuous cellular automaton, vida artificial.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `orbium` | Nadadores | Orbium, banco de criaturas | ∞ Continuo | arte/organicas | no | — |
| `colonia` | Colonia | — | ▣ Construcción | arte/organicas | no | — |
| `anulares` | Anillos que nadan | Organismos anulares | ∞ Continuo | arte/organicas | no | — |
| `sopa` | Sopa primordial | gusanos | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |
| `enjambre` (nuevo) | Enjambre | bacilos, bacterias | ∞ Continuo | fondos/vivas, fondos/organicas | no | — |

### Autómatas celulares (`automata`) — Vida y química, simulación, versión 1

También: autómata celular, Juego de la vida, Conway, Life-like, Generations.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `vida` | Vida clásica | Juego de la vida, Conway, Game of Life | ▣ Construcción | arte/geometricas, terminal/consola | no | — |
| `cerebro` | Chispas | Cerebro, Brian's Brain | ∞ Continuo | fondos/vivas, terminal/consola | no | — |
| `diaynoche` | Continentes | Día y noche, Day and Night | ▣ Construcción | arte/geometricas, terminal/consola | no | — |
| `pasadizos` | Pasadizos | laberinto, Maze | ▣ Construcción | arte/geometricas, terminal/consola | no | — |
| `pasillos` (nuevo) | Pasillos que se rehacen | laberinto continuo, Maze | ∞ Continuo | fondos/geometricas, terminal/consola, tipo/texturas | no | — |
| `vida_lluvia` (nuevo) | Vida que no se apaga | Juego de la vida, Conway, Game of Life | ∞ Continuo | fondos/vivas, terminal/consola | no | — |

### Osciladores acoplados (`kuramoto`) — Vida y química, simulación, versión 2

También: Kuramoto, Sakaguchi, osciladores de fase, sincronización, ondas espirales.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `remolinos` | Remolinos de fase | espirales de fase | ∞ Continuo | fondos/ondas | no | — |
| `sincronizado` | Ondas que cruzan | Campo sincronizado, ondas viajeras | ∞ Continuo | fondos/ondas | no | — |
| `destellos` | Destellos | luciérnagas | ∞ Continuo | fondos/vivas | no | — |
| `turbulencia` | Turbulencia | vórtices, defectos de fase | ∞ Continuo | fondos/vivas | no | — |
| `espirales` (nuevo) | Espirales de luz | ondas espirales, frentes de onda | ∞ Continuo | fondos/ondas, arte/curvas, terminal/consola | no | — |

### Agregación (DLA) (`dla`) — Vida y química, simulación, versión 1

También: DLA, agregación limitada por difusión, diffusion-limited aggregation, Witten–Sander, dendritas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `cristal` | Cristalización | — | ▣ Construcción | arte/organicas | no | — |
| `coral` | Arrecife | — | ▣ Construcción | arte/organicas | no | — |
| `raices` | Raíces eléctricas | — | ▣ Construcción | arte/organicas | no | — |
| `corona` | Corona | — | ▣ Construcción | arte/organicas | no | — |
| `colonias` | Colonias | — | ▣ Construcción | arte/organicas, tipo/texturas | no | — |
| `escarcha` (nuevo) | Escarcha viva | DLA en baño, sublimación, nucleación | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | — |
| `arrecife` (nuevo) | Arrecife sin fin | DLA desde una línea, dominio que avanza | ∞ Continuo | fondos/organicas, arte/organicas | no | — |
| `corona_viva` (nuevo) | Corona que respira | DLA en anillo, sublimación | ∞ Continuo | arte/organicas | no | — |

### Crecimiento diferencial (`crecimiento`) — Vida y química, simulación, versión 1

También: crecimiento diferencial, differential growth, differential line, inconvergent.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `coral` | Coral plegado | — | ▣ Construcción | arte/organicas | no | — |
| `corteza` | Corteza | — | ▣ Construcción | arte/organicas, tipo/texturas | no | — |
| `colonia` | Colonia de pliegues | — | ▣ Construcción | arte/organicas, tipo/texturas | no | — |
| `medusa` | Tentáculos radiales | — | ▣ Construcción | arte/organicas | no | — |
| `coral_vivo` (nuevo) | Arrecife que se renueva | crecimiento diferencial con renovación, coral plegado | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |
| `meandros` (nuevo) | Meandros sin fin | crecimiento diferencial con historia, corteza | ∞ Continuo | fondos/organicas, arte/organicas | no | — |
| `colonia_viva` (nuevo) | Pliegues que se relevan | crecimiento diferencial con renovación, colonia de pliegues | ∞ Continuo | fondos/organicas, arte/organicas | no | — |

### Fluido 2D (`fluido`) — Física y movimiento, simulación, versión 1

También: Fluidos estables de Stam, Navier–Stokes incompresible, Simulación de fluidos, Tinta, Humo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tinta_agua` | Tinta en agua | Gotas de tinta, Inestabilidad de Rayleigh–Taylor | ∞ Continuo | fondos/organicas, arte/organicas | no | — |
| `marmol` (nuevo) | Mármol líquido | Marmoleado, Suminagashi, Ebru, Advección de un escalar pasivo | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | — |
| `manchas` (nuevo) | Manchas de tinta | Dos líquidos que no se mezclan, Allen–Cahn, Separación de fases | ∞ Continuo | fondos/organicas, arte/organicas, tipo/texturas | no | — |
| `corriente` (nuevo) | Corriente en capas | Calle de vórtices de Kármán, Flujo en un canal con obstáculos | ∞ Continuo | fondos/organicas, fondos/ondas | no | — |
| `humo_neon` | Humo de neón | Penacho por flotación | ∞ Continuo | fondos/organicas, arte/organicas | no | — |
| `humo_curvas` (nuevo) | Humo en curvas de nivel | Isolíneas de concentración | ∞ Continuo | fondos/organicas, arte/curvas, tipo/texturas | no | — |
| `tormenta` | Tormenta de vórtices | Refuerzo de vorticidad, Turbulencia | ∞ Continuo | fondos/organicas | no | — |
| `pilares` | Estela entre pilares | Calle de vórtices de Kármán, Vorticidad | ∞ Continuo | fondos/organicas, arte/organicas | no | — |

### Agua interactiva (`agua`) — Física y movimiento, simulación, versión 2

También: Ecuación de ondas, Cáusticas, Refracción, Agua.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `piscina` | Piscina con cáusticas | Cáusticas sobre baldosas | ∞ Continuo | fondos/ondas | no | — |
| `destellos` (nuevo) | Luz bajo el agua | Cáusticas, Red de luz | ∞ Continuo | fondos/ondas, tipo/texturas | no | — |
| `lluvia` | Lluvia sobre el estanque | Anillos de lluvia | ∞ Continuo | fondos/ondas | no | — |
| `canal` | Ondas en un canal | Doble rendija, Interferencia, Difracción | ∞ Continuo | fondos/ondas, arte/optica | no | — |

### Terreno que se erosiona (`erosion`) — Física y movimiento, simulación, versión 1

También: Erosión hidráulica, Erosión térmica, Levantamiento tectónico, Red de drenaje, Mapa de ríos.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `rios` (nuevo) | Mapa de ríos | Red de drenaje, Erosión y levantamiento | ∞ Continuo | fondos/organicas, fondos/materia, tipo/texturas | no | — |
| `costa` (nuevo) | Costa tallada | Relieve sombreado, Erosión y levantamiento | ∞ Continuo | fondos/materia | no | — |
| `montana` (nuevo) | Montaña viva | Levantamiento tectónico, Equilibrio dinámico | ∞ Continuo | arte/figuras | sí | — |
| `barrancos` | Barrancos | Erosión hidráulica | ▣ Construcción | arte/figuras | sí | — |
| `delta` | Ríos y delta | Sedimentación, Delta fluvial | ▣ Construcción | arte/figuras | sí | — |
| `mesetas` | Mesetas | Estratos, Terrazas, Erosión térmica | ▣ Construcción | arte/figuras | sí | — |

### Bandadas (boids) (`boids`) — Física y movimiento, simulación, versión 1

También: Boids, Reynolds, Bandada, Cardumen, Enjambre.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `murmuracion` | Murmuración | Bandada de estorninos | ∞ Continuo | fondos/vivas, fondos/organicas | no | — |
| `estelas` (nuevo) | Estelas de bandada | Rastros de boids | ∞ Continuo | fondos/vivas, fondos/organicas, arte/curvas | no | — |
| `cardumen` | Cardumen | Banco de peces, Depredador y presa | ∞ Continuo | fondos/vivas | no | — |
| `dispersion` | Dispersión | Poca cohesión | ∞ Continuo | fondos/vivas, tipo/texturas | no | — |

### Gravedad N-cuerpos (`gravedad`) — Física y movimiento, simulación, versión 1

También: N-body, Problema de los N cuerpos, Gravitación de Newton, Galaxia, Ondas de densidad.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `galaxia` | Galaxia espiral | Ondas de densidad, Órbitas de Lindblad, Lin–Shu | ∞ Continuo | arte/figuras | sí | — |
| `remolino` (nuevo) | Remolino de tres brazos | Galaxia espiral de cerca, Ondas de densidad | ∞ Continuo | fondos/espacio, arte/figuras | no | — |
| `choque` | Choque de cúmulos | Esferas de Plummer, Fusión de cúmulos | ▣ Construcción | arte/figuras | sí | — |
| `colapso` | Colapso frío | Colapso gravitatorio, Relajación violenta | ▣ Construcción | arte/figuras | sí | — |
| `binaria` | Estrella doble con anillo | Disco circumbinario | ∞ Continuo | arte/figuras | sí | — |

### Telas y cuerpos blandos (`tela`) — Física y movimiento, simulación, versión 1

También: XPBD, Dinámica basada en posiciones, Tela, Simulación de ropa.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `velo` | Velo al viento | Tela colgada de dos esquinas | ∞ Continuo | arte/figuras | sí | — |
| `bandera` | Bandera | Tela en el mástil | ∞ Continuo | arte/figuras | sí | — |
| `membrana` | Membrana elástica | Cama elástica, Colisión con una esfera | ∞ Continuo | arte/figuras | sí | — |

### Chladni y cimática (`chladni`) — Física y movimiento, simulación, versión 1

También: Figuras de Chladni, Cimática, Modos de vibración, Ondas estacionarias.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `arena` (nuevo) | Arena en todo el lienzo | Placa rectangular, Figuras de Chladni | ∞ Continuo | fondos/geometricas, tipo/texturas | no | — |
| `placa` | Placa resonante | Placa cuadrada, Modo fijo | ▣ Construcción | arte/geometricas | sí | — |
| `flor` | Flor nodal | Placa circular, Funciones de Bessel | ▣ Construcción | arte/geometricas | sí | — |
| `mandala` (nuevo) | Mandala de arena | Placa circular con secuencia de modos | ∞ Continuo | arte/geometricas | sí | — |
| `musical` | Arena musical | Secuencia rápida de modos | ∞ Continuo | arte/geometricas | sí | — |

### Humo rizado (`humo`) — Física y movimiento, simulación, versión 1 · **nueva**

También: curl noise, ruido rizado, rotacional de ruido, partículas de humo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `espiritu` (nuevo) | Espíritu | espíritu de partículas | ∞ Continuo | arte/figuras, arte/organicas | no | — |
| `fumarola` (nuevo) | Fumarola | columna de humo | ∞ Continuo | arte/organicas, arte/figuras | no | — |
| `nebulosa` (nuevo) | Nebulosa rizada | nebulosa de ruido rizado | ∞ Continuo | fondos/espacio, arte/organicas | no | — |
| `seda` (nuevo) | Hilos de seda | filamentos de ruido rizado | ∞ Continuo | arte/organicas | no | — |

### Descargas eléctricas (`descargas`) — Física y movimiento, analítica, versión 1 · **nueva**

También: arcos eléctricos, arco voltaico, rayos, tormenta eléctrica, descarga de plasma.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `anillo` (nuevo) | Anillo de arcos | arco voltaico | ∞ Continuo | arte/optica, arte/figuras | sí | — |
| `plasma` (nuevo) | Esfera de plasma | globo de plasma | ∞ Continuo | arte/optica, arte/figuras | sí | — |
| `tormenta` (nuevo) | Tormenta seca | rayos cielo-tierra | ∞ Continuo | fondos/vivas, arte/organicas | no | — |
| `chispa` (nuevo) | Chispa entre dos | arco entre electrodos | ∞ Continuo | terminal/figuras, arte/optica | sí | — |

### Mar nocturno (`mar`) — Física y movimiento, analítica, versión 1 · **nueva**

También: mar de noche, reflejo de luna, estela de luna, olas de aguas profundas, Fresnel.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `lago` (nuevo) | Luna sobre el lago | estela de luna | ∞ Continuo | fondos/ondas | no | — |
| `mar_fondo` (nuevo) | Mar de fondo | marejada | ∞ Continuo | fondos/ondas | no | — |
| `plancton` (nuevo) | Plancton | bioluminiscencia | ∞ Continuo | fondos/ondas, fondos/organicas | no | — |
| `plata` (nuevo) | Marea de plata | camino de luna | ∞ Continuo | fondos/ondas | no | — |

### Sistemas L (`sistema_l`) — Forma y geometría, geometría, versión 1

También: sistema de Lindenmayer, L-system, gramática de reescritura, tortuga, fractal de plantas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `helecho` | Helecho recursivo | — | ▣ Construcción | arte/organicas, arte/curvas | sí | — |
| `arbol3d` | Bosque de símbolos | árbol 3D | ▣ Construcción | arte/organicas, arte/figuras | sí | — |
| `raices` | Raíces | — | ▣ Construcción | arte/organicas | sí | — |
| `dragon` | Curva del dragón | Heighway, curva del dragón de Heighway | ▣ Construcción | arte/geometricas, arte/curvas | sí | — |
| `jardin` (nuevo) | Jardín que se renueva | helechos, sistema L en jardín | ∞ Continuo | arte/organicas, fondos/organicas | no | — |
| `raices_vivas` (nuevo) | Raíces que cuelgan | raíces, sistema L en jardín | ∞ Continuo | arte/organicas, fondos/organicas | no | — |
| `dragon_pliegue` (nuevo) | Dragón que se pliega | curva del dragón, plegado de papel, paperfolding, Heighway | ↻ Bucle (24 s) | arte/geometricas, arte/curvas | sí | — |

### Atractores extraños (`atractor`) — Forma y geometría, simulación, versión 2

También: atractor extraño, caos, Clifford, Peter de Jong, Lorenz, Thomas, Aizawa, Halvorsen.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `cintas` | Cintas plegadas | Cintas caóticas, atractor de Clifford | ∞ Continuo | arte/curvas | sí | — |
| `nube` | Velo enrollado | Nube orbital, atractor de Peter de Jong | ∞ Continuo | arte/curvas | sí | — |
| `lorenz` | Mariposa de estelas | Mariposa de Lorenz, atractor de Lorenz | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | — |
| `madeja` (nuevo) | Madeja | atractor de Thomas, Thomas | ∞ Continuo | arte/figuras, arte/curvas | sí | — |
| `ovillo` (nuevo) | Ovillo | atractor de Aizawa, Aizawa | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | — |
| `helice` (nuevo) | Hélice de tres aspas | atractor de Halvorsen, Halvorsen | ∞ Continuo | arte/figuras, arte/curvas | sí | — |

### Arquitectura por restricciones (`wfc`) — Forma y geometría, geometría, versión 1

También: Wave Function Collapse, WFC, colapso de función de onda, generación por restricciones, modelo de piezas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `placa` | Placa base | — | ▣ Construcción | arte/geometricas | no | — |
| `plano` | Plano de planta | — | ▣ Construcción | arte/geometricas | no | — |
| `acueducto` | Acueducto | — | ▣ Construcción | arte/geometricas | no | — |
| `laberinto` | Ciudad densa | — | ▣ Construcción | arte/geometricas, tipo/texturas | no | — |
| `placa_sin_fin` (nuevo) | Placa sin fin | WFC que avanza, circuitos | ∞ Continuo | fondos/geometricas, terminal/consola | no | — |
| `viaducto` (nuevo) | Viaducto en marcha | WFC que avanza, acueducto | ∞ Continuo | fondos/geometricas | no | — |
| `ciudad_viva` (nuevo) | Ciudad que se rehace | WFC por zonas, plano de planta | ∞ Continuo | fondos/geometricas, tipo/texturas | no | — |
| `onda` | La onda que colapsa | mapa de entropía | ▣ Construcción | arte/geometricas | no | — |

### Teselación hiperbólica (`hiperbolico`) — Forma y geometría, analítica, versión 1

También: plano hiperbólico, disco de Poincaré, teselación {p,q}, Escher, límite circular.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `triangulos` | Rosetones | Triángulos {7,3}, teselación {7,3}, grupo de triángulos (2,3,7) | ∞ Continuo | arte/geometricas | sí | — |
| `cuadrados` | Red curva | Cuadrados {4,5}, teselación {4,5} | ↻ Bucle (32 s) | arte/geometricas, terminal/figuras | sí | — |
| `estrellas` | Estrellas que menguan | Estrellas {6,4}, teselación {6,4} | ∞ Continuo | arte/geometricas | sí | — |
| `espejo` | Disco y su reflejo | Pentágonos y su reflejo {5,4}, teselación {5,4} | ↻ Bucle (20 s) | arte/geometricas, arte/optica | sí | — |
| `relieve` (nuevo) | Azulejos en relieve | teselación {6,4} en relieve, disco de Poincaré | ∞ Continuo | arte/geometricas, arte/figuras | sí | — |
| `mosaico` (nuevo) | Mosaico que fluye | teselación {5,4} en relieve, plano hiperbólico | ↻ Bucle (32 s) | fondos/geometricas, tipo/texturas | no | — |

### Orden y caos (`orden_caos`) — Forma y geometría, simulación, versión 1 · **nueva**

También: transición de fase, fusión y cristalización, red cristalina, phase transition.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `fusion` (nuevo) | Fusión | frente de fusión | ∞ Continuo | arte/geometricas, fondos/geometricas | no | — |
| `radial` (nuevo) | Cristalización radial | nucleación, crecimiento de cristal | ∞ Continuo | arte/geometricas, fondos/geometricas | no | — |
| `onda` (nuevo) | Onda de calor | banda de fusión | ∞ Continuo | arte/geometricas, fondos/geometricas | no | — |

### Mosaico cinético (`mosaico`) — Forma y geometría, analítica, versión 1 · **nueva**

También: teselas que voltean, mosaico en ola, pared cinética, kinetic mosaic, split-flap.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `ola` (nuevo) | Ola de teselas | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | — |
| `anillos` (nuevo) | Anillos que voltean | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | — |
| `cartel` (nuevo) | Cartel de estadio | — | ∞ Continuo | arte/geometricas, fondos/geometricas | no | — |
| `dorado` (nuevo) | Mosaico dorado | — | ∞ Continuo | fondos/geometricas, arte/geometricas | no | — |
| `barrido` (nuevo) | Barrido de radar | — | ∞ Continuo | arte/geometricas, fondos/geometricas | no | — |

### Lacería (`laceria`) — Forma y geometría, analítica, versión 1 · **nueva**

También: estrellas entrelazadas, rosetas, girih, polígono estrellado, entrelazado alterno, tracería.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `nazari` (nuevo) | Azulejo de ocho | estrella de ocho puntas, dos cuadrados entrelazados | ↻ Bucle (32 s) | arte/geometricas, fondos/geometricas | no | — |
| `roseton` (nuevo) | Rosetón | rosa de doce | ↻ Bucle (32 s) | arte/geometricas | no | — |
| `traceria` (nuevo) | Tracería | hexagrama entrelazado | ∞ Continuo | fondos/geometricas, arte/geometricas | no | — |
| `diez` (nuevo) | Estrella de diez | decágono estrellado | ∞ Continuo | arte/geometricas | no | — |

### Osciloscopio que se degrada (`osciloscopio`) — Forma y geometría, analítica, versión 1 · **nueva**

También: osciloscopio, forma de onda, bit crush, recorte, modulación de frecuencia, traza de fósforo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `limpia` (nuevo) | Señal limpia | seno con deriva | ∞ Continuo | terminal/consola, arte/curvas | no | — |
| `interferencia` (nuevo) | Interferencia | ruido y reducción de bits | ∞ Continuo | terminal/consola, arte/curvas | no | — |
| `grito` (nuevo) | Grito | distorsión extrema | ∞ Continuo | arte/curvas | no | — |
| `fosforo` (nuevo) | Fósforo lento | persistencia de fósforo | ∞ Continuo | terminal/consola | no | — |

### Marco vivo (`marco`) — Forma y geometría, analítica, versión 1 · **nueva**

También: borde luminoso, marco animado, cometas en el perímetro, rectángulo redondeado.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `terminal` (nuevo) | Marco de terminal | borde de consola | ∞ Continuo | terminal/consola, arte/geometricas | no | — |
| `neon` (nuevo) | Neón doble | cometas opuestos | ∞ Continuo | arte/geometricas | no | — |
| `latido` (nuevo) | Latido | pulso | ∞ Continuo | arte/geometricas | no | — |
| `humo` (nuevo) | Humo de colores | marco con humo | ∞ Continuo | arte/geometricas | no | — |

### Fractales 3D (`fractal_3d`) — Figuras y espacio, analítica, versión 1

También: Mandelbulb, Mandelbox, Julia cuaterniónica, fractal 3D, ray marching.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `bulbo` | Bulbo | Bulbo clásico, Mandelbulb | ∞ Continuo | arte/figuras, arte/curvas | sí | — |
| `corte` | Bulbo abierto | Corte interior, Mandelbulb cortado | ↻ Bucle (50 s) | arte/figuras, arte/curvas | sí | — |
| `caja` | Caja plegada | Mandelbox | ↻ Bucle (10 s) | arte/figuras, arte/curvas, terminal/figuras | sí | — |
| `concha` (nuevo) | Concha | Julia cuaterniónica, conjunto de Julia 3D | ∞ Continuo | arte/figuras, arte/curvas, terminal/figuras | sí | — |
| `partida` (nuevo) | Concha partida | Julia cuaterniónica cortada | ∞ Continuo | arte/figuras, arte/curvas | sí | — |

### Nubes volumétricas (`nubes_vol`) — Figuras y espacio, analítica, versión 1

También: nubes, nube volumétrica, Beer–Lambert, Henyey–Greenstein, nebulosa, cielo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `banco` | Mar de nubes | Banco de nubes, nubes volumétricas | ∞ Continuo | fondos/organicas | no | — |
| `nebulosa` | Nebulosa | nebulosa de emisión, polvo interestelar | ∞ Continuo | fondos/espacio, arte/figuras | no | — |
| `haces` | Haces de luz | rayos crepusculares, dispersión de Mie | ∞ Continuo | fondos/organicas | no | — |
| `dentro` (nuevo) | Vuelo entre nubes | Nebulosa (dentro de la nube) | ∞ Continuo | fondos/organicas, tipo/texturas | no | — |

### Orbitales y superposiciones (`orbitales`) — Figuras y espacio, analítica, versión 1

También: orbital, orbitales atómicos, átomo de hidrógeno, función de onda, superposición cuántica.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `lobulos` | Lóbulos que laten | Lóbulos 3d, orbital 3dz², superposición 3d + 4f | ↻ Bucle (20 s) | arte/figuras, terminal/figuras | sí | — |
| `dipolo` | Nube pendular | Superposición 1s+2p (dipolo que oscila), dipolo, Lyman-alfa, superposición 1s + 2p | ↻ Bucle (4 s) | arte/figuras, terminal/figuras | sí | — |
| `anillos` | Anillos de cristal | Anillos 4f, orbital 4fz³, superposición 4f + 3p | ↻ Bucle (24 s) | arte/figuras | sí | — |
| `hibrido` | Faro | Híbrido sp (2s+2p), orbital híbrido sp | ∞ Continuo | arte/figuras, terminal/figuras | sí | — |
| `estrella` (nuevo) | Estrella de cristal | orbital 4fxyz, superposición 4f + 3d | ∞ Continuo | arte/figuras | sí | — |

### Agujero negro (`lente_gravitacional`) — Figuras y espacio, analítica, versión 1

También: lente gravitacional, Schwarzschild, disco de acreción, horizonte de sucesos, Gargantua.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `disco` | Disco doblado | Disco de acreción, Gargantua | ∞ Continuo | arte/figuras, terminal/figuras | sí | — |
| `rejilla` | Rejilla curvada | Lente sobre la rejilla, lente gravitacional, anillo de Einstein | ↻ Bucle (10 s) | arte/figuras, arte/optica | sí | — |
| `canto` | Disco de canto | De canto | ∞ Continuo | arte/figuras, arte/optica | sí | — |
| `remolino` (nuevo) | Remolino | disco de acreción visto desde arriba | ∞ Continuo | arte/figuras | sí | — |
| `cerca` (nuevo) | Al borde de la sombra | primer plano del horizonte, esfera de fotones | ∞ Continuo | arte/figuras | sí | — |

### Líneas de campo (`campos_em`) — Figuras y espacio, geometría, versión 1

También: campo eléctrico, campo magnético, Coulomb, Biot–Savart, líneas de fuerza, electromagnetismo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `dipolo` | Arcos entre dos cargas | Dipolo eléctrico | ▣ Construcción | arte/figuras | sí | — |
| `repulsion` | Cargas que se repelen | cargas iguales, equipotenciales | ▣ Construcción | arte/figuras | sí | — |
| `helmholtz` | Dos anillos y su flujo | Espiras de Helmholtz, bobinas de Helmholtz | ▣ Construcción | arte/figuras | sí | — |
| `cuadrupolo` | Cuatro polos cruzados | Cuadrupolo | ▣ Construcción | arte/figuras | sí | — |
| `iman` | Imán | dipolo magnético | ▣ Construcción | arte/figuras | sí | — |
| `dipolo_vivo` (nuevo) | Cargas que giran | dipolo eléctrico en movimiento, cargas en órbita | ∞ Continuo | arte/figuras, arte/curvas | sí | — |
| `espiras_vivas` (nuevo) | Espiras que laten | espiras de Helmholtz, corriente que se invierte, anti-Helmholtz | ∞ Continuo | arte/figuras | sí | — |
| `imanes` (nuevo) | Imanes que bailan | dipolos magnéticos, reconexión de líneas | ∞ Continuo | arte/figuras, arte/curvas | sí | — |

### Cámara de niebla (`niebla`) — Figuras y espacio, simulación, versión 1 · **nueva**

También: cloud chamber, cámara de Wilson, cámara de burbujas, fuerza de Lorentz, trazas de partículas.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `burbujas` (nuevo) | Cámara de burbujas | espirales de electrones | ∞ Continuo | terminal/consola, arte/curvas | no | — |
| `cosmicos` (nuevo) | Rayos cósmicos | muones cósmicos | ∞ Continuo | terminal/consola, fondos/espacio | no | — |
| `pares` (nuevo) | Lluvia de pares | creación de pares | ∞ Continuo | terminal/consola, arte/curvas | no | — |
| `fuente` (nuevo) | Fuente alfa | desintegración alfa | ∞ Continuo | terminal/consola | no | — |

### Hipercubo (`hipercubo`) — Figuras y espacio, analítica, versión 1 · **nueva**

También: teseracto, tesseract, 16 celdas, 24 celdas, politopo 4D, proyección 4D.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `teseracto` (nuevo) | Teseracto | hipercubo que gira | ↻ Bucle (40 s) | arte/figuras, terminal/figuras | sí | — |
| `reves` (nuevo) | Del revés | el cubo interior pasa afuera | ↻ Bucle (20 s) | arte/figuras | sí | — |
| `celdas24` (nuevo) | Veinticuatro celdas | icositetracoro | ↻ Bucle (60 s) | arte/figuras | sí | — |
| `celdas16` (nuevo) | Dieciséis celdas | hexadecacoro, ortoplex 4D | ↻ Bucle (48 s) | arte/figuras, terminal/figuras | sí | — |

### Corrientes de color (`corrientes`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: mesh gradient, degradado de malla, gradiente de malla, interpolación de Shepard.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `neon` (nuevo) | Corrientes de neón | — | ∞ Continuo | fondos/color | no | — |
| `atardecer` (nuevo) | Atardecer líquido | — | ∞ Continuo | fondos/color | no | — |
| `marmolada` (nuevo) | Tinta marmolada | — | ∞ Continuo | fondos/color, arte/organicas | no | — |
| `boreal` (nuevo) | Velo boreal | — | ∞ Continuo | fondos/color | no | — |
| `remolino` (nuevo) | Remolino cromático | — | ∞ Continuo | fondos/color, arte/optica | no | — |

### Ecos y realimentación (`ecos`) — Color, materia y óptica, simulación, versión 1 · **nueva**

También: video feedback, realimentación de vídeo, feedback loop, bucle de realimentación, droste.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `tinta` (nuevo) | Tinta recursiva | laberintos de Turing por realimentación | ∞ Continuo | fondos/organicas, arte/optica | no | — |
| `espejos` (nuevo) | Espejos | caleidoscopio recursivo, droste | ∞ Continuo | fondos/materia, arte/optica | no | — |
| `tunel` (nuevo) | Túnel de ecos | túnel de realimentación | ∞ Continuo | fondos/espacio, arte/optica | no | — |
| `huracan` (nuevo) | Huracán | remolino de realimentación, espiral logarítmica | ∞ Continuo | fondos/espacio, arte/optica | no | — |
| `marea` (nuevo) | Marea de ecos | realimentación con trama | ∞ Continuo | fondos/materia | no | — |

### Membrana iridiscente (`membrana`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: película delgada, interferencia de película delgada, thin-film interference, pompa de jabón, iridiscencia, colores de Newton.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `jabon` (nuevo) | Lámina de jabón | película de jabón que drena | ∞ Continuo | fondos/materia, fondos/color | no | — |
| `pompa` (nuevo) | Pompa flotante | burbuja de jabón | ∞ Continuo | arte/figuras | no | — |
| `aceite` (nuevo) | Aceite en el asfalto | mancha de aceite sobre agua | ∞ Continuo | fondos/materia | no | — |
| `pliegues` (nuevo) | Pliegues de seda | — | ∞ Continuo | fondos/materia, fondos/color | no | — |
| `nacar` (nuevo) | Nácar en tus colores | interferencia sobre la paleta | ∞ Continuo | fondos/color | no | — |

### Paneles prismáticos (`paneles`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: paneles de color, láminas translúcidas, composición alfa de atrás adelante, color panels.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `vidrieras` (nuevo) | Vidrieras que giran | — | ↻ Bucle (60 s) | fondos/color, fondos/materia | no | — |
| `abanico` (nuevo) | Abanico de cristal | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | — |
| `noria` (nuevo) | Noria de color | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | — |
| `puerta` (nuevo) | Puerta giratoria | — | ↻ Bucle (60 s) | arte/geometricas, arte/figuras | no | — |

### Cromado en tramas (`cromado`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: bandas cromadas, reflejo metálico, campo de borde, dispersión cromática.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `gota` (nuevo) | Gota de cromo | gota cromada | ∞ Continuo | arte/optica, arte/figuras | sí | — |
| `lamina` (nuevo) | Lámina de cromo | cromo líquido, campo de bandas | ∞ Continuo | fondos/materia | no | — |
| `mercurio` (nuevo) | Mercurio vivo | metabolas cromadas | ∞ Continuo | arte/organicas, arte/optica | sí | — |
| `anillo` (nuevo) | Anillo de oro | oro pulido | ∞ Continuo | arte/geometricas, arte/optica | sí | — |
| `prisma` (nuevo) | Rombo prismático | aberración cromática | ∞ Continuo | arte/geometricas, arte/optica | sí | — |

### Superficie que se abre (`desgarro`) — Color, materia y óptica, analítica, versión 1 · **nueva**

También: papel rasgado, desgarro, quemado, máscara de desgarro, fBm anisótropo.

| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |
|---|---|---|---|---|---|---|
| `grietas` (nuevo) | Grietas de luz | desgarros desfasados | ∞ Continuo | fondos/materia, arte/organicas | no | — |
| `rasgado` (nuevo) | Papel rasgado | torn paper | ∞ Continuo | arte/organicas, arte/optica | no | — |
| `quemado` (nuevo) | Película que arde | burning film, quemado | ∞ Continuo | fondos/materia, arte/organicas | no | — |
| `trama` (nuevo) | Trama descubierta | revelado de trama | ∞ Continuo | fondos/materia, arte/optica | no | — |
| `velo` (nuevo) | Velo de color | corrientes detrás | ∞ Continuo | fondos/color, fondos/materia | no | — |
