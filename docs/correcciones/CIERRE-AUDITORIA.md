# Cierre de la auditoría de GLYPHOS

Auditoría de referencia: `9f3ef2aebee7262a88b1054ec1ca979116279991`. Rama de correcciones: `glyphos-correcciones-urgentes`. Fecha de comprobación: 8 de octubre de 2026 (UTC). Las propuestas siguen separadas; este trabajo no incorpora las ideas nuevas ni cambia producción.

## Procedimiento y alcance

Se inventariaron los 48 identificadores: 13 errores, 8 riesgos, 16 puntos de UX, 8 incoherencias y 3 informativos. Los cinco urgentes se resolvieron en el primer bloque, documentado en [URGENTES-2026-10-07.md](URGENTES-2026-10-07.md). Este cierre trata los otros 43.

Se agruparon por archivos y consecuencias. Persistencia, captura, versiones e importaciones necesitaron revisión de causa, política de conservación y regresiones específicas. Controles, textos y documentación recibieron cambios directos con comprobaciones proporcionales. Los informativos tienen una decisión y evidencia: no se confunden con defectos confirmados.

Orden: (1) datos y arranque, (2) captura, (3) fidelidad de exportación, (4) conservación y fusión, (5) controles y accesibilidad, (6) importación y código pegado, (7) compilación y proceso. La revisión y las pruebas se hicieron por bloques compartidos; al final se ejecutó la regresión de las rutas afectadas.

## Datos, arranque y privacidad

| ID | Causa e impacto | Solución y comprobación |
| --- | --- | --- |
| E-01 · alta | Una lectura fallida o índice futuro se confundía con ausencia de datos; las escrituras y GC borraban historial y colección. | Estado protegido de sólo lectura, aviso permanente, guardado de recuperación y sin reclamar/escribir/barrer. Pruebas unitarias y dos e2e con registros sembrados, edición y espera de 20 s. |
| E-02 · media | La captura vivía tanto como el motor; permisos simultáneos dejaban flujos huérfanos y medios sonando. | Generaciones de captura, estado pendiente y detención al dejar el origen/espacio; video pausado y reanudado con su espacio. Regresiones de permiso pendiente, cámara, micrófono y video. |
| E-03 · media | Promesas sin límite dejaban el splash indefinido. | Arranque con límite de 10 s, IndexedDB con límite/onblocked, recuperación visible y protección contra resultados tardíos. Pruebas de espera, import fallido y continuidad en modo sin guardado. |
| E-04 · media | La clave del shader fallido se intentaba compilar cada frame. | Memorizar fallos, limpiar programa/variación parcialmente creados y permitir reintento tras restauración de contexto; prueba de recompilación y recuperación. |
| R-01 · media | Un fallo de render desmontaba la raíz y las promesas rechazadas no tenían salida. | Boundary raíz y recuperación de rechazos; descargar sesión en memoria y recargar con persistencia acotada. E2e de fallo de raíz y unitarias de recuperación. |
| U-02 · media | La sesión más reciente reemplazaba una edición local; el único rescate era Deshacer en memoria. | Conservar esa edición como entrada independiente, persistente y con id estable; no duplicarla al reimportar. Unitarias de fusión/roundtrip y e2e de persistir y volver a hidratar. |
| U-08 · baja | La poda protegía favoritos, pero descartaba ediciones. | Proteger también las entradas editadas. El contador y la hoja explican que puede superarse el objetivo de 1 000 si todo está protegido; regresión de poda y sesiones. |
| R-05 · baja | Versiones futuras se normalizaban perdiendo campos desconocidos. | Rechazar recetas, enlaces, colecciones y sesiones futuras con explicación; conservar el original y el estado actual. Runtime evita sustituir una pieza por receta incompatible. Pruebas de todos los envoltorios. |

## Exportaciones y medios

