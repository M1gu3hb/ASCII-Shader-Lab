# Cierre del PR #10 · grupo «campos»: campos y relieve

Fecha: 12 de octubre de 2026. Rama del worktree: `worktree-agent-afb2121545a0b9f27`.

**Base.** El worktree se creó sobre `main` (`deb3d87`), no sobre la rama del PR. Antes de trabajar se avanzó la rama, con `git merge --ff-only`, hasta `16ca1f4`, la cabeza de `claude/new-session-7hc315` con el commit del motor. `deb3d87` es antecesor de `16ca1f4`, así que no se perdió nada.

**Commits del grupo:**

- `42546d9`: las seis familias, primera versión;
- `f789ebc`: ajuste visual en ASCII y pruebas de mecanismo;
- el commit de este informe: capturas, informe y dos ajustes de catálogo de `cuerdas` (usos de «Arpa en arpegio» y `figure`).

## Resumen

Las diez filas del encargo están **implementadas y verificadas** con código, pruebas y capturas. Se hicieron con **seis familias nuevas**, una por mecanismo. Ninguna toca un patrón clásico ni un preset publicado: todas declaran `extends`.

| Filas | Familia (id) | Tipo | Extiende | Presets |
|---|---|---|---|---|
| I-01, I-31 | `flujo_ruido` «Líneas de flujo» | simulación raster (memoria) | `campo_flujo` | 5 |
| I-03 | `cuerdas` «Cuerdas vibrantes» | analítica (luminancia, K2/K3) | `catenaria` | 4 |
| I-06 | `grietas_oro` «Grietas de oro» | analítica de color (K2) | `grietas` | 4 |
| I-10, I-11, I-33 | `seda` «Seda especular» | analítica de color (K2/K3) | `mareas_lentas` | 5 |
| I-16 | `metal_fundido` «Metal fundido» | analítica de color | `marmol` | 5 |
| I-34, I-35 | `jade_ruido` «Jade de ruido» | analítica de color (K2) | `jade_vivo` | 4 |

**Archivos comunes.** Cada familia tiene `src/families/meta/<id>.ts` y `<id>.doc.ts`. El código está en `src/families/sims/flujo_ruido.ts` o en `src/families/analytic/<id>.ts` + `<id>.cpu.ts`. Las entradas se añadieron al final de:

- `meta/fisica.ts`, `meta/forma.ts`, `meta/materia.ts` y `meta/ciencia.ts`;
- `load.ts`, `analytic/glsl.ts` y `docs.ts`;
- `index-data.ts`, regenerado con `npx tsx scripts/families-index.ts`.

La biblioteca, la búsqueda (con `aka`) y los controles las recogen por `uses`. No hizo falta tocar `src/studio/presets.ts` ni `src/random/`.

**Paridad entre los dos motores.** Se midió con `scripts/families-qa.mjs --compare` sobre los 27 presets, en el puerto 5301:

| Familia | Correlación de luminancia (`r`) | Glifos iguales | `r` de color |
|---|---|---|---|
| `flujo_ruido` | 1,0000 | 100 % | — |
| `cuerdas` | 1,0000 | 100 % | — |
| `jade_ruido` | 1,0000 | ≥ 99,9 % | 1,0000 |
| `seda` | ≥ 0,9995 | ≥ 99,1 % | ≥ 0,9998 |
| `grietas_oro` | ≥ 0,9993 | ≥ 99,6 % | ≥ 0,9996 |
| `metal_fundido` | ≥ 0,9993 | ≥ 97,4 % | ≥ 0,9979 |

La diferencia de `metal_fundido/iris` y de `metal_fundido/oro` viene de la triple deformación: float32 en la GPU frente a float64 en la CPU.

---

## I-01 + I-31 · «Mejora de campo_flujo» → `flujo_ruido` «Líneas de flujo»

**Mecanismo.** Hasta 3000 partículas avanzan en cada paso (30 por segundo) con el ángulo θ = dirección + 2π·enredo·N(p, t).

