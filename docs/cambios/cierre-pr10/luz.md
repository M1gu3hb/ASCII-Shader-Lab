# Cierre del PR #10 · grupo «luz»

Filas del Anexo 1 que cubre este grupo: **I-02, I-05, I-07, I-08, I-09, I-12, I-13, I-18 e I-21**.

Todas se resuelven con **familias analíticas nuevas**: un fragmento GLSL y su gemelo de CPU línea a línea. Ninguna fila
se resuelve con una receta de capas clásicas, porque ninguna combinación de los patrones existentes daba el mecanismo
pedido. La razón concreta de cada caso va en su fila.

No se cambia ningún patrón clásico ni ningún preset publicado. Las familias son nuevas (versión 1), así que
`tests/unit/families-compat.test.ts` sigue intacto y en verde.

Base: el worktree se creó sobre `deb3d87` (main), que no tenía el commit del motor `16ca1f4`. Antes de empezar se
avanzó la rama en avance rápido hasta `16ca1f4` (`git merge --ff-only`). Todo el trabajo va encima de ese commit.

| Fila | Familia (id) | Grupo | Color por celda | Contrato | Presets |
|---|---|---|---|---|---|
| I-02 | `burbujas` · Burbujas con nucleación (extiende `lluvia_ascendente`) | física | no (paleta) | continuo | 4 |
| I-05 + I-21 | `haces_luz` · Haces de luz (extiende `rayos`) | materia | sí | continuo | 5 |
| I-07 | `mandala_capas` · Mandala de capas (extiende `flor_armonica`) | forma | no (paleta) | bucle exacto | 4 |
| I-08 | `eclipse_total` · Eclipse total (extiende `rayos`) | ciencia | sí | continuo | 4 |
| I-09 | `talla_diamante` · Talla de diamante (extiende `caleido`) | materia | sí | bucle exacto | 4 |
| I-12 | `calor_radiante` · Calor que irradia (extiende `fuego`) | física | sí | continuo | 4 |
| I-13 | `neon_tubos` · Letrero de neón (extiende `forma`) | materia | sí | bucle exacto | 5 |
| I-18 | `vinilo` · Disco de vinilo (extiende `anillos`) | ciencia | sí | bucle exacto | 4 |

En total: **8 familias y 34 presets**. Cada familia tiene de 12 a 14 controles (de los 16 huecos disponibles). La
batería genérica comprueba que cada control cambia la imagen. Cada familia tiene también documentación propia
(`meta/<id>.doc.ts`: qué es, cómo funciona, tiempo, límites, fuentes, una pista por control y por preset) y una
prueba de mecanismo.

## Archivos

Archivos nuevos (por familia):
- `src/families/analytic/<m>.ts`: el GLSL;
- `src/families/analytic/<m>.cpu.ts`: el gemelo de CPU;
- `src/families/meta/<id>.ts`: la ficha;
- `src/families/meta/<id>.doc.ts`: la documentación;
- `tests/unit/family-<id>.test.ts`: la prueba de mecanismo.

Valores de `<m>`: `burbujas`, `haces`, `mandala`, `eclipse`, `diamante`, `calor`, `neon` y `vinilo`.

Registros compartidos (las entradas van al final de cada lista):
- `src/families/load.ts`;
- `src/families/analytic/glsl.ts`;
- `src/families/docs.ts`;
- `src/families/meta/fisica.ts` (burbujas y calor_radiante);
- `src/families/meta/materia.ts` (haces_luz, talla_diamante y neon_tubos);
- `src/families/meta/forma.ts` (mandala_capas);
- `src/families/meta/ciencia.ts` (eclipse_total y vinilo);
- `src/families/index-data.ts` (regenerado con `npx tsx scripts/families-index.ts`).

No se toca `src/studio/presets.ts`: I-07 no se resolvió como receta (véase la fila).

La biblioteca, la búsqueda (`aka`), los controles, las miniaturas, el visor, la exportación y el runtime toman las
familias de esos registros. No hace falta nada más para que aparezcan donde dicen sus `uses`.

## I-02 · Burbujas con nucleación (`burbujas`)

**Mecanismo.**
- Cada uno de los 5 a 8 puntos fijos del fondo (`sites`) suelta burbujas a su propio ritmo. La burbuja k del punto
  i nace en (k − φᵢ)/rᵢ.