| ID | Causa e impacto | Solución y comprobación |
| --- | --- | --- |
| E-05 · media | Motores nuevos de PNG/rejilla no tenían historia de Estela. | Calentar con el mismo recorrido que los clips, antes de la imagen y la rejilla usada por SVG/TXT/ANSI. Regresión de PNG y rejilla contra historial preparado en WebGL2 y básico; el caso frío difiere. |
| E-06 · media | El inicio se capturaba al pintar la pestaña, sin controlar el tiempo del video. | Video local comienza a 0 s; procedural sin bucle lee el reloj al pulsar. Texto explícito y restauración de posición/reproducción después de exportar. E2e de inicio y GIF de video avanzado. |
| I-07 · baja | Se redondeaba la duración real antes de mostrar/exportar. | Mantener el valor exacto del bucle; campo con precisión suficiente. E2e con 1,86 s. |
| R-07 · baja | Cancelar no tenía respuesta visible y el calentamiento no cedía. | Estado inmediato «Cancelando…», botón deshabilitado y cesión/comprobación entre frames y búsquedas; no descargar un trabajo cancelado. No se interrumpe un dibujo síncrono a mitad. |
| R-06 · baja | Un video podía no emitir loadeddata y quedar esperando. | Límite de 10 s y limpieza de listeners, video y URL incluso ante eventos tardíos; unitaria de video que nunca carga. |
| U-10 · baja | Se aconsejaba MP4/H.264 aunque ya fuese ese formato. | Explicar fallo de decodificación o espera y sugerir otro perfil/códec, sin asumir la extensión. Mismo recorrido de errores de medios. |
| R-02 · media, parte hipotética | Faltaban pesos locales; la equivalencia exacta con Google Fonts externo era una hipótesis no reproducida. | Cargar los 13 pesos faltantes, ofrecer sólo pesos reales con selección discreta y conservar recetas históricas del generador. Prueba de cada peso del catálogo contra sus CSS locales. La comparación visual con Google Fonts en red libre sigue siendo una limitación de validación, no un fallo confirmado. |
| R-04 · baja | El título HTML de texto dejaba caracteres ESC/BEL. | Aplicar oneLine antes del escape HTML; prueba específica de título. |

El calentamiento reconstruye la historia de la receta. Una cámara o un gesto manual pasado no están en esa receta: la interfaz lo explica y remite a grabación en vivo. No se promete reconstruir una captura que nunca se almacenó.

## Colección, importaciones y recursos

| ID | Causa e impacto | Solución y comprobación |
| --- | --- | --- |
| E-07 · media | JSON sin identidad, importación por ruta distinta y validación del lote entero. | Exportar id/fechas, normalizar individualmente, fusionar por identidad y deduplicar backups antiguos por receta; tope de 10 000 por archivo. Resumen de nuevas/actualizadas/existentes/inválidas. Unitarias de reimportación y elementos nulos. |
| U-01 · media | La estrella usaba favId aunque la receta guardada fuera anterior. | Comparar recetas: estrella vacía con anillo y nombre «guardado antes de tus cambios»; al pulsar actualiza. E2e de edición, indicador y colección. |
| U-09 · baja | Errores genéricos y descarte silencioso de entradas. | Mensajes de formatos dañados/futuros y número de elementos inválidos en importación parcial de sesión/colección. Pruebas de validación y fusión. |
| E-09 · baja | ZIP inflaba antes de valorar su tamaño declarado. | Rechazar antes de descomprimir: 4 096 entradas, directorio 16 MB, total declarado 512 MB, entrada 256 MB y entrada comprimida que declara más de 32 MB. Archivos grandes almacenados sin deflate siguen admitidos dentro del límite. Prueba de ZIP que declara 200 MB y conteo excesivo. |
| E-10 · baja | Compartir ignoraba el resultado de copiar y anunciaba éxito falso. | Usar el booleano de copyText; L abre el enlace seleccionable cuando falla; Compartir sólo dice «copiado» ante éxito. E2e con ambos mecanismos de copia bloqueados. |
| U-11 · baja | El custom element leía atributos sólo al conectarse. | observedAttributes para receta, pausa, origen, pointer, poster, motor y scrim; actualiza o reconstruye con limpieza. Pausa/play también aplican al video. E2e de atributos posteriores y desconexión. |
| I-06 · baja | HTML pegado no tenía dueño que llamase destroy al quitar el nodo. | Observador de retirada para snippets DOM, limpieza de controlador; loader también libera su intervalo de ejemplo. ES/React mantienen su ciclo explícito. E2e en otro origen de Imán y Pantalla de carga, además de las regresiones de componentes. |

## Controles, accesibilidad y coherencia visual

