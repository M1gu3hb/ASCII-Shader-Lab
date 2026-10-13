# GLYPHOS — Idea 7: reacción-difusión y sistemas relacionados

Estado: propuesta investigada; implementación pendiente. Fecha: 7 de octubre de 2026.



### Identificación de la referencia

- Video: VID_20261007_140753_666.mp4, 50,59 segundos. Se examinó la secuencia temporal mediante fotogramas muestreados a lo largo del clip.
- La URL visible al principio es https://karlsims.com/rdtool.html.
- Herramienta identificada: **RD Tool / Reaction-Diffusion Explorer Tool**, de Karl Sims.
- Técnica central: **reacción-difusión, modelo Gray–Scott**. Una simulación de concentraciones en una cuadrícula genera el patrón y otra etapa decide su aspecto.
- El término Turing aparece en esta área, pero no toda dinámica de Gray–Scott corresponde a una inestabilidad clásica de Turing.
- No se verificó en esta investigación qué algoritmo usa el efecto parecido del GLYPHOS actual.
- El clip no demuestra análisis musical. Sus cambios de color, cortes y mosaicos pueden estar editados. No se atribuye a la herramienta una función reactiva a la música.

### Qué muestra el clip

| Tiempo aproximado | Observación |
|---|---|
| 0–3 s | Se escribe la dirección de RD Tool. |
| 4–6 s | Formas pequeñas crecen a partir de perturbaciones iniciales. |
| 7–14 s | Laberintos y líneas sinuosas; alternancia de color y apariencia de relieve. |
| 15–20 s | Coexisten tamaños de detalle distintos y cambian las paletas. |
| 21–25 s | Crecimiento de nuevas formas sobre fondo turquesa. |
| 26–31 s | Composición a pantalla completa, líneas deformadas y zonas amplias. |
| 32–50 s | Visuales a pantalla completa con pulsos, cortes y mosaicos; no se identifica con certeza qué partes son edición posterior. |

### Familia central: morfologías de Gray–Scott

La separación siguiente sirve para diseñar la biblioteca de GLYPHOS; no es una lista de productos independientes ni un catálogo matemático cerrado. Los nombres técnicos y clasificaciones amplían mucho estas categorías.

| Variante visual | Aspecto |
|---|---|
| Manchas / spots | Islas y puntos distribuidos en el campo. |
| Mitosis | Manchas que se dividen y multiplican. |
| Rayas / stripes | Bandas continuas o segmentadas. |
| Laberintos / fingerprints | Caminos sinuosos, tipo huella. |
| Gusanos / worms | Segmentos alargados que cambian. |
| Coral / branching | Ramificación desde extremos de crecimiento. |
| Anillos y frentes | Formas que se expanden por el campo. |
| Oscilación y caos | Formación y desaparición persistentes. |
| Estructuras localizadas | Formas compactas y duraderas. |
| U-skate y patrones móviles | Estructuras que viajan conservando su forma. |

Fuentes de esta clasificación: Pearson; la clasificación extendida, el glosario y U-Skate World de Robert Munafo; el tutorial de Karl Sims.

### Extensiones de RD Tool que conviene explorar

1. **Advección:** transportar el patrón mediante campos de velocidad. Su interfaz ofrece radial, rotación, swirl, bubble, ring, vortex y vertical.
2. **Difusión orientada:** favorecer una dirección. Orientaciones radial, circular, espiral, bubble y lineal.
3. **Escala espacial:** cambiar la dimensión del detalle en distintas zonas.
4. **Variación espacial de parámetros:** mezclar regímenes por regiones.
5. **Presentación:** paletas, bandas de color, inversión y relieve aparente.
6. **Interacción:** introducir o borrar perturbaciones con dibujo.
7. **Regeneración:** iniciar una evolución nueva; conservar controles de pausa y velocidad.

Fuente: documentación y controles oficiales de RD Tool. Las variantes de flujo son controles combinables de la misma herramienta, no necesariamente modelos de fluidos independientes.

### Modelos cercanos de reacción-difusión

| Modelo o extensión | Dirección visual que permite investigar |
|---|---|
| Schnakenberg | Manchas, bandas y oscilaciones. |
| Brusselator | Formación de patrones; variantes con ondas. |
| Gierer–Meinhardt | Manchas, rayas y laberintos. |
| FitzHugh–Nagumo | Anillos, ondas viajeras y espirales. |
| Heterogeneidad, crecimiento, difusión cruzada y acoplamiento | Cambiar el dominio o combinar dinámicas. |

Estos modelos no son modos ya incluidos en RD Tool. Son ampliaciones para una futura biblioteca, documentadas por VisualPDE.

### Familias vecinas para ampliar el lenguaje visual

| Familia | Relación y propuesta para GLYPHOS |
|---|---|
| Turing multiescala — Jonathan McCabe | Activación/inhibición a varias escalas; combinar detalle grande y pequeño y simetrías. No confundirlo con modificar únicamente la escala radial de Gray–Scott. |
| Fluidos 2D y advección | Transporte de tinta, imágenes o partículas; otra dinámica que puede alimentar el dibujo ASCII. |
| Curl noise | Campos procedurales turbulentos para movimiento tipo fluido. |
| Physarum / slime mould | Agentes y rastros; explorar formas colectivas con otra lógica de simulación. |
| Lenia | Autómatas continuos de vida artificial; criaturas con movimiento y autoorganización. |
| Ginzburg–Landau complejo | Dinámicas oscilatorias y caóticas en campos. |
| Cahn–Hilliard y Swift–Hohenberg | Separación de fases y formación de patrones. Son familias vecinas, no sinónimos de Gray–Scott. |

