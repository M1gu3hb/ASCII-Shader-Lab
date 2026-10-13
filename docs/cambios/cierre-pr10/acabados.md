# Cierre del PR #10 · grupo «acabados»

Filas del Anexo 1: **I-36…I-43** (vidrio en sólidos), **I-22** (destello anamórfico), **I-27** (papel) e
**I-20** (pincel caligráfico). No hay familias nuevas: son cuatro capacidades del motor (las dos, WebGL 2 y
básico, con la misma matemática), sus controles en el estudio y ocho recetas del catálogo.

Las ocho filas I-36…I-43 describen la misma mejora (vidrio en esfera y poliedro: Fresnel, refracción de lo de
detrás, dispersión, transmisión con alfa). Se implementó **una vez**, como dos clases nuevas del «vidrio
delante» que ya existía (`recipe.optics`), y cada fila queda enlazada a ese mecanismo y a sus recetas.

## 1. Receta: claves nuevas, todas opcionales y ausentes por defecto

| Clave | Valores | Dónde | Sin ella |
|---|---|---|---|
| `optics.kind` `'esfera'` \| `'poliedro'` | más `x`, `y`, `ior`, `thick`, `disp`, `tint`, **sólo en esas dos clases** | `normOptics` | la lluvia y el acanalado conservan exactamente sus ocho claves |
| `fxKind` | `{ bloom?: 'anamorfico'; grain?: 'papel'; fold?: 'cuartos' \| 'carta' \| 'diagonal' \| 'arrugado' }` | `normFxKind` | halo redondo y grano de película, como siempre |
| `interact.stroke` | `'caligrafia'` | `normInteract` | Pincel redondo, como siempre |
| `interact.bleed` | 0..1 (por defecto 0,5) | `normInteract` | — |

- `fxKind` va **fuera de `fx`** a propósito: `fx` es un objeto de números que `src/random` (Azar, que este
  grupo no toca) recorre con `Object.keys(fx)` y escribe con números; una clave de texto u opcional ahí rompía
  el tipado de ese código. Va al final de la receta, después de `optics`; `tidyTail` mantiene ese orden
  cuando una edición añade una y luego la otra (la receta editada y su copia normalizada quedan iguales).
- `needsV3`: una receta con cualquiera de ellas pasa al formato 3 (`v: 3`), así un estudio v2 (el de
  producción) la rechaza con su aviso en vez de dibujar otra cosa sin decirlo. Las recetas sin ellas siguen
  en el formato 2, byte a byte.
- Enlaces, proyectos, sesiones, colección y código exportado pasan por `normalizeRecipe`: no hubo que tocar
  nada más. La prueba e2e abre las piezas desde un enlace `#r=j…` y exporta su página.
- **Compatibilidad comprobada**: `scripts/presets-hash.ts` dibuja con el motor básico (campo y selección,
  tres instantes, foto y texto sintéticos) todas las recetas de `src/studio/presets.ts` y saca un hash por
  receta. Sobre el árbol de 16ca1f4 (desempaquetado con `git archive`) y sobre esta rama: **las 102 recetas
  publicadas dan el mismo hash**, incluidas las cuatro de vidrio (`lluvia-ventana`, `tras-el-acanalado`,
  `tras-la-lluvia`, `acanalado`); las 8 nuevas son las únicas líneas añadidas.

## 2. I-36…I-43 · Vidrio en sólidos (esfera y poliedro)

**Mecanismo** (`src/engine/glsl/optics.ts` `GLSL_OPTICS_SOLID`, puerto línea a línea en
`src/engine/basic/optics.ts`; estado por cuadro en `src/engine/opticsU.ts` `solidUniforms`). Escrito desde la
física (ley de Snell, término de Schlick, Beer–Lambert); no se copió código de three.js ni de ShaderGradient.