- N es un ruido de gradiente 3D con semilla: permutación propia, desvanecimiento quíntico y doce gradientes. Tiene una octava extra opcional.
- Su retícula es periódica en x e y, con «Remolinos» celdas por alto. El lienzo se repite sin costura (`wrap: 'repeat'`) y las partículas viven en un toro.
- La tercera coordenada del ruido es el tiempo («Cambio del campo»).

Cada paso deposita tinta bilineal a lo largo del tramo recorrido sobre un lienzo flotante. Ese lienzo **sólo se desvanece**: cada píxel conserva e^(−dt/«Estela») por paso, y esa es la memoria real de la estela. Cada partícula vive «Vida» segundos y renace en otro sitio, con una entrada suave.

**Vista.**

- La exposición se calcula contra la media de tinta donde hay tinta, y se cortan las colas tenues. Así un trazo se lee como línea que termina, no como bruma.
- «Grosor» sólo difumina la vista; el estado no cambia.
- La tinta por paso se normaliza por partículas y estela, de modo que ningún ajuste se queda vacío ni se satura.
- Tiene un pincel «Tinta», que suelta partículas a lo largo del trazo.

**Diferencia visible con `campo_flujo`.** `campo_flujo` dibuja senos regulares y paralelos. Aquí las líneas se rizan, se anudan y forman ríos donde el campo converge. Cambian con el ruido y dejan estela.

**Controles (11).** Partículas, Remolinos, Enredo, Detalle, Velocidad, Estela, Cambio del campo, Vida, Dirección, Grosor y Tinta. Todos tienen efecto: lo comprueba la batería genérica.

**Presets.** Contrato `continuo` en todos.

| id | Nombre | Usos | Qué muestra |
|---|---|---|---|
| `enredo` | Enredo denso | fondos/organicas | red de líneas anudadas |
| `filamentos` | Filamentos largos | fondos/organicas, arte/organicas | pocas partículas, tinta larga: estilo topología |
| `viento` | Viento suave | fondos/ondas, fondos/organicas | enredo 0,22: corrientes casi paralelas |
| `remolinos` | Remolinos lentos | fondos/organicas | un remolino por alto, trazo grueso |
| `tinta` | Tinta en papel | fondos/organicas, arte/organicas | paleta invertida: plumilla oscura sobre papel |

**Presupuesto.**

- Filas: 48–144, con 96 por defecto.
- Calentamiento: 150 pasos, es decir, 5 s ya dibujados en el primer cuadro.
- Coste medido en Node: entre 0,5 y 1,5 s por 35 s simulados a 96 filas, con la máquina compartida.

**Pruebas.** `tests/unit/family-flujo_ruido.test.ts`, 5 pruebas:

1. cada partícula avanza en la dirección del campo en su punto: error de 0,01 rad como máximo;
2. sin partículas que pasen, cada píxel conserva exactamente e^(−k·dt/estela), y nunca menos;
3. una estela larga tiene más de 1,8 veces más píxeles con tinta que una corta;
4. el campo cambia con el tiempo, y con «Cambio» a 0 no cambia; es periódico en el dominio, con un error menor que 1e−9;
5. «Enredo denso» gira en todas las direcciones (dispersión circular mayor que 0,6) y «Viento suave» casi no (menor que 0,15).

**Fuentes.**

- Radiant `static/flow-field.html`: MIT·R, con ruido «basado en Stefan Gustavson».
- Vanta `src/vanta.topology.js`: MIT·V, «Original effect by Kjetil Midtgarden Golid» (p5ycho, MIT verificado). Usa `vendor/p5.min.js`, que aquí no se usa.
- Ruido de gradiente mejorado de Perlin.

No se copió código.

**Capturas.**

- WebGL: `img/campos/flujo_ruido-enredo-webgl.png`
- básico: `img/campos/flujo_ruido-tinta-basico.png`

**Decisión de color.** La familia da luminancia y la colorea la paleta (los trazos frescos, en el extremo claro). No implementa `renderColor`, por un hallazgo del motor que se explica al final.

## I-03 · «Mejora de catenaria» → `cuerdas` «Cuerdas vibrantes»