- Una celda sólo recorre las burbujas en vuelo de los puntos cuya columna le alcanza.
- Cada burbuja:
  - sube con velocidad creciente (y = y₀ + v·a + ½αa²; las grandes, más deprisa);
  - crece al subir y se bambolea con un seno cuya amplitud crece con su tamaño;
  - deja una estela corta que sigue su propio camino.
- Al llegar a la superficie estalla: un destello, una onda que corre por la superficie hacia los dos lados y tres
  gotitas que saltan y vuelven a caer. Al volver a entrar en el líquido, las gotitas se apagan.
- Una burbuja pequeña es un solo carácter, más claro cuanto mayor es (∘ → ○ → ◎ con el juego geométrico). Una grande
  es un aro con su brillo.
- El líquido brilla un poco; un hilo de burbujas diminutas recorre cada columna y una banda de espuma marca la
  superficie.

**En qué se ve la diferencia con `lluvia_ascendente`.** Las columnas nacen siempre en los mismos puntos. Hay
bamboleo, crecimiento al subir y estallido en la superficie: no son partículas que suben sin origen ni final.

**Presets** (todos con contrato continuo):

| Preset | Nombre | Usos | Cómo es |
|---|---|---|---|
| `champan` | Copa de champán | fondos/materia, fondos/organicas | ámbar, ` ·∘○◎●` |
| `sifon` | Agua con gas | fondos/organicas, fondos/materia | ocho columnas densas y estelas largas |
| `lava_lenta` | Burbujas lentas de miel | fondos/organicas, arte/organicas | burbujas grandes y lentas que estallan con fuerza |
| `espuma` | Cerveza con espuma | fondos/materia, fondos/organicas | corona de espuma alta |

**Prueba** (`tests/unit/family-burbujas.test.ts`, 5 casos):
- todo lo que se enciende está en la columna de un punto fijo, y cada punto suelta burbujas (con 5 y con 8 puntos);
- el perfil de la columna se desplaza hacia arriba (correlación entre dos instantes);
- el estallido sólo cambia cerca de la superficie;
- por encima de la superficie no sube nada;
- la estela queda debajo de cada burbuja.

Validación por mutación: cuatro mutaciones del gemelo hacen fallar la prueba que les corresponde:
- burbujas que bajan;
- estallido a media altura;
- puntos de nucleación que se mueven;
- estela encima de la burbuja.

**Capturas:**
- `img/luz/burbujas-champan.png` (WebGL);
- `img/luz/burbujas-lava_lenta-motores.png` (WebGL | básico).

## I-05 e I-21 · Haces de luz (`haces_luz`): laberinto láser y foco de terciopelo

Las dos filas son una sola familia con dos modos (`mode`), porque comparten el mecanismo: un haz desde un emisor
que barre y una niebla que lo hace visible.

**Mecanismo.**

*Láseres:*
- Emisores fijos en el contorno del cuadro. Los haces son finos y apenas se abren con la distancia.
- Cada haz barre con su propio vaivén.
- La niebla es un fBm que deriva. Un haz se ve tanto como niebla atraviesa: el brillo se multiplica por la
  densidad, así que donde no hay niebla el haz se corta.
- Cada haz tiene su tono, y los tonos giran con el tiempo.
- Donde dos haces se cruzan:
  - la parte común se enciende en blanco: el producto de las intensidades, cero si falta uno;
  - en el punto de cruce de las dos líneas centrales brilla una estrella de rayos. Se calcula por pares, con su
    intersección real.

*Focos:*
- Dos o tres conos anchos cuelgan sobre el borde de arriba y barren.
- Dentro de los conos corren rayos volumétricos a lo largo del cono, con neblina.
- Detrás hay un telón de terciopelo.

*En los dos modos:* las motas de polvo flotan en una rejilla lenta (una por casilla, vagando dentro de ella) y
**sólo se ven donde un haz las ilumina**. Fuera de los haces las mismas motas quedan a oscuras.

**Diferencia.**
- Respecto a `rayos`, que son sectores alrededor de un centro: aquí hay haces finos que entran desde los bordes y
  se cruzan con destellos (I-05).
- Respecto a `nubes_vol:haces`: aquí hay polvo encendido sólo dentro del cono (I-21).

**Presets** (todos con contrato continuo):

