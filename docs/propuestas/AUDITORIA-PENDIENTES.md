# GLYPHOS — Inventario de la auditoría y correcciones pendientes

Referencia auditada: **9f3ef2aebee7262a88b1054ec1ca979116279991**. Ese sigue siendo el HEAD de main al preparar esta rama, el 7 de octubre de 2026.

Fuente: reporte final entregado por Miguel. Se conserva su distinción entre errores confirmados, problemas de UX, riesgos por comprobar, incoherencias e informativos. Las reproducciones y resultados siguientes pertenecen a esa auditoría; esta entrega no vuelve a ejecutar ni corrige esos casos.

Inventario: **48 puntos: 1 alta, 14 medias, 27 bajas y 6 informativos. Sin críticos reportados. Todos pendientes de seguimiento.**

## Errores confirmados

| ID | Gravedad | Qué se detectó y en qué afecta | Qué hay que hacer | Área principal |
|---|---|---|---|---|
| E-01 | Alta | hydrate confunde lectura fallida o índice desconocido con primera visita. Sobrescribe ★ y el GC elimina el historial. Pérdida total de datos tras un disparador raro, reproducido con fallos simulados y v:4. | Distinguir vacío de ilegible/incompatible. En el segundo caso bloquear claim, escrituras, barrido y GC; aviso permanente, respaldo y reintento. | studio/store.ts, Keeping.tsx |
| E-02 | Media | Cámara/micrófono permanecen abiertos fuera de su espacio; el video sigue sonando. Doble activación abre dos flujos y solo detiene el último. Afecta privacidad percibida y control; no se reportó envío de datos. | Generación/cancelación en startCamera/startMic, bloqueo mientras se pide permiso, parada al dejar de usarse e indicador global accesible. Detener también reproducción de video. | engineBridge.ts, media.ts, live.ts, panels.tsx |
| E-03 | Media | Fallo de chunk con #foto o IndexedDB que no responde dejan «Cargando…» indefinidamente. Producto inutilizable hasta recargar. | Capturar fallos, timeout de arranque, recuperación sin guardado, aviso y Recargar. Reintentar imports y manejar onblocked de IndexedDB. | main.tsx, boot.ts, idb.ts, store.ts |
| E-04 | Media | Un shader fallido se compila y registra en consola cada fotograma. Escena vacía y carga CPU/GPU excesiva. | Memorizar claves fallidas, limpiar v/prog antes de lanzar, limitar logs y ofrecer recuperación al cambiar combinación/contexto. | engine/engine.ts, gl.ts, engineBridge.ts |
| E-05 | Media | PNG, SVG y texto/ANSI no incluyen la Estela que sí aparece en la vista y video. El archivo no refleja lo esperado. | Definir tratamiento coherente de historia/warmTrail para las salidas o avisar explícitamente de la diferencia. Validar también motor básico, no cubierto por separado. | exporting.ts |
| E-06 | Media | Sin Bucle perfecto, el inicio del video se calcula al renderizar la pestaña; las exportaciones empiezan en instantes variables. La persona no controla el fotograma inicial. | Definir inicio visible: cero, tiempo actual del medio o campo explícito. Leerlo al pulsar Exportar y mantenerlo durante GIF/WebM/MP4. | ExportSheet.tsx, exporting.ts |
| E-07 | Media | Importar la misma colección JSON duplica piezas; un item nulo rechaza toda la importación. Respaldo/restauración poco fiables. | IDs y fechas estables, fusión común con sesiones, normalización por elemento, límite de cantidad y resumen nuevas/ya existentes/no válidas. | files.ts, store.ts, Sheets.tsx, history.ts, shared/session.ts |
| E-08 | Media | Tamaño de 12 movimientos de partículas no cambia parte o todo el recorrido por un suelo en píxeles. Control visible que parece roto. | Mapear el recorrido entre suelo y máximo de forma efectiva en GLSL y CPU; verificar paridad a varias celdas y tamaños. | engine/glsl/particles.ts, basic/particles.ts, panels.tsx |
| E-09 | Baja | ZIP de 215 KB que declara 200 MB provoca congelación de 8,7 s, medida una vez. Riesgo de bloqueo al importar. No se probaron varios GB. | Validar tamaño declarado antes de descomprimir y limitar entradas/tamaño total, conservando límites durante la descompresión. | shared/inflate.ts, zip.ts, session.ts, project.ts |
| E-10 | Baja | Portapapeles bloqueado: L no ofrece salida y Compartir afirma que copió sin hacerlo. Se pierde acceso claro al enlace. | Hacer que copyText informe éxito y abrir la hoja/selección manual al fallar; ajustar mensajes. | ShareSheet.tsx, download.ts |
| E-11 | Baja | Texto, mensaje y palabras exceden sus límites; se recortan al recargar/compartir sin aviso. La pieza cambia silenciosamente. | maxLength y contador, validación visible y reglas iguales en edición/normalización/importación. | recipe.ts, controls.tsx |
| E-12 | Baja | Promise.all asigna claves por orden de terminación y cambia hashes con igual código. Build no reproducible y comparación con producción ruidosa. | Ordenar claves antes de serializar y verificar dos builds iguales. | scripts/runtime-plugin.ts |
| E-13 | Baja | configLoader native falla por imports sin extensión; hoy el build habitual solo avisa. Limita compatibilidad del build. | Corregir extensiones/resolución y comprobar el modo native. | shared/brand.ts, landing/guias-data.ts |

