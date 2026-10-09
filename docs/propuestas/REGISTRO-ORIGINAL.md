# GLYPHOS — Pendientes e investigación de visuales
Registro inicial: 6 de octubre de 2026.
Actualización: 7 de octubre de 2026.
Estado: primeras seis ideas registradas; séptima idea investigada. Implementación pendiente.

1. **Reacción a la música.** Un modo que responda a graves, medios, agudos y otros componentes musicales, no solamente al volumen del sonido, para enriquecer la experiencia visual.

2. **Azar personalizado.** Un modo para crear y guardar tu propio generador de Azar. Elegir mediante casillas qué plantillas, colores, glifos, efectos y demás opciones participan. Combinar contenido de GLYPHOS con recursos propios: imágenes, PNG, modelos 3D, plantillas creadas por el usuario, paletas y tipografías. Una vez configurado, Azar genera combinaciones dentro de lo seleccionado y añadido.

3. **Glifos y alfabetos propios.** Subir varios PNG, dibujar caracteres, importar letras o cargar un abecedario completo para configurar un conjunto de glifos. Otra posibilidad: partir de una letra diseñada por el usuario y generar o adaptar inteligentemente las demás letras y caracteres. Se propuso explorar IA o un método más sencillo para ajustar tamaño, espacio y colocación.

4. **Fondo de pantalla GLYPHOS.** Exportar piezas como fondos de pantalla estáticos o animados. Para una futura aplicación, explorar un fondo vivo con bucle de duración configurable o animación continua, personalizable como en la web. Añadir un widget o botón Azar que cambie el fondo usando GLYPHOS. Pendiente investigar si puede hacerse desde una aplicación web/PWA o si requiere una aplicación específica; hacerlo antes si resulta viable.

5. **Modo Visuales y segunda pantalla.** Un modo pensado para DJs, fiestas y fondos visuales. Abrir en otra pantalla una ventana con solamente la pieza o shader, mientras los controles quedan en la pantalla principal. Elegir la pantalla de salida y controlar lo mostrado mediante personalización, piezas guardadas o Azar.

6. **Carpetas para piezas guardadas.** Crear y nombrar varias carpetas desde el navegador. Al pulsar la estrella, guardar directamente o asignar la pieza a una carpeta. Conservar las carpetas y su contenido en el navegador; el mecanismo de persistencia queda por definir.


7. **Visuales orgánicos ASCII basados en reacción-difusión y sistemas relacionados.** Desarrollar una biblioteca amplia inspirada en RD Tool de Karl Sims: laberintos, manchas, mitosis, coral, gusanos, ondas y estados caóticos. Explorar también variantes con flujo, orientación, escala espacial y coloreado, y ramas cercanas descritas abajo. Todo presentado como arte ASCII. Investigación realizada el 7 de octubre de 2026; implementación pendiente.

## Investigación de la idea 7

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

## Seguimiento de la auditoría anterior

Referencia del reporte recibido: commit 9f3ef2aebee7262a88b1054ec1ca979116279991.
Inventario: 48 puntos, con 1 alta, 14 medias, 27 bajas y 6 informativos.
Estado en este documento: pendiente de seguimiento. No se comprobó si hubo correcciones desde ese reporte. Los riesgos siguen diferenciados de errores confirmados; los informativos requieren evaluación, no un arreglo automático.

