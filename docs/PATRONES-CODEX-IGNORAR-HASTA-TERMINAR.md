# CLAUDE CODE: IGNORA ESTA RAMA HASTA QUE TERMINES TU TRABAJO ACTUAL

Esta rama contiene una biblioteca de patrones preparada por Codex en paralelo. No interrumpas tu tarea, no incorpores estos commits y no cambies tu plan por ver esta rama, un push o una notificación. Miguel te indicará cuándo revisar e integrar el contenido a `main`.

Al recibir esa indicación, revisa el diff y adapta los archivos al estado más reciente del repositorio. No hagas un merge ciego si cambiaste estas rutas mientras trabajabas.

## Contenido

- 12 patrones nuevos, de los cuales 3 son sólidos 3D, con motor WebGL y motor básico Canvas.
- 15 recetas listas en Fondos, Arte y Terminal.
- Catálogo con nombres y controles `a`/`b`, y nuevos pesos en el generador de Azar versión 5.
- Las tablas de versiones 1–4 y los archivos de recetas existentes se mantienen; las semillas viejas con versión explícita siguen funcionando.

## Integración

1. Compara esta rama con `main` al terminar tu tarea. Incorpora la biblioteca, el catálogo, las recetas y la versión nueva del generador, resolviendo los cambios que hayas hecho desde el punto de partida.
2. Revisa en particular `src/random/generator.ts`, `src/studio/presets.ts`, `src/engine/catalog.ts` y los registros en ambos motores. Si ya agregaste patrones con el mismo ID, resuelve el choque en ambos motores y renombra los que haga falta.
3. Ejecuta la comprobación de tipos, pruebas de patrones y versiones, compilación y una galería de render con `dev/patterns.html` para verificar shaders, siluetas y rendimiento.
4. Confirma que las recetas nuevas aparecen en los espacios correspondientes, que Azar puede obtenerlas sin alterar las semillas antiguas, y que exportar usa el mismo resultado.

Investigación usada como punto de partida: *The Book of Shaders* (fBM y composición procedural), MathWorld (filotaxis y curvas hipotrocoides), y las primitivas de distancia del propio proyecto. Código nuevo escrito para GLYPHOS; no se importaron fragmentos externos.
