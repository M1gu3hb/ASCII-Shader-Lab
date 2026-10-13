# Familias nuevas · agente B (revisión del PR #10)

Rama `nuevas-b`, creada desde `deff1b9`. Seis familias analíticas nuevas, todas con gemelo de CPU línea a línea y `caps.basic: 'full'`:

| Familia | id | Grupo | Color propio | Presets | Contrato |
| --- | --- | --- | --- | --- | --- |
| Cromado en tramas (V-03) | `cromado` | materia | sí (`FC_cromado`) | 5 | continuo |
| Superficie que se abre (V-07) | `desgarro` | materia | sí (`FC_desgarro`) | 5 | continuo |
| Descargas eléctricas (V-08) | `descargas` | física | no | 4 | continuo |
| Mar nocturno (C-03) | `mar` | física | no | 4 | continuo |
| Osciloscopio que se degrada (C-06) | `osciloscopio` | forma | no | 4 | continuo |
| Marco vivo (C-08) | `marco` | forma | sí (`FC_marco`) | 4 | continuo |

Archivos: `src/families/analytic/<id>.ts` (GLSL) y `<id>.cpu.ts` (gemelo), `src/families/meta/<id>.ts` y `<id>.doc.ts`, `tests/unit/family-<id>.test.ts`. Registro (sólo líneas añadidas): `meta/materia.ts`, `meta/fisica.ts`, `meta/forma.ts`, `load.ts`, `analytic/glsl.ts`, `docs.ts`; una entrada INERT en `tests/unit/families.test.ts` (`osciloscopio.grid`, motivo abajo).

## Cómo se midió

- **Paridad**: `scripts/families-qa.mjs --compare` en Chromium con SwiftShader, 480 × 270 a celda 7, en t = 2, 6, 20 y 120 s. Se da el peor valor de los cuatro momentos: r de luminancia por celda, porcentaje de glifos idénticos y r del color por celda.
- **Actividad**: `scripts/families-time.ts` sobre el gemelo de CPU (96 × 48) en t = 0, 30, 60, 120, 300 y 600 s. «Cambio» es la diferencia media de brillo entre t y t + 0,5 s (en % del rango). «Tinta» es la fracción del lienzo con brillo por encima de 24/255.
- **Coste**: gemelo de CPU a 128 × 50 celdas, recorrido por columnas como el motor básico, `cpu` más `cpuColor` en las familias de color. Media de 60 cuadros tras 20 de calentamiento. La máquina es compartida (4 núcleos con otros agentes): en la misma tanda, la familia de referencia `corrientes` midió entre 10,0 y 28,5 ms por cuadro.
- **Aspecto**: capturas grandes (1280 × 720, celda 10, motor WebGL) en t = 2, 6, 20 y 120 s, revisadas a ojo. Se iteró sobre el aspecto (ver «Ajustes hechos tras mirar»).

Ninguna familia copia código. Los mecanismos se escribieron desde cero a partir de su descripción matemática (INVENTARIO §4 y §7), sin constantes, textos ni presets de las fuentes. Paper Shaders no se adaptó en ningún punto, así que no aplica su aviso Apache-2.0/NOTICE.

---

## 1. Cromado en tramas (`cromado`, V-03)

**Mecanismo.** Cada máscara (círculo, anillo, gota, rombo, metabolas animadas) da una distancia con signo d. «Sin forma» no tiene máscara: todo el lienzo es metal, y las curvas de nivel de un fBm lento hacen de contorno. El campo de borde vale E = (1 − u)², con u = clamp(−d / 0,3R): es 1 en el contorno y cae con perfil parabólico, la forma de la solución de Poisson con borde fijo que usa el original, aquí en forma analítica. La coordenada de banda es φ = rep · (diagonal girada + contorno · 0,5R · E + deformación · ruido) − t. Junto al borde, ∇E domina sobre la diagonal, así que las bandas giran y se aprietan siguiendo el contorno; una prueba lo verifica: hay más del doble de cambios de banda en el quinto exterior del disco con «Contorno» alto.