| ID | Clasificación del reporte | Trabajo a seguir |
|---|---|---|
| E-01 | Alta | Evitar pérdida de historial y colección ante lectura fallida o versión desconocida. |
| E-02 | Media | Detener cámara, micrófono y video cuando no se usan; evitar capturas simultáneas. |
| E-03 | Media | Recuperar el arranque ante fallos, carga interminable o IndexedDB bloqueado. |
| E-04 | Media | Evitar recompilar y registrar un shader fallido en cada fotograma. |
| E-05 | Media | Resolver o explicar la diferencia de estela en PNG, SVG y texto/ANSI. |
| E-06 | Media | Permitir un inicio de exportación de video explícito y leído al exportar. |
| E-07 | Media | Validar, deduplicar y limitar importaciones de colección; informar descartes. |
| E-08 | Media | Dar efecto visible al control Tamaño en los movimientos de partículas. |
| E-09 | Baja | Validar ZIP antes de descomprimir y limitar entradas y tamaño. |
| E-10 | Baja | No anunciar una copia de enlace fallida; ofrecer una alternativa. |
| E-11 | Baja | Mostrar límites y contadores para evitar recortes de texto silenciosos. |
| E-12 | Baja | Ordenar claves para que el build sea reproducible. |
| E-13 | Baja | Corregir resolución de imports con configLoader native. |
| U-01 | Media | Distinguir favorito actualizado de favorito con cambios sin guardar. |
| U-02 | Media | Evitar reemplazar una edición local sin conservarla o confirmar. |
| U-03 | Media | Explicar y desactivar controles de paleta sin efecto en Colores de la imagen. |
| U-04 | Media | Permitir desactivar o reasignar atajos de una sola letra. |
| U-05 | Baja | Restringir deshacer/rehacer cuando la pieza está oculta o una hoja abierta. |
| U-06 | Baja | Ignorar la repetición automática de R. |
| U-07 | Baja | Procesar cambios del fragmento de URL con el estudio ya abierto. |
| U-08 | Baja | Proteger piezas editadas frente a la poda y mejorar sus avisos. |
| U-09 | Baja | Dar errores de importación específicos y resumen de elementos inválidos. |
| U-10 | Baja | No recomendar el mismo códec cuando ya lo usa el video fallido. |
| U-11 | Baja | Responder a cambios de atributos posteriores en glyphos-field. |
| U-12 | Baja | Revisar el efecto y claridad de Placa detrás del texto. |
| U-13 | Baja | Respetar el estado de todas las capas ocultas. |
| U-14 | Baja | Alinear rotaciones generadas y rango del deslizador. |
| U-15 | Informativo | Decidir si exponer posición y desfase de capa. |
| U-16 | Baja | Revisar tamaño y separación de objetivos pequeños en escritorio. |
| R-01 | Media; riesgo | Añadir recuperación raíz de errores; reproducir la excepción de render. |
| R-02 | Media; parcial | Alinear pesos ofrecidos y cargados; comprobar diferencia en código exportado. |
| R-03 | Media | Activar CI y cubrir límites de enlace/video y conservación de datos. |
| R-04 | Baja; riesgo | Limpiar caracteres de control en el título del HTML exportado. |
| R-05 | Baja; riesgo | Avisar de versiones futuras y evitar sobrescribir datos incompatibles. |
| R-06 | Baja; riesgo | Poner un tiempo máximo a la carga de video. |
| R-07 | Baja; riesgo | Medir y mejorar respuesta de cancelación de exportaciones. |
| R-08 | Informativo | Perfilar lecturas de píxeles de miniaturas antes de optimizar. |
| I-01 | Baja | Restaurar coherentemente el espacio elegido al recargar. |
| I-02 | Baja | Comunicar estilos incompatibles con generadores antiguos. |
| I-03 | Baja | Corregir clasificación y recorte vertical de cinco figuras. |
| I-04 | Baja | Validar patrones desconocidos y dar la misma recuperación en ambos motores. |
| I-05 | Baja | Actualizar versión, cantidades y capacidades del README. |
| I-06 | Baja | Limpiar oyentes y observadores de componentes HTML al retirarlos. |
| I-07 | Baja | Mostrar la duración real del bucle con precisión suficiente. |
| I-08 | Informativo | Revisar lastmod del sitemap para reflejar cambios de contenido. |
| L-01 | Informativo | Evaluar duplicación del exportador de código. |
| L-02 | Informativo | Medir carga inicial en dispositivos reales y priorizar con evidencia. |
| L-03 | Informativo | Revisar publicación de ONNX innecesario del estudio pausado. |

Prioridad inicial: conservación de datos y arranque, captura de medios, fidelidad de exportación y guardado de ediciones. CI debe acompañar las correcciones. La revisión de Safari, Firefox, equipos móviles/GPU reales y asistencia real sigue pendiente según el reporte original.

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
