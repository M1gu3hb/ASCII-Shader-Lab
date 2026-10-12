# Cierre del PR #10 · grupo «grabado»: C-07 «Grabado láser»

C-07 estaba aplazado porque faltaba «el recorrido ordenado del texto». Este grupo implementa ese recorrido y la familia completa. Una punta incandescente recorre por longitud de arco una de tres cosas:

- el contorno ordenado de las palabras de la persona;
- una figura;
- una firma.

A su paso deja un surco en relieve que se ahonda y se enfría, con chispas y humo. Todo se dibuja en glifos ASCII y es igual en los dos motores.

## 1. Mecanismo implementado y en qué se ve

### La ruta (`src/families/sims/grabado-ruta.ts`, funciones puras)

**Lectura del texto** (`feed(src)`, con `src.kind === 2`)

- La capa muestrea la máscara de las letras (`src.at`) en una rejilla de hasta 384 × 192 sobre el dominio del modelo.
- **Contornos.** Marching squares con:
  - interpolación lineal;
  - sillas resueltas por la media de la celda;
  - la rejilla rodeada de «fuera», para que todo contorno cierre.
- Los segmentos se unen en polilíneas cerradas y se simplifican con Douglas–Peucker.
- **Piezas.** La máscara se separa en piezas conexas, que son las letras:
  - los huecos de O, B, A, D o Ñ son contornos de su misma letra;
  - la tilde de la ñ, los acentos, la diéresis o el punto de la i son piezas propias.
- **Cortes paralelos dentro de cada letra.** Son curvas de nivel de la distancia exacta al borde (Felzenszwalb–Huttenlocher), suavizadas.
- **Ajuste al tamaño de letra.** Se mide el ancho típico del trazo de las letras. En letras pequeñas o finas (textos largos), los cortes se acercan y el surco se estrecha (`fit`, 0,6–1).

**Orden y recorrido**

- Se graba letra a letra:
  - las letras van por cercanía desde donde está la punta (volver a la izquierda cuesta un poco más, y una línea se lee en orden);
  - dentro de cada letra, primero el contorno y luego cada nivel de cortes.
- **Desplazamientos.** Entre trazos, la punta va en línea recta con el láser apagado, cuatro veces más rápida, y no graba.
- **P(s).**
  - La ruta es una polilínea con la longitud de arco en cada vértice.
  - El reloj de la punta es el coste: lo grabado más los desplazamientos a ¼.
  - La punta avanza `velocidad · dt` por paso, así que va a velocidad constante en cada tramo.
- **Huella.** `walkCut` sólo llama a la huella en los tramos grabados. Las pruebas lo comprueban: si se graba en un desplazamiento, fallan dos pruebas (lo comprobé con una mutación, abajo).

### Sin texto en la pieza (`grabado-trazos.ts`)

**Palabra propia, «Palabra propia» (parámetro de texto)**

- Usa una tipografía de trazo único escrita aquí, sin fuentes ni assets.
- Cubre:
  - mayúsculas (las minúsculas se pasan a mayúsculas);
  - cifras;
  - los signos comunes, entre ellos ¡ ¿ & @ #.
- Las tildes, la diéresis, la virgulilla y la cedilla salen de la descomposición Unicode (NFD), como marcas de su letra: Ñ, É, Ü y Ç funcionan.
- `|` o un salto de línea parten la línea.
- Los cortes paralelos van a los lados de la línea, como el sombreado del grabado en cobre.

**Decisión documentada:** con el origen «Texto» y sin palabras en la pieza (Fondos, Terminal, o un texto vaciado), graba la palabra propia. Si la palabra propia está vacía o no tiene ningún carácter dibujable, graba una figura. Nunca queda una ruta vacía. El panel lo avisa de dos formas:

- la pista de «Origen» y de «Palabra propia»;
- una nota nueva en la capa: «La pieza no tiene texto: esta capa dibuja su propia forma…».

**Forma.** Polígono, estrella, espirógrafo (hipotrocoide de razón racional, cerrada), rosa o Lissajous:

- «Una distinta cada vez» las alterna;
- cada pasada usa otros parámetros, sacados de la semilla y del número de pasada;
- los cortes paralelos son copias concéntricas.

**Curva (firma).**

- Dos o tres palabras cursivas: una capital y letras a mano.
- Cada letra son puntos clave con un poco de temblor (semilla), unidos con Catmull–Rom e inclinados.
- La pluma se levanta entre palabras.
- Al final, una rúbrica bajo la firma; después, los puntos de las íes y las barras de las tes, como hace una mano.

### El corte y el dibujo (`grabado.ts`)

**Surco gradual**

- En cada tramo grabado, la punta deposita calor con un perfil gaussiano de ancho «Grosor».
- El calor se enfría (τ = 0,16 s) y, mientras está caliente, cava.
- Así, detrás de la punta el surco se ahonda y se ensancha; luego se enfría.
- Los cortes paralelos son menos hondos que el contorno, para que la letra conserve su borde.

**Relieve y color del surco**

- La normal del campo de profundidad, bajo una luz arriba a la izquierda, da una pared iluminada y otra en sombra.
- El corte fresco conserva un temple cálido durante 2,5 s.

**Punta caliente**

- Un núcleo con un halo que parpadea; el parpadeo está sembrado por el paso.
- En los desplazamientos, la punta es un punto tenue «apagado».

**Chispas y humo**

- Chispas deterministas (generador con estado en la instantánea): salen hacia atrás y arriba, caen con gravedad y arrastre, y se apagan.
- Bocanadas de humo que suben, ondulan y se abren; se dibujan a media resolución.
- «Chispas» y «Humo» controlan cuántas hay.

**Color por celda** (`color: true`, `colorSince: 1`, `renderColor`)

| Material | Placa | Corte | Punta y chispas |
|---|---|---|---|
| Acero | Cepillado oscuro | Frío | Blanco y naranja |
| Latón | Oscura | Dorado | Blanco y naranja |
| Madera (pirograbado) | Se apoya en un fondo claro: el surco es tinta densa en marrones oscuros | — | Brasas naranjas |

Todo el color sale de la familia; la luminancia elige el glifo.

**Al completar la forma**

- La placa se enfría durante 1,2 s y, a continuación:
  - con «Enfría y sigue grabando» (contrato **continuo**), empieza otra pasada desde donde está la punta: las mismas palabras con los cortes interiores medio paso desplazados, o la figura o la firma siguientes. Los surcos viejos se borran según la «Persistencia» (τ de 1 s a 2 min);
  - con «Una vez y se queda» (contrato **construcción**, con su nombre en el selector), se queda quieta.
- **Cambio en vivo.** Otro texto, otro origen u otros cortes empiezan otra ruta desde la punta. No hay salto: lo grabado se disuelve en ~0,5 s.

**Estado y determinismo**

- La instantánea guarda:
  - profundidad, disolución, calor y temple;
  - chispas y humo;
  - la fase, la pasada y el coste en la ruta;
  - la firma geométrica de la ruta;
  - el generador.
- La ruta no se guarda: se reconstruye desde la semilla, los parámetros, la fuente y la pasada.
- Al restaurar y volver a recibir la misma fuente, conserva el avance. Una fuente distinta se trata como un cambio.

## 2. Archivos

**Nuevos**

- `src/families/sims/grabado.ts` (modelo)
- `src/families/sims/grabado-ruta.ts` (contornos, distancia, piezas, ruta, P(s))
- `src/families/sims/grabado-trazos.ts` (tipografía de trazo, figuras, firma)
- `src/families/meta/grabado.ts`
- `src/families/meta/grabado.doc.ts`
- `tests/unit/family-grabado.test.ts`
- `tests/e2e/grabado.spec.ts`
- `dev/grabado.html`, `dev/grabado.ts`: QA del grabado en Texto, Terminal y solo, con los dos motores
- `scripts/grabado-qa.mjs`: capturas, comparación de motores y sonda de la ruta
- `docs/cambios/cierre-pr10/grabado.md`, `docs/cambios/cierre-pr10/img/grabado/*.png`