Cada periodo es un reflejo: degradado de cielo, horizonte nítido y una línea en el suelo oscuro. Se filtra con el paso de fase por celda (fw ≈ rep · |∇φ| · PX), y lo que no cabe en una celda se promedia en vez de dar aliasing. El rojo y el azul leen φ ± δ (dispersión) y cada canal pasa por la paleta. El glifo sale de la fase de la banda (0,3r + 0,59g + 0,11b). Lleva además un filo de luz E³ en el contorno y un halo de una celda fuera.

**Fuente.** Paper Shaders · Liquid Metal (Apache-2.0; referencia de la idea, no se copió código). La ecuación de Poisson sólo inspira el perfil del campo de borde.

**Distinto de lo que había.** Lo más cercano es `metabolas` («Metal líquido»): un sólido 3D de esferas fundidas, sombreado por raymarching, con la paleta por brillo. `cromado` es plano y gráfico: bandas de reflejo que siguen el contorno, con color por canal y dispersión. No se renombró ni se tocó `metabolas`.

| Preset | Composición | Usos | Cambio en 0,5 s (mín–máx) | Tinta | ms/cuadro | Paridad peor (r · glifos · color r) |
| --- | --- | --- | --- | --- | --- | --- |
| `gota` Gota de cromo | gota que se balancea en el centro | arte/optica, arte/figuras | 2,6–2,7 % | 17 % | 6,5 | 1,0000 · 99,8 % · 0,9998 |
| `lamina` Lámina de cromo | todo el lienzo, bandas anchas | fondos/materia | 14,5–15,8 % | 97–98 % | 5,1 | 1,0000 · 99,8 % · 0,9999 |
| `mercurio` Mercurio vivo | 4 metabolas que se funden | arte/organicas, arte/optica | 3,5–5,3 % | 18–22 % | 8,2 | 1,0000 · 99,8 % · 0,9998 |
| `anillo` Anillo de oro | anillo, bandas finas, paleta oro | arte/geometricas, arte/optica | 2,3–2,7 % | 22–23 % | 4,9 | 1,0000 · 99,9 % · 0,9999 |
| `prisma` Rombo prismático | rombo, dispersión al máximo | arte/geometricas, arte/optica | 2,2–2,3 % | 16 % | 4,6 | 1,0000 · 100 % · 1,0000 |

**Tiempo.** Continuo. Las bandas corren, el ruido se desplaza y las metabolas tienen frecuencias inconmensurables.

---

## 2. Superficie que se abre (`desgarro`, V-07)

**Mecanismo.** Cada abertura (hasta 3, desfasadas 1/n de ciclo) vive en ciclos. En cada ciclo, el hash del índice da un punto de impacto y una inclinación; los argumentos del hash son enteros exactos, así que float32 y float64 coinciden.

La línea del desgarro es la distancia con signo a una recta por el impacto, ondulada por ruido a lo largo de ella. El borde se deshilacha con un fBm anisótropo: fino a lo largo de la línea y largo a través de ella, de modo que salen fibras. La abertura se propaga desde el impacto y es más ancha cerca de él (perfil √(1 − s²/R²)). Se abre rápido, se mantiene y se cierra despacio. La apertura, la costura previa y todo lo que dibuja valen exactamente 0 al principio y al final de cada ciclo.

Detrás hay tres opciones:
- `luz`: nebulosa de fBm deformado, venas crestadas y destellos lentos;
- `trama`: dos familias de líneas cruzadas cuyo grosor sigue un fBm;
- `corrientes`: tres manchas de la paleta mezcladas por distancia inversa.

En el borde hay un filo incandescente, luz derramada sobre la superficie, un labio iluminado de un lado y sombra del otro. El grano de la superficie se separa con las mitades, bajo una luz lenta que deriva. La variante `quemado` sustituye la línea por un frente de fBm que crece desde el impacto (y se mueve), con línea de brasa y papel chamuscado, y luego cierra el agujero.

**Fuentes.** Radiant · Torn Paper; Radiant · Burning Film y Polaroid Burn para la variante quemada (MIT, Paul Bakaus; referencia de la idea, no se copió código).