- Por cada celda sale un rayo hacia −z. Si toca el sólido, entra **refractado por la normal** del punto de
  entrada con el **índice de refracción** (`refract(v, n, 1/ior)`), lo cruza, y al llegar a la otra cara sale
  refractado otra vez; si no puede salir (**reflexión interna total**) rebota dentro, hasta tres veces. Donde
  sale, sigue hasta el plano de la pieza (z = −2,7 radios) y **lee ahí la fuente**: las capas (patrón o
  familias), la foto o el texto. Es el mismo canal que la lluvia y el acanalado: desplaza el punto que lee cada
  celda antes de elegir el carácter.
- **Esfera**: intersección analítica de un elipsoide; **poliedro**: intersección de planos (prisma triangular,
  cubo, octaedro, dodecaedro, icosaedro), cuyos planos gira y aplasta el motor en cada cuadro (giro lento sobre
  un eje inclinado `angle`, balanceo leve). Los dos motores reciben los mismos planos.
- **Grosor** (`thick`): el sólido se aplasta en z. Una bola entera invierte lo de detrás (el foco cae delante
  del plano); una lente fina lo agranda derecho, como una lupa.
- **Fresnel** (Schlick, F0 = ((ior−1)/(ior+1))²) donde entra el rayo, con lo que refleja: una habitación
  oscura, más clara arriba, y una ventana arriba a la izquierda (el brillo especular). En el borde se refleja
  más y **pasa menos luz** (`OPX.w`), lo que dibuja el contorno; las aristas del poliedro brillan.
- **Sombra** suave abajo a la derecha, fuera del sólido (con `shine` 0 no hay luz ni sombra).
- **Dispersión** (`disp`): tres índices (rojo un 6 % × disp menos, azul un 6 % × disp más). Los rayos rojo y
  azul leen la fuente donde caen ellos (`OPD`): con una foto en «color de la fuente», el rojo y el azul vienen
  de sitios distintos → arcoíris en los bordes.
- **Tinte** (`tint`) por Beer–Lambert: lo que pasa se multiplica por tint^(recorrido × 0,8), más intenso donde
  el vidrio es más grueso; **opacidad** (`fog`): el cuerpo teñido e iluminado se ve en esa proporción
  («vidrio teñido parcial», la variante con alfa de I-40).

**Decisión con patrones y textos de un tono (monocromos).** Las capas y el texto no tienen color propio: el
color sale de la paleta por luminancia. Con dispersión se evalúan las capas (o el texto) también donde caen
los rayos rojo y azul; el carácter se elige por la luminancia de los tres, y la celda lleva el **cociente por
canal** (tres rayos / su media) como factor del color de la paleta (`uOpCol` 2 en el pase de campo,
`uGlassCol` en el de selección; 128 = ×1). Resultado: donde el vidrio cruza un borde del patrón, ese borde se
tiñe de rojo a un lado y de azul al otro; donde el patrón es liso, no hay arcoíris (como la luz blanca a través
de un prisma). Captura `dispersion-monocroma.png`. Con una foto **en paleta** la dispersión mueve la
luminancia pero no colorea (la foto no aporta su color en ese modo): queda dicho en el control.

**Archivos**: `src/engine/recipe.ts` (tipos y normalización), `src/engine/opticsU.ts`,
`src/engine/glsl/optics.ts`, `src/engine/glsl/programs.ts` (programa `'solido'`: `GL3`, `TX3`, muestreo por
canal de la foto y del texto, tinte y cuerpo; factor en `SELECT_FS`), `src/engine/engine.ts` (uniformes por
cuadro), `src/engine/basic/optics.ts`, `src/engine/basic/field.ts` (pilas de los canales rojo y azul sólo en
las celdas del vidrio), `src/engine/basic/select.ts`, `src/engine/basic/engine.ts`, `src/studio/ui/Glass.tsx`.

