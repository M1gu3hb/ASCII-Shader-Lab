# Familias nuevas · agente C (V-09, C-02, C-05, C-09)

Rama `nuevas-c` desde `deff1b9`. Cuatro familias raster con estado, las cuatro `continuo`, con el mismo código en los dos motores:

| Familia | id | Grupo | Presets |
|---|---|---|---|
| V-09 Ecos y realimentación | `ecos` | `materia` | `tinta` «Tinta recursiva», `espejos` «Espejos», `tunel` «Túnel de ecos», `huracan` «Huracán», `marea` «Marea de ecos» |
| C-02 Humo rizado | `humo` | `fisica` | `espiritu` «Espíritu», `fumarola` «Fumarola», `nebulosa` «Nebulosa rizada», `seda` «Hilos de seda» |
| C-05 Cámara de niebla | `niebla` | `ciencia` | `burbujas` «Cámara de burbujas», `cosmicos` «Rayos cósmicos», `pares` «Lluvia de pares», `fuente` «Fuente alfa» |
| C-09 Orden y caos | `orden_caos` | `forma` | `fusion` «Fusión», `radial` «Cristalización radial», `onda` «Onda de calor» |

Archivos nuevos: `src/families/sims/{ecos,humo,niebla,orden_caos}.ts`, `src/families/meta/<id>.ts` y `<id>.doc.ts`, `tests/unit/family-<id>.test.ts`. Registro (sólo líneas añadidas): `meta/materia.ts`, `meta/fisica.ts`, `meta/ciencia.ts`, `meta/forma.ts`, `load.ts`, `docs.ts`. No se tocó nada en `src/engine`, `src/studio`, `types.ts`, `host.ts`, `params.ts`, catálogos, fixtures ni familias existentes, ni la batería (no hizo falta ninguna entrada `INERT`).

Licencias: todo el código se escribió desde cero a partir de la descripción matemática de `INVENTARIO.md` (§4, §6, §7) y de los artículos citados. No se leyó ni copió código de `scratchpad/repos/src/`, ni presets, constantes, texturas o nombres de las fuentes; los nombres de los presets son propios. Ninguna familia adapta código de Paper Shaders. Cada `doc.sources` cita la referencia con su licencia y la nota «referencia de la idea, no se copió código».