**Distinto de lo que había.** Ningún patrón ni familia abre y recompone una superficie. Lo más parecido en textura son `grietas` (bordes de Voronoi F2 − F1 que derivan, sin abertura ni capa detrás) y `fuego`. Aquí hay un ciclo de abertura con borde iluminado y una capa propia detrás.

| Preset | Composición | Usos | Cambio en 0,5 s (mín–máx) | Tinta | ms/cuadro | Paridad peor |
| --- | --- | --- | --- | --- | --- | --- |
| `grietas` Grietas de luz | 3 desgarros desfasados, calma 0 | fondos/materia, arte/organicas | 1,8–2,1 % | 31–37 % | 19,6 | 1,0000 · 99,7 % · 1,0000 |
| `rasgado` Papel rasgado | 1 desgarro ancho, con pausas de calma | arte/organicas, arte/optica | 0,08–3,7 % | 9–29 % | 8,1 | 1,0000 · 100 % · 0,9999 |
| `quemado` Película que arde | 2 quemaduras | fondos/materia, arte/organicas | 1,1–5,6 % | 20–39 % | 14,1 | 1,0000 · 99,9 % · 1,0000 |
| `trama` Trama descubierta | 2 desgarros sobre trama de líneas | fondos/materia, arte/optica | 1,5–6,4 % | 24–37 % | 12,1 | 1,0000 · 99,9 % · 1,0000 |
| `velo` Velo de color | 3 quemaduras sobre corrientes de color | fondos/color, fondos/materia | 1,0–6,2 % | 36–41 % | 24,1 | 1,0000 · 99,9 % · 1,0000 |

**Tiempo.** Continuo: cada ciclo golpea en otro sitio, así que no hay dos iguales. Lo verifican pruebas propias (`tests/unit/family-desgarro.test.ts`):
- Sin saltos entre ciclos: en cada frontera de cada abertura de cada preset (3 ciclos), la diferencia máxima entre t − 1 ms y t + 1 ms es menor que 0,03. Una mutación que deja la abertura sin cerrar da 0,23 y la prueba falla.
- Los presets de `fondos/*` nunca descansan: en 240 s, la abertura más abierta siempre supera 0,15.
- Ningún preset se queda quieto, ni en la calma.

`rasgado` conserva las pausas del original y por eso no se ofrece como fondo. En la calma sólo se mueve la luz tenue de la superficie: 0,08 % de cambio en 0,5 s.

---

## 3. Descargas eléctricas (`descargas`, V-08)

**Mecanismo.** Los conductores siguen elipses lentas con deriva propia. Cada arco proyecta la celda sobre el segmento AB y toma el punto del eje desplazado de lado por tres octavas de ruido en (s, tiempo de chisporroteo), con amplitud √(s(1 − s)), que se anula en los extremos. El brillo es un núcleo 1/(1 + d²/w²) más un halo ∝ 1/d y otro ∝ e^(−d). Proyectar y desplazar aproxima la distancia a la curva, y basta a tamaño de celda.

Lejos del arco sólo se calculan los halos, con una transición suave entre cerca y lejos. Cada arco vive unos segundos con una envolvente suave y renace con otra forma: la semilla es un entero por vida. Sus dos ramas renuevan en su propio reloj. Hay un arco intermitente que cruza el anillo.

`tormenta` dibuja rayos del cielo al suelo con un líder que baja con frente suave, ramas y un canal que se apaga despacio (y vale 0 al final del ciclo), bajo una franja de nubes que se ilumina. El parpadeo es una modulación lenta (≈ 2 Hz) y poco profunda (≤ 30 %).

**Fuentes.** Radiant · Voltage Arc; Radiant · Thunder Sermon para la variante tormenta (MIT, Paul Bakaus; referencia de la idea, no se copió código). Se cita WCAG 2.3.1.

**Distinto de lo que había.** `campos_em` traza líneas de campo estáticas de cargas e imanes, por construcción y sin brillo propio. `dla:raices` es un árbol estático. Aquí los arcos son transitorios, quebrados, con ramas que se renuevan y conductores que se mueven.

