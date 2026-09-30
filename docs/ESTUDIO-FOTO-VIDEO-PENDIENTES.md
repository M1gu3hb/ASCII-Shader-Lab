# Estudio de foto y video: pendientes para su próxima fase

Estado desde la fase 5: **en revisión**. El código completo sigue en el repositorio (`src/foto`, `src/project`, `src/anim`, `src/video`, `src/cutout`, `src/fx`, `src/glyphs`) y funciona igual que antes, pero la compilación pública no lo muestra. Este documento reúne lo que hay que resolver antes de volver a publicarlo: las observaciones de quien lo probó, convertidas en tareas concretas, y lo que se encontró al investigar «dibujé un rectángulo y el resto de la imagen desapareció».

## Cómo está en pausa

- Una sola variable decide si el estudio es público: `VITE_FOTO_STUDIO=1` en el entorno de la compilación (o de `npm run dev`). En el código es `FOTO_STUDIO` de `src/shared/site.ts`.
- **Sin la variable (producción):** no hay tarjeta en la portada, ni interruptor «Laboratorio ⇄ Foto y video», ni menú «Llevar al estudio de foto»; la licencia dice que el estudio está en revisión (los datos de los modelos siguen ahí, exactos); `/studio/foto/` no está en el sitemap ni en los datos estructurados. La dirección sigue respondiendo (los enlaces viejos no dan 404) con una página estática «en revisión»: `noindex`, sin scripts, así que no carga el estudio ni abre IndexedDB, y los proyectos guardados de cada persona quedan intactos para cuando vuelva. Las cabeceras COOP/COEP de esa ruta se quedan.
- El laboratorio conserva imagen, video y cámara. Si alguien le suelta un proyecto del estudio (`.glyphos.zip` con `proyecto.glyphos.json`) o un ajuste (`.glyphos-ajuste.json`), dice que es del estudio de foto y video, que está en revisión y que el archivo está intacto, sin botón hacia una página que no funciona.
- **Con `VITE_FOTO_STUDIO=1`** todo queda exactamente como en la fase 4: se comparó una compilación con la variable contra la de `1ccb3dd` y el HTML de todas las páginas, el sitemap y los nombres de los archivos generados son iguales (sólo cambian los hashes).
- En los HTML, los bloques `<!-- @foto-on -->…<!-- @foto-end -->` sólo aparecen con el estudio y los `<!-- @foto-off -->…<!-- @foto-end -->` sólo en pausa (`scripts/seo.ts`). La variable va en el entorno, no en un `.env`: el build se detiene si la encuentra sólo en un `.env`, porque las páginas y el sitemap se generan antes de leer ese archivo y no coincidirían con la app.

## Cómo correrlo

```bash
VITE_FOTO_STUDIO=1 npm run dev                 # http://localhost:5173/studio/foto/
VITE_FOTO_STUDIO=1 npm run build && npx vite preview --port 4173
# pruebas del estudio: en otro puerto, para no reutilizar un servidor compilado sin la variable
VITE_FOTO_STUDIO=1 PW_PORT=4311 npx playwright test foto- --workers=1
VITE_FOTO_STUDIO=1 PW_PORT=4311 npx playwright test escenarios --workers=1   # con los modelos en .cache/modelos
```

Sin la variable, las pruebas `foto-*` se omiten con un mensaje que explica cómo correrlas; `foto-bridge.spec.ts` comprueba entonces la pausa (la página «en revisión», que no hay enlaces y que el laboratorio sigue abriendo imagen, video y cámara). Si `openFoto` encuentra la página «en revisión» con la variable puesta, falla diciendo que el servidor de ese puerto se compiló sin ella.

**Vista previa en Vercel con el estudio** (para la rama que lo conserva), dos opciones:

1. Sin tocar código: en el proyecto `ascii-shader-lab` → Settings → Environment Variables, añadir `VITE_FOTO_STUDIO` = `1` sólo para *Preview* y sólo para esa rama (Vercel permite limitar una variable de Preview a una rama). Producción no la ve.
2. En esa rama, `vercel.json` con `"buildCommand": "VITE_FOTO_STUDIO=1 npm run build"`. Hay que acordarse de no llevar ese cambio a `main`.