## UX y accesibilidad

| ID | Gravedad | Qué se detectó y en qué afecta | Qué hay que hacer | Área principal |
|---|---|---|---|---|
| U-01 | Media | ★ sigue llena después de editar, aunque el favorito conserva la receta anterior. La copia que parece segura no contiene los últimos cambios. | Diferenciar guardado de cambiado después de guardar o actualizar el favorito explícitamente; texto/estado accesibles coherentes. | Deck.tsx, store.ts |
| U-02 | Media | Importar sesión más reciente reemplaza una edición local sin preguntar. Ctrl+Z solo la recupera hasta recargar; el aviso promete más de lo que dura. | Conservar versión local como entrada separada o confirmar el conflicto; comunicar la duración real de Deshacer. | store.ts, packages.ts, history.ts |
| U-03 | Media | Con Colores de la imagen, paleta/reparto/desplazamiento/ciclo siguen visibles pero no actúan. Recolorear parece no funcionar. | Atenuar/desactivar controles dependientes y ofrecer «Usar tu paleta». | panels.tsx, glsl/programs.ts, PaletteEditor.tsx |
| U-04 | Media | Atajos globales de una letra no se pueden desactivar ni reasignar. Por código afecta al criterio WCAG 2.1.4; no se probaron lectores/voz reales. | Ajuste para desactivar/reasignar o requisito de modificador; verificar campos, sliders, botones y tecnología asistiva. | App.tsx, Sheets.tsx |
| U-05 | Baja | Ctrl+Z/Y opera sobre la pieza oculta en Componentes o con una hoja abierta. Puede modificar algo que la persona no ve. | Aplicar guardas de espacio/hoja antes de procesar Deshacer/Rehacer. | App.tsx |
| U-06 | Baja | Mantener R produce resultados por repetición de tecla. Llena historial y pierde control de tiradas. | Ignorar e.repeat para la acción. | App.tsx |
| U-07 | Baja | Un enlace pegado/cambiado con el estudio ya abierto no se procesa. Flujo de abrir recetas inconsistente. | Escuchar hashchange con reglas de conflicto y recuperación apropiadas. | boot.ts |
| U-08 | Baja | La poda protege ★, pero descarta piezas editadas; solo avisa una vez. Pérdida de ediciones antiguas no guardadas en colección. | Proteger ediciones o definir conservación/aviso y respaldo visibles antes de podar. | history.ts, store.ts |
| U-09 | Baja | Importación resume errores como «no es de GLYPHOS» y omite entradas inválidas sin informar. Difícil recuperar un archivo parcial. | Errores específicos, importación parcial explícita y conteo de descartes. | session.ts, packages.ts |
| U-10 | Baja | Recomienda MP4 H.264/WebM aunque el video ya sea H.264. Ayuda que no resuelve el error. | Distinguir códec, contenedor y otros fallos; recomendación contextual. | media.ts |
| U-11 | Baja | glyphos-field solo lee atributos al conectarse. Cambiar paused/recipe/etc. después no tiene efecto. Integraciones externas inesperadas. | Observar atributos soportados y actualizar/liberar recursos al cambiar. | runtime/api.ts |
| U-12 | Baja | Placa detrás del texto casi no cambia el resultado. Opción poco comprensible. | Revisar fórmula/rango y condiciones de visibilidad; aclarar o ajustar el control. | glsl/programs.ts |
| U-13 | Baja | Ocultar todas las capas muestra Nubes en vez de vacío. No respeta la composición elegida. | Respetar el estado de cero capas visibles en ambos motores y salidas. | panels.tsx |
| U-14 | Baja | El dado genera rotaciones negativas y el slider empieza en cero. Valor generado difícil de representar/editar. | Alinear generación, normalización y rango del control. | panels.tsx |
| U-15 | Informativo | Posición x/y y desfase existen en receta sin control. Capacidad no accesible en interfaz. | Decidir si exponerlos y diseñar controles; no es un fallo obligatorio. | panels.tsx |
| U-16 | Baja | 16 objetivos pequeños en escritorio; no apareció en táctil emulado. WCAG 2.5.8 no se confirmó por excepción de espaciado. | Revisar tamaño/espaciado y comprobar dispositivos/criterio real antes de declarar incumplimiento. | controles de escritorio |