| Preset | Composición | Usos | Cambio en 0,5 s | Tinta | ms/cuadro | Paridad peor |
| --- | --- | --- | --- | --- | --- | --- |
| `anillo` Anillo de arcos | 4 conductores en anillo + arco que cruza | arte/optica, arte/figuras | 1,4–6,1 % | 5–25 % | 6,7 | 1,0000 · 99,8 % |
| `plasma` Esfera de plasma | centro + 5 conductores | arte/optica, arte/figuras | 1,3–3,1 % | 9–19 % | 10,3 | 1,0000 · 100 % |
| `tormenta` Tormenta seca | 6 rayos cielo–suelo, nubes | fondos/vivas, arte/organicas | 5,5–7,1 % | 37–49 % | 21,3 | 1,0000 · 100 % |
| `chispa` Chispa entre dos | 1 arco ámbar entre 2 electrodos | terminal/figuras, arte/optica | 1,4–2,9 % | 1–6 % | 2,4 | 0,9999 · 99,8 % |

**Accesibilidad y continuidad** (`tests/unit/family-descargas.test.ts`):
- En 10 s a 30 cuadros por segundo, en todos los presets y también con «Parpadeo» = 1 y «Movimiento» = 1, menos del 25 % del lienzo cambia más de 0,2 entre dos cuadros, y la tinta media no cambia más de 0,05.
- Sin chisporroteo, la tinta es continua en el tiempo: al muestrear el doble de fino, el mayor salto entre muestras baja a menos de 0,65 × el anterior (un interruptor no bajaría). La mutación «arco que se enciende de golpe» da 0,026 frente a un límite de 0,017 y la prueba falla.

---

## 4. Mar nocturno (`mar`, C-03)

**Mecanismo.** Cada celda bajo el horizonte lanza un rayo desde una cámara a una unidad sobre el agua y lo cruza con el plano. La superficie es la suma de 8 olas con dispersión de aguas profundas ω = √(g k) (g = 2,5): frecuencias inconmensurables. La normal es el gradiente analítico. Un filtro por ola apaga las olas más cortas que unas pocas celdas de agua, según la huella de la celda a esa distancia, para que no haya aliasing junto al horizonte. Las amplitudes siguen A ∝ λ^0,6.

El reflejo lee el cielo en la dirección reflejada, pesado por el Fresnel de Schlick. La luna (radiancia ×12) se rompe en destellos. Además, el reflejo de cada celda se desvía con un ruido fino de una celda, como facetas menores que una celda, y la estela centellea. El agua oscura se aclara en las crestas: la altura medida contra su dispersión local.

`plancton` enciende las crestas con un parpadeo lento. Sobre el horizonte hay bruma, la luna con su halo y manchas, y estrellas (picos de un ruido fino).

**Fuentes.** Radiant · Moonlit Ripple y Bioluminescence (MIT, Paul Bakaus; referencia de la idea, no se copió código); la relación de dispersión y la aproximación de Schlick.

**Distinto de lo que había.** `agua` es una simulación interactiva vista desde arriba (cáusticas), `mareas_lentas` y `horizonte` son ondas planas, y `luciernagas`/`medusa` no tienen mar. Aquí hay perspectiva con horizonte, Fresnel y la columna de destellos de la luna.

| Preset | Composición | Usos | Cambio en 0,5 s | Tinta | ms/cuadro | Paridad peor |
| --- | --- | --- | --- | --- | --- | --- |
| `lago` Luna sobre el lago | olas bajas, luna alta centrada | fondos/ondas | 5,2–5,4 % | 45–47 % | 6,9 | 1,0000 · 99,9 % |
| `mar_fondo` Mar de fondo | olas largas y altas, luna baja a un lado | fondos/ondas | 8,5–9,8 % | 45–47 % | 7,4 | 0,9999 · 99,9 % |
| `plancton` Plancton | sin luna, crestas encendidas, horizonte alto | fondos/ondas, fondos/organicas | 15,4–19,1 % | 57–66 % | 9,3 | 1,0000 · 99,8 % |
| `plata` Marea de plata | luna grande, horizonte bajo | fondos/ondas | 6,4–7,1 % | 43–45 % | 8,8 | 0,9993 · 99,9 % |