**Estudio** (Efectos › Vidrio delante): «Esfera» y «Poliedro», con Sólido, Tamaño, Posición horizontal y
vertical, Deriva (esfera) o Giro e Inclinación del eje (poliedro), Índice de refracción, Grosor, Refracción,
Dispersión (arcoíris), Brillo y reflejo (Fresnel), Tinte del vidrio y Opacidad del tinte. Pasar de esfera a
poliedro conserva los ajustes comunes.

**Recetas** (contrato `continuo`; todas son recetas del estudio, no presets de familia):

| id | nombre | espacio › sección | qué hace |
|---|---|---|---|
| `esfera-de-vidrio` | Esfera de vidrio | Arte › Figuras 3D | bola sobre un degradado con franjas: dentro, invertido (claro abajo); deriva en ocho |
| `prisma-de-vidrio` | Prisma de vidrio | Arte › Figuras 3D | prisma triangular tumbado que gira sobre franjas, dispersión 1: bordes de colores |
| `gema-tenida` | Gema de vidrio teñido | Arte › Figuras 3D | icosaedro ámbar con opacidad 0,4: caras, aristas que brillan, tinte más hondo en el centro |
| `bola-de-cristal` | Bola de cristal | Imagen › Con efectos | bola sobre la foto de la persona (la conserva), color de la foto, dispersión 0,5 |
| `bajo-la-lupa` | Bajo la lupa | Texto › Letras con textura | lente fina que agranda derecho las palabras de la persona (las conserva), con arcoíris |

En Arte, un sólido de vidrio se lista en Figuras 3D (`sectionOf`), como pide el destino del Anexo 1.

**Motor y parecido** (dev/basic.html, 640 × 360, t = 4; `r` y Δ de luminancia por celda; Δpx por píxel 0..255):

| receta | r | glifos iguales | Δrgb | Δpx |
|---|---|---|---|---|
| esfera-de-vidrio | 1,000 | 100,0 % | 0,00 | 0,02 |
| prisma-de-vidrio | 1,000 | 100,0 % | 0,00 | 0,05 |
| gema-tenida | 1,000 | 100,0 % | 0,01 | 0,04 |
| bola-de-cristal (paisaje) | 1,000 | 100,0 % | 0,07 | 0,04 |
| bajo-la-lupa | 1,000 | 100,0 % | 0,00 | 0,00 |
| dispersión monocroma | 1,000 | 100,0 % | 0,00 | 0,00 |

Con familias detrás (`dev/familias.html?vidrio=esfera`, `scripts/families-qa.mjs --compare`): los 18
presets de `corrientes` (color propio), `mar` (analítica) y `reaccion_difusion` (raster) dan r ≥ 0,9998,
glifos ≥ 99,1 % y Δ de color ≤ 0,2.

Capturas (izquierda WebGL, derecha básico): `img/acabados/esfera-de-vidrio.png`, `prisma-de-vidrio.png`,
`gema-tenida.png`, `bola-de-cristal.png`, `bajo-la-lupa.png`, `dispersion-monocroma.png`.

| Fila | Qué pedía | Cómo queda cubierta |
|---|---|---|
| I-36 (ShaderGradient glass) | Fresnel hacia otro color, refracción/reflexión del entorno | Fresnel de Schlick con reflejo de un entorno; refracción de la pieza de detrás; tinte |
| I-37 (three.js gltf dispersion) | IOR distinto por canal, arcoíris en los bordes | `disp`: tres índices, los rayos rojo y azul leen donde caen |
| I-38 (gltf transmission) | vidrio | esfera y poliedro de vidrio |
| I-39 (physical transmission) | refracción del fondo por normal, IOR y grosor | `ior`, `thick` (z del sólido) y la normal de cada punto |
| I-40 (transmission alpha) | transmisión con alfa | `fog` como opacidad del cuerpo teñido, `tint` por Beer–Lambert |
| I-41 (WebGPU dispersion) | = I-37 | mismo mecanismo |
| I-42 (WebGPU transmission) | = I-38 | mismo mecanismo |
| I-43 (WebGPU physical transmission) | = I-39 | mismo mecanismo |

