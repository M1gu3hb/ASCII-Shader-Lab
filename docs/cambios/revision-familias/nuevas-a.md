# Familias nuevas A: membrana, paneles, mosaico, lacería e hipercubo

Revisión del PR #10, agente A. Rama `nuevas-a`, desde `deff1b9`. Las cinco familias son analíticas: un fragmento GLSL más su gemelo de CPU línea a línea. No hay modelo con estado.

| Familia | Id | Grupo | Color | Tiempo | Presets |
|---|---|---|---|---|---|
| V-02 Membrana iridiscente | `membrana` | materia | propio (`FC_membrana`) | continuo | 5 |
| V-04 Paneles prismáticos | `paneles` | materia | propio (`FC_paneles`) | bucle exacto de 60 s | 4 |
| V-05 Mosaico cinético | `mosaico` | forma | paleta por brillo | continuo | 5 |
| C-01 Lacería | `laceria` | forma | paleta por brillo | bucle de 32 s o continuo (según el parámetro «Tiempo») | 4 |
| C-04 Hipercubo | `hipercubo` | ciencia | paleta por brillo | bucle exacto de «Ciclo» segundos | 4 |

## Cómo se midió

- **Actividad.** `scripts/families-time.ts` con `--long=600`, sobre el gemelo de CPU en una rejilla de 96 × 48, en t = 0, 30, 60, 120 y 600 s. Para cada momento da dos valores: Δ, el cambio medio de brillo en medio segundo (0–100 %), y la fracción de celdas que cambian más de 8/255. «Tinta» es la parte del dominio con brillo > 24/255. Las tablas dan el rango sobre esos cinco momentos.
- **Coste.** Un cuadro del gemelo de CPU a 128 × 50 celdas (lienzo de 1280 × 700, celdas de 10 × 14 px), con brillo y, en las familias de color, también color. Es la mediana de 9 cuadros tras 3 de calentamiento, en Node. La máquina era compartida, con una carga media de 7 a 11 sobre 4 núcleos, así que los valores son orientativos. Como referencia, la familia ya publicada `corrientes` costó 6–13 ms en las mismas condiciones.
- **Paridad.** `node scripts/families-qa.mjs --url=http://localhost:5310 --ids=membrana,paneles,mosaico,laceria,hipercubo --compare`, en t = 6 s (por defecto) y en t = 47 s. Las 22 piezas cargan sin errores. Cada celda da *r* de brillo y *r* de color (WebGL 2 sobre SwiftShader frente al motor básico).
- **Aspecto.** Capturas grandes (`--big --motor=webgl`, 1280 × 720, celdas de 10 px) en t = 2, 10/20 y 120 s, revisadas a ojo. También capturas a tamaño de terminal (celdas de 18 px, unas 71 × 28) para decidir los usos `terminal/*`.
- **Pruebas.** `npx tsc --noEmit -p .`: sin errores. `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{membrana,paneles,mosaico,laceria,hipercubo}.test.ts`: 7 archivos y 297 pruebas en verde. No se añadió ninguna entrada INERT ni se rebajó ninguna tolerancia.

Ninguna familia copia código, constantes, textos ni presets de las referencias. Todo se escribió desde la descripción matemática del inventario (§4 y §7) y desde la física o la geometría publicadas. Las fuentes están en `doc.sources` de cada familia, con su licencia.

---

## V-02 «Membrana iridiscente» (`membrana`)

**Mecanismo.** Interferencia de película delgada con dos haces. La luz se refleja en las dos caras de la película y una de las dos reflexiones se invierte, así que la banda de longitud de onda λ vuelve con intensidad ∝ 1 − cos(2π·OPD/λ), con OPD = 2·n·d·cos θt:

- d es el espesor;
- n vale 1,33 para el jabón y 1,45 para el aceite;
- θt es el ángulo de refracción por Snell, que sale de la inclinación de la superficie.

