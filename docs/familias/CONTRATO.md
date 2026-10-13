# Contrato para implementar una familia visual de GLYPHOS

Guía técnica interna para quien añade una familia en `src/families/`. Complementa `docs/cambios/FAMILIAS-Y-GLIFOS.md`.

## Qué es una familia

Un mecanismo reconocible dibujado por el motor ASCII de GLYPHOS: un campo de luminancia 0..1 que el motor convierte en caracteres. No basta con recolorear o renombrar un patrón existente.

Tres contratos de ejecución (`src/families/types.ts`):

| Tipo | Qué entrega | Código |
| --- | --- | --- |
| `analytic` | Función pura de (p, t, parámetros). Admite bucle perfecto. | GLSL `float F_<id>(vec2 p, float t, vec4 k0, vec4 k1)` en `analytic/<id>.ts` + gemelo de CPU `impl` en `analytic/<id>.cpu.ts`. |
| `geometry` | Estructura construida desde la semilla (gramática, restricciones, líneas de campo) que crece por pasos y se dibuja. | `sims/<id>.ts` → `export function create(cfg): FieldModel`. |
| `simulation` | Modelo con memoria que evoluciona por pasos fijos desde una semilla. | `sims/<id>.ts` → `export function create(cfg): FieldModel`. |

Las familias de geometría y simulación («raster») corren en TypeScript en la CPU. Son el mismo código para el motor WebGL2 y para el básico, así que los dos muestran el mismo estado. El modelo escribe un raster de 8 bits de `w = 2·res` × `h = res`. Ese raster cubre el dominio x ∈ [−1, 1], y ∈ [−0,5, 0,5] (alturas de pantalla, y hacia arriba; la fila 0 es la de arriba). El motor lo muestrea con interpolación bilineal en las coordenadas de la capa, que ya llevan escala, giro y posición. Fuera del dominio el raster se repite (`wrap: 'repeat'`) o queda vacío (`'clamp'`).

## Archivos de una familia

1. `src/families/meta/<id>.ts` → `export const META: FamilyMeta`. Contiene id, nombre, grupo, tipo, versión de algoritmo (1), textos (blurb, mechanism, time), parámetros tipados, al menos 3 presets, capacidades (`caps`), presupuesto (`budget`), fuentes, `wrap`, `figure` y `extends`. Ver los ejemplos `reaccion_difusion.ts`, `sistema_l.ts` y `fractal_3d.ts`.
2. El código: `sims/<id>.ts`, o `analytic/<id>.ts` más `analytic/<id>.cpu.ts`.
3. El registro, en archivos compartidos:
   - `meta/<grupo>.ts` (añadir a la lista del grupo);
   - `load.ts` (entrada en `CODE`);
   - para analíticas, `analytic/glsl.ts` (`FAMILY_GLSL`).
4. Pruebas propias opcionales en `tests/unit/family-<id>.test.ts`. La batería genérica `tests/unit/families.test.ts` corre sobre todas.

## Reglas del modelo (`FieldModel`)

- **Determinismo:** todo lo aleatorio sale de `new SimRng(\`<id>|<versión>|${cfg.seed}\`)` (`src/families/rng.ts`). Nada de `Math.random`, `Date.now` ni `performance.now` dentro del modelo.
- **Paso fijo:** `step(n)` avanza n pasos de tamaño fijo. `budget.rate` dice cuántos pasos hay por segundo de capa. `budget.warmup` es el calentamiento definido antes del primer cuadro. El tiempo real no entra en el modelo.
- **`render(out, t)`:** escribe el raster. Puede depender de `t` (una cámara que gira, un balanceo), pero no puede cambiar el estado.
- **`snapshot()`:** copia completa del estado (arrays copiados con `.slice()`, escalares y estado del RNG con `rng.save`). Con `restore(s)`, seguir `n` pasos debe dar exactamente lo mismo que la corrida original.
- **`setParams(p)`:** aplica los parámetros en vivo sin reiniciar. Los parámetros marcados `rebuild: true` los resuelve el anfitrión creando el modelo de nuevo, y el modelo puede ignorarlos en `setParams`.
- **`stroke(s)`** (si la familia declara pincel en `caps.brushes`): actúa sobre el estado en coordenadas del dominio.
- **Presupuesto:**
  - a la resolución por defecto, `ms/paso × rate` ≲ 250 ms por segundo simulado en Node (el motor vivo reparte unos 8 ms por cuadro);
  - el calentamiento debe tardar ≲ 400 ms;
  - límites duros en código para agentes, nodos, iteraciones y memoria, declarados en `budget.limits`.