| Preset | Nombre | Modo | Usos |
|---|---|---|---|
| `laberinto` | Laberinto láser | láseres | fondos/color, arte/optica |
| `discoteca` | Discoteca en el humo | láseres | fondos/color, arte/optica |
| `faros` | Haces lentos en la bruma | láseres | fondos/color |
| `terciopelo` | Foco de terciopelo | focos | fondos/color |
| `escenario` | Dos focos fríos | focos | fondos/color |

**Prueba** (`tests/unit/family-haces_luz.test.ts`, 5 casos):
- los láseres son hilos (entre el 1 % y el 20 % del cuadro) que salen del contorno, llegan al borde y barren;
- el brillo sigue la niebla: es menos de la mitad donde el fBm es bajo y más donde es alto, lejos del núcleo;
- el destello sólo aparece cerca de la intersección de las dos líneas centrales;
- el polvo no añade nada donde no llega luz (en los dos modos);
- el tono de un haz cambia con «Giro del tono» y no cambia sin él.

**Capturas:**
- `img/luz/haces_luz-laberinto.png`;
- `img/luz/haces_luz-terciopelo.png`;
- `img/luz/haces_luz-escenario-motores.png`.

## I-07 · Mandala de capas (`mandala_capas`)

**Por qué no es la receta sugerida.** La receta `flor_armonica` + `rosa` + `anillos` no da el comportamiento pedido:
- ninguno de los tres patrones tiene pétalos de flor de la vida ni espirales áureas;
- `anillos` sólo se desplaza en el radio, no gira;
- la «contrarrotación» de capas clásicas sería invertir la velocidad de la capa entera.

Por eso se hizo la familia.

**Mecanismo.** Tres capas concéntricas, cada una plegada en un sector de su propia simetría:
- **la flor de la vida en el centro:** n círculos de radio ρ sobre un anillo de radio ρ y uno central; los pétalos
  (vesicas) se rellenan donde se solapan dos círculos o más;
- **espirales áureas en medio:** espirales logarítmicas con b = ln φ/(π/2), m brazos en cada sentido; sus cruces
  forman una red de girasol;
- **un rosetón fuera:** 2n lóbulos con una cuenta en cada uno, anillos y una corona de marcas.

Giro de cada capa:
- la flor y el rosetón giran en un sentido; las espirales y la corona, en el contrario;
- cada capa gira un número entero de pasos de su simetría por ciclo, así que el conjunto vuelve exactamente al
  inicio (bucle);
- además respira, con el mismo ciclo.

**Presets:**

| Preset | Nombre | Usos | Periodo (s) |
|---|---|---|---|
| `trono` | Trono dorado | arte/geometricas, arte/curvas | 30 |
| `roseton` | Rosetón de doce | arte/geometricas | 48 |
| `loto` | Loto que respira | arte/geometricas, arte/curvas | 20 |
| `girasol` | Espirales de girasol | arte/curvas, arte/geometricas | 30 |

Todos llevan `figure: true`.

**Prueba** (`tests/unit/family-mandala_capas.test.ts`, 3 casos):
- cada capa, encendida sola, sólo dibuja dentro de su anillo;
- el ángulo que gira cada anillo, medido por correlación angular, tiene el signo y el valor pedidos;
- cada preset vuelve exactamente a su inicio al cabo de su periodo y es distinto a medio periodo.

**Capturas:**
- `img/luz/mandala_capas-loto.png`;
- `img/luz/mandala_capas-trono-motores.png`.

**Límite.** Con celdas de 10 px el mandala ocupa unas 50 filas y se ve denso. Se lee mejor con celdas más pequeñas.

## I-08 · Eclipse total (`eclipse_total`)

**Mecanismo.**
- **Corona**, en polares alrededor del sol:
  - el brillo cae con la altura sobre el limbo: ∝ (1 + ρ/s)^−2.2;
  - se estira a lo largo de un eje: s crece con cos 2(φ − eje), que da la asimetría;
  - un fBm en (dirección, log r − v·t) la rompe en rayos: sin costura en el ángulo, largos en el radio y fluyendo
    hacia fuera (el viento solar);
  - se añaden penachos finos.
- **El borde de la luna** tiene valles. El centro de la luna se aparta del del sol y vuelve en un ciclo de 16 s:
  - cuando el limbo asoma por los valles aparecen las perlas de Baily;
  - si asoma más, se enciende el anillo de diamante con una cruz de rayos.
