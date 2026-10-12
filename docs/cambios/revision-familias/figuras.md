# Revisión de familias: figuras 3D, curvas y espacio

Rama `familias-3d` sobre `6702598`. Familias: `atractor` (simulación) y las analíticas `hiperbolico`, `fractal_3d`, `nubes_vol`, `orbitales` y `lente_gravitacional`.

## Cómo se midió

- **Sonda temporal** (`scripts/families-time.ts`). «Antes» se tomó con el código de `6702598` y «después» con esta rama. Los JSON están en `.cache/` y no se suben (`antes-atractor.json`, `antes-analiticas.json`, `despues-atractor.json`, `despues-analiticas.json`).
  - `m`: porcentaje de cambio del campo en medio segundo.
  - `l`: porcentaje de celdas con tinta (> 24/255).
  - Atractor: 3 semillas a la resolución por defecto con `--long=600`, más la mínima (48 filas) y la máxima (256 filas) con 1 semilla.
  - Analíticas: la sonda usa su gemelo de CPU (no hay semillas ni resolución). Ni la sonda ni el gemelo aplican la escala de capa.
- **Raster real**: hojas de contacto en gris a 0, 30, 120 y 600 s, con muestreo por celda como el del motor. Además, renders del motor WebGL a 960×540 y 1280×720 con la celda por defecto (10 px), para ver los glifos y la paleta.
- **Paridad de los dos motores**: `scripts/families-qa.mjs --compare` sobre las 31 recetas finales. Se tomó antes y después con dos servidores de Vite.
- **Coste**: ms/paso a la resolución por defecto (`families-viz`) y, en las analíticas, los ms del gemelo de CPU por dos cuadros de 96×48 que da la sonda. La máquina estaba compartida con otros agentes: «antes» y «después» se midieron juntos, con la misma carga.