## Verificación (resumen)

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-{ecos,humo,niebla,orden_caos}.test.ts`: **303/303 en verde** (8 pruebas genéricas por familia + 13 pruebas propias de mecanismo). Sin tolerancias rebajadas ni pruebas desactivadas.
- Navegador (`vite --port 5330`, `scripts/families-qa.mjs --compare`): **16 presets sin errores, r = 1,0000 y 100 % de glifos idénticos en los 16**, a t = 6 s y a t = 20 s. Los dos `403 (Forbidden)` que imprime la página también salen con una familia existente (`fluido`): son recursos externos que el proxy de este entorno bloquea, no de estas familias.
- Capturas grandes (`--big --motor=webgl`, celdas de 10 px, 1280 × 720) a t = 2, 20 y 120 s de cada preset, revisadas una a una; además `niebla` con celdas de 16 px (rejilla de unas 80 × 28, tamaño de terminal). Ver «Lo que no quedó resuelto» sobre el presupuesto de recuperación de la página QA a t = 120.
- Sonda temporal (`scripts/families-time.ts --seeds=3 --res=min,def,max --long=600`): ver la tabla de cada familia. «Cambio» = variación media del raster en 0,5 s con la cámara fija (el estado); «ocupación» = parte del dominio con tinta (> 24/255). Todos los presets cambian en todas las muestras (0 a 600 s) y ninguno queda vacío ni saturado.

Nota sobre tiempos: la máquina estuvo compartida con otros agentes durante todo el trabajo (carga media de 9 a 15 en 4 núcleos). Los ms de la sonda son de esas condiciones; la tabla de coste de cada familia da además una medida con la máquina (casi) libre.

---

## V-09 «Ecos y realimentación» (`ecos`)

**Mecanismo.** Bucle de realimentación de fotograma, autónomo. Un búfer de luminancia de 2 × 2 píxeles por píxel del raster (288 × 144 a la resolución por defecto, 72 filas; hasta 576 × 288) que en cada paso fijo (30/s):
1. se vuelve a muestrear por una malla de deformación de 49 × 25 vértices (interpolada por píxel): zoom alrededor de un centro que deambula, con un exponente que crece con el radio (`Curvatura`: los bordes avanzan más que el centro → túnel), giro global, giro que crece hacia el centro ∝ 1/(r + 0,2) (`Remolino` → huracán), corriente cuya dirección deriva y ondulación senoidal con frecuencias que derivan;
2. opcionalmente se realza contra una copia desenfocada a media resolución, c + k·(c − desenfoque), antes de apagarse (`Tinta`): con el recorte a 0..1 aparecen laberintos de Turing que fluyen con la deformación;
3. decae (multiplicativo según `Memoria` y un pequeño desvanecimiento sustractivo) y se recorta;
4. recibe semillas: onda cerrada o línea de una señal sintética (tres armónicos con pesos y fases que derivan), dos polígonos con borde, dos polígonos texturizados que copian el fotograma girado y reducido (copias de copias, efecto Droste), puntos sueltos con ráfagas en el pulso, o una trama de n rejillas (cuasiperiódica con 5 y 7) inyectada con poca opacidad. `Intermitencia` dibuja la semilla cada 1–8 pasos: copias separadas (anillos, ecos) en vez de una estela;
5. con `Espejo`, se pliega en cada paso sobre una simetría (2, 4, 6 u 8 gajos; las semillas se dibujan dentro de la región que el pliegue conserva).
Reloj propio: 8 osciladores lentos (3 senos cada uno, frecuencias no relacionadas, fases de la semilla) mueven centro, giro, deriva, ondulación, radio y posición de las semillas; un pulso de ataque de 40 ms y caída exponencial cada `Compás` segundos ilumina la semilla y da un empujón al zoom. Composición: promedio 2 × 2, eco volteado opcional (fuera del bucle), curva de contraste, bytes en pasos de 4 (paridad de los motores). Pincel «Trazo»: dibuja dentro del bucle.

**Color.** Sólo luminancia; colorea la paleta de la pieza (ver «Cambios compartidos»).

**Fuentes.** Butterchurn (MIT, © 2013-2018 Jordan Berg) y Radiant · Feedback Loop (MIT, © 2025 Paul Bakaus) como referencia del mecanismo; Turing (1952). No se copió código, presets, constantes ni texturas.

**Tiempo.** `continuo`. Sin bucle perfecto (no se promete). Calentamiento 60 pasos (2 s) para que el primer cuadro ya tenga historia; a t = 2 s los cinco presets ya llenan el lienzo.

| Preset | Composición | Usos | Cambio mín. (def, 3 semillas, 0–600 s) | Ocupación (def) |
|---|---|---|---|---|
| `tinta` | laberintos de Turing nacidos de puntos, fluyendo despacio hacia fuera desde un centro que deambula | fondos/organicas, arte/optica | 17,47 % | 22–62 % |
| `espejos` | dos polígonos que copian el fotograma, plegados en 8 gajos: marcos dentro de marcos simétricos | fondos/materia, arte/optica | 14,94 % | 45–80 % |
| `tunel` | anillos de una onda de 5 lóbulos que salen del centro cada 6 pasos y se aceleran hacia los bordes | fondos/espacio, arte/optica | 17,56 % | 71–92 % |
| `huracan` | una línea de señal que cruza el centro, enrollada en brazos de espiral por el remolino | fondos/espacio, arte/optica | 24,31 % | 46–59 % |
| `marea` | trama de 5 direcciones inyectada con poca opacidad, plegada por corriente y ondulación: bandas de mármol | fondos/materia | 9,98 % | 38–74 % |

Las resoluciones mínima (48) y máxima (144) también cambian en todas las muestras (≥ 7 %). `espejos` se midió de nuevo tras su último ajuste.

**Coste** (Node, 72 filas, búfer 288 × 144; máquina con carga ≈ 14): 2,1–3,9 ms/paso → 63–117 ms por segundo simulado (objetivo ≲ 250); calentamiento 176–392 ms (objetivo ≲ 400; el más caro, `espejos`, por los dos polígonos que copian y el pliegue); render 0,1–2 ms. Con la máquina casi libre (al principio de la sesión, carga < 1, con versiones previas de los presets) los pasos costaban 1,5–2,5 ms; no pude repetir la medida final en esas condiciones.

**Pruebas propias** (`family-ecos.test.ts`): el avance positivo aleja lo dibujado del centro y el negativo lo hunde; la memoria decide cuánto dura un trazo sin semilla; el espejo de cuatro cuartos deja el fotograma simétrico en los dos ejes; `Tinta` produce un laberinto (20–80 % de tinta, muchos bordes por fila).

**Qué la distingue.** Lo más cercano en GLYPHOS: la transformación de fuente `estela` (sólo acumula y apaga, no transforma la historia), los patrones `tunel`/`hiper` (túneles analíticos sin memoria), `caleido` (simetría sin recursión) y `reaccion_difusion` (Turing por Gray–Scott). Aquí la historia vuelve transformada y se alimenta de sí misma: anillos que viajan y se ensanchan, brazos de espiral que se enrollan, marcos que contienen copias reducidas del propio fotograma, laberintos que fluyen con el zoom.

---

## C-02 «Humo rizado» (`humo`)

**Mecanismo.** Ruido rizado (Bridson et al. 2007): hasta 12 000 partículas 3D con v = ∇ × Ψ, Ψ = tres ruidos de gradiente 3D (permutación sembrada, interpolación quíntica, gradiente analítico comprobado contra diferencias finitas) desplazados entre sí y que se deslizan en el tiempo. Sin divergencia: el flujo estira el humo sin amontonarlo. Encima: una correa que sólo tira más allá de un radio (atracción con smoothstep de la distancia), un ascenso vertical, una vida por partícula (renace en una esfera alrededor del objetivo: orbita en un Lissajous 3D, fijo abajo, o uno de 6 emisores que deambulan cuando no hay objetivo, porque un flujo sin divergencia mantiene uniforme una nube uniforme y los filamentos nacen de dónde se emite). Dibujo con `OrbitCamera` que gira con el reloj de la capa: cada partícula es un trazo corto en la dirección de su velocidad, ponderado por profundidad (más cerca, más brillo), por edad (aparece y se apaga) y por una autosombra leída de la densidad proyectada hacia una luz (relieve); una pasada de desenfoque suave y tono logarítmico contra la densidad media donde hay humo (lee igual a cualquier número de partículas o resolución). Pincel «Bocanada».

**Fuentes.** Bridson, Hourihan y Nordenstam (2007); The Spirit (MIT, © 2015 Edan Kwan) como referencia de la idea; Perlin (2002). No se copió código.

**Tiempo.** `continuo`; el ruido se desliza sin repetirse y el humo se renueva. Calentamiento 60 pasos.

| Preset | Composición | Usos | Cambio mín. (def) | Ocupación (def) |
|---|---|---|---|---|
| `espiritu` | el objetivo orbita y deja una estela que se enrosca en volutas: una figura de humo que vuela por el cuadro | arte/figuras, arte/organicas | 1,60 % | 7–34 % |
| `fumarola` | foco fijo abajo y ascenso: columna que sube, se ensancha y se deshilacha | arte/organicas, arte/figuras | 0,98 % | 3–22 % |
| `nebulosa` | 6 emisores en un volumen amplio, rizos grandes, flujo lento: nubes con bordes de filamento que llenan el lienzo | fondos/espacio, arte/organicas | 9,00 % | 38–72 % |
| `seda` | rizos pequeños, flujo rápido, trazos largos: hebras que se cruzan | arte/organicas | 4,79 % | 20–39 % |

(`seda` no llena el lienzo: se quitó de fondos.) Mínimo, media y máxima resolución también cambian en todas las muestras (≥ 1,05 %).

**Coste** (Node, 96 filas, carga ≈ 14): 2,8–3,9 ms/paso → 85–116 ms por segundo simulado; calentamiento 197–280 ms; render (proyección, sombra, trazos) 3,1–4,4 ms por cuadro. Con la máquina casi libre y versiones previas de los presets: 1,5–2,3 ms/paso.

**Pruebas propias:** una nube uniforme sigue uniforme mientras se mueve (el rotacional no tiene divergencia; la misma comprobación falla con un campo que converge, y falla si se rompe el rotacional: se comprobó mutando el signo de un término); con foco fijo y ascenso la columna queda más alta que sin él y toda vida queda en (0, 1]; la cámara gira con t sin tocar el estado.

**Qué la distingue.** `boids` son agentes 2D en un toro con reglas de separación, alineación y cohesión, dibujados como trazos según su rumbo; `fluido` es una rejilla euleriana 2D (Navier–Stokes con proyección de presión) que transporta tinta. `humo` no resuelve dinámica: son partículas lagrangianas 3D en un campo procedimental sin divergencia, vistas con una cámara en perspectiva que orbita, con peso por profundidad y autosombra: volutas con volumen y relieve, no manchas planas. Tampoco es `nubes_vol` (nubes analíticas por trazado de rayos, sin partículas ni filamentos).

---

## C-05 «Cámara de niebla» (`niebla`)

**Mecanismo.** Fuerza de Lorentz con frenado: dv/dt = (qB/m)·(v_y, −v_x) − γ·v, integrada con 3 subpasos por paso (giro exacto de la velocidad por el campo, luego el frenado). La pérdida crece al frenarse (γ·(1 + c/(v + ε)), como la ionización), así que las espirales se cierran deprisa al final. Especies: electrones y positrones, alfas (carga 2, pesadas, cortas, gruesas y más brillantes al final, con rayos delta), muones (rápidos, casi rectos) y fotones invisibles que, tras una distancia al azar, se convierten en un par electrón-positrón abierto en V. Entran por los bordes, desde arriba o desde una fuente interior, a un ritmo por segundo (Bernoulli por paso). Las trazas se dibujan como gotas (brillo modulado a lo largo del arco) en un búfer que se desvanece exponencialmente y se difunde un poco cada 6 pasos, con una niebla de gotas sueltas. Pincel «Ráfaga».

**Fuentes.** Radiant · Spark Chamber (MIT, © 2025 Paul Bakaus; idea), C. T. R. Wilson (1912), Anderson (1933). No se copió código.

**Tiempo.** `continuo`. Calentamiento 90 pasos (3 s) para que ya haya trazas.

| Preset | Composición | Usos | Cambio mín. (def) | Ocupación (def) |
|---|---|---|---|---|
| `burbujas` | campo medio-alto, electrones de energía alta que entran por los bordes y se enroscan en espirales | terminal/consola, arte/curvas | 4,73 % | 41–90 % |
| `cosmicos` | campo débil, muones desde arriba casi rectos y algún electrón que se curva | terminal/consola, fondos/espacio | 2,05 % | 25–84 % |
| `pares` | casi todo fotones que se convierten en uves que se enroscan en sentidos opuestos | terminal/consola, arte/curvas | 6,25 % | 48–84 % |
| `fuente` | una fuente interior dispara alfas cortas en todas direcciones con rayos delta | terminal/consola | 2,18 % | 15–37 % |

(La ocupación cuenta también la niebla tenue de fondo, de ahí los máximos altos.) Con celdas de 16 px (≈ 80 × 28) las trazas se leen como cadenas de `+ * =`: por eso `terminal/consola`.

**Coste** (Node, 80 filas, carga ≈ 14): 0,07–0,23 ms/paso → 2–7 ms por segundo simulado; calentamiento ≤ 41 ms; render 0,9–1,9 ms.

**Pruebas propias:** sin frenado, un electrón describe una vuelta de radio v/ω y vuelve cerca de su inicio; con frenado su velocidad baja en cada paso hasta morir (la espiral se cierra); un fotón se convierte en un par de cargas opuestas con direcciones abiertas.

**Qué la distingue.** No hay en GLYPHOS trazas de partículas cargadas: `campos_em` dibuja líneas de campo de cargas fijas, `gravedad` órbitas N-cuerpos, `atractor` el flujo de Lorenz; los patrones `lluvia`/`estrellas` son analíticos. Aquí cada traza es la historia de una partícula: espirales que se cierran, rectas que cruzan, uves de pares y gotas que se borran.

---

## C-09 «Orden y caos» (`orden_caos`)

**Mecanismo.** Partículas con sitio en una red cuadrada o hexagonal (`Separación` y `Red` reconstruyen la corrida). Cada una tiene un estado de fusión m que se acerca (≈ 0,3 s) al calor del frente en su sitio: barrido de ida y vuelta (onda triangular suavizada, nunca se queda mucho en un extremo), cristal que crece desde el centro y se funde hacia él, o banda caliente que cruza. Ordenada: muelle amortiguado hacia su sitio y temblor térmico. Fundida: la llevan las corrientes de ψ' = ψ·b, con ψ un ruido de gradiente 3D (x, y, t) y b → 0 en las paredes (el flujo corre paralelo a ellas); se integra con paso de punto medio, porque el de Euler (con la velocidad relajándose hacia el flujo) acumulaba partículas en las zonas de estiramiento y dejaba huecos: en un barrido de 60 s, el coeficiente de variación² de la densidad en 32 casillas llegaba a 1,26; con el punto medio y todo fundido queda en 0,04–0,10 (Poisson: 0,04), y en el mismo barrido en ≤ 0,46 (lo que queda viene de las partículas fundidas que cruzan la zona aún cristalina). Dibujo: trazo según la velocidad (más largo fundida), brillo por velocidad (cristal tenue, flujo brillante) y enlaces entre vecinos ordenados y cercanos que se rompen y se vuelven a cerrar. Pincel «Calor».

**Fuentes.** Radiant · Phase Transition (MIT, © 2025 Paul Bakaus; idea), Bridson et al. (2007). No se copió código.

**Tiempo.** `continuo`: el frente recorre su ciclo y el flujo no se repite. Calentamiento 30 pasos.

| Preset | Composición | Usos | Cambio mín. (def) | Ocupación (def) |
|---|---|---|---|---|
| `fusion` | red cuadrada que un frente recto funde de izquierda a derecha y reordena a la vuelta | arte/geometricas, fondos/geometricas | 10,75 % | 65–72 % |
| `radial` | panal que cristaliza desde el centro y se funde hacia él | arte/geometricas, fondos/geometricas | 11,76 % | 66–86 % |
| `onda` | banda caliente en diagonal que cruza una red cuadrada fina y la deja entera detrás | arte/geometricas, fondos/geometricas | 5,90 % | 71–75 % |

**Coste** (Node, 80 filas, carga ≈ 14): 0,37–0,39 ms/paso → 11–12 ms por segundo simulado; calentamiento ≤ 76 ms; render (enlaces y trazos) 1,7–2,1 ms.

**Pruebas propias:** el frente funde lo que deja atrás y, a la vuelta, la red vuelve a su sitio (< 0,3 separaciones); la rigidez decide cuánto se apartan con el temblor; nadie sale del dominio con el flujo fundido.

**Qué la distingue.** Lo cercano: patrones `rejilla`, `hex`, `cuadros` (redes estáticas), `wfc` (teselas por restricciones), `boids`/`fluido`. Aquí la red es de partículas: se ve un cristal de glifos (puntos y enlaces `- | + :`) que un frente funde en corrientes brillantes y que se recompone partícula a partícula en su sitio.

---

## Cambios compartidos que harían falta (no hechos)

1. **Color propio para familias raster.** El motor sólo admite color por celda en analíticas (`FC_<id>`, `cpuColor`). `ecos` ganaría mucho con un búfer RGB (giro de tono dentro del bucle, aberración cromática acumulada como en las referencias) y `humo` con color por temperatura o edad. Haría falta: `RasterView` con canales rgb opcionales (o una textura RGBA), `FamilyMeta.color` válido también para raster, `famRaster` devolviendo `vec4` en GLSL y su gemelo en `families/basic.ts` (`col`). Alternativa usada: luminancia y la paleta de la pieza.
2. **Página QA (`dev/familias.ts`) y presupuesto de recuperación.** Los motores fijos recuperan como mucho 2500 ms por render (`catchupBudget`). Con la máquina cargada, `ecos` y `humo` a t = 120 s no llegan y la captura muestra un estado anterior (marcado `partial` en el anfitrión, pero la página no lo dice). Propuesta: que la página QA use un presupuesto mayor o muestre `partial`. Alternativa usada: el aspecto a largo plazo se comprobó también en Node (raster de 600 s en la sonda y vistas previas de celdas a 120–300 s).
3. (Opcional) Un modo de glifo «cresta» para trazas finas: el modo `lines` actual elige el glifo por el gradiente de Sobel y en una línea de una celda deja el centro en blanco (bordes dobles). Serviría para `niebla` y los anillos de `ecos`.

## Lo que no quedó resuelto (con evidencia)

- **Coste bajo carga.** Con la máquina compartida (carga 9–18) la sonda temporal registró picos de 122 ms por 0,5 s en `ecos/espejos` y 222 ms en `ecos/marea` (72 filas), y 149 ms en `humo/nebulosa` (96 filas): 244, 444 y 298 ms por segundo simulado en esos picos, por encima del objetivo de 250 ms. La medida dedicada (300 pasos seguidos, misma carga) da 63–117 ms por segundo en todos los presets, y con la máquina libre bastante menos; los picos parecen de la contención, pero no pude repetir la sonda con la máquina libre. En la resolución máxima (144 filas) `ecos` cuesta unas 4 veces más (hasta 358 ms por 0,5 s bajo carga): es una opción de quien la sube, no el valor por defecto.
- **Aspecto.** Revisado en capturas, pero hay presets más débiles: `niebla/fuente` es escaso (15–37 % de ocupación, la fuente queda a un lado); `humo/fumarola` y `humo/espiritu` son figuras que ocupan poco del cuadro (por diseño: arte/figuras, no fondos); en `ecos/espejos` y `ecos/tunel` los tonos medios de la historia se leen con el color medio de la paleta y dan un velo; en `orden_caos` la fase fundida es un enjambre de trazos que puede resultar cargado. En glifos, las trazas de `niebla` (1–2 celdas de ancho) dependen del tamaño de celda: a 10 px se leen tenues, a 16 px bien.
- **`ecos` con espejo de 6 gajos** no es simétrico izquierda-derecha en un cuadro 16:9 (es la simetría D3, correcta); para un cuadro apaisado se usa el de 8 en el preset.
- **Commits intermedios.** Los commits de `humo` y `niebla` añaden sus metadatos al grupo pero la entrada de `load.ts`/`docs.ts` llegó en el commit de `orden_caos`: la batería sólo está en verde desde `0a71868` en adelante (HEAD en verde).