**Mecanismo.** Cuerdas verticales sujetas por sus dos extremos. Una cuerda pulsada en la fracción p de su largo toma la forma triangular cuya serie de senos es Σ aₙ·sin(nπs), con aₙ = 2·sin(nπp)/(n²π²·p(1 − p)).

- Se suman de 1 a 4 modos. Cada uno vale aₙ·sin(nπs)·cos(ωₙτ)·e^(−γₙτ): es la **envolvente**, que apaga antes los agudos.
- «Rigidez» introduce inarmonicidad: ωₙ = n·ω₁·√(1 + B·n²).
- Cada cuerda se pulsa una vez por ciclo («Pulsación»: arpegio, acorde o alternas). Es el **pellizco periódico que decae**.
- En los últimos instantes del ciclo el dedo vuelve a tensar la cuerda hasta la forma del pulso, así que soltarla no es un salto.
- Las líneas se dibujan por distancia perpendicular, usando la derivada exacta.
- «Estela» añade el velo de larga exposición: la banda que barre la cuerda, más clara en los extremos.
- Hay **polvo de resina opcional**: ocho motas por pulso salen del punto de pulsación, derivan, caen y se apagan.
- «Afinación» acorta y agudiza las cuerdas de la derecha, con la silueta de un arpa. Las clavijas, el puente y el mástil también son campo analítico.

**Diferencia visible con `catenaria`.** La catenaria son curvas tendidas y quietas. Aquí las cuerdas vibran con modos que se ven y se apagan, en arpegio.

**Tiempo.** Bucle exacto: cada cuerda sólo depende de τ = mod(t − tᵢ, «Ciclo»). Hay 15 parámetros (K2 y K3).

**Presets.** Contrato `bucle` en todos, con `period` igual a «Ciclo».

| id | Nombre | Usos | Periodo |
|---|---|---|---|
| `arpa` | Arpa en arpegio | arte/geometricas | 6 s |
| `acorde` | Acorde rasgueado | arte/geometricas | 4 s |
| `grave` | Cuerda grave | arte/geometricas | 8 s |
| `armonicos` | Armónicos alternos | fondos/geometricas, arte/geometricas | 5 s |

Con «Separación» menor que 1,6, la familia es figura (`figure`). Los presets estrechos no se ofrecen como fondo.

**Pruebas.** `tests/unit/family-cuerdas.test.ts`, 6 pruebas:

1. al soltarla, la forma es exactamente la serie del triángulo, con el pico en p;
2. pulsada en el centro, los armónicos pares se anulan y la forma es simétrica;
3. cambia de signo en medio periodo del fundamental, la envolvente se apaga y los agudos mueren antes;
4. bucle exacto en los cuatro presets (MAD menor que 1e−6) y distinto entre medias;
5. no hay salto al soltar;
6. la resina aparece al pulsar y desaparece después.

**Fuentes.** Radiant `static/resonant-strings.html` (MIT·R), la ecuación de onda y la inarmonicidad.

**Capturas.**

- WebGL: `img/campos/cuerdas-arpa-webgl.png`
- básico: `img/campos/cuerdas-acorde-basico.png`

## I-06 · «Mejora de grietas» → `grietas_oro` «Grietas de oro»

**Mecanismo.** Las grietas son bordes de Voronoi (F2 − F1) sobre un plano deformado por fBm, como en el patrón `grietas`, a dos escalas: grandes y finas.

**Contrato elegido: bucle.** En cada ciclo las grietas aparecen, brillan y se cierran:

1. Un frente sale de un origen (centro, izquierda, abajo o al azar), deprisa al principio: el radio crece como fase^0,62.
2. Cada borde se abre cuando el frente lo alcanza, un poco antes o después según un hash de las dos placas que separa («Desorden»). Así las grietas **aparecen y crecen desde el origen**.
3. La junta abierta se llena de metal fundido con su rampa de calor propia (oro, cobre, plata o lava): blanca justo detrás del frente y enfriándose después.
4. El metal se ensancha con la edad y **sangra** en la piedra: un resplandor cuyo alcance crece con «Sangrado».
5. Las grietas finas se abren más tarde.
6. Del metal caliente sube **polvo** de chispas.
7. Al final del ciclo las juntas se enfrían y se cierran.
8. En los últimos instantes se concentra en el origen el resplandor del golpe siguiente, así que el empalme es continuo.