El espectro de 400 a 700 nm se divide en 8 bandas. En cada una se promedia la respuesta sobre su anchura (un factor sinc, que hace palidecer los colores cuando la película engorda) y se pondera con las funciones de color CIE 1931 (ajuste analítico de Wyman, Sloan y Shirley, 2013), pasadas a sRGB lineal y normalizadas para que un espectro plano dé blanco. Las constantes se calculan una vez en JS y se incrustan en el GLSL, así que los dos motores usan los mismos números.

El espesor drena con la gravedad (película negra arriba) y lo remueven dos deformaciones encadenadas de ruido fBm (corrientes en hebras). La superficie ondula con tres senos viajeros de gradiente analítico. Su inclinación cambia el ángulo, sombrea los pliegues y mueve el brillo especular, que toma el color de la película (no hay reflejo sobre una película negra).

Hay tres formas:

- **lámina**: llena el lienzo;
- **burbuja**: una esfera vista de frente, con el ángulo según el radio, el borde brillante por Fresnel, el centro transparente, la tapa superior negra y el reflejo de una ventana;
- **mancha de aceite**: manchas de fBm sobre agua oscura, más gruesas en el centro.

**Decisión de color.** Por defecto el color sale de la física, no de la paleta: es la serie de Newton (negro, blanco, amarillo, magenta, azul, verde… y después pastel), que es lo que distingue a la familia. Con «Color de: la paleta», las franjas se quedan donde las pone la física (el orden OPD/560 nm) y cada orden de interferencia toma el siguiente color de la paleta; el más oscuro queda en los mínimos. Lo elegí así porque mezclar todos los colores de la paleta ponderados por banda daba grises turbios (lo probé y lo descarté). El carácter sale del brillo reflejado, más el 35 % de la franja de la banda verde para que las bandas se lean como densidad de glifos.

**Fuente.** Radiant · Artpop Iridescence (MIT, © 2025 Paul Bakaus), sólo como referencia de la idea. Modelo físico: interferencia de película delgada (Wikipedia), Wyman–Sloan–Shirley (JCGT 2013) y Belcour–Barla 2017 como referencia. No se copió código: el ruido es el de GLYPHOS (`fbm`, `fbm3`) y no el simplex de Ashima que lleva Radiant.

**Tiempo.** Continuo: ruido que deriva y ondas de frecuencias inconmensurables.

| Preset | Composición | Δ / 0,5 s | Celdas que cambian | Tinta | ms/cuadro CPU | *r* brillo t6 / t47 | *r* color t6 / t47 | Usos |
|---|---|---|---|---|---|---|---|---|
| `jabon` «Lámina de jabón» | Lámina que drena: película negra arriba y bandas horizontales de color retorcidas desde abajo | 5,8–6,8 % | 48–53 % | 81–89 % | 14,9 | 1,0000 / 1,0000 | 1,0000 / 1,0000 | fondos/materia, fondos/color |
| `pompa` «Pompa flotante» | Una burbuja sola en el centro, con anillo de color y reflejo | 0,9–1,0 % | 9–10 % | 22–24 % | 5,0 | 1,0000 / 1,0000 | 1,0000 / 1,0000 | arte/figuras |
| `aceite` «Aceite en el asfalto» | Manchas de aceite que se parten sobre agua negra con ondas | 2,2–2,6 % | 24–28 % | 82–88 % | 12,5 | 1,0000 / 1,0000 | 0,9999 / 0,9999 | fondos/materia |
| `pliegues` «Pliegues de seda» | Película fina con ondas fuertes: pliegues sombreados y brillos | 1,7–1,9 % | 15–19 % | 75–78 % | 16,2 | 1,0000 / 1,0000 | 0,9999 / 0,9999 | fondos/materia, fondos/color |
| `nacar` «Nácar en tus colores» | Película gruesa con las franjas en los colores de la paleta | 8,0–9,3 % | 59–64 % | 92–98 % | 11,8 | 1,0000 / 1,0000 | 0,9994 / 1,0000 | fondos/color |