- **El limbo** tiene protuberancias rosadas (llamas ancladas que respiran) y cromosfera.
- **Las estrellas** sólo se ven donde la corona no ilumina.
- **El color** va por celda: corona nacarada (fría o dorada con «Tinte»), rosa en las protuberancias y blanco en los
  destellos.

**Diferencia con `rayos` + `planeta`.** Esto es una corona de ruido polar con estructura de altura, eje, viento y
diamante. No es una paleta sobre un disco.

**Presets** (todos `arte/figuras`, contrato continuo):

| Preset | Nombre |
|---|---|
| `diamante` | Anillo de diamante |
| `totalidad` | Totalidad serena |
| `tormenta` | Corona en tormenta |
| `perlas` | Perlas de Baily |

**Prueba** (`tests/unit/family-eclipse_total.test.ts`, 5 casos):
- el disco es negro en totalidad y la media de cada anillo cae con la altura;
- con asimetría, el brillo a lo largo del eje es más del doble que de través; sin ella, menos de 1,6 veces;
- los rayos se desplazan hacia fuera (correlación en log r, en al menos 4 de 5 direcciones);
- el diamante luce en el limbo con la luna apartada y no luce con la luna centrada;
- las estrellas sólo aparecen donde la corona apenas ilumina.

**Capturas:**
- `img/luz/eclipse_total-totalidad.png`;
- `img/luz/eclipse_total-diamante-motores.png`.

## I-09 · Talla de diamante (`talla_diamante`)

**Mecanismo.**
- **La corona de la talla** es una red de anillos por sectores, con la forma del filetín según la talla (brillante
  redonda, princesa cuadrada o rosa hexagonal). Hay mesa octogonal, facetas en estrella, cometas y facetas del
  filetín; cada anillo va desplazado medio sector y cada celda se parte en un triángulo y dos medios.
- **Cada faceta** tiene ángulo e inclinación, es decir, una normal 3D que gira con la piedra:
  - reflejo de Blinn y entorno;
  - **color espectral propio** según su distancia al reflejo perfecto: es el fuego, que corre por las facetas al
    girar;
  - **centelleo**: un destello breve un número entero de veces por ciclo.
- **Estrellas de rayos** en cinco destellos.
- **Las flechas del pabellón** se ven en la mesa.
- **Las aristas** se marcan oscuras y fuera se abren **cáusticas de arcoíris**.
- **Bucle exacto.**

**Diferencia con `caleido` sobre `rombos`.** Hay facetas reales con normal, color por faceta, centelleo y estrella.
No es un caleidoscopio con la paleta girando.

**Presets:**

| Preset | Nombre | Usos | Periodo (s) |
|---|---|---|---|
| `brillante` | Brillante que gira | arte/geometricas, arte/optica | 24 |
| `princesa` | Princesa de fuego | arte/geometricas, arte/optica | 30 |
| `rosa_antigua` | Rosa antigua | arte/geometricas | 40 |
| `hielo` | Destello helado | arte/optica | 12 |

**Prueba** (`tests/unit/family-talla_diamante.test.ts`, 5 casos):
- dentro de cada faceta, el color y el brillo son únicos (en las tres tallas, más de 15 facetas y más de 5 colores);
- las facetas giran con la piedra: la misma faceta aparece en el punto girado más del 95 % de las veces, y su color
  cambia;
- bucle exacto de cada preset;
- el centelleo es breve: más de 0,3 de pico y menos del 30 % del tiempo encendido;
- la estrella da rayos en cruz y no en la diagonal.

**Capturas:**
- `img/luz/talla_diamante-princesa.png`;
- `img/luz/talla_diamante-brillante-motores.png`.

## I-12 · Calor que irradia (`calor_radiante`)

**Mecanismo.**
- **El campo** de temperatura nace de uno a tres focos.
- **El espacio se dobla** con el rotacional de un fBm: sus derivadas, tomadas por diferencias centrales. Es la
  reverberación, un flujo sin divergencia.
- **Alrededor del foco principal**, un fBm en (dirección, log r − v·t) da lenguas de calor que fluyen hacia fuera y
  cambian hasta dónde llega el calor: T ∝ exp(−(d/R)^1.3).