Pruebas propias (`tests/unit/family-mar.test.ts`):
- La columna bajo la luna tiene más del doble de brillo medio que el mar lejos de ella, y sin luna no aparece.
- El horizonte está donde dice el control.
- El mar cambia más de 5 veces lo que cambia el cielo lejos de la luna.

---

## 5. Osciloscopio que se degrada (`osciloscopio`, C-06)

**Mecanismo.** La traza es y(x, t) = E(u) · Σ aₙ sin(2π n f x + φₙ(t)), con fases que derivan, de modo que la traza siempre corre. La envolvente E(u) y la degradación D(u) recorren calma, crecida, grito y derrumbe, y valen lo mismo en los dos extremos del ciclo. Los pesos aₙ del ciclo c se funden con los del c + 1 durante el derrumbe, cuando la traza está plana. La mezcla de la cadena también cambia por ciclo (hash con argumentos enteros):
- modulación de fase (FM);
- recorte suave y/(1 + |y| + 0,28y²) y después duro;
- reducción de bits round(y·2ᵇ)/2ᵇ con b = 8 − 7D, más una muestra retenida a lo ancho;
- ruido continuo.

El brillo sale de la distancia a la poligonal por tres muestras (x − h, x, x + h), así que los escalones verticales se dibujan, con un leve atenuado donde la traza es empinada. Hay tres copias de persistencia que se apagan (fósforo) y una retícula opcional (8 divisiones, puntos en los ticks y ejes marcados). El gemelo de CPU guarda las 12 muestras de la columna mientras el motor la recorre.

**Fuentes.** Radiant · Signal Decay y Scream Wave (MIT, Paul Bakaus; referencia de la idea, no se copió código).

**Distinto de lo que había.** `lissajous` dibuja x frente a y; `ecualizador` son barras. Aquí la traza es temporal frente a x, con una cadena de degradación que cambia por ciclo.

| Preset | Composición | Usos | Cambio en 0,5 s | Tinta | ms/cuadro | Paridad peor |
| --- | --- | --- | --- | --- | --- | --- |
| `limpia` Señal limpia | seno con retícula, charset sismógrafo | terminal/consola, arte/curvas | 4,7–7,4 % | 59–61 % | 2,8 | 1,0000 · 100 % |
| `interferencia` Interferencia | 4 armónicos, bits y ruido, sólo ejes | terminal/consola, arte/curvas | 3,6–4,3 % | 13–14 % | 2,4 | 1,0000 · 100 % |
| `grito` Grito | recorte total y derrumbe, rastro largo | arte/curvas | 6,6–21,4 % | 11–40 % | 2,2 | 1,0000 · 99,9 % |
| `fosforo` Fósforo lento | ámbar, ciclo de 16 s, persistencia máxima | terminal/consola | 0,7–10,6 % | 60–63 % | 2,3 | 1,0000 · 100 % |

Pruebas propias:
- Sin salto en 4 fronteras de ciclo por preset (Δy < 0,01).
- En el grito quedan menos de la mitad de niveles distintos que en la calma.
- Sigue cambiando en la calma, entre ciclos y a los 600 s.

---

## 6. Marco vivo (`marco`, C-08)

**Mecanismo.** Un rectángulo redondeado, metido hacia dentro por los márgenes, da a cada celda su distancia con signo y su longitud de arco en el perímetro, calculada por simetría de cuadrantes desde arriba en el sentido de las agujas del reloj. Una prueba recorre el contorno: la longitud de arco crece de forma monótona y suma exactamente el perímetro, también con esquinas rectas y en marcos más altos que anchos.

La línea es un núcleo fino sobre una base tenue. Hasta 4 cometas la recorren, cada uno con cabeza, cola exponencial de largo 0,28·P/n y su color de la paleta (los más claros), a velocidades un 7 % distintas entre sí: el espaciado deriva sin repetirse. El latido son dos golpes por pulso, que engordan y avivan la línea. El humo es un fBm que se aleja de la línea, iluminado por los cometas.

**Fuente.** Paper Shaders · Pulsing Border (Apache-2.0; referencia de la idea, no se copió código).