## Verificación

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{atractor,hiperbolico,fractal_3d,nubes_vol,orbitales,lente}.test.ts`: en verde.
  - Con la máquina cargada, tres casos de compatibilidad de `reaccion_difusion` (no es mía) pasaron de 5 s. Solos pasan los 87.
- Compatibilidad: con los parámetros originales, los 20 presets publicados de estas familias dibujan lo mismo.
  - Atractor: versión 2, con el camino de la versión 1 intacto (`cfg.v === 1`).
  - Analíticas: sólo opciones nuevas añadidas al final de sus elecciones; con los valores de siempre, el código dibuja lo mismo bit a bit.
- Paridad final (r de luminancia por celda entre WebGL y el motor básico):

  | Familia | Antes | Después |
  | --- | --- | --- |
  | atractor | 1 en los 3 | 1 en los 6 |
  | hiperbolico | 0,9939–0,9999 | 0,9939–1,0000 (triangulos 0,9939, igual que antes) |
  | fractal_3d | 0,9595–0,9820 | 0,9992–1,0000 |
  | nubes_vol | 0,9892–0,9990 | 0,9861–0,9990 |
  | orbitales | 1 | 1 (también el modo «Capas») |
  | lente_gravitacional | 0,9965–0,9988 | 0,9980–0,9996 |

## Matrices por familia

Sonda: `m` y `l` a 0 · 30 · 60 · 120 · 600 s. Atractor: semilla 0 a 96 filas; entre paréntesis, el rango de las 3 semillas.

### Atractores extraños (`atractor`, simulación, v1 → v2)

**Fallo encontrado (A-04, legibilidad a 10 min).** Tras una ventana periódica de la deriva, las 256 órbitas caían en el mismo ciclo y luego compartían una sola trayectoria para siempre (son deterministas). Desde entonces la figura era polvo de una sola órbita, unos 39 píxeles por paso. El detector de ventanas, además, se quedaba activado y la deriva corría 40 veces más rápido.

- En «Cintas» pasaba hacia los 2 minutos.
- Medido con `.cache/tools/atrscan.ts`: la fase saltaba 1,8 rad cada 20 s y la rugosidad del raster subía de 24–27 a 43–45.
- La sonda de «antes» no lo veía como fallo: el centelleo del polvo inflaba `m` (2,1–2,6 %).

**Corrección (versión 2).** Cada paso se renuevan 4 órbitas, que corren 24 iteraciones de transitorio fuera del histograma.

- Después la fase avanza constante (0,018 rad/s) y la rugosidad queda en 8–30.
- Prueba de regresión: en la v1 quedan menos de 4 órbitas distintas; en la v2, más de 230.

**Profundidad**, con dos parámetros nuevos a 0 por defecto (con 0 dibujan lo de antes):

- «Relieve»: en los mapas, luz rasante sobre la altura log de la densidad, con un lado claro y otro en sombra en cada cinta. En los flujos 3D, el lado lejano se apaga.
- «Capas»: en los mapas, una memoria lenta (semivida de 20 s) y desenfocada detrás de la figura viva. En 3D, la estela entera, tenue.

**Flujos nuevos**: Thomas, Aizawa y Halvorsen, con coeficientes acotados a zonas caóticas medidas (fuera de las ventanas periódicas).

- Aizawa tenía un punto fijo estable en (0, 0, −1,236) que atrapaba el 18 % de las partículas. Ahora nacen en la cuenca del atractor, y una partícula quieta renace junto a otra.

**Contrato**: `{ drift: 0 → construccion, else continuo }`.

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Lienzo y lectura | Usos | Coste (ms/s simulado) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cintas` | «Cintas caóticas» → **«Cintas plegadas»** (Clifford con relieve 0,75 y capas 0,4) | continuo | m 0,87·0,89·1,70·2,22·2,10 · l 36·40·57·60·61; polvo desde ~2 min | m 1,36·0,85·0,49·0,59·0,84 · l 34·40·33·53·64 (l 24–75) | Figura centrada de cintas; a 600 s sigue siendo de cintas. Al cruzar una ventana periódica quedan 3–6 s de puntos sueltos, con el eco de «Capas» detrás. | arte/curvas | ~31 (1,05 ms/paso); con carga, 2,21 antes y 2,31 después |
| `nube` | «Nube orbital» → **«Velo enrollado»** (De Jong, capas 0,7) | continuo | m 0,43·0,34·0,24·0,28·0,87 · l 32 | m 0,40·0,58·0,30·0,49·0,29 · l 31–38 | Lámina enrollada con velo desenfocado detrás. | arte/curvas | ~38 (1,28 ms/paso); con carga, 2,91 antes y 2,45 después |
| `lorenz` | «Mariposa de Lorenz» → **«Mariposa de estelas»** (relieve 0,7, capas 0,45) | continuo | m 2,85·3,59·2,38·2,17·2,43 · l 23–36 | m 2,75·3,47·2,72·2,18·2,65 · l 23–40 | El ala lejana se apaga; la estela tenue completa la figura. | arte/figuras, arte/curvas, terminal/figuras | ~2 |
| `madeja` (nuevo) | **«Madeja»**: Thomas, b = 0,1825 | continuo | — | m 1,13·1,06·0,89·1,11·0,69 · l 12–16 | Hilo enredado en 3D con la cámara en órbita completa (90 s). | arte/figuras, arte/curvas | ~5 |
| `ovillo` (nuevo) | **«Ovillo»**: Aizawa | continuo | — | m 3,29·3,26·2,43·3,43·3,20 · l 18–26 | Esfera de hilo con un eje; muy legible. | arte/figuras, arte/curvas, terminal/figuras | ~3 |
| `helice` (nuevo) | **«Hélice de tres aspas»**: Halvorsen, a = 1,44 | continuo | — | m 1,30·1,33·1,33·1,32·1,26 · l 13–18 | Tres aspas con la cámara en órbita (120 s). | arte/figuras, arte/curvas | ~3 |

- **Resoluciones**. A 48 filas, `l` va de 16 a 45 y `m` es > 0 en todo. A 256 filas, `l` va de 9 a 36 y `m` es > 0 en todo. Ningún preset se vacía ni se congela; los mapas a 256 filas tienen más grano, como antes.
- **Controles**. Todos actúan (batería genérica). En Aizawa, «c» no actúa: lo dice su pista.
- **Paleta**: tres paradas con un tono medio, para que el relieve tenga gama.
- **Extinción**: no hay ninguna.

### Teselación hiperbólica (`hiperbolico`, analítica)

**Motivo nuevo «Relieve»** (opción añadida a «Motivo»): azulejos con bisel iluminados desde arriba a la izquierda.

- Todos los pasos de la vista y del pliegue son conformes (giros, la traslación) o anticonformes (el borde, el espejo de la cuña, el espejo de la arista). Por eso la dirección de la derivada (un complejo unitario y si refleja) se lleva hasta el triángulo fundamental, y la normal de la arista vuelve a la pantalla. La luz es la misma en todos los azulejos, por plegados que estén.
- Pruebas: la derivada coincide con un desplazamiento numérico con error < 1e‑4, y en cada reflexión cambian a la vez la paridad y la orientación.