- **El calor sube** (llega más lejos por encima) y parpadea; un calor ambiente llena el resto.
- **Las brasas** salen disparadas de los focos con flotación, dejan una estela corta y se enfrían al envejecer.
- **El mapa térmico** da el color por celda: cuerpo negro, cámara térmica o brasa.

**Diferencia con `fuego`.** El calor irradia desde un centro, con turbulencia y distorsión por derivadas de fBm,
brasas y mapa térmico. No es una llama que sube desde abajo.

**Presets** (todos con contrato continuo):

| Preset | Nombre | Usos |
|---|---|---|
| `rescoldo` | Rescoldo que respira | arte/organicas |
| `termografia` | Cámara térmica | arte/organicas, fondos/organicas |
| `fragua` | Fragua con chispas | arte/organicas |
| `braseros` | Dos braseros | arte/organicas, fondos/organicas |

Sólo los dos presets que llenan el cuadro van a Fondos.

**Prueba** (`tests/unit/family-calor_radiante.test.ts`, 5 casos):
- sin lenguas, reverberación ni subida, la temperatura es radial exacta y decreciente; con la reverberación o con las
  lenguas deja de serlo;
- las lenguas fluyen hacia fuera (al menos en 4 de 5 direcciones);
- con «El calor sube», llega más lejos por encima;
- hay brasas lejos del calor;
- el color es el mapa térmico: blanco amarillento en el centro y rojo en el borde con cuerpo negro; azul en el
  borde con cámara térmica.

**Capturas:**
- `img/luz/calor_radiante-termografia.png`;
- `img/luz/calor_radiante-fragua-motores.png`.

## I-13 · Letrero de neón (`neon_tubos`)

**Mecanismo.** Los tubos se trazan por su campo de distancia:
- el corazón, como poligonal de la curva clásica (x = 16 sen³t, …);
- la estrella, como polígono de diez lados;
- los arcos;
- la palabra LUZ, con segmentos y arcos;
- o un letrero completo con las cuatro formas (siete tubos).

Cada tubo es un grupo con su color (dos colores que se alternan), su momento de encendido y sus fallos.

Ciclo de cada tubo:
- se enciende a su turno, tartamudeando medio segundo;
- zumba y tiene apagones breves;
- un tubo está averiado: el segundo, o el único en el corazón y la estrella;
- al final del ciclo todo se apaga.

Ese ciclo es un bucle exacto. Empieza a media secuencia para que una miniatura en t = 0 muestre el letrero
encendiéndose.

Encima del ciclo:
- **el tubo:** un núcleo casi blanco dentro del resplandor de su color; apagado, se ve como vidrio;
- **el goteo de luz:** gotas que caen de los puntos bajos de los tubos encendidos;
- **la pared:** ladrillo que sólo se ve donde llega la luz;
- **el reflejo:** el letrero espejado con ondulación en el suelo mojado, bajo el tubo más bajo.

**Diferencia con `forma` + `fx.glow`/`flicker`.** Hay encendido tubo a tubo, zumbido, goteo, pared y reflejo. No
es un parpadeo global de la pieza.

**Presets:**

| Preset | Nombre | Usos | Periodo (s) |
|---|---|---|---|
| `letrero` | Letrero de bar | arte/geometricas, arte/figuras | 12 |
| `corazon` | Corazón que zumba | arte/geometricas, arte/figuras | 9 |
| `estrella` | Estrella de motel | arte/geometricas | 10 |
| `arcos` | Arcoíris de tubos | arte/geometricas | 16 |
| `luz` | La palabra LUZ | arte/geometricas, terminal/figuras | 10 |

**Prueba** (`tests/unit/family-neon_tubos.test.ts`, 5 casos):
- los siete tubos se encienden en orden, cada uno tartamudea y todos se apagan al final;
- en las cinco formas, todo lo que brilla más de 0,9 está sobre el contorno del tubo, y en la fase apagada sólo
  queda el vidrio;
- bucle exacto de cada preset;
- la gota cae: el máximo de la columna baja con el tiempo;
- el reflejo sólo está bajo la línea del suelo, y la pared sólo donde llega la luz.

**Capturas:**
- `img/luz/neon_tubos-letrero.png`;
- `img/luz/neon_tubos-luz-motores.png`.

## I-18 · Disco de vinilo (`vinilo`)