En los dos casos, comprobar en la vista previa que `/studio/foto/` abre el estudio y que `/sitemap.xml` lo lista.

## Qué pasa al dibujar un rectángulo (investigación)

**Queja:** «cuando dibujo un rectángulo sobre una foto, parece que el resto de la imagen desaparece».

**Reproducción** (compilación con `VITE_FOTO_STUDIO=1`, Chromium con SwiftShader, foto `tests/fixtures/photos/retrato-pelo.jpg`). Capturas de esta fase, fuera del repositorio, en `scratchpad/phase5/shots/pausa/` (las hizo `scratchpad/phase5/pausa-tools/rect-repro.mjs`):

| Paso | Captura | Lo que se ve |
| --- | --- | --- |
| Foto nueva | `A1-foto-abierta.png` | Una sola capa, «Foto original», seleccionada. Mensaje: «Foto abierta. Añade una capa ASCII o empieza por «Azar»». |
| Rectángulo (M) | `A2-rectangulo-elegido.png` | Aparece la barra de opciones (+ Sumar / − Restar / ∩ Intersecar) y la vista se reencuadra (del 81 % al 74 %): el cuadro salta. |
| Arrastrando | `A3-arrastrando.png` | En cuanto empieza el arrastre, todo lo que queda fuera del rectángulo se vuelve negro. |
| Al soltar | `A4-rectangulo-soltado.png` | Sólo queda la parte de la foto dentro del rectángulo, teñida de bermellón; el resto es el fondo del lienzo (`#0c0b0a`), del mismo color que el área de trabajo. Mensaje: «Rectángulo añadido a la máscara de «Foto original» (sumar)». |
| Con la mano (H) | `A5-sin-herramienta.png` | Sigue igual, y el tinte sigue encima aunque ya no hay herramienta de selección. |
| «Sólo máscara» | `A6-vista-solo-mascara.png` | Todo negro con un rectángulo blanco. |
| Deshacer | — | La foto entera vuelve: nada se perdió. |
| Con una capa ASCII encima | `B2-rectangulo-en-capa-ascii.png`, `B3-sin-herramienta.png` | Lo que la persona esperaba: caracteres sólo dentro del rectángulo y la foto alrededor. |
| Tableta 820 × 1180, con el dedo | `C1-…`, `C2-…`, `C3-tableta-rectangulo-soltado.png` | Lo mismo que en escritorio, y además la foto se ve al 38 %, el panel ocupa media pantalla y el mensaje tapa los controles de zoom. |

**Diagnóstico: no es un error de dibujo; es el comportamiento de las máscaras, mal comunicado y con una trampa en el punto de partida.**

1. Las herramientas de selección no «seleccionan»: añaden una parte a la **máscara de la capa elegida**. Una capa sin máscara se ve entera; con una primera parte «Sumar» se ve sólo dentro de esa parte (`src/project/masks.ts`: «the first part starts from nothing when it adds»). Se exporta igual que se ve.
2. Una foto nueva tiene **una sola capa, la foto**, y está seleccionada (`projectFromImage` y `startEditing`). El primer rectángulo recorta la foto misma. Quien llega a «convertir una zona en ASCII» todavía no tiene ninguna capa ASCII: la herramienta no puede hacer lo que la persona cree.
3. Lo que queda fuera se pinta con el fondo del lienzo, casi negro como el área de trabajo, y el borde del cuadro apenas se ve: parece que la imagen **desapareció**, no que quedó oculta.
4. La vista de máscara rápida («Tinte») tiñe de bermellón al 35 % lo que **sí** se ve, así que la parte que queda también parece alterada. Se muestra mientras hay cualquier herramienta activa, incluida la mano (`maskShown` en `src/foto/ui.ts` cuenta `tool: 'mano'`). «Sólo máscara» cubre la vista entera de blanco y negro.
5. El mensaje habla de «máscara de «Foto original» (sumar)»: es exacto, pero no dice lo que importa («ahora la foto sólo se ve dentro del rectángulo») ni cómo salir («Deshacer» o «Añadir capa ASCII»).
6. Elegir una herramienta cambia el zoom (aparece la barra de opciones y la vista se reencuadra): otro «algo cambió» sin explicación.