Con «Trazado nuevo cada ciclo» cada ciclo abre otra red desde otro origen. Entonces el contrato es `continuo`: lo declara `caps.time` por parámetro.

La piedra toma la paleta de la pieza y el metal, su color propio. Si la pieza usa el color de la paleta, sólo cuenta la luminancia.

**Diferencia visible con `grietas`.** En `grietas` la red es fija y no tiene relleno. Aquí las grietas se abren desde un punto, se llenan de metal incandescente y se cierran.

**Presets.**

| id | Nombre | Usos | Contrato |
|---|---|---|---|
| `kintsugi` | Oro que sangra | fondos/organicas, arte/organicas | bucle de 14 s |
| `brasa` | Tierra en brasa | fondos/organicas | continuo (trazado nuevo) |
| `porcelana` | Porcelana rota | arte/organicas, fondos/organicas | bucle de 20 s |
| `cobre` | Grietas de cobre | fondos/organicas | continuo (trazado nuevo) |

**Pruebas.** `tests/unit/family-grietas_oro.test.ts`, 6 pruebas:

1. el número de juntas abiertas y su alcance desde el origen crecen fase a fase, y al principio sólo hay juntas cerca del origen;
2. desde la izquierda, el frente avanza hacia la derecha;
3. el metal recién abierto es más blanco que el viejo (azul/rojo mayor que 1,3×);
4. con «Sangrado», la piedra junto a las juntas brilla más;
5. al final del ciclo no queda ninguna junta abierta (salvo el golpe en el origen) y el bucle es exacto en luminancia y color;
6. con «Trazado nuevo», el contrato es `continuo`, la red cambia entre ciclos y a la misma fase está igual de abierta.

**Sonda temporal.** La primera versión tenía un tramo muerto al empezar cada ciclo: el cambio era 0 entre t = 0 y t = 1 s. Se corrigió con el golpe y el frente rápido. Ahora el cambio a t = 1 s está entre 1,0 y 7,5 según el preset.

**Fuentes.** Radiant `static/gilded-fracture.html` (MIT·R) y el ruido celular de Worley.

**Límite declarado.** El Voronoi usa la vecindad de 3 × 3 sobre el plano deformado, no la de 5 × 5 de la referencia. La deformación se aplica al punto de consulta, no a los puntos semilla, así que 3 × 3 basta.

**Capturas.**

- WebGL: `img/campos/grietas_oro-kintsugi-webgl.png`
- básico: `img/campos/grietas_oro-porcelana-basico.png`

## I-10 + I-11 + I-33 · «Mejora de mareas_lentas» → `seda` «Seda especular»

**Mecanismo.** Una sola familia analítica de color con un parámetro de modo («Superficie»). El campo de altura son pliegues dirigidos: tres ondas a través de una dirección, cuyas fases se doblan despacio a lo largo de ella, que serpentean con un ruido, más detalle fBm. Se ilumina por su normal, tomada a escala de celda para no generar ruido por aliasing.

- **«Seda» (I-10).** Blinn–Phong: un brillo nítido y un velo ancho.
- **«Cascada» (I-11).** Brillo anisótropo de Kajiya–Kay sobre los hilos que cruzan los pliegues.
  - Un ruido de fibra desplaza la tangente a lo largo de la normal, y así salen las **vetas**. Tiene un segundo lóbulo teñido.
  - Admite hasta **tres capas translúcidas**: la primera es la sábana y las de delante son cintas. Cada capa es más grande y más rápida que la de detrás (**paralaje**).
- **«Olas facetadas» (I-33).** Un mar visto desde una cámara en perspectiva.
  - El rayo de cada celda encuentra la superficie desplazada con tres pasos de punto fijo.
  - Se sombrea triángulo a triángulo (normal plana de la retícula) con la reflexión de Phong.
  - Hay bruma hacia el horizonte y cielo arriba.

