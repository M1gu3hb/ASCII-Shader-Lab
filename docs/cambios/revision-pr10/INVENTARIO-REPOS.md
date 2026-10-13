# Inventario de referencias para GLYPHOS

Inventario verificable, efecto por efecto, de ocho repositorios de referencia (nueve clones: Butterchurn y sus presets van por separado) y de qué hacer con cada efecto en GLYPHOS, donde todo lo visible es un campo convertido en glifos.

- Fecha del inventario: 10 de octubre de 2026.
- Método: clones superficiales (`git clone --depth 1`) en directorios nuevos bajo `scratchpad/repos/src/<nombre>/`; three.js con `--filter=blob:none --sparse` (sólo `LICENSE`, la lista de nombres de `examples/` y unos pocos archivos leídos). No se ejecutó ningún script, instalador ni build de esos repositorios: sólo lectura con `cat`, `grep`, `find` y `git`. No se modificó ningún archivo de GLYPHOS.
- Comprobaciones adicionales fuera de los ocho repos, porque afectan a licencias: `codrops/RainEffect` (origen del «Rain on Glass» de Radiant) y `kgolid/p5ycho` (origen de Vanta Trunk/Topology), ambos clonados igual y sólo leídos.
- Estado de cada decisión, actualizado al cerrar la revisión del PR #10 (12 de octubre de 2026): «Integrado» dice dónde está; «Sin cambios» y «Descartado» no tocan el código; «Propuesto» son mejoras de patrones clásicos y recetas compuestas que no se hicieron en esta revisión (no son efectos nuevos); C-07 queda aplazado. Nada de lo integrado copia código de estas fuentes: los mecanismos se escribieron desde las descripciones (ver `docs/cambios/REVISION-PR10.md`, licencias).

## 0. Resumen

**186 filas** (Radiant 89 · Paper Shaders 30 · Vanta 14 · The Spirit 1 · WebGLBlobs 1 · ShaderGradient 4 · three.js 31 · Butterchurn 11 · butterchurn-presets 5).

| Decisión | Filas |
|---|---|
| «Duplicado de …» | 81 |
| «Cubierto por V-0x» | 39 (V-01: 5 · V-02: 4 · V-03: 3 · V-04: 1 · V-05: 3 · V-06: 2 · V-07: 3 · V-08: 2 · V-09: 15 · V-10: 1) |
| «Preset nuevo de …» | 22 |
| «Mejora de …» | 21 |
| «Nuevo y distinto → integrar» | 13 filas, agrupadas en **9 candidatos** (§4) |
| «Descartado: incompatible» | 8 |
| «Descartado: licencia/assets» | 2 |

Candidatos nuevos, por orden: C-01 «Lacería» (estrellas y rosetas islámicas), C-02 «Humo rizado» (partículas por ruido rizado, de The Spirit), C-03 «Mar nocturno» (mar en perspectiva con estela de luna), C-04 «Hipercubo» (4D), C-05 «Cámara de niebla» (trazas de Lorentz), C-06 «Osciloscopio que se degrada», C-07 «Grabado láser», C-08 «Marco vivo» (borde luminoso), C-09 «Orden y caos».

Problemas de licencia encontrados (detalle en §8):
1. **Radiant `rain-on-glass.html` y `rain-umbrella.html`** declaran MIT, pero son una reescritura muy cercana de `codrops/RainEffect` (mismos nombres de opciones, misma física y mismo shader). La licencia de RainEffect es la de Codrops: «no republicar, redistribuir ni vender tal cual», no MIT. V-06 debe implementarse desde cero, sin copiar código de ninguno de los dos.
2. **Paper Shaders** es Apache-2.0 sólo desde la versión 0.0.77. De la 0.0.47 a la 0.0.76 fue **PolyForm Shield 1.0.0**. Hay que respetar el `NOTICE` si se adapta código.
3. **ShaderGradient** no tiene archivo `LICENSE`. El MIT sólo se declara en el README y en `package.json`.
4. **Vanta**: Clouds viene de un Shadertoy de Inigo Quilez y Clouds2 de uno de Rune Stubbe; sus licencias de origen no constan. `vendor/FilmGrain_v1.1.frag` es CC BY 3.0 (no se usa en `src/`). `vendor/p5.min.js` va sin cabecera de licencia.
5. **butterchurn-presets**: el MIT es de Jordan Berg, pero los presets son obra de autores de la comunidad MilkDrop. Además, `imageData.js` embebe 6 JPEG sin procedencia. Conviene no copiar presets ni texturas: sólo el mecanismo.
6. **WebGLBlobs**: el `LICENSE` es MIT y `package.json` dice ISC. La fuente Typekit «termina» es de Adobe (remota, no reutilizable).

## 1. Fichas por repositorio