**Mecanismo.**
- **Los surcos en V** son una onda triangular del radio.
- **La música los ondula**: un desplazamiento que sigue el ángulo propio del disco, así que gira con él, más fuerte
  en unos pasajes que en otros.
- **Entre pistas** hay tramos lisos.
- **El reflejo en cruz:**
  - va perpendicular a la luz: un par de cuñas fuerte y otro débil;
  - es iridiscente: los surcos hacen de red de difracción y el color recorre el espectro con el ángulo y el radio,
    simétrico a los dos lados de cada cuña;
  - los tramos lisos brillan como un espejo;
  - la cruz se queda con la luz mientras el disco gira, y gira sólo si gira la luz («Giro del reflejo»).
- **La etiqueta** tiene marcas impresas y gira con el disco.
- **El brazo** va sobre su pivote. La aguja avanza del borde hacia dentro a lo largo del ciclo y vuelve; el ángulo se
  saca por la ley de los cosenos en el triángulo pivote–eje–aguja.
- **El disco** puede verse inclinado y da un número entero de vueltas por ciclo, lo que hace el bucle exacto.

**Diferencia con `anillos` + `rayos`.** El reflejo en cruz se queda fijo a la luz mientras el disco gira, tiene
color de difracción y está el brazo.

**Presets:**

| Preset | Nombre | Usos | Periodo (s) |
|---|---|---|---|
| `tocadiscos` | Tocadiscos | arte/figuras | 36 |
| `arcoiris` | Surcos de arcoíris | arte/figuras, arte/optica | 24 |
| `single` | Single de 45 | arte/figuras | 20 |
| `pizarra` | Disco de pizarra | arte/figuras | 30 |

**Prueba** (`tests/unit/family-vinilo.test.ts`, 6 casos):
- la etiqueta y los surcos giran lo que manda la velocidad (correlación angular);
- sin música, los surcos son anillos exactos; con música, ondulan;
- el máximo del reflejo se queda en el ángulo de la luz en tres instantes, y con «Giro del reflejo» la sigue;
- con irisación, el reflejo tiene rojos y azules; sin ella, es casi blanco;
- la aguja avanza hacia dentro, está donde se dibuja el brazo y vuelve;
- bucle exacto de cada preset.

**Capturas:**
- `img/luz/vinilo-arcoiris.png`;
- `img/luz/vinilo-tocadiscos-motores.png`.

## Pruebas corridas (resultado real, en el commit final)

Pruebas unitarias:
- `npx vitest run` sobre `tests/unit/families.test.ts`, `families-compat.test.ts`, `families-index.test.ts` y las
  ocho `family-<id>.test.ts`: **408 de 408 en verde**, 11 archivos.
  - La primera ejecución, en paralelo con la máquina cargada, dio 5 tiempos agotados de 5 s en las pruebas de
    mecanismo. Se les dio el mismo margen que al resto de pruebas de familias (`{ timeout: 60_000 }` por
    `describe`). Solas tardan unos segundos.
- Pruebas que recorren el catálogo y las familias (`family-contracts`, `recipes-browser`, `runtime-families`,
  `generator-v7`, `azar`, `family-host`): **107 de 107 en verde**.
- `npx tsc --noEmit`: **sin errores**.

Mutaciones de la prueba de burbujas (con un script local, no versionado): las cuatro mutaciones hacen fallar la prueba que les
corresponde.

### Los dos motores

`node scripts/families-qa.mjs --big --compare`, en Chromium con SwiftShader, 1280 × 720, celda de 10 px, t = 6 s.
Resultado: **34 presets sin errores**.

| Familia | Correlación de luminancia | Glifos idénticos | Correlación de color |
|---|---|---|---|
| burbujas | 0,9997–0,9999 | 99,8–99,9 % | 0,9996–0,9999 |
| haces_luz | 0,9986–1,0000 | 97,7–99,8 % | 0,9997–1,0000 |
| mandala_capas | 1,0000 | 99,9–100 % | 1,0000 |
| eclipse_total | 1,0000 | 100 % | 1,0000 |
| talla_diamante | 0,9972–0,9996 | 98,8–99,6 % | 0,9999–1,0000 |
| calor_radiante | 0,9992–1,0000 | 99,8–100 % | 0,9995–1,0000 |
| neon_tubos | 1,0000 | 100 % | 1,0000 |
| vinilo | 1,0000 | 99,4–99,9 % | 1,0000 |

