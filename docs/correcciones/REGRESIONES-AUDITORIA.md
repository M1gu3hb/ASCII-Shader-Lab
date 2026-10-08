# Regresiones de navegador verificadas

108 casos distintos pasaron en varias tandas, con Chromium y SwiftShader. Móvil emulado. No es una única ejecución continua.

Una prueba del estudio de foto pausado se omite por diseño. Las comparaciones corresponden al build local, no a producción.

| Proyecto | Archivo | Caso |
| --- | --- | --- |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › bienvenida, un paso de guía y la hoja de compartir, sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › con el teclado dentro de las hojas: cada parada tiene nombre y foco visible |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › con el teclado: cada parada tiene nombre y foco visible, y nunca cae en una vista previa |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › el estudio: hojas de exportar, colección y atajos, sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › el estudio: vista inicial y pestañas del panel, sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › el estudio: vistas de destino, sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › el texto pequeño sobre la pieza conserva el contraste aunque pase algo blanco detrás |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › galería de piezas: tarjetas con un solo botón, sin controles anidados; teclado y ratón |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › las hojas atrapan el foco, Escape las cierra y el foco vuelve a su botón |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › legibilidad y zona protegida: detalles, ajustes finos y guía del fondo, sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › portada con sus bloques interactivos cargados (espacios, azar, salidas), sin fallos graves |
| desktop | `tests/e2e/a11y.spec.ts` | accesibilidad › portada, una guía y la licencia, sin fallos graves |
| desktop | `tests/e2e/audit-regressions.spec.ts` | basic: PNG y rejilla llevan Estela, y coinciden con su historia preparada |
| desktop | `tests/e2e/audit-regressions.spec.ts` | basic: ocultar todas las capas deja una rejilla vacía incluso con inversión y glifos sin espacios |
| desktop | `tests/e2e/audit-regressions.spec.ts` | colección: la estrella distingue cambios y desactivar atajos persiste tras recargar |
| desktop | `tests/e2e/audit-regressions.spec.ts` | colores de imagen: controles inactivos y límites de texto explícitos |
| desktop | `tests/e2e/audit-regressions.spec.ts` | el inicio del video exportado es explícito y la duración mostrada conserva el bucle |
| desktop | `tests/e2e/audit-regressions.spec.ts` | el web component aplica recipe, paused y scrim tras conectarse y se libera al salir |
| desktop | `tests/e2e/audit-regressions.spec.ts` | importar una sesión conserva la versión local después de persistir y volver a hidratar |
| desktop | `tests/e2e/audit-regressions.spec.ts` | la placa del mensaje explica cuándo tiene efecto y se habilita con resplandor |
| desktop | `tests/e2e/audit-regressions.spec.ts` | la repetición de R no crea resultados y los atajos Deshacer no actúan con una hoja abierta |
| desktop | `tests/e2e/audit-regressions.spec.ts` | miniaturas: una valla GPU que no responde termina sin leer píxeles ni bloquear |
| desktop | `tests/e2e/audit-regressions.spec.ts` | objetivos pequeños del escritorio tienen al menos 24 px |
| desktop | `tests/e2e/audit-regressions.spec.ts` | sin portapapeles, L abre un enlace seleccionable y Compartir no afirma que lo copió |
| desktop | `tests/e2e/audit-regressions.spec.ts` | un GIF de video empieza a 0 s aunque la vista esté avanzada y restaura el video después |
| desktop | `tests/e2e/audit-regressions.spec.ts` | un enlace pegado con el estudio abierto crea una entrada y conserva la edición anterior |
| desktop | `tests/e2e/audit-regressions.spec.ts` | webgl2: PNG y rejilla llevan Estela, y coinciden con su historia preparada |
| desktop | `tests/e2e/audit-regressions.spec.ts` | webgl2: ocultar todas las capas deja una rejilla vacía incluso con inversión y glifos sin espacios |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › WebP que el navegador no codifica aparece como no disponible |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › sin MediaRecorder: la grabación en directo se explica |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › sin WebCodecs: el video lo explica, sin botones MP4/WebM, y el GIF funciona |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › sin códecs: filas que explican, sin botones MP4/WebM |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › sin portapapeles, copiar selecciona el texto y lo dice |
| desktop | `tests/e2e/basic-mode.spec.ts` | capacidades de exportación › un tamaño que no se puede codificar ofrece uno menor con un clic |
| desktop | `tests/e2e/basic-mode.spec.ts` | el único callejón sin salida que queda: ni siquiera Canvas 2D, y se dice por qué |
| desktop | `tests/e2e/basic-mode.spec.ts` | motor básico pedido › ?motor=basico: el aviso dice que lo pediste y «Usar el motor completo» lo quita |
| desktop | `tests/e2e/basic-mode.spec.ts` | motor básico pedido › como preferencia guardada: se quita igual |
| desktop | `tests/e2e/basic-mode.spec.ts` | motor básico pedido › si WebGL pierde el contexto y no vuelve, el escenario pasa al motor básico |
| desktop | `tests/e2e/capture-lifecycle.spec.ts` | cámara encendida: Componentes cierra todas las pistas |
| desktop | `tests/e2e/capture-lifecycle.spec.ts` | cámara esperando permiso: Componentes cierra todas las pistas |
| desktop | `tests/e2e/capture-lifecycle.spec.ts` | micrófono: al entrar en Imagen se detienen todas las pistas |
| desktop | `tests/e2e/capture-lifecycle.spec.ts` | un video con sonido se pausa al pasar a Componentes y vuelve al regresar |
| desktop | `tests/e2e/components-lib.spec.ts` | Descifrar en otra web › en bucle se repite unos segundos y se queda quieto; el cursor lo repite una vez |
| desktop | `tests/e2e/components-lib.spec.ts` | Foco en otra web › sin nadie no dibuja nada; con el cursor la luz y la trama se mueven; al irse se queda quieta |
| desktop | `tests/e2e/components-lib.spec.ts` | HTML pegado: quitar Imán o Pantalla de carga libera oyentes, observador e intervalo |
| desktop | `tests/e2e/components-lib.spec.ts` | Halo en otra web › el foco del teclado lo enciende (quieto con «reducir movimiento») y destroy() lo suelta del todo |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Enlaces con interferencia: se revuelven con el cursor y el teclado sin cambiar su nombre; quietos con «reducir movimiento» |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Foco: la luz sigue al cursor y al foco del teclado; el contenido no cambia |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Letras de bloque: el rótulo en la página se lee como su texto; el módulo sirve en Node |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Pantalla de carga: es una barra de progreso accesible, llega al 100 % y se oculta; quieta con «reducir movimiento» |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Revelar: la foto aparece bajo el cursor y entera con el teclado; sin CORS se ve la foto tal cual |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › Separador: desfila, se para con el cursor, con el foco y con su botón (que dice lo que se llama); en un móvil el botón se ve y tocar la franja lo pausa; quieto con «reducir movimiento» |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › cada pieza lleva la cabecera MIT-0 en su código y su módulo |
| desktop | `tests/e2e/components-lib.spec.ts` | piezas nuevas en otra web › «Módulo ES» importado desde otra web y «React» compilado, en las seis piezas |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › al ir atrás y adelante, cada pieza recupera su propia imagen |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › al pasar el límite se descartan los más antiguos, nunca lo guardado con ★ |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › guardar la sesión y abrirla en otro navegador |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › un historial guardado con el formato anterior se conserva entero |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › un proyecto exportado se abre con su imagen en otro navegador |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › un proyecto o un ajuste del estudio de foto (también .glyphos) se reconoce y lleva allí (o dice que está en revisión), sin tocar el historial |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › una imagen cargada vuelve sola al recargar la página |
| desktop | `tests/e2e/data.spec.ts` | historial y medios locales › una pieza con imagen: el enlace no la lleva, «Compartir» lo dice y ofrece enviar un archivo |
| desktop | `tests/e2e/data.spec.ts` | lectura insegura: conservar los datos anteriores › lectura fallida: historial y colección intactos después de editar y esperar 20 s |
| desktop | `tests/e2e/data.spec.ts` | lectura insegura: conservar los datos anteriores › versión futura: historial y colección intactos después de editar y esperar 20 s |
| desktop | `tests/e2e/export.spec.ts` | exportar › GIF animado |
| desktop | `tests/e2e/export.spec.ts` | exportar › abre los ajustes JSON del laboratorio original |
| desktop | `tests/e2e/export.spec.ts` | exportar › con Estela, un bucle perfecto exportado enlaza: su primer fotograma ya lleva la estela |
| desktop | `tests/e2e/export.spec.ts` | exportar › código: póster PNG de respaldo; video: MP4 sólo si el navegador codifica H.264 |
| desktop | `tests/e2e/export.spec.ts` | exportar › el HTML exportado funciona solo en otra página |
| desktop | `tests/e2e/export.spec.ts` | exportar › el código exportado vuelve a dibujar cuando su tipografía llega tarde |
| desktop | `tests/e2e/export.spec.ts` | exportar › imagen, vector, texto y receta |
| desktop | `tests/e2e/export.spec.ts` | exportar › una pieza se dibuja igual la primera vez que se abre y al volver a ella |
| desktop | `tests/e2e/history-edits.spec.ts` | ediciones en el historial › guardar la sesión con una pieza editada y abrirla en otro navegador: la versión editada, con su semilla |
| desktop | `tests/e2e/history-edits.spec.ts` | ediciones en el historial › restaurar el original y deshacerlo; la colección guarda la versión editada |
| desktop | `tests/e2e/history-edits.spec.ts` | ediciones en el historial › tirar, editar, tirar más (también rápido), volver con la flecha y con la miniatura: la versión editada, con su semilla; tras recargar también |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › abrir una sesión más antigua en un historial lleno descarta lo más antiguo por fecha, y lo dice antes |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › dos pestañas: la más nueva toma el estudio y ninguna borra lo de la otra |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › lo último antes de recargar o cerrar se guarda |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › sin IndexedDB, el estudio dice que no guarda |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › sin espacio, el estudio lo dice y lo guardado sigue ahí |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › un historial del formato anterior que siguió creciendo se une al actual |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › una pestaña en pausa no borra las imágenes que usa la otra |
| desktop | `tests/e2e/keeping.spec.ts` | lo que guarda el navegador › «Vaciar historial» borra también la foto recién cargada que ya nadie usa |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › Armonógrafo de prueba: la imagen, el GIF y el código exportados muestran lo mismo que la vista |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › Bruma de prueba: la imagen, el GIF y el código exportados muestran lo mismo que la vista |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › Constelación de prueba: la imagen, el GIF y el código exportados muestran lo mismo que la vista |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › Medusa de prueba: la imagen, el GIF y el código exportados muestran lo mismo que la vista |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › en un teléfono de pie una figura cabe a lo ancho, y la imagen exportada y el código pegado la muestran igual |
| desktop | `tests/e2e/library.spec.ts` | biblioteca › las recetas nuevas abren en su espacio y dibujan |
| desktop | `tests/e2e/perf.spec.ts` | peso de la primera vista › estudio con ?motor=basico: el motor básico se descarga y dibuja |
| desktop | `tests/e2e/perf.spec.ts` | peso de la primera vista › estudio: arranca sin el motor básico ni la hoja de exportar, que llega al abrirla |
| desktop | `tests/e2e/perf.spec.ts` | peso de la primera vista › estudio: con la página quieta, la hoja de exportar llega sola (sin abrirla) |
| desktop | `tests/e2e/perf.spec.ts` | peso de la primera vista › portada: el motor llega aparte y sin el motor básico ni los exportadores |
| desktop | `tests/e2e/perf.spec.ts` | peso de la primera vista › portada: el titular tejido llega después de la carga, sin cambiar el LCP ni mover nada |
| desktop | `tests/e2e/perf.spec.ts` | presupuesto del estudio: JS/CSS iniciales y sin modelos de foto en el build público |
| desktop | `tests/e2e/urgent-recovery.spec.ts` | IndexedDB que no responde: el estudio abre protegido y permite descargar una sesión |
| desktop | `tests/e2e/urgent-recovery.spec.ts` | el chunk de handoff bloqueado deja una salida en lugar de Cargando para siempre |
| desktop | `tests/e2e/urgent-recovery.spec.ts` | un shader fallido se intenta una vez y otra combinación sigue dibujando |
| desktop | `tests/e2e/urgent-recovery.spec.ts` | una excepción de render en la raíz conserva las recetas y ofrece una descarga independiente del motor |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › el primer aviso del dado no nombra teclas en el teléfono ni sale en Componentes |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › en la guía de fondos, la página de prueba enseña titular y botones |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › en la guía, la palabra se ve encima de la hoja de pasos |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › la tarjeta para elegir una imagen no queda debajo de la línea de la semilla |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › la vista Historia / Reel 9:16 cabe entera, con sus franjas de interfaz |
| mobile | `tests/e2e/layout-mobile.spec.ts` | en el teléfono › una pieza abierta desde abajo en Componentes empieza por su título, y volver deja la galería donde estaba |
| mobile | `tests/e2e/touch-sliders-mobile.spec.ts` | con el dedo: desplazar el panel sobre un deslizador no lo cambia; un gesto de lado sí, y con precisión |
| mobile | `tests/e2e/touch-sliders-mobile.spec.ts` | con un lápiz: lo mismo que con el dedo (y un toque no cambia nada) |
| mobile | `tests/e2e/touch-sliders-mobile.spec.ts` | − y + dan pasos exactos; el valor se escribe, y fuera de su rango se ajusta y lo dice |