Fuentes: McCabe/Reusser, Sims, Bridson y colaboradores, Bleuje/Jenson, Chan y VisualPDE. Esta tabla es una selección amplia y pertinente; el conjunto de sistemas generativos no tiene una frontera finita que pueda declararse completamente enumerada.

### Adaptación propuesta a ASCII

Esta sección recoge decisiones propuestas para una implementación futura, no capacidades verificadas del proyecto:

- Simular el campo y convertir sus valores a glifos en la cuadrícula ASCII.
- Diseñar tratamientos por densidad, contorno, color y contraste.
- Ofrecer glifos orientados si se quiere conservar la dirección de líneas.
- Separar resolución de simulación y tamaño de celda ASCII para conservar estructuras.
- Crear ejemplos legibles por familia: patrones quietos, crecimiento, ondas y movimiento continuo.
- Evitar depender de estelas o desenfoque que borren la legibilidad de los caracteres.
- Conectar parámetros musicales y gestos a acciones comprensibles: sembrar, desplazar, variar color o modificar intensidad.
- Curar los rangos de Azar para evitar campos que se extinguen o quedan uniformes.

### Requisitos que habrá que resolver al implementar

La evolución depende del estado anterior. Como consecuencia de esa dinámica, se propone estudiar:

- Guardado de estado o reproducción desde condiciones iniciales, tiempo y secuencia de acciones.
- Un avance temporal definido para exportar y reproducir; la velocidad real del equipo no debe cambiar la intención de la pieza.
- Correspondencia entre lo mostrado, miniaturas, favoritos, exportación y visor.
- Captura o reproducción explícita de interacciones y música si se pretende compartir el resultado exacto.
- Modos de calidad para equipos diferentes y verificación de capacidades gráficas.
- Exportaciones en bucle: no prometer un bucle exacto para cualquier evolución; diseñar cómo producirlo y comprobarlo.
- Versionado de simulación y compatibilidad con recetas antiguas.

No se ha modificado código, construido un motor ni verificado aquí la arquitectura actual para introducir estos cambios.

### Orden propuesto para la nueva biblioteca

1. Gray–Scott con presets distintos y representación ASCII.
2. Advección, orientación, variación de escala y parámetros por región.
3. Patrones multiescala y ondas de otros modelos de reacción-difusión.
4. Familias vecinas, seleccionadas por calidad visual, coste y claridad de uso.


## Referencias consultadas


- Karl Sims, RD Tool: https://www.karlsims.com/rdtool.html
- Karl Sims, ayuda de RD Tool: https://www.karlsims.com/rdtool-help.html
- Karl Sims, tutorial de reacción-difusión: https://www.karlsims.com/rd.html
- John E. Pearson, Complex Patterns in a Simple System: https://arxiv.org/abs/patt-sol/9304003
- Robert Munafo, clasificación extendida: https://mrob.com/pub/comp/xmorphia/pearson-classes.html
- Robert Munafo, glosario: https://mrob.com/pub/comp/xmorphia/glossary.html
- Robert Munafo, U-Skate World: https://mrob.com/pub/comp/xmorphia/uskate-world.html
- Ricky Reusser, implementación de los patrones multiescala de Jonathan McCabe: https://rreusser.github.io/notebooks/multiscale-turing-patterns/
- Karl Sims, fluidos: https://www.karlsims.com/fluid-flow.html
- Bridson, Hourihan y Nordenstam, Curl-Noise for Procedural Fluid Flow: https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf
- Bleuje, implementación e información de Physarum: https://bleuje.com/web-interactive-physarum/
- Sage Jenson, 36 Points: https://www.sagejenson.com/36points/
- Bert Chan, Lenia: https://chakazul.github.io/lenia.html
- VisualPDE, catálogo de modelos: https://visualpde.com/explore/
- VisualPDE, Schnakenberg: https://visualpde.com/mathematical-biology/schnakenberg/
- VisualPDE, Brusselator: https://visualpde.com/mathematical-biology/brusselator/
- VisualPDE, FitzHugh–Nagumo: https://visualpde.com/mathematical-biology/fitzhugh-nagumo/
- VisualPDE, Gierer–Meinhardt: https://canary.visualpde.com/mathematical-biology/gierer-meinhardt.html
- VisualPDE, Ginzburg–Landau: https://visualpde.com/nonlinear-physics/nls-cgl/

Alcance: identificación visual del clip y revisión documental de fuentes primarias. No se operaron las demos en vivo ni se comprobaron su rendimiento, sus controles con entrada táctil o sus exportaciones.


## Ampliación de esta entrega

Las diez familias adicionales se desarrollan en [FAMILIAS-VISUALES.md](FAMILIAS-VISUALES.md). Turing multiescala se conserva como rama específica de este documento; Physarum y Lenia tienen allí una ficha visual más amplia. Las diez fichas no son diez variantes de Gray–Scott.
