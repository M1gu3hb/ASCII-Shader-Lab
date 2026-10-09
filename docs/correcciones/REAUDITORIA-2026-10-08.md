# Reauditoría antes de publicar GLYPHOS

Solicitada el 8 de octubre de 2026. Referencia inicial de esta segunda revisión: `e46793fc23588a3ed7b906089fb11ab876202642`. Producción y main siguen inicialmente en `9f3ef2aebee7262a88b1054ec1ca979116279991`.

## Método

Se revisan otra vez los 48 identificadores originales, sus cambios de código y la evidencia de regresión. Se ejecutan typecheck, unitarias, build y las specs del producto público (desktop y móvil emulado), excluyendo los módulos de foto pausados y recorte que necesitan modelos. Los resultados previos no cuentan como resultados nuevos de esta revisión.

GLYPHOS es una aplicación estática: el recorrido principal va de controles del navegador al motor y a IndexedDB local, y de ahí a vista, archivos y enlaces. No hay API de ventas ni base de datos remota que validar. Vercel debe servir el build del commit integrado, con rutas/cabeceras correctas; las pistas de cámara/micrófono se verifican en el navegador.

## Fallos adicionales reproducidos y correcciones

### E-02: permiso concedido mientras play() sigue pendiente

- Prioridad: media, privacidad. La generación evitaba adoptar una respuesta tardía, pero la pista ya concedida no tenía dueño cancelable durante la espera de reproducción.
- Detección: reforzar la prueba para comprobar stop() **antes** de resolver play(). En la referencia inicial falla: 0 llamadas a stop(), se esperaba 1.
- Solución: guardar una limpieza cancelable de la captura pendiente, llamarla al detener/cambiar cámara y hacerla idempotente. El resultado tardío no puede adoptar ni limpiar una cámara más nueva.
- Regresión: `studio-capture-lifecycle.test.ts`, detención durante inicio de reproducción. Después del arreglo: 8 pruebas de ese archivo aprobadas.

### E-01/E-03: error de escritura tardío ocultaba la protección

- Prioridad: media para la comunicación de recuperación; el bloqueo de escritura seguía activo.
- Detección: iniciar la escritura, activar protección por arranque incompleto y rechazar después la transacción. La referencia cambia storage de protected a unavailable.
- Solución: un error tardío no puede reemplazar el estado protegido ni su aviso permanente. Se conserva la descarga de recuperación y el reintento de lectura.
- Regresión específica añadida a `studio-storage-recovery.test.ts`.

### U-11: atributos después de un arranque rechazado o un cambio de origen

- Prioridad: baja, código exportado. Los atributos ya actualizaban una pieza arrancada, pero la guarda ctl impedía corregir una receta inicial incompatible. Cambiar pattern a video actualizaba la receta sin asociar src, y el nuevo media.rate no se aplicaba al video.
- Detección: dos e2e nuevos fallan en la referencia: recovered=false; bound=false y speed=null.
- Solución: validar antes de sustituir, permitir un montaje nuevo cuando no hay controlador o cambia el origen, y aplicar la velocidad en set. Una receta futura posterior conserva el controlador y escena actuales.
- Regresión: dos nuevos recorridos de custom element y el recorrido existente de recipe/paused/scrim/limpieza.

### E-02/E-06: exportar y salir del contexto de video

- Prioridad: media, captura/sonido y fidelidad. La restauración de posición reanudaba siempre un video que estaba reproduciéndose antes de exportar, aunque mientras tanto la persona hubiese salido a Componentes.
- Detección: video WebM real creado con MediaRecorder, exportación GIF y salida desde su progreso. Antes: wasPlaying=true, paused=false al terminar; debe quedar paused=true.
- Solución: restaurar la posición, pero reanudar sólo si ese mismo video sigue siendo el medio activo de una pieza de video, fuera de Componentes y con la pestaña todavía al mando.
- Regresión: `reaudit-additional.spec.ts`. El primer intento de fixture no produjo cuadros válidos y se corrigió antes de atribuir el fallo al producto; la reproducción válida descrita sí falló por reanudación indebida.

### R-02: el visor no registraba los pesos añadidos al estudio

