# Investigación: 23 familias visuales y el estudio de glifos

Fecha: 9 de octubre de 2026. Rama de trabajo: `claude/new-session-7hc315` (el encargo pedía `glyphos-familias-y-estudio-glifos`; el entorno de trabajo obliga a usar la rama asignada).

Este documento recoge lo investigado antes y durante la implementación: qué referencia se consultó para cada familia, bajo qué licencia está, qué se tomó de ella y qué no. La regla fue la misma para todas: **el código es propio**; de las referencias se toman ecuaciones, algoritmos publicados y la idea visual, nunca código, presets, tablas de parámetros, texturas ni imágenes de terceros. El inventario de lo entregado está en [`docs/cambios/FAMILIAS-Y-GLIFOS.md`](../cambios/FAMILIAS-Y-GLIFOS.md).

## 1. Licencias de las referencias

Método: se leyeron los archivos `LICENSE` (o los encabezados de cada archivo cuando el repositorio no tiene uno raíz) desde `raw.githubusercontent.com`; las páginas sin repositorio se leyeron en su propio sitio. Cuando no hay licencia, se trata como «todos los derechos reservados».

| Referencia | Licencia encontrada | Uso en GLYPHOS |
|---|---|---|
| Karl Sims, *Reaction-Diffusion Tutorial* y RD Tool | © Karl Sims, todos los derechos reservados | Sólo las ecuaciones de Gray–Scott (estándar en la literatura: Pearson 1993). Código y presets propios. |
| Bleuje, *interactive-physarum* / Sage Jenson | CC BY-NC-SA 3.0 | Sólo el modelo de Jeff Jones (2010), publicado. No se copiaron las tablas de «36 Points». |
| Bert Chan, *Lenia* | MIT | Ecuaciones del artículo; especies y parámetros propios (Orbium se reproduce por su regla publicada, no por datos copiados). |
| Pavel Dobryakov, *WebGL-Fluid-Simulation* | MIT | Ninguno de su código: el fluido sigue a Stam (1999) sobre rejilla escalonada. |
| piellardj, *strange-attractors* | Sin licencia (`package.json` «ISC» por defecto) | Sólo las ecuaciones de Clifford, De Jong y Lorenz; coeficientes propios. |
| Jason Webb, *morphogenesis-resources* (crecimiento diferencial, DLA) | CC BY-NC-SA 4.0 | Sólo los algoritmos (Witten–Sander, crecimiento diferencial); parámetros propios. |
| Ben Eater, *boids* | MIT (en el README) | Ninguno de su código: modelo de Reynolds (1987). |
| Romello Goodman, *chladni-patterns* | MIT | Fórmulas clásicas de placas; código propio. |
| msiric, *procedural-plants* | README dice «MIT», sin archivo de licencia | Sólo la idea; gramáticas propias. |
| Golly | GPL-2.0-or-later | Sólo notación de reglas (B/S/C); ningún código. |
| 4rknova, *Mandelbulb* | Todos los derechos reservados | Sólo las matemáticas del Mandelbulb y la Mandelbox. |
| Malin Christersson (teselaciones hiperbólicas) | © 2018, sin licencia | Sólo la geometría del disco de Poincaré. |
| Maxime Heckel (nubes volumétricas) | Contenido CC BY-NC 4.0, código MIT | Sólo técnicas descritas (marcha de rayos, Beer–Lambert, Henyey–Greenstein). |
| Ten Minute Physics (Matthias Müller) | MIT por archivo; `20-heightFieldWater.html` sin encabezado | Sólo los métodos (XPBD, agua por campo de alturas); código propio. |
| LanLou123, *Webgl-Erosion* | MIT | Ninguno: la erosión usa gotas (Beyer 2015). |
| Evan Wallace, *webgl-water* | MIT por archivo; texturas sin licencia clara | Sólo la idea de cáusticas por refracción; sin texturas (el fondo es procedural). |
| Paul Falstad, applets de campos y orbitales | Licencia propia, no comercial | Sólo la física (Coulomb, Biot–Savart, funciones de onda del hidrógeno). |
| Maxim Gumin, *WaveFunctionCollapse* | MIT (algunas muestras de terceros); *Wave* de Oskar Stålberg sin licencia | Algoritmo propio del modelo de piezas; **las tres colecciones de piezas son originales** (circuitos, plano de planta, acueducto). |
| Eric Bruneton, *black_hole_shader* | BSD-3-Clause; mapa estelar de Gaia/Tycho | Ningún código ni dato: geodésicas de Schwarzschild integradas aquí; fondo procedural. |
| Glyphr Studio | GPL-3.0-or-later | Referencia de producto únicamente; ningún código. |
| opentype.js | MIT | Dependencia existente (`^1.3.4`) para leer y escribir fuentes. |
| polygon-clipping | MIT (dependencias: splaytree MIT, robust-predicates Unlicense) | Dependencia nueva, sólo en el estudio de glifos (operaciones de trazo). |