**Qué la distingue.** Lo más cercano en GLYPHOS es `corrientes` (V-01, color propio por mezcla de la paleta) y, por el nombre, el preset `tela:membrana`, que es una simulación de tela. Aquí el color no es una rampa ni una mezcla de paleta: es el espectro de interferencia. Aparecen la película negra, las franjas de Newton que se estrechan hacia abajo y la palidez de los órdenes altos, y ningún otro patrón da esos colores.

**Pruebas propias (`family-membrana.test.ts`).**

- Las bandas suman blanco.
- Espesor cero da negro.
- La serie de Newton sale bien: blanco de primer orden; magenta donde se apaga el verde; los órdenes altos se apagan.
- La lámina es negra arriba y tiene bandas abajo.
- La burbuja no dibuja fuera de su borde y su anillo brilla más que su centro.
- El color de paleta depende de la paleta; el de película, no.

---

## V-04 «Paneles prismáticos» (`paneles`)

**Mecanismo.**

- **Geometría.** Rectángulos translúcidos sujetos a un eje común, como las palas de una noria. Puede haber un segundo juego que gira al revés. El eje se ve en perspectiva: girado en profundidad, con un vaivén de una vez por minuto, y algo desde arriba. Su inclinación en pantalla es un parámetro, de horizontal a vertical («puerta giratoria»).
- **Intersección.** Para cada celda se lanza un rayo y se resuelve, en el marco del eje, la intersección rayo–plano con cada panel (λ = −(o.y·cos α − o.z·sin α)/(d.y·cos α − d.z·sin α)). Cada panel cortado dentro de su rectángulo aporta una capa con:
  - su profundidad;
  - su color de la paleta, que se degrada hacia el siguiente a lo largo del panel y se oscurece con la distancia;
  - su alfa.
- **Composición.** Las capas se ordenan de lejos a cerca (ordenación por inserción, hasta 20 capas) y se componen con «over». El carácter sale de la tinta compuesta igual.
- **Bordes y nervios.** Los bordes son líneas de unas dos celdas a cualquier profundidad (PX escalado por la profundidad). Los nervios, a lo largo de cada panel, se apiñan con la distancia y dan profundidad en glifos.

**Fuente.** Paper Shaders · Color Panels (Apache-2.0), sólo como referencia de la idea. Composición «over» de Porter y Duff. No se adaptó código de Paper, así que no hace falta su NOTICE.

**Tiempo.** Bucle exacto de 60 s en todos los presets (`period: 60`). Cada juego da un número entero de vueltas por minuto (el parámetro «Giro» es entero) y el vaivén dura un minuto. La prueba propia comprueba brillo y color en t y t + 60 (diferencia < 1e-6).

| Preset | Composición | Δ / 0,5 s | Celdas que cambian | Tinta | ms/cuadro CPU | *r* brillo t6 / t47 | *r* color t6 / t47 | Usos |
|---|---|---|---|---|---|---|---|---|
| `vidrieras` «Vidrieras que giran» | Dos juegos de 7 paneles largos en un eje casi vertical que llenan el lienzo | 12,5–12,7 % | 64–65 % | 93 % | 7,8 | 1,0000 / 1,0000 | 1,0000 / 0,9999 | fondos/color, fondos/materia |
| `abanico` «Abanico de cristal» | 10 paneles estrechos y transparentes, de bordes finos: un abanico de cristal | 8,0 % | 27 % | 45 % | 4,8 | 1,0000 / 1,0000 | 1,0000 / 1,0000 | arte/geometricas, arte/figuras |
| `noria` «Noria de color» | 8 palas cortas en dos juegos, como una turbina vista de lado | 8,9 % | 46 % | 51 % | 7,9 | 1,0000 / 1,0000 | 1,0000 / 1,0000 | arte/geometricas, arte/figuras |
| `puerta` «Puerta giratoria» | Eje vertical, tres paneles y su contrario | 12,0–12,2 % | 42–43 % | 51–52 % | 3,2 | 1,0000 / 1,0000 | 1,0000 / 1,0000 | arte/geometricas, arte/figuras |