**Arreglo recomendado** (en orden):

1. **Que la primera zona sobre una foto sola haga lo que la persona espera.** Si la capa elegida es una foto (o video) y no hay ninguna capa de estilo encima, la primera zona crea una capa ASCII (o de caracteres) encima con esa zona como máscara, y lo dice: «Zona convertida en ASCII: capa «ASCII» nueva sobre tu foto. ¿Querías recortar la foto? Deshacer». Recortar la foto sigue siendo posible eligiendo la capa «Foto» a propósito, con un aviso la primera vez.
2. **Nunca dejar lo oculto con el mismo color que el área de trabajo:** fuera de la máscara de la capa elegida, mientras se edita, mostrar la foto atenuada (al 25–35 %) o el damero de transparencia, y un borde claro del cuadro.
3. **Tinte fuera, no dentro:** teñir lo que queda oculto (como la máscara rápida de los editores de fotos), no lo que se ve; y no mostrarlo con la mano.
4. **Mensajes con consecuencia y salida:** «La foto ahora sólo se ve dentro del rectángulo. Deshacer · Ver toda la foto (desactivar la máscara)».
5. **No reencuadrar al elegir herramienta:** reservar el alto de la barra de opciones o superponerla.
6. Una prueba e2e que cubra el caso: foto nueva → rectángulo → queda una capa ASCII enmascarada y la foto entera se sigue viendo.

## Pendientes, por prioridad

### Prioridad 1: el recorrido

1. **Un recorrido claro de principio a fin.** Hoy el inicio ofrece soltar una foto, cámara, abrir un proyecto y cinco plantillas, y después el editor completo con 15 herramientas, capas, inspector y línea de tiempo a la vez. Proponer un camino guiado de cinco pasos, visible y saltable:
   1. **Sube una foto** (o usa una de muestra).
   2. **Elige una animación ASCII lista:** tarjetas que se mueven, hechas con tu foto (o con la muestra mientras no hay foto).
   3. **Cambia la imagen de muestra por la tuya**, por ejemplo el logo completo de GLYPHOS (`public/brand/glyphos/glyphos-lockup.svg`): un botón «Cambiar imagen» que conserva capas, máscaras y animación.
   4. **Ajusta el recorte:** «Quitar fondo» o una zona, con la foto atenuada alrededor (ver la investigación).
   5. **Exporta:** el formato recomendado según lo que hay (video o GIF si se mueve, PNG si no) y los demás a un toque.
   Criterio de aceptación: alguien que nunca lo usó llega de una foto a un GIF animado en menos de un minuto sin abrir el inspector.
2. **«Azar» no puede quedarse sin hacer nada en el punto de partida.** Con una foto nueva el mensaje invita a «empieza por «Azar»», pero «Azar» responde «No hay nada que el dado pueda cambiar: añade una capa ASCII o de caracteres» (comprobado: `D1-azar-con-solo-la-foto.png`). Con una foto sola, «Azar» debería crear una capa ASCII con un estilo al azar (y decirlo), o el mensaje no debe invitar a usarlo.
3. **El rectángulo que «borra» la foto** (sección anterior): arreglos 1 a 4.

### Prioridad 2: que se entienda

4. **Ejemplos visibles de cómo puede quedar un logo o una foto.** Las miniaturas de las plantillas se dibujan en el navegador sobre el paisaje sintético y tardan: a los 12 s, con GPU por software, una de cinco seguía vacía (`E-inicio-plantillas-escritorio.png`, `E-inicio-plantillas-tableta.png`), y a ese tamaño «Foto → ASCII completo» apenas se distingue. Proponer:
   - una galería de resultados reales, pre-renderizados (imágenes o videos cortos en `public/ex/foto/`, como los carteles de las guías): un retrato, un objeto, un paisaje y el **logo completo de GLYPHOS** con cada plantilla y con dos o tres animaciones;
   - que cada tarjeta muestre antes/después y, al pasar o tocar, la animación.