**Registro** (al final de cada lista)

- `src/families/meta/forma.ts`
- `src/families/load.ts`
- `src/families/docs.ts`
- `src/families/index-data.ts` (regenerado con `scripts/families-index.ts`)
- `src/studio/presets.ts`: receta de Texto «Grabado láser». Va antes del bloque de la biblioteca, porque `library.test.ts` exige que las 45 recetas de la biblioteca queden al final.
- `tests/unit/families.test.ts`: entradas `INERT` de `grabado`:
  - `figura`, que sólo cuenta con «Forma»;
  - `ciclo`, que sólo se nota al terminar la forma.

**Motor y estudio compartidos** (cambios pequeños, con su porqué)

- **Rasters de color: eran inalcanzables y en WebGL leían mal.**
  - Antes:
    - `isColorFamily` excluye a las raster;
    - en WebGL, `programs.ts` muestreaba con `famRaster` la textura RGBA de una raster de color, y su canal **rojo** acababa usándose como luminancia;
    - `hasColourFamily` tampoco veía a las raster, así que su color nunca llegaba a las celdas en ninguno de los dos motores.
  - Ahora:
    - `registry.ts` añade `isColourRaster`;
    - `programs.ts` usa `famRasterC` y el bloque de color también para ellas; con una raster, SRCC exige que esa ejecución dé color;
    - `palette.ts` hace que `hasColourFamily` incluya las raster de color cuya ejecución da color. Con fuente texto, sólo las que leen las palabras; afecta únicamente al modo «Colores de: la familia»;
    - `engine.ts` y `basic/engine.ts` llaman ahora a `hasColourFamily` también con fuente texto;
    - en `families/basic.ts`, una raster de color que lee la fuente marca `reads`/`srcColour`, como en WebGL.
- **La misma máscara en los dos motores.** En `basic/engine.ts`, el motor básico entrega a las raster la misma copia pequeña de las letras que el WebGL (`smallCopy`, ≤ 256 px), en vez del lienzo de texto a resolución completa. Antes, los contornos diferían y la correlación con texto bajaba a 0,59–0,92. Ahora es 1,0000 (§4).
- **`families/host.ts`:**
  - una ejecución reconstruida (`rebase`: volver atrás en el tiempo o cambiar parámetros en un motor fijo) recibe su fuente antes del primer paso;
  - en un motor fijo (exportación, miniaturas), otras palabras (`wordsKey`: texto, lienzo y posición de la capa) empiezan otra ejecución. Antes, un motor de miniaturas reutilizaba la ejecución de otra pieza con la misma familia y semilla.
- **`studio/recipes/catalog.ts`.** En Texto, una familia **raster que lee las palabras** las dibuja ella misma, así que se compone con `mix 1, normal`. Las demás siguen como textura dentro de las letras (`multiply 0,6`). Las analíticas no cambian.
- **`studio/ui/FamilyControls.tsx`.** Nota genérica cuando una raster que lee la fuente no tiene qué leer.
- **`studio/panels.tsx`.** La nota de color dice «La familia da a cada celda su propio color…» cuando la familia de color es raster.

**Aviso para la fusión.** El grupo de §6 (color propio en ecos y humo) necesita el mismo arreglo de rasters de color. Si lo hizo por su cuenta, hay que quedarse con uno solo: el de aquí es mínimo y está probado en los dos motores.

## 3. Familia, presets, usos y contratos

**Familia:** `grabado`, «Grabado láser».

| Campo | Valor |
|---|---|
| Grupo | `forma` |
| Tipo | `geometry`, v1 |
| `reads` | `['source']` |
| Color | `true`, `colorSince` 1 |
| `figure` | `true` |
| `wrap` | `clamp` |
| Resolución | 48–160 filas, 96 por defecto |
| Ritmo | 30 pasos/s |
| Calentamiento | 12 pasos |
| `checkpoint` | `true` |
| `aka` | grabado láser, laser engraving, pirograbado, trayectoria de herramienta, toolpath, contornos de texto, marching squares, buril |

