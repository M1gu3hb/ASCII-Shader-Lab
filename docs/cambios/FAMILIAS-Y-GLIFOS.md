# Familias visuales y «Crea tus GLYPHOS»: registro de cambios

Fecha: 9 de octubre de 2026. Rama: `claude/new-session-7hc315` (el encargo pedía `glyphos-familias-y-estudio-glifos`; el entorno obliga a trabajar y publicar en la rama asignada). Base: `deb3d87` (main, cierre de la auditoría).

Este registro dice qué se hizo, con qué decisiones, en qué archivos, con qué pruebas y con qué resultado; y, aparte, lo que **no** se hizo o quedó limitado. La investigación (licencias y referencias) está en [`docs/propuestas/INVESTIGACION-FAMILIAS-2026-10-09.md`](../propuestas/INVESTIGACION-FAMILIAS-2026-10-09.md) y el diseño del estudio de glifos en [`docs/propuestas/ESTUDIO-GLIFOS.md`](../propuestas/ESTUDIO-GLIFOS.md). El contrato técnico para escribir una familia está en [`docs/familias/CONTRATO.md`](../familias/CONTRATO.md).

## 1. Arquitectura de las familias

- **Tres contratos de ejecución** (`src/families/types.ts`): *analítica* (una función de posición y tiempo, en GLSL y con gemela en CPU), *geometría* (se construye y se dibuja; su estado es lo construido) y *simulación* (memoria: cada momento depende del anterior).
- **Anfitrión compartido** (`src/families/host.ts`): el mismo código de modelo corre en el motor WebGL 2 y en el motor básico; el raster que produce (2 × filas columnas) se muestrea igual en los dos (`src/families/sample.ts`). Paso fijo, semilla, versión del algoritmo y resolución explícitas. En vivo integra el tiempo de la pieza con un presupuesto por cuadro (y dice cuándo va lento); en los motores fijos (miniaturas, exportaciones) calcula el paso exacto de un momento, y volver atrás empieza de nuevo desde la base.
- **Receta formato 3** sólo cuando una capa usa una familia o la pieza usa un juego de glifos: las recetas de siempre siguen siendo idénticas byte a byte (formato 2). Un estudio anterior rechaza una receta 3 en lugar de dibujar otra cosa; una familia de versión más nueva se rechaza con un aviso.
- **Estado guardado** (`src/families/checkpoints.ts`): «Guardar estado» guarda una copia binaria del modelo en el navegador (IndexedDB propia), nombrada por su hash; viaja en proyectos y sesiones, no en enlaces (se dice).
- **Exportaciones desde una copia**: imagen, video y GIF nunca tocan la simulación del escenario. Video y GIF eligen empezar desde el estado actual o desde la semilla con su calentamiento definido; una familia con memoria **no promete bucle perfecto** (el fundido de bucle se desactiva para ella y el estudio lo explica).
- **Igualdad entre GPU**: no se promete igualdad binaria entre tarjetas; sí se comprueba que los dos motores de esta página dibujan lo mismo (abajo).
- **Carga diferida**: el código de cada familia es su propio fragmento; la primera vista no carga ningún modelo, ni el GLSL de las analíticas (el motor WebGL no compila hasta tenerlo y la clave del programa marca si falta), ni la prosa de las fichas (`meta/<id>.doc.ts`: explicación, límites, fuentes, pistas y descripción de presets, que llegan con el panel). El código exportado lleva sólo las familias que usa la pieza.
- **Peso de la primera vista del laboratorio** (prueba de presupuesto, < 1 100 000 bytes de JS): 1 092 200 bytes; la base sin familias, 988 788. El límite no se tocó; el margen quedó en unos 8 KB.
- **Parámetros de construcción**: cambiar uno (gramática, juego de piezas, población…) crea otra ejecución; deshacerlo recupera la anterior.

## 2. Inventario de las 23 familias

Generado desde las fichas de cada familia (`src/families/meta/*.ts`) y la comparación de motores de `scripts/families-qa.mjs --compare` (Chromium 141 con WebGL 2 por SwiftShader, sin GPU real; 480 × 270, celda 7, t = 6 s). **r** es la correlación de la luminancia de las celdas entre WebGL 2 y el motor básico; **glifos** el porcentaje de celdas con el mismo carácter. Las familias de raster dan 1,0000 / 100 %; las analíticas con gemela reducida (fractal 3D, nubes) lo declaran en su ficha y el estudio lo muestra en modo básico.

### Vida y química