5. **Animaciones que se relacionen claramente con caracteres o ASCII.** La biblioteca tiene 53 plantillas y 7 variantes (60 entradas; lista completa con `libraryItems()` de `src/anim/library.ts`). Muchas son transiciones genéricas de video que funcionan igual sobre una foto, un texto o una forma y no dicen nada de ASCII. Propuesta: una sección «ASCII» destacada con las que sí lo son, y las demás en «Transiciones» o «Efectos de capa», o reescritas para que actúen sobre los caracteres.
   - **Claramente de caracteres o ASCII (27):** Foto → ASCII, ASCII → Foto, ASCII → Foto por luces, Escritura de terminal, Salida de terminal, Escritura con errores, Borrado, Descifrado, Lluvia de matriz, Lluvia binaria, Cuenta hacia arriba, Cursor que parpadea, Palabras que forman la figura, De grueso a fino, Hasta un solo glifo, Nace de un glifo, Recorrido de estilos, Secuencia de estados, Cambio aleatorio con límites, Regiones que cambian de estilo, Ola de color, Barrido de luz, Transición entre fotos, Desintegración (polvo de caracteres), Barrido de escáner (revuelve los caracteres al pasar), Glitch en franjas (algunos caracteres se vuelven bloques) y Parpadeo foto ⇄ ASCII.
   - **De celdas (12): se leen como ASCII sólo sobre una capa de caracteres** (sobre una foto mueven bloques de píxeles): Espiral, Partes a destiempo, Dispersión, Fragmentar y recomponer, Fragmentos que se unen, Rompecabezas, Imán, Barajar, Lupa, Marquesina, Onda de celdas y Ola de giros. Deberían ofrecerse sólo (o primero) en capas ASCII y de caracteres, y su vista previa debería mostrarlas con caracteres.
   - **Genéricas, sin relación con los caracteres (21):** Iris, Iris que se cierra, Persianas, Encendido de neón, Estroboscopio, Pixelado a nítido, Nítido a pixelado, Semitono que se afina, Tramado que se afina, Cortina, Apagado de televisor, Entrada con estela, Temblor, Respiración, Flotar, Paleta única, Ciclo de paleta, Deriva de tono, Pulso de brillo, Grano y líneas que parpadean, Intercambio de zonas.
6. **Explicar cada herramienta con palabras, no sólo con atajos.** Hoy la barra de herramientas es una columna de iconos con su letra; el nombre y la explicación están en la información emergente, y «Atajos y gestos» (?) es una lista de teclas. Hace falta una explicación corta, visible al elegir cada una (en la barra de opciones y en la hoja del teléfono), de qué hace **en la capa elegida**:

   | Herramienta | Qué hace hoy (texto propuesto, en corto) |
   | --- | --- |
   | Mano (H) | Mueve y acerca la vista; no cambia nada. |
   | Editar partes (V) | Elige una zona ya hecha para moverla, cambiarle el tamaño o borrarla. |
   | Rectángulo (M) / Elipse (O) | Marca una zona con esa forma: la capa elegida se verá sólo ahí (o dejará de verse ahí, con «Restar»). |
   | Polígono (P) | La misma zona, punto a punto. |
   | Lazo (L) | La misma zona, rodeándola a mano alzada. |
   | Contorno preciso (K) | Una zona cuyo borde se pega a los bordes de la foto. |
   | Color (W) | Una zona con todo lo que tiene un color parecido al que tocas. |
   | Pasar a ASCII (B) | Pinta dónde se ve la capa (los caracteres). |
   | Borrar efecto (E) | Pinta dónde deja de verse la capa (vuelve la foto de abajo). |
   | Restaurar original (R) | Pinta dónde se ve la foto original sin ninguna capa encima. |
   | Degradado (G) | Una transición gradual entre la foto y los caracteres. |
   | Objeto (J) | Toca un objeto y la zona se ajusta sola a él (descarga un modelo con tu permiso). |
   | Seguir objeto (T) | En un video, lleva esa zona a lo largo del clip. |
   | Quitar fondo (tijeras) | Separa a la persona o al sujeto del fondo, en tu equipo. |

   Y explicar la idea de fondo una sola vez, con un dibujo: **capas** (la foto abajo, los estilos encima) y **zonas** (dónde se ve cada capa). «Crear una selección» significa exactamente eso: la capa elegida se ve sólo en la zona (Sumar), deja de verse ahí (Restar) o sólo donde coincide con lo anterior (Intersecar). La persona tiene que saber, antes de dibujar, qué capa va a cambiar: nombrarla en la barra de opciones («Zona de: ASCII»).