«Facetas» corta cualquiera de los tres modos en triángulos planos. Los colores salen de la paleta de la pieza y el glifo, de la luz.

**Diferencia visible con `mareas_lentas`.**

- `mareas_lentas` son franjas de seno sin luz.
- «Seda» tiene brillo especular que resbala por los pliegues.
- «Cascada» tiene vetas anisótropas y velos translúcidos que se desplazan a distinta velocidad.
- «Olas facetadas» es una superficie en perspectiva con caras planas iluminadas.

**Parámetros (14, con K2/K3).** Superficie, Pliegues, Dirección, Relieve, Velocidad, Detalle, Brillo, Lustre, Luz, Capas, Paralaje, Facetas, Inclinación y Ondulación.

**Presets.** Contrato `continuo` en todos: llenan el lienzo.

| id | Nombre | Usos |
|---|---|---|
| `seda` | Seda que respira | fondos/materia, fondos/ondas |
| `cascada` | Cascada de seda | fondos/materia |
| `olas` | Olas facetadas | fondos/ondas |
| `saten` | Satén facetado | fondos/geometricas, fondos/materia |
| `velos` | Velos de seda | fondos/materia |

**Pruebas.** `tests/unit/family-seda.test.ts`, 5 pruebas:

1. Blinn: sin brillo, la luz nunca pasa del máximo difuso, y con brillo hay celdas por encima de 0,9; sin relieve, un único tono;
2. anisotropía: en una sábana plana, el brillo de Kajiya–Kay depende de si la luz llega a lo largo o a través de los hilos (más de 0,15), mientras que el de Blinn no varía (menos de 1e−9);
3. las capas son cintas: cambian entre el 12 % y el 85 % del lienzo, no todo;
4. con facetas, la luz es constante dentro de cada triángulo (más del 95 % de los pares);
5. olas: las filas de arriba son cielo quieto y las de abajo, mar que se mueve.

**Fuentes.**

- Radiant `static/silk-groove.html` y `static/silk-cascade.html` (MIT·R).
- Vanta `src/vanta.waves.js` (MIT·V).
- Kajiya y Kay (1989) y el modelo de Blinn–Phong.

**Capturas.**

- WebGL: `img/campos/seda-seda-webgl.png`
- básico: `img/campos/seda-olas-basico.png`

**Límites.** El mar no tiene oclusión entre olas ni sombras. Las facetas lejanas pueden quedar por debajo de una celda, y la bruma las suaviza.

## I-16 · «Mejora de marmol» → `metal_fundido` «Metal fundido»

**Mecanismo.**

- **Altura:** el fBm de `marmol` deformado **tres veces** seguidas (q → a(q) → b(q + a) → c(q + b) → h(q + c)), más **metabolas**. Las metabolas son Σ r²/d² con un domo x(2 − x), donde x = 1 − 1/Σ: se redondean y se funden entre ellas.
- **Normal:** a escala de celda.
- **Reflejo:** la mirada reflejada se lee en un estudio, girado por «Luz». Lo que mira al espectador refleja la sala oscura; las pendientes hacia arriba, el cielo y una caja de luz; las pendientes hacia abajo, una franja clara.
- **Luz principal:** brillo de Blinn.
- **Fresnel de Schlick:** el reflejo se tiñe con la reflectancia F0 del metal (oro, plata o cobre, por paleta propia) y tiende a blanco en los bordes rasantes. «El de la paleta» toma la reflectancia de la paleta de la pieza.

**Diferencia visible con `marmol`.** `marmol` son vetas planas. Aquí hay relieve metálico con brillos que corren, gotas y color de metal propio.

**Presets.** Contrato `continuo` en todos.

| id | Nombre | Usos |
|---|---|---|
| `oro` | Oro fundido | fondos/materia, arte/organicas |
| `plata` | Plata líquida | fondos/materia, arte/organicas |
| `cobre` | Cobre batido | fondos/materia |
| `marea` | Marea de oro lenta | fondos/materia |
| `iris` | Metal de la paleta | arte/organicas, fondos/materia |