**Qué la distingue.** Lo más cercano es `prisma` (un sólido trazado por rayos, quieto y de un tono) y `corrientes` (color por mezcla en el plano). Aquí hay planos translúcidos que giran con profundidad real y se superponen por orden de profundidad: los colores se mezclan donde se cruzan los cristales y no donde se acercan dos manchas.

**Pruebas propias (`family-paneles.test.ts`).**

- La composición del gemelo es exactamente la composición «over» de sus capas ordenadas de lejos a cerca.
- La capa cercana opaca domina el color.
- El bucle es exacto en los cuatro presets.

---

## V-05 «Mosaico cinético» (`mosaico`)

**Mecanismo.**

- **Teselas.** Cada tesela es un bloque exacto de celdas: n filas por m columnas, con m impar y la tesela casi cuadrada con la proporción de celda por defecto de 1,4. Se calcula con PX, así que los bordes de tesela caen entre celdas.
- **La ola.** Una ola recorre la pared en una de cinco direcciones: de lado, de arriba abajo, en diagonal (eje alterno), en anillos o como un barrido que gira. En cada pasada, cada tesela gira 180° sobre el eje perpendicular a la ola.
- **El volteo a una celda.** La cara se estrecha con |cos θ|. De canto, la tesela es una franja de una celda: su borde dorado, una columna de glifos para el eje vertical o una fila para el horizontal. Luego abre la otra cara. Lo que cubre cada celda se calcula con exactitud (solapamiento de intervalos), así que el estrechamiento va de 5 a 3 a 1 columnas en vez de saltar.
- **La imagen de cada pasada.** La cara que descubre la pasada k es la imagen k: al azar por tesela o formas grandes (fBm en el centro de la tesela, desplazada con k) que el frente dibuja sobre la pared. Así nunca se repite.
- **Luz.** Cada cara tiene su propia inclinación y la normal gira con el volteo. Es continua entre pasadas: la cara nueva gira θ − π. Una luz que se desplaza saca destellos entre pasada y pasada.

**Fuente.** Radiant · Gilt Mosaic (MIT, © 2025 Paul Bakaus), sólo como referencia de la idea. No se copió código.

**Tiempo.** Continuo y sin pausas largas. Con la separación de olas de los presets siempre hay varios frentes en pantalla: en todos los momentos medidos cambia entre el 22 y el 56 % de las celdas cada medio segundo.

| Preset | Composición | Δ / 0,5 s | Celdas que cambian | Tinta | ms/cuadro CPU | *r* brillo t6 / t47 | Usos |
|---|---|---|---|---|---|---|---|
| `ola` «Ola de teselas» | Teselas de 3 filas, olas de izquierda a derecha, formas grandes | 12,7–15,9 % | 43–50 % | 89–94 % | 5,2 | 1,0000 / 1,0000 | fondos/geometricas, arte/geometricas |
| `anillos` «Anillos que voltean» | Teselas pequeñas, anillos desde el centro | 7,3–13,0 % | 38–56 % | 90–95 % | 5,4 | 1,0000 / 1,0000 | fondos/geometricas, arte/geometricas |
| `cartel` «Cartel de estadio» | Teselas grandes (4 × 7), de arriba abajo, desordenadas, imagen pura | 8,2–13,5 % | 32–36 % | 80–92 % | 4,3 | 0,9998 / 1,0000 | arte/geometricas, fondos/geometricas |
| `dorado` «Mosaico dorado» | Teselas pequeñas en diagonal, muy desordenadas, destellos | 5,2–7,8 % | 22–47 % | 96–98 % | 4,5 | 0,9999 / 0,9999 | fondos/geometricas, arte/geometricas |
| `barrido` «Barrido de radar» | Un barrido que gira y voltea a su paso | 8,5–12,4 % | 35–44 % | 88–94 % | 4,6 | 1,0000 / 1,0000 | arte/geometricas, fondos/geometricas |