## 3. I-22 · Destello anamórfico (`fxKind.bloom = 'anamorfico'`)

**Mecanismo** (`ANAMORPHIC_FS` en `src/engine/glsl/programs.ts`; `blurGridAnamorphic` en
`src/engine/basic/compose.ts`). En la rejilla de celdas, en los mismos destinos que el halo redondo (el pase de
composición los suma igual):

1. sólo las **luces** (lo que dibujó la selección, con un umbral suave de luminancia 0,3) se extienden de lado;
2. eso se extiende tres veces más lejos: una **estela horizontal larga** (± ~30 celdas con halo 1), con el
   **rojo corrido a la derecha y el azul a la izquierda** de cada luz y un tono algo frío;
3. un **anillo de desenfoque** (24 tomas sobre un círculo, redondo en píxeles: las celdas son más altas que
   anchas) alrededor de cada luz.

Diferencia visible con el halo redondo: el halo es horizontal y no vertical, se abre en colores a los lados y
deja anillos. Capturas `destello-luces.png` (anamórfico) frente a `halo-redondo-luces.png` (el de siempre), y
`destello-de-cine.png` sobre la foto (el sol deja una estela azul a un lado y cálida al otro).

**Estudio**: Efectos › Luz › «Forma del halo» (Redondo / Anamórfico), visible cuando hay halo.
**Receta**: `destello-de-cine` «Destello de cine», Imagen › Con efectos (conserva la foto; luciérnagas en
«aclarar» para que haya movimiento con una foto quieta). Contrato `continuo`.
**Parecido**: destello-de-cine r 1,000, Δpx 0,24; luces anamórficas r 1,000, Δpx 0,14.

## 4. I-27 · Papel (`fxKind.grain = 'papel'`, `fxKind.fold`)

**Mecanismo** (`PAPER_FS` en `programs.ts`; `PaperSheet` / `paperField` en `basic/compose.ts`). Una **hoja
quieta**: se dibuja una vez por tamaño, celda y pliegue en una textura (WebGL) o un búfer (básico), y la
composición la suma donde antes iba el grano de película, `col += P · grain · (0,04 + 0,3 · col)` (se nota en
papel claro y en fondo oscuro). P reúne:

- grano fino por píxel y un moteado suave de unas celdas;
- **fibras**: hebras cortas y finas (dos por cada cuadro de tres celdas), más claras o más oscuras;
- **pliegues**: en cada doblez, una línea oscura fina y el lado que mira a la luz (arriba a la izquierda) más
  claro que el otro: «En cuatro», «Carta en tres», «En diagonal» y «Arrugado» (nueve dobleces al azar que
  además inclinan cada faceta).

No se mueve (la prueba lo comprueba con dos instantes). La textura del WebGL y el búfer del básico se sueltan
cuando la pieza deja de usar papel; cada motor guarda la suya.

**Estudio**: Efectos › Pantalla › «Tipo de grano» (Película / Papel) y «Pliegues», visibles cuando hay grano.
**Recetas**: `impreso-en-papel` «Impreso en papel», Imagen › Con efectos: la foto de la persona impresa en
tinta sobre una hoja doblada en cuatro (contrato: quieta con una foto, se mueve con un video o la cámara); y
la hoja de `caligrafia` (abajo). Capturas `impreso-en-papel.png`, `papel-arrugado.png`.
**Parecido**: Δpx 0,47–0,63 por píxel (el papel se cuantiza a 8 bits en los dos; el grano del básico se suma
antes de las líneas de monitor y la viñeta, la desviación que ya tenía el grano de película).

## 5. I-20 · Pincel caligráfico (`interact.stroke = 'caligrafia'`, `interact.bleed`)

**Mecanismo** (`src/engine/pointer.ts` `brushWidth`, `brushDry`, `brushGhost`; `SIM_FS` en `programs.ts`;
`SimGrid.step` en `basic/sim.ts`; los dos motores en `runSim`):

