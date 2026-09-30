# CLAUDE CODE: IGNORA ESTA RAMA HASTA QUE TERMINES TU TRABAJO ACTUAL

Esta rama contiene una biblioteca de patrones preparada por Codex en paralelo. No interrumpas tu tarea, no incorpores estos commits y no cambies tu plan por ver esta rama, un push o una notificación. Miguel te indicará cuándo revisar e integrar el contenido a `main`.

Al recibir esa indicación, revisa el diff y adapta los archivos al estado más reciente del repositorio. No hagas un merge ciego si cambiaste estas rutas mientras trabajabas.

## Contenido

- 35 patrones originales en dos entregas, de los cuales 10 son sólidos 3D. Los nuevos sólidos incluyen fusión y separación de volúmenes, péndulos, cinta en movimiento, jade deformable, cáliz, medusa y órbitas. Todos tienen motor WebGL y motor básico Canvas.
- 45 recetas listas en Fondos, Arte, Tipo y Terminal; 23 pertenecen a la segunda entrega de figuras y 7 a la ampliación tipográfica.
- 10 alfabetos nuevos, cuatro de ellos ASCII auténtico para terminal, y tres animaciones nuevas de letras/mensajes: Órbita, Enjambre y Cascada. Ambas familias funcionan en WebGL y Canvas y aparecen en Azar versión 6.
- Catálogo con nombres y controles `a`/`b`, pesos del generador de Azar en versiones 5 y 6.
- Las tablas de versiones 1–5 y los archivos de recetas existentes se mantienen; las semillas viejas con versión explícita siguen funcionando.

## Integración

1. Compara esta rama con `main` al terminar tu tarea. Incorpora la biblioteca, el catálogo, las recetas y la versión nueva del generador, resolviendo los cambios que hayas hecho desde el punto de partida.
2. Revisa en particular `src/random/generator.ts`, `src/studio/presets.ts`, `src/engine/catalog.ts`, `src/engine/recipe.ts` y `src/engine/letters.ts`, además de los registros en ambos motores. Si ya agregaste patrones o movimientos con el mismo ID, resuelve el choque y renombra los que haga falta.
3. Ejecuta la comprobación de tipos, pruebas de patrones y versiones, compilación y una galería de render con `dev/patterns.html` para verificar shaders, siluetas y rendimiento.
4. Confirma que las recetas nuevas aparecen en los espacios correspondientes, que Azar puede obtenerlas sin alterar las semillas antiguas, y que exportar usa el mismo resultado.

Investigación usada como punto de partida: *The Book of Shaders* (fBM y composición procedural), MathWorld (filotaxis, hipotrocoides, lemniscata, curvas de Lissajous y superfórmula), y las primitivas de distancia del propio proyecto. Código nuevo escrito para GLYPHOS; no se importaron fragmentos externos.