- **Extremos:** cualquier valor dentro de los rangos no produce NaN, no se cuelga y no reserva memoria sin límite.
- **Herramientas:** `src/families/draw.ts` (Accum: líneas AA, manchas, desenfoque, decaimiento, `toBytes`, `OrbitCamera`).

## Reglas de una analítica

- Hasta 8 parámetros: llegan a `k0` y `k1` en el orden declarado (choice = índice, bool = 0/1).
- El GLSL va dentro del shader de campo junto a `GLSL_CORE` (`src/engine/glsl/core.ts`: hash, ruido, fbm, fbm3, rot2…) con `PX` global (tamaño de una celda).
- **Gemelo de CPU:** el mismo cálculo línea a línea con `prep(t, k)` para el trabajo por cuadro. Si es costoso, puede tener menos presupuesto. En ese caso `caps.basic = 'reduced'` y `caps.basicNote` explica qué omite.
- Valores en 0..1 siempre.
- Bucles acotados por constantes; nada de recursión.

## Producto

- Textos en español, con «» y tuteo, en lenguaje de producto. Comentarios del código en inglés, breves, con el estilo del repositorio.
- **Parámetros con efecto real y legible:** etiqueta corta, `hint` que dice qué cambia, unidades cuando ayudan.
- **Presets:**
  - cada uno muestra un régimen distinto del mecanismo; no basta con otro color;
  - nombres evocadores con su `desc`;
  - el `look` (paleta, fondo, juego de caracteres) acompaña, pero no es lo que los distingue;
  - la batería exige que los rasters difieran.
- **Legibilidad ASCII:**
  - el raster debe leerse con celdas de 8–14 px;
  - las líneas deben medir al menos ~1 celda (la resolución por defecto se acerca al número de filas de celdas: 64–128);
  - las densidades tienen un rango tonal útil.
- **Tiempo honesto:** las familias con memoria dicen en `time` que evolucionan y que no tienen bucle perfecto.

## Licencias

Todo el código es propio, escrito a partir de los modelos publicados (ecuaciones, algoritmos). No se copia código, texto, imágenes, tablas de presets ni datos de las referencias. Varias referencias tienen licencias incompatibles: CC BY-NC-SA (Physarum de Bleuje/Jenson, experimentos de Jason Webb), GPL (Golly) o todos los derechos reservados (RD Tool, 4rknova, Falstad, piellardj). Los presets se ajustan a mano en GLYPHOS. Las fuentes se citan en `META.sources`.

## Verificación

- `npx vitest run tests/unit/families.test.ts`: la batería genérica.
- `npx esbuild scripts/families-viz.ts --bundle --platform=node --format=esm --outfile=.cache/families-viz.mjs && node .cache/families-viz.mjs <dir> <id>`: escribe un PNG por preset y mide ms/paso. Revisa cada PNG.
- Con navegador: `npx vite --port <puerto> &` y después `node scripts/families-qa.mjs --url=http://localhost:<puerto> --ids=<id> --compare --shot=<png>`. Esta página dibuja cada preset en los dos motores con un valor `r` de paridad. Las raster deben dar r = 1. Las analíticas suelen superar 0,99 si el gemelo es completo.
- `npx tsc --noEmit` sin errores.
