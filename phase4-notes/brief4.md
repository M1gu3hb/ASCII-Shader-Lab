# GLYPHOS phase 4 — brief shared by every lane

Repository: /home/user/ASCII-Shader-Lab (GLYPHOS, formerly Monotrama; https://glyphos-ascii.vercel.app). Read this whole
brief, then /tmp/claude-0/-home-user-ASCII-Shader-Lab/c7654661-29b9-5e25-b7aa-7f9752113607/scratchpad/phase4/architecture.md (a map of the current code with file:line
references), then the contracts in the repo: src/project/types.ts, src/fx/index.ts, src/glyphs/index.ts. When it exists,
also read scratchpad/phase4/research.md (model/runtime research).

## The goal (owner's words, condensed)
GLYPHOS becomes a complete creative ASCII studio. Today the «laboratorio» makes pieces from patterns/photo/video/camera,
rolls the dice, keeps history and exports. Next: a specialised **photo and video ASCII studio** in the same product,
sharing technology (not a copy of the code), where a person uploads a photo or video, transforms only chosen parts,
mixes the original photo with several kinds of ASCII, animates those decisions, explores variations (dice with locks,
history, favourites, linked variants, compare), saves projects non-destructively and exports for web, editorial,
terminal, slides or social. Requirements (all mandatory, built across rounds):
- Non-destructive photo editing: full photo / full ASCII / mixes; transform the whole photo, only the subject/object, only
  the background, one or several drawn areas, several parts with different ASCII styles, graded photo↔characters zones.
  Selection: rectangle, ellipse, other shapes, polygon, freehand lasso, precise contour, assisted object selection with
  positive/negative points (correctable); brushes to take a part to ASCII, erase the effect, restore the original.
  Editable layers and masks with opacity and soft/hard edges; per zone independent: shader/pattern, charset, words,
  font, cell size/aspect, density, contrast, resolution, palette, image colour, position, motion, intensity, blend.
  Finishes: shadows, glow, motion blur, grain, halftone, several dithering methods, invert, strong contrast, mono,
  limited palettes, overlays. Full-character pieces AND posters mixing photo, ASCII, text, lines, shapes, annotations.
  Real ASCII text (copyable/exportable) when offered as text; a richer graphic render when needed — say which is which.
- Background removal inside the studio (auto subject cut-out, keep/remove brushes, colour selection, hair/fur/soft edges,
  halo decontamination, previews on light/dark/contrast backgrounds, transparent PNG export, use as a layer at once, a
  discreet recommendation when useful). Open-source models only, licences of code AND weights checked (rembg's default
  BRIA model is non-commercial: never by accident). Everything in the browser; if anything ever needs a server, explicit
  consent first. No model trained from scratch.
- Animation library (entry/exit/transform, for GIF/video from one photo), mandatory ones: terminal typing, reverse typing,
  image forming from one letter/symbol, low→high ASCII resolution, high→low down to one glyph, fragmentation (scatter
  and re-form), photo→ASCII, ASCII→photo, brief photo/ASCII flicker, one photo through several shaders/charsets/
  densities/weights/colours/cell sizes, parts changing at different times, zones swapping styles, de-fragmentation /
  resolution / recomposition sequences, multi-state transformations, single-palette and colour-changing versions,
  combinable entry/exit around a central state — plus MANY more real, distinct ones. Each editable (duration, speed,
  direction, pauses, intensity, glyphs, resolution, palette, order, region); play/stop/scrub/reverse (real reverse),
  combine, adjust transitions; keyframes, speed curves, loops.
- Video editor: whole video to ASCII; only part of the frame; different treatments per region at once; object tracking
  with per-frame corrections; effects per time range; different shader per segment; animate intensity/glyphs/colour/
  resolution/mask/opacity/blend over time; controlled flicker; random style changes within limits; stable glyphs/masks
  unless flicker is asked; timeline showing segments/layers/masks/transitions/keys; preview = export; progress+cancel;
  original audio kept in sync when possible. Camera: fix the inverted feeling (mirror default, preview = file, front/
  rear, user can choose mirror).
- Mobile: immersive studio mode (canvas as big as possible, only Azar/prev/next/«tools» visible), editing controls that
  open without covering the piece for good, real mobile UX for selection, brushes, compare, timeline; AND improve the
  lab on a vertical phone (art big, thumb-reach frequent actions, easy section switching, compact controls).
- More: before/after slider, linked variants, projects keeping original media + layers + masks + animation, reveal/
  restore brushes, guided point selection, edge smoothing/feather/halo removal, keyframes for palette/mask/glyphs/
  intensity/cell size, speed curves/pauses, dice locks, user words building a figure, photo sequences → animation,
  poster/composition templates for print, separate export of original/masks/cutouts/result, audio kept, light preview +
  higher-quality final render, depth layers with independent motion, user presets reusable on another photo/video.
- Exports: transparent PNG cutout, final PNG (+other image formats), masks/layers separately, GIF, video (formats the
  browser can really encode), SVG only when faithful, TXT/ANSI/terminal only with real characters, README/web/terminal/
  vertical/poster outputs, reusable web code when the effect can run outside, full project file to reopen (media, masks,
  layers, timeline); clear options for resolution, aspect, duration, fps, transparency, loop, audio. PREVIEW AND EXPORT
  MUST MATCH. Explain each format's limits in the UI with useful alternatives.

## References (analysed; results/techniques to make possible, not UIs to copy)
1. asciiart.eu «Image to ASCII»: alphabets (Alphabetic, Alphanumeric, Arrow, Code Page 437, Extended High, Gray Scale,
   Minimalist, Math Symbols, Normal, Normal 2, Numerical, Max, Black and White), sliders characters/brightness/
   saturation/grayscale/invert/sharpness/ASCII gradient/space density, transparent frame, copy text, save PNG.
2. «Grainrad»: effects (halftone, matrix rain, dots, contour, pixel sort, blockify, threshold, edge detection,
   crosshatch, wave lines, noise field, voronoi, VHS), processing (invert, brightness map, edge enhance, blur, quantize
   colours, shape matching), post (bloom, grain, chromatic, scanlines, vignette, CRT curve, phosphor), exports PNG/JPEG/
   GIF/video/SVG/text/HTML; dithered butterfly in blocky pixels; halftone horse.
3. Editorial ASCII (zacharywinterton): posters mixing photo + ASCII (a flower in ASCII on a pale panel, a hand whose
   fingers dissolve into characters, a horse built from text over a blurred photo, the campfire poster where only the
   logs/flame are dithered/ASCII with thin annotation lines and boxed labels «FL33 / PW33», a fruit painting with round
   patches of letters and pixelated/dithered squares, text on a spiral path, keyboard-art magazine pages, Medium ads).
4. «hosqo»: subject cut out (transparent PNG), «Dither Garden» (error diffusion Atkinson/Floyd–Steinberg/Stucki/
   Riemersma/Jarvis, ordered Bayer 4/8/16, threshold, random, blocky pixel, blue noise, serpentine, linear fade, ASCII,
   adaptive error), ASCII with character set + custom colours + transparent background, then in Photoshop the ASCII over
   the original with outer glow and motion blur → «ASCII overlay effect».
5. The two images: the campfire poster (partial transformation + editorial elements) and the fruit bowl (circular ASCII
   patches + dithered pixel squares over a painting).

## Architecture decisions (phase 4)
- **Two experiences, one app family.** The lab stays at /studio/. The new studio is «Foto y video» at /studio/foto/ (a
  second Vite MPA entry, lazy-loading heavy tools), sharing src/engine, src/exporters, src/studio/ui (Picker, ScrollRow,
  Help…), src/studio/motion, the media store, fonts and the design system. Both top bars carry a clear switch
  «Laboratorio ⇄ Foto y video». Bridges: «Llevar al estudio de foto» (lab → a project whose ASCII layer uses the current
  recipe and media), «Usar este estilo» (lab favourites/presets as ASCII layer styles), «Abrir estilo en el laboratorio».
- **Project model**: src/project/types.ts (contract; only lane «core» edits it — others propose changes in their report).
- **One evaluator, one renderer**: evaluate(project, t) → FrameState (layers resolved at t: tracks with easing, spans,
  clip effects as overrides + per-cell hooks); compositor.render(frameState, target, {scale, quality}) draws it. Preview
  = the same call at a smaller scale; export = the same call at scale 1 (quality 'final').
- **Layer rendering**: photo → drawImage with adjustments; ascii → an offscreen AsciiEngine (or BasicEngine without
  WebGL2) per ASCII layer, fixed-size, transparent, fed by the layer source (bitmap/video frame/'below' composite
  canvas); glyphs → src/glyphs (CPU grid + font drawing, real text); text/shape → Canvas2D. Masks rasterised to alpha
  canvases at output size (cached by content hash + size). Finishes via src/fx.applyFinishes. Blend via
  globalCompositeOperation. Engines capped (e.g. ≤ 6 ASCII layers, WebGL context budget) with a clear message.
- **Time sources**: FrameProvider per source: images/sequences (bitmaps); video preview via HTMLVideoElement,
  video export via mediabunny (frame-exact). Audio via mediabunny in exports.
- **Persistence**: projects in their own IndexedDB store; media (originals, masks, mattes, cutouts) in the existing
  content-addressed media store; project file = zip with proyecto.glyphos.json + medios/ (+ mascaras/). Old lab recipes,
  projects (receta.glyphos.json / receta.monotrama.json), sessions keep working in the lab.
- **Determinism**: all randomness seeded (project.seed, layer id, quantised time); no Math.random() in render paths.
- **Honesty**: real characters vs shader ASCII vs dithering vs halftone vs photo composition are different outputs;
  exports say what they contain (TXT only from real characters, SVG only when faithful).

## Working rules (all lanes)
- You run in an isolated git worktree. First: `git checkout -b <your branch> <BASE>`, then
  `ln -s /home/user/ASCII-Shader-Lab/node_modules node_modules` if missing. Commit on your branch at milestones; never push;
  never touch other branches. Commit identity: the repo config (M1gu3hb <huertabautistamiguel62@gmail.com>) — never
  override it; NO trailers at all (no Co-Authored-By, no Claude-Session); plain descriptive English messages. No model
  names anywhere in the repo.
- Stay inside your ownership (listed in your prompt). Shared contract files are edited only by their owner lane.
- Reproduce before fixing; write tests where they guard real risks (Vitest unit in tests/unit, Playwright e2e in
  tests/e2e; `PW_PORT=<your port> npx playwright test <spec>`; workers=1; the machine has 4 CPUs shared with other
  lanes: run targeted specs, the full suite only when your prompt says so).
- UI copy in Spanish (Mexico/neutral), honest and specific: no universal claims («funciona en todos los navegadores»),
  no «nunca se repite». Accessibility: keyboard, focus, names, reduced motion, 44 px touch targets, contrast.
- Visual direction «Telar de precisión» (existing): ink black #0c0b0a, bone #ede6da / cream #efe9df, vermilion #ff5b1f
  only for the one primary action and active states; hairlines, mono values, calm density; the art is the protagonist.
- Look at your results: take screenshots (Playwright with SwiftShader: --use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader) at desktop and phone sizes and READ the PNGs; iterate until it is good.
- Performance: measure (lab numbers, labelled as such); no work every frame when idle; release WebGL contexts, workers,
  object URLs on teardown.
- Final answer: a concise report — what you built (files), how it works, commands you ran with pass counts,
  screenshots paths, what is not verified, proposed contract changes, risks.