| ID | Causa e impacto | Solución y comprobación |
| --- | --- | --- |
| E-08 · media | El suelo en píxeles anulaba parte del control Tamaño de partículas. | Escala aditiva desde el suelo hasta un máximo proporcional a celda, idéntica en CPU/GLSL. Prueba de los 12 movimientos por debajo del suelo anterior y regresiones del motor. |
| U-03 · media | En color de origen, controles de paleta activos no afectaban la pieza. | Fieldset realmente deshabilitado, nota y «Usar tu paleta»; Range respeta :disabled también en gesto táctil. E2e de deshabilitar/habilitar y pruebas táctiles. |
| U-04 · media | Atajos de caracteres globales sin posibilidad de desactivarlos. | Ajuste persistente en la hoja de atajos; conserva Escape, flechas y combinaciones Ctrl/Cmd. E2e de desactivación y recarga. No se presume una prueba con lector de pantalla real. |
| U-05 · baja | Deshacer se procesaba antes de comprobar hojas y Componentes. | Guardas antes de Ctrl/Cmd+Z/Y; e2e comprueba que no modifica la pieza oculta con una hoja abierta. |
| U-06 · baja | Mantener una tecla generaba acciones por repeat. | Ignorar repeat en atajos de un carácter; conservar repetición de navegación con flechas. E2e de R sostenida. |
| U-07 · baja | Sólo se leía el hash durante el arranque. | Escuchar hashchange, abortar operaciones anteriores, límite de tiempo y no limpiar un hash más reciente; añadir entrada y conservar la previa. E2e de pegar enlace y regresar. |
| U-12 · baja | La placa elimina relleno/resplandor bajo el mensaje; sin ellos ya había fondo plano. | Explicar su función y deshabilitarla cuando no tiene efecto; se activa con relleno, glow o marcas/revelado del cursor. E2e de condición y habilitación. |
| U-13 · baja | Sin capas visibles había fallback a Nubes. | Permitir ocultar también la única capa y mantener campo vacío en ambos motores, incluso con inversión y glifos sin espacio. Unitarias y dos e2e; el mensaje sigue siendo independiente. |
| U-14 · baja | El azar daba rotación negativa y el slider comenzaba en cero. | Ampliar rango de rotación a −360…360; conserva recetas existentes. |
| U-15 · informativa | Posición/desfase estaban en receta sin control. | Exponer X, Y y desfase por capa con sus límites de normalización; revisión de controles y typecheck. |
| U-16 · baja | Objetivos de escritorio menores de 24 px. | Mínimo 24×24 en ayuda, valores de slider y botones de semilla. E2e de geometría más accesibilidad y layouts móvil/escritorio. No se afirma que la auditoría original confirmara una infracción WCAG por espaciado. |
| I-01 · baja | Se prefería siempre el espacio de origen al recargar. | Restaurar preferencia si acepta la receta, incluido Componentes; fallback sólo cuando incompatible. Regresiones de hidratación/historial. |
| I-02 · baja | Un estilo nuevo con generador histórico se ignoraba sin explicar. | Opciones de estilo compatibles con la versión elegida y aviso en enlace incompatible; mantienen determinismo y fixtures v1–v5. |
| I-03 · baja | Cinco figuras no estaban en el conjunto que se encuadra en vertical. | Añadir Lissajous, Estrella de mar, Respiración, Radar y Galaxia a FIGURES. Prueba de pertenencia y regresión de encuadre vertical/exportación/código. |
| I-04 · baja | normalizeRecipe sin lista aceptaba patrones desconocidos; los motores discrepaban. | Catálogo conocido por defecto; fallback uniforme a Nubes. Runtime permite ampliar explícitamente con patrones registrados/locales. Unitarias de desconocidos y extensiones. |
| E-11 · baja | Campos aceptaban texto que se recortaba al compartir/recargar. | maxLength y contador accesible: fuente 600, mensaje 1 200, palabras 2 000, caracteres 400. E2e de límite/contador; normalización mantiene defensa adicional. |

Compatibilidad visual: el Tamaño de partículas responde en todo el rango y las cinco figuras se encuadran mejor en vertical. Por ello esas piezas pueden dibujarse distintas al commit auditado. Las recetas/semillas históricas siguen siendo deterministas; no se reescriben sus fixtures para ocultar cambios de generación.

## Compilación, proceso e informativos