## Riesgos y proceso

| ID | Gravedad | Qué se detectó y en qué afecta | Qué hay que hacer | Área principal |
|---|---|---|---|---|
| R-01 | Media; por comprobar | No hay ErrorBoundary raíz ni manejo global. Una excepción de render podría desmontar todo; no se reprodujo en navegador real. | Boundary raíz con Recargar y respaldo recuperable; seguimiento de unhandledrejection. Reproducir fallo real y validar recuperación. | main.tsx, Boundary.tsx, App.tsx |
| R-02 | Media; parcial | Catálogo ofrece pesos sin archivo local; hay escalones visualmente iguales, confirmado y de impacto bajo. Diferencia frente a Google Fonts exportado es hipótesis no comprobada. | Cargar pesos faltantes o recortar catálogo; comparar vista y exportación con red libre antes de confirmar la hipótesis. | catalog.ts, main.tsx, panels.tsx, exportador |
| R-03 | Media | No hay CI. Dos mutaciones de límites sobreviven a unitarias: MAX_LINK y video 200 MB → 2 GB. Cinco e2e fallaron por carga y pasaron al repetir. | Workflow typecheck/test/build y e2e acotado; pruebas de límites, E-01 y condiciones estables de ejecución. | proceso GitHub, pruebas |
| R-04 | Baja | HTML de texto conserva ESC/BEL del nombre en title. Otros formatos sí limpian. | Aplicar oneLine al título y comprobar caracteres de control. | text.ts |
| R-05 | Baja | Recetas/enlaces/sesiones de versiones futuras se abren y descartan campos desconocidos sin aviso. Compatibilidad y conservación en riesgo. | Avisar, conservar original y evitar sobrescribir incompatibles; regla común de versión. | recipe.ts, share.ts, session.ts |
| R-06 | Baja | Video espera loadeddata sin límite temporal. Chromium respondió; otros navegadores no comprobados. | Timeout, cancelación y error recuperable; probar Safari/Firefox. | media.ts |
| R-07 | Baja | Cancelar tardó 5,2 s con SwiftShader. GPU real no medida. Sensación de bloqueo al exportar. | Medir y dar feedback inmediato; ceder control entre pasos y cancelar trabajo pendiente. | exporting.ts |
| R-08 | Informativo | Chromium avisa de lecturas de píxeles sin esperar una valla en miniaturas. Coste no medido. | Perfilar antes de cambiar sincronización/render; documentar impacto real. | engine.ts |

## Incoherencias y observaciones de carga

| ID | Gravedad | Qué se detectó y en qué afecta | Qué hay que hacer | Área principal |
|---|---|---|---|---|
| I-01 | Baja | Espacio elegido no se restaura al recargar si la receta cabe en otro. Cambia el contexto de trabajo. | Restaurar preferencia de espacio con compatibilidad explícita. | store.ts |
| I-02 | Baja | Estilo v5 se ignora con generador v1–v4 sin aviso. Control aparentemente inútil. | Indicar incompatibilidad o restringir selector preservando semillas antiguas. | random/generator.ts |
| I-03 | Baja | Lissajous, Estrella de mar, Respiración, Radar y Galaxia no están en FIGURES y se cortan en vertical. Composición móvil dañada. | Revisar encuadre/clasificación y probar tamaños verticales sin alterar fondos de campo. | catalog.ts |
| I-04 | Baja | normalizeRecipe sin lista admite IDs desconocidos: WebGL vacío, básico Nubes. Mismos datos dan resultados distintos. | Validar IDs y recuperación compartida en ambos motores. | recipe.ts |
| I-05 | Baja | README declara generador 4 frente a 5; estilos/capacidades/componentes/paridad desactualizados. Documentación no describe producto actual. | Actualizar cantidades, formatos realmente disponibles y resultados verificables. | README.md, seeds.ts |
| I-06 | Baja | Componentes HTML mantienen listeners/observers al retirarse; fondo pegado sí libera. Puede acumular trabajo en páginas externas. | Ciclo de destrucción y limpieza de recursos; comprobar retirada/reinserción. | components/catalog.ts, lib/magnet.js |
| I-07 | Baja | Duración muestra 1,9 s pero bucle real 1,86 s. Precisión engañosa de exportación. | Mostrar duración suficiente y usar un único valor para interfaz y exportación. | ExportSheet.tsx |
| I-08 | Informativo | lastmod de las ocho URLs es fecha de build aunque contenido igual. Metadatos SEO poco precisos. | Evaluar fechas basadas en cambio real del contenido. | seo-plugin.ts |
| L-01 | Informativo | exporter-code 558 kB contiene dos runtimes y duplicación; posible ahorro aproximado 130 kB. Se carga solo al abrir Código. | Evaluar separación/deduplicación con medición y preservando exportaciones. | exporter-code |
| L-02 | Informativo | Inicio de studio: 953 kB JS, 324 kB gzip, 165 kB CSS, 31 archivos. FCP local del splash ~240 ms no mide interacción en equipos reales. | Medir producción y dispositivos reales antes de optimizar; separar carga del splash de disponibilidad del estudio. | /studio/ |
| L-03 | Informativo | Se publican 40 MB de ONNX del estudio pausado; el público no los descarga. Peso de despliegue sin uso público. | Evaluar excluirlos del despliegue público mientras no se utilicen. | dist/ort/1.30.0 |