## 2. Las 23 líneas

Las once propuestas y las doce adicionales del encargo se implementaron todas como familias (`src/families/meta/*.ts`). Cada familia declara en su ficha el mecanismo, el tiempo, los controles, los presets, las capacidades y las fuentes que se citan arriba; el inventario completo con la evidencia está en el registro de cambios.

| # | Línea pedida | Familia | Tipo |
|---|---|---|---|
| 1 | Reacción–difusión (Gray–Scott) | `reaccion_difusion` | simulación |
| 2 | Physarum | `physarum` | simulación |
| 3 | Lenia | `lenia` | simulación |
| 4 | Fluidos 2D | `fluido` | simulación |
| 5 | Atractores (De Jong, Clifford, Lorenz) | `atractor` | simulación |
| 6 | Crecimiento diferencial | `crecimiento` | simulación |
| 7 | Boids | `boids` | simulación |
| 8 | Chladni / cimática | `chladni` | simulación |
| 9 | Sistemas L | `sistema_l` | geometría |
| 10 | DLA | `dla` | simulación |
| 11 | Kuramoto | `kuramoto` | simulación |
| 12 | Autómatas celulares discretos | `automata` | simulación |
| 13 | Fractales 3D | `fractal_3d` | analítica |
| 14 | Teselaciones hiperbólicas | `hiperbolico` | analítica |
| 15 | Nubes volumétricas | `nubes_vol` | analítica |
| 16 | Gravedad N-cuerpos | `gravedad` | simulación |
| 17 | Telas XPBD | `tela` | simulación |
| 18 | Terreno erosionado | `erosion` | simulación |
| 19 | Agua interactiva y cáusticas | `agua` | simulación |
| 20 | Líneas de campo EM | `campos_em` | geometría |
| 21 | Orbitales | `orbitales` | analítica |
| 22 | WFC con piezas originales | `wfc` | geometría |
| 23 | Lente gravitacional | `lente_gravitacional` | analítica |

## 3. Ampliaciones registradas aparte (no implementadas)

Quedan como propuestas, sin código en esta rama:

- **TPMS (superficies mínimas triplemente periódicas: giroide, Schwarz P/D):** encajarían como familia analítica de ciencia en 3D con el mismo marchador de rayos del fractal; el reto es el aliasing de superficies muy finas en celdas grandes.
- **Voronoi / Delaunay animados:** ya hay patrones de celdas en el catálogo; una familia con relajación de Lloyd y semillas con memoria sería una simulación barata.
- **Ruido curl:** como campo de velocidad para partículas (`campo_flujo` ya cubre la idea sin memoria); con memoria se solaparía con `fluido`.
- **Cuerpos blandos por presión** dentro de `tela`: no se implementó (la familia sólo tiene telas y lo dice).

## 4. Capa neuronal para glifos

Se buscó un modelo que genere glifos vectoriales a partir de una o pocas letras de referencia y que pudiera ejecutarse en el navegador o en infraestructura ya disponible.

- **VecGlypher** (2026): código Apache-2.0; pesos `VecGlypher-27b-it` con licencia «other» derivada de `gemma-3-27b-it` (en la práctica, sujetos a los términos de Gemma). 27 430 millones de parámetros en BF16, 12 fragmentos, 54,9 GB. Sin proveedor de inferencia publicado; se sirve con vLLM sobre CUDA (sin cifra de VRAM publicada; por tamaño, una GPU de la clase de 80 GB o varias en paralelo). Entrada: instrucción de sistema + etiquetas de texto o de 1 a 8 imágenes de referencia + «Text content: <carácter>». Salida: un `<path>` SVG con M, L, Q y Z. Cobertura entrenada: 0–9, a–z, A–Z (y `-`, `'`); los diacríticos (á, ñ, ü) son una limitación declarada.
- **DeepVecFont-v2:** código MIT; pesos sin licencia declarada; 52 caracteres latinos (sin cifras ni acentos); necesita 4 referencias (A, B, a, b) como imagen y como secuencia vectorial; PyTorch con CUDA.
- **Modelo de una sola referencia ejecutable en el navegador:** no se encontró ninguno que cumpla licencia, tamaño y calidad (Ref2Font depende de FLUX.2-klein-9B, no comercial; GAR-Font sin licencia y para chino).

Conclusión aplicada: el estudio usa un **asistente geométrico local** y no ofrece ningún botón de «IA». Lo que haría falta para una capa neuronal real (servidor con GPU, licencia de Gemma, envío explícito de la referencia con explicación del destino, claves sólo en servidor) está en [`ESTUDIO-GLIFOS.md`](ESTUDIO-GLIFOS.md). No se contrató ni se activó infraestructura.