**Contrato**: `{ turn: 0 → bucle (8 / deriva s), else continuo }`. Se comprobó con el gemelo en t y t + periodo: < 1 % de celdas difieren, sólo las que caen justo sobre una arista.

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Lienzo | Usos | Coste (gemelo, ms por 2 cuadros) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `triangulos` | «Triángulos {7,3}» → **«Rosetones»** (parámetros iguales) | continuo | m 3,84·3,94·3,73·3,64·3,78 · l 30 | igual | Disco centrado | arte/geometricas | 4–57 |
| `cuadrados` | «Cuadrados {4,5}» → **«Red curva»** (giro 0) | bucle 32 s | m 2,24·2,12·2,18·2,10·2,17 · l 23 | m 2,21·1,98·2,21·2,00·2,00 · l 23 | Disco centrado | arte/geometricas, terminal/figuras | 4–13 |
| `estrellas` | «Estrellas {6,4}» → **«Estrellas que menguan»** | continuo | m 2,16–2,27 · l 34 | igual | Disco centrado | arte/geometricas | 4–17 |
| `espejo` | «Pentágonos y su reflejo {5,4}» → **«Disco y su reflejo»** (giro 0, deriva 0,4) | bucle 20 s | m 5,25·5,00·5,30·6,19·6,19 · l 44–52 | m 6,68·7,90·6,68·6,68·6,68 · l 45–52 | Llena el cuadro con el reflejo | arte/geometricas, arte/optica | 4–5 |
| `relieve` (nuevo) | **«Azulejos en relieve»**: {6,4} | continuo | — | m 2,02–2,18 · l 31–32 | Disco centrado, en relieve | arte/geometricas, arte/figuras | 5–25 |
| `mosaico` (nuevo) | **«Mosaico que fluye»**: {5,4} en relieve, escala de capa 0,5, sin borde | bucle 32 s | — | m 2,40–2,85 · l 32 (la sonda no aplica la escala) | Llena el cuadro: en cada columna hay tinta (prueba) | fondos/geometricas, tipo/texturas | 5–12 |

- **Legibilidad**. En el motor, las aristas y los biseles se leen a 38–51 filas. Los polígonos más pequeños que una celda se funden en su tono medio, como antes.
- **Coste**. El relieve añade unas pocas operaciones complejas por pliegue y sólo con ese motivo.

### Fractales 3D (`fractal_3d`, analítica, gemelo reducido)

**Problema.** En glifos, el Mandelbulb y el Mandelbox se leían como ruido. Causas, vistas en hojas con muestreo por celda:

- detalle más fino que una celda, con normales tomadas a 0,0015·t;
- rayos que se quedaban sin pasos junto a la superficie y devolvían 0 (huecos negros), sobre todo en el gemelo, que tiene 56 pasos;
- una oclusión que contaba pasos.

**Formas nuevas** (opciones añadidas a «Forma»): «Mandelbulb liso», «Mandelbox liso» y «Julia cuaterniónica». Las formas de siempre dibujan lo mismo. Cómo se sombrean:

- un golpe más holgado (0,004·t, y acepta d < 0,03·t al quedarse sin pasos);
- normales en un paso de 0,02, oclusión leída a lo largo de la normal, borde de luz en la silueta y niebla con la distancia;
- el gemelo de estas formas lleva también la sombra suave.

La paridad pasó de 0,96–0,98 a ≥ 0,999. Prueba: el grano entre celdas vecinas de las formas lisas es menos del 80 % del de las de siempre.

**Gemelo reducido**: 56 pasos de rayo (96 en WebGL); en las formas de siempre, además, sin sombra suave.