**Controles:**

- Origen del trazado (texto, forma, curva)
- Palabra propia
- Velocidad
- Grosor
- Cortes paralelos
- Chispas
- Humo
- Persistencia
- Material
- Figura
- Al terminar (continuo o construcción)

| id | Nombre | Usos | Contrato | Qué lo distingue |
|---|---|---|---|---|
| `tu-palabra` | Tu palabra grabada | `tipo/texturas`, `terminal/consola` | continuo | Tus palabras en acero, con contorno y dos cortes por letra, letra a letra y con chispas; el surco dura minutos. En Terminal, la palabra propia. Celda 8, 128 filas. |
| `geometria` | Geometría | `arte/geometricas`, `terminal/figuras` | continuo | Una figura distinta en cada pasada, en latón, rápida, con contornos concéntricos; la anterior se borra (persistencia 0,45). |
| `firma` | Firma | `arte/curvas`, `terminal/figuras` | continuo | Firma cursiva quemada en madera sobre fondo claro, lenta y con humo; cada pasada, otra firma. |
| `placa` | Placa terminada | `tipo/texturas` | **construcción** | Tus palabras en latón, con cuatro cortes por letra, una sola vez: se enfría y se queda. |
| `luz` | Escritura de luz | `tipo/texturas`, `terminal/consola` | continuo | La punta corre y el surco se apaga en ~2 s: una estela de luz que escribe, con muchas chispas. |

**Receta de Texto `tipo/grabado-laser`, «Grabado láser»** (`src/studio/presets.ts`)

- Conserva las palabras de la persona (`keepText`).
- Composición: `mix 1, normal`, colores de la familia, celda 8, glow 0,3 y bloom 0,4.
- La familia usa 128 filas y tres cortes paralelos.

**Dónde se ofrece en Texto:** la receta y los tres presets `tipo/texturas` se ofrecen con el texto de la persona (sección «Letras con textura»).

## 4. Pruebas (resultados reales de este código)

**Unitarias del mecanismo:** `tests/unit/family-grabado.test.ts`, 21 de 21.

*Contornos*

- Un anillo antialiasado da dos contornos cerrados con su longitud (2π·15 y 2π·30, a ±10 %).
- Letras con huecos: O y A dan 2 contornos; B, 3; D, 2; L, 1.
- Ñ y ñ (2 piezas), É (2), Ü (3); la tilde queda encima de la N.
- La Ç es más larga y baja más que la C: la cedilla cuelga de la letra.
- Varias líneas: «AB\nO» da 3 piezas y 7 contornos.
- Texto largo (dos líneas, 35 caracteres): ≥ 31 piezas.
- Los cortes interiores quedan a su distancia del borde; en un texto largo, el `fit` es < 1.
- Una máscara vacía no da trazos.

*Ruta*

- Cada tramo grabado está sobre su trazo (a < 1e-9), así que no hay tramos grabados entre contornos.
- La longitud grabada es igual a la suma de los trazos: cada uno se graba entero y una sola vez.
- Cada letra se graba entera antes de la siguiente, y el contorno antes que los cortes.
- Lo mismo para las cinco figuras, la firma y la palabra propia («Ñandú 2026»).
- P(s) por longitud de arco: avance igual al coste al grabar y a 4× el coste al desplazarse, en 300 tramos o más.
- `walkCut` graba exactamente la longitud de corte, en muestras ≤ ds.
- La palabra propia lleva la ñ, las tildes y la diéresis como marcas.

*Modelo*

