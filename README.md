# Monotrama — ASCII Shader Lab

**Teje luz con caracteres.** Monotrama es un estudio de arte ASCII en tiempo real que corre en el navegador: fondos animados para web, composiciones abstractas, imagen/video/cámara convertidos en caracteres, tipografía interactiva, piezas para terminal y una biblioteca de componentes listos para insertar. Todo lo que haces se puede guardar, reabrir, compartir y exportar como archivo o como código que funciona.

Este repositorio (ASCII Shader Lab) nació del prototipo de un solo archivo que se conserva en [`legacy/ASCII Shader Lab.html`](legacy/ASCII%20Shader%20Lab.html). Sus ajustes JSON se pueden abrir en el estudio nuevo.

- Portada: `/` — identidad, demostraciones en vivo y acceso al estudio.
- Estudio: `/studio/` — el laboratorio.

## Comandos

Requisitos: Node 20 o superior.

```bash
npm install          # dependencias
npm run dev          # desarrollo en http://localhost:5173 (portada) y /studio/
npm run build        # comprobación de tipos + build de producción en dist/
npm run preview      # sirve dist/ en http://localhost:4173
npm test             # pruebas unitarias (Vitest)
npm run test:e2e     # pruebas de punta a punta (Playwright, contra el build)
npm run check        # tipos + unitarias + build
```

Para las pruebas e2e se necesita Chromium de Playwright (`npx playwright install chromium` si no lo tienes). Usan WebGL por software (SwiftShader), así que funcionan también en CI sin GPU.

Páginas de QA útiles durante el desarrollo (sólo en `npm run dev`): `/dev/patterns.html` renderiza los 45 patrones en una rejilla y avisa si alguno no compila; `/dev/scene.html?s=msg|text|words|lines` prueba escenas completas.

## Cómo está hecho

```
src/
  engine/        motor WebGL2 (sin dependencias): receta, catálogo, atlas, shaders, color
  random/        azar con semilla: PRNG, semillas en palabras, arquetipos, paletas, mutación, huellas
  exporters/     formateadores puros: texto/ANSI/HTML/asciicast/scripts, SVG, código web
  runtime/       el motor empaquetado para webs de terceros (Monotrama.mount, <monotrama-field>)
  components/    biblioteca de piezas en JS puro (descifrar, máquina de escribir, imán, estela, halo…)
  studio/        la aplicación del estudio (React + zustand)
  landing/       la portada (HTML estático + islas en TypeScript)
  shared/        tokens de diseño, logo, enlaces compartibles
scripts/runtime-plugin.ts   empaqueta src/runtime con esbuild como módulo virtual
tests/unit, tests/e2e       Vitest y Playwright
```

### Motor (src/engine)

Una **receta** (`Recipe`) es JSON plano que describe una pieza completa: capas de patrones, fuente (patrón, texto, imagen, video, cámara), glifos, tono, color, movimiento, interacción, efectos y mensaje. Todo lo demás —historial, enlaces, exportaciones, código— trabaja sobre recetas.

Cada fotograma pasa por varias etapas en la GPU:

1. **Simulación** (resolución de rejilla, ping-pong en half float si hay soporte): ecuación de onda para las ondas del cursor, estelas de pincel y borrador que se cura.
2. **Campo**: hasta 4 capas de 45 patrones combinadas con 11 modos de mezcla, más la fuente (imagen/video/texto), deformación, pulso rítmico y bucle perfecto por fundido. **El shader se genera por receta con sólo los patrones usados** y se cachea: compila rápido incluso en ANGLE/Windows, donde un único shader gigante con ramas era lento.
3. **Selección** (MRT): tono, posterizado, tramado Bayer/ruido, contornos Sobel, modos de glifo (densidad, líneas, caos, palabras), color por paleta OKLab o de la imagen, y el mensaje literal (máquina de escribir, descifrar, marquesina) con cursor.
4. **Bloom** opcional a resolución de rejilla (barato).
5. **Composición** a resolución completa: el atlas de glifos se dibuja **al tamaño exacto de la celda** (lectura `texelFetch` 1:1, glifos nítidos a cualquier escala), más resplandor, barrido, curvatura CRT, aberración, grano, retícula y la transición de «re-tejido» entre piezas.

Además: lectura de la rejilla de caracteres (para exportar texto/ANSI/SVG idénticos a lo que se ve), calidad adaptativa, pausa fuera de pantalla, recuperación tras pérdida de contexto WebGL y un modo de tamaño fijo para renders fuera de pantalla (exportaciones, miniaturas).

### Azar con memoria (src/random)

- **Semillas legibles** (`faro-lunar-417`; cualquier texto sirve). El PRNG (sfc32 + cyrb128) hace que *misma semilla + mismo espacio + mismo estilo → misma pieza*.
- **Arquetipos**: 12 direcciones de arte (Minimal, Neón, Orgánico, Geométrico, Glitch, Terminal retro, Cósmico, Tinta y papel, Brutalista, Vapor, Sólidos, Op-art, Matemático) con distribuciones coherentes: nada de bloom sobre papel ni pilas de cinco sólidos 3D.
- **Bloqueos por grupo** (forma, color, glifos, movimiento, efectos, fuente). Cada grupo usa su propio flujo derivado de la semilla, así que bloquear uno no altera lo que la semilla produce en los demás.
- **Sin repetir lo visto**: cada resultado tiene una huella visual (patrones, paleta cuantizada, glifos, efectos…); el dado descarta semillas cuya huella ya está en tu historial. No se promete unicidad global, sólo frente a lo que tú ya viste.
- **Historial que nunca se trunca**: tirar desde un resultado antiguo añade al final. Las ediciones enmiendan la entrada actual (con deshacer/rehacer por entrada y «volver al original»). `→` al final del historial tira el dado.
- **Colección** (★) y **enlaces** con la receta completa comprimida en el fragmento `#`, que nunca llega a un servidor.
- **Explorar**: ocho mutaciones del resultado actual renderizadas fuera de pantalla para elegir la siguiente.
- **Modo exposición**: el dado tira solo cada 5–40 s (no interrumpe si estás ajustando algo); con `H` la pieza queda sola en pantalla.

