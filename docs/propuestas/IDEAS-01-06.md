# GLYPHOS — Desarrollo de las ideas 1–6

Propuestas del 7 de octubre de 2026. La intención original de Miguel se conserva; las ampliaciones siguientes son propuestas para revisar al implementar. No hay funciones nuevas implementadas en esta entrega.

## 1. Reacción a la música

**Intención:** que la pieza entienda distintos componentes musicales y responda con variedad, en vez de moverse solamente cuando sube el volumen.

### Experiencia propuesta

Entrar en «Música», elegir una fuente y ver medidores de graves, medios, agudos y golpes. Aplicar una respuesta lista —suave, rítmica o intensa— o ajustar qué mueve cada señal. La persona puede escuchar la misma canción y cambiar la interpretación visual sin cambiar de pieza.

- Graves: tamaño, expansión, impulso de partículas o intensidad del relieve.
- Medios: deformación, movimiento de capas o densidad de glifos.
- Agudos: detalle, brillo, pequeñas partículas o acentos de color.
- Golpes y cambios de energía: sembrar una simulación, pasar de escena o disparar una transición.
- Ritmo estimado: sincronizar velocidades y cambios cuando la estimación sea fiable; ofrecer «Marcar tempo» y un tempo manual como alternativa.

Estas asociaciones deben ser editables. Un panel avanzado permite invertir una respuesta, limitar su recorrido, ajustar sensibilidad, suavizado, ataque y caída. Los controles de la receta siguen disponibles y la música los modula dentro del rango elegido.

### Fuentes y alcance

Primera entrega: micrófono y archivo de audio local, analizados en el navegador. Después, estudiar captura de audio de otra pestaña o del sistema donde el navegador la permita. No prometer captura de cualquier aplicación, Spotify o audio del sistema en todos los dispositivos.

Separar bandas de frecuencia, detectar transitorios y medir energía no equivale a reconocer por separado voz, batería, bajo y cada instrumento. La separación de instrumentos sería una ampliación distinta que puede requerir modelos especializados. La IA no es un requisito para la primera entrega.

El código actual de live.ts calcula un único pulso con más peso en las frecuencias bajas. La propuesta amplía esa base hacia señales independientes y asignaciones configurables; no se da por implementado un detector musical completo.

### Guardado y comprobación

Guardar las asignaciones musicales en la receta. Si se comparte solo la receta, indicar que el archivo local no viaja. Para reproducir o exportar exactamente una actuación, estudiar grabar las señales analizadas o usar una pista local con un reloj definido.

Antes de ampliar el micrófono, resolver **E-02**: indicador siempre accesible, botón de detener, permisos pedidos tras una acción y protección frente a activaciones simultáneas. Probar con silencio, voz, música suave e intensa; comprobar que cada banda puede actuar por separado y que el apagado detiene todas las pistas.

Base técnica documental: [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). El mapeo a GLYPHOS y la detección musical son diseño propuesto.

## 2. Tu propio Azar

**Intención:** elegir qué contenido participa, combinar la biblioteca de GLYPHOS con recursos propios y guardar un generador personal.

### Experiencia propuesta

«Crear mi Azar» abre una selección con vistas previas y casillas: plantillas, familias visuales, paletas, juegos de glifos, efectos, movimientos y composiciones. Se puede empezar vacío, a partir de un perfil de GLYPHOS o desde una carpeta de favoritos.

Después se agregan imágenes/PNG, paletas, tipografías y recetas propias. El contenido 3D queda previsto como una ampliación con importación y preparación propias. No se tratará un modelo 3D como si fuera una imagen ni se ejecutará código arbitrario subido por una persona.

Antes de guardar, «Probar 12 resultados» muestra ejemplos del perfil. Cada perfil tiene nombre, descripción y miniatura. El botón Azar puede mostrar claramente qué perfil está activo y permitir volver al generador general.

### Ampliaciones útiles

- Dos modos: **elegir recetas completas** o **combinar componentes**. Así una persona decide cuánto quiere que cambie cada tirada.
- Frecuencia por opción: nunca, normal o frecuente; más adelante pesos numéricos.
- Reglas: máximo de capas, evitar sólidos costosos juntos, limitar velocidad, exigir fondo oscuro, conservar medio o texto.
- Bloqueos por tirada: mantener colores, glifos o una capa y variar lo demás.
- Historial del perfil y creación de variantes a partir de un resultado favorito.
- Duplicar, exportar e importar el perfil con sus recursos, cuando corresponda.

### Entregas y comprobación

Primero usar contenido ya compatible: recetas, patrones, paletas y juegos de caracteres existentes. Después añadir recursos propios y finalmente 3D. El perfil debe registrar semilla, versión del generador y referencias estables a sus recursos, sin alterar los generadores antiguos.