- Misma semilla y mismo texto dan el mismo raster y el mismo color; otro texto, otro.
- Instantánea y restauración con texto, en el orden del anfitrión (restaurar, recibir la fuente, avanzar): el resultado es idéntico.
- La punta avanza `velocidad/30` por paso.
- La profundidad es < 0,01 a lo largo de todos los desplazamientos alejados de los cortes.
- Otro texto: pasada + 1 y disolución, la ruta parte de la punta sin salto, y lo viejo baja de 0,1 en 1,5 s.
- Texto vacío: graba la palabra propia; sin palabra, una figura; una foto se ignora (igual que sin fuente).
- «Una vez» acaba quieto; «sin fin» sigue cambiando.
- La persistencia actúa sólo en continuo.
- Celdas calientes rojizas; acero frío azulado.

*Anfitrión*

- En un motor fijo, el mismo momento se alcanza igual por pasos que de un salto.
- Otras palabras empiezan otra ejecución.
- Volver atrás empieza de nuevo leyendo las mismas palabras.
- En vivo, otro texto no reinicia la ejecución.

**Mutación:** quitando el `if (!r.on[i]) continue` de `walkCut` (grabar también en los desplazamientos), fallan dos pruebas: «P(s)…» y «…no graba en los desplazamientos». Restaurado.

**Batería obligatoria y relacionadas**

Corrí `npx vitest run` sobre:

- `families.test.ts`, `families-compat.test.ts`, `families-index.test.ts`;
- `family-grabado`, `family-contracts`, `family-host`;
- `library`, `recipes-browser`, `runtime-families`, `own-words`, `optics`.

Resultado: **476 de 476, en 11 archivos**.

- En la primera ejecución, `library.test.ts` falló porque la receta nueva iba al final de Texto. La moví antes del bloque de la biblioteca.
- `npx tsc --noEmit`: limpio.

**Sonda temporal**

Ejecución:

```
npx esbuild scripts/families-time.ts --bundle --platform=node --format=esm --outfile=.cache/ft-grabado.mjs
node .cache/ft-grabado.mjs --ids=grabado --seeds=3 --res=min,def,max --long=600
```

Es en Node y sin fuente, así que los presets de texto graban la palabra propia. En la tabla, «cambio» es el cambio visible en 0,5 s y «tinta» la parte del dominio con tinta, a 30, 60, 120 y 600 s:

| Preset | Contrato | Cambio | Tinta | Comentario |
|---|---|---|---|---|
| `tu-palabra` | continuo | 0,67–0,97 % | 13–19 % | — |
| `geometria` | continuo | 0,44–2,15 % | 8–11 % | — |
| `firma` | continuo | 0,57–1,08 % | 13–22 % | — |
| `luz` | continuo | 0,31–1,55 % | 2–4 % | Estela que se apaga, por diseño; a los 30 s cae en el enfriamiento entre pasadas |
| `placa` | construcción | 1,0 % a 0 s; 0 desde 30 s | 19–20 % | Se queda quieta con la tinta estable, como promete |

Ni vacío ni saturado, a tres semillas y a las resoluciones mínima, por defecto y máxima.

**Motores (correlación de luminancia, glifos iguales y color)**

- `node scripts/families-qa.mjs --ids=grabado --compare`, sobre los 5 presets: r = 1,0000, 100 % de glifos, Δcolor 0.
- `node scripts/grabado-qa.mjs --compare --t=12`, sobre 27 piezas (solo, Texto con GLYPHOS / «Ñandú\nBOB» / «ÁRBOL ÉPICO» / un texto largo / texto vacío, receta, Terminal), con el código final: r = 1,0000, 100 % de glifos, color r = 1,0000 y Δ 0 en las 27. Antes del arreglo de la máscara, las piezas con texto daban r de 0,59 a 0,99.

**E2E** (`PW_PORT=4406 npx playwright test tests/e2e/grabado.spec.ts --project=desktop`, contra la compilación de producción): 3 de 3.

- «grabado láser en Texto (webgl)»: elige «Grabado láser», espera a que se grabe la G de GLYPHOS, escribe «I» y comprueba dos cosas:
  - la G se disuelve (tinta < 35 % de la de antes);
  - se graba la I en el centro.