**Contrato**: `{ breathe: 0 → bucle, else continuo }`. Sin respiración, el periodo es 6/giro s; el Mandelbox es igual por los cuatro lados, así que se repite cada cuarto de vuelta. Comprobado en el gemelo.

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Usos | Coste (gemelo, antes → después) |
| --- | --- | --- | --- | --- | --- | --- |
| `bulbo` | «Bulbo clásico» (bulb, 7 iteraciones) → **«Bulbo»** (liso, 6 iteraciones) | continuo | m 6,77–6,96 · l 26 | m 5,37–5,58 · l 27 | arte/figuras, arte/curvas | 84–126 → 107–167 |
| `corte` | «Corte interior» → **«Bulbo abierto»** (liso, dist 2,7) | bucle 50 s | m 7,51·7,82·2,73·4,34·7,51 · l 31–37 | m 4,07·4,73·1,73·3,14·4,07 · l 25–31 | arte/figuras, arte/curvas | 177–181 → 159–194 |
| `caja` | «Caja plegada» (box) → **«Caja plegada»** (Mandelbox liso, respiración 0) | bucle 10 s | m 4,30–4,45 · l 20 | m 2,48 · l 22 | arte/figuras, arte/curvas, terminal/figuras | 34–72 → 61–115 |
| `concha` (nuevo) | **«Concha»**: Julia, potencia 7 | continuo | — | m 2,62–3,77 · l 25–29 | arte/figuras, arte/curvas, terminal/figuras | 21–64 |
| `partida` (nuevo) | **«Concha partida»**: Julia, corte 0,42 | continuo | — | m 2,16–3,43 · l 23–27 | arte/figuras, arte/curvas | 22–43 |

- **Las Julia** son superficies de revolución con anillos: es un rasgo del conjunto, no un artefacto (se comprobó con 400 pasos y un golpe estricto). Se leen bien como conchas.
- **Lienzo**: figuras centradas; ninguna sirve de fondo.

### Nubes volumétricas (`nubes_vol`, analítica, gemelo reducido)

**Cámara nueva «Nebulosa»** (opción añadida a «Cámara»):

- gas que brilla por sí mismo, más cerca de una estrella que «Luz» mueve;
- filamentos cortados por «Erosión», y franjas de polvo (dos octavas de ruido) que sólo absorben, con «Absorción»;
- campo de estrellas detrás, y un punto negro para que los huecos sean espacio y no grano.

Funciona sólo con emisión y absorción, sin marcha hacia la luz.

**Gemelo reducido**: 32 pasos de rayo (24 en la nebulosa), 3 hacia el sol y 10 en la bruma.

**Contrato**: `{ wind: 0 → bucle (quieta), else continuo }`.

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Lienzo | Usos | Coste (gemelo, antes → después) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `banco` | «Banco de nubes» → **«Mar de nubes»** (parámetros iguales) | continuo | m 0,87–1,03 · l 90–96 | igual | Llena el cuadro | fondos/organicas | 289–329 → 165–468 (con carga) |
| `nebulosa` | «Nebulosa» (dentro de una nube rosa; **l 100 % a 30–120 s**) → **«Nebulosa»** con la cámara nueva | continuo | m 5,53·6,52·7,37·8,64·9,94 · l 87·100·100·100·88 | m 3,91·4,03·3,26·2,85·3,29 · l 84·74·73·41·55 | Llena el cuadro con huecos negros | fondos/espacio, arte/figuras | 228–317 → 136–305 |
| `haces` | **«Haces de luz»** (cobertura 0,8 → 0,84) | continuo | m 1,08–1,27 · l 100·86·88·98·89 | m 1,03–1,30 · l 100·83·85·96·86 | Llena el cuadro | fondos/organicas | 246–446 → 245–394 |
| `dentro` (nuevo) | **«Vuelo entre nubes»**: la escena de la antigua «Nebulosa», con cobertura 0,34 | continuo | — | m 4,83·8,94·8,61·6,11·6,61 · l 74·97·100·83·83 | Llena el cuadro | fondos/organicas, tipo/texturas | 187–276 |

### Orbitales y superposiciones (`orbitales`, analítica)

**Problema.** Tres presets no cambiaban en absoluto (sonda m = 0,00 en todo): sus orbitales (3dz², 4fz³, 2s+2pz) son simétricos alrededor del eje en el que gira la cámara.

**Modo nuevo «Capas»** (opción añadida a «Modo»): tres superficies anidadas (el nivel, un tercio y un noveno) que brillan donde el rayo las roza.

- El borde mide un glifo o más: en la primera versión, la «película» 1/|cos| medía una décima de celda y se perdía con el muestreo por celda.