### En vivo

- **Sonido**: el micrófono (sólo al pulsar «Reaccionar al sonido») marca el pulso de la pieza con una envolvente de ataque rápido y caída lenta sobre un umbral de ruido adaptativo. Se analiza en el navegador; nada se graba.
- **Cursor y tacto**: linterna, ondas (ecuación de onda en la GPU), lupa, empuje, remolino, borrador (revela la foto original), pincel y caos; cursor fantasma opcional para fondos sin interacción.

### Exportaciones (y sus límites, dichos claramente)

| Formato | Qué obtienes | Límites |
| --- | --- | --- |
| PNG / WebP / JPEG | Re-render a ×2, ×3, 1080p, 4K, cuadrado, vertical; fondo transparente | — |
| SVG | Contorno real de cada glifo (opentype.js), definido una vez y reutilizado | Sin efectos de píxel (bloom, barrido, curvatura, grano…); caracteres fuera de la fuente quedan como texto |
| MP4 / WebM | Render determinista fotograma a fotograma con WebCodecs (mediabunny) | MP4 sólo si el navegador codifica H.264; la cámara no se puede renderizar offline |
| Grabación en directo | MediaRecorder del lienzo (incluye cursor y cámara) | Calidad según la fluidez del equipo |
| GIF | gifenc, hasta 25 fps y 128 colores por fotograma | Mejor corto y pequeño |
| TXT / ANSI / HTML | Rejilla exacta leída de la GPU; ANSI 16, 256 o color real | — |
| Terminal animada | Scripts Node (`.mjs`) y Python sin dependencias, grabación asciinema (`.cast`) | — |
| Código | HTML para pegar, Web Component, React; motor incluido (~70 KB) sólo con los patrones usados | Tipografía desde Google Fonts salvo «sin dependencias»; cámara no exportable |
| Receta | JSON, enlace, semilla | Las semillas dependen de la versión del generador (`GEN_VERSION`); recetas y enlaces son exactos siempre |

### Privacidad y accesibilidad

- Las imágenes y videos se decodifican en el navegador; no hay subidas ni cuentas. La cámara sólo se solicita al pulsar «Activar cámara» y se apaga al cambiar de fuente. `Permissions-Policy` limita la cámara al propio sitio.
- `prefers-reduced-motion`: el estudio arranca en pausa, las transiciones son instantáneas y los componentes muestran el texto sin animar.
- Controles etiquetados, navegación por teclado (atajos con `?`), anuncios para lectores de pantalla, textos reales ocultos tras los efectos de texto.
- Móvil: panel como hoja inferior, dado e historial al alcance del pulgar.

## Despliegue

Proyecto de Vercel **`ascii-shader-lab`** (framework Vite, salida `dist/`). `vercel.json` define caché inmutable para `/assets/*` y cabeceras de seguridad (CSP, `nosniff`, `Permissions-Policy`).

## Decisiones importantes

- **Vite multipágina + React sólo en el estudio.** La portada es HTML estático (rápida, indexable) con islas en TypeScript; el estudio usa React + zustand con selectores por control para no re-renderizar el panel entero en cada movimiento de un deslizador.
- **WebGL2 obligatorio.** Permite MRT, `texelFetch`, half float y enteros; con más de un 97 % de soporte en 2026. Si falta, se muestra un mensaje claro.
- **El código exportado no depende de `Function.toString()`**: el runtime se empaqueta con esbuild en un módulo virtual; los componentes se exportan desde su fuente real (`?raw`), legible y comentada.
- **Fuentes autoalojadas y sólo el subconjunto latino** en el CSS (el CSS del estudio pasó de 48 KB a 7 KB comprimido).
- **Sin paneles con `backdrop-filter`** sobre el lienzo animado: son caros en GPUs modestas.

## Pendiente / ideas siguientes

- Sincronía con el BPM detectado de una canción (hoy el micrófono sigue el volumen, no el tempo).
- Simulaciones con estado (reacción-difusión, juego de la vida) como capas.
- Guardar opcionalmente la imagen de un favorito en el navegador para reabrirlo con su foto.
- Editor de rampas de caracteres con vista previa de densidad y más estilos de rótulo (fuentes FIGlet).
- Elegir licencia para el proyecto y para el código que se exporta.

## Créditos

Tipografías con licencia SIL OFL: Martian Mono, Inter Tight, Instrument Serif, JetBrains Mono, IBM Plex Mono, Space Mono, Fira Code, VT323, Press Start 2P, Silkscreen. Librerías: React, zustand, idb-keyval, mediabunny, gifenc, opentype.js.