La tinta difiere 0,3 puntos como mucho. Las diferencias que quedan, de menos del 3 % de glifos en los láseres y del
1,2 % en el diamante, están en los bordes de trazos de una celda: con toda probabilidad, el redondeo de float32 de la
GPU frente al doble de la CPU.

### Sonda temporal

`scripts/families-time.ts --long=600`, con 2 semillas.

| Preset | Cambio visible por medio segundo (%) | Tinta (%) |
|---|---|---|
| burbujas (4) | 3,2–4,9 | 74–91 |
| calor_radiante (4) | 2,3–3,7 | 22–100 |
| mandala_capas (4) | 2,5–4,7 | 24–30 |
| eclipse_total (4) | 0,7–1,4 | 11–18 |
| vinilo (4) | 1,0–4,6 | 22–34 |
| haces_luz (5) | 1,5–16,4 | 12–58 |
| talla_diamante (4) | 3,6–4,7 | 19–26 |
| neon_tubos (5) | 0,0–7,9 | 2–40 |

Muestras a 0, 30, 60, 120 y 600 s:
- Todos cambian a los 30, 120 y 600 s, sin vaciarse ni saturarse sin intención, y no derivan a 600 s.
- El eclipse es el más tranquilo: la corona fluye despacio. Se aceleró el viento tras la primera sonda, que daba
  un 0,5 %.
- En los bucles, las muestras en múltiplos del periodo caen siempre en el mismo instante del ciclo. En el neón, un
  0 % en una muestra es la fase de letrero apagado (por ejemplo, `arcos` a los 60 s) o un apagón del tubo averiado.
  Una segunda sonda del neón en instantes que no son múltiplos (0,7 / 31,3 / 62,9 / 123,1 / 601,7 s) da entre el
  0,3 % y el 8,4 % de cambio y entre el 16 % y el 40 % de tinta, con fases apagadas ocasionales, como está
  diseñado.
- Tras la primera sonda, el neón empieza a media secuencia: antes, cada muestra caía en el arranque a oscuras.

### Capturas revisadas

Todas en `docs/cambios/cierre-pr10/img/luz/`, PNG de menos de 150 KB:
- una por familia en WebGL a 1280 × 720 (dos para los haces, una por modo);
- una por familia con los dos motores lado a lado (`*-motores.png`).

Las capturas se revisaron una a una durante la iteración. A raíz de esa revisión se cambiaron:

| Familia | Qué se cambió |
|---|---|
| burbujas | tamaño, densidad y espuma |
| haces | tono, rayos, contraste de la niebla y estrellas en los cruces |
| mandala | grosor y densidad de trazo; se quitó el segundo anillo de círculos |
| eclipse | brillo de la corona y altura de las protuberancias |
| diamante | entorno por faceta; mesa menos dominante |
| calor | contraste de las lenguas y brasas más grandes |
| neón | halo de la pared y línea del suelo |
| vinilo | etiqueta clara con letras oscuras, brazo más fino y número de surcos |

## Lo que no se hizo, y por qué

- **I-07 como receta de 3 capas en `src/studio/presets.ts`.** No da el mecanismo (véase la fila): se hizo la familia
  `mandala_capas`.
- **Azar v8.** No entra en este grupo: `src/random/` está fuera del encargo de los grupos. Las familias quedan
  registradas con sus `uses` para que la versión nueva las tome.
- **E2E y medidas de rendimiento.** No se corrieron, por las reglas de la máquina compartida. El coste por celda está
  acotado:
  - las burbujas sólo recorren las columnas cercanas, con 24 burbujas como mucho por punto;
  - los haces, 6 haces y 15 pares;
  - el calor, 32 brasas y 6 fBm;
  - el neón evalúa dos veces el letrero (directo y reflejo), con poligonales de 28 segmentos como mucho;
  - nada de raymarching.
- **Leer la fuente (`reads`).** Ninguna fila lo pide, y no se usó.
- **Límites visuales que quedan:**
  - el mandala con celdas de 10 px se ve denso;
  - el eclipse se mueve despacio a propósito;
  - en el neón, la palabra es siempre LUZ;
  - el vinilo dibuja muchos menos surcos que uno real (los surcos de verdad son más finos que un carácter).