**Contrato**: `{ turn: 0 → bucle (el latido), else continuo }`. Los periodos se comprobaron con el gemelo en t y t + periodo (diferencia media < 1e‑4).

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Usos | Coste (gemelo, antes → después) |
| --- | --- | --- | --- | --- | --- | --- |
| `lobulos` | «Lóbulos 3d» (3dz², **quieto**) → **«Lóbulos que laten»** (3dz² + 4fz³, latido) | bucle 20 s | m 0,00 · l 15 | m 0,01–0,03 · l 9 | arte/figuras, terminal/figuras | 32–90 → 43–121 |
| `dipolo` | «Superposición 1s+2p (dipolo que oscila)» → **«Nube pendular»** (velocidad π/3, giro 0) | bucle 4 s | m 0,39–0,78 · l 16 | m 0,42–0,47 · l 16 | arte/figuras, terminal/figuras | 52–100 → 51–124 |
| `anillos` | «Anillos 4f» (**quieto**) → **«Anillos de cristal»** (4fz³ + 3pz, «Capas») | bucle 24 s | m 0,00 · l 14 | m 0,05–0,93 · l 26–27 | arte/figuras | 65–90 → 88–214 |
| `hibrido` | «Híbrido sp (2s+2p)» (**quieto**) → **«Faro»** (2s + 2px, la cámara gira) | continuo* | m 0,00 · l 14 | m 0,04–0,11 · l 14–20 | arte/figuras, terminal/figuras | 45–67 → 34–56 |
| `estrella` (nuevo) | **«Estrella de cristal»**: 4fxyz + 3dz², «Capas», girando | continuo | — | m 1,37–1,62 · l 28 | arte/figuras | 55–148 |

\* «Faro» no tiene latido (los dos estados tienen el mismo n), así que su vuelta se repite cada 240 s. La regla de una sola clave lo marca como continuo. Lo dice `doc.time`, y figura en pendientes.

- **Escala**: las figuras se quedan a escala 1. Una escala de capa menor las cortaba arriba y abajo en el motor.
- **Lienzo**: figuras centradas; ninguna sirve de fondo.

### Agujero negro (`lente_gravitacional`, analítica)

**Contrato**: `{ spin: 0 → bucle, else continuo }`.

- Con el disco quieto sólo se mueve la cámara, que vuelve a su sitio en 60/órbita s.
- La rejilla sola es igual cada 15°, así que «Rejilla curvada» se repite cada 10 s. Comprobado en el gemelo, con diferencia < 1e‑5.

| Preset | Antes → después | Contrato | Sonda antes | Sonda después | Usos | Coste (gemelo, antes → después) |
| --- | --- | --- | --- | --- | --- | --- |
| `disco` | «Disco de acreción» → **«Disco doblado»** (más cerca: dist 15; exposición 1,8; giro 0,6) | continuo | m 1,23–1,42 · l 31–42 | m 1,09–1,80 · l 58–75 | arte/figuras (con Saturno), terminal/figuras | 19–96 → 11–71 |
| `rejilla` | «Lente sobre la rejilla» → **«Rejilla curvada»** (órbita 0,25, giro 0, exposición 2) | bucle 10 s | m 6,84–10,06 · l 17–20 | m 9,97 · l 21 | arte/figuras, arte/optica | 13–32 → 8–53 |
| `canto` | «De canto» → **«Disco de canto»** (exposición 1,7, giro −0,8) | continuo | m 3,75–5,36 · l 28–44 | m 4,04–5,78 · l 51–72 | arte/figuras, arte/optica | 15–25 → 10–38 |
| `remolino` (nuevo) | **«Remolino»**: desde arriba (42°) | continuo | — | m 0,65–0,86 · l 66–76 | arte/figuras | 10–24 |
| `cerca` (nuevo) | **«Al borde de la sombra»**: dist 8, llena el cuadro | continuo | — | m 1,37–1,49 · l 71–74 | arte/figuras | 23–40 |

- **Paleta**: tres paradas. En el motor, el disco se veía apagado con dos paradas y exposición 1,3–1,5.
- **Cielo**: con exposición 2,2 el ruido tenue del cielo llenaba de puntos el 90 % de las celdas; se quedó en 1,8.

## Destinos (A-06)