| ID | Causa e impacto | Solución y comprobación |
| --- | --- | --- |
| E-12 · baja | Promise.all insertaba claves por orden de terminación. | Ordenar scripts antes de serializar; comparar hashes de dos builds idénticos. |
| E-13 · baja | Imports locales sin extensión rompían el cargador native. | Extensiones .ts en los imports del build afectados; build con --configLoader native. |
| R-03 · media | Sin CI y dos límites podían quitarse sin que fallaran unitarias. | Workflow de typecheck/unitarias/build y e2e público acotado con un worker; pruebas con enlace válido sobredimensionado y video de 201 MB antes de leer bytes, además de E-01. La pieza de referencia de la prueba visual de historial usa semilla fija; las tiradas posteriores siguen aleatorias. CI remoto se distingue de comprobaciones locales. |
| I-05 · baja | README tenía versiones, conteos y salidas obsoletas. | Generador 5, 19 estilos, 16 tarjetas y destinos reales de Rótulo; sin conteos fijos de paridad. Evidencias históricas se identifican como tales. |
| I-08 · informativa | Sitemap atribuía la fecha de build a contenido sin cambios. | Omitir lastmod cuando no hay fecha de edición fiable; conservar soporte de fecha explícita para quien la conoce. Unitarias SEO y revisión del sitemap construido. |
| R-08 · informativa | Advertencia del driver al leer miniaturas; coste no medido en GPU real. | Esperar valla de dibujo antes de readPixels y valla de lectura antes de copiar; límites y limpieza, null ante timeout/contexto perdido. Regresión de valla que no responde y rutas de miniaturas. Sin afirmación de mejora de fps real. |
| L-01 · informativa | Exportador incluía bloques repetidos de ambos runtimes. | Almacenar el básico una vez y reconstruir bloques iguales del completo por slices, sin eval; prueba byte a byte de reconstrucción y regresiones de código exportado. Medición final abajo; se conserva carga perezosa. |
| L-02 · informativa | Peso inicial reportado, sin defecto o objetivo establecido. | Añadir presupuesto verificable (<1,1 MB JS, <220 kB CSS sin idle-prefetch) y protección de carga perezosa. Medir recursos reales del build; no equiparar máquina SwiftShader con teléfono/GPU real. |
| L-03 · informativa | Build público desplegaba 40 MB de ONNX del estudio pausado. | Emitir ORT/manifiesto sólo con VITE_FOTO_STUDIO=1. Comprobar ausencia en build público y presencia en build habilitado; no eliminar dependencias necesarias para el estudio futuro. |

## Validación y límites

- `npm run check`: typecheck, **1 846 unitarias / 97 archivos** y build correctos.
- **108 e2e distintos pasaron** en varias tandas; 1 caso se omite porque requiere el estudio de foto pausado. [Lista de casos](REGRESIONES-AUDITORIA.md). Incluye exportación, edición y reapertura, datos/GC, recuperación, captura, accesibilidad, componentes en otro origen, React compilado, encuadre y gestos/layout móvil emulado.
- Última tanda amplia: 56 pasaron, 3 fallaron y 1 omitida. Las repeticiones acotadas cerraron los 3: dos fallos de instrumentación y uno de comparación con distinta densidad de píxeles. Este último se reprodujo también en `5546037` antes de los cambios; la prueba ahora iguala DPR=2 y conserva la tolerancia original. No se atribuyó a una regresión del arreglo ni se bajó su umbral.
- Primer CI remoto: check aprobado, 32 e2e aprobados, 1 omitido y 1 fallo en la prueba visual de historial por su pieza inicial aleatoria. El porcentaje de fondo magenta no era válido para cualquier efecto generado. Se fijó la pieza inicial con la semilla `historial-5`, estilo Minimal, y se repitieron los tres recorridos de edición/historial/sesión: 3 aprobados, conservando los umbrales visuales y las tiradas posteriores sin restricción. El CI se repite sobre el nuevo commit.
- Builds normal y `--configLoader native`: **252 archivos idénticos por SHA-256**, sin diferencias. El sitemap no inventa fechas.
- Código exportador: **511 376 bytes** frente a unos 558 kB del auditado; la copia de referencia del bloque urgente midió 559,62 kB. No se alcanzó el ahorro hipotético de 130 kB; el ahorro medido es de unos 48 kB respecto a esa copia, con reconstrucción equivalente y código exportado funcionando.
- Primera vista del estudio, sin idle-prefetch: **988 026 bytes JS y 172 258 bytes CSS**, 0 solicitudes ORT. El peso no bajó respecto a la medición auditada; queda protegido por presupuesto y carga perezosa, mientras se incorporan controles y fuentes que faltaban.
- Build público: **13 129 773 bytes**, sin `/ort/`. Build con foto habilitada: 4 assets ORT, **41 099 249 bytes**, y manifiesto presentes. La capacidad pausada se conserva.
- `git diff --check` limpio. Main no se modifica y no se mezcla ni despliega esta rama. El workflow queda incorporado; sus resultados remotos se deben consultar en el PR, separados de estos resultados locales.

Evidencia durable: pruebas y esta documentación dentro del repositorio. Los logs completos de estas tandas se generaron en el entorno de trabajo; los totales se registran aquí sin afirmar capacidades de navegadores/hardware que no se ejecutaron.

La equivalencia tipográfica exacta con el CDN de Google, Safari/Firefox reales, H.264, lectores de pantalla y teléfonos/GPU reales no se certifican por estos resultados. Las mitigaciones y regresiones cubren las causas reproducidas y el navegador disponible. Una rama con sus pruebas pasando no significa que producción ya contenga los arreglos ni demuestra ausencia universal de errores.