### 1.1 Radiant — https://github.com/pbakaus/radiant
- Revisión: `59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40` · fecha del commit: 2026-09-10T16:16:27-07:00.
- Licencia: `LICENSE` → **MIT License**, «Copyright (c) 2025 Paul Bakaus». El README dice «MIT — Copyright (c) 2025 Paul Bakaus… Attribution is appreciated but not required». Ningún HTML de efecto lleva cabecera de licencia propia.
- Recuento: el README anuncia «94 shaders» (insignia y sección «What's Inside»), pero el registro `src/lib/shaders.ts` tiene **88** entradas y `static/` tiene 89 HTML de primer nivel (los 88 más `video-outro.html`, que no está en el registro). La diferencia de 6 no se pudo explicar con el repositorio: no se inventa nada para cubrirla. `static/learn/` contiene 17 demos de artículos (rain-on-glass, event-horizon, analog-drift).
- Formato: cada efecto es un HTML autocontenido (`<style>` + `<canvas>` + `<script>`), Canvas 2D o WebGL 1, con parámetros por `postMessage`.
- Assets de terceros: **ninguno cargado**. Una búsqueda de `src=`, `href=`, URLs e imágenes en `static/*.html` sólo encuentra la URL de una imagen de Wikimedia citada en un comentario de `navier-stokes.html` («Visual inspiration: C. Fukushima & J. Westerweel, TU Delft»); la imagen no se incluye. Las imágenes `static/og-image.*` y `static/previews` son del propio proyecto.
- Código de terceros embebido: ruido simplex 2D de Ashima Arts en `artpop-iridescence.html` e `ink-dissolve.html` (sólo el comentario «Simplex noise (Ashima Arts)», sin su cabecera de licencia; la del original no se verificó aquí). `flow-field.html` dice «Based on Stefan Gustavson's simplex noise». `rain-on-glass.html` y `rain-umbrella.html` derivan de codrops/RainEffect (ver §8): el registro los acredita como «Inspired by the excellent work of Lucas Bebber», y el artículo `src/lib/articles/rain-on-glass.svelte` dice «The Radiant version is a rewrite… The shape of the algorithm (the bitmap encoding, the physics model, the wet-glass two-background trick) is his».
- Nombres: el campo `inspiration` del registro cita a celebridades y álbumes («Lady Gaga», «Rihanna», «Daft Punk»…; «Artpop» es un álbum). No es un problema de licencia, pero GLYPHOS no debe reutilizar esos nombres.

### 1.2 Paper Shaders — https://github.com/paper-design/shaders
- Revisión: `43cd68db79fa0b1759f72ffc941b3238e2a3954c` · fecha: 2026-09-17T12:44:42+03:00.
- Licencia: `LICENSE` → **Apache License 2.0** (texto estándar; el apéndice deja la plantilla «Copyright [yyyy] [name of copyright owner]» sin rellenar). Los `package.json` raíz, `packages/shaders` y `packages/shaders-react` dicen `"license": "Apache-2.0"`.
- `NOTICE` (raíz y `packages/shaders/NOTICE`): «Powered by Paper Shaders: https://shaders.paper.design».
- Titular: el README dice «Copyright Lost Coast Labs, Inc. (http://paper.design)» y «If you redistribute Paper Shaders code as part of another shader library, plugin, or tool, please preserve the included LICENSE and NOTICE files».
- **Historial de licencia** (CHANGELOG): versión 0.0.47, «Licence changed to PolyForm Shield License 1.0.0»; versión 0.0.77, «License changed to Apache License 2.0. Every package now ships the LICENSE and NOTICE files». El código copiado de las versiones 0.0.47–0.0.76 seguiría bajo PolyForm Shield. Para versiones anteriores a la 0.0.47 el CHANGELOG no dice nada.
- Catálogo: 30 shaders en `packages/shaders/src/shaders/*.ts`. La web los agrupa en «Image Filters» (7), «Logo Animations» (3) y «Effects» (20).
- Créditos por archivo: `perlin-noise.ts` («Original algorithm: https://www.shadertoy.com/view/NlSGDz»), `voronoi.ts` («…/view/ldl3W8»), `neuro-noise.ts` («Original algorithm: https://x.com/zozuar/…»). En ningún caso se indica la licencia de origen. Los archivos que usan V-01, V-03, V-04 y V-10 **no** tienen cabecera ni crédito.
- Assets: `packages/shaders/src/get-shader-noise-texture.ts` embebe una textura PNG de ruido 128×128 en base64; forma parte del paquete Apache. En `docs/public/`: 19 fotos `images/image-filters/*.webp`, `flowers.webp`, miniaturas, y **logos de marcas de terceros** (`images/logos/*.svg`: Apple, Nike, Netflix, NASA…, marcas registradas). Ninguno de esos assets declara licencia: no se reutilizan.

### 1.3 Butterchurn — https://github.com/jberg/butterchurn
- Revisión: `fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e` · fecha: 2026-04-19T18:09:52-07:00.
- Licencia: `LICENSE` → **MIT License**, «Copyright (c) 2013-2018 Jordan Berg». El README agradece a Ryan Geiss (creador de MilkDrop), a Nullsoft y a los autores de presets.
- Assets: `src/image/imageTextures.js` embebe en base64 un JPEG («clouds2») y un GIF de 1×1, sin procedencia declarada. Las texturas de ruido se generan por código (`src/noise/noise.js`). `preview.png` es del proyecto.
- Arquitectura: `src/rendering/renderer.js` (bucle), `shaders/warp.js`, `shaders/comp.js`, `shaders/blur/*`, `waves/*`, `shapes/customShape.js`, `motionVectors/`, `sprites/` (borde, centro oscuro); `src/equations/` ejecuta las ecuaciones de los presets (JS o WASM).

### 1.4 butterchurn-presets — https://github.com/jberg/butterchurn-presets
- Revisión: `c10e2616762f262de898e5d4c1f162a3e01340c1` · fecha: 2021-03-06T20:21:58-08:00.
- Licencia: `LICENSE` → **MIT License**, «Copyright (c) 2013-2018 Jordan Berg»; `package.json` → MIT (versión 3.0.0-beta.4).
- Estructura: `presets/converted/` (504 JSON con `baseVals`, `shapes`, `waves`, `init/frame/pixel_eqs_eel`, `warp`, `comp`), `presets/full/` (504 JSON) y `presets/milkdrop/` (504 `.milk` originales).
- Paquetes: `base.js` 107 (= `minimal.js` 29 + `nonMinimal.js` 78), `extra.js` 186, `image.js` 151, `md1.js` 87, `broken.js` 23, `all.js` (une base, extra, image, md1, minimal y nonMinimal). Entre base, extra, image y md1 hay 472 nombres únicos; 495 si se suma broken.
- Autoría: los nombres de preset citan a autores de la comunidad MilkDrop (Geiss, Flexi, Martin, Rovastar, Aderrasi, Eo.S., Zylot, Krash…). El `LICENSE` sólo nombra a Jordan Berg y los términos individuales no están documentados: se tratan como referencia, nunca como material copiable.
- Texturas: `imageData.js` embebe 6 JPEG en base64 (`cells`, `seaweed`, `smalltiled_lizard_scales`, `prayerwheel`, `lichen`, `cloudsImage`) sin procedencia. 19 presets usan samplers de imagen (`cells`, `seaweed`, `smalltiled_*`, `clouds2`, `moss1`, `rand00`, `pw_mcode1`…), y algunas texturas citadas (por ejemplo `smalltiled_electric_nebula` o `moss1`) no están incluidas. El paquete se llama `image.js` (151 presets), pero el nombre no significa que todos usen texturas.

### 1.5 ShaderGradient — https://github.com/ruucm/shadergradient
- Revisión: `68bdd740037a11c639f8b91fd775949c71d718d0` · fecha: 2026-09-23T12:14:32+09:00.
- Licencia: **no hay archivo LICENSE** en la raíz ni en `packages/`. El README dice «# License — MIT © [ruucm], [stone-skipper]». Los `package.json` de `packages/shadergradient`, `shadergradient-vue` y `ui` dicen MIT. Los únicos archivos de licencia encontrados son ajenos: `apps/examples/example-nextjs/LICENSE` (MIT «Scott Chacon and others», heredado de una plantilla) y `apps/email-previews/.react-email/license.md` (herramienta vendorizada).
- Assets: las HDRI de entorno se cargan desde `https://ruucm.github.io/shadergradient/ui@0.0.0/assets/hdr/` (venice_sunset_1k, kiara_1_dawn_1k, dikhololo_night_1k, empty_warehouse_01_1k, forest_slope_1k, lebombo_1k, studio_small_03_1k, potsdamer_platz_1k, rooitou_park_1k, st_fagans_interior_1k). Los nombres coinciden con HDRI de Poly Haven, pero el repositorio no declara su licencia. `assets/*.gif` son demos propias. El ruido es `glsl-noise` periódico 3D (hughsk), citado por URL en los vertex shaders.
- Mecanismo: mallas `plane`, `waterPlane` y `sphere` con el vértice desplazado por Perlin periódico. El color sale de 3 colores mezclados por posición y altura. Hay 4 familias de shaders: `defaults`, `positionMix`, `cosmic` (interferencia holográfica) y `glass` (Fresnel + refracción), con material físico de three.js y grano.

### 1.6 three.js — https://github.com/mrdoob/three.js
- Revisión: `11738a9d55e502fb484cefffcea3a66dc44e9fe9` · fecha: 2026-10-10T15:52:35+02:00.
- Licencia: `LICENSE` → **The MIT License**, «Copyright © 2010-2026 three.js authors».
- Checkout disperso: `LICENSE`, la lista de nombres de `examples/` (626 entradas) y estos archivos leídos: `webgl_loader_gltf_iridescence`, `webgl_materials_physical_transmission`, `webgl_loader_gltf_dispersion`, `webgpu_caustics`, `webgpu_volume_caustics`, `webgl_gpgpu_water`, `webgl_postprocessing_afterimage`, `webgl_effects_ascii`, `webgl_marchingcubes`, `webgpu_materials_transmission`, `webgl_refraction`, `webgpu_compute_water`, `webgpu_tsl_galaxy`, `webgpu_tsl_angular_slicing`, `webgpu_materialx_noise`, `webgl_materials_cubemap_refraction`, además de `examples/jsm/shaders/AfterimageShader.js` y de `src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js` y `lights_physical_pars_fragment.glsl.js`.
- Nombres que cumplen el filtro pedido (28): webgl_gpgpu_birds, webgl_gpgpu_birds_gltf, webgl_gpgpu_protoplanet, webgl_gpgpu_water, webgl_lights_physical, webgl_loader_gltf_dispersion, webgl_loader_gltf_iridescence, webgl_loader_gltf_transmission, webgl_marchingcubes, webgl_materials_cubemap_refraction, webgl_materials_physical_clearcoat, webgl_materials_physical_transmission, webgl_materials_physical_transmission_alpha, webgl_refraction, webgpu_backdrop_water, webgpu_caustics, webgpu_compute_water, webgpu_lights_physical, webgpu_loader_gltf_dispersion, webgpu_loader_gltf_iridescence, webgpu_loader_gltf_transmission, webgpu_materials_transmission, webgpu_materialx_noise, webgpu_postprocessing_ssr_denoise, webgpu_refraction, webgpu_volume_caustics, webgpu_water, webxr_xr_marchingcubes. Ninguno contiene `thin` ni `feedback`.
- Otros nombres relevantes vistos en la lista (no leídos): webgl_shaders_ocean, webgl_shaders_sky, webgpu_ocean, webgpu_sky, webgl_postprocessing_glitch, webgl_postprocessing_pixel, webgl_postprocessing_rgb_halftone, webgpu_tsl_halftone, webgl_postprocessing_unreal_bloom, webgpu_tsl_raging_sea, webgpu_tsl_procedural_terrain, webgpu_tsl_vfx_flames, webgpu_tsl_vfx_tornado, webgpu_compute_particles_fluid.
- Assets de los ejemplos: no se descargaron. Cada ejemplo cita los suyos y sus licencias no se verificaron. Por ejemplo, la lámpara IridescenceLamp viene de «KhronosGroup glTF-Sample-Models», Caustic_Free.jpg está en `textures/opengameart/`, y también aparecen Lucy100k.ply, duck.glb, HDR y cubemaps. **Ninguna propuesta de este inventario necesita esos assets.**

### 1.7 The Spirit — https://github.com/edankwan/The-Spirit
- Revisión: `c2ed239be0d7ed4ba28acf42dae42de994d37b8a` · fecha: 2016-07-12T17:27:41+01:00.
- Licencia: `LICENSE.md` → **The MIT License (MIT)**, «Copyright (c) 2015 Edan Kwan»; el README dice «This experiment is under MIT License» y `package.json` dice MIT.
- Assets: `app/js/three.r74.min.js` (three.js, MIT), `app/images/screenshot.jpg`, `logo.png` y `share.jpg` (propios), y `src/controls/OrbitControls.js` (autores de three.js).
- Créditos: la técnica de «the new particles» es de Simo Santavirta y la idea se inspira en «Flow» de David Li. Es un crédito de idea, no código incluido.

### 1.8 Vanta — https://github.com/tengbao/vanta
- Revisión: `f8b351906688b56f0fc744e53bde81fc3c56f150` · fecha: 2023-01-12T10:31:31+08:00.
- Licencia: `LICENSE.md` → texto MIT sin título, «Copyright 2020 Teng Bao»; `package.json` → MIT.
- Efectos (14): birds, cells, clouds, clouds2, dots, fog, globe, halo, net, rings, ripple, topology, trunk, waves (`src/vanta.*.js` y `dist/*.min.js`).
- Origen de terceros, según las cabeceras de los archivos y la sección «Credits» del README:
  - birds: «Adapted from threejs.org/examples/canvas_geometry_birds» y «Birds effect from webgl_gpgpu_birds by @zz85» (three.js, MIT); su geometría está «Based on openprocessing visualID=6910» (licencia no indicada).
  - fog: «Original effect by Patricio Gonzalez Vivo» (Book of Shaders, cap. 13); el ruido está «Based on Morgan McGuire, shadertoy 4dS3Wd». Licencias de origen no indicadas.
  - clouds: «Clouds effect from https://www.shadertoy.com/view/XslGRr by Inigo Quilez». Licencia de origen no indicada ni verificada.
  - clouds2: «from https://www.shadertoy.com/view/lsBfDz by Rune Stubbe». Licencia de origen no indicada. Además, `texturePath: "./gallery/noise.png"` no está en la rama principal.
  - trunk y topology: «Original effect by Kjetil Midtgarden Golid», de `kgolid/p5ycho`. **Verificado: MIT, «Copyright (c) 2017 Kjetil Midtgarden Golid»** (§1.10).
- `vendor/`: `three.r134.min.js` (cabecera «Copyright 2010-2021 Three.js Authors, SPDX MIT»), `GPUComputationRenderer.js` (complemento de three.js de zz85), `p5.min.js` (sólo trae «p5.js v0.6.1»; el proyecto p5.js se publica bajo LGPL-2.1 según su repositorio, cosa que no se verificó en este clon) y `FilmGrain_v1.1.frag` («This work is licensed under a Creative Commons Attribution 3.0 Unported License», de Martins Upitis, 2013; no se usa en `src/`).

### 1.9 Codrops WebGLBlobs — https://github.com/codrops/WebGLBlobs
- Revisión: `613a5baea7c2169ab42e5a335887d5475ad96079` · fecha: 2021-01-25T16:17:15+00:00.
- Licencia: `LICENSE` → **MIT License**, «Copyright (c) 2009 - 2020 [Codrops](https://tympanus.net/codrops)»; el README dice «License: MIT». **Discrepancia**: `package.json` dice `"license": "ISC"`.
- Autoría: tutorial de Mario Carrillo.
- Assets: `img/noise.png` (fondo CSS, licencia no indicada); la fuente «termina» se carga desde Adobe Typekit (`use.typekit.net/dmq3uhj.css`), con licencia de Adobe, remota y no reutilizable; `dist/` contiene artefactos compilados.
- Dependencias declaradas: three ^0.123, gsap ^3.5.1, glsl-noise y glsl-rotate.

### 1.10 Orígenes comprobados fuera de los ocho repos
- `codrops/RainEffect` @ `5270be663903883ae585858216b656120d8d4cd5` (2017-02-11T14:19:40+08:00). No hay archivo LICENSE. El README dice «Integrate or build upon it for free in your personal or commercial projects. Don't republish, redistribute or sell "as-is". Read more here: http://tympanus.net/codrops/licensing/», y `package.json` dice `"license": "SEE LICENSE IN http://tympanus.net/codrops/licensing/"`.
- `kgolid/p5ycho` @ `9fb448de863f0c5255d8b8b8660bc2be77771ad5` (2020-07-31T15:38:53+02:00): `LICENSE` → MIT License, «Copyright (c) 2017 Kjetil Midtgarden Golid».

## 2. Lo que GLYPHOS ya tiene (base de las equivalencias)

Leído sin modificar en `src/engine/catalog.ts`, `src/studio/recipes/catalog.ts`, `src/studio/presets.ts`, `src/studio/scenes.ts`, `src/families/meta/*.ts`, `src/fx/catalog.ts`, `src/engine/glsl/patterns*.ts` y `src/engine/glsl/particles.ts`.
- **102 patrones clásicos** (campo escalar 0..1 → glifo, con color por paleta y `color.map`):
  - Orgánico (14): `nube`, `marmol`, `crestas`, `fuego`, `aurora`, `causticas`, `lava`, `celulas`, `grietas`, `dunas`, `bruma_lejana`, `luciernagas`, `bambu`, `estrella_mar`.
  - Geométrico (14): `anillos`, `cuadros`, `rayos`, `tablero`, `truchet`, `hex`, `trama`, `moire`, `rombos`, `franjas`, `caleido`, `circuitos`, `entrelazado`, `quasicristal`.
  - Ondas (13 + `radar`): `ondas`, `interferencia`, `plasma`, `lissajous`, `ecualizador`, `horizonte`, `topografia`, `mareas_lentas`, `jardin_zen`, `lluvia_mansa`, `respiracion`, `estuario`, `campo_flujo`.
  - Espacio (6): `tunel`, `espiral`, `estrellas`, `hiper`, `galaxia`, `rejilla`.
  - Sólidos 3D por raymarching (23): `dona`, `esfera`, `cubo`, `nudo`, `poliedro`, `giroide`, `moebius`, `adn`, `planeta`, `voxeles`, `metabolas` («Metal líquido»), `engranajes`, `cristales`, `obelisco`, `prisma`, `reloj_arena`, `simbiosis`, `pendulos`, `cinta_ola`, `jade_vivo`, `caliz`, `medusa`, `esferas_orbita`.
  - Matemático (13): `julia`, `rosa`, `degradado`, `mandelbrot`, `sierpinski`, `filotaxis`, `espirografo`, `lemniscata`, `superformula`, `armonografo`, `catenaria`, `apolonio`, `flor_armonica`.
  - Formas (3): `forma`, `estrella`, `latido`.
  - Señal: `lluvia`, `glitch`, `ruido`.
  - Partículas analíticas (12): `enjambre_vivo`, `estela_cometas`, `lluvia_ascendente`, `orbitas_gemelas`, `corazon_particulas`, `cardumen_luz`, `vortice_polvo`, `ondas_estelares`, `mariposa_puntos`, `nieve_orbital`, `floracion_luz`, `constelacion_dinamica`.
- **23 familias** con presets propios: `reaccion_difusion`, `physarum`, `lenia`, `automata`, `kuramoto`, `dla`, `crecimiento`, `fluido`, `agua`, `erosion`, `boids`, `gravedad`, `tela`, `chladni`, `sistema_l`, `atractor`, `wfc`, `hiperbolico`, `fractal_3d`, `nubes_vol`, `orbitales`, `lente_gravitacional`, `campos_em`. Ejemplos de presets: `fluido:tinta_agua/humo_neon/tormenta/pilares`, `tela:velo/bandera/membrana`, `nubes_vol:banco/nebulosa/haces`, `campos_em:dipolo/repulsion/helmholtz/cuadrupolo/iman`, `erosion:barrancos/delta/mesetas`.
- **Transformaciones de fuente** (`xform`): semitono, contorno, bandas, arrastre, desplazar, caleido, ondular, estela, canales, bloques.
- **Acabados** (`src/fx`): dither (17 algoritmos), halftone (también CMYK), crosshatch, pixelate, edges, levels, threshold, posterize, invert, mono, duotone, palette, chroma, glow, shadow, vignette, motionblur, blur, sharpen, grain, noise, scanlines.
- **Efectos de receta** (`fx`): glow, bloom, scan, vig, curve, chroma, grain, flicker, cellBg, grid.
- **Interacciones**: linterna, ondas, lupa, empuje, remolino, borrador, pincel, caos, rastro, florecer, anillos, chispas, estirar, revelar, zoom, imán, seguir; todas con puntero fantasma (`auto`).
- **Recetas y escenas**: 98 recetas en 5 espacios (`fondos`, `arte`, `media`, `tipo`, `terminal`) (por ejemplo `arte/magma`, `arte/vapor`, `arte/mercurio`, `arte/corrupto`, `arte/geoda`, `arte/mecanismo`) y 28 escenas (por ejemplo `escena:bruma-estelar`, `escena:eclipse-fragmentado`).
- **No existe** realimentación de fotograma (el motor sólo menciona «feedback loop» para evitarlo), ni color por celda independiente de la paleta, ni efectos de marco o perímetro, ni partículas por miles con estado.
- **Direcciones planificadas** (contadas como «Cubierto por» cuando corresponden): V-01 Corrientes de color · V-02 Membrana iridiscente · V-03 Cromado en tramas · V-04 Paneles prismáticos · V-05 Mosaico cinético · V-06 Lluvia sobre vidrio · V-07 Superficie que se abre y reconstruye · V-08 Descargas eléctricas · V-09 Ecos y realimentación · V-10 Vidrio acanalado.

## 3. Tablas efecto por efecto

Leyenda de licencias abreviadas (detalle en §1):
«MIT·R» = MIT, «Copyright (c) 2025 Paul Bakaus» (LICENSE de Radiant); el HTML es autocontenido y no carga assets externos.
«Apache·P» = Apache-2.0 + NOTICE («Powered by Paper Shaders»), titular según README: Lost Coast Labs, Inc.
«MIT·V» = MIT (LICENSE.md de Vanta, «Copyright 2020 Teng Bao»). «MIT·3» = MIT, «Copyright © 2010-2026 three.js authors». «MIT·B» = MIT, «Copyright (c) 2013-2018 Jordan Berg».

Notación de equivalentes: `id` = patrón de `src/engine/catalog.ts`; `familia:preset` = familia de `src/families/meta`; `arte/id`, `fondos/id`… = receta de `src/studio/presets.ts`; `escena:id` = `src/studio/scenes.ts`; `xform:id` = transformación de fuente; `acabado:kind` = acabado de `src/fx/catalog.ts`; `fx:campo` = efecto de receta (`glow`, `bloom`, `scan`…); `interact:modo` = interacción.

### 3.1 Radiant (89 filas: 88 del registro `src/lib/shaders.ts` + `static/video-outro.html`)

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| radiant · static/flow-field.html | Partículas 2D que siguen el ángulo de un campo de ruido simplex con semilla y dejan estelas sobre un lienzo que se desvanece. | MIT·R (ruido «basado en Stefan Gustavson») | `campo_flujo` | `campo_flujo` son senos regulares; aquí las líneas se enredan y cambian con el ruido | Orgánicas | «Mejora de campo_flujo»: líneas de corriente de un campo de ruido (ángulo = 2π·ruido(p, t)) integradas con estela, en vez de senos | Propuesto; no hecho en esta revisión |
| radiant · static/topographic.html | Relieve fBm; isolíneas por marching squares con interpolación en las aristas y etiquetas de cota. | MIT·R | `topografia` | Sólo las etiquetas numéricas | Orgánicas | «Duplicado de topografia» | Sin cambios: ya existe |
| radiant · static/generative-tree.html | Árbol de ramificación recursiva (tipo sistema L) que crece, se mece con el viento y rebrota en ciclo; partículas en las puntas. | MIT·R | `sistema_l` (modelo `arbusto`, crecimiento y viento) | Ninguna sustancial en glifos | Orgánicas | «Duplicado de sistema_l» | Sin cambios: ya existe |
| radiant · static/strange-attractor.html | Integra Lorenz para varias partículas, rota en 3D y proyecta con estelas. | MIT·R | `atractor:lorenz` | — | Arte-figuras 3D | «Duplicado de atractor:lorenz» | Sin cambios: ya existe |
| radiant · static/pendulum-wave.html | N péndulos con períodos T_k = ciclo/(base + k): la fila forma ondas, se desfasa y se recompone. | MIT·R | `pendulos` | 2D y más péndulos frente a 9 bolas en 3D | Arte-figuras 3D | «Duplicado de pendulos» | Sin cambios: ya existe |
| radiant · static/phyllotaxis.html | Puntos en ángulo áureo (r ∝ √n) unidos a vecinos de Fibonacci, inclinación pseudo-3D. | MIT·R | `filotaxis` | Las uniones entre puntos | Geométricas | «Duplicado de filotaxis» | Sin cambios: ya existe |
| radiant · static/fluid-amber.html | fBm simplex con doble «domain warping», paleta cálida. | MIT·R | `marmol` | — | Fondos | «Duplicado de marmol» | Sin cambios: ya existe |
| radiant · static/champagne-fizz.html | Burbujas que nacen en puntos de nucleación fijos, suben con bamboleo, varían de tamaño y estallan arriba. | MIT·R | `lluvia_ascendente` | Origen en puntos fijos, bamboleo, estallido | Fondos | «Preset nuevo de lluvia_ascendente»: 5–8 columnas de origen fijo en el fondo, estela corta, charset `geometria` (∘○◎) y paleta ámbar | Propuesto; no hecho en esta revisión |
| radiant · static/sugar-glass.html | Dos capas de Voronoi (distancia al borde) con paralaje + luz que sangra por las grietas + leve calima. | MIT·R | `grietas` | El paralaje equivale a dos capas de `grietas` a distinta escala | Geométricas | «Duplicado de grietas» | Sin cambios: ya existe |
| radiant · static/resonant-strings.html | Cuerdas verticales cuya flecha es suma de modos estacionarios sin(nπy)·cos(ωₙt) + pulsos que decaen; polvo de resina. | MIT·R | `catenaria` (curvas tendidas fijas) | Modos que vibran en vez de curvas quietas | Geométricas | «Mejora de catenaria»: modo «cuerda vibrante» (forma = suma de 2–4 armónicos con envolvente y pellizco periódico) | Propuesto; no hecho en esta revisión |
| radiant · static/chladni-resonance.html | Líneas nodales de cos(nπx)cos(mπy) − cos(mπx)cos(nπy) que cambian de modo; arena en los nodos. | MIT·R | `chladni:placa` | — | Geométricas | «Duplicado de chladni:placa» | Sin cambios: ya existe |
| radiant · static/kinetic-grid.html | Malla de nodos unidos por muelles (integración explícita) a la que entran impulsos por los bordes; color por tensión. | MIT·R | `tela:membrana` | Anclada por todo el borde, sin gravedad, golpes periódicos | Geométricas | «Preset nuevo de tela»: anclaje `borde`, gravedad 0, vista `malla`, rigidez alta, golpe periódico desde un borde al azar | Propuesto; no hecho en esta revisión |
| radiant · static/strobe-geometry.html | Triángulos, rombos, hexágonos (SDF) que destellan en secuencia y dejan una imagen persistente que decae de cian a magenta. | MIT·R | ninguno (GLYPHOS no tiene realimentación) | Persistencia con giro de tono | Geométricas | «Cubierto por V-09» (formas semilla + decaimiento con giro de tono) | Integrado: familia `ecos` («Ecos y realimentación») |
| radiant · static/laser-labyrinth.html | Conos de luz volumétricos desde emisores que barren dentro de una niebla fBm; tono que rota; destellos en los cruces. | MIT·R | `rayos`, `nubes_vol:haces` | Haces finos que entran desde los bordes y se cruzan | Fondos | «Preset nuevo de rayos»: 3 capas de `rayos` estrechos con centros en los bordes, barrido lento, `nube` en `multiply` como niebla | Propuesto; no hecho en esta revisión |
| radiant · static/bass-ripple.html | Malla hexagonal de altavoz desplazada por ondas concéntricas con ataque/decaimiento por golpe + modos de parche; especular. | MIT·R | `lluvia_mansa`, `ondas` | Ritmo de golpe | Fondos | «Duplicado de lluvia_mansa» | Sin cambios: ya existe |
| radiant · static/ink-dissolve.html | fBm con doble warping que forma zarcillos de tinta con borde brillante analítico. | MIT·R (incluye simplex de Ashima Arts sin su cabecera) | `marmol`, `fluido:tinta_agua` | — | Orgánicas | «Duplicado de marmol» | Sin cambios: ya existe |
| radiant · static/sequin-wave.html | Teselado hexagonal de discos; cada disco se inclina según un campo de ondas que interfieren; especular y destello. | MIT·R | ninguno | Lentejuelas que giran en ola | Geométricas | «Cubierto por V-05» (mosaico cinético con celdas hexagonales y campo de ondas en vez de barrido) | Integrado: familia `mosaico` («Mosaico cinético») |
| radiant · static/gilt-mosaic.html | Teselas con normal aleatoria que voltean en olas (perspectiva: el ancho se escala por el valor absoluto de cos θ), lechada, 3 luces móviles, onda radial al hacer clic. | MIT·R | ninguno | — | Geométricas | «Cubierto por V-05» (fuente) | Integrado: familia `mosaico` («Mosaico cinético») |
| radiant · static/gilded-fracture.html | Voronoi con warping (vecindad 5×5) que revela grietas progresivamente; oro fundido que sangra; polvo dorado. | MIT·R | `grietas` | Grietas que aparecen y crecen en el tiempo, relleno incandescente | Orgánicas | «Mejora de grietas»: aparición progresiva (umbral que avanza desde un origen) y relleno brillante | Propuesto; no hecho en esta revisión |
| radiant · static/radiant-geometry.html | Estrellas y rosetas islámicas de 6 y 8 puntas por pliegue polar + segmentos SDF, teselado hexagonal/cuadrado y mandala; capas que contrarrotan. | MIT·R | `caleido`, `quasicristal`, `hex` (no equivalen) | Lacería de líneas: no existe | Geométricas | «Nuevo y distinto → integrar» (candidato C-01 «Lacería») | Integrado: familia `laceria` |
| radiant · static/golden-throne.html | Mandala de capas con repetición angular, pétalos de «flor de la vida», espirales áureas y anillos que contrarrotan. | MIT·R | `flor_armonica`, `rosa`, `anillos` | Varias capas concéntricas a velocidades opuestas | Geométricas | «Preset nuevo de flor_armonica»: 3 capas (`flor_armonica` + `rosa` + `anillos`) a escalas 0,5/1/1,6 con velocidades de signo opuesto | Propuesto; no hecho en esta revisión |
| radiant · static/sacred-strange.html | Motivo estrella/roseta configurable (N, profundidad del zigzag) teselado + motivo central, con mezcla entre ambos. | MIT·R | ninguno | — | Geométricas | «Nuevo y distinto → integrar» (mismo candidato C-01: modo «central ↔ teselado») | Integrado: familia `laceria` |
| radiant · static/tropical-heat.html | fBm con warping como calima que desplaza la imagen; canales RGB desplazados distinto; paleta tropical. | MIT·R | `xform:desplazar` + `xform:canales` | — | Imagen-efectos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| radiant · static/neon-drip.html | Campo de metabolas 2D (inversa de la distancia) que suben en grupos con zarcillos. | MIT·R | `lava` | Emisión ascendente | Orgánicas | «Duplicado de lava» | Sin cambios: ya existe |
| radiant · static/voltage-arc.html | Arcos entre 4 conductores en órbita: línea central desplazada por ruido perpendicular con atenuación en los extremos, brillo 1/d², ramas; el cursor es un 5.º conductor. | MIT·R | ninguno (`dla:raices` es estático) | — | Fondos | «Cubierto por V-08» (fuente) | Integrado: familia `descargas` («Descargas eléctricas») |
| radiant · static/moonlit-ripple.html | Mar en perspectiva (rayo–plano) con olas multidireccionales y normales analíticas; reflejo Fresnel de una luna con cráteres. | MIT·R | `agua` (simulación interactiva), `mareas_lentas` | Horizonte con estela de luz centelleante | Fondos | «Nuevo y distinto → integrar» (candidato C-03 «Mar nocturno») | Integrado: familia `mar` |
| radiant · static/eclipse-glow.html | Disco negro con corona de rayos fBm polares asimétricos, anillo de diamante, viento solar y estrellas. | MIT·R | `rayos` + `planeta` | Corona de ruido polar alrededor de un disco | Arte-figuras 3D | «Preset nuevo de rayos»: `rayos` lentos + `forma` circular en `cutout` en el centro + `estrellas` en `screen` | Propuesto; no hecho en esta revisión |
| radiant · static/diamond-caustics.html | Facetas de talla brillante (anillos × sectores) que giran, color espectral por faceta, centelleo y estrella. | MIT·R | `caleido`, `poliedro` | Facetas que centellean | Geométricas | «Preset nuevo de caleido»: 8–16 espejos sobre `rombos`, giro lento, paleta con `cycle` para el centelleo | Propuesto; no hecho en esta revisión |
| radiant · static/rain-on-glass.html | Gotas simuladas en CPU (momento, estelas, fusión por área) estampadas en un mapa de refracción; el shader refracta un fondo nítido dentro de cada gota sobre un fondo desenfocado. | MIT declarado, pero derivado de codrops/RainEffect (licencia Codrops; ver §8) · sin assets (ciudad procedural) | ninguno | — | Imagen-efectos | «Cubierto por V-06» (fuente; implementar desde cero) | Integrado: vidrio delante `lluvia` (recipe.optics) |
| radiant · static/rain-umbrella.html | El mismo sistema de gotas sobre una cúpula translúcida con varillas que deforman la refracción y deriva de caminar. | ídem rain-on-glass | ninguno | Cúpula y varillas | Imagen-efectos | «Cubierto por V-06» (variante «paraguas») | Integrado: vidrio delante `lluvia` (recipe.optics) |
| radiant · static/metamorphosis.html | Metabolas 3D por raymarching (smooth-min de elipsoides), mapa de entorno, Fresnel, AO y sombra suave. | MIT·R | `metabolas` (`arte/mercurio`) | — | Arte-figuras 3D | «Duplicado de metabolas» | Sin cambios: ya existe |
| radiant · static/artpop-iridescence.html | Altura ondulante (senos + fBm con doble warping); grosor de película → color por coseno RGB desfasado 120°, Fresnel y dos especulares; tres burbujas enmascaradas. | MIT·R (simplex de Ashima Arts sin cabecera) | ninguno | — | Fondos | «Cubierto por V-02» (fuente) | Integrado: familia `membrana` («Membrana iridiscente») |
| radiant · static/silk-groove.html | Campo de altura de seda (pliegues dirigidos + fBm) iluminado por su normal con especular. | MIT·R | `mareas_lentas`, `cinta_ola` | Brillo especular por normal | Fondos | «Mejora de mareas_lentas»: relieve especular (normal del campo + Blinn) que da el aspecto de seda | Propuesto; no hecho en esta revisión |
| radiant · static/gilt-thread.html | Hilos que recorren Lissajous/rosa/espirógrafo/mariposa en un buffer circular; brillo metálico por tangente; chispa en la punta. | MIT·R | `espirografo`, `lissajous`, `rosa` | Brillo por tangente | Geométricas | «Duplicado de espirografo» | Sin cambios: ya existe |
| radiant · static/event-horizon.html | Agujero negro de Schwarzschild: geodésicas por Verlet, disco de Novikov–Thorne, Doppler. | MIT·R | `lente_gravitacional:disco` | — | Arte-figuras 3D | «Duplicado de lente_gravitacional:disco» | Sin cambios: ya existe |
| radiant · static/burning-film.html | Umbral de fBm que baja durante el ciclo: agujeros que se queman con borde incandescente, brasas, perforaciones de película, grano. | MIT·R | ninguno | — | Imagen-efectos | «Cubierto por V-07» (máscara que se abre con borde incandescente; preset «película que arde») | Integrado: familia `desgarro` («Superficie que se abre») |
| radiant · static/vertigo.html | Túnel de anillos y segmentos angulares a profundidad constante con olas de iluminación. | MIT·R | `tunel` | — | Fondos | «Duplicado de tunel» | Sin cambios: ya existe |
| radiant · static/stardust-veil.html | Capas de estrellas con paralaje + nebulosa fBm + cintas de aurora + hilos de constelación. | MIT·R | `estrellas` + `aurora` + `constelacion_dinamica` (`escena:bruma-estelar`) | — | Fondos | «Duplicado de estrellas» (la composición ya es posible por capas) | Sin cambios: ya existe |
| radiant · static/silk-cascade.html | Varias capas de tela translúcidas con especular anisótropo (Kajiya–Kay) y paralaje. | MIT·R | `mareas_lentas` | Vetas de brillo anisótropo | Fondos | «Mejora de mareas_lentas»: brillo anisótropo (vetas) además del relieve especular | Propuesto; no hecho en esta revisión |
| radiant · static/smolder.html | Temperatura radial con turbulencia y distorsión por derivadas de fBm, brasas, mapa de color térmico. | MIT·R | `fuego` | Calor que irradia desde el centro | Orgánicas | «Preset nuevo de fuego»: `fuego` + `respiracion` en `screen`, `color.map` radial, `luciernagas` como brasas | Propuesto; no hecho en esta revisión |
| radiant · static/signal-decay.html | Formas de onda (armónicos) que se degradan: recorte suave/duro, bit-crush, FM, ruido. | MIT·R | `ecualizador`, `lissajous` (no equivalen) | Traza temporal que se corrompe | Texto-Terminal | «Nuevo y distinto → integrar» (candidato C-06 «Osciloscopio que se degrada») | Integrado: familia `osciloscopio` |
| radiant · static/neon-revival.html | Formas SDF de tubo de neón (corazón, estrella, arcos) con parpadeo eléctrico, encendido, goteo de luz y reflejo en pared. | MIT·R | `forma`, `estrella`, `latido` + `fx:glow`/`fx:flicker` | Zumbido y encendido | Geométricas | «Preset nuevo de forma»: contorno fino, `fx.glow` alto, `fx.flicker`, fondo de pared oscura con `fx.vig` | Propuesto; no hecho en esta revisión |
| radiant · static/lipstick-smear.html | Fluidos estables (advección, divergencia, presión, vorticidad) con emisores de tinte y brillo metálico. | MIT·R | `fluido:tinta_agua` | Emisores que trazan lazos | Orgánicas | «Preset nuevo de fluido»: 2–3 emisores de tinte en órbita, vorticidad alta, vista `tinta` | Propuesto; no hecho en esta revisión |
| radiant · static/glitter-storm.html | Miles de escamas con orientación que gira; destello cuando su normal mira a focos que rotan. | MIT·R | `luciernagas`, `estrellas` (centelleo aleatorio) | Destello por orientación | Fondos | «Cubierto por V-05» (variante sin rejilla: escamas sueltas que voltean) | Integrado: familia `mosaico` («Mosaico cinético») |
| radiant · static/rubber-reality.html | Membrana que se hunde bajo atractores móviles (cráter con borde) y deforma una rejilla iluminada. | MIT·R | `tela:membrana` | — | Geométricas | «Duplicado de tela:membrana» | Sin cambios: ya existe |
| radiant · static/magma-core.html | Magma con warping, grietas de fBm crestado, placas Voronoi, mapa térmico, partículas de erupción. | MIT·R | `arte/magma` (`fuego` + `crestas`) | Placas de corteza | Orgánicas | «Duplicado de arte/magma» | Sin cambios: ya existe |
| radiant · static/clockwork-mind.html | Engranajes entrelazados con engrane correcto y render metálico. | MIT·R | `engranajes` (`arte/mecanismo`) | — | Arte-figuras 3D | «Duplicado de engranajes» | Sin cambios: ya existe |
| radiant · static/edge-of-chaos.html | Gray–Scott a 256² que forma laberinto con borde dorado, estallido y regeneración, bloom. | MIT·R | `reaccion_difusion:laberinto` | — | Orgánicas | «Duplicado de reaccion_difusion:laberinto» | Sin cambios: ya existe |
| radiant · static/spark-chamber.html | Partículas cargadas con fuerza de Lorentz en un campo B, pierden energía (espirales), estelas y destellos. | MIT·R | ninguno | — | Texto-Terminal | «Nuevo y distinto → integrar» (candidato C-05 «Cámara de niebla») | Integrado: familia `niebla` |
| radiant · static/shifting-veils.html | Capas translúcidas de ruido con warping compuestas de atrás adelante con un color por capa. | MIT·R | `bruma_lejana` | — | Fondos | «Duplicado de bruma_lejana» | Sin cambios: ya existe |
| radiant · static/crystal-lattice.html | Prismas hexagonales con punta piramidal por raymarching que crecen; tinte de refracción y brillos. | MIT·R | `cristales` (`arte/geoda`) | — | Arte-figuras 3D | «Duplicado de cristales» | Sin cambios: ya existe |
| radiant · static/kaleidoscope-runway.html | Pliegue en N espejos de rayas, chevrones, rombos y triángulos. | MIT·R | `caleido` | — | Geométricas | «Duplicado de caleido» | Sin cambios: ya existe |
| radiant · static/digital-rain.html | Columnas de caracteres que caen y, al tocar una línea de agua, crean ondas (simulación 1D). | MIT·R | `lluvia` + `lluvia_mansa` | Línea de agua abajo | Texto-Terminal | «Preset nuevo de lluvia»: `lluvia` arriba + `lluvia_mansa` en `mask` sólo en la franja inferior | Propuesto; no hecho en esta revisión |
| radiant · static/neon-drive.html | Synthwave: sol con rendijas, carretera en rejilla con perspectiva, montañas, faros. | MIT·R | `rejilla` (`arte/vapor`) | Faros | Fondos | «Duplicado de rejilla» | Sin cambios: ya existe |
| radiant · static/liquid-gold.html | Campo de altura con triple warping + bultos de metabolas, sombreado metálico con Fresnel. | MIT·R | `marmol`, `lava` | Relieve metálico | Orgánicas | «Mejora de marmol»: relieve especular metálico (normal del campo + Fresnel) | Propuesto; no hecho en esta revisión |
| radiant · static/aurora-veil.html | Cintas de aurora + cristales de hielo hexagonales + estrellas. | MIT·R | `aurora` + `hex` | — | Fondos | «Duplicado de aurora» | Sin cambios: ya existe |
| radiant · static/bioluminescence.html | Oleaje nocturno multidireccional; las crestas encienden plancton; medusas que laten. | MIT·R | `medusa`, `luciernagas` | Chispas que dependen de la cresta | Fondos | «Nuevo y distinto → integrar» (preset «Plancton» del candidato C-03) | Integrado: familia `mar` |
| radiant · static/gothic-filigree.html | Ornamento por zonas (medallón, tracería, arcos ojivales SDF) con espejo ×4 y revelado progresivo. | MIT·R | ninguno | — | Geométricas | «Nuevo y distinto → integrar» (preset «Tracería» del candidato C-01) | Integrado: familia `laceria` |
| radiant · static/laser-precision.html | Un láser recorre una cola de formas dejando un surco persistente en relieve, con chispas, humo y calor. | MIT·R | ninguno (`maquina`/`descifrar` son de texto, no de trazado) | — | Texto-Terminal | «Nuevo y distinto → integrar» (candidato C-07 «Grabado láser») | Aplazado: necesita un recorrido ordenado del texto (§4, C-07) |
| radiant · static/magnetic-sand.html | Partículas alineadas con un campo dipolar (caída mezcla de 1/r y 1/r²). | MIT·R | `campos_em:iman` | — | Geométricas | «Duplicado de campos_em:iman» | Sin cambios: ya existe |
| radiant · static/woven-radiance.html | Tejido kente: hilos de colores por bandas con cruce arriba/abajo animado. | MIT·R | `entrelazado` | Bandas y bloques de color | Geométricas | «Preset nuevo de entrelazado»: densidad baja, paleta kente con `color.map` x, `franjas` en `multiply` | Propuesto; no hecho en esta revisión |
| radiant · static/jazz-chaos.html | Grupos de partículas que se mueven con ritmo sincopado (swing) y solos. | MIT·R | `enjambre_vivo` | Ritmo | Fondos | «Duplicado de enjambre_vivo» | Sin cambios: ya existe |
| radiant · static/thunder-sermon.html | Nubes de tormenta con warping + rayo fractal con ramas, destello y onda de choque. | MIT·R | `dla:raices` (estático) | Descarga cielo–suelo | Fondos | «Cubierto por V-08» (preset «tormenta») | Integrado: familia `descargas` («Descargas eléctricas») |
| radiant · static/vinyl-grooves.html | Disco que gira: surcos en V, ondulación de la señal, difracción iridiscente, brazo. | MIT·R | `anillos` | Reflejo en cruz que gira | Arte-figuras 3D | «Preset nuevo de anillos»: frecuencia alta + `rayos` de 2 brazos en `screen` que giran + disco central | Propuesto; no hecho en esta revisión |
| radiant · static/vintage-static.html | Barras de color que se derriten por columnas, cortes VHS y líneas de barrido. | MIT·R | `glitch`, `ruido` | Barras de color | Texto-Terminal | «Preset nuevo de glitch»: `franjas` verticales + `glitch` en `difference` + `fx.scan` | Propuesto; no hecho en esta revisión |
| radiant · static/torn-paper.html | Máscara de desgarro fibroso que se abre y se cierra revelando una capa luminosa. | MIT·R | ninguno | — | Imagen-efectos | «Cubierto por V-07» (fuente) | Integrado: familia `desgarro` («Superficie que se abre») |
| radiant · static/polaroid-burn.html | Polaroids dispersas que se revelan, se sobreexponen y arden (máscara fBm) con borde de brasa. | MIT·R | ninguno | — | Imagen-efectos | «Cubierto por V-07» (máscara de quemado; preset «fotos que arden») | Integrado: familia `desgarro` («Superficie que se abre») |
| radiant · static/scream-wave.html | Onda que pasa de seno calmo a distorsión extrema y colapso con aberración cromática (envolvente de 7 s). | MIT·R | ninguno | — | Texto-Terminal | «Nuevo y distinto → integrar» (preset «Grito» del candidato C-06) | Integrado: familia `osciloscopio` |
| radiant · static/ink-calligraphy.html | Trazos de pincel autónomos (ancho según velocidad) con difusión en papel y pan de oro. | MIT·R | `interact:paint` con `auto` | Trazo gestual autónomo | Texto-Terminal | «Mejora de interact:paint»: ancho por velocidad y sangrado de tinta para el puntero fantasma | Propuesto; no hecho en esta revisión |
| radiant · static/velvet-spotlight.html | Motas de polvo iluminadas sólo dentro de conos de foco que barren; rayos volumétricos y neblina. | MIT·R | `nubes_vol:haces`, `rayos` | Motas dentro del cono | Fondos | «Preset nuevo de rayos»: 2–3 conos estrechos que barren + `luciernagas` en `multiply` con la capa de rayos | Propuesto; no hecho en esta revisión |
| radiant · static/murmuration.html | Bandada de miles de partículas (rejilla espacial), atractor errante, ondas de densidad, montañas. | MIT·R | `boids:murmuracion` | — | Orgánicas | «Duplicado de boids:murmuracion» | Sin cambios: ya existe |
| radiant · static/tesseract-shadow.html | Hipercubo 4D (16 vértices, 32 aristas) rotado en planos 4D y proyectado 4D→3D→2D, aristas por profundidad, estelas. | MIT·R | `cubo`, `poliedro` (3D) | Cuarta dimensión | Arte-figuras 3D | «Nuevo y distinto → integrar» (candidato C-04 «Hipercubo») | Integrado: familia `hipercubo` |
| radiant · static/moire-interference.html | Producto de anillos concéntricos de 4 centros que orbitan con frecuencias ligeramente distintas. | MIT·R | `interferencia`, `moire` | — | Geométricas | «Duplicado de interferencia» | Sin cambios: ya existe |
| radiant · static/phase-transition.html | Partículas en red que pasan de orden cristalino a turbulencia al paso de un frente, y vuelven. | MIT·R | ninguno | — | Geométricas | «Nuevo y distinto → integrar» (candidato C-09 «Orden y caos») | Integrado: familia `orden_caos` |
| radiant · static/magnetic-field.html | Líneas de campo dipolar analíticas r = R·sin²θ cuantizadas, polos que giran, brillo de hilo. | MIT·R | `campos_em:dipolo` | — | Geométricas | «Duplicado de campos_em:dipolo» | Sin cambios: ya existe |
| radiant · static/aurora-curtain.html | Hilos verticales desplazados por senos y ruido, degradado cálido→frío. | MIT·R | `aurora` | Cortina de hilos verticales | Fondos | «Duplicado de aurora» | Sin cambios: ya existe |
| radiant · static/vortex.html | Distancia a brazos de espiral logarítmica con ondulación y centro que deriva. | MIT·R | `espiral` | — | Geométricas | «Duplicado de espiral» | Sin cambios: ya existe |
| radiant · static/chromatic-bloom.html | Orbes de color gaussianos en órbitas lentas, suma aditiva, grano, viñeta. | MIT·R | ninguno (el color sale de la paleta, no de cada orbe) | Un color por orbe | Fondos | «Cubierto por V-01» | Integrado: familia `corrientes` («Corrientes de color») |
| radiant · static/lens-whisper.html | Destellos anamórficos: estela horizontal + halos bokeh + separación cromática por luz. | MIT·R | `fx:bloom`, `luciernagas` | Halo sólo horizontal | Imagen-efectos | «Mejora de fx:bloom»: variante anamórfica (halo estirado en horizontal + anillo bokeh) | Propuesto; no hecho en esta revisión |
| radiant · static/luminous-silt.html | 18 000 partículas en un campo de ruido que acumulan alfa en nubes de color (color por posición). | MIT·R | `campo_flujo`, `nube` | Nubes de color granuladas | Fondos | «Cubierto por V-01» (variante granulada) | Integrado: familia `corrientes` («Corrientes de color») |
| radiant · static/synth-ribbon.html | Cintas metálicas que se retuercen en 3D con bandas cromadas según el ángulo de la normal. | MIT·R | `cinta_ola` | Bandas cromadas | Arte-figuras 3D | «Duplicado de cinta_ola» | Sin cambios: ya existe |
| radiant · static/hologram-glitch.html | Textura holográfica con líneas de barrido, separación RGB, bandas desplazadas y ráfagas. | MIT·R | `glitch` (`arte/corrupto`) | — | Texto-Terminal | «Duplicado de glitch» | Sin cambios: ya existe |
| radiant · static/shattered-plains.html | Canales dendríticos (valles en U por capas crestadas con warping) sobre un terreno fBm. | MIT·R | `erosion:barrancos` | Estático frente a simulado | Orgánicas | «Duplicado de erosion:barrancos» | Sin cambios: ya existe |
| radiant · static/painted-strata.html | Estratos: fronteras de capa plegadas por warping tectónico y fallas, grano de papel, un color por capa. | MIT·R | `topografia`, `dunas` | Un color por estrato | Orgánicas | «Preset nuevo de topografia»: curvas densas, `motion.warp` alto, `tone.levels` 6–8, paleta terrosa con `color.map` y | Propuesto; no hecho en esta revisión |
| radiant · static/feedback-loop.html | FBO ping-pong: lee el fotograma anterior con zoom de 2–3 %, giro, muestreo RGB desplazado, rotación de tono, ×0,96; dibuja semillas SDF. | MIT·R | ninguno | — | Fondos | «Cubierto por V-09» (fuente) | Integrado: familia `ecos` («Ecos y realimentación») |
| radiant · static/dither-gradient.html | Degradados descompuestos en tramas ordenadas (Bayer, semitono, rayado) con profundidad de bits que ondula. | MIT·R | `acabado:dither`, `glyph.dither`, `degradado` | — | Imagen-efectos | «Duplicado de acabado:dither» | Sin cambios: ya existe |
| radiant · static/analog-drift.html | Figuras de Lissajous que se transforman con persistencia de fósforo y retícula de osciloscopio. | MIT·R | `lissajous` | Retícula | Texto-Terminal | «Duplicado de lissajous» | Sin cambios: ya existe |
| radiant · static/navier-stokes.html | Fluidos estables: chorro con perturbaciones de cizalla, bordes abiertos, dos trazadores. | MIT·R (inspiración visual: imagen de Wikimedia citada en un comentario, no incluida) | `fluido:pilares` | Chorro sumergido | Orgánicas | «Preset nuevo de fluido»: chorro desde abajo, borde superior abierto, vorticidad media, vista `tinta` | Propuesto; no hecho en esta revisión |
| radiant · static/video-outro.html | Plantilla de cierre de vídeo de la galería (líneas de acento + partículas). | MIT·R | — | — | — | «Descartado: incompatible» (no figura en `src/lib/shaders.ts`; no es un efecto del catálogo) | Descartado (no se usa su código) |

### 3.2 Paper Shaders (30 filas: catálogo de la web en `docs/src/app/home-thumbnails.ts` = 7 filtros de imagen + 3 animaciones de logo + 20 efectos; fuentes en `packages/shaders/src/shaders/`)

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| paper · shaders/mesh-gradient.ts | Hasta 10 manchas de color con trayectorias propias; UV deformada por ondas y remolino; color = media ponderada por 1/d^3,5. | Apache·P | ninguno (color por paleta, no por mancha) | Color propio de cada mancha | Fondos | «Cubierto por V-01» (fuente) | Integrado: familia `corrientes` («Corrientes de color») |
| paper · shaders/static-mesh-gradient.ts | Igual que mesh-gradient pero estático, con warping en dos direcciones, nitidez de mezcla y grano. | Apache·P | ninguno | — | Fondos | «Cubierto por V-01» (versión estática) | Integrado: familia `corrientes` («Corrientes de color») |
| paper · shaders/static-radial-gradient.ts | Degradado radial de hasta 10 colores con punto focal, distorsión de forma y grano. | Apache·P | `degradado` + `color.map` radial | — | Fondos | «Duplicado de degradado» | Sin cambios: ya existe |
| paper · shaders/dithering.ts | Tramado a 2 colores (Bayer/aleatorio) sobre fuentes animadas: ruido, warp, puntos, ondas, ondulación, remolino, esfera. | Apache·P | `acabado:dither`, `glyph.dither` sobre patrones | — | Imagen-efectos | «Duplicado de acabado:dither» | Sin cambios: ya existe |
| paper · shaders/grain-gradient.ts | Degradado multicolor con grano en 7 formas animadas (onda, puntos, truchet, esquinas, ondulación, gota, esfera). | Apache·P | `degradado` + `fx.grain` (las formas existen como patrones) | — | Fondos | «Duplicado de degradado» | Sin cambios: ya existe |
| paper · shaders/dot-orbit.ts | Celdas de Voronoi con un punto que orbita su centro; tamaño variable; color por celda en pasos. | Apache·P (usa la textura de ruido embebida) | `trama` | Puntos que orbitan, color por celda | Geométricas | «Preset nuevo de trama»: lineatura baja, `motion.warp` leve, `color.map` noise con pocos `tone.levels` | Propuesto; no hecho en esta revisión |
| paper · shaders/dot-grid.ts | Rejilla estática de círculos, rombos, cuadrados o triángulos. | Apache·P | `trama`, charset `puntos`/`geometria` | — | Geométricas | «Duplicado de trama» | Sin cambios: ya existe |
| paper · shaders/warp.ts | Campos de color deformados por ruido y remolino sobre cuadros, rayas o borde partido; hasta 10 colores. | Apache·P | `cuadros`/`franjas` + `motion.warp` | — | Fondos | «Duplicado de cuadros» | Sin cambios: ya existe |
| paper · shaders/spiral.ts | Espiral de un color con densidad, trazo, ahusado, ruido y distorsión. | Apache·P | `espiral` | — | Geométricas | «Duplicado de espiral» | Sin cambios: ya existe |
| paper · shaders/swirl.ts | Bandas de color en ángulo·N + r^−torsión, con ruido y centro hueco. | Apache·P | `espiral` | — | Geométricas | «Duplicado de espiral» | Sin cambios: ya existe |
| paper · shaders/waves.ts | Patrón estático de líneas (zigzag a ondas suaves). | Apache·P | `franjas`, `ondas` | — | Geométricas | «Duplicado de franjas» | Sin cambios: ya existe |
| paper · shaders/neuro-noise.ts | Suma de senos de coordenadas rotadas que forma una red de filamentos luminosos. | Apache·P (cita «Original algorithm: x.com/zozuar»; licencia de origen no indicada) | `crestas`, `causticas` | — | Orgánicas | «Duplicado de crestas» | Sin cambios: ya existe |
| paper · shaders/perlin-noise.ts | Perlin 3D animado con octavas, persistencia y lacunaridad. | Apache·P (cita Shadertoy NlSGDz; licencia de origen no indicada) | `nube` | — | Fondos | «Duplicado de nube» | Sin cambios: ya existe |
| paper · shaders/simplex-noise.ts | Degradado multicolor mapeado sobre curvas de 2 simplex combinados. | Apache·P | `nube` + `tone.levels` | — | Fondos | «Duplicado de nube» | Sin cambios: ya existe |
| paper · shaders/voronoi.ts | Voronoi de doble pasada con bordes antialias, brillo interior y color por celda. | Apache·P (cita Shadertoy ldl3W8; licencia de origen no indicada) | `celulas` | — | Geométricas | «Duplicado de celulas» | Sin cambios: ya existe |
| paper · shaders/pulsing-border.ts | Contorno de rectángulo redondeado con estelas de color que recorren el perímetro, pulso y humo. | Apache·P | ninguno (GLYPHOS no tiene efectos de marco) | Marco luminoso alrededor del contenido | Texto-Terminal | «Nuevo y distinto → integrar» (candidato C-08 «Marco vivo») | Integrado: familia `marco` |
| paper · shaders/metaballs.ts | Hasta 20 bolas de colores que se funden en formas orgánicas alrededor del centro. | Apache·P | `lava` | Color por bola | Orgánicas | «Duplicado de lava» | Sin cambios: ya existe |
| paper · shaders/color-panels.ts | Paneles semitransparentes que giran alrededor de un eje, profundidad por intersección rayo–plano, compuestos de atrás adelante. | Apache·P | ninguno | — | Geométricas | «Cubierto por V-04» (fuente) | Integrado: familia `paneles` («Paneles prismáticos») |
| paper · shaders/smoke-ring.ts | Anillo radial deformado por ruido en coordenadas polares que fluye hacia fuera; color por radio. | Apache·P | `nube`, `respiracion` | Forma de anillo de humo | Orgánicas | «Preset nuevo de nube»: `nube` con `respiracion` en `mask`, `color.map` radial y deriva lenta | Propuesto; no hecho en esta revisión |
| paper · shaders/god-rays.ts | Rayos desde el centro (hasta 5 colores) con densidad, manchas y bloom. | Apache·P | `rayos` | — | Fondos | «Duplicado de rayos» | Sin cambios: ya existe |
| paper · shaders/liquid-metal.ts | Bandas cromadas que se curvan siguiendo el borde de una máscara (campo de borde por Poisson) con dispersión RGB. | Apache·P | ninguno (`metabolas` es otra cosa) | — | Arte-figuras 3D | «Cubierto por V-03» (fuente) | Integrado: familia `cromado` («Cromado en tramas») |
| paper · shaders/gem-smoke.ts | Campos de color humeantes dentro de un logo con borde vidrioso (máscara desenfocada). | Apache·P | Letras con textura (`texturas`) | Borde vidrioso | Texto-Terminal | «Cubierto por V-03» (misma base máscara + borde; relleno de humo en vez de bandas) | Integrado: familia `cromado` («Cromado en tramas») |
| paper · shaders/heatmap.ts | Onda de intensidad con gradiente de color que recorre la forma de una imagen/logo. | Apache·P | Letras con textura (`texturas`) | Onda que recorre la máscara | Texto-Terminal | «Cubierto por V-03» (variante «onda térmica» sobre máscara) | Integrado: familia `cromado` («Cromado en tramas») |
| paper · shaders/paper-texture.ts | Textura de papel estática: grano, ruido, fibras y varios patrones de pliegue; filtro o textura. | Apache·P | `fx.grain`, `acabado:grain` | Pliegues y fibras | Imagen-efectos | «Mejora de fx:grain»: modo «papel» con fibras y pliegues | Propuesto; no hecho en esta revisión |
| paper · shaders/fluted-glass.ts | Vidrio acanalado: rejilla de franjas; dentro de cada franja la imagen se desplaza según un perfil (prisma, lente, contorno, cascada, plano). | Apache·P | ninguno | — | Imagen-efectos | «Cubierto por V-10» (fuente) | Integrado: vidrio delante `acanalado` (recipe.optics) |
| paper · shaders/water.ts | Filtro de imagen: distorsión por ondas + ruido de cáusticas y brillos. | Apache·P | `xform:desplazar` + `causticas` | — | Imagen-efectos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| paper · shaders/image-dithering.ts | Tramado de imagen con 4 modos y paletas (2, 3, multicolor o tomada de la imagen). | Apache·P | `acabado:dither` | — | Imagen-efectos | «Duplicado de acabado:dither» | Sin cambios: ya existe |
| paper · shaders/halftone-dots.ts | Semitono de puntos con rejilla, paleta y estilos de punto. | Apache·P | `acabado:halftone`, `xform:semitono` | — | Imagen-efectos | «Duplicado de acabado:halftone» | Sin cambios: ya existe |
| paper · shaders/halftone-cmyk.ts | Semitono CMYK con patrones y tinta por canal. | Apache·P | `acabado:halftone` (opción CMYK) | — | Imagen-efectos | «Duplicado de acabado:halftone» | Sin cambios: ya existe |
| paper · shaders/lens-distortion.ts | Separación en capas de color (aberración cromática) + abombado de la geometría. | Apache·P | `xform:canales` + `interact:lens` | — | Imagen-efectos | «Duplicado de xform:canales» | Sin cambios: ya existe |

### 3.3 Vanta (14 filas: `src/vanta.*.js`)

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| vanta · src/vanta.birds.js | Bandada GPGPU (separación, alineación, cohesión) con mallas de pájaro que aletean. | MIT·V; «Adapted from threejs.org canvas_geometry_birds» (zz85, MIT de three.js); geometría «based on openprocessing visualID=6910» (licencia no indicada); usa `vendor/GPUComputationRenderer.js` (three.js) | `boids:murmuracion` | Pájaros 3D | Orgánicas | «Duplicado de boids:murmuracion» | Sin cambios: ya existe |
| vanta · src/vanta.cells.js | Ruido de Worley (celdas) con capas a distinta escala y anillos. | MIT·V | `celulas` | — | Orgánicas | «Duplicado de celulas» | Sin cambios: ya existe |
| vanta · src/vanta.clouds.js | Nubes volumétricas por raymarching con LOD, sol y sombra. | MIT·V; el README atribuye el efecto a Inigo Quilez (Shadertoy XslGRr); la licencia de ese original no está en el repo y no se verificó | `nubes_vol:banco` | — | Fondos | «Duplicado de nubes_vol:banco» | Sin cambios: ya existe |
| vanta · src/vanta.clouds2.js | Raymarcher mínimo de nubes que muestrea una textura de ruido. | MIT·V; README atribuye a Rune Stubbe (Shadertoy lsBfDz, licencia no indicada); necesita `./gallery/noise.png`, que no está en la rama principal | `nubes_vol` | — | Fondos | «Duplicado de nubes_vol» | Sin cambios: ya existe |
| vanta · src/vanta.dots.js | Rejilla de puntos en perspectiva que ondula (THREE.Points). | MIT·V | `rejilla` | Puntos en vez de líneas, sin sol | Fondos | «Preset nuevo de rejilla»: sin sol, charset `puntos`, `motion.warp` para la ondulación | Propuesto; no hecho en esta revisión |
| vanta · src/vanta.fog.js | fBm con warping (Book of Shaders, cap. 13) en 3 colores. | MIT·V; «Original effect by Patricio Gonzalez Vivo» y ruido «based on Morgan McGuire» (Shadertoy 4dS3Wd); licencias de origen no indicadas | `marmol`, `nube` | — | Fondos | «Duplicado de marmol» | Sin cambios: ya existe |
| vanta · src/vanta.globe.js | Esfera de puntos que gira con segmentos entre vecinos y arcos. | MIT·V | `constelacion_dinamica`, `esfera` | Puntos sobre una esfera | Arte-figuras 3D | «Preset nuevo de constelacion_dinamica»: capa sobre `esfera` (relieve 0) en `screen`, giro lento | Propuesto; no hecho en esta revisión |
| vanta · src/vanta.halo.js | Realimentación: relee su buffer desplazado por su propio color + zoom 0,996 + giro, resta un desvanecimiento y dibuja un anillo de flor arcoíris. | MIT·V | ninguno | — | Fondos | «Cubierto por V-09» (autoadvección por color + zoom + desvanecimiento) | Integrado: familia `ecos` («Ecos y realimentación») |
| vanta · src/vanta.net.js | Puntos que se mueven y se unen con líneas si están cerca (plexo). | MIT·V | `constelacion_dinamica` | — | Geométricas | «Duplicado de constelacion_dinamica» | Sin cambios: ya existe |
| vanta · src/vanta.rings.js | Arcos parciales de distinto radio y grosor que giran a ritmos distintos en un plano inclinado. | MIT·V | `anillos`, `radar` | Arcos incompletos | Arte-figuras 3D | «Preset nuevo de anillos»: 3 capas de `anillos` con `rayos` en `mask` (sectores) a velocidades distintas | Propuesto; no hecho en esta revisión |
| vanta · src/vanta.ripple.js | 20×20 luces puntuales en anillos móviles con brillo 1/d acumulado. | MIT·V | `ondas_estelares`, `luciernagas` | — | Fondos | «Duplicado de ondas_estelares» | Sin cambios: ya existe |
| vanta · src/vanta.topology.js | Partículas p5 que avanzan sobre un campo de ruido y dibujan líneas acumuladas. | MIT·V; «Original effect by Kjetil Midtgarden Golid» (p5ycho, MIT verificado, §1.10); usa `vendor/p5.min.js` | `campo_flujo` | Líneas enredadas por ruido | Orgánicas | «Mejora de campo_flujo» (misma mejora que flow-field) | Propuesto; no hecho en esta revisión |
| vanta · src/vanta.trunk.js | Círculos concéntricos con radio perturbado por ruido polar que crecen y se acumulan (anillos de tronco). | MIT·V; «Original effect by Kjetil Midtgarden Golid» (p5ycho, MIT verificado) | `anillos`, `topografia` | Anillos irregulares de tronco | Orgánicas | «Preset nuevo de anillos»: `anillos` con `motion.warp` alto y `crestas` en `multiply` | Propuesto; no hecho en esta revisión |
| vanta · src/vanta.waves.js | Plano de malla desplazado por ruido, sombreado facetado (Phong) y cámara en perspectiva. | MIT·V | `mareas_lentas`, `horizonte` | Facetas iluminadas | Fondos | «Mejora de mareas_lentas»: superficie en perspectiva con sombreado facetado y brillo | Propuesto; no hecho en esta revisión |

### 3.4 The Spirit, Codrops WebGLBlobs y ShaderGradient

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| the-spirit · src/glsl/position.frag + helpers/curl4.glsl | Partículas GPGPU advectadas por ruido rizado (curl de 3 ruidos simplex 4D con derivadas), con vida, reaparición alrededor de un punto que sigue al ratón, sombras, motion blur y bloom. | MIT, «Copyright (c) 2015 Edan Kwan»; `app/js/three.r74.min.js` (three.js, MIT); imágenes propias | `vortice_polvo`, `enjambre_vivo` (decenas de puntos analíticos), `nubes_vol` | Humo volumétrico de miles de partículas | Arte-figuras 3D | «Nuevo y distinto → integrar» (candidato C-02 «Humo rizado») | Integrado: familia `humo` |
| webglblobs · scripts/gl/shaders/vertex.glsl + fragment.glsl (3 demos: index, index2, index3) | Icosaedro con vértices desplazados por Perlin periódico a lo largo de la normal, torsión en Y por sin(v·f + t), «respiración»; color por paleta coseno indexada por el desplazamiento. | MIT, «Copyright (c) 2009 - 2020 Codrops» (package.json dice ISC); fuente Adobe Typekit «termina» remota; `img/noise.png` sin licencia indicada | `jade_vivo` (ondas senoidales sobre esfera) | Superficie de ruido con torsión y color por relieve | Arte-figuras 3D | «Mejora de jade_vivo»: desplazamiento por ruido 3D periódico + torsión en Y + color por desplazamiento | Propuesto; no hecho en esta revisión |
| shadergradient · packages/shadergradient/src/shaders/defaults (plane, waterPlane) y positionMix | Plano o «waterPlane» desplazado por Perlin periódico (densidad, fuerza, frecuencia; bucle sin costura por 4 muestras en círculo); color = mezcla de 3 colores por posición x y por la altura; material físico + HDRI + grano. | MIT declarado en README («MIT © ruucm, stone-skipper») y package.json; no hay archivo LICENSE; HDRI remotos (nombres de Poly Haven, licencia no indicada en el repo) | `degradado`, `mareas_lentas` | Lámina de color en 3D con relieve iluminado | Fondos | «Cubierto por V-01» (variante «lámina» con relieve iluminado) | Integrado: familia `corrientes` («Corrientes de color») |
| shadergradient · src/shaders/defaults/sphere | Esfera desplazada por Perlin periódico con la misma mezcla de 3 colores. | ídem | `jade_vivo`, `esfera` | — | Arte-figuras 3D | «Mejora de jade_vivo» (misma mejora que WebGLBlobs) | Propuesto; no hecho en esta revisión |
| shadergradient · src/shaders/cosmic | Patrón de interferencia holográfica (tres productos seno·coseno a frecuencias crecientes) y desplazamiento de tono sobre la superficie. | ídem | ninguno | — | Fondos | «Cubierto por V-02» | Integrado: familia `membrana` («Membrana iridiscente») |
| shadergradient · src/shaders/glass | Superficie con mezcla por vUv.y, Fresnel hacia el color 3 y mezcla de refracción/reflexión del entorno. | ídem | `esfera`, `poliedro` | Aspecto de vidrio | Arte-figuras 3D | «Mejora de esfera»: modo vidrio (Fresnel + refracción de la capa inferior) | Propuesto; no hecho en esta revisión |

### 3.5 three.js (31 filas: los 28 nombres que cumplen el filtro pedido + 3 ejemplos extra relevantes para un laboratorio ASCII)

Nombres que cumplen `iridescence|transmission|dispersion|thin|physical|caustic|refraction|water|marching|noise|gpgpu|feedback` (no hay ninguno con `thin` ni `feedback`). Sólo se descargaron los HTML marcados con † (checkout disperso); el resto se evalúa por nombre y por lo que esos HTML muestran.

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| three.js · examples/webgl_gpgpu_birds.html | Bandada GPGPU con texturas de posición/velocidad. | MIT·3 | `boids:murmuracion` | — | Orgánicas | «Duplicado de boids:murmuracion» | Sin cambios: ya existe |
| three.js · examples/webgl_gpgpu_birds_gltf.html | La misma bandada con pájaros glTF animados. | MIT·3; modelos glTF (licencia no verificada) | `boids` | — | Orgánicas | «Duplicado de boids:murmuracion» | Sin cambios: ya existe |
| three.js · examples/webgl_gpgpu_protoplanet.html | Partículas GPGPU con gravedad mutua que se agregan en un protoplaneta. | MIT·3 | `gravedad:colapso` | — | Arte-figuras 3D | «Duplicado de gravedad:colapso» | Sin cambios: ya existe |
| three.js · examples/webgl_gpgpu_water.html † | Altura de agua por GPGPU (ecuación de onda) con interacción y objetos flotantes. | MIT·3; glTF + HDR (no verificados) | `agua` | — | Fondos | «Duplicado de agua» | Sin cambios: ya existe |
| three.js · examples/webgl_lights_physical.html | Unidades físicas de luz (lux, candelas) en una escena con texturas. | MIT·3; texturas | ninguno | — | — | «Descartado: incompatible» (iluminación física de escena; nada que llevar a un campo de glifos) | Descartado (no se usa su código) |
| three.js · examples/webgl_loader_gltf_dispersion.html † | Transmisión con dispersión (IOR distinto por canal) sobre el modelo DispersionTest.glb. | MIT·3; DispersionTest.glb (no necesario) | `esfera`, `poliedro` | Arcoíris en los bordes del vidrio | Arte-figuras 3D | «Mejora de esfera»: dispersión (desplazamiento distinto por canal R/G/B en el modo vidrio) | Propuesto; no hecho en esta revisión |
| three.js · examples/webgl_loader_gltf_iridescence.html † | Iridiscencia física de película fina (Belcour–Barla) sobre IridescenceLamp.glb con HDR venice_sunset_1k. | MIT·3; IridescenceLamp de KhronosGroup glTF-Sample-Models (según el propio ejemplo; licencia no verificada); HDR (no verificado) | ninguno | — | Fondos | «Cubierto por V-02» (variante física de referencia; ver §7) | Integrado: familia `membrana` («Membrana iridiscente») |
| three.js · examples/webgl_loader_gltf_transmission.html | Transmisión (vidrio) de un modelo glTF. | MIT·3; modelo glTF | `esfera`, `poliedro` | Vidrio | Arte-figuras 3D | «Mejora de esfera»: modo vidrio | Propuesto; no hecho en esta revisión |
| three.js · examples/webgl_marchingcubes.html † | Metabolas poligonizadas por marching cubes. | MIT·3; cubemap SwedishRoyalCastle, uv_grid | `metabolas` | — | Arte-figuras 3D | «Duplicado de metabolas» | Sin cambios: ya existe |
| three.js · examples/webgl_materials_cubemap_refraction.html † | Refracción por cubemap sobre la estatua Lucy100k.ply. | MIT·3; Lucy100k.ply y cubemap Park3Med (no verificados) | `esfera` (vidrio propuesto) | Depende de la malla escaneada | — | «Descartado: incompatible» (sin la malla escaneada sólo queda la refracción, ya cubierta por la fila de transmisión) | Descartado (no se usa su código) |
| three.js · examples/webgl_materials_physical_clearcoat.html | Capa de barniz PBR con mapas de normales. | MIT·3; texturas | `esfera` | — | — | «Descartado: incompatible» (en glifos se reduce a un brillo especular) | Descartado (no se usa su código) |
| three.js · examples/webgl_materials_physical_transmission.html † | MeshPhysicalMaterial con transmisión, IOR, grosor y atenuación sobre fondo HDR. | MIT·3; HDR (no verificado) | `esfera` | Vidrio que refracta el fondo | Arte-figuras 3D | «Mejora de esfera»: modo vidrio (refracción de la capa inferior por la normal, IOR y grosor) | Propuesto; no hecho en esta revisión |
| three.js · examples/webgl_materials_physical_transmission_alpha.html | Variante de transmisión con alfa. | MIT·3 | `esfera` | — | Arte-figuras 3D | «Mejora de esfera»: modo vidrio (variante con alfa) | Propuesto; no hecho en esta revisión |
| three.js · examples/webgl_refraction.html † | Objeto `Refractor` con textura dudv animada (`textures/waterdudv.jpg`). | MIT·3; textura dudv | `xform:desplazar` | — | Imagen-efectos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| three.js · examples/webgpu_backdrop_water.html | Fondo distorsionado por normales de agua (backdrop). | MIT·3 | `xform:desplazar` | — | Imagen-efectos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| three.js · examples/webgpu_caustics.html † | Cáusticas proyectadas por un pato glTF en agua con textura Caustic_Free.jpg. | MIT·3; duck.glb, `textures/opengameart/Caustic_Free.jpg`, hardwood2 (no verificados) | `causticas` | — | Orgánicas | «Duplicado de causticas» | Sin cambios: ya existe |
| three.js · examples/webgpu_compute_water.html † | Altura de agua por compute shader con interacción. | MIT·3; glTF + HDR | `agua` | — | Fondos | «Duplicado de agua» | Sin cambios: ya existe |
| three.js · examples/webgpu_lights_physical.html | Versión WebGPU de luces físicas. | MIT·3 | ninguno | — | — | «Descartado: incompatible» | Descartado (no se usa su código) |
| three.js · examples/webgpu_loader_gltf_dispersion.html | Versión WebGPU de dispersión. | MIT·3 | `esfera` | — | Arte-figuras 3D | «Mejora de esfera»: dispersión por canal | Propuesto; no hecho en esta revisión |
| three.js · examples/webgpu_loader_gltf_iridescence.html | Versión WebGPU de iridiscencia. | MIT·3 | ninguno | — | Fondos | «Cubierto por V-02» | Integrado: familia `membrana` («Membrana iridiscente») |
| three.js · examples/webgpu_loader_gltf_transmission.html | Versión WebGPU de transmisión. | MIT·3 | `esfera` | — | Arte-figuras 3D | «Mejora de esfera»: modo vidrio | Propuesto; no hecho en esta revisión |
| three.js · examples/webgpu_materials_transmission.html † | Versión WebGPU de transmisión física. | MIT·3 | `esfera` | — | Arte-figuras 3D | «Mejora de esfera»: modo vidrio | Propuesto; no hecho en esta revisión |
| three.js · examples/webgpu_materialx_noise.html † | Nodos de ruido MaterialX sobre esferas con entorno HDR. | MIT·3; cubemap pisaHDR | `nube`, `esfera` | — | Fondos | «Duplicado de nube» | Sin cambios: ya existe |
| three.js · examples/webgpu_postprocessing_ssr_denoise.html | Reflejos en espacio de pantalla con eliminación de ruido. | MIT·3 | ninguno | — | — | «Descartado: incompatible» (requiere escena 3D con g-buffer) | Descartado (no se usa su código) |
| three.js · examples/webgpu_refraction.html | Refracción de un plano de agua (versión WebGPU). | MIT·3 | `xform:desplazar` | — | Imagen-efectos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| three.js · examples/webgpu_volume_caustics.html † | Cáusticas volumétricas (haces en el agua) con el mismo pato y textura. | MIT·3; mismos assets | `causticas`, `nubes_vol:haces` | — | Orgánicas | «Duplicado de causticas» | Sin cambios: ya existe |
| three.js · examples/webgpu_water.html | Agua con mapas de flujo y reflejo. | MIT·3; texturas de agua | `xform:desplazar`, `agua` | — | Fondos | «Duplicado de xform:desplazar» | Sin cambios: ya existe |
| three.js · examples/webxr_xr_marchingcubes.html | Marching cubes en XR. | MIT·3 | `metabolas` | — | Arte-figuras 3D | «Duplicado de metabolas» | Sin cambios: ya existe |
| three.js · examples/webgl_effects_ascii.html † (extra) | `AsciiEffect`: renderiza la escena, mide el brillo por celda y lo traduce a un juego de caracteres. | MIT·3 | `glyph.mode:density` (núcleo del motor) | — | Texto-Terminal | «Duplicado de glyph.mode:density» | Sin cambios: ya existe |
| three.js · examples/webgl_postprocessing_afterimage.html † (extra) | `AfterimageShader`: max(nuevo, viejo·damp·[viejo>0,1]). | MIT·3 («Inspired by Three.js FBO motion trails», codepen de brunoimbrizi) | `xform:estela` | — | Imagen-efectos | «Duplicado de xform:estela» | Sin cambios: ya existe |
| three.js · examples/webgpu_tsl_galaxy.html † (extra) | Galaxia de partículas por TSL con brazos espirales. | MIT·3 | `galaxia` | — | Fondos | «Duplicado de galaxia» | Sin cambios: ya existe |

### 3.6 Butterchurn (mecanismo) y butterchurn-presets (estilos representativos)

| Fuente (repo · archivo/ruta) | Mecanismo (1 línea, qué calcula) | Licencia código / assets | Equivalente actual en GLYPHOS | Diferencia visible | Destino | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| butterchurn · src/rendering/renderer.js (runPixelEquations) + shaders/warp.js | Paso de warp: el fotograma anterior se muestrea a través de una malla 48×36 cuyas UV dependen de zoom, zoomexp, rot, cx/cy, sx/sy, dx/dy y un warp senoidal; ×decay. | MIT·B | ninguno | — | Fondos | «Cubierto por V-09» (núcleo del bucle) | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/shaders/comp.js | Composición a pantalla: eco (copia con zoom y volteo según echo_orient, mezclada por echo_alpha), gamma, tinte de 4 esquinas, brighten/darken/solarize/invert. | MIT·B | ninguno | — | Fondos | «Cubierto por V-09» (paso de composición; receta «espejos») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/waves/basicWaveform.js | 8 modos de onda dibujados dentro del buffer (círculo radial, XY, línea inclinada, doble línea…) a partir del audio. | MIT·B | `lissajous`, `ecualizador` | Se dibuja dentro del bucle | Fondos | «Cubierto por V-09» (semilla «onda»; sin audio, señal sintética) | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/shapes/customShape.js | Hasta 4 polígonos (lados, radio, ángulo, color centro/borde, instancias); «textured» rellena el polígono con el fotograma anterior girado y escalado. | MIT·B | ninguno | Copias recursivas de sí mismo | Fondos | «Cubierto por V-09» (semillas; las texturizadas dan espejos recursivos) | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/waves/customWaveform.js | Hasta 4 curvas de 512 muestras con ecuaciones por punto (x, y, r, g, b, a). | MIT·B | `armonografo`, `espirografo` | Se dibuja dentro del bucle | Fondos | «Cubierto por V-09» (semilla «curva») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/motionVectors/motionVectors.js | Rejilla de segmentos cortos que muestran el desplazamiento del warp. | MIT·B | charset `flechas` | — | Texto-Terminal | «Cubierto por V-09» (capa opcional de vectores: glifo de flecha según el desplazamiento) | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/shaders/blur/*.js | Pirámide de 3 desenfoques separables que los shaders de warp/comp usan al fotograma siguiente. | MIT·B | `fx.bloom` (no en bucle) | Desenfoque dentro del bucle | Fondos | «Cubierto por V-09» (base de la receta «tinta recursiva») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/rendering/sprites/darkenCenter.js + border.js | Mancha oscura en el centro y bordes exterior/interior dibujados en el buffer. | MIT·B | `fx.vig` (no en bucle) | Dentro del bucle | Fondos | «Cubierto por V-09» (parámetros «oscurecer centro» y «marco») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn · src/audio/*.js | Análisis de audio: bass/mid/treb e integrales «_att». | MIT·B | ninguno | — | — | «Descartado: incompatible» (la familia pedida es autónoma; se sustituye por osciladores lentos) | Descartado (no se usa su código) |
| butterchurn · src/equations/presetEquationRunner*.js | Ejecuta las ecuaciones por fotograma y por vértice de cada preset como JS (o WASM). | MIT·B | ninguno | — | — | «Descartado: incompatible» (ejecutar código de presets ajenos; GLYPHOS usa parámetros declarativos) | Descartado (no se usa su código) |
| butterchurn · src/image/imageTextures.js | JPEG «clouds2» y GIF vacío embebidos en base64. | MIT·B; procedencia de la imagen no declarada | ninguno | — | — | «Descartado: licencia/assets» (imagen sin procedencia ni licencia propia) | Descartado (no se usa su código) |
| butterchurn-presets · «Geiss - Reaction Diffusion 2», «Geiss - Reaction Diffusion 3», «beta106i - Potion of Ink», «DemonLD_-_Toxic_water_diffusion…» | Estilo «tinta recursiva»: zoom ≈ 1,009, rot y centro que deambulan, warp ≈ 0; el warp suma (actual − desenfoque)·0,3 y multiplica ×0,9 → laberintos tipo Turing. | MIT·B (presets de autores de la comunidad MilkDrop; sin licencia individual) | `reaccion_difusion` (otra técnica) | Laberintos que fluyen con el zoom | Fondos | «Cubierto por V-09» (receta «tinta recursiva») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn-presets · «Aderrasi - Curse of the Mirror Emu», «Rovastar + Geiss - Hyperspace - kaleidoscope», «Geiss - Feedback 2», «Flexi - reality tunnel» | Estilo «espejos»: echo_alpha 0,5 con echo_orient 1/3 (volteos) o formas texturizadas que copian el fotograma anterior. | ídem | `caleido` (sin recursión) | Simetría que se realimenta | Fondos | «Cubierto por V-09» (receta «espejos») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn-presets · «Geiss - 3 layers (Tunnel Mix)», «_Rovastar + Geiss - Hurricane Nightmare (Posterize Mix)», «Krash + Illusion - Spiral Movement», «Flexi - infused with the spiral» | Estilo «zoom»: zoom 1,02–1,03 con zoomexp 1,5–4,3 (los bordes avanzan más que el centro), giro constante o por píxel rot += 1/(10·(rad+0,2)). | ídem | `tunel`, `hiper` (analíticos, sin estela) | Túnel que arrastra lo dibujado | Fondos | «Cubierto por V-09» (receta «zoom») | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn-presets · «cope + flexi - colorful marble (ghost mix)», «Flexi - mindblob mix» | Escenas calculadas en las ecuaciones (esfera trazada, blobs de 100 lados) que alimentan un warp de 6 KB. | ídem | `metabolas`, `esfera` | — | Fondos | «Cubierto por V-09» (semillas complejas; no se portan sus shaders) | Integrado: familia `ecos` («Ecos y realimentación») |
| butterchurn-presets · imageData.js + 19 presets con texturas («Geiss - Brain Zoom 4», «Geiss - Desert Rose 4», «cope - matrixcode7», «martin - glass corridor», «Zylot - Heaven Bloom nz+»…) | Presets que muestrean texturas de imagen (cells, seaweed, smalltiled_*, clouds2, moss1, rand00, pw_mcode1…). | MIT·B declarado; 6 JPEG embebidos sin procedencia; algunas texturas citadas ni siquiera están incluidas | ninguno | — | — | «Descartado: licencia/assets» | Descartado (no se usa su código) |

## 4. Candidatos nuevos y distintos

Estos candidatos aportan una experiencia ASCII que no está en GLYPHOS ni en V-01…V-10. Van ordenados por valor para el catálogo (identidad en glifos, variedad, coste razonable). En todos se recomienda implementar el mecanismo desde cero, como campo GLSL con su gemelo en CPU. Las notas de licencia sólo aplican si se adaptara código.

### C-01 «Lacería» — fuentes: radiant-geometry, sacred-strange, gothic-filigree (Radiant)
- **Mecanismo.** Se tesela el plano (rejilla cuadrada u hexagonal) y se toman coordenadas locales q en cada celda. Se pliegan en N sectores: φ' = |mod(φ, 2π/N) − π/N|. El motivo es la distancia a una poligonal en zigzag entre radio r₁ (ángulo 0) y radio r₂ (ángulo π/N), que da una estrella {N/k}, más uno o dos círculos de roseta. El valor del campo es smoothstep(w, 0, d).
- **Entrelazado.** En cada cruce de segmentos se resta un hueco en el segmento «de abajo», elegido por la paridad del índice de segmento: así se lee el «por encima/por debajo» de la lacería.
- **Animación.** Capas a escalas 1, φ y φ² que giran en sentidos opuestos, y un revelado radial r < R(t) que hace crecer el motivo.
- **Controles.** Simetría (6/8/10/12), rejilla (cuadrada/hex/ninguna = rosetón central), profundidad de la estrella (r₁/r₂), trazo, entrelazado sí/no, giro, revelado.
- **Destino.** Geométricas.
- **Presets.** «Azulejo nazarí» (8 puntas, rejilla cuadrada, trazo fino, giro muy lento, charset `marcos`). «Rosetón» (12 puntas sin rejilla, 3 anillos que contrarrotan). «Tracería» (6 puntas, hex, revelado que crece desde las esquinas).
- **Licencia si se adapta código.** MIT de Radiant: conservar «Copyright (c) 2025 Paul Bakaus» y el texto MIT.

### C-02 «Humo rizado» — fuente: The Spirit (`src/glsl/position.frag`, `helpers/curl4.glsl`)
- **Mecanismo.** N partículas (8–64 mil en GPU, 4–8 mil en el gemelo CPU) se mueven con v = ∇×Ψ(p, t), donde Ψ = (n₁, n₂, n₃) son tres ruidos 3D/4D descorrelacionados por desplazamiento; el rotacional da un flujo sin divergencia, de aspecto humeante. Se suma una atracción hacia un objetivo, k·(objetivo − p)·(1 − smoothstep(r₁, r₂, |Δ|)).
- **Vida.** La vida baja un poco en cada paso; al agotarse, la partícula reaparece en una esfera de radio R alrededor del objetivo.
- **Dibujo.** Proyección con una órbita lenta de cámara; cada celda acumula una densidad ponderada por la profundidad (opcional: autosombra muestreando la densidad hacia la luz). La densidad se convierte en glifo.
- **Controles.** Cantidad, tamaño del rizo (escala del ruido), velocidad, vida, atracción, radio de emisión, órbita de cámara, objetivo (fijo / órbita / puntero).
- **Destino.** Arte-figuras 3D (también Orgánicas).
- **Presets.** «Espíritu» (el objetivo orbita despacio, paleta cálida). «Fumarola» (objetivo fijo abajo y deriva hacia arriba). «Nebulosa rizada» (sin objetivo, rizo grande, muy lento).
- **Licencia si se adapta código.** MIT, «Copyright (c) 2015 Edan Kwan».
- **Gemelo CPU.** Paso fijo y semilla fija; es una familia con estado, como `fluido`, así que no es un bucle analítico (hace falta calentamiento y punto de control).

### C-03 «Mar nocturno» — fuentes: moonlit-ripple y bioluminescence (Radiant); ver también los nombres `webgl_shaders_ocean`/`webgl_shaders_sky` de three.js
- **Mecanismo.** Altura h(x, z, t) = Σᵢ Aᵢ·sin(kᵢ(dᵢ·(x, z)) − ωᵢt + φᵢ), con ωᵢ = √(g·kᵢ) y amplitudes decrecientes. La normal es analítica: n = normalize(−∂h/∂x, 1, −∂h/∂z).
- **Cámara.** Rayo por celda e intersección con y = 0 (inclinación controlable). El reflejo r = reflect(rd, n) da el brillo de la luna como disco (smoothstep de r·L) más halo, mezclado por Fresnel F = F₀ + (1 − F₀)(1 − cos θ)⁵ con un cielo en degradado. Resultado: una columna centelleante de glifos brillantes sobre el mar oscuro.
- **Variante «Plancton».** Destellos donde la curvatura o la pendiente de la cresta supera un umbral, con un parpadeo por celda.
- **Controles.** Altura de ola, dirección del viento, inclinación de cámara, tamaño y altura de la luna, brillo, posición del horizonte.
- **Destino.** Fondos.
- **Presets.** «Luna sobre el lago» (calma, olas bajas). «Mar de fondo» (picado, luna baja). «Plancton» (sin luna, crestas que se encienden).
- **Licencia si se adapta código.** MIT de Radiant.

### C-04 «Hipercubo» — fuente: tesseract-shadow (Radiant)
- **Mecanismo.** 16 vértices (±1)⁴ y 32 aristas (pares que difieren en una coordenada). Se rotan en los planos xw, yw, zw y xy con velocidades propias.
- **Proyección.** 4D→3D: v₃ = v.xyz·d₄/(d₄ − v.w); 3D→2D con perspectiva normal. Cada arista es un segmento SDF cuyo grosor y brillo dependen de w (lo que está «más lejos en 4D» se ve más tenue). Estela opcional por decaimiento analítico (varias copias en t − kΔt).
- **Generalización.** Elegir politopo: teseracto, 16-celdas, 24-celdas.
- **Controles.** Velocidades xw/yw/zw, distancia 4D, grosor, estela, politopo.
- **Destino.** Arte-figuras 3D (también Texto-Terminal, en `marcos`/`cajas`).
- **Presets.** «Teseracto» (xw + yw). «Del revés» (sólo xw: el cubo interior pasa a exterior). «24 celdas».
- **Licencia si se adapta código.** MIT de Radiant.

### C-05 «Cámara de niebla» — fuente: spark-chamber (Radiant)
- **Mecanismo.** Partículas con carga q = ±1, masa m y velocidad v en un campo B uniforme perpendicular: dv/dt = (qB/m)·(v_y, −v_x) − γv. Al perder energía el radio de giro se cierra y la traza acaba en espiral.
- **Eventos.** Entran desde los bordes con energía al azar (semilla fija). A veces una partícula se desintegra en un par de cargas opuestas que se abren en «V».
- **Dibujo.** Cada traza es una polilínea en un buffer circular que se desvanece. En la versión analítica, la trayectoria tiene forma cerrada (espiral exponencial) y se dibuja como distancia a la curva hasta s(t).
- **Controles.** Intensidad de B, frenado γ, tasa de partículas, largo de traza, probabilidad de pares.
- **Destino.** Texto-Terminal (también Fondos).
- **Presets.** «Cámara de burbujas» (B fuerte, espirales cerradas). «Rayos cósmicos» (B débil, trazas largas casi rectas). «Lluvia de pares» (muchas desintegraciones).
- **Licencia si se adapta código.** MIT de Radiant.

### C-06 «Osciloscopio que se degrada» — fuentes: signal-decay y scream-wave (Radiant)
- **Mecanismo.** Traza temporal y(x, t) = E(t)·Σₙ aₙ·sin(2πfₙx + φₙ(t)), con un grado de degradación d ∈ [0, 1] que encadena:
  - modulación FM: + β·d·sin(2πf_m·x);
  - recorte suave y/(1 + |y| + 0,28y²), después recorte duro;
  - reducción de bits: round(y·2ᵇ)/2ᵇ con b = 8 − 7d;
  - ruido añadido.
  La envolvente E(t) recorre calma → crecida → grito → colapso. El campo es el brillo de la distancia |p.y − y(p.x)|, con retícula de osciloscopio opcional.
- **Controles.** Armónicos, degradación, duración del ciclo, ruido, retícula, persistencia.
- **Destino.** Texto-Terminal.
- **Presets.** «Señal limpia» (seno con deriva de fase y retícula, charset `sismografo`). «Interferencia» (bit-crush y ruido que suben y bajan). «Grito» (envolvente con recorte y colapso).
- **Diferencia con `lissajous`.** Aquel es XY; éste es una traza temporal con una cadena de degradación.
- **Licencia si se adapta código.** MIT de Radiant.

### C-07 «Grabado láser» — fuente: laser-precision (Radiant)
- **Mecanismo.** Un trazado P(s) (polilínea de formas o contorno del texto de la pieza por iso-línea de su máscara) se recorre a velocidad constante: la punta está en s(t) = v·t. El surco es analítico, sin estado: B(x, t) = smoothstep(w, 0, dist(x, P[0..s(t)])).
- **Relieve.** El surco se sombrea con el gradiente de B y una luz fija (efecto grabado). La punta lleva un halo caliente y chispas (partículas balísticas con semilla) y humo (ruido que sube). Al acabar la forma, el surco se enfría y la secuencia pasa a la siguiente.
- **Controles.** Velocidad, grosor, chispas, humo, persistencia, fuente del trazado (texto/forma/curva).
- **Destino.** Texto-Terminal.
- **Presets.** «Tu palabra grabada» (texto de la pieza). «Geometría» (polígonos en secuencia). «Firma» (trazado de `espirografo`).
- **Licencia si se adapta código.** MIT de Radiant.

### C-08 «Marco vivo» — fuente: pulsing-border (Paper Shaders)
- **Mecanismo.** Rectángulo redondeado inset por márgenes. Para cada celda se calcula la distancia con signo d al contorno y la posición u ∈ [0, 1) a lo largo del perímetro (longitud de arco). El brillo es glow(|d|, grosor)·Σₖ cometa(u − uₖ − vₖt), donde cada cometa tiene una cabeza y una cola exponencial y un color k. Un pulso periódico modula el grosor y un ruido opcional a lo largo de la normal da el humo.
- **Uso.** Marco de glifos alrededor de un contenido: útil en el espacio Componentes (tarjetas, banners) y en Terminal.
- **Controles.** Grosor, márgenes, radio de esquina, número de cometas, velocidad, pulso, suavidad.
- **Destino.** Texto-Terminal.
- **Presets.** «Marco de terminal» (charset `marcos`, un cometa). «Neón doble» (dos cometas opuestos de colores distintos). «Latido» (pulso).
- **Licencia si se adapta código.** Apache-2.0: copia de LICENSE, conservar el NOTICE «Powered by Paper Shaders: https://shaders.paper.design» y marcar los archivos modificados (§4(b) de Apache).

### C-09 «Orden y caos» — fuente: phase-transition (Radiant)
- **Mecanismo.** Partículas con posición de reposo hᵢ en una red (cuadrada o hex). Un frente x_f(t), lineal o radial, cambia su estado. En orden: muelle hacia hᵢ con un leve temblor. En caos: velocidad de un campo rizado (como C-02) con amortiguación. La transición se suaviza con smoothstep de la distancia al frente y el color sale de la velocidad (frío en orden, caliente en caos). Resultado: un cristal de glifos que se funde al paso del frente y vuelve a cristalizar.
- **Controles.** Tipo de red, velocidad y dirección del frente, turbulencia, rigidez.
- **Destino.** Geométricas (también Fondos).
- **Presets.** «Fusión» (frente de izquierda a derecha y vuelta). «Cristalización radial». «Onda de calor».
- **Licencia si se adapta código.** MIT de Radiant.

## 5. Mejoras transversales detectadas (filas «Mejora de …»)

- **Relieve especular de un campo.** Afecta a `mareas_lentas`, `marmol` y `lava` (fuentes: silk-groove, silk-cascade, liquid-gold, Vanta waves, ShaderGradient).
  - n = normalize(−k·∂f/∂x, −k·∂f/∂y, 1) por diferencias finitas en la propia celda.
  - Blinn–Phong con una luz que se mueve, Fresnel opcional (1 − n·v)⁵.
  - Variante anisótropa tipo Kajiya–Kay: spec = (1 − (T·H)²)^(p/2) con T a lo largo de los pliegues.
  - En glifos, el brillo especular da puntos de luz que «corren» por el relieve.
- **Modo vidrio para `esfera` y `poliedro`** (fuentes: three.js transmission/dispersion, ShaderGradient glass).
  - Desplazamiento de muestreo de la capa inferior = refract(rd, n, 1/IOR).xy·grosor.
  - Dispersión: un IOR distinto por canal.
  - Mezcla Fresnel con el reflejo del entorno.
  - Es la misma técnica que la lupa (`interact:lens`), pero ligada a la normal del sólido.
- **`campo_flujo` por ruido.** Ángulo θ = 2π·ruido(p·s, t) y líneas de corriente con estela (fuentes: flow-field, Vanta topology).
- **`jade_vivo` con ruido.** Desplazamiento por ruido 3D periódico, torsión en Y y color por desplazamiento (fuentes: WebGLBlobs, ShaderGradient sphere).
- **`grietas` que crecen** (fuente: gilded-fracture).
- **`catenaria` vibrante** (fuente: resonant-strings).
- **`fx:bloom` anamórfico** (fuente: lens-whisper).
- **`interact:paint` con ancho por velocidad y sangrado** (fuente: ink-calligraphy).
- **`fx:grain` en modo «papel»** (fuente: paper-texture).

## 6. Butterchurn: cómo funciona el bucle y cómo hacer una familia autónoma (V-09)

### 6.1 Lo que hace Butterchurn en cada fotograma
Fuentes: `src/rendering/renderer.js`, `shaders/warp.js`, `shaders/comp.js`; valores por defecto en `src/visualizer.js` (`baseValsDefaults`).

1. **Estado.** Dos texturas RGBA, `prevTexture` y `targetTexture`, que se intercambian en cada fotograma (ping-pong), con mipmaps. El muestreador principal repite (`REPEAT`); hay variantes con `CLAMP` según `wrap`.
2. **Ecuaciones por fotograma.** Producen las variables del fotograma: `zoom, zoomexp, rot, warp, warpscale, warpanimspeed, cx, cy, dx, dy, sx, sy, decay, gammaadj, echo_zoom, echo_alpha, echo_orient, wave_*, ob_*, ib_*, mv_*, q1…q32`, y reciben `time, frame, fps, bass/mid/treb(_att)`. Valores por defecto: decay 0,98, gammaadj 2, echo_zoom 2, echo_alpha 0, zoom 1, zoomexp 1, rot 0, warp 1, warpscale 1, warpanimspeed 1, cx = cy = 0,5, sx = sy = 1, wrap 1.
3. **Malla de warp** (48×36 por defecto). Para cada vértice con x, y ∈ [−1, 1], `rad` (radio con aspecto) y `ang`:
   - Las ecuaciones por vértice pueden reescribir zoom, rot, cx, dx…
   - zoom₂ = zoom^(zoomexp^(2·rad − 1)) → u = x·0,5·aspectx/zoom₂ + 0,5 (igual para v con −y).
   - Estiramiento alrededor del centro: u = (u − cx)/sx + cx.
   - Warp: u += warp·0,0035·[sin(0,333·τ + (x·f₀ − y·f₃)/warpscale) + cos(0,753·τ − (x·f₁ − y·f₂)/warpscale)] y v += warp·0,0035·[cos(0,375·τ − (x·f₂ + y·f₁)/warpscale) + sin(0,825·τ + (x·f₀ + y·f₃)/warpscale)], con τ = time·warpanimspeed y fᵢ frecuencias que oscilan lentamente (≈ 9–12 ± 3–4·cos(τ·0,9–1,4 + fase)).
   - Giro rot alrededor de (cx, cy); traslación −(dx, dy).
   Las UV se interpolan dentro de la malla, así que el campo de desplazamiento es suave a trozos.
4. **Paso de warp.** target = texture(prev, uv_warp)·decay con el shader por defecto. Los presets con shader propio (`warp`) acceden además a `sampler_blur1..3`, a las texturas de ruido y a las variables q.
5. **Desenfoques.** Del target se calculan hasta 3 niveles de desenfoque separable que se usarán en el fotograma siguiente.
6. **Semillas dibujadas *dentro* del buffer**, para que el warp las arrastre en el fotograma siguiente:
   - vectores de movimiento;
   - hasta 4 formas (polígono de `sides` lados, `rad`, `ang`, color de centro y de borde, `additive`, `num_inst`; con `textured` el polígono se rellena con el fotograma anterior girado `tex_ang` y escalado `tex_zoom` → copias recursivas);
   - hasta 4 ondas propias (512 muestras con ecuaciones por punto);
   - la onda básica: 8 modos (0 círculo radial, 1 polar con ángulo por un canal y radio por el otro, 2–3 osciloscopio XY, 4 línea con inercia, 5 XY girado, 6–7 una o dos líneas inclinadas);
   - `darken_center`;
   - marco exterior e interior (`ob_size`, `ib_size`).
7. **Composición a pantalla.** No vuelve al bucle.
   - uv_eco = (uv − 0,5)/echo_zoom·(±1, ±1) + 0,5, donde `echo_orient` 1 voltea en x, 2 en y y 3 en ambos.
   - ret = mix(main(uv), main(uv_eco), echo_alpha).
   - Después: ret ·= gammaadj, tinte de 4 esquinas (`hue_shader`, mezclado por `fShader`), y opcionalmente brighten = √, darken = x², solarize = 4x(1 − x), invert.

### 6.2 Familia autónoma (sin música) para GLYPHOS
- **Estado.** Un buffer de color en floats a 2–4 veces la resolución de celdas (la realimentación a resolución de celda se ve en bloques), reducido por promedio a celdas en cada fotograma. Brillo → glifo; color por celda tomado del buffer (sinergia con el color por celda de V-01). Gemelo CPU: `Float32Array` con la misma fórmula, paso fijo y semilla fija. Es una familia con estado (sin bucle analítico): calentamiento y punto de control, como `fluido` o `reaccion_difusion`.
- **Parámetros por fotograma.** Se sustituye el audio por osciladores lentos y deterministas: L(t) = Σ aᵢ·sin(ωᵢt + φᵢ) con ωᵢ inconmensurables, y un «pulso» periódico de ataque rápido y caída exponencial que hace de golpe de bombo. Variables expuestas: zoom, zoomexp (dependencia radial), giro, centro (cx, cy) que deambula, deriva (dx, dy), warp (amplitud) y escala del warp, decay (multiplicativo) y desvanecimiento sustractivo opcional (como `Hyperspace - kaleidoscope`, que resta 0,008).
- **Paso de warp por celda.** Se aplica la fórmula del punto 3, evaluada por subcelda o en una malla gruesa e interpolada. Después, opcionalmente:
  - realce: c ← c + k·(c − desenfoque(c)), base de la «tinta recursiva»;
  - giro de tono de la realimentación (matriz de rotación alrededor del eje gris);
  - espejo dentro del bucle: uv ← 0,5 + |uv − 0,5|, para espejos recursivos.
- **Semillas.** Curva de una señal sintética (círculo radial o línea inclinada), polígono de N lados con borde, polígono texturizado (copia del buffer girada y escalada), puntos, o una capa de cualquier patrón existente de GLYPHOS inyectada con poca opacidad (la forma más «GLYPHOS» de alimentar el bucle).
- **Salida.** Eco espejado opcional (echo_alpha, orientación), gamma y luego paleta y glifos de GLYPHOS.

### 6.3 Qué estilos de preset corresponden a cada receta

| Receta V-09 | Parámetros clave | Presets representativos (sólo como referencia visual) |
|---|---|---|
| «Tinta recursiva» | zoom 1,005–1,01 (entra despacio); giro y centro que deambulan (±0,01 rad, ±0,2); warp ≈ 0; realce +0,3·(c − desenfoque) y luego ×0,9; algo de desaturación; semilla fina (puntos o línea) | «Geiss - Reaction Diffusion 2» y «… 3» (zoom 1,009006, warp 0,000536; el warp suma (c − blur2)·0,3 y multiplica ×0,9); «beta106i - Potion of Ink» (decay 0,9, zoom −0,06 por píxel y pulsos de dx/dy); «DemonLD_-_Toxic_water_diffusion…» |
| «Espejos» | echo_alpha ≈ 0,5 con orientación 1 (horizontal), 2 (vertical) o 3 (ambas), o espejo dentro del bucle; formas texturizadas que copian el fotograma anterior; decay ≈ 0,9–1 | «Aderrasi - Curse of the Mirror Emu» (echo_orient 1, echo_alpha 0,5, decay 1); «Rovastar + Geiss - Hyperspace - kaleidoscope» (zoom 0,7997, la composición pliega el ángulo polar → caleidoscopio); «Geiss - Feedback 2» (4 formas, 2 texturizadas, echo_zoom 0,71); «Flexi - reality tunnel» (echo_orient 3) |
| «Zoom» | zoom 1,02–1,035 con zoomexp 1,5–4 (los bordes avanzan más que el centro → túnel); giro constante o por radio rot += 1/(10·(rad + 0,2)) (huracán); decay 0,98–1; semilla en el centro o en un anillo | «Geiss - 3 layers (Tunnel Mix)» (zoom 1,033, zoomexp 2,007); «_Rovastar + Geiss - Hurricane Nightmare (Posterize Mix)» (zoom 1,021, zoomexp 3,6, rot −0,16 y rot por píxel); «Krash + Illusion - Spiral Movement» (zoom 1,0201, warp 0,82, warpscale 16,2); «Flexi - infused with the spiral» (zoomexp 4,29) |

## 7. Archivos fuente de V-01…V-10: licencia exacta y mecanismo

Las rutas se dan en la revisión registrada. Ninguno de estos archivos tiene cabecera de licencia propia: rige la licencia del repositorio. Las descripciones explican el mecanismo para reimplementarlo desde cero como campo GLSL con gemelo CPU, sin copiar código ni constantes concretas.

### V-01 Corrientes de color — Paper `packages/shaders/src/shaders/mesh-gradient.ts`
- **Ruta:** https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shaders/mesh-gradient.ts
- **Cabecera y crédito:** sólo JSDoc descriptivo («A flowing composition of color spots, moving along distinct trajectories and transformed by organic distortion»), sin crédito ni licencia.
- **Licencia:** Apache-2.0 + NOTICE del repositorio (titular según README: Lost Coast Labs, Inc.).
- **Uniforms:** `u_colors[10]`, `u_colorsCount`, `u_distortion`, `u_swirl`, `u_grainMixer`, `u_grainOverlay` y los comunes de tamaño y posición.
- **Mecanismo:**
  - Cada mancha i sigue una trayectoria tipo Lissajous en el cuadrado unidad, con frecuencias y fases derivadas de su índice, distintas entre manchas.
  - La UV se deforma antes de medir distancias: dos iteraciones de ondas senoidales cruzadas (x según y, y según x), cuya amplitud baja hacia los bordes, más un remolino que gira la UV alrededor del centro un ángulo proporcional al radio.
  - Color = Σ wᵢcᵢ / Σ wᵢ con pesos de distancia inversa muy picudos (wᵢ = 1/(dᵢᵖ + ε), p ≈ 3,5): interpolación de Shepard, zonas casi planas con transiciones suaves. La opacidad se pondera igual.
  - Grano: uno desplaza las posiciones (bordes granulados) y otro superpone ruido blanco y negro.
- **En GLYPHOS:** color por celda = la mezcla ponderada; glifo por luminancia o por «dominancia» maxᵢ wᵢ/Σ wᵢ (los bordes entre corrientes quedan como glifos ligeros).

### V-02 Membrana iridiscente — Radiant `static/artpop-iridescence.html` (+ three.js como modelo físico)
- **Ruta:** https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/artpop-iridescence.html
- **Cabecera y crédito:** ninguno salvo el comentario «Simplex noise (Ashima Arts)» sobre el ruido embebido.
- **Licencia:** MIT, «Copyright (c) 2025 Paul Bakaus».
- **Uniforms:** `u_time`, `u_res`, `u_filmThickness` (0,5–3; defecto 1), `u_flowSpeed` (0,1–2; defecto 0,5), `u_center`, `u_scale`, `u_mouse` (el ratón inclina la vista).
- **Mecanismo:**
  - Altura s(p, t) = unos pocos productos de senos de baja frecuencia + fBm con doble warping + ruido fino; la normal sale por diferencias finitas.
  - Grosor como fase: θ = base + s·K·grosor + término de «gravedad» (más grueso abajo) + respiración lenta; c = |n·z| (coseno de vista).
  - Color de película = (0,5 + 0,5·cos(θ·c + {0, 2π/3, 4π/3}))², un arcoíris por coseno desfasado. Fresnel (1 − c)⁴ aclara los bordes y dos especulares Blinn añaden brillo.
  - Tres «burbujas» de borde ruidoso se componen; viñeta y curva en S.
- **Variante física de referencia.** three.js `src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js` (MIT, cita a Belcour y Barla 2017): diferencia de camino OPD = 2·n_película·d·cos θₜ (Snell para θₜ), reflectancias de Fresnel en las dos interfaces, suma de Airy de los órdenes m = 1, 2, y sensibilidad XYZ evaluada en el espacio de Fourier → RGB. d ≈ 100–400 nm.
- **En GLYPHOS:** campo = grosor; color por celda = película (sinergia con V-01); glifo por luminancia o por bandas de grosor.

### V-03 Cromado en tramas — Paper `packages/shaders/src/shaders/liquid-metal.ts`
- **Ruta:** https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shaders/liquid-metal.ts
- **Cabecera y crédito:** sólo JSDoc descriptivo.
- **Licencia:** Apache-2.0 + NOTICE.
- **Uniforms:** `u_image` (preprocesada: R = campo de borde, G = opacidad), `u_colorBack`, `u_colorTint` (fusión «color burn»), `u_repetition` (1–10), `u_softness`, `u_shiftRed`/`u_shiftBlue` (dispersión −1..1), `u_distortion`, `u_contour`, `u_angle`, `u_shape` (sin máscara, círculo, margarita, rombo, metabolas animadas), `u_isImage`.
- **Mecanismo:**
  - Preproceso en CPU (`toProcessedLiquidMetal`): de la máscara se resuelve una ecuación de Poisson ∇²u = −C dentro de la forma con u = 0 en el borde (SOR rojo-negro con ω ≈ 1,9, unas 40 iteraciones a 512 px). La solución u vale 0 en el contorno y crece hacia dentro; se guarda invertida en R (1 en el contorno → 0 en el interior) junto al alfa en G.
  - Shader: la coordenada de banda es la diagonal girada por `u_angle`, perturbada por ruido y **doblada por el campo de borde**: cerca del contorno las bandas giran y se comprimen siguiéndolo (`u_contour` regula cuánto).
  - La banda se escala por `u_repetition` y se desplaza con el tiempo. Cada periodo es una secuencia de franjas finas claras y oscuras + una franja ancha en degradado (el aspecto «cromo»).
  - R y B se evalúan con la fase desplazada: dispersión en los bordes.
- **En GLYPHOS:** máscara = texto, forma o imagen de la pieza; el campo de borde puede ser una transformada de distancia o unas iteraciones de Jacobi (gemelo CPU idéntico); glifo por fase de banda.

### V-04 Paneles prismáticos — Paper `packages/shaders/src/shaders/color-panels.ts`
- **Ruta:** https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shaders/color-panels.ts
- **Cabecera y crédito:** sólo JSDoc («Pseudo-3D semi-transparent panels rotating around a central axis»).
- **Licencia:** Apache-2.0 + NOTICE.
- **Uniforms:** `u_colors[7]`, `u_colorsCount`, `u_colorBack`, `u_density` (0,25–7), `u_angle1`/`u_angle2` (sesgo −1..1), `u_length` (0–3), `u_edges`, `u_blur` (0–0,5), `u_fadeIn`, `u_fadeOut`, `u_gradient`.
- **Mecanismo:**
  - 12–20 paneles son planos que comparten un eje horizontal; el ángulo de cada uno avanza con fract(t + i/N), con dos conjuntos que van en sentidos opuestos.
  - Para cada píxel se resuelve la intersección con el plano del panel: z = y/(sin α − y·cos α), válida si 0 < z ≤ z_máx. La coordenada a lo largo del panel es x·(cos α·z + 1)/largo, y el panel es una ventana suave entre bordes izquierdo y derecho sesgados por la profundidad.
  - Desvanecimiento cerca del eje y cerca del observador; color por índice de panel con degradado hacia el siguiente según la profundidad.
  - Composición de atrás adelante con alfa «sobre».
- **En GLYPHOS:** cobertura → densidad del glifo; profundidad → peso del trazo; color compuesto → color por celda.

### V-05 Mosaico cinético — Radiant `static/gilt-mosaic.html`
- **Ruta:** https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/gilt-mosaic.html
- **Cabecera y crédito:** ninguno.
- **Licencia:** MIT, «Copyright (c) 2025 Paul Bakaus».
- **Uniforms:** `u_tileScale`, `u_lightSpeed`, `u_animMode` (0 = destellos sueltos, 1 = volteo en ola), `u_waveSpeed` (duración del barrido), `u_waveDelay`, `u_waveDir` (0–3: izquierda→derecha, derecha→izquierda, arriba→abajo, abajo→arriba), `u_click`/`u_clickTime`, `u_mouse`.
- **Mecanismo:**
  - Rejilla con un leve desplazamiento aleatorio por tesela y máscara de lechada. Cada tesela tiene una normal inclinada al azar y microrrugosidad.
  - Un frente con avance suavizado recorre el eje elegido, con un retraso aleatorio pequeño por tesela; el ángulo de volteo es (paridad de la ola + progreso suave)·π.
  - Perspectiva: la coordenada local se comprime a lo largo del eje por |cos ángulo|. La cara trasera usa otra normal aleatoria.
  - Luz: tres luces puntuales en órbita (Blinn con exponente distinto por tesela + difusa) y, en el modo sin ola, destellos pow(max(sin(fase), 0), alto). Un clic lanza una ola radial.
- **En GLYPHOS:** una tesela = un bloque de celdas; durante el volteo el glifo pasa por formas «de canto» (`|`, `-`), lo que lo hace muy legible en ASCII.

### V-06 Lluvia sobre vidrio — Radiant `static/rain-on-glass.html` (y `rain-umbrella.html`)
- **Ruta:** https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/rain-on-glass.html
- **Cabecera y crédito:** comentario «60 · Rain on Glass — Canvas-stamp refraction / Procedurally generated drop bitmaps + WebGL refraction shader»; el registro dice «Inspired by the excellent work of Lucas Bebber» con enlace a codrops/RainEffect.
- **Licencia:** MIT declarado, pero con problema de procedencia (§8): no copiar código.
- **Uniforms del shader:** `u_waterMap`, `u_textureFg`, `u_textureBg`, `u_textureShine`, `u_minRefraction`, `u_refractionDelta`, `u_parallax*`, `u_brightness`, `u_alphaMultiply`, `u_alphaSubtract`, `u_renderShine`, `u_renderShadow`.
- **Mecanismo general** (reimplementable sin el código):
  - Una lista de gotas (posición, radio, momento) en CPU. Aparecen gotas nuevas; una gota recibe impulsos al azar con probabilidad creciente con su radio y cae.
  - Al moverse deja gotas pequeñas detrás (estela).
  - Dos gotas que se tocan se funden conservando el área (r = √(r₁² + c·r₂²)).
  - El momento decae; hay una capa de microgotas que se limpia a lo largo del recorrido.
  - Cada gota se estampa en un «mapa de agua» que guarda un desplazamiento de refracción tipo lente y una profundidad.
  - El shader muestra la escena de fondo desenfocada y, dentro de cada gota, la escena nítida muestreada en uv + desplazamiento·(mín + profundidad·delta): las gotas actúan como lentes invertidas. Añade una sombra en el borde inferior.
- **En GLYPHOS:** mapa de agua a resolución de subcelda; la capa inferior (patrón, foto o texto) se muestrea desplazada dentro de las gotas, con más contraste. Gemelo CPU con semilla fija; es una familia con estado.

### V-07 Superficie que se abre y reconstruye — Radiant `static/torn-paper.html`
- **Ruta:** https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/torn-paper.html
- **Cabecera y crédito:** ninguno.
- **Licencia:** MIT, «Copyright (c) 2025 Paul Bakaus».
- **Uniforms:** `u_tearSpeed`, `u_glowIntensity`, `u_mouse` (paralaje); ciclo fijo de 7 s.
- **Mecanismo:**
  - El ciclo tiene 4 fases (calma, desgarro, abierto, recomposición, en proporción 1,5/1,5/2/2) con suavizado propio en cada una.
  - En cada ciclo, un punto de impacto y una inclinación al azar. La línea de desgarro es una distancia con signo a una recta, más un fBm «fibroso» anisótropo (estirado a lo largo de la recta, varias octavas).
  - La anchura de la abertura crece desde el impacto con un radio de propagación proporcional al progreso y es mayor cerca del centro. La máscara de hueco es |d| < anchura/2.
  - Las dos mitades del papel se separan a lo largo de la normal. Debajo hay una capa luminosa (nebulosa de fBm con warping, venas crestadas, destellos).
  - Bordes con tres halos (interior, medio, exterior) y sombreado de «rizo»; antes del desgarro aparece una grieta tenue.
- **En GLYPHOS:** la máscara revela cualquier segunda capa o patrón. Variantes ya mapeadas: quemado (burning-film, polaroid-burn).

### V-08 Descargas eléctricas — Radiant `static/voltage-arc.html`
- **Ruta:** https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/voltage-arc.html
- **Cabecera y crédito:** ninguno.
- **Licencia:** MIT, «Copyright (c) 2025 Paul Bakaus».
- **Uniforms:** `u_arcIntensity`, `u_crackleSpeed`, `u_mouse` (el cursor es un 5.º conductor).
- **Mecanismo:**
  - 4 conductores siguen órbitas elípticas lentas con deriva. Se dibujan arcos entre pares consecutivos (un anillo) y una diagonal intermitente.
  - Para cada píxel se proyecta sobre el segmento AB (parámetro s ∈ [0, 1]) y se toma el punto del eje desplazado en perpendicular por ruido de 2–3 octavas en (s·k, t·rápido), atenuado por s(1 − s) en los extremos, más un temblor fino.
  - Con d = distancia a ese punto: núcleo ∝ 1/(d² + ε) (con tope) + halo interior ∝ 1/(d + ε) + halo exterior, todo × pulso lento × parpadeo rápido.
  - Ramas más cortas con otra atenuación; brillo en los conductores; color por intensidad (núcleo blanco → ámbar).
  - Proyectar y luego desplazar es una aproximación (no es la distancia exacta a la curva), suficiente a resolución de celda.
- **En GLYPHOS:** en modo `lines` el glifo sigue la dirección del arco. Variante «tormenta» (thunder-sermon): rayo cielo–suelo con ramas fractales.

### V-09 Ecos y realimentación — Butterchurn + Radiant `static/feedback-loop.html` (+ Vanta halo)
- **Rutas:**
  - https://github.com/jberg/butterchurn/blob/fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e/src/rendering/renderer.js
  - …/src/rendering/shaders/warp.js
  - …/src/rendering/shaders/comp.js
  - https://github.com/pbakaus/radiant/blob/59e9f48c0ad9a3db2fbeb8898b4390d5a1eabb40/static/feedback-loop.html
- **Cabecera y crédito:** Radiant: «Feedback Loop — Recursive video feedback creating infinite fractal tunnel depth… Inspired by Daft Punk's Alive 2007 pyramid projections». Butterchurn: sin cabeceras por archivo.
- **Licencia:** MIT de Butterchurn («Copyright (c) 2013-2018 Jordan Berg») y MIT de Radiant.
- **Mecanismo:** ver §6. La versión de Radiant: ping-pong; lee el fotograma anterior con zoom de 2–3 % por fotograma y un giro pequeño de sentido alterno; muestrea R, G y B con UV ligeramente distintas (aberración que se acumula); rota el tono un poco; multiplica ×0,96; dibuja encima semillas SDF (círculo, hexágono, estrella, triángulo) que giran.

### V-10 Vidrio acanalado — Paper `packages/shaders/src/shaders/fluted-glass.ts`
- **Ruta:** https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shaders/fluted-glass.ts
- **Cabecera y crédito:** sólo JSDoc.
- **Licencia:** Apache-2.0 + NOTICE.
- **Uniforms:** `u_image`, `u_size`, `u_shape` (1 líneas, 2 líneas irregulares, 3 onda, 4 zigzag, 5 patrón), `u_angle`, `u_distortionShape` (1 prisma, 2 lente, 3 contorno, 4 cascada, 5 plano), `u_distortion`, `u_shift`, `u_stretch`, `u_blur`, `u_edges`, márgenes, `u_shadows`, `u_highlights` y sus colores, grano. **No tiene `u_time`: es un filtro estático.**
- **Mecanismo:**
  - La UV de la imagen se escala al tamaño de la rejilla y se gira por `u_angle`. Una curva opcional desplaza las franjas (onda, zigzag, irregular).
  - En cada franja, x ∈ [0, 1) es la posición dentro de la franja. Un perfil f(x) según la forma (prisma ≈ −x³, lente ≈ x², contorno ≈ (2x − 1)⁶, cascada ≈ seno, plano) desplaza la coordenada fraccionaria dentro de la franja: la imagen se muestrea corrida a lo largo de la normal de la franja.
  - Encima: desenfoque direccional a lo largo de las franjas, sombras pow(x) y brillos finos en los bordes de franja, recortado por márgenes.
- **En GLYPHOS (V-10):** se anima la fase (uv + v·t a lo largo o a través de las franjas) o se anima la capa de detrás; los bordes de franja se convierten en glifos `|` o `¦` según el ángulo.

## 8. Licencias: problemas, avisos necesarios y lo que no se pudo verificar

1. **Radiant rain-on-glass y rain-umbrella** derivan de codrops/RainEffect:
   - Coinciden las opciones `minR`, `maxR`, `maxDrops`, `rainChance`, `rainLimit`, `dropletsRate`, `dropletsSize`, `dropletsCleaningRadiusMultiplier`, `trailScaleRange`, `collisionRadius`, `collisionRadiusIncrease`, `collisionBoostMultiplier`.
   - Coinciden la fórmula de fusión, la condición de colisión y las funciones del shader `blend`, `pixel`, `parallax`, `texCoord`, `scaledTexCoord` y `fgColor`, con `u_minRefraction`/`u_refractionDelta` (comparado con `raindrops.js` y `shaders/water.frag` de RainEffect @ 5270be6).
   - RainEffect no es MIT: «Integrate or build upon it for free… Don't republish, redistribute or sell "as-is"».
   - El MIT de Radiant no puede otorgar más de lo que permite el original. **Conclusión:** V-06 se implementa desde cero a partir del mecanismo general descrito en §7 y no se copia código de ninguno de los dos.
2. **Paper Shaders.** Sólo se puede adaptar código de versiones ≥ 0.0.77 (Apache-2.0). Si se adapta: incluir el texto Apache-2.0, conservar el NOTICE («Powered by Paper Shaders: https://shaders.paper.design») y marcar los archivos modificados. Las versiones 0.0.47–0.0.76 son PolyForm Shield 1.0.0. Las fotos y los logos de marcas de `docs/public` no tienen licencia declarada: no se usan.
3. **ShaderGradient.** Sin archivo LICENSE: el MIT sólo consta en el README y en `package.json`. Las HDRI son remotas y su licencia no consta en el repositorio. No se propone adaptar código; sólo los mecanismos ya cubiertos.
4. **Vanta.**
   - La licencia de los originales de Clouds (Inigo Quilez, Shadertoy XslGRr) y Clouds2 (Rune Stubbe, Shadertoy lsBfDz) no consta y no se verificó: no copiar esos shaders. Ambos son duplicados de `nubes_vol`, así que no hacen falta.
   - Fog depende de Book of Shaders y de Morgan McGuire (licencias no indicadas).
   - `vendor/FilmGrain_v1.1.frag` es CC BY 3.0 (exige atribución; no se usa en `src/`).
   - `vendor/p5.min.js` va sin cabecera de licencia (el proyecto p5.js indica LGPL-2.1; no verificado aquí).
   - Trunk y Topology: MIT de Kjetil Midtgarden Golid, verificado.
5. **Butterchurn y sus presets.** MIT de Jordan Berg. Los presets son obra de autores de la comunidad MilkDrop sin términos propios documentados. Las texturas embebidas (`imageData.js` en presets, `clouds2` en `imageTextures.js`) no tienen procedencia. Se reimplementa sólo el mecanismo (§6), con parámetros propios.
6. **WebGLBlobs.** El LICENSE dice MIT y `package.json` dice ISC. La fuente Typekit es de Adobe (no reutilizable). `img/noise.png` no tiene licencia indicada.
7. **three.js.** MIT. Los assets de ejemplo (modelos glTF de Khronos, Lucy, pato, texturas de OpenGameArt, HDR) **no se verificaron** y no se necesitan.
8. **Código de ruido embebido** (simplex de Ashima Arts en Radiant, `glsl-noise` en ShaderGradient y WebGLBlobs): las cabeceras de licencia del original no se conservan en Radiant. Su licencia de origen no se verificó en este inventario. GLYPHOS ya tiene su propio ruido: no hace falta copiarlo.
9. **No verificado:** el «94 shaders» del README de Radiant frente a los 88 registrados, y las licencias de los Shadertoy citados por Paper (NlSGDz, ldl3W8) y por Vanta.
10. **Avisos necesarios si se adapta código** (se recomienda no hacerlo):
    - Radiant: MIT, «Copyright (c) 2025 Paul Bakaus».
    - The Spirit: MIT, «Copyright (c) 2015 Edan Kwan».
    - Butterchurn: MIT, «Copyright (c) 2013-2018 Jordan Berg».
    - Vanta: MIT, «Copyright 2020 Teng Bao».
    - three.js: MIT, «Copyright © 2010-2026 three.js authors».
    - WebGLBlobs: MIT, «Copyright (c) 2009 - 2020 Codrops».
    - p5ycho: MIT, «Copyright (c) 2017 Kjetil Midtgarden Golid».
    - Paper: Apache-2.0 + NOTICE.
    - RainEffect: no adaptar.

## 9. Estado tras el cierre del PR #10

Las decisiones y estados de arriba son históricos (revisión de `73d49f2`) y no se reescriben. Tras el cierre
([CIERRE-PR10.md](../CIERRE-PR10.md), §4 con la tabla completa, archivos, pruebas y commits):

- **Las 43 filas «Preset nuevo de …» y «Mejora de …»** quedaron implementadas, cada una con su mecanismo y la diferencia
  visual que pedía; como familias nuevas que extienden el patrón citado (el patrón clásico no cambia), presets de una
  familia con versión nueva o capacidades del motor:

| Fuente | Fila | Implementación |
|---|---|---|
| radiant flow-field · vanta topology | I-01, I-31 | `flujo_ruido` «Líneas de flujo» |
| radiant champagne-fizz | I-02 | `burbujas` «Burbujas con nucleación» |
| radiant resonant-strings | I-03 | `cuerdas` «Cuerdas vibrantes» |
| radiant kinetic-grid | I-04 | `tela` v2 · «Malla cinética» |
| radiant laser-labyrinth · velvet-spotlight | I-05, I-21 | `haces_luz` «Haces de luz» |
| radiant gilded-fracture | I-06 | `grietas_oro` «Grietas de oro» |
| radiant golden-throne | I-07 | `mandala_capas` «Mandala de capas» |
| radiant eclipse-glow | I-08 | `eclipse_total` «Eclipse total» |
| radiant diamond-caustics | I-09 | `talla_diamante` «Talla de diamante» |
| radiant silk-groove · silk-cascade · vanta waves | I-10, I-11, I-33 | `seda` «Seda especular» |
| radiant smolder | I-12 | `calor_radiante` «Calor que irradia» |
| radiant neon-revival | I-13 | `neon_tubos` «Letrero de neón» |
| radiant lipstick-smear | I-14 | `fluido` v2 · «Lazos de tinta» |
| radiant digital-rain | I-15 | `lluvia_agua` «Lluvia digital sobre agua» |
| radiant liquid-gold | I-16 | `metal_fundido` «Metal fundido» |
| radiant woven-radiance | I-17 | `tejido_bandas` «Tejido de bandas» |
| radiant vinyl-grooves | I-18 | `vinilo` «Disco de vinilo» |
| radiant vintage-static | I-19 | `estatica_vhs` «Estática de barras» |
| radiant ink-calligraphy | I-20 | pincel caligráfico (`interact.stroke`, `interact.bleed`) |
| radiant lens-whisper | I-22 | destello anamórfico (`fxKind.bloom`) |
| radiant painted-strata | I-23 | `estratos` «Estratos» |
| radiant navier-stokes | I-24 | `fluido` v2 · «Chorro sumergido» |
| paper dot-orbit | I-25 | `puntos_orbita` «Puntos en órbita» |
| paper smoke-ring | I-26 | `anillo_humo` «Anillo de humo» |
| paper paper-texture | I-27 | papel (`fxKind.grain`, `fxKind.fold`) |
| vanta dots | I-28 | `rejilla_puntos` «Rejilla de puntos» |
| vanta globe | I-29 | `globo_puntos` «Globo de constelaciones» |
| vanta rings | I-30 | `arcos_parciales` «Arcos parciales» |
| vanta trunk | I-32 | `anillos_tronco` «Anillos de tronco» |
| webglblobs · shadergradient sphere | I-34, I-35 | `jade_ruido` «Jade de ruido» |
| shadergradient glass · three.js transmisión y dispersión (WebGL) | I-36…I-40 | vidrio en sólidos (`optics.kind` esfera y poliedro: Fresnel, refracción, dispersión, grosor, tinte) |
| three.js WebGPU (dispersión y transmisión) | I-41…I-43 | equivalentes con trazabilidad: el mismo vidrio en WebGL 2 |

- **C-07 «Grabado láser»**: hecho (familia `grabado`, presets «Tu palabra grabada», «Geometría», «Firma», «Placa
  terminada», «Escritura de luz»; [grabado.md](../cierre-pr10/grabado.md)).
- **Licencias**: todo es código propio desde la descripción del mecanismo; no se copió código ni assets de ninguna de
  las fuentes, y la vía propia de Rain on Glass se conserva. `THIRD_PARTY_NOTICES` no cambia.