**Distinto de lo que había.** GLYPHOS no tenía efectos de marco ni de perímetro (INVENTARIO §2). Lo más cercano es el efecto de receta `fx.grid` y el patrón `forma` (una figura centrada, no el borde del lienzo).

| Preset | Composición | Usos | Cambio en 0,5 s | Tinta | ms/cuadro | Paridad peor |
| --- | --- | --- | --- | --- | --- | --- |
| `terminal` Marco de terminal | fino, 1 cometa, margen mínimo | terminal/consola, arte/geometricas | 1,4–1,7 % | 16–17 % | 2,5 | 1,0000 · 100 % |
| `neon` Neón doble | grueso, redondeado, 2 cometas de colores, humo | arte/geometricas | 2,7–3,4 % | 22–23 % | 6,9 | 1,0000 · 100 % |
| `latido` Latido | muy redondeado, sin cometas, latido y humo | arte/geometricas | 0,6–14,0 % | 9–32 % | 4,3 | 1,0000 · 100 % |
| `humo` Humo de colores | 4 cometas, humo espeso | arte/geometricas | 3,3–8,6 % | 19–27 % | 6,6 | 1,0000 · 100 % |

Serviría también en el espacio **Componentes** (tarjetas, banners) y como capa encima de otro contenido (fusión `screen`/`lighten`), con la limitación de proporción descrita abajo.

---