- Prioridad: media para fidelidad tipográfica. La corrección de los pesos locales se había aplicado sólo al punto de entrada del estudio.
- Detección: extender la comprobación del catálogo a las fuentes del visor falla para JetBrains Mono/100 (19 unitarias pasan, 1 falla). El módulo compartido tenía 13 pesos menos.
- Solución: un único registro de fuentes locales importado por estudio y visor; la portada conserva su importación perezosa. La misma fuente y peso dejan de depender de la superficie.
- Regresión: catálogo contra ambas superficies y carga real de los 35 pesos anunciados, por separado en estudio y visor.

Al restablecer el acceso a Google Fonts se comprobó también la hipótesis de la auditoría: sus caras estáticas coinciden con las 35 locales en la muestra, pero el CSS servido a Chrome moderno usa fuentes variables para JetBrains Mono, Martian Mono y Fira Code. Con esos archivos variables, 18 de los 21 pesos diferían ligeramente de las caras estáticas locales (incluidos 500 y 600). Enumerar pesos en el enlace no cambia el archivo variable servido, por lo que ese ensayo se descartó. Se usan ahora archivos variables locales equivalentes bajo los mismos nombres de familia, sin cambiar las opciones del control. La muestra de los 21 pesos variables coincide exactamente después; se repiten carga real de los 35 pesos, compartir/exportar y presupuesto de carga después de esta alineación. [Evidencia de fuentes y hashes](FUENTES-REAUDITORIA.json): Chromium, 32 px, texto latino con ñ/acentos, no una garantía para todos los glifos/dispositivos ni versiones futuras del CDN. El primer fixture de esta comparación usaba sólo la primera declaración de una hoja multipeso y se corrigió antes de atribuir el resultado al producto.

### Fidelidad de compartir: glifos del sistema entre densidades

- Prioridad: media, fidelidad de vista/enlace. La regresión existente de Arte v5 falla repetidamente: MAD 0,69 frente a límite 0,5. Rejilla, instante y receta coinciden; los atlas de glifos difieren.
- Diagnóstico: comparación por carácter de los atlas y prueba aislada de un guion a 28,7164 px. Chromium cambia el hinting según devicePixelRatio: los hashes del guion son 2584902722 a DPR=1 y 590791362 a DPR=2. Con textRendering=geometricPrecision ambos dan 590791362. Un ensayo de willReadFrequently no solucionó el fallo y se retiró.
- Solución: precisión geométrica tanto al medir densidad como al dibujar el atlas. La misma fuente/celda usa la misma geometría en ambas pantallas; no se cambian semillas ni tolerancias. Las fuentes del sistema pueden seguir siendo diferentes entre sistemas operativos distintos.
- Regresión: comparación exacta del atlas completo entre DPR=1/2 y comparación de los enlaces en las seis pantallas de compartir.

### R-08: esperar la GPU descartaba los píxeles del lienzo vivo

- Prioridad: media, regresión de la corrección previa de lectura. El lienzo del estudio no preserva su drawing buffer al presentarlo. Esperar una valla antes de leerlo cedía al navegador y convertía la imagen medida en negro, haciendo que la estimación anunciara «Se lee bien» sobre un fondo difícil de leer.
- Detección: la regresión existente de Bermellón falla repetidamente durante 45 s; una nueva prueba con fondo #123456 y preserveDrawingBuffer=false recibe RGB 0/0/0 en lugar de 18/52/86.
- Solución: copiar inmediatamente la región viva a una textura independiente, antes de ceder; esperar de forma acotada la GPU y leer esa copia mediante PBO. Los motores que preservan el buffer mantienen su lectura directa. Framebuffer, textura, PBO y vallas se liberan en finally, también al perder o destruir el contexto.
- Regresión: comparación exacta de los píxeles vivos, legibilidad real, miniaturas y recuperación de shaders/contexto. No se relaja el umbral de la prueba ni se activa preserveDrawingBuffer en el motor vivo.

### Instrumentación táctil de la página QA de animación