7. **Qué cambia «Azar», dicho en la interfaz.** Hoy: con «Capa», un estilo nuevo para la capa elegida (en una capa ASCII tira el generador del laboratorio; en una de caracteres, alfabeto, celda, tono y colores); con «Todo», todas las capas ASCII y de caracteres sin candado, los ajustes de los acabados (si «Efectos» no está bloqueado) y, si «Selección» no está conservada, mueve un poco las zonas rectangulares y elípticas. Los candados del laboratorio (forma, color, glifos, movimiento, efectos) y los del estudio (selección, paleta) lo limitan; dentro de una máscara cuida el contraste con la foto. Nada de eso se ve: el botón dice «Azar» y el resultado aparece. Proponer: debajo del botón, «Cambia: estilo de «ASCII»» o «Cambia: todo menos la selección», y en la primera tirada una línea que explique los candados.
8. **Un tutorial visual corto,** de principio a fin con las imágenes de muestra que ya existen (el paisaje sintético de `src/shared/sample.ts`, la guitarra de `tests/fixtures/photos/`, CC0, y el logo de GLYPHOS; el retrato de esa carpeta no: la persona es identificable y sus créditos piden no usarlo para promocionar nada): subir, elegir una animación ASCII, cambiar la imagen por el logo, ajustar el recorte y exportar un GIF. Formato: cinco tarjetas con animación (o un video de 30–45 s grabado con Playwright sobre la compilación real) que se abren desde el inicio y desde «?»; con «reducir movimiento», imágenes fijas.

### Prioridad 3: tableta y detalles

9. **Tableta.** A 820 × 1180 (vertical) el estudio usa el diseño de escritorio: la foto se ve al 38 %, el inspector ocupa casi la mitad del ancho, la barra de opciones de la herramienta se corta («RECTÁNGULO» sin sus reglas) y el mensaje de estado tapa los controles de zoom (`C1-tableta-foto-abierta.png`, `C3-tableta-rectangulo-soltado.png`). Proponer para tabletas (por tamaño y por puntero grueso): el diseño de teléfono con hoja inferior en vertical, o el inspector plegable a un lado en horizontal (1024 × 768); objetivos de 44 px en la barra de herramientas; el lápiz con presión donde ya la hay (pinceles); probar en un iPad y en una tableta Android reales.
10. **El tinte de la máscara con la mano** (`maskShown` cuenta `tool: 'mano'`): con la mano no debería mostrarse, salvo con «Ver la máscara» fijado.
11. **El reencuadre al elegir herramienta** (del 81 % al 74 % en `A1`/`A4`): la vista no debería moverse sola.
12. **Mensajes de estado que tapan controles** en anchos medios (820 px): colocarlos donde no haya controles o apilarlos encima.

## Lo que no se tocó en esta fase

`src/foto/**` quedó sin cambios (ni siquiera `main.tsx`: en pausa, la página no lo referencia y Vite no lo compila). Lo compartido con el laboratorio (`src/foto/handoff.ts`, que usa el enlace `#foto=` del laboratorio, y `src/foto/switch.css`, que el laboratorio importa con el interruptor aunque en pausa no lo dibuje) sigue en su lugar.
