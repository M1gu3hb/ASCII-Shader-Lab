# GLYPHOS — Diez familias visuales para explorar

Investigación documental: 7 de octubre de 2026. Referencias de autores, proyectos y herramientas existentes. Se revisaron páginas, documentación/código relevante e imágenes; no se ejecutó una prueba funcional completa de las diez demos.

Estas son **diez familias distintas de Gray–Scott**, no diez variantes de color del mismo shader. Physarum, Lenia y fluidos ya aparecían como vecinos en la investigación 7; aquí se desarrollan con ejemplo visual y herramienta propia. Turing multiescala permanece en la idea 7.

Las imágenes son ejemplos originales enlazados con atribución. No muestran implementaciones nuevas de GLYPHOS. Los apartados «Para GLYPHOS» son propuestas, no funciones verificadas de esas herramientas.

## 1. Physarum — redes que se organizan

**Modelo:** agentes con sensores que siguen y depositan rastros; difusión y evaporación del rastro. Base de Jeff Jones; ampliaciones artísticas de Sage Jenson y Bleuje.

![Simulación Physarum de Sage Jenson: red de filamentos blancos](https://payload.cargocollective.com/1/18/598881/13800048/network_2.gif)

Imagen: [Sage Jenson, Physarum](https://cargocollective.com/sagejenson/physarum).

**Aspecto:** venas, redes, membranas y filamentos que se reorganizan. Los agentes responden a un rastro que ellos mismos construyen; no son las dos concentraciones químicas de Gray–Scott.

**Explorar:** [Interactive Physarum de Bleuje](https://bleuje.com/web-interactive-physarum/). [Explicación del algoritmo](https://bleuje.com/physarum-explanation/).

**Controles de interés:** distancia/ángulo de sensores, giro, avance, densidad, difusión y evaporación. La demo añade pincel, fondo, presets y acciones de dispersión/onda.

**Para GLYPHOS:** glifos por densidad del rastro y dirección del movimiento; pincel que modifica comportamiento local, redes finas o membranas densas, música que disperse/atraiga agentes. Nombres de presets propuestos: «Venación», «Membrana» y «Red eléctrica».

**Tiempo:** evolución con memoria; movimiento continuo, no bucle exacto garantizado. La licencia declarada de Bleuje/36 Points incluye restricción no comercial: referencia visual/algorítmica; no trasladar su código o presets al producto sin resolver su uso.

## 2. Lenia — vida artificial continua

**Modelo:** autómata celular continuo, con convolución de un vecindario y función de crecimiento; creado por Bert Wang-Chak Chan.

![Orbium de Lenia representado con caracteres en el material original de Bert Chan](https://chakazul.github.io/R39g126gt5.png)

Imagen: [Bert Chan, material original de Lenia](https://chakazul.github.io/lenia.html). Es una representación con caracteres del autor, no una captura de GLYPHOS.

**Aspecto:** organismos que avanzan, giran o cambian de forma; colonias y formas blandas. La organización surge de reglas de crecimiento en un campo continuo.

**Explorar:** [Demo oficial de Lenia](https://chakazul.github.io/Lenia/JavaScript/Lenia.html). [Proyecto y publicaciones](https://chakazul.github.io/lenia.html).

**Controles de interés:** forma y radio del kernel, centro/anchura del crecimiento, paso temporal, especie, semillas y color.

**Para GLYPHOS:** sembrar criaturas ASCII, cambiar su comportamiento con controles acotados y crear una colonia. Presets propuestos: «Orbium», «Colonia» y «Organismos anulares». Mantener contraste suficiente para distinguir individuos.

**Tiempo:** algunas especies mantienen movimiento organizado; otras se extinguen al cambiar parámetros. Guardar campo o reproducción inicial. Probar si la evolución se conserva a distintas resoluciones y velocidades.

## 3. Fluidos 2D — tinta, humo y vórtices

**Modelo:** simulación de fluidos incompresibles basada en Navier–Stokes; advección de velocidad/color, proyección de presión y refuerzo de vorticidad. Referencia: Pavel Dobryakov.

![Tinta luminosa en la simulación WebGL de Pavel Dobryakov](https://paveldogreat.github.io/WebGL-Fluid-Simulation/logo.png)

Imagen: Pavel Dobryakov, recurso de su [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation).

**Aspecto:** corrientes de tinta, mezclas de color y remolinos que reaccionan al movimiento del cursor. Se transporta material dentro de un campo de velocidad.

**Explorar:** [WebGL Fluid Simulation](https://paveldogreat.github.io/WebGL-Fluid-Simulation/). [Código y referencias del autor](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation).

**Controles de interés:** vorticidad, presión, disipación de color/velocidad, fuerza y radio del pincel, resolución, color y pausa. Esos controles aparecen en el código de la demo.

**Para GLYPHOS:** densidad de tinta a glifos y color, orientación por flujo, impulsos del bajo que inyectan chorros. Presets propuestos: «Tinta en agua», «Humo de neón» y «Tormenta de vórtices».

**Tiempo:** requiere conservar velocidad y color; no confundir con un campo procedural que se evalúa solo a partir de t. No se promete la misma calidad de fluido en todos los equipos sin medir coste y capacidades.

## 4. Atractores extraños — geometría del caos

**Modelo:** mapas iterativos como De Jong y Clifford; también hay una rama de sistemas diferenciales 3D, como Lorenz. La referencia visual mostrada es De Jong.

![Atractor De Jong en el proyecto de Jérémie Piellard](https://raw.githubusercontent.com/piellardj/strange-attractors-webgl/master/src/readme/illustration.jpg)

Imagen: [Jérémie Piellard, Strange Attractors](https://piellardj.github.io/strange-attractors-webgl/readme/).

**Aspecto:** cintas, pliegues, nubes de puntos y filamentos. Pequeños cambios en coeficientes generan otra geometría; se dibujan muchas trayectorias.

**Explorar:** [Strange Attractors WebGL](https://piellardj.github.io/strange-attractors-webgl/). Ofrece selección de atractor, coeficientes, intensidad, calidad, composición y descarga.

**Controles de interés:** coeficientes a/b/c/d, puntos/iteraciones, intensidad y paleta. Velocidad de transición, estela y cámara serían controles de la adaptación animada.

**Para GLYPHOS:** morfologías lentas entre conjuntos de coeficientes, trazo por densidad de visitas y colores por recorrido. Presets propuestos: «Cintas caóticas», «Nube orbital» y «Mariposa Lorenz» para una ampliación 3D.

**Tiempo:** un atractor acumulado puede ser una imagen estática; la animación debe diseñar trayectoria, cámara o variación de parámetros. Acumulación reproducible y órbitas acotadas requieren validación.

## 5. Crecimiento diferencial — pliegues y coral

**Modelo:** nodos conectados en una curva; atracción de vecinos, repulsión local, regularización e inserción de nodos durante el crecimiento.

![Historia de una curva que crece y se pliega en el proyecto de Jason Webb](https://jasonwebb.github.io/2d-differential-growth-experiments/experiments/05%20-%20line%20studies/images/05-circle-trace.png)

Imagen: [Jason Webb, Differential Growth Experiments](https://github.com/jasonwebb/2d-differential-growth-experiments).

**Aspecto:** curvas que se ondulan y pliegan como coral, bordes de hojas o corteza. La geometría aumenta y se acomoda para evitar proximidad excesiva.

**Explorar:** [Differential Growth Playground](https://jasonwebb.github.io/2d-differential-growth-experiments/experiments/playground/). [Explicación y código](https://github.com/jasonwebb/2d-differential-growth-experiments).

**Controles de interés:** separación, atracción/repulsión, umbral para insertar nodos, forma inicial, límites y trazas.

**Para GLYPHOS:** dibujar un contorno o escribir una palabra que después crece y se pliega; mostrar trazos de su historia con caracteres orientados. Presets propuestos: «Coral plegado», «Corteza» y «Letras que crecen».

**Tiempo:** el número de nodos aumenta. Definir presupuesto, congelación, reinicio o secuencia de regeneración; la curva no produce un fondo infinito con coste fijo automáticamente.

## 6. Boids — bandadas y cardúmenes emergentes

**Modelo:** agentes que combinan separación, alineación y cohesión con vecinos; modelo de Craig Reynolds.

![Bandadas en la demo Boids de Ben Eater](https://eater.net/images/boids.png)

Imagen y demo: [Ben Eater, Boids](https://eater.net/boids). [Modelo original de Reynolds](https://www.red3d.com/cwr/boids/).

**Aspecto:** grupos que se juntan, se separan y cambian de dirección. Cada agente responde a vecinos; el grupo no sigue una trayectoria fijada de antemano.

**Explorar:** [Boids Algorithm Demonstration](https://eater.net/boids), con pesos de las tres reglas, alcance visual y trazas.

**Controles de interés:** cohesión, separación, alineación, radio de percepción; cantidad, velocidad, obstáculos o depredador pueden ampliar la familia.

**Para GLYPHOS:** letras/puntos que forman corrientes o bandadas, cursor como obstáculo, golpes que dispersan y después reúnen. Presets propuestos: «Murmuración», «Cardumen» y «Bandadas tipográficas».

**Diferencia con el catálogo actual:** Enjambre/Cardumen de GLYPHOS usan trayectorias analíticas según particles.ts. Una simulación de vecinos sería una ampliación de comportamiento, aunque el tema visual se parezca.

**Tiempo:** estado por agente y búsqueda de vecinos eficiente; evolución continua, no bucle exacto por defecto.

## 7. Cimática / Chladni — figuras de resonancia

**Modelo:** superposición de modos de ondas estacionarias; partículas se acercan a las líneas nodales. Las demos artísticas pueden aproximar esos campos sin simular toda la física de una placa.

![Fotografía real de un patrón de Chladni sobre una placa](https://upload.wikimedia.org/wikipedia/commons/2/29/Chladni_pattern_4.jpg)

Imagen: fotografía propia de [Elmar Bergeler](https://commons.wikimedia.org/wiki/File:Chladni_pattern_4.jpg), CC BY-SA 3.0, sin cambios. Es una placa real; no una captura de la demo. [Licencia](https://creativecommons.org/licenses/by-sa/3.0/).

**Aspecto:** flores, estrellas, cruces y figuras simétricas que se reorganizan al cambiar modos. Se puede mostrar el campo o partículas concentradas en sus nodos.

**Explorar:** [Chladni Patterns de Romello Goodman](https://chladni.romellogoodman.com/). [Tutorial y código de Patt Vira](https://www.pattvira.com/coding-tutorials/v/chladni-patterns).

**Controles de interés:** modos m/n, mezcla, geometría del campo, partículas, velocidad y trazo. La demo de Goodman transforma gradualmente entre fórmulas al activar un patrón nuevo.

**Para GLYPHOS:** bandas musicales seleccionan o modulan modos; contornos ASCII y arena de glifos. Presets propuestos: «Placa resonante», «Flor nodal» y «Arena musical».

**Tiempo:** un campo de ondas puede parametrizarse periódicamente; con partículas, la transición y su estado necesitan tratamiento propio. Cambiar el patrón según música sería una interpretación artística, no una medición física automática de la canción.

## 8. L-systems — gramáticas que crecen

**Modelo:** reglas que reescriben símbolos a partir de un axioma; una interpretación tipo tortuga transforma esos símbolos en geometría 2D/3D. Sistemas de Lindenmayer.

![Árbol generado por reglas L-system en el proyecto de Francesco Gradi](https://raw.githubusercontent.com/FrancescoGradi/L-System-Trees/master/demoImages/preset3.png)

Imagen: [Francesco Gradi, L-System Trees](https://github.com/FrancescoGradi/L-System-Trees). La imagen y la demo siguiente pertenecen a implementaciones distintas de la misma familia.

**Aspecto:** árboles, raíces, helechos y construcciones recursivas. Se pueden editar reglas para diseñar otra forma, no solo cambiar una paleta.

**Explorar:** [Procedural Plants de msiric](https://zealous-morse-eef3b3.netlify.app/). [Proyecto del autor](https://github.com/msiric/procedural-plants). La página ofrece iteraciones, animación/velocidad y parámetros de ramas/hojas.

**Controles de interés:** axioma, reglas, iteraciones, ángulo, longitud/grosor, variación y presentación del crecimiento.

**Para GLYPHOS:** raíces de caracteres, bosque abstracto, crecimiento desde texto y siluetas ramificadas. Presets propuestos: «Bosque de símbolos», «Raíces» y «Helecho recursivo».

**Tiempo:** generar geometría y revelar crecimiento son fases distintas; balanceo periódico puede cerrar un bucle, crecer sin fin no. Limitar expansión de símbolos y ramas para conservar rendimiento.

## 9. DLA — agregación y dendritas

**Modelo:** Diffusion-Limited Aggregation: caminantes aleatorios se adhieren al tocar una semilla o agregado. También llamado crecimiento de árboles brownianos.

![Letras usadas como semillas de agregación DLA en el proyecto de Jason Webb](https://jasonwebb.github.io/2d-diffusion-limited-aggregation-experiments/experiments/06-interactivity/images/social-media-preview.png)

Imagen: [Jason Webb, DLA Experiments](https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments).

**Aspecto:** ramas, dendritas y crecimiento irregular desde un punto, contorno o letras. Las partículas se fijan al agregado; no son una curva que se estira como en crecimiento diferencial.

**Explorar:** [DLA interactivo](https://jasonwebb.github.io/2d-diffusion-limited-aggregation-experiments/experiments/06-interactivity/). [Galería de experimentos](https://jasonwebb.github.io/2d-diffusion-limited-aggregation-experiments/).

**Controles de interés:** semilla, tamaño/forma de caminantes, dirección preferida, origen de partículas, límites y cantidad.

**Para GLYPHOS:** crecimiento alrededor de texto, dibujo o máscara importada; color y glifo según edad de la rama. Presets propuestos: «Cristalización», «Dendritas tipográficas» y «Raíces eléctricas» como apariencia, no simulación exacta de descargas.

**Tiempo:** crecimiento acumulativo que termina ocupando el dominio. Definir reinicio, secuencias de semillas o grabación del crecimiento; no prometer un ciclo cerrado intrínseco.

## 10. Osciladores acoplados — sincronía y remolinos de fase

**Modelo:** Kuramoto en una retícula: cada punto tiene fase/frecuencia y se acopla a vecinos. Referencia visual: Spin Wheels de Dirk Brockmann.

![Campo de fases coloreado en Spin Wheels de Complexity Explorables](https://www.complexity-explorables.org/explorables/spin-wheels/spinwheels.png)

Imagen y explicación: [Dirk Brockmann, Spin Wheels](https://www.complexity-explorables.org/explorables/spin-wheels/).

**Aspecto:** campos ondulados, singularidades/remolinos y regiones que entran o salen de sincronía. Cada punto es un oscilador; el estado no es una concentración química ni un fluido.

**Explorar:** [Spin Wheels](https://www.complexity-explorables.org/explorables/spin-wheels/), con acoplamiento, heterogeneidad y visualización de singularidades.

**Controles de interés:** fuerza de acoplamiento, diferencias de frecuencia, vecindario, fase inicial y mapa cíclico de color.

**Para GLYPHOS:** fase convertida a orientación, glifo o color; energía musical modifica acoplamiento y heterogeneidad dentro de rangos estables. Presets propuestos: «Remolinos de fase», «Campo sincronizado» y «Luciérnagas».

**Tiempo:** los patrones se reorganizan y pueden homogeneizarse. El ciclo de un oscilador no garantiza que toda la simulación regrese al mismo estado al final del clip.

## Comparación para elegir los primeros prototipos

Estimación de diseño, no mediciones de rendimiento:

| Familia | Interacción principal | Memoria que interesa guardar | Aporte frente a fondos existentes |
|---|---|---|---|
| Physarum | Modificar reglas locales/pincel | Agentes y rastro | Redes que se reorganizan por señales compartidas. |
| Lenia | Sembrar y cambiar crecimiento | Campo y versión de reglas | Vida artificial con individuos reconocibles. |
| Fluidos | Inyectar tinta/fuerza | Velocidad y color | Corrientes y mezcla transportada. |
| Atractores | Explorar coeficientes | Puntos/semillas y acumulación | Geometrías caóticas y metamorfosis. |
| Crecimiento diferencial | Contorno inicial/límites | Nodos y conectividad | Pliegues que crecen desde formas propias. |
| Boids | Pesos de reglas/obstáculos | Posiciones y velocidades | Movimiento colectivo emergente real. |
| Chladni | Modos/superposición | Campo; partículas si existen | Resonancia geométrica conectable a música. |
| L-systems | Editar gramática | Gramática, semilla y progreso | Estructuras ramificadas diseñables. |
| DLA | Dibujar semillas/sesgar movimiento | Agregado y caminantes | Dendritas que crecen alrededor de contenido. |
| Kuramoto | Acoplamiento y heterogeneidad | Campo de fases | Sincronía, remolinos y ondas de fase. |

Para un primer prototipo se propone **Chladni** por su conexión con música y campos sencillos; **Physarum** por cercanía visual al video con otra dinámica; **fluidos** por interacción inmediata; y **crecimiento diferencial** para transformar contenido propio. La prioridad de desarrollo sigue siendo la auditoría, no estos prototipos.

## Requisitos compartidos para GLYPHOS

- Salida por el motor ASCII: densidad/contorno/orientación y color con glifos legibles; no presentar una imagen suavizada como si fuera la implementación ASCII.
- Separar resolución de simulación, resolución de salida y tamaño de celda.
- Receta versionada, semilla y avance temporal definido; checkpoint o reproducción de acciones cuando haya memoria.
- Favoritos, visor, miniaturas y exportaciones deben usar el mismo estado o explicar la diferencia.
- Pausa, reinicio, velocidad, calidad y límites visibles; perfiles de Azar que eviten regiones vacías o evoluciones que se extinguen.
- «Animación continua», «clip» y «bucle perfecto» son capacidades distintas que deben probarse por familia.
- Las demos e imágenes son referencias atribuidas. Implementar modelos propios o reutilizar código con licencia compatible; no se importó código de terceros en esta entrega.

## Portales útiles para seguir investigando

- [Complexity Explorables](https://www.complexity-explorables.org/): sistemas dinámicos, sincronización y comportamiento colectivo.
- [VisualPDE](https://visualpde.com/explore/): modelos de campos, ondas y formación de patrones; complementa la idea 7.
- [Experimentos de Jason Webb](https://jasonwebb.github.io/2d-differential-growth-experiments/): crecimiento geométrico y herramientas de formas.
- [Lenia de Bert Chan](https://chakazul.github.io/lenia.html): vida artificial y sus extensiones.
- [RD Tool de Karl Sims](https://www.karlsims.com/rdtool.html): referencia central de Gray–Scott, detallada en la idea 7.