La primera tanda amplia se detuvo en Ver todo después de un pan de la línea de tiempo. Se repitió aislado y se registraron eventos: pointerdown/up y touchstart/end llegan al botón, pero no se emite click; un toque antes de los gestos sí lo emite. Cambiar duración o introducir una pausa no lo resolvió y esos ensayos se retiraron. La secuencia de pan se sustituye por Input.synthesizeScrollGesture con preventFling=true, conservando desplazamiento, pellizco, pulsación larga, menú, panel y objetivos de 44 px. El caso completo pasa. La página dev/timeline.html no se publica; no se elimina la prueba ni se cambia su tolerancia.

### Instrumentación de los fotogramas GIF y restauración del video

La prueba existente registraba también el seek final que devuelve el video a su posición anterior. Ese seek no es un fotograma del archivo; incluirlo en el rango del clip producía un fallo de 3,84 s frente al límite de 1,05 s. Se conserva el límite original y se refuerza la prueba: preparar el video en 3 s, comprobar al menos 20 fotogramas pausados, inicio en 0 y último fotograma en 23/24 s, y verificar por separado el regreso a la posición anterior y la reanudación. La prueba completa pasa. No se cambia el exportador para satisfacer una medición equivocada.

### Instrumentación de la descripción animada de una vista

El selector global de texto de previews.spec coincidía simultáneamente con el párrafo real y con su span de decoración animada, marcado aria-hidden. Playwright rechazaba esa ambigüedad antes de comprobar la vista. Se apunta al párrafo .vbar-what y se conserva la comprobación de visibilidad y contenido; no se quita la animación ni se acepta arbitrariamente el primer nodo. La spec completa se vuelve a ejecutar.

### Dependencia del compilador: CVE-2026-93749