- **Ancho según la velocidad**: el radio del pincel por la velocidad del trazo (alturas de pantalla por
  segundo): 1,35 quieto, 0,3 a toda velocidad, suavizado entre cuadros; dentro de un segmento el ancho va del
  del cuadro anterior al de este (trazos sin escalones).
- **Pincel seco** deprisa: a través del trazo, los pelos dejan huecos (`brushDry`).
- **Sangrado**: cada celda empapa parte de la tinta de su vecina más húmeda, más o menos según las fibras del
  papel (un hash fijo por celda), con un ritmo limitado: los bordes se deshilachan en uno o dos segundos.
- La tinta **se seca y queda**: se apaga al 40 % del ritmo de Pincel.
- **Fantasma** (`interact.auto`): escribe trazos de 1,15 s, curvas que empiezan y acaban despacio y corren en
  medio (anchos en sus extremos, finos en el centro), y **levanta el pincel** 0,45 s entre trazos mientras va
  al siguiente. Un lápiz real sigue mandando la presión; un dedo o el ratón también dibujan con ancho por
  velocidad.

Sin `stroke`, Pincel es exactamente el de antes (la prueba compara con la fórmula vieja).

**Estudio**: Movimiento › Pincel › «Pincel» (Redondo / Caligráfico) y «Tinta que se corre»; la «Duración del
trazo» dice el tiempo real de la tinta. La miniatura del catálogo de una pieza con este pincel y cursor
automático reproduce sus dos últimos segundos (si no, saldría una hoja en blanco).
**Receta**: `caligrafia` «Caligrafía en papel», Arte › Orgánicas: tinta sobre papel doblado en carta con el
juego de caracteres «Pincel». Contrato `continuo` (el fantasma escribe sin fin; la tinta vieja se aclara).
Captura `caligrafia.png` (180 cuadros, 6 s): el trazo fresco es negro y macizo con bordes `/ ╱ ╳`, los
anteriores se aclaran.
**Parecido** (180 cuadros con el fantasma, por píxel): r 0,997, Δ 0,66.

## 6. Pruebas

- **Unitarias nuevas** `tests/unit/acabados.test.ts` (33): claves opcionales y su orden; lluvia y acanalado con
  sus ocho claves; límites; formato 3; las 8 recetas válidas y en su sección; esfera: fuera no mueve, centro
  sin desplazamiento, bola que invierte y lente fina que agranda derecho, más IOR más desvío, Fresnel en el
  borde, recorrido del tinte, dispersión con rojo y azul a lados opuestos, sombra sólo con luz; los cinco
  poliedros sin NaN con caras y aristas, girando; bucle que empalma; programas distintos y la lluvia sin
  cambios; modo de color; en el motor básico: la esfera invierte un degradado, la dispersión colorea los bordes
  de un patrón de un tono (y fuera del vidrio todo queda neutro), tinte y opacidad; anamórfico: estela mucho más
  ancha que alta (el redondo no), rojo a un lado y azul al otro, anillo, nada sin luces; papel: quieto,
  pliegue con línea oscura y lados opuestos, arrugado con facetas; pincel: ancho y seco según velocidad,
  fantasma con trazos lentos en sus extremos y levantadas, trazo lento más ancho que uno rápido, sangrado que
  crece con el tiempo y no sin él, Pincel redondo idéntico; la búsqueda de Recetas las encuentra por lo que
  hacen («anamórfico», «caligrafía», «papel», «refracción», «arcoíris»).