- **arte/figuras**: todas las figuras 3D y de espacio (atractores 3D, fractales, orbitales, el agujero negro y la nebulosa).
- **fondos/***: sólo lo continuo o en bucle que llena el cuadro:
  - «Mosaico que fluye» (fondos/geometricas);
  - «Mar de nubes», «Haces de luz» y «Vuelo entre nubes» (fondos/organicas);
  - «Nebulosa» (fondos/espacio).
- **Nunca en fondos**: un fractal, un orbital, un atractor o el agujero negro centrados.
- **terminal/figuras**: sólo lo que se lee a 38–40 filas (Mariposa, Ovillo, Red curva, Caja plegada, Concha, Lóbulos, Nube pendular, Faro y Disco doblado).
- **tipo/texturas**: «Mosaico que fluye» y «Vuelo entre nubes».

## Cambios compartidos que harían falta (no hechos)

1. **Analíticas con más de 8 parámetros, o con la versión de la receta en el shader.**
   - Las seis familias tienen ya 8 parámetros y el shader no recibe `fam.v`. Sólo se puede cambiar el comportamiento con opciones nuevas en las elecciones, nunca corregir uno existente sin cambiar lo que dibuja una receta guardada.
   - Ejemplo bloqueado: las vetas del disco del agujero negro se enrollan sin límite (ver pendientes).
   - Propuesta: un tercer `vec4` (`uLF2`) con su `k2` en el gemelo, o pasar `fam.v` como uniforme y como argumento de `prep`.
2. **`TimeRule` con más de una clave**, o un contrato por preset. Casos en los que el contrato real depende de dos parámetros:
   - orbitales: el giro y si los estados comparten n;
   - agujero negro: la rotación, el disco y el fondo;
   - atractor: la deriva y el tipo (los flujos 3D sin deriva siguen moviéndose).

   Propuesta: una lista de reglas evaluadas en orden, o `FamilyPreset.time`.
3. `src/studio/recipes/catalog.ts` todavía no lee `uses`/`aka`: los destinos de este informe sólo valen cuando el catálogo los use.
4. `scripts/families-time.ts`:
   - en las analíticas no aplica `layer.scale` (por ejemplo, «Mosaico que fluye» se mide sin su escala);
   - no imprime una línea por preset analítico (sólo escribe el JSON).
5. `tests/unit/families-compat.test.ts` no tiene `timeout`: con la máquina compartida, casos lentos de otras familias pasan de 5 s.
6. **Muestreo por celda en las analíticas**: el detalle fino se aliasa. Un supermuestreo 2×2 opcional para familias analíticas, o exponer `PX` a los gemelos de CPU de las familias, permitiría filtrar en el propio campo. Hoy `setPX` existe en el motor básico, pero las familias no lo reciben, así que usar `PX` en su GLSL rompería la paridad.

## Lo que no quedó resuelto

- **Disco del agujero negro a largo plazo.** Con rotación, las vetas se enrollan (cizalla kepleriana): a los 2–3 minutos son anillos finos, y a los 10 minutos el muestreo por celda las convierte en grano dentro del disco. El disco sigue leyéndose como disco y lo dice `doc.time`. Hojas de evidencia: `.cache/lente-pt.png` (120, 600 y 3600 s). Necesita el cambio compartido 1, o un parámetro nuevo que no cabe.
- **Celdas con tinta por encima de ~0,97** en dos fondos de nubes:
  - «Haces de luz» llega a 1,00 a 0 s y a 0,96 a 120 s. Antes también llegaba a 1,00: la bruma ocupa todo el cuadro con un tono tenue. Al subir la cobertura, los haces casi desaparecían en el motor.
  - «Vuelo entre nubes» llega a 0,97–1,00 a 30–60 s, mientras la cámara atraviesa una nube; luego vuelve a 0,74–0,83.

  Los dos siguen cambiando (`m` > 0) y no son blancos. No se forzó más oscuridad porque en glifos quedaban apagados.
- **«Faro» marcado como continuo** cuando es periódico (240 s), por la regla de una sola clave (cambio compartido 2).
- **Flujos 3D con deriva 0** marcados como construcción aunque sigan moviéndose; la misma causa.
- **Formas clásicas de los fractales**: «Mandelbulb» y «Mandelbox» sin «liso» siguen granulosas en glifos. Se conservan por compatibilidad y ningún preset las usa ya.
- **«Rejilla curvada»**: las líneas de la rejilla miden algo menos de una celda y se ven entrecortadas a 38 filas (`.cache/big-lente.png`). Ensancharlas cambiaría las recetas guardadas.
- **«Lóbulos que laten»** cambia despacio (`m` ≈ 0,01–0,03 % por medio segundo; el latido dura 20 s). Es un fondo lento, pero en una miniatura puede parecer quieto.
- **«Cintas plegadas»** pasa 3–6 s con puntos sueltos al cruzar una ventana periódica de la deriva. Es el comportamiento elegido (cruzarla rápido), atenuado por el eco de «Capas».