- Prioridad: alta en el análisis de dependencias; afecta a procesamiento de source maps no confiables. En este proyecto es una dependencia de desarrollo, vía Vite → PostCSS; no se ha demostrado exposición de ese procesador a entrada pública.
- Detección: npm audit actualizado informa source-map-js 1.2.1, GHSA-68fv-2mgg-jv7q. El informe inicial de la auditoría tenía cero avisos; ese resultado histórico no se reutiliza.
- Solución: actualizar sólo el bloque de source-map-js en package-lock.json a 1.2.2, dentro del rango que ya admite PostCSS. CI ejecuta npm audit --audit-level=high antes de check.
- Fuentes: [aviso revisado](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [corrección del mantenedor](https://github.com/7rulnik/source-map-js/pull/79), [release 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).
- Comprobación acotada: un mapa indexado con offset.line=100 000 000 es aceptado por el constructor de 1.2.1 y rechazado inmediatamente por 1.2.2; un mapa válido sigue reconstruyendo su texto. La prueba usa un proceso con memoria/tiempo limitados y no ejecuta el bucle vulnerable. La instalación limpia, audit y build se vuelven a verificar antes de publicar.

### I-08: prueba de sitemap con expectativa anterior

La e2e de SEO seguía exigiendo un lastmod para cada URL, aunque la corrección de I-08 elimina fechas de build presentadas como fechas de edición. El sitemap actual confirma que no publica esas fechas. Se exige ahora su ausencia en el build, conservando URLs, canonical, status y H1. La prueba de HTTP sobre el build pasa; se añade una unitaria para omitir fechas desconocidas y se mantiene la prueba de fechas explícitas. No se restituye una fecha falsa para hacer pasar una expectativa obsoleta.

### Previsualización privada de video: `seeked` antes del fotograma nuevo

- Prioridad: baja; afecta al proveedor de video del proyecto/estudio pausado, no se reactiva esa superficie pública.
- Detección: la tanda completa y su reproducción aislada fallan en el mismo video VP9 real de 10 fps. En 0,75 s el decodificador exacto devuelve rojo 175, la muestra objetivo es 174 y la previsualización devuelve 151, el cuadro anterior. No es una diferencia dentro de la tolerancia de 6.
- Solución: después del seek esperar dos presentaciones del navegador antes de dibujar; límite de 4 s y cancelación inmediata al cerrar, liberando callbacks, temporizador y listener. Si no puede presentar, no adoptar un cuadro viejo como nuevo.
- Verificación: los 11 instantes de la muestra coinciden con el decodificador, sin cambiar tolerancia ni archivo. Las 9 pruebas completas de proyecto pasan, incluidas las dos que el fallo anterior había bloqueado por ejecución serial. Dos unitarias comprueban límite de tiempo y cancelación entre presentaciones. [Valores antes/después](VIDEO-PREVIEW-REAUDITORIA.json).

### Campo numérico: selección diferida que borraba caracteres

- Prioridad: media, edición. Al enfocar el campo, la selección programada para el primer paint podía ejecutarse después de comenzar a escribir; el siguiente carácter sustituía el texto recién introducido.
- Detección: retener explícitamente el primer paint, escribir 3, liberar la selección pendiente y escribir 0. En copia aislada de la referencia anterior se obtiene 0 en lugar de 30.
- Solución: invalidar la selección pendiente cuando hay entrada o desenfoque, y seleccionar sólo si el foco y el texto siguen siendo los iniciales. Se conserva la selección inicial útil y se propaga el callback de entrada.
- Verificación: la nueva e2e fuerza el retraso y comprueba 3→30 y 30→300, incluso cuando la entrada coincide con el valor inicial. Las 23 pruebas de controles, sliders táctiles/lápiz y editores de color en escritorio y móvil emulado pasan; no se cambian límites de campos ni aserciones de gestos.

### I-07: expectativa antigua del mínimo de duración

La prueba de secciones aún esperaba el mínimo anterior de 1 s. La duración precisa del bucle ya admite 0,01 s; se comprueban el valor, aria-valuenow, mensaje de límite y restauración con Escape usando ese mínimo real. Se mantienen las comprobaciones de escritura, campo vacío y flechas. No se vuelve a redondear el bucle para satisfacer la expectativa antigua. Las seis pruebas de secciones y las 19 de SEO pasan.

## Matriz de los 48 hallazgos

La causa, impacto y cambio detallados de cada ID están en [CIERRE-AUDITORIA.md](CIERRE-AUDITORIA.md). Esta matriz identifica la comprobación repetida en esta entrega. «Decisión documentada» se usa para informativos: no implica un defecto funcional ni una mejora de rendimiento medida en hardware real.

| ID | Resultado de la revisión | Comprobación |
| --- | --- | --- |
| E-01 | Protección de datos, sin escritura/GC ante lectura fallida; estado protegido también ante error tardío. | storage-recovery, idb-open, startup; data y urgent-recovery (espera de 20 s). |
| E-02 | Captura cancelable, cierre al salir; exportar no reanuda un video oculto. | capture-lifecycle, camera; reaudit-additional con WebM real. |
| E-03 | Arranque limitado y recuperación visible; no adoptar resultados tardíos. | startup, idb-open; urgent-recovery. |
| E-04 | Memoria de shaders fallidos y limpieza; reintento tras restauración. | gl-failure-cleanup; urgent-recovery y engine-edges. |
| E-05 | PNG y rejilla reconstruyen Estela en ambos motores. | audit-regressions; export y export-jobs. |
| E-06 | Inicio explícito de video, reloj procedural al pulsar y seek finito. | audit-regressions; export-jobs y reaudit-additional. |
| E-07 | Fusión, identidad, normalización parcial y límite de colección. | history, packages, audit-limits; data y audit-regressions. |
| E-08 | Tamaño de los 12 movimientos responde bajo el antiguo suelo. | audit-limits; basic-patterns y engine-edges. |
| E-09 | Límites ZIP antes de descomprimir. | audit-limits y zip. |
| E-10 | Copia anuncia éxito sólo cuando copia; salida manual disponible. | audit-regressions (portapapeles bloqueado). |
| E-11 | Límites/contadores de entrada concordantes con receta. | recipe; audit-regressions y controles. |
| E-12 | Serialización ordenada; compilaciones reproducibles. | Hashes SHA-256 normal frente a native. |
| E-13 | Imports compatibles con cargador native. | Build con --configLoader native. |
| R-01 | Boundary raíz, rechazos y descarga de recuperación. | startup y storage-recovery; urgent-recovery. |
| R-02 | Registro único de pesos reales para estudio y visor. | audit-limits; carga real de 35 pesos en cada superficie. Comparación con CDN y caras variables equivalentes, en la muestra documentada. |
| R-03 | CI y regresiones para los límites de enlace/video y pérdida de datos. | audit-limits; workflow check y public-e2e del commit final. |
| R-04 | Título HTML limpia controles ESC/BEL. | text-export. |
| R-05 | Rechazo de formatos futuros sin reemplazar el estado válido. | audit-limits, packages; runtime en audit-regressions. |
| R-06 | Carga de video acotada y limpieza ante eventos tardíos. | studio-capture-lifecycle y video. |
| R-07 | Cancelación visible, cesión y ningún archivo cancelado. | audit-regressions y export-jobs. |
| R-08 | Vallas y espera acotada; copiar la región viva antes de ceder conserva los píxeles. | reaudit-additional; legibility, urgent-recovery y thumbs. Sin certificar fps de GPU real. |
| U-01 | Estrella distingue la copia previa; pulsar actualiza. | audit-regressions y collection. |
| U-02 | Edición local conservada como entrada persistente durante fusión. | history; history-edits y audit-regressions. |
| U-03 | Paleta deshabilitada con color del origen y cambio explícito. | audit-regressions, color-editor y táctil. |
| U-04 | Atajos de caracteres desactivables y preferencia persistente. | audit-regressions; a11y. Sin lector de pantalla real. |
| U-05 | Guardas de hojas/Componentes antes de deshacer. | audit-regressions y history-edits. |
| U-06 | Ignorar repeat de atajos de carácter. | audit-regressions. |
| U-07 | Cambios de hash atendidos; cancelación y protección de enlaces nuevos. | audit-regressions y compartir. |
| U-08 | Poda protege ediciones, favoritos y pieza actual. | history y packages; data. README corregido. |
| U-09 | Mensajes útiles y contador de elementos inválidos. | packages, history, audit-limits; data. |
| U-10 | Error de video no supone que cambiar extensión resuelva el códec. | studio-capture-lifecycle y video; texto revisado. |
| U-11 | Atributos reactivos, recuperación inicial y cambio de origen con src/rate. | runtime-basic; tres recorridos de atributos en audit-regressions. |
| U-12 | Placa disponible sólo cuando tiene efecto, con explicación. | audit-regressions. |
| U-13 | Todas las capas ocultas dejan fondo vacío en ambos motores. | basic-pipeline; audit-regressions y controles. |
| U-14 | Rotación admite valores negativos del generador. | controls-ui; controls y generadores históricos. |
| U-15 | Controles de X/Y/desfase; decisión documentada. | controls-ui, typecheck y controls. |
| U-16 | Objetivos de ayuda/valores/semilla de al menos 24 px. | audit-regressions (geometría); a11y y layouts móvil/escritorio. |
| I-01 | Preferencia de espacio compatible restaurada. | storage-recovery; history y sections. |
| I-02 | Estilos compatibles con versión histórica; aviso útil. | generator-versions, azar; audit-regressions. |
| I-03 | Cinco figuras incorporadas al encuadre vertical. | audit-limits; engine-edges y recetas. |
| I-04 | Catálogo conocido por defecto y extensiones explícitas. | audit-limits, recipe y runtime-basic. |
| I-05 | README concordante con versiones, colección y exportaciones actuales. | Lectura de catálogo/generadores/exportadores y revisión documental. |
| I-06 | Snippets HTML liberan observadores/oyentes/intervalos al retirarlos. | audit-regressions; components-lib y pegado en otro origen. |
| I-07 | Duración del bucle exacta, sin redondear antes de exportar. | audit-regressions y loop. |
| I-08 | Sin lastmod inventado; decisión documentada. | seo y sitemap construido. |
| L-01 | Runtimes comparten bloques; decisión documentada con ahorro real. | audit-limits, runtime-basic; export, código/React/componentes. |
| L-02 | Presupuesto de carga y separación perezosa; decisión documentada. | audit-regressions y perf. Sin prometer reducción respecto a la auditoría inicial. |
| L-03 | ORT excluido del build público y conservado cuando se habilita foto. | Build público y build VITE_FOTO_STUDIO=1; inspección de manifiesto/assets. |

## Resultados finales y publicación

Evidencia nueva de esta segunda revisión, sin sumar la auditoría histórica:

- **Typecheck, 1 850 unitarias en 98 archivos y build aprobados**, incluyendo cancelación de presentación del video y omisión de lastmod desconocido. CI repite estos checks sobre el commit publicado; npm audit no informa vulnerabilidades.
- [Tanda completa de cuatro runners](https://github.com/M1gu3hb/ASCII-Shader-Lab/actions/runs/37878013847), referencia `621c3ca`: **399 casos**, 380 aprobados, 14 omisiones justificadas, 3 fallos y 2 casos no ejecutados por el fallo serial de proyecto. Los tres fallos se analizan arriba: dos expectativas obsoletas y un fotograma anterior real. No se presentan los dos casos bloqueados como omisiones intencionales.
- Después de corregirlos, **34 pruebas completas de proyecto, secciones y SEO pasan**; incluyen los tres fallos y los dos casos antes bloqueados. La nueva regresión del campo numérico pasa después de demostrar que falla en la referencia anterior. Balance deduplicado: **400 casos distintos, 386 aprobados y 14 omitidos**. [Registro por caso, intentos y razones](REGRESIONES-REAUDITORIA.json). Son tandas sucesivas; no una única corrida íntegra aprobada sobre el SHA final.
- La selección incluye QA local de animación/proyecto/tools/video, además del producto público. Se excluyen las specs foto-* y cutout; las 14 omisiones restantes explicitan estudio pausado o modelos no instalados. No certifican esos módulos como probados.
- Builds normal y native finales: **227 archivos idénticos por SHA-256**. Build público: **12 664 983 bytes**, exportador **511 440 bytes**; ningún asset ORT. Build con foto habilitada: 4 assets ORT, **41 099 249 bytes**. [Manifiesto y huella de todos los archivos fuente](BUILD-REAUDITORIA.json).
- La suite completa queda repetible manualmente. Para los dos cambios localizados posteriores se repiten todas las specs afectadas, controles y regresiones críticas, en lugar de repetir el recorrido de recetas de 24 minutos sin modificar su motor. `check.yml` ejecuta automáticamente unitarias/typecheck/build/audit y 86 casos de navegador del commit final, conservando el JSON de resultados.

El [PR #9](https://github.com/M1gu3hb/ASCII-Shader-Lab/pull/9) registra el resultado de CI del commit final, SHA integrado, deployment y verificación sobre producción. Esa verificación espera el HTML y SHA-256 del chunk idénticos al build de main, comprueba 19 rutas/assets/cabeceras y ejecuta datos, recuperación, fuentes, legibilidad, compartir y SEO sobre el dominio público. El registro de publicación distingue el estado previo de la confirmación posterior al despliegue.

Límites: móvil/tableta emulados y Chromium/SwiftShader; sin certificación de Safari/Firefox, GPU/teléfonos reales, lectores de pantalla ni H.264; la equivalencia de fuentes corresponde a la muestra y archivos del CDN medidos. Las fuentes del sistema varían entre sistemas operativos. Las propuestas y el borrado de la rama antigua quedan fuera de esta entrega.

Incidencia del entorno: el primer intento de navegador se detuvo porque faltaba Chromium. Se instaló antes de repetir; esos fallos de lanzamiento no cuentan como pruebas funcionales ni aprobadas.

## Recuperación del corte de infraestructura

El servidor de ejecución quedó fuera de línea antes de recuperar el resultado de la última tanda y sus archivos temporales dejaron de estar disponibles. Los cambios del repositorio se recuperaron intactos al reconectarse. Para evitar una conclusión basada en logs parciales, `reaudit-completa.yml` conserva los resultados JSON y artefactos de las cuatro particiones durante 30 días; `production-verification.yml` espera el HTML idéntico al build de main y ejecuta recorridos reales sobre el dominio público. Esta incidencia no se cuenta como fallo ni éxito funcional. Main y producción permanecen sin cambios hasta completar la validación del código.

CI del checkpoint `621c3ca`: [Comprobaciones 37878013996](https://github.com/M1gu3hb/ASCII-Shader-Lab/actions/runs/37878013996) aprobado: typecheck, 1 847 unitarias/97 archivos, build, audit sin vulnerabilidades y 50 e2e aprobadas/1 omitida. Sus resultados son del checkpoint; el total actual de 1 850 unitarias y la selección ampliada se vuelven a comprobar en CI antes de integrar. El resultado completo de la tanda amplia ya se recuperó y se detalla arriba.