**Pruebas.** `tests/unit/family-metal_fundido.test.ts`, 4 pruebas:

1. en el centro de una gota sube un domo (más de 0,3) y lejos de las gotas no cambia nada (menos de 0,01);
2. con más relieve, la luz varía más (desviación estándar 1,3× mayor);
3. cada metal tiene su tinte (oro rojo > verde > azul, plata casi gris, cobre más rojo que el oro) y la paleta no cambia el oro, pero sí «El de la paleta»;
4. el metal fluye con el tiempo.

**Fuentes.** Radiant `static/liquid-gold.html` (MIT·R), el *domain warping*, Schlick y Blinn–Phong.

**Capturas.**

- WebGL: `img/campos/metal_fundido-oro-webgl.png`
- básico: `img/campos/metal_fundido-plata-basico.png`

## I-34 + I-35 · «Mejora de jade_vivo» → `jade_ruido` «Jade de ruido»

**Mecanismo.** Una esfera trazada por distancia con signo: |q| − R − A·D(q), escalada por 0,6. Se busca dentro de una esfera envolvente con 44 pasos como mucho y una normal de cuatro muestras.

- **D:** un ruido 3D **periódico en el tiempo**. Sus dos octavas recorren círculos en el espacio del ruido, una vuelta por ciclo, de modo que la piel se empuja **a lo largo de la normal**.
- **Torsión en Y:** el espacio del ruido gira alrededor de Y un ángulo a·sin(y·f + fase).
- **Respiración:** R·(1 + b·sin 2θ).
- **Color:** una **paleta de cosenos indexada por el desplazamiento** (jade, iridiscente, magma u océano), o la paleta de la pieza recorrida de ida y vuelta.
- **Luz:** difusa envolvente, Phong y borde de Fresnel.
- «Giro» da vueltas enteras por ciclo.

**Diferencia visible con `jade_vivo`.** `jade_vivo` son ondas senoidales sobre la esfera, de un solo color. Aquí es una superficie de ruido que se retuerce y respira, con color por relieve.

**Tiempo.** Bucle exacto de «Ciclo» segundos: todo depende de θ = 2πt/«Ciclo» con vueltas enteras. Es una figura (`figure: true`) y tiene 12 parámetros (K2).

**Presets.** Contrato `bucle` en todos.

| id | Nombre | Usos | Periodo |
|---|---|---|---|
| `jade` | Jade que respira | arte/figuras | 12 s |
| `iris` | Burbuja iridiscente | arte/figuras, arte/optica | 10 s |
| `magma` | Corazón de magma | arte/figuras | 16 s |
| `oceano` | Gota de océano torcida | arte/figuras | 14 s |

**Pruebas.** `tests/unit/family-jade_ruido.test.ts`, 5 pruebas:

1. sin relieve, la silueta es un círculo (dispersión menor que 0,01); con relieve, no (más de 0,04);
2. la torsión es exactamente el ruido evaluado en el espacio girado a·sin(y·f + fase), y cambia la figura;
3. el color sigue al desplazamiento: con «Color por relieve» a 0 hay un solo tono;
4. la respiración cambia el tamaño más de un 12 % a lo largo del ciclo;
5. bucle exacto en luminancia y color en los cuatro presets.

**Fuentes.**

- Codrops WebGLBlobs (MIT, «Copyright (c) 2009 - 2020 Codrops»; `package.json` dice ISC). No se usa la fuente Typekit ni `img/noise.png`.
- ShaderGradient `src/shaders/defaults/sphere` (MIT según README y `package.json`, sin archivo LICENSE).
- La paleta de cosenos de Inigo Quilez.

No se copió código.

**Capturas.**

- WebGL: `img/campos/jade_ruido-iris-webgl.png`
- básico: `img/campos/jade_ruido-jade-basico.png`

**Límite.** El ruido es de valor (`noise3` del núcleo), no Perlin: con mucho grano se notan algo los ejes. Es una figura: no llena el lienzo.

---

## Pruebas corridas (resultado real)