- Lo mismo con `?motor=basico`.
- «la imagen y la página exportadas llevan el grabado de las palabras»: con «OB» escrito,
  - el PNG exportado es un PNG;
  - el HTML de «Código» contiene `"OB"`;
  - abierto en otra página, sin errores, graba en el centro de su lienzo.

**Capturas revisadas en los dos motores**

- En `dev/grabado.html` (1280 × 720) y en `dev/familias.html`.
- Las miré con la herramienta de lectura e iteré:
  - la placa demasiado punteada;
  - la madera invertida, que se leía mal;
  - el halo y el calor demasiado grandes;
  - los cortes demasiado juntos en textos largos.

## 5. Capturas

Todas están en `img/grabado/` y pesan menos de 150 KB. WebGL = motor WebGL 2; básico = Canvas 2D.

- `texto-nandu-bob-webgl.png`: receta «Grabado láser» con «Ñandú\nBOB» a 45 s. Se ven la virgulilla, la tilde, los huecos de la O y la B con sus cortes concéntricos, las dos líneas y la segunda pasada empezando.
- `texto-glyphos-punta-webgl.png`: «Tu palabra grabada» a 11 s. GLYPH grabado letra a letra; la punta en la O, con halo, chispas y humo.
- `texto-acentos-basico.png`: «ÁRBOL ÉPICO», motor básico.
- `texto-largo-placa-webgl.png`: «Placa terminada» con un texto largo de dos líneas, terminada y quieta.
- `geometria-webgl.png`: «Geometría», una figura de la serie con su copia concéntrica.
- `firma-basico.png`: «Firma», pirograbado sobre madera clara, motor básico.
- `terminal-palabra-basico.png`: la entrada de Terminal de «Tu palabra grabada» (palabra propia, ASCII de terminal).
- `escritura-de-luz-webgl.png`: «Escritura de luz», sólo la estela reciente.

## 6. Lo que no se hizo, o sus límites, con su causa

- **Fotos y video como fuente.** La capa no los lee: graba su palabra propia. C-07 pide el contorno del texto; seguir los bordes de una foto que cambia diez veces por segundo reiniciaría la ruta sin parar. Está documentado en «Límites».
- **Letras animadas** («Cómo se mueven las letras»). Cada fotograma cambia la máscara, y cada cambio que mueve las letras empieza otra ruta. Ninguna receta combina las dos cosas. No está bloqueado en el panel.
- **Letras muy pequeñas.** En textos muy largos, a 96 filas, las partes finas pueden perder contorno. Las recetas de texto usan 128 filas y «Resolución de la simulación» llega a 160. El surco se estrecha con `fit`, que tiene un mínimo de 0,6 para que siga leyéndose en la rejilla de glifos.
- **Tipografía de trazo propia.** No distingue minúsculas. Los caracteres sin glifo (por ejemplo, CJK) dejan hueco; si no queda nada dibujable, graba una figura.
- **Exportaciones probadas.** Por e2e: PNG y HTML de código. GIF y video usan el mismo camino de motor fijo, cubierto por las pruebas del anfitrión (por pasos o de un salto, volver atrás, otras palabras), pero no tienen una e2e propia de esta familia. «Cancelar exportación libera recursos» es del exportador común; no lo toqué ni lo volví a probar aquí.
- **Suites largas.** No corrí `recetas-todas`, `familias.spec.ts` completas ni `verify-exports`: son largas en una máquina compartida. Tampoco la suite unitaria completa.
- **Azar v8.** No incluye esta familia: es trabajo de otro grupo. Los usos están puestos para que pueda tomarla.
- **Rendimiento.** No hice mediciones finas en la máquina compartida. Como orientación, en Node, a 128 filas: paso ≈ 0,05–0,2 ms y dibujo ≈ 2–4 ms. En la misma ejecución, `humo` (96 filas) costaba ≈ 1,5 ms por paso y ≈ 1,7 ms por dibujo. El dibujo tiene una vía rápida para la placa intacta y el humo va a media resolución.
- **Dispositivos.** No hay pruebas en dispositivos reales. Todo se probó en Chromium con SwiftShader.