## Orden de corrección y verificaciones necesarias

| Ola | Pendientes | Comprobación que debe acompañar el cambio |
|---|---|---|
| Datos/arranque | E-01, E-03, R-01, E-04 | E2E siembra índice v:4 y fallo de lectura: conservar IDs, cuerpos y ★ tras 20 s; sin escrituras/GC. Simular arranque fallido/lento y compilación fallida, comprobar salida recuperable y no repetición por fotograma. |
| Privacidad | E-02 | Dispositivos falsos y permisos reales: doble activación, cambio de espacio, parada y video con sonido. Cero pistas huérfanas. |
| Exportaciones | E-05, E-06, I-07 | Mismo estado/instante y estela en vista/salidas; repetir exportación desde inicio definido y verificar duración. |
| Ediciones/colección | U-01, U-02, E-07 | Editar favorito, importar conflicto, recargar, reimportar respaldo y mezclar entradas válidas/nulas; no perder ni duplicar datos. |
| Correcciones rápidas | E-10/U-06; U-05/U-07; E-11/E-12; E-13/I-05; U-04 | Validación específica del comportamiento, dos builds para reproducibilidad y comprobación de accesibilidad de atajos. |
| Proceso transversal | R-03 | CI desde el inicio de los arreglos; pruebas sensibles a los límites MAX_LINK y 200 MB, e2e con recursos controlados. |
| Pulido/medición | E-08, U-03, R-02, I-01–I-04 y restantes | Reproducción dirigida, paridad WebGL/básico, equipos reales y comparación de fuentes con acceso a red. Informativos se evalúan antes de convertirlos en tareas de código. |

## Lo que se debe conservar

El reporte verificó «genero → personalizo → Azar → regreso» sin perder ediciones; compartir y /ver/ correctos; salidas en general coherentes salvo E-05/E-06; XSS sin ejecución; npm audit con cero avisos; SEO limpio; Azar v5 variado y determinista; estudio de foto pausado contenido. La línea base reportada fue typecheck, 1798 unitarias, build y specs públicas e2e aprobadas en varias tandas, con repeticiones por carga de CPU.

Limitaciones declaradas correctamente: medios locales no viajan en enlaces; MP4 oculto cuando no hay H.264; historial limitado a 1000; una pestaña controla; cámara no se guarda. No tratar estas restricciones comunicadas como nuevos errores.

## Alcance pendiente de comprobar

Firefox, Safari, Chrome estable, móviles/GPU reales, H.264/MP4, pesos Google Fonts exportados, cuota real, ZIP de varios GB, permisos/cámaras reales, orientación, portapapeles/share reales, lectores de pantalla, Lighthouse de producción y verify-exports completo. La auditoría principal usó Chromium headless con SwiftShader y equipos emulados; sus tiempos no equivalen a GPU real.

Evidencia original indicada por el reporte: results/aud-arq-estado.md, aud-catalogo-coherencia.md, aud-flujo-datos.md y aud-salidas-medios.md, además de scripts/capturas/logs en el scratchpad temporal de la sesión de auditoría. Esos archivos externos no fueron aportados a esta copia del repositorio; no se afirma que estén preservados aquí. Se conserva el inventario y la referencia del reporte recibido.