- `npx tsc --noEmit`: sin errores.
- `npx vitest run --maxWorkers=2` sobre:
  - las seis pruebas de mecanismo;
  - `tests/unit/families.test.ts`, entera, con todas las familias;
  - `families-compat.test.ts`, `families-index.test.ts` y `family-contracts.test.ts`.

  Resultado: **10 archivos y 407 pruebas superadas, 0 fallos** (159 s). Después, con el último ajuste de `cuerdas` (usos y `figure`), se repitió `families.test.ts -t "familia cuerdas "`: 4 de 4.
- Fallos encontrados por el camino y corregidos:
  - controles sin efecto: «Luz» de −180 a 180 da el mismo ángulo en los extremos, así que el rango pasó a ±160; «Tono» de 0 a 1 es la misma vuelta del coseno, así que el rango pasó a 0–0,9; el «Metal» de las grietas no cambiaba la luminancia; las «Capas» de la seda caían fuera del lienzo por un desplazamiento de ruido;
  - el «Brillo» del jade era demasiado débil para la prueba de controles.
- Sonda temporal: `node .cache/ft-campos.mjs --ids=… --times=0,1,30,60,120 --long=600`, guardada en `.cache/ft-campos*.json` (sin versionar). Todos los presets cambian desde el primer segundo y a 30, 60, 120 y 600 s, sin vaciarse ni saturarse:
  - flujo: tinta entre el 20 % y el 84 %, cambio entre 1 y 10 por medio segundo, estable a 600 s;
  - metal y seda: cambio sostenido;
  - cuerdas y jade: bucles exactos, de modo que los valores a 600 s repiten los del ciclo;
  - grietas: véase la sección I-06.
- QA en el navegador (Chromium con SwiftShader, `--big`): cada preset se revisó a ojo en WebGL; en el motor básico, al menos uno por familia (los de las capturas, más «Cuerda grave» y «Arpa en arpegio»), y la paridad de los 27 se midió con `--compare`. 0 errores de consola propios. Los 403 son de fuentes externas bloqueadas por la red de la máquina.

## Hallazgo para el responsable de la integración

**Rasters de color en WebGL.** El contrato de 16ca1f4 está incompleto: `isColorFamily` (`src/families/registry.ts`) sólo es verdadero para las familias **analíticas**, y la prueba de índice lo fija así. Sin embargo, `buildFieldShader` (`src/engine/glsl/programs.ts`) decide con `isColorFamily(id)` si una capa raster lee `famRasterC` y si entra en el bloque de color (`SC`, `tint`).

En consecuencia, una familia raster con `color: true` y `renderColor`:

- en el motor básico se colorea (`families/basic.ts`);
- en WebGL se sube como textura RGBA (`engine.ts`), pero el shader la lee con `famRaster`, que toma el canal **rojo** como luminancia, y no aplica el color.

Por eso `flujo_ruido` es de luminancia y paleta. Quien dé color propio a `ecos` y `humo` (§6) tiene que incluir los rasters de color en ese criterio: un `isColorFamily` que valga para cualquier `kind` con `color`, o uno aparte para rasters, en `programs.ts`, `palette.ts` y `families-index.test.ts`. No lo cambié para no chocar con ese grupo.

## Lo que no se hizo

- **Color propio en `flujo_ruido`.** Queda por el hallazgo anterior: hoy saldría distinto en los dos motores.
- **Pruebas e2e y de rendimiento fino.** No se corrieron (§ reglas: máquina compartida).
- **Hardware.** No se probó en GPU real ni en otros navegadores: sólo Chromium con SwiftShader.
- **Inventario y REVISION-PR10.** No se actualizaron (`docs/cambios/revision-pr10/*` y `REVISION-PR10.md`), porque está prohibido para este grupo. La matriz de cierre debe enlazar I-01, I-03, I-06, I-10, I-11, I-16, I-31, I-33, I-34 e I-35 con las familias de este informe.
- **Azar v8.** No se tocó `src/random/`. Las seis familias quedan disponibles por `uses` para que el grupo de Azar las incluya en su instantánea.