Si una selección no admite combinaciones válidas, explicar el motivo y señalar qué ampliar. No recurrir silenciosamente a elementos que no fueron seleccionados. Si falta un recurso importado, pedir recuperarlo o elegir una sustitución.

Comprobar determinismo, límites de complejidad, ausencia de elementos excluidos, restauración del perfil y el flujo «edito → Azar → regreso». Los recursos locales necesitan una copia de seguridad transportable; un enlace por sí solo no los contiene.

## 3. Glifos y alfabetos propios

**Intención:** dibujar o subir caracteres, construir un abecedario propio y explorar la generación asistida del resto a partir de una muestra.

### Tres caminos de creación

1. **Conjunto de formas:** subir PNG transparentes y asignarles un orden de densidad. Pueden ser iconos, dibujos o marcas; no necesitan representar letras.
2. **Abecedario completo:** dibujar/subir cada carácter, asignarlo a una letra y revisar su tamaño y posición. Incluir ñ/Ñ, acentos, cifras y puntuación según el conjunto elegido.
3. **Asistente de estilo:** partir de una o varias letras y proponer otras compatibles. La persona revisa y corrige cada resultado; completar automáticamente una tipografía coherente desde una sola letra es una línea de investigación, no una capacidad garantizada.

### Editor propuesto

Cuadrícula con celdas vacías y caracteres pendientes; lienzo para dibujar, subir imagen, recortar, borrar fondo cuando corresponda, mover y escalar. Vistas de prueba con una palabra, un párrafo y la pieza ASCII actual. Permitir duplicar un carácter para crear variantes y mantener originales para deshacer.

Los glifos para arte ASCII necesitan límites, centrado y una clasificación por cobertura. Los destinados a escribir necesitan además línea base, avance y espaciado. Un conjunto de imágenes para el motor no tiene que convertirse en una fuente instalable: exportar TTF/OTF sería otra entrega.

### Método y comprobación

Empezar con herramientas geométricas: transparencia, caja del contenido, cobertura, escalado y ajustes manuales. Estos cálculos resuelven tamaño y colocación sin redes neuronales. Evaluar IA después para completar diseños, vectorizar o transferir estilo, conservando siempre edición manual.

Crear un recurso versionado con identificadores estables, caracteres asignados, métricas y miniaturas. Integrarlo con Azar propio, carpetas y exportaciones. No subir archivos privados a un servicio de IA sin una acción explícita y explicación del flujo.

Comprobar legibilidad a varios tamaños, glifos muy finos/gruesos, PNG vacíos, transparencia, caracteres ausentes, respaldo/restauración y coincidencia de vista, visor y exportación. En código exportado debe viajar el atlas autorizado o indicarse cómo suministrarlo.

## 4. Fondo de pantalla GLYPHOS

**Intención:** una pieza como fondo estático o vivo, con bucle o evolución continua, y un botón/widget Azar que la cambie.

### Lo que conviene separar