## Verificación

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run --no-file-parallelism tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{cromado,desgarro,descargas,mar,osciloscopio,marco}.test.ts`: 303 pruebas en verde, entre ellas la batería completa de las 30 familias.
- Toda la carpeta `tests/unit` (`npx vitest run tests/unit`): 2412 de 2413. Falla `runtime-families › los scripts de familia … pesan decenas de KB como mucho`, que ya fallaba en `deff1b9` por `corrientes` (51 173 bytes > 40 000; comprobado sobre una copia de `deff1b9`: 1 fallo de 28); ver «Cambios compartidos» 4.
- Navegador (`families-qa.mjs`, puerto 5320): «26 presets · sin errores». Paridad en t = 2, 6, 20 y 120: r ≥ 0,9993 en brillo y color r ≥ 0,9975 en todos los presets, con un 99,7–100 % de glifos idénticos. Los dos avisos 403 que muestra la página son recursos de fuentes externas y aparecen igual con `corrientes`, que no se tocó.
- Sonda temporal: todos los presets cambian en todas las muestras hasta 600 s. Ninguno queda vacío ni saturado (la tinta mínima es la de `chispa`, 1–6 %: un arco fino sobre negro).

## Ajustes hechos tras mirar las capturas

- **Cromado.** Se quitaron las líneas finas del perfil, que salían como un punteado de ruido. Ahora hay bandas anchas de alto contraste, un filo de luz en el contorno y un halo ceñido.
- **Desgarro.** La luz de detrás tiene más estructura, la superficie es menos sucia (sólo fibras sueltas) y lleva una luz que deriva. Las quemaduras son de tamaño contenido y su frente se mueve.
- **Descargas.** Arcos más finos y quebrados. Tormenta con canal que se apaga despacio, nubes visibles y más rayos: antes había momentos vacíos (t = 20 s).
- **Mar.** El reflejo de la luna era un bloque sólido: el halo se multiplicaba por la radiancia. Ahora son destellos por celda. Las olas tienen amplitudes equilibradas y crestas visibles.
- **Marco.** Línea base legible y latido marcado.
- **Osciloscopio.** Retícula más visible y traza más fina.

## Cambios compartidos que harían falta (no hechos)

1. **Que una familia lea la fuente de la pieza** (imagen o texto) para `cromado` (metal dentro de las letras o de la foto) y para que `desgarro` revele otra capa.
   - Hoy un chunk analítico sólo recibe `(p, t, k0, k1)` y la paleta.
   - Haría falta un muestreador en GLSL (`famSrc(vec2)` sobre la textura de texto o medio ya presente en el pase de campo) y su gemelo en CPU (`prep(t, k, pal, src)`), con la máscara preprocesada a resolución de celda.
   - Alternativa usada: formas analíticas propias. Para `desgarro` puede aproximarse hoy con dos capas y la fusión `mask`/`cutout`, sin el borde iluminado sobre la otra capa.
2. **La proporción del lienzo para las familias** (`uAspect` en el pase de campo y `currentAspect()` en CPU).
   - `marco` no sabe el ancho del lienzo: tiene el control «Proporción» (1,78 por defecto, 16:9).
   - En otra proporción, o en terminal (80 × 24 con celdas 1:1,4 ≈ 2,38), hay que ajustarlo a mano.
   - Con esa uniforme, el marco abrazaría cualquier lienzo y serviría en Componentes sin configuración.
3. **Un índice de celda fiable para las familias** (por ejemplo `ivec2 CELL` en GLSL y `currentCell()` en CPU).
   - En lienzos múltiplos exactos de la celda (480 × 270 con filas de 10 px), `p.y / PX` cae exactamente en enteros, y `floor(p / PX)` da otra celda en cada motor.
   - `mar` llegó a r = 0,951. Lo resolví con ruido continuo fino en vez de hashes por celda.
   - `corrientes` usa `floor(p / PX)` para su grano y en esta máquina da un 98,7–99,8 % de glifos idénticos: probablemente el mismo efecto, con poco peso. No lo toqué.

4. **El tamaño de los scripts exportados de familia**: falta un módulo mínimo para el tamaño de celda en CPU.
   - `currentPX()` sólo lo exporta `src/engine/basic/patterns.ts`, y al importarlo el script exportado de la familia arrastra toda la biblioteca de patrones básicos (unos 45 KB).
   - Por eso `tests/unit/runtime-families.test.ts` (límite de 40 000 bytes por script) ya falla en `deff1b9` con `corrientes` (51 173). Con el mismo import, que sigue el ejemplo del encargo, lo superan también `cromado` (53 624), `desgarro` (57 248), `mar` (52 575) y `osciloscopio` (52 988). `descargas` (11 643) y `marco` (5 725) no usan el tamaño de celda y quedan por debajo.
   - Arreglo propuesto: mover `PX`/`setPX`/`currentPX` a un módulo propio sin dependencias (por ejemplo `src/engine/basic/px.ts`, reexportado desde `patterns.ts`), o pasar el tamaño de celda en `prep`. No lo hice porque toca `src/engine`.
   - Alternativa descartada: un tamaño de celda fijo en los dos motores. Rompería el antialiasing del cromado y la retícula del osciloscopio en lienzos de pocas filas.

## Lo que no quedó resuelto

- `rasgado` y `latido` tienen tramos de muy poco cambio: 0,08 % y 0,6 % de cambio en 0,5 s en la calma o entre latidos. Es su diseño (pausa del original, pulso), y por eso no se ofrecen como fondo.
- **Prueba del tamaño de los scripts.** `runtime-families` sigue en rojo: ya lo estaba en `deff1b9` por `corrientes`, y cuatro familias mías también superan los 40 KB por la misma causa (cambio compartido 4).
- **Coste en el motor básico.** `desgarro/velo` (24 ms por cuadro) y `descargas/tormenta` (21 ms) son los más caros a 128 × 50 en esta máquina compartida, en el rango de `corrientes` (10–28 ms en la misma tanda). No se midió en un dispositivo modesto real.
- **Entrada INERT** `osciloscopio.grid`: la retícula son líneas de una celda y la sonda de 48 × 24 puntos de la batería cae entre ellas. Su efecto se ve en las capturas y lo cubre la paridad de `limpia`, `interferencia` y `fosforo`.
- **Tiempo límite de una prueba ajena.** Con los archivos de prueba en paralelo en esta máquina, `families-compat › reaccion_difusion/laberinto` superó una vez su tiempo límite de 5 s: es una familia ajena, la carga es de CPU y no hubo diferencia de resultado. Pasa sola (87/87) y en la ejecución secuencial. No se tocó.
- **Muestra retenida del osciloscopio.** Usa `floor(x / dl)` en la degradación. En algún tamaño de lienzo concreto podría caer en un borde exacto y diferir una columna entre motores. No se observó en las mediciones.