**Qué la distingue.** No reemplaza ni a `wfc` ni a `truchet`. `wfc` es un tablero que se resuelve por restricciones y se queda quieto (construcción); `truchet` («Laberinto») son curvas en teselas quietas; `cuadros` y `tablero` son damas estáticas. Aquí cada tesela da la vuelta físicamente, se ve de canto a una celda y cada ola cambia la imagen de la pared.

**Pruebas propias (`family-mosaico.test.ts`).**

- Las teselas tienen columnas impares y son casi cuadradas.
- De canto, la tesela es una sola columna: la central por encima de 0,9, las vecinas por debajo de 0,2 y nada más allá. Después la cara nueva abre 3 columnas y luego las 5.
- No hay saltos entre pasadas.
- Seis pasadas seguidas dan seis imágenes distintas.

---

## C-01 «Lacería» (`laceria`)

**Mecanismo.**

- **Las estrellas.** Polígonos estrellados regulares {N/k} con simetría 6, 8, 10 o 12: N cuerdas de un círculo, cada una a R·cos(πk/N) del centro. Dentro de cada estrella puede ir otra más simple, {N/2}, encajada en su polígono central, y una tercera dentro de esta. Las capas giran en sentidos alternos.
- **La disposición.** La roseta va sola (rosetón) o en rejilla cuadrada o hexagonal. En la rejilla, cada estrella gira al revés que su vecina, como un engranaje (radio 0,45 del paso, para que no choquen).
- **El entrelazado.** Sale de la topología. El plano se colorea en dos tonos por la paridad del número de estrellas que contienen el punto. Dentro de una {N/k} el número de vueltas es k − m, con m el número de rectas de cuerda que dejan el punto por fuera; una prueba propia lo comprueba contra el rayo par-impar en siete estrellas. En cada cruce de las dos cintas más cercanas pasa por encima la que, al girarla hacia la otra en sentido antihorario, barre la región sombreada. Es la correspondencia entre diagramas alternos y coloración de damero.
- **Cómo se dibuja.** La cinta de abajo se corta con un hueco. Las dos cuerdas de una estrella que se juntan en una punta se unen. Cada cinta mide unas dos celdas, con contorno oscuro, y las regiones toman dos tonos como un alicatado.
- **Renovación.** Cada medio ciclo, un frente desde el centro (rosetón) o desde las esquinas (rejilla) deja detrás la configuración siguiente: otra profundidad de la estrella exterior (por ejemplo, de {8/2} a {8/3}) y capas desfasadas. Las cintas que el frente acaba de pasar salen recién entintadas y el frente se ve como una línea fina. No hay fase vacía: delante del frente sigue la configuración anterior.

**Fuente.** Radiant · Radiant Geometry, Sacred Strange y Gothic Filigree (MIT, © 2025 Paul Bakaus), sólo como referencia de la idea. Polígonos estrellados y nudos alternos (Wikipedia). No se copió código.

**Tiempo.**

- **«Bucle de 32 s»**: dos configuraciones alternas, y cada capa gira un número entero de pasos de simetría 2π/N por ciclo. La prueba propia comprueba t frente a t + 32 (< 1e-6) en `nazari` y `roseton`.
- **«Continuo»**: las configuraciones salen de un hash del número de ciclo y las capas giran a velocidades sin relación entre sí. La prueba comprueba que t y t + 32 difieren.
- `caps.time` es `{ param: 'cycle', values: { bucle: 'bucle' }, else: 'continuo' }`.