#### Reacción–difusión (`reaccion_difusion`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Modelo de Gray–Scott sobre una rejilla: la sustancia A se alimenta, B la consume y se elimina; ambas se difunden a ritmos distintos. Las formas salen del equilibrio entre alimentación y eliminación, no de un dibujo.
- **Tiempo:** Evoluciona con memoria: cada momento depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (7):** Alimentación, Eliminación, Difusión de B, Escala, Siembra (reconstruye), Bordes, Vista.
- **Presets (4):** «Coral químico» — Ramas que crecen desde sus puntas hasta cubrir el campo. · «Mitosis» — Manchas que se estiran y se dividen una y otra vez. · «Laberinto» — Franjas que se curvan como una huella dactilar y llenan el campo. · «Caos que respira» — Manchas que nacen, chocan y se deshacen sin quedarse quietas nunca.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Sembrar, Borrar.
- **Presupuesto:** filas 64–256 (por defecto 96), 600 pasos/s, calentamiento 1200 pasos; límites: Rejilla de 2 × filas columnas con dos sustancias en coma flotante (16 bytes por celda con el doble búfer); laplaciano de 9 puntos.
- **Evidencia:** la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): coral: r=1.0000 glifos=100.0%; mitosis: r=1.0000 glifos=100.0%; laberinto: r=1.0000 glifos=100.0%; caos: r=1.0000 glifos=100.0%.
- **Fuentes:** [Karl Sims: tutorial de reacción–difusión](https://www.karlsims.com/rd.html) · [Karl Sims: RD Tool](https://www.karlsims.com/rdtool.html) · [Pearson (1993): Complex Patterns in a Simple System](https://arxiv.org/abs/patt-sol/9304003)

#### Physarum (`physarum`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Modelo de Jeff Jones del moho mucilaginoso: cada agente mira con tres sensores hacia delante, gira hacia donde hay más rastro y avanza si la celda está libre, dejando más rastro. El rastro se difunde y se evapora, así que los caminos usados se refuerzan y los demás se borran: la red sale de esa realimentación.
- **Tiempo:** Evoluciona con memoria: la red se reorganiza sin parar a partir de lo que hubo antes. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (9):** Ángulo de los sensores, Alcance, Giro, Paso, Población (reconstruye), Depósito, Evaporación, Difusión, Inicio (reconstruye).
- **Presets (4):** «Venación» — Un disco de agentes que se recoge en un nudo central y extiende venas que se ramifican y se unen. · «Membrana» — Celdas cerradas como una espuma de paredes brillantes que se reacomoda. · «Red eléctrica» — Pocos agentes que miran lejos y tienden hilos largos entre grandes celdas vacías. · «Meandros» — Venas finas y sinuosas con puntas sueltas, como un laberinto que no se cierra.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Atraer, Dispersar.
- **Presupuesto:** filas 48–192 (por defecto 96), 50 pasos/s, calentamiento 250 pasos; límites: Hasta 60 000 agentes (posición y rumbo en coma flotante) y un mapa de rastro de 2 × filas columnas con doble búfer; tres lecturas por agente y paso.
- **Evidencia:** `tests/unit/family-physarum.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): venacion: r=1.0000 glifos=100.0%; membrana: r=1.0000 glifos=100.0%; red: r=1.0000 glifos=100.0%; meandros: r=1.0000 glifos=100.0%.
- **Fuentes:** [Jones (2010): Characteristics of pattern formation and evolution in approximations of Physarum transport networks](https://doi.org/10.1162/artl.2010.16.2.16202) · [Sage Jenson: Physarum](https://cargocollective.com/sagejenson/physarum)

#### Lenia (`lenia`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Un autómata celular continuo de Bert Chan: cada celda mira a sus vecinas a través de un núcleo en forma de anillo y crece o se consume según lo cerca que esté esa suma de un valor ideal. Con el equilibrio justo aparecen organismos que se mueven solos.
- **Tiempo:** Evoluciona con memoria: las criaturas nacen, se desplazan y chocan sin repetirse. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (8):** Crecimiento (μ), Tolerancia (σ), Radio, Paso de tiempo, Núcleo, Siembra (reconstruye), Densidad (reconstruye), Vista.
- **Presets (4):** «Orbium» — Un banco de criaturas redondas que nadan juntas; si chocan, pueden deshacerse. · «Colonia» — Unas manchas crecen y se parten en células que acaban poblando todo el campo. · «Organismos anulares» — Un núcleo de tres anillos: criaturas con forma de aro que se desplazan despacio. · «Sopa primordial» — Ruido por todas partes que se ordena en gusanos que se empujan sin parar.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Sembrar, Borrar.
- **Presupuesto:** filas 64–256 (por defecto 128), 24 pasos/s, calentamiento 48 pasos; límites: Rejilla en potencia de dos (64, 128 o 256 filas; las filas pedidas se redondean) con un campo en coma flotante y dos espectros de media rejilla; dos FFT por paso. Las criaturas se crían en un vivero de 64 × 64 con 1000 pasos como mucho, una vez por regla.
- **Evidencia:** `tests/unit/family-lenia.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): orbium: r=1.0000 glifos=100.0%; colonia: r=1.0000 glifos=100.0%; anulares: r=1.0000 glifos=100.0%; sopa: r=1.0000 glifos=100.0%.
- **Fuentes:** [Chan (2019): Lenia — Biology of Artificial Life](https://arxiv.org/abs/1812.05433) · [Bert Chan: Lenia](https://chakazul.github.io/lenia.html)

#### Autómatas celulares (`automata`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Cada generación, una celda muerta nace si tiene tantas vecinas vivas como pide la regla (B) y una viva sobrevive si su número está en S; si no, muere. Con más de dos estados, la celda tarda varias generaciones en morir y deja un rastro que se apaga.
- **Tiempo:** Evoluciona por generaciones con memoria: cada una sale de la anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (8):** Regla, Regla propia, Vecindad, Densidad inicial (reconstruye), Siembra (reconstruye), Bordes, Velocidad, Estela.
- **Presets (4):** «Vida clásica» — El Juego de la vida de Conway: una sopa que se apaga en islas, osciladores y planeadores. · «Cerebro» — Tres estados: cada celda se enciende, se apaga y descansa; chispas que viajan y nunca se calman. · «Día y noche» — Lo vivo y lo muerto siguen la misma regla: continentes que se redondean y lagos que se cierran. · «Pasadizos» — Desde el centro crece un laberinto de pasillos de una celda hasta ocupar el campo.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Dibujar, Borrar.
- **Presupuesto:** filas 32–192 (por defecto 64), 30 pasos/s, calentamiento 90 pasos; límites: Rejilla de 2 × filas columnas con un estado y una edad por celda (2 bytes); hasta 30 generaciones por segundo y 16 estados.
- **Evidencia:** `tests/unit/family-automata.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): vida: r=1.0000 glifos=100.0%; cerebro: r=1.0000 glifos=100.0%; diaynoche: r=1.0000 glifos=100.0%; pasadizos: r=1.0000 glifos=100.0%.
- **Fuentes:** [Gardner (1970): The fantastic combinations of John Conway's new solitaire game «life»](https://web.stanford.edu/class/sts145/Library/life.pdf) · [LifeWiki: Life-like cellular automaton](https://conwaylife.com/wiki/Life-like_cellular_automaton) · [LifeWiki: Generations](https://conwaylife.com/wiki/Generations)

#### Osciladores acoplados (`kuramoto`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Modelo de Kuramoto sobre una rejilla: cada punto es un oscilador con su propia frecuencia y adelanta o atrasa su fase hacia la de sus vecinos. Con poco acoplamiento cada uno va a su ritmo; con más, se forman ondas, zonas sincronizadas y remolinos alrededor de puntos donde la fase no está definida.
- **Tiempo:** Evoluciona con memoria: la sincronía se gana y se pierde poco a poco. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (8):** Acoplamiento, Diversidad, Frecuencia media, Vecindad, Desfase, Ruido, Fase inicial (reconstruye), Vista.
- **Presets (4):** «Remolinos de fase» — Espirales que giran alrededor de puntos sin fase y se empujan en sus fronteras. · «Campo sincronizado» — Ondas largas que recorren el campo de lado a lado mientras todo late a la vez. · «Destellos» — Cada oscilador destella al cerrar su vuelta: frentes de luz que barren la oscuridad. · «Turbulencia» — Con mucho desfase las espirales se rompen: vórtices que nacen y se aniquilan sin parar.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Empujar fase.
- **Presupuesto:** filas 48–192 (por defecto 96), 20 pasos/s, calentamiento 200 pasos; límites: Rejilla de osciladores a media resolución (filas/2 × filas) con fase, frecuencia y destello en coma flotante; hasta 28 vecinos por nodo.
- **Evidencia:** `tests/unit/family-kuramoto.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): remolinos: r=1.0000 glifos=99.9%; sincronizado: r=1.0000 glifos=100.0%; destellos: r=1.0000 glifos=100.0%; turbulencia: r=1.0000 glifos=100.0%.
- **Fuentes:** [Kuramoto (1975), según Acebrón et al. (2005): The Kuramoto model](https://doi.org/10.1103/RevModPhys.77.137) · [Sakaguchi y Kuramoto (1986): A soluble active rotator model](https://doi.org/10.1143/PTP.76.576) · [Dirk Brockmann: Spin Wheels (Complexity Explorables)](https://www.complexity-explorables.org/explorables/spin-wheels/)

#### Agregación (DLA) (`dla`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Agregación limitada por difusión (Witten y Sander): cada caminante da pasos al azar por una rejilla y, cuando queda junto al agregado, se pega con cierta probabilidad. Las puntas atrapan a casi todos los caminantes antes de que entren en los huecos, y por eso salen ramas.
- **Tiempo:** Crece con memoria, partícula a partícula. Cuando llega al borde lejano o cubre un 35 % del campo deja de crecer y queda quieta. No repite un bucle.
- **Controles (7):** Semilla (reconstruye), Adherencia, Deriva, Crece hacia, Caminantes, Grosor, Brillo por edad.
- **Presets (5):** «Cristalización» — Un copo dendrítico desde un punto: ramas finas que se abren hacia los lados. · «Arrecife» — Desde el suelo, con poca adherencia: ramas gruesas y apretadas que compiten por subir. · «Raíces eléctricas» — Desde arriba, con una corriente leve: pocas descargas largas que bajan en zigzag. · «Corona» — Un anillo del que brotan rayos ramificados hacia fuera; el interior queda vacío. · «Colonias» — Varias semillas que crecen a la vez y se cierran el paso.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Semilla.
- **Presupuesto:** filas 48–160 (por defecto 64), 30 pasos/s, calentamiento 90 pasos; límites: Rejilla de 2 × filas columnas (9 bytes por celda); hasta 400 caminantes con 24 movimientos cada uno por paso; se detiene al 35 % de celdas.
- **Evidencia:** `tests/unit/family-dla.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): cristal: r=1.0000 glifos=100.0%; coral: r=1.0000 glifos=100.0%; raices: r=1.0000 glifos=100.0%; corona: r=1.0000 glifos=100.0%; colonias: r=1.0000 glifos=100.0%.
- **Fuentes:** [Witten y Sander (1981): Diffusion-Limited Aggregation](https://doi.org/10.1103/PhysRevLett.47.1400) · [Paul Bourke: DLA](https://paulbourke.net/fractals/dla/) · [Jason Webb: experimentos de DLA (sólo el algoritmo)](https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments)

#### Crecimiento diferencial (`crecimiento`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** La curva es una cadena de nodos. Cada nodo se acerca a sus vecinos de la cadena, se alinea con ellos y se aparta de cualquier nodo demasiado cercano. Cuando un tramo se estira más de la cuenta se parte en dos: la curva gana longitud, no le cabe y se pliega.
- **Tiempo:** Crece con memoria: cada paso parte del anterior. Cuando la curva ya cubre su límite (o llega a 6000 nodos) deja de crecer, se asienta unos segundos y queda quieta. No repite un bucle.
- **Controles (8):** Separación, Atracción, Alineación, Arista máxima, Brotes, Forma inicial (reconstruye), Límite, Vista.
- **Presets (4):** «Coral plegado» — Un círculo que se pliega hasta llenar su disco, con el interior relleno. · «Corteza» — Una línea anclada de lado a lado que se arruga despacio en meandros y deja la estela de sus pliegues. · «Colonia de pliegues» — Varias semillas que crecen, se encuentran y se empujan sin cruzarse. · «Tentáculos radiales» — Una estrella que se expande deprisa: los pliegues salen del centro en rayos hasta el borde.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–256 (por defecto 96), 30 pasos/s, calentamiento 150 pasos; límites: Hasta 6000 nodos en 12 curvas; vecinos por rejilla espacial; un búfer de historia de 2 × filas × filas en coma flotante.
- **Evidencia:** `tests/unit/family-crecimiento.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): coral: r=1.0000 glifos=100.0%; corteza: r=1.0000 glifos=100.0%; colonia: r=1.0000 glifos=100.0%; medusa: r=1.0000 glifos=100.0%.
- **Fuentes:** [Anders Hoff (inconvergent): Differential Line](https://inconvergent.net/generative/differential-line/) · [Jason Webb: experimentos de crecimiento diferencial (sólo el algoritmo)](https://github.com/jasonwebb/2d-differential-growth-experiments)

### Física y movimiento

#### Fluido 2D (`fluido`)

- **Tipo:** simulación con memoria; versión del algoritmo 1. Amplía el patrón `campo_flujo`.
- **Mecanismo:** Fluidos estables de Stam sobre una rejilla: la velocidad se transporta a sí misma, la viscosidad la difunde y una proyección de presión la deja sin compresión. El refuerzo de vorticidad devuelve los remolinos que la rejilla borra; la tinta viaja con la corriente y se desvanece.
- **Tiempo:** Evoluciona con memoria: cada momento depende del anterior y los chorros recorren caminos que salen de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.
- **Controles (12):** Emisores, Chorros, Fuerza, Movimiento, Pulsos, Vorticidad, Viscosidad, Flotación, Obstáculos, Iteraciones de presión, Disipación de la tinta, Vista.
- **Presets (4):** «Tinta en agua» — Gotas de tinta más pesada que el agua caen despacio y se abren en hongos y hebras lisas. · «Humo de neón» — Columnas continuas que suben desde el suelo por flotación y se deshilachan en lo alto. · «Tormenta de vórtices» — Ocho chorros veloces que giran por todo el campo con vorticidad alta: remolinos que se enroscan y chocan. · «Estela entre pilares» — Una corriente entra por la izquierda, rodea cuatro pilares y suelta remolinos detrás de cada uno (vista de vorticidad).
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Tinta.
- **Presupuesto:** filas 48–192 (por defecto 128), 30 pasos/s, calentamiento 30 pasos; límites: Velocidad y presión en una rejilla de la mitad de filas que el raster (hasta 160 × 80 celdas, velocidades en las caras); tinta en otra de tres cuartos (hasta 256 × 128). Hasta 40 iteraciones de presión, 4 de viscosidad, 8 chorros y 6 obstáculos; velocidad limitada a 6 celdas por paso.
- **Evidencia:** `tests/unit/family-fluido.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): tinta_agua: r=1.0000 glifos=100.0%; humo_neon: r=1.0000 glifos=100.0%; tormenta: r=1.0000 glifos=100.0%; pilares: r=1.0000 glifos=100.0%.
- **Fuentes:** [Stam (1999): Stable Fluids](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf) · [GPU Gems, cap. 38: Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu) · [Fedkiw, Stam y Jensen (2001): Visual Simulation of Smoke](https://physbam.stanford.edu/~fedkiw/papers/stanford2001-01.pdf) · [Pavel Dobryakov: WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)

#### Agua interactiva (`agua`)

- **Tipo:** simulación con memoria; versión del algoritmo 1. Amplía el patrón `causticas`.
- **Mecanismo:** La superficie es una rejilla de alturas que sigue la ecuación de ondas con amortiguación; las paredes y los obstáculos reflejan las ondas. La luz atraviesa la superficie, se refracta y se concentra en el fondo: esas cáusticas se calculan proyectando la luz de cada punto de la superficie hasta el suelo de baldosas.
- **Tiempo:** Evoluciona con memoria: cada onda sale de las anteriores y la lluvia cae donde dice la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.
- **Controles (9):** Lluvia, Tamaño de gota, Amortiguación, Velocidad de onda, Oleaje, Obstáculos, Profundidad, Luz, Vista.
- **Presets (3):** «Piscina con cáusticas» — Pocas gotas sobre agua honda: anillos de luz cruzan el fondo de baldosas y lo hacen ondular. · «Lluvia sobre el estanque» — Muchas gotas entre rocas: anillos que se cruzan, rebotan en las piedras y se calman deprisa (vista de la superficie). · «Ondas en un canal» — Olas planas pasan por dos rendijas y se abren en franjas de interferencia (vista de las cáusticas).
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Gota.
- **Presupuesto:** filas 48–128 (por defecto 96), 60 pasos/s, calentamiento 360 pasos; límites: Rejilla de alturas de 2 × filas columnas (8 bytes por celda); hasta 8 gotas por paso y 48 por trazo. Al dibujar, 4 rayos de luz por celda para las cáusticas.
- **Evidencia:** `tests/unit/family-agua.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): piscina: r=1.0000 glifos=100.0%; lluvia: r=1.0000 glifos=100.0%; canal: r=1.0000 glifos=100.0%.
- **Fuentes:** [Evan Wallace: WebGL Water](https://madebyevan.com/webgl-water/) · [GPU Gems, cap. 2: Rendering Water Caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics)

#### Terreno que se erosiona (`erosion`)

- **Tipo:** simulación con memoria; versión del algoritmo 1. Amplía el patrón `topografia`.
- **Mecanismo:** Miles de gotas de lluvia caen sobre una rejilla de alturas y ruedan cuesta abajo, ganando velocidad y perdiendo agua. Cada gota arranca roca mientras puede cargar más sedimento y lo deja caer donde se frena, cuesta arriba o al llegar al mar. Las laderas más empinadas que el talud se desmoronan; los estratos duros resisten.
- **Tiempo:** Evoluciona con memoria: el terreno cambia poco a poco y no vuelve atrás; la cámara gira alrededor. Se puede pausar y guardar su estado; no repite un bucle perfecto.
- **Controles (13):** Relieve inicial (reconstruye), Altura (reconstruye), Escala del ruido (reconstruye), Lluvia, Erosión, Depósito, Capacidad, Evaporación, Pendiente de talud, Estratos, Vista, Giro de cámara, Inclinación.
- **Presets (3):** «Barrancos» — Lluvia fuerte y roca blanda sobre una cordillera: el agua talla surcos profundos en las laderas. · «Ríos y delta» — Una ladera que baja al mar: el agua se junta en ríos y deja su sedimento al llegar abajo. · «Mesetas» — Capas de roca dura y desmoronamiento: los bordes de una meseta se escalonan en terrazas.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–160 (por defecto 112), 30 pasos/s, calentamiento 30 pasos; límites: Rejilla de alturas de 1,15 × filas celdas por lado (hasta 160 × 160) más su mapa de caudal (8 bytes por celda); hasta 96 gotas por paso de 64 pasos de vida cada una. Al dibujar, unos 500 pasos de rayo por columna.
- **Evidencia:** `tests/unit/family-erosion.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): barrancos: r=1.0000 glifos=100.0%; delta: r=1.0000 glifos=100.0%; mesetas: r=1.0000 glifos=100.0%.
- **Fuentes:** [Beyer (2015): Implementation of a method for hydraulic erosion](https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf) · [Sebastian Lague: Hydraulic Erosion](https://github.com/SebLague/Hydraulic-Erosion) · [Olsen (2004): Realtime Procedural Terrain Generation (erosión térmica)](https://web.mit.edu/cesium/Public/terrain.pdf) · [s-macke: VoxelSpace (el algoritmo de Comanche)](https://github.com/s-macke/VoxelSpace)

#### Bandadas (boids) (`boids`)

- **Tipo:** simulación con memoria; versión del algoritmo 1. Amplía el patrón `cardumen_luz`.
- **Mecanismo:** Modelo de Reynolds: cada agente sólo mira a sus vecinos cercanos y combina tres reglas (separarse de los muy próximos, copiar su rumbo, ir hacia su centro). Nadie dirige: la bandada sale de esas reglas locales. Los depredadores persiguen al más cercano y la bandada huye de ellos.
- **Tiempo:** Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (11):** Cantidad (reconstruye), Radio de visión, Radio de separación, Separación, Alineación, Cohesión, Velocidad máxima, Agilidad, Depredadores, Obstáculos, Estela.
- **Presets (3):** «Murmuración» — Una bandada enorme y muy alineada que se curva en eses y remolinos; un halcón le abre huecos. · «Cardumen» — Bancos alargados y apretados que se parten y se cierran para esquivar a tres depredadores entre rocas. · «Dispersión» — Poca cohesión: muchos grupos pequeños que se cruzan y se deshacen.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Espantar.
- **Presupuesto:** filas 48–192 (por defecto 96), 30 pasos/s, calentamiento 45 pasos; límites: Hasta 3000 agentes, 6 depredadores y 6 obstáculos; vecinos por rejilla uniforme, como mucho 80 candidatos por agente y paso; un búfer de estela de 2 × filas × filas.
- **Evidencia:** `tests/unit/family-boids.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): murmuracion: r=1.0000 glifos=100.0%; cardumen: r=1.0000 glifos=100.0%; dispersion: r=1.0000 glifos=100.0%.
- **Fuentes:** [Craig Reynolds (1987): Flocks, Herds, and Schools](https://www.red3d.com/cwr/papers/1987/boids.html) · [Craig Reynolds: Boids](https://www.red3d.com/cwr/boids/) · [Craig Reynolds (1999): Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/gdc99/)

#### Gravedad N-cuerpos (`gravedad`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Cada cuerpo atrae a todos los demás con la ley de Newton, suavizada a distancias cortas (Plummer) para que dos cuerpos muy juntos no se disparen. Se suman todas las parejas y se avanza con un integrador de salto de rana (leapfrog), que conserva bien la energía. La simulación es en 3D; la cámara se inclina y gira despacio.
- **Tiempo:** Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.
- **Controles (11):** Cuerpos (reconstruye), Condiciones iniciales (reconstruye), Masas (reconstruye), Atracción, Suavizado, Paso temporal, Estela, Zoom, Inclinación, Giro, Vista.
- **Presets (4):** «Galaxia espiral» — Un disco frío alrededor de una masa central que se rompe en brazos y grumos al girar. · «Choque de cúmulos» — Dos cúmulos esféricos se cruzan, se frenan y se funden dejando colas de marea. · «Colapso frío» — Una nube en reposo cae sobre sí misma, rebota y queda como un núcleo con halo. · «Estrella doble con anillo» — Dos estrellas que se orbitan agitan un anillo de polvo y le abren ondas y huecos.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Añadir masa.
- **Presupuesto:** filas 48–192 (por defecto 96), 30 pasos/s, calentamiento 30 pasos; límites: Hasta 1200 cuerpos más 12 añadidos a mano; suma directa de todas las parejas (≈ 730 000 por paso como mucho); un búfer de estela de 2 × filas × filas.
- **Evidencia:** `tests/unit/family-gravedad.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): galaxia: r=1.0000 glifos=100.0%; choque: r=1.0000 glifos=100.0%; colapso: r=1.0000 glifos=100.0%; binaria: r=1.0000 glifos=100.0%.
- **Fuentes:** [Nyland, Harris y Prins: Fast N-Body Simulation with CUDA (GPU Gems 3, cap. 31)](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-31-fast-n-body-simulation-cuda) · [Aarseth, Hénon y Wielen (1974): A comparison of numerical methods for the study of star cluster dynamics](https://ui.adsabs.harvard.edu/abs/1974A%26A....37..183A) · [Plummer (1911): On the problem of distribution in globular star clusters](https://ui.adsabs.harvard.edu/abs/1911MNRAS..71..460P)

#### Telas y cuerpos blandos (`tela`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Dinámica basada en posiciones (XPBD): una malla de partículas unidas por restricciones de distancia (lados, diagonales y saltos de dos para la flexión), cada una con su rigidez. En cada subpaso se predicen las posiciones con la gravedad y el viento, se corrigen las restricciones y las colisiones, y la velocidad sale del desplazamiento. El viento empuja cada punto de la tela según hacia dónde mira la superficie.
- **Tiempo:** Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto. La cámara gira despacio a su alrededor.
- **Controles (10):** Anclajes (reconstruye), Resolución de la malla (reconstruye), Rigidez, Gravedad, Viento, Subpasos, Amortiguación, Esfera, Giro de cámara, Vista.
- **Presets (3):** «Velo al viento» — Una tela fina colgada de dos esquinas: cae en pliegues y se hincha con cada ráfaga. · «Bandera» — Sujeta a un mástil, flamea con pliegues que viajan hasta el borde libre. · «Membrana elástica» — Una lámina elástica sujeta por sus cuatro esquinas a la que una esfera golpea desde abajo.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Empujar.
- **Presupuesto:** filas 48–192 (por defecto 96), 30 pasos/s, calentamiento 20 pasos; límites: Malla de hasta 48 × 32 partículas (≈ 9000 restricciones) y 24 subpasos por paso; un búfer de profundidad de 2 × filas × filas.
- **Evidencia:** `tests/unit/family-tela.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): velo: r=1.0000 glifos=100.0%; bandera: r=1.0000 glifos=100.0%; membrana: r=1.0000 glifos=100.0%.
- **Fuentes:** [Macklin, Müller y Chentanez (2016): XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf) · [Macklin et al. (2019): Small Steps in Physics Simulation](https://mmacklin.com/smallsteps.pdf) · [Matthias Müller: Ten Minute Physics](https://matthias-research.github.io/pages/tenMinutePhysics/)

#### Chladni y cimática (`chladni`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** La placa vibra en uno de sus modos de onda estacionaria (en la cuadrada, sumas de cosenos; en la circular, funciones de Bessel con el borde libre). Cada grano salta al azar con un paso proporcional a lo que se mueve la placa donde está: rebota en los vientres y se queda quieto en los nodos, así que la arena acaba dibujando las líneas nodales.
- **Tiempo:** Evoluciona con memoria: la arena se mueve grano a grano y tarda en reunirse; al cambiar de modo, migra hacia las nuevas líneas. No escucha sonido ni mide nada: la secuencia de modos sale de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.
- **Controles (9):** Forma de placa, Modo n, Modo m, Mezcla, Secuencia, Partículas (reconstruye), Agitación, Persistencia, Vista.
- **Presets (3):** «Placa resonante» — Una placa cuadrada en un modo fijo: la arena traza su figura y la sostiene. · «Flor nodal» — Una placa circular: diámetros y anillos nodales como pétalos. · «Arena musical» — Los modos cambian cada pocos segundos y la arena corre a dibujar la figura siguiente.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: Golpe.
- **Presupuesto:** filas 48–192 (por defecto 96), 30 pasos/s, calentamiento 60 pasos; límites: Hasta 40 000 granos con un salto por paso; campos de modo en una rejilla de 128 × 128 (como mucho 8 en caché); un búfer de densidad de 2 × filas × filas.
- **Evidencia:** `tests/unit/family-chladni.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): placa: r=1.0000 glifos=99.9%; flor: r=1.0000 glifos=100.0%; musical: r=1.0000 glifos=99.9%.
- **Fuentes:** [Wikipedia: Ernst Chladni y sus figuras](https://es.wikipedia.org/wiki/Ernst_Chladni) · [Wikipedia: Cymatics](https://en.wikipedia.org/wiki/Cymatics) · [Paul Bourke: Chladni plate interference surfaces](https://paulbourke.net/geometry/chladni/)

### Forma y geometría

#### Sistemas L (`sistema_l`)

- **Tipo:** geometría con estado de construcción; versión del algoritmo 1.
- **Mecanismo:** Un axioma se reescribe con reglas durante varias generaciones (sistema de Lindenmayer). Después una tortuga lee cada símbolo: F avanza dibujando, G avanza sin dibujar, + y − giran, [ y ] guardan y recuperan la posición; &, ^, \ y / giran en 3D.
- **Tiempo:** Primero crece trazo a trazo; después se mece con el viento. El crecimiento no es un bucle: termina y la forma queda viva.
- **Controles (11):** Modelo (reconstruye), Axioma (reconstruye), Reglas (reconstruye), Generaciones (reconstruye), Ángulo (reconstruye), Acortar (reconstruye), Variación (reconstruye), Crecimiento, Viento, Giro 3D, Grosor.
- **Presets (4):** «Helecho recursivo» — Frondas que se ramifican en ángulos agudos. · «Bosque de símbolos» — Árbol en 3D que gira despacio; las ramas se acortan con la altura. · «Raíces» — Crecen hacia abajo y se abren en muchas puntas finas. · «Curva del dragón» — Una sola línea que se pliega sobre sí misma sin cruzarse.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–256 (por defecto 96), 30 pasos/s, calentamiento 0 pasos; límites: Hasta 200 000 símbolos tras la reescritura y 40 000 trazos; generaciones acotadas a 9.
- **Evidencia:** la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): helecho: r=1.0000 glifos=100.0%; arbol3d: r=1.0000 glifos=100.0%; raices: r=1.0000 glifos=100.0%; dragon: r=1.0000 glifos=100.0%.
- **Fuentes:** [Prusinkiewicz y Lindenmayer: The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/#abop) · [msiric: Procedural Plants](https://github.com/msiric/procedural-plants)

#### Atractores extraños (`atractor`)

- **Tipo:** simulación con memoria; versión del algoritmo 1.
- **Mecanismo:** Un punto se transforma una y otra vez con dos fórmulas de senos y cosenos (Clifford o De Jong) y cada visita suma brillo donde cae: el caos dibuja una figura estable. Lorenz es un sistema de tres ecuaciones que muchas partículas recorren en 3D.
- **Tiempo:** Acumula con memoria: la imagen se densifica paso a paso y la deriva transforma los coeficientes despacio, con la estela borrando lo antiguo. No repite un bucle.
- **Controles (10):** Sistema (reconstruye), a, b, c, d, Deriva, Estela, Puntos por paso, Encuadre, Brillo.
- **Presets (3):** «Cintas caóticas» — Clifford: cintas finas que se pliegan sobre sí mismas y cambian despacio. · «Nube orbital» — De Jong: una lámina de puntos que se enrolla sobre sí misma y se despliega despacio. · «Mariposa de Lorenz» — Cientos de partículas recorren las dos alas en 3D mientras la cámara gira.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–256 (por defecto 96), 30 pasos/s, calentamiento 30 pasos; límites: Mapas: histograma de 2 × filas × filas en coma flotante, 256 órbitas y hasta 60 000 iteraciones por paso. Lorenz: hasta 600 partículas con estelas de 120 posiciones (RK4).
- **Evidencia:** `tests/unit/family-atractor.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): cintas: r=1.0000 glifos=100.0%; nube: r=1.0000 glifos=100.0%; lorenz: r=1.0000 glifos=100.0%.
- **Fuentes:** [Paul Bourke: atractores de Clifford y De Jong](https://paulbourke.net/fractals/clifford/) · [Lorenz (1963): Deterministic Nonperiodic Flow](https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2) · [Jérémie Piellard: Strange Attractors (sólo las ecuaciones)](https://piellardj.github.io/strange-attractors-webgl/)

#### Arquitectura por restricciones (`wfc`)

- **Tipo:** geometría con estado de construcción; versión del algoritmo 1.
- **Mecanismo:** Generación por restricciones (Wave Function Collapse, modelo de piezas): cada casilla empieza pudiendo ser cualquier pieza. Se decide la más restringida, al azar según el peso de cada pieza, y se descartan en las vecinas las piezas cuyos bordes ya no encajan, en cadena. Es un algoritmo de restricciones: no simula nada cuántico.
- **Tiempo:** Se construye casilla a casilla. Al terminar espera unos segundos y se reconstruye con la siguiente variante de la semilla: una reconstrucción, no un bucle.
- **Controles (7):** Juego de piezas (reconstruye), Piezas en vertical (reconstruye), Densidad, Ritmo, Espera, Bordes (reconstruye), Vista.
- **Presets (5):** «Placa base» — Pistas, vías y chips que se conectan sin dejar cabos sueltos en el marco. · «Plano de planta» — Habitaciones, puertas, ventanas y patios que se cierran sobre sí mismos. · «Acueducto» — Vista lateral con gravedad: arcadas sobre pilares que tienen que llegar al suelo. · «Ciudad densa» — Muros pequeños y muy densos que salen del marco, sólo en líneas: un laberinto de calles. · «La onda que colapsa» — El mapa de entropía mientras se construye: lo indeciso brilla más cuanto menos opciones le quedan.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–256 (por defecto 96), 30 pasos/s, calentamiento 30 pasos; límites: Hasta 28 × 56 casillas con hasta 64 piezas (onda y soportes: 5 bytes por casilla y pieza); 6 reparaciones locales y 3 reinicios por tablero.
- **Evidencia:** `tests/unit/family-wfc.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): placa: r=1.0000 glifos=100.0%; plano: r=1.0000 glifos=100.0%; acueducto: r=1.0000 glifos=100.0%; laberinto: r=1.0000 glifos=100.0%; onda: r=1.0000 glifos=100.0%.
- **Fuentes:** [Maxim Gumin: WaveFunctionCollapse (modelo de piezas)](https://github.com/mxgmn/WaveFunctionCollapse) · [Karth y Smith (2017): WaveFunctionCollapse is Constraint Solving in the Wild](https://doi.org/10.1145/3102071.3110566)

#### Teselación hiperbólica (`hiperbolico`)

- **Tipo:** analítica (sin memoria: función de posición y tiempo); versión del algoritmo 1.
- **Mecanismo:** Teselación regular {p,q}: polígonos de p lados, q en cada vértice. Cada punto del disco se refleja en dos espejos rectos y en un círculo perpendicular al borde hasta caer en el triángulo fundamental; la paridad de los reflejos alterna los colores y la distancia al espejo circular dibuja las aristas.
- **Tiempo:** Una función del tiempo: el disco gira y se desliza por una traslación hiperbólica que vuelve a coincidir consigo misma. Admite bucle perfecto.
- **Controles (8):** Lados (p), Por vértice (q), Motivo, Grosor, Deriva, Giro, Borde, Exterior.
- **Presets (4):** «Triángulos {7,3}» — Cada heptágono partido en 14 triángulos de tono alterno: el grupo de reflexiones (2,3,7). · «Cuadrados {4,5}» — Cinco cuadrados por vértice: sólo aristas, que se estrechan hacia el borde. · «Estrellas {6,4}» — Una estrella de seis puntas en cada hexágono; cuatro se tocan en cada vértice. · «Pentágonos y su reflejo {5,4}» — Cuatro pentágonos por vértice; fuera del disco, la misma teselación reflejada en el borde.
- **Capacidades:** bucle: sí; motor básico: el mismo modelo; estado guardable: no; pinceles: no.
- **Presupuesto:** sin raster (GLSL por celda); límites: Hasta 40 reflejos por celda; sin memoria ni texturas.
- **Evidencia:** `tests/unit/family-hiperbolico.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): triangulos: r=0.9939 glifos=98.7%; cuadrados: r=0.9999 glifos=99.5%; estrellas: r=0.9999 glifos=99.5%; espejo: r=0.9997 glifos=98.8%.
- **Fuentes:** [Malin Christersson: teselación hiperbólica en el disco de Poincaré (sólo las matemáticas)](https://www.malinc.se/noneuclidean/en/poincaretiling.php) · [Teselaciones uniformes del plano hiperbólico (símbolos de Schläfli y grupos de triángulos)](https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane)

### Ciencia en 3D

#### Fractales 3D (`fractal_3d`)

- **Tipo:** analítica (sin memoria: función de posición y tiempo); versión del algoritmo 1. Amplía el patrón `mandelbrot`.
- **Mecanismo:** Cada celda lanza un rayo que avanza según una estimación de la distancia al fractal (ray marching). El Mandelbulb eleva un punto 3D a una potencia en coordenadas esféricas; el Mandelbox lo pliega y escala.
- **Tiempo:** Una función del tiempo: la cámara gira y la potencia puede respirar. Admite bucle perfecto.
- **Controles (8):** Forma, Potencia, Iteraciones, Corte, Giro, Distancia, Respiración, Luz.
- **Presets (3):** «Bulbo clásico» — El Mandelbulb de potencia 8 visto entero. · «Corte interior» — Un plano abre el volumen y deja ver sus cavidades. · «Caja plegada» — El Mandelbox: arquitectura de pliegues cúbicos.
- **Capacidades:** bucle: sí; motor básico: reducido («En el motor básico: 56 pasos de rayo y sin sombra suave.»); estado guardable: no; pinceles: no.
- **Presupuesto:** sin raster (GLSL por celda); límites: Hasta 96 pasos de rayo por celda (sólo dentro de la esfera que lo contiene) y 12 iteraciones del fractal; sombra suave de 12 pasos.
- **Evidencia:** la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): bulbo: r=0.9661 glifos=90.9%; corte: r=0.9820 glifos=95.0%; caja: r=0.9595 glifos=95.8%.
- **Fuentes:** [4rknova: Mandelbulb, implementación y explicación](https://www.4rknova.com/blog/2025/09/01/mandelbulb) · [Artículo sobre fractales 3D por estimación de distancia](https://arxiv.org/abs/2102.01747)

#### Nubes volumétricas (`nubes_vol`)

- **Tipo:** analítica (sin memoria: función de posición y tiempo); versión del algoritmo 1. Amplía el patrón `nube`.
- **Mecanismo:** Cada celda recorre un rayo a través de una capa de densidad hecha con ruido fractal, recortada por la cobertura y erosionada en los bordes. La luz se apaga según la ley de Beer–Lambert; cada muestra mira hacia el sol para saber cuánta luz le llega y la reparte con una función de fase de Henyey–Greenstein (el borde plateado a contraluz).
- **Tiempo:** Una función del tiempo: el viento arrastra el ruido y, dentro de la capa, las nubes vienen hacia ti. Admite bucle perfecto.
- **Controles (8):** Cobertura, Escala, Erosión, Viento, Luz, Absorción, Calidad, Cámara.
- **Presets (3):** «Banco de nubes» — Un mar de nubes desde arriba, con el sol bajo que ilumina las cimas. · «Nebulosa» — Dentro de una nube deshilachada y a contraluz: filamentos que brillan contra el negro. · «Haces de luz» — Bajo una capa rota: el sol entra por los huecos y dibuja columnas en la bruma.
- **Capacidades:** bucle: sí; motor básico: reducido («En el motor básico: como mucho 32 pasos de rayo, 3 hacia el sol y 10 en la bruma.»); estado guardable: no; pinceles: no.
- **Presupuesto:** sin raster (GLSL por celda); límites: Hasta 64 pasos de rayo por celda, 5 hacia el sol por muestra iluminada y 3 por muestra de bruma; cada muestra son 4 o 5 octavas de ruido.
- **Evidencia:** `tests/unit/family-nubes_vol.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): banco: r=0.9990 glifos=96.3%; nebulosa: r=0.9892 glifos=85.4%; haces: r=0.9955 glifos=88.8%.
- **Fuentes:** [Maxime Heckel: Real-time dreamy cloudscapes with volumetric raymarching (sólo la técnica)](https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/) · [Hillaire (2016): Physically based sky, atmosphere and cloud rendering in Frostbite (curso de SIGGRAPH)](https://blog.selfshadow.com/publications/s2016-shading-course/) · [Ley de Beer–Lambert](https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law)

#### Orbitales y superposiciones (`orbitales`)

- **Tipo:** analítica (sin memoria: función de posición y tiempo); versión del algoritmo 1.
- **Mecanismo:** Funciones de onda del hidrógeno: una parte radial (polinomios de Laguerre, con n − l − 1 nodos) por un armónico esférico real. Dos estados superpuestos cambian su fase relativa al ritmo de su diferencia de energía (E ∝ −1/n²), así que la densidad va y viene. Cada celda recorre un rayo que suma |ψ|² o busca la superficie donde |ψ|² vale el nivel.
- **Tiempo:** Una función del tiempo: la cámara gira y la superposición oscila con un periodo fijo. Admite bucle perfecto.
- **Controles (8):** Estado A, Estado B, Mezcla, Velocidad de fase, Modo, Nivel, Giro de cámara, Exposición.
- **Presets (4):** «Lóbulos 3d» — El orbital 3dz²: dos lóbulos y un anillo de signo contrario, en tonos de fase. · «Superposición 1s+2p (dipolo que oscila)» — La mitad de 1s y la mitad de 2pz: la nube sube y baja cada cuatro segundos, como la transición Lyman-α. · «Anillos 4f» — El orbital 4fz³: lóbulos en el eje y dos conos que forman anillos. · «Híbrido sp (2s+2p)» — Dos estados de igual energía: no oscilan, se suman en un lóbulo grande y uno pequeño.
- **Capacidades:** bucle: sí; motor básico: el mismo modelo; estado guardable: no; pinceles: no.
- **Presupuesto:** sin raster (GLSL por celda); límites: Hasta 64 muestras por rayo, 5 bisecciones y 6 muestras para la normal; polinomios de grado ≤ 3 y n ≤ 4.
- **Evidencia:** `tests/unit/family-orbitales.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): lobulos: r=1.0000 glifos=100.0%; dipolo: r=1.0000 glifos=100.0%; anillos: r=1.0000 glifos=100.0%; hibrido: r=1.0000 glifos=99.9%.
- **Fuentes:** [El átomo de hidrógeno: funciones de onda y polinomios de Laguerre](https://en.wikipedia.org/wiki/Hydrogen_atom#Wavefunction) · [Armónicos esféricos reales](https://en.wikipedia.org/wiki/Table_of_spherical_harmonics#Real_spherical_harmonics) · [Paul Falstad: applet de orbitales del hidrógeno (sólo la física)](https://www.falstad.com/qmatom/)

#### Agujero negro (`lente_gravitacional`)

- **Tipo:** analítica (sin memoria: función de posición y tiempo); versión del algoritmo 1.
- **Mecanismo:** Calculado: la trayectoria de la luz alrededor de un agujero negro sin giro (Schwarzschild), integrada paso a paso para cada celda; la luz que pasa demasiado cerca cae dentro y la que escapa lee el fondo en la dirección en que sale. Artístico: el brillo del disco, su textura y el refuerzo Doppler del lado que se acerca; no hay corrimiento al rojo ni transporte de radiación.
- **Tiempo:** Una función del tiempo: la cámara orbita despacio y el disco gira más rápido por dentro que por fuera. Admite bucle perfecto.
- **Controles (8):** Distancia, Inclinación, Órbita, Radio del disco, Brillo del disco, Fondo, Exposición, Rotación del disco.
- **Presets (3):** «Disco de acreción» — El disco casi de canto: su cara de atrás se ve doblada por encima y por debajo de la sombra. · «Lente sobre la rejilla» — Sin disco: los meridianos del cielo se doblan en anillos alrededor de la sombra. · «De canto» — El disco exactamente de lado, como una línea, y su imagen doblada formando un anillo.
- **Capacidades:** bucle: sí; motor básico: el mismo modelo; estado guardable: no; pinceles: no.
- **Presupuesto:** sin raster (GLSL por celda); límites: Hasta 96 pasos de integración (RK4) por celda; sin texturas ni catálogos de estrellas.
- **Evidencia:** `tests/unit/family-lente.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): disco: r=0.9965 glifos=99.2%; rejilla: r=0.9988 glifos=98.5%; canto: r=0.9978 glifos=98.7%.
- **Fuentes:** [Eric Bruneton: Real-time high-quality rendering of non-rotating black holes (artículo; código propio aquí)](https://arxiv.org/abs/2010.08735) · [Ecuación de la órbita de la luz en Schwarzschild (Binet)](https://en.wikipedia.org/wiki/Schwarzschild_geodesics#Bending_of_light_by_gravity) · [Luminet: An illustrated history of black hole imaging (su imagen de 1979 con disco fino)](https://arxiv.org/abs/1902.11196)

#### Líneas de campo (`campos_em`)

- **Tipo:** geometría con estado de construcción; versión del algoritmo 1.
- **Mecanismo:** Las líneas se trazan siguiendo el campo paso a paso (Runge–Kutta) desde puntos alrededor de cada fuente, tantos como su intensidad: el campo eléctrico de Coulomb sale de las cargas positivas y entra en las negativas; el magnético de una espira se suma tramo a tramo (Biot–Savart) y el de un imán es el de un dipolo. Las líneas magnéticas se cierran sobre sí mismas.
- **Tiempo:** Las líneas crecen desde las fuentes durante los primeros segundos; la cámara gira y las partículas fluyen, más rápido donde el campo es más fuerte. El crecimiento no es un bucle.
- **Controles (8):** Configuración (reconstruye), Separación (reconstruye), Intensidad relativa (reconstruye), Líneas por fuente (reconstruye), Partículas, Giro de cámara, Inclinación, Vista.
- **Presets (5):** «Dipolo eléctrico» — Una carga positiva y otra negativa: las líneas salen de una y se curvan hasta la otra. · «Cargas que se repelen» — Dos cargas positivas, una el doble que la otra: las líneas se apartan y dejan un punto sin campo. · «Espiras de Helmholtz» — Dos espiras iguales separadas un radio: entre ellas el campo es casi uniforme. · «Cuadrupolo» — Cuatro cargas alternas: las líneas saltan a la vecina y el centro queda vacío. · «Imán» — Un dipolo magnético solo: líneas cerradas que salen del norte y vuelven por el sur.
- **Capacidades:** bucle: no (evoluciona sin bucle perfecto); motor básico: el mismo modelo; estado guardable: sí; pinceles: no.
- **Presupuesto:** filas 48–192 (por defecto 96), 30 pasos/s, calentamiento 0 pasos; límites: Hasta 120 líneas de 420 pasos de RK4 cada una, trazadas una vez por configuración; espiras de 32 tramos; partículas ≤ 8 por línea.
- **Evidencia:** `tests/unit/family-campos.test.ts` (mecanismo) y la batería genérica de `tests/unit/families.test.ts`; WebGL 2 vs motor básico (Chromium + SwiftShader, t = 6 s): dipolo: r=1.0000 glifos=100.0%; repulsion: r=1.0000 glifos=100.0%; helmholtz: r=1.0000 glifos=100.0%; cuadrupolo: r=1.0000 glifos=100.0%; iman: r=1.0000 glifos=100.0%.
- **Fuentes:** [Ley de Biot–Savart](https://en.wikipedia.org/wiki/Biot%E2%80%93Savart_law) · [Líneas de campo como curvas integrales del campo](https://en.wikipedia.org/wiki/Field_line) · [Paul Falstad: applets de campos (sólo la física)](https://www.falstad.com/vector3de/)

<!-- FIN-INVENTARIO -->

## 3. Integración de las familias

| Dónde | Qué hace |
|---|---|
| Biblioteca de recetas | Cuatro secciones nuevas en Arte (Vida y química, Física y movimiento, Forma y geometría, Ciencia en 3D), con cada preset como receta: nombre, familia, explicación y miniatura. |
| Panel de la capa (Capas) | Presets en fichas (con o sin su paleta), controles tipados (número, entero, opción, sí/no, texto) con efecto real, resolución, pincel, semilla, «Reiniciar», «Avanzar», «Guardar estado» y «Cómo funciona» con sus fuentes. |
| Azar | Generador versión 6: las piezas de la versión 5 y, a veces (22 % en Arte, 16 % en Fondos, 12 % en Terminal), una familia con uno de sus presets. La lista de la versión 6 está congelada (no es el registro); las versiones 1–5 siguen tejiendo exactamente lo mismo (pruebas doradas). El editor de Azar propio no se tocó. |
| Vista, miniaturas y visor | El mismo modelo en todos; las miniaturas usan un momento acotado. El visor nombra la familia y avisa de que una simulación empieza desde su semilla en el navegador de quien la abre. |
| Exportaciones | PNG del estado acordado (copia del escenario); video y GIF con inicio explícito y calentamiento definido; código web con el guion de cada familia que usa la pieza (`Glyphos.registerFamily`); el estado guardado no viaja en el código y se dice. |
| Proyectos y sesiones | Llevan los estados guardados (`estados/`). |
| Modo básico | Las familias de raster usan el mismo modelo; fractal 3D y nubes usan una gemela reducida y lo dicen en el aviso del modo básico. |
| Pérdida de contexto WebGL | El escenario recupera las simulaciones (se entregan al motor nuevo). |
| Movimiento reducido | Las piezas respetan la preferencia del sistema como el resto del laboratorio. |

## 4. «Crea tus GLYPHOS» (`/studio/glifos/`)

Entrada propia (`studio/glifos/index.html`, `src/glifos/`), fuera del peso del laboratorio.

- **Proyectos:** nuevo alfabeto, nuevos símbolos ASCII, empezar desde una letra, abrir un `.glyphos-glifos`; lista de este navegador con dañados conservados y descargables y versiones futuras sólo para mirar.
- **Tablero:** grupos (mayúsculas, minúsculas, español, piezas de acentos, cifras, espacio, puntuación) y caracteres propios por código de punto (`U+XXXX`, nunca mitades UTF-16), estados vacío/dibujado/propuesto/aceptado/bloqueado, filtros, selección múltiple y navegación con teclado.
- **Editor de contornos** (`src/glifos/ui/editor/`): seleccionar, mover, escalar, rotar, reflejar, duplicar; pluma Bézier (nodos y manejadores, añadir y quitar nodos, abrir y cerrar), lápiz, rectángulo y elipse; guías con reglas y ajuste a rejilla, guías, métricas y nodos; operaciones de trazo (unir, restar, intersecar, excluir, quitar solapamientos, invertir dirección); componentes y anclas (los acentos conservan una posición movida a mano); zoom y desplazamiento; edición numérica (nodo, selección, avance, márgenes, «avance propio» en ASCII); métricas globales; capa de imagen (guía o glifo, umbral, lectura, posición y escala, vectorizar sin destruir); deshacer y rehacer; accesible con teclado y lector de pantalla.
- **Importar:** PNG (transparencia u oscuro sobre claro, recorte numérico y a la tinta, colocación y escala), SVG seguro y la fuente propia (OTF, TTF, WOFF; respeta las marcas de licencia de la fuente).
- **Asistente local:** referencias bloqueadas, modelo de estilo editable con procedencia de cada valor, propuestas en tres variantes desde esqueletos propios, comparar variantes, aceptar por letra, selección, grupo o todo, regenerar sólo lo pendiente; nunca reemplaza lo dibujado, aceptado, bloqueado o corregido. Sin capa neuronal ni botón de «IA» (ver el documento de diseño).
- **Vista previa:** palabras, párrafo, tamaños y una pieza del laboratorio dibujada por el motor básico con el juego en el atlas.
- **Rampa ASCII** propuesta por tinta y corregible (orden o valor); un alfabeto no se reordena.
- **Kerning** por pares en el panel Documento.
- **Exportar:** proyecto `.glyphos-glifos`, OTF comprobada (releída y probada en el navegador), SVG por carácter y hoja, atlas PNG con manifiesto, y «Usar en el laboratorio».
- **En el laboratorio:** pestaña Glifos → «Tus glifos»; motores WebGL 2 y básico, miniaturas, vista, visor, proyectos y sesiones (`glifos/<id>.json`), SVG de contornos y código exportado (`Glyphos.registerGlyphSet`). Texto y ANSI llevan caracteres y lo dicen. Los enlaces no llevan juegos: donde falta, la pieza se ve con su tipografía **y lo avisa**.

## 5. Pruebas y resultados

Entorno: contenedor Linux de 4 núcleos; Node 22; Chromium 141 de Playwright con **WebGL 2 por software (SwiftShader)**. Ningún resultado de aquí vale como prueba en una GPU real, en un teléfono real, en Firefox ni en Safari.

- **`npm run check`** (tipos, pruebas unitarias y build): pasa. **126 archivos y 2 251 pruebas unitarias** (la base tenía 98 y 1 850).
  - Familias: batería genérica por familia en `tests/unit/families.test.ts` (los controles cambian algo, los presets se distinguen, la semilla reproduce, el estado guardado reanuda exacto, pausar y avanzar, el anfitrión da el mismo momento por pasos o de un salto, un parámetro de construcción crea otra ejecución y no repite versión de raster) y una prueba del mecanismo de cada familia (`tests/unit/family-*.test.ts`: conservación de energía en N-cuerpos, divergencia tras la proyección en el fluido, conservación del terreno en la erosión, la velocidad de onda del agua, la conectividad del DLA, el período de un oscilador de Life, el orden de Kuramoto que crece con el acoplamiento, las geodésicas del agujero negro, la normalización de los orbitales…). Ninguna tolerancia se rebajó para pasar.
  - Código exportado: cada familia con código lleva su guion y calcula lo mismo que el estudio (`tests/unit/runtime-families.test.ts`).
  - Azar: versión 6 con prueba dorada de 130 tiradas (`tests/unit/fixtures/generator-v6.json`); las versiones 1–5 siguen idénticas. La prueba de objetos 3D del dado cuenta también las familias de ciencia en 3D (también se trazan rayo a rayo); sus umbrales no cambiaron.
  - Glifos: modelo y compilador, geometría (`glifos-geom`: comandos SVG, importación segura con `<script>`, `<foreignObject>`, `<image>`, `<use>`, `onload`, DOCTYPE y bombas de anidamiento rechazados o ignorados, operaciones de trazo por áreas, ajuste de curvas, vectorizado con agujeros), asistente (`glifos-assist`: una referencia gruesa da glifos con más tinta que una fina; una H inclinada da inclinación medida ±3° y glifos inclinados; la altura de mayúsculas sigue a la referencia; la procedencia dice «no estimado» cuando no se midió; nunca se tocan glifos dibujados, aceptados, bloqueados o corregidos), exportaciones (`glifos-export`: OTF releída con `.notdef`, espacio, `cmap` 12 para un carácter fuera del plano básico, avances, contornos y kerning; SVG; atlas; paquete con hashes comprobados y fusión sin duplicados), almacenamiento (`glifos-storage`: conflicto entre pestañas, documento dañado conservado y nunca sobrescrito, versión futura rechazada, borrar sin tocar juegos en uso) e importación de fuentes (`glifos-fontimport`: una fuente con licencia restringida se rechaza).
- **Comparación de motores** (`scripts/families-qa.mjs --compare`, 86 presets): sin errores; ver la tabla del inventario. Esta pasada encontró un fallo real (una ejecución nueva repetía la versión de raster de la anterior y WebGL mostraba la textura vieja) que se corrigió y se fijó con una prueba.
- **Pruebas de navegador** (build de producción, proyecto escritorio, un trabajador): una tanda con el subconjunto de la CI (`data`, `history-edits`, `urgent-recovery`, `audit-regressions`, `reaudit-additional`, `legibility`, `seo`, `project`, `sections`) más `compartir`, `perf`, `no-webgl`, `basic-mode`, `export`, `thumbs`, `azar`, `library`, `recetas`, `glifos` y `familias`: **159 pasan, 1 omitida** (la de «Llevar al estudio de foto», que se omite mientras ese estudio está en pausa) **y 2 fallaron**, las dos corregidas después: la de Azar esperaba que la versión actual fuera la 5, y la de presupuesto de peso destapó que la primera vista cargaba de más (ver «Carga diferida»). Tras las correcciones se repiten las afectadas sobre el build final (75 pruebas: `perf`, `azar`, `familias`, `glifos`, `recetas`, `library`, `thumbs`, `export`, `basic-mode`, `no-webgl`, `compartir`): **75 pasan, ninguna falla** (build de `4efdbc6`).
- **CI del PR** (`check` y `public-e2e`): en verde en `4efdbc6` y `c56cca8`.
- **Preview de Vercel** del PR: probada con las mismas pruebas de navegador (presupuesto de peso, flujo esencial de glifos, enlace sin juego y ejecución de una familia): pasan.

## 6. Protecciones de la auditoría

Siguen en pie y sus pruebas pasan en `npm run check`: almacenamiento «protegido» y recuperación del historial, rechazo de formatos futuros (receta, sesión, proyecto, estado guardado, juego de glifos, documento de glifos), programas que fallan al compilar, pérdida de contexto WebGL, lecturas con PBO, fuentes con `geometricPrecision`, límites de entrada (E-11), el peso de la primera vista y que el estudio de foto y ONNX no se carguen en las páginas públicas. El catálogo conserva `PATTERNS[0] = nube` y las recetas sin familias ni glifos siguen en formato 2, idénticas.

## 7. Lo que no se hizo o quedó limitado

- **Sin capa neuronal.** No hay infraestructura que la sirva; se documenta qué haría falta. No hay botón de «IA» ni envío de nada.
- **Sin hilos de trabajo (Web Workers).** Las simulaciones corren en el hilo principal con presupuesto por cuadro y un aviso cuando van lentas; moverlas a un worker queda como mejora.
- **Familias:** `tela` no tiene cuerpos blandos por presión (sólo láminas, y lo dice); «Galaxia espiral» se ve como remolinos y un bulbo, no como brazos nítidos (≤ 1 200 cuerpos); la erosión usa gotas y su «mapa del agua» muestra el flujo, no la profundidad; `agua` es la familia más cara de dibujar (4–6 ms por cuadro en sus vistas de cáusticas, medido en CPU); fractal 3D y nubes usan una gemela reducida en el motor básico (declarado); los trazos más finos (boids dispersos, líneas nodales) se ven delgados en celdas pequeñas.
- **Estudio de glifos:** los componentes no giran ni se reflejan; quitar un nodo no reajusta la curva; el lápiz es de grosor constante; las operaciones de trazo, la unión y el vectorizado reajustan las curvas (la forma queda dentro de la tolerancia, los nodos cambian); los esqueletos son una sola estructura sans propia y las variantes cambian el estilo, no la estructura; la estimación de estilo es heurística (el ángulo de la pluma nunca se mide; el contraste necesita una letra con trazos horizontales); la OTF lleva kerning en `kern` (no GPOS), sin hinting ni glifos de píxeles; el pellizco y el arrastre con dos dedos del editor están escritos pero no se probaron con tacto real.
- **Navegadores:** todo se probó en Chromium con SwiftShader; ni Firefox, ni WebKit, ni Chrome estable, ni teléfonos ni GPU reales para estas funciones nuevas.
- **La prueba de navegador de «todas las recetas»** (`recetas-todas.spec.ts`) no se volvió a correr completa: deja fuera las familias (tienen su propia prueba) y el resto del catálogo no cambió.
