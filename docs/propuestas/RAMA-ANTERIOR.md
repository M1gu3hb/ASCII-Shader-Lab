# Procedencia y comprobación de la rama anterior

Comprobado el 7 de octubre de 2026 en M1gu3hb/ASCII-Shader-Lab.

- main: **9f3ef2aebee7262a88b1054ec1ca979116279991**.
- Rama anterior: **codex/patrones-ignorar-hasta-entrega**.
- Último commit anterior: **61b5a753bc8e94b748afa4b40388354a611f2965**.
- Base común: **21320dd29fb10a37dc7cb34c7a1eeec53ddb36d0**.
- Comparación Git: 4 commits exclusivos de la rama anterior y 91 de main. No es un merge directo registrado de esos cuatro commits; el contenido fue adaptado e integrado en el trabajo posterior.

## Evidencia de integración e independencia

Se compararon los identificadores de los catálogos de patrones, recetas y escenas: main contiene todos los encontrados en la rama anterior, con 160 identificadores en catalog.ts, 97 en presets.ts y 28 en scenes.ts. Esos números incluyen otras opciones de sus respectivos archivos; no equivalen a 160 patrones nuevos.

El objeto LIBRARY de src/engine/catalog.ts identifica expresamente la biblioteca integrada: 35 patrones, de los que 10 son sólidos; 12 movimientos de partículas; 10 juegos de caracteres y 3 animaciones de letras. src/random/palette-gallery.ts contiene las 40 paletas. Ambos motores, el catálogo y los exploradores actuales residen dentro del árbol de main.

La búsqueda en todos los archivos versionados de main no encontró referencias a codex/patrones-ignorar-hasta-entrega, patrones-ignorar o PATRONES-CODEX. La compilación/configuración no necesita acceder a esa rama para obtener esos archivos. Borrar el nombre de una rama no modifica el árbol ni los commits de main.

## Conservación de trabajo original

El código no es idéntico línea por línea: hubo rediseños del motor, catálogos, exploradores y generador. Las variantes antiguas v6/v7 no son versiones públicas incorporadas automáticamente al generador v5 actual.

Para conservar esos originales, el commit de documentación de glyphos-propuestas incluye el último commit anterior como segundo padre. Su árbol usa main más estos documentos; no restaura archivos antiguos sobre el producto actual. Los cuatro commits y su código siguen accesibles desde la historia de la nueva rama, aunque se retire el nombre anterior.

Commits conservados:

1. 242f6376445fa5527445cee52bdaec79768bee31 — primera biblioteca de patrones.
2. 945adeafb45ea832f7f7a362932836d4c8183fd7 — ampliación de fondos y sólidos.
3. 2a626f012e264809748f191fae9ab18678091306 — alfabetos y animaciones de glifos.
4. 61b5a753bc8e94b748afa4b40388354a611f2965 — color, partículas, exploradores y escenas.

El aviso antiguo dirigido a Claude queda como documento histórico en esos commits; no se adopta como instrucción para trabajar en esta rama.

## Estado del borrado

La eliminación del nombre remoto queda pendiente. El conector GitHub disponible permite crear ramas y actualizar referencias, pero no ofrece borrado de ramas. Git por terminal pudo leer el repositorio público; la comprobación de push mostró que no hay credenciales para escribir por esa vía. No se ha anunciado ni simulado un borrado exitoso.

La rama nueva conserva la historia necesaria. Se puede retirar la anterior cuando haya una vía de borrado autorizada y volver a verificar los nombres remotos. main no se cambia para realizarlo.