| Preset | Composición | Tiempo | Δ / 0,5 s | Celdas que cambian | Tinta | ms/cuadro CPU | *r* brillo t6 / t47 | Usos |
|---|---|---|---|---|---|---|---|---|
| `nazari` «Azulejo de ocho» | Rejilla cuadrada de {8/2} con estrella interior, engranajes, renovación desde las esquinas | bucle 32 s | 2,5–3,5 % | 6–7 % | 27–28 % | 8,0 | 1,0000 / 0,9973 | arte/geometricas, fondos/geometricas |
| `roseton` «Rosetón» | Una rosa {12/4} grande con su estrella interior al revés | bucle 32 s | 2,8–3,5 % | 8–11 % | 17–18 % | 9,0 | 1,0000 / 1,0000 | arte/geometricas |
| `traceria` «Tracería» | Rejilla hexagonal de hexagramas, cintas anchas | continuo | 7,6–9,8 % | 21–27 % | 28–29 % | 6,5 | 1,0000 / 0,9990 | fondos/geometricas, arte/geometricas |
| `diez` «Estrella de diez» | Una {10/3} sola con su estrella interior | continuo | 6,3–8,7 % | 13–19 % | 12–20 % | 7,4 | 1,0000 / 1,0000 | arte/geometricas |

Ningún preset de lacería se ofrece en `terminal/*`: a unas 71 × 28 celdas los cruces se empastan, y lo comprobé con capturas.

**Qué la distingue.** Lo más cercano es `entrelazado`, una cestería ortogonal de damero fijo; `estrella` y `caleido`, que no tienen cruces; y `hiperbolico`, una teselación sin tejido. Aquí hay rosetas de estrellas con tejido alterno de verdad, capas que contrarrotan y un dibujo que se renueva.

**Paridad.** Al principio WebGL y el básico daban *r* = 0,88 en la rejilla hexagonal. Lo arreglé sin tocar tolerancias, así:

- Pasado el extremo de una cuerda, la cinta toma la dirección radial de la punta, igual para las dos cuerdas que se juntan allí.
- Los empates de distancia se rompen de forma determinista.
- Los hashes reciben números enteros: el seno y coseno de SwiftShader difieren de los de la CPU hacia 1e-5, y bastaba para cambiar de cuerda.
- Dos cintas casi paralelas se unen en vez de cruzarse.

El resultado es *r* ≥ 0,997.

**Pruebas propias (`family-laceria.test.ts`).**

- La paridad de vueltas coincide con el rayo par-impar.
- El tejido alterna a lo largo de cada cinta en {8/3}, {12/5}, {10/3}, {10/4}, {6/2} y {12/3} (2(k − 1) cruces por cuerda, alternos). Lo comprobé por mutación: si quito la paridad de la regla, la prueba falla.
- El bucle es exacto y el modo continuo no se repite.

---

## C-04 «Hipercubo» (`hipercubo`)

**Mecanismo.**

- **Los politopos.** Teseracto (16 vértices y 32 aristas), 16 celdas (8 y 24) o 24 celdas (24 y 96), todos de radio 1. Las tablas se generan en JS (aristas = pares a la distancia mínima) y se incrustan en el GLSL. El gemelo usa las mismas.
- **Giro y proyección.** El politopo gira en los planos zw, yw y xw. Se proyecta en perspectiva de 4D a 3D desde un ojo en w = D (factor D/(D − w)) y de 3D a pantalla con una cámara que da una vuelta por ciclo y mira algo desde arriba.
- **Dibujo.** Cada arista es un segmento cuyo grosor y brillo siguen a w a lo largo de ella: lo más cercano al ojo 4D es más grueso y más claro, y eso es lo que hace que el cubo interior pase a ser el exterior. Se atenúa con la profundidad 3D. Los vértices son puntos. La estela repite la figura tres veces unos instantes antes, cada vez más tenue.
- **Gemelo.** La proyección sólo depende de t, así que se calcula una vez por cuadro. Las celdas fuera de la caja de cada copia, o cuyo brillo ya no puede subir, se saltan sin cambiar el resultado.

**Fuente.** Radiant · Tesseract Shadow (MIT, © 2025 Paul Bakaus), sólo como referencia de la idea. Teseracto y 24 celdas (Wikipedia). No se copió código.

**Tiempo.** Bucle exacto. Cada plano da un número entero de vueltas por ciclo (giros enteros de −3 a 3) y la cámara da una. El periodo es «Ciclo» segundos y cada preset declara `period` = su ciclo. La prueba propia lo comprueba en t y t + ciclo.