| Modalidad | Propuesta | Viabilidad documental actual |
|---|---|---|
| Imagen estática | Exportación a medida del dispositivo, encuadre y zona libre para iconos. | La web puede generar el archivo; establecerlo depende del sistema y de la acción del usuario. |
| Clip animado | Exportar un video y explicar dónde puede usarse como fondo. | Admitir un archivo no significa que todos los sistemas admitan fondos de video. |
| Fondo web vivo en Windows | Paquete HTML/receta compatible con un anfitrión de fondos de pantalla. | [Lively](https://github.com/lively-community/lively) admite páginas web interactivas y tiene APIs/automatización. Requiere esa aplicación de escritorio. |
| Fondo vivo Android | Motor o superficie nativa, receta persistente y selección mediante el sistema. | Android ofrece [WallpaperService](https://developer.android.com/reference/android/service/wallpaper/WallpaperService). Se requiere una integración nativa; instalar una PWA no crea ese servicio. |
| iPhone/iPad | Exportar imágenes e investigar otras modalidades oficiales compatibles. | [Apple](https://support.apple.com/en-us/102638) documenta fotos y opciones del sistema. No asumir que una app puede instalar un shader arbitrario que funcione continuamente detrás de otras apps. |

La propuesta inicial es exportar imágenes con buena composición y preparar un prototipo compatible con Lively. La aplicación Android y su widget serían una fase posterior. No existe una vía web estándar universal comprobada aquí para «establecer este shader como fondo de pantalla» en todos los sistemas.

### Experiencia del fondo vivo

Elegir una receta, carpeta o perfil de Azar. Cambiar manualmente con un acceso/widget o automáticamente con un intervalo. Modo tranquilo, límite de fotogramas, pausa cuando no se ve y comportamiento con batería. Evitar capturar micrófono/cámara permanentemente por defecto.

El widget no dibuja necesariamente el fondo: solicita a la integración que cambie la receta y esta actualiza la superficie. Duración continua y bucle exacto son opciones diferentes; una simulación orgánica no garantiza un bucle por elegir una duración.

Comprobar arranque del dispositivo, suspensión, cambios de pantalla/orientación, consumo, recuperación de recursos y coherencia con los favoritos. La viabilidad del widget y las APIs concretas de cada sistema se valida al crear el prototipo.

## 5. Modo Visuales y segunda pantalla

**Intención:** actuar con GLYPHOS en fiestas, sets de DJ o instalaciones: controles en una pantalla y solamente la pieza en otra.

### Experiencia propuesta

«Abrir salida» crea una ventana limpia con la pieza. En navegadores compatibles se solicita acceso a las pantallas y se elige la de salida; en otros, se abre una ventana que la persona mueve manualmente y pone a pantalla completa.

El estudio muestra el estado de conexión, resolución y calidad de la salida. Personalización, música, favoritos y Azar se controlan en la ventana principal. Cerrar la salida devuelve el estado a «desconectada» sin perder la edición.

Ampliaciones: lista de escenas, avance manual o automático, transiciones regulables, tempo manual, control de intensidad y un botón de pantalla negra. Una carpeta puede convertirse en una lista para un set; un perfil de Azar puede llenar esa lista.

### Arquitectura que habrá que resolver

La salida debe compartir receta y reloj; para simulaciones con memoria también estado o secuencia de acciones. No basta abrir un enlace que regenere otra evolución. Un controlador único debe administrar micrófono/cámara y compartir la señal necesaria; evitar dos solicitudes de captura.

La documentación de Chrome permite detectar [Window Management](https://developer.chrome.com/docs/capabilities/web-apis/window-management) y seleccionar pantallas con permiso. No debe convertirse en requisito para que el modo funcione. Revisar comunicación entre ventanas, pantalla completa, bloqueo de ventanas emergentes y pérdida de contexto gráfico.

Comprobar dos pantallas reales, reconexión, controles en vivo, sincronía musical y larga duración. E-02, E-04, E-05 y E-06 afectan directamente a la confianza de este modo y deben resolverse antes de su entrega.

## 6. Carpetas de piezas guardadas

**Intención:** crear carpetas con nombre y guardar desde la estrella en una carpeta o en la colección general, todo desde el navegador.

### Experiencia propuesta

Un clic en ★ sigue siendo rápido: guarda en «Sin carpeta» o en la última carpeta elegida, según una preferencia visible. La opción «Guardar en…» abre las carpetas existentes y permite crear otra al momento. No obligar a clasificar cada pieza.

La colección ofrece «Todas», «Sin carpeta» y carpetas propias con contadores. Permitir renombrar, mover varias piezas, duplicar una pieza y ordenar. Al borrar una carpeta, ofrecer conservar sus piezas en «Sin carpeta»; borrar piezas es una acción distinta y admite deshacer.

Primera entrega: una carpeta principal por pieza para mantener el flujo sencillo. Si después hace falta pertenecer a varias categorías, estudiar etiquetas o referencias múltiples sin duplicar la receta.

### Datos y comprobación

Usar **IndexedDB**, que el proyecto ya utiliza, para recetas, carpetas y recursos. Las cookies no son adecuadas para almacenar esta colección. Guardar identificadores de carpetas y pertenencias, incluirlos en «Guardar sesión» y ofrecer exportar una carpeta.

Una colección antigua debe migrar sin perder sus favoritos. Importar dos veces un respaldo no duplica carpetas ni piezas. Respetar el control de una sola pestaña y, ante un fallo de lectura, no escribir un estado vacío.

Dependencias directas: **E-01, E-07, U-01 y U-02**. Antes de ampliar la colección, resolver la pérdida de datos, la deduplicación y el significado de la estrella después de editar. Comprobar migración, importación parcial, nombre repetido, carpeta borrada, recarga, deshacer y restauración desde respaldo.

## Cómo se conectan las propuestas

Una carpeta puede alimentar un Azar propio y una lista de Visuales. Los glifos y paletas propios son recursos del mismo perfil. Música y gestos modulan una receta; la salida, exportación y fondo vivo deben interpretar esa receta de forma coherente. Las simulaciones de la idea 7 y del catálogo visual aportan nuevas fuentes, pero necesitan resolver su estado temporal antes de prometer guardado o bucles exactos.