- **Corridas** (resultado real): `acabados` 33/33 (más `recipes-browser`: 51/51 tras añadir las palabras de búsqueda), `optics`, `seo`, `library`, `recipes-browser`,
  `basic-pipeline`, `generator-v7`, `generator-versions`: 126/126; `audit-limits`, `azar*`, `basic-features`,
  `compose-glyph-lookup`, `controls-ui`, `creative`, `extras-*`, `family-contracts`, `guide-paths`, `history`,
  `loop`, `own-words`, `packages`, `project-file`, `project-normalize`, `recipe`, `share-frame`,
  `text-export`, `touch-export`, `touch`, `generator`: 278/278 (una pista de ayuda con «siempre» falló al
  principio y se reescribió); `families`, `families-compat`, `families-index`, `family-host`,
  `project-store`, `studio-capture-lifecycle`, `foto-layer-ops`, `foto-video`: 387/387. `npx tsc --noEmit`
  sin errores.
- **e2e** `tests/e2e/acabados.spec.ts` (PW_PORT 4405, Chromium + SwiftShader): los controles del estudio
  (vidrio, forma del halo, papel, pincel); las 8 recetas abren desde Recetas en su espacio y dibujan, en WebGL
  y en el básico; y la **página exportada** con los cuatro acabados dibuja con WebGL 2 y sin WebGL (motor
  básico del runtime), sin errores. Resultado en la sección 8.
- No hay sonda temporal de familias (`families-time`): este grupo no añade familias.

## 7. Lo que no se hizo, y por qué

- **Azar**: `src/random` es de otro grupo y está congelado (v1…v7). Ninguna versión genera estas claves; con
  «efectos» fijados, Azar copia `fx` pero no `fxKind`, así que tirar con la pieza de base pierde la forma del
  halo o el papel (`src/random/locks.ts` copia `r.fx = b.fx`). Con «movimiento» fijado sí se conserva el
  pincel caligráfico (copia `interact` entero), y con «efectos» la v7 conserva el vidrio de la base, sólidos
  incluidos. Para la v8: copiar `fxKind` junto a `fx` y ofrecer los sólidos y los acabados en sus tiradas.
- **Foto en paleta con dispersión**: mueve la luminancia, no da arcoíris (en ese modo la foto no pone su
  color); el arcoíris está con «color de la fuente» o con patrones y texto (decisión de la sección 2).
- **Pan de oro** de la referencia de I-20 (tinta con lámina dorada): no se hizo; el encargo pedía ancho por
  velocidad y sangrado.
- **Caústica** (el punto brillante que una bola enfoca en su sombra): no se hizo; hay sombra.
- **Calidad «Ligera» del motor básico**: quita el halo y el grano por coste, como antes; con ellos se van el
  destello anamórfico y el papel en esa vista previa (no en exportaciones).
- **Hardware**: sólo Chromium con SwiftShader de esta máquina; sin GPU real, teléfono, Firefox ni Safari.

## 8. Resultados de las e2e y commits

`PW_PORT=4405 npx playwright test tests/e2e/acabados.spec.ts --project=desktop` (compilación de producción y
`vite preview`, Chromium 141 con SwiftShader):

- Primera pasada (código de 11c6cf4 + miniaturas): 7 de 8; falló «motor WebGL › Arte» en «Prisma de vidrio»:
  el escenario no llegó a más de 3 colores en los 30 s de espera, con la máquina compartida cargada (otros
  agentes compilando). Abierto aparte en el estudio de desarrollo con el mismo enlace, el prisma dibuja (comprobación
  fuera del repositorio); la segunda pasada de las tres pruebas WebGL (3/3) y la final dieron verde.
- **Final, sobre cce4acb: 8 de 8 en 7,0 min** (estudio 31,9 s; recetas WebGL: Arte 1,9 min, Imagen 59,9 s,
  Texto 24,1 s; básico: 30,6 s, 37,3 s, 16,3 s; página exportada en WebGL 2 y sin WebGL 45,5 s). El commit
  posterior c6d27ba sólo añade palabras de búsqueda del catálogo (cubiertas por las unitarias).

Commits de este grupo: 268f508 (motor), 11c6cf4 (estudio y recetas), cce4acb (liberar el papel, miniatura del
pincel, más movimiento, huella de recetas, e2e), c6d27ba (búsqueda), y el de este informe con sus capturas.