| Preset | Composición | Periodo | Δ / 0,5 s | Celdas que cambian | Tinta | ms/cuadro CPU | *r* brillo t6 / t47 | Usos |
|---|---|---|---|---|---|---|---|---|
| `teseracto` «Teseracto» | Giro en xw e yw, estela corta | 40 s | 4,1–5,7 % | 17–22 % | 20 % | 14,0 | 1,0000 / 1,0000 | arte/figuras, terminal/figuras |
| `reves` «Del revés» | Sólo xw, perspectiva fuerte: el cubo interior sale una y otra vez | 20 s | 4,4–4,5 % | 15–18 % | 18 % | 13,3 | 1,0000 / 1,0000 | arte/figuras |
| `celdas24` «Veinticuatro celdas» | 96 aristas finas girando en tres planos | 60 s | 6,8–7,2 % | 26–27 % | 32 % | 22,5 | 1,0000 / 1,0000 | arte/figuras |
| `celdas16` «Dieciséis celdas» | Aristas gruesas, estela larga, giro rápido | 48 s | 2,7–3,5 % | 11–13 % | 15–16 % | 6,9 | 1,0000 / 1,0000 | arte/figuras, terminal/figuras |

**Qué la distingue.** Lo más cercano es `cubo` y `poliedro` (sólidos 3D trazados por rayos) y `fractal_3d`. Aquí la figura es de cuatro dimensiones: el giro en planos con w y la perspectiva 4D hacen que la figura se vuelva del revés, cosa que ningún sólido 3D hace.

**Pruebas propias (`family-hipercubo.test.ts`).**

- Las tablas son correctas: número de vértices y aristas, grado regular 4, 6 y 8, y vértices en la esfera unidad.
- En perspectiva 4D el cubo exterior se ve más de 1,5 veces mayor que el interior, y un cuarto de vuelta en xw da |w| = |x|.
- El bucle es exacto en los cuatro presets.

---

## Archivos

- **Nuevos:**
  - `src/families/analytic/{membrana,paneles,mosaico,laceria,hipercubo}.ts` y sus `.cpu.ts`;
  - `src/families/meta/{id}.ts` y `{id}.doc.ts`;
  - `tests/unit/family-{id}.test.ts`.
- **Registro** (sólo líneas añadidas): `meta/materia.ts` (membrana, paneles), `meta/forma.ts` (mosaico, laceria), `meta/ciencia.ts` (hipercubo), `load.ts`, `analytic/glsl.ts` y `docs.ts`.
- **No se tocó:** `types.ts`, `registry.ts`, `host.ts`, `params.ts`, `src/engine`, `src/studio`, los catálogos, los fixtures, las familias existentes ni `tests/unit/families.test.ts`.

## Cambios compartidos que harían falta (no los hice)

1. **PX para los gemelos de CPU en el código exportado.** Cuatro familias (`paneles`, `mosaico`, `laceria`, `hipercubo`) y la ya publicada `corrientes` leen el tamaño de celda con `currentPX()` de `src/engine/basic/patterns.ts`.
   - En el estudio y en las páginas de desarrollo es el mismo módulo que usa el motor básico, y el valor es correcto: la paridad medida lo confirma.
   - En el código exportado, cada familia es un script que lleva su propia copia de los ayudantes (`scripts/runtime-plugin.ts`, `familyScript`). Esa copia de `patterns.ts` nunca recibe `setPX` del runtime, así que el gemelo dibuja con el valor por defecto, PX = 0,02. Sólo afecta al motor básico de respaldo del HTML exportado; WebGL usa su `PX` y está bien.
   - Además, arrastrar `patterns.ts` hace que esos scripts pesen unos 51–58 KB: `corrientes` 51 173, `mosaico` 52 141, `hipercubo` 53 473, `paneles` 53 486 y `laceria` 58 133 bytes. Superan el límite de 40 000 de `tests/unit/runtime-families.test.ts`, que **ya falla en `deff1b9` por `corrientes`**: su script no cambia en esta rama y mide lo mismo.
   - **Propuesta:** que `AnalyticImpl.prep` reciba el tamaño de celda (`prep(t, k, pal, px)`: el motor básico ya lo calcula en `src/engine/basic/field.ts` con `setPX(cellP·scale)` justo antes de llamar a `prep`), o un `setPX` en el impl que el runtime llame. Así los gemelos no importarían `patterns.ts`.
   - **Alternativa usada:** `currentPX()`, porque sin ese dato el mosaico no puede alinear sus teselas con la rejilla de caracteres.
2. **`figure` por preset.** `FamilyMeta.figure` es de toda la familia. `pompa`, `roseton`, `diez`, `abanico`, `noria` y `puerta` son figuras centradas en familias que también tienen presets que llenan el lienzo. En un lienzo más alto que ancho (9:16), la burbuja (diámetro 0,8 de la altura) y el rosetón se cortan por los lados, y marcar toda la familia como figura agrandaría también las láminas y las rejillas. Propuesta: `FamilyPreset.figure?: boolean`, que `figureFit` usaría con preferencia. No marqué `figure` en esas familias; sí en `hipercubo`, que es figura en todos sus presets.
3. **Glifo de canto.** El carácter sale de la densidad, así que la franja de una celda del mosaico de canto se dibuja con el glifo de su brillo y no con `|` o `-` según la orientación. El modo `lines` sólo dibuja bordes de gradiente. Un modo mixto (densidad más una pista de orientación que dé el campo) dejaría elegir `|` o `-`. No es imprescindible: la franja ya se lee como una columna o una fila.

## Lo que no quedó resuelto (con evidencia)

- **`tests/unit/runtime-families.test.ts`** sigue en rojo en esta rama. Falla primero por `corrientes`, ya en la base, y mis cuatro familias que importan `currentPX()` también superan los 40 KB. Lo detalla el punto 1 de la sección anterior. Con toda la carpeta `tests/unit`: 2 404 pruebas pasan y 2 fallan, ésta y `zip.test.ts` («round-trips strings, bytes and blobs»). Ésta última pasó al repetirla sola, con la máquina a carga 18 sobre 4 núcleos, y no toca nada de esta rama.
- **Lacería.** Cada celda resuelve el cruce con las dos cintas más cercanas, así que en un cruce triple el tejido puede fallar un instante. Hace falta que la estrella mida unas 30 filas para leer el tejido, y por eso no hay usos `terminal/*`.
- **Paneles.** Con «over», cuando se cruzan dos colores muy opuestos de la paleta pueden salir mezclas turbias, por ejemplo rosa sobre verde que da beis. Es lo que hace un vidrio, pero en `vidrieras` se nota en algunos cruces.
- **Membrana.** Sólo dos haces (sin los órdenes múltiples de Airy) y 8 bandas: por encima de unos 2 µm de diferencia de camino se queda en pastel en vez de blanco. La burbuja se ve sólo por delante. `pompa` cambia despacio (0,9–1 % por medio segundo): es una burbuja que flota, no un fondo.
- **Hipercubo.** El 24 celdas, con 96 aristas, es una red densa que a tamaño pequeño se empasta. Sólo `teseracto` y `celdas16` se ofrecen en `terminal/figuras`, tras comprobarlos a 71 × 28 celdas.
- **Coste.** El gemelo de CPU de `celdas24` cuesta unos 22 ms por cuadro a 128 × 50, y `pliegues` y `jabon` unos 15–16 ms: es comparable a `corrientes` (6–13 ms), pero es lo más caro de esta entrega. Los valores se midieron en una máquina compartida y con carga.

## Commits

En la rama `nuevas-a`, sin push:

- `47b1a85` Familias nuevas A: membrana, paneles, mosaico, lacería e hipercubo (analíticas, con gemelo de CPU).
- `217de86` Familias nuevas A: paridad de motores, legibilidad en glifos y pruebas de mecanismo.
- `2427947` Familias nuevas A: destinos de biblioteca honestos y textos al día.
- El commit de este informe.
