# GLYPHOS architecture map (read-only survey at 4d1ec9e; main is now 21320dd with the same structure)

## 1. Recipe (src/engine/recipe.ts)
- RECIPE_VERSION = 2 (:7). No schema migration beyond migrateV1 (:484) for the original lab. New features = optional keys, key order kept stable (:369).
- Top-level (:75-189): source: 'pattern'|'image'|'video'|'camera'|'text' (:9); layers: Layer[] (≤4 pattern layers); motion {speed, warp, warpScale, hold, loop, pulse, bpm}; media; text; interact {mode, strength, radius, auto}; glyph {cell, aspect, charset, sort, font, weight, scale, mode 'density'|'lines'|'scramble'|'words', words, edge, dither, ditherKind 'bayer'|'noise', jitter}; tone {bright, contrast, gamma, invert, levels}; color {mode 'ramp'|'source', stops[1..6], bg, map, shift, cycle, hue, sat, vivid, shade}; fx {glow, bloom, scan, vig, curve, chroma, grain, flicker, cellBg, grid}; msg; meta {name, seed, arch, space, gen}.
- media (:88-101): {fit 'cover'|'contain'|'stretch', zoom, panX, panY, mirror, mix, blend, reveal (0..1 original shown through), rate, ref?: MediaRef, xform?: Xform[]}. MediaRef (:64-73) {id? (16-hex content hash), kind 'image'|'video', name?, type?, size?, w, h}. publicRecipe() drops id/name for links.
- Xform (:24-29) {kind, on, amount, p}; kinds semitono, contorno, bandas, arrastre, desplazar, caleido, ondular, estela, canales, bloques; max 4; applied on the CELL grid (engine/xform.ts).
- Layer (:42-56) {on, pattern, blend, mix, scale, speed, rot, x, y, a, b, invert, phase}. BlendMode includes mask/cutout/subtract (glsl/core.ts:59-72).
- defaultRecipe() :198 (media.mirror false). normalizeRecipe(input, knownPatterns?) :333 never throws. cloneRecipe :455, recipeBody :460, sameRecipe :465.
- fingerprint(r) (random/generator.ts:428) = look hash for «seen»; recipeVersion(r) (studio/history.ts:97) = exact FNV for thumbnails; GEN_VERSION=4.
- Recipe file {glyphos:'recipe', version:2, recipe} (share.ts:78); links #r=z+base64url(deflate-raw).

## 2. Renderer / AsciiEngine / BasicEngine
- Renderer (engine/renderer.ts:28-77): kind, canvas, recipe, time, isPlaying, stats, glyphChars, transparent, externalPulse, busy; set(next,{transition}), play/pause, setMedia(kind, el), hasMedia, ready(), setFixedSize(w,h,pr), setQuality, holdAdaptive, renderAt(t, realT?), renderNow, drawTo(ctx,w,h), snapshot(sx,sy,sw,sh): Promise<ImageData|null>, readGrid(): GridSnapshot, accent, setPointer, destroy.
- MediaEl = HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageBitmap; MediaKind 'image'|'video'|'camera'.
- EngineOptions (engine.ts:23-46): library, fonts?, googleFonts?, maxPixelRatio?, adaptive?, fixedSize?:{width,height,pixelRatio}, interactive?, pointerTarget?, autoplay?, reducedMotion?, preserveDrawingBuffer?, alpha?, observeVisibility?, readback?, onError?, onStats?. createRenderer(canvas, recipe, opts, {force?:'basic'}) (engine/create.ts:63); basic engine lazy.
- AsciiEngine: WebGL2 context (alpha opt, premultipliedAlpha false). fixed-size engines apply set() at once. renderAt(t, realT=t) (:471). Passes (render :968-1010): update atlas/grad/text/msg/words/media → sim → field shader (generated per {src, loop, patterns}, cache 48) → optional xforms (cell grid) → field (layers → scalar v; media rgb/luma blended via media.mix/blend) → select (tone, levels, dither, glyph index, colour; two RTs: rgb·inten,l and idx16,flags,alpha) → optional bloom → compose (atlas coverage, cellBg/glow, reveal of original media, scan/vig/curve/chroma/grain/flicker/grid, transitions).
- Transparency: engine.transparent=true with alpha:true context → un-premultiplied RGBA, alpha = coverage + cell fill + glow; reveal, bloom, grid and grain skipped when transparent. Offscreen engines use alpha:true (studio/offscreen.ts:29); the stage is opaque.
- Arbitrary size: fixedSize + setFixedSize, clamped ≤8192 / MAX_RENDERBUFFER. cw=round(cell·pr), ch=round(cell·aspect·pr), cols=ceil(W/cw). Needs a DOM canvas (document.fonts) → not worker-safe as is. One WebGL context per instance (~16 max).
- Media upload: updateMedia (:873) texImage2D (images once; video/camera when currentTime changes), no flip, LINEAR, no mips. mediaUV (glsl/programs.ts:25-33): fit/zoom/pan then mirror = x flip. Field pass samples 4 taps per cell (aliasing with big cells).
- readGrid() (:487): sync readPixels; GridSnapshot {cols, rows, chars (real glyphs incl. message/words/edge), rgb (before fx), alpha, lum, flags, bg, cw, ch}.
- BasicEngine (engine/basic/engine.ts:72): same pipeline on CPU, Canvas2D alpha always; 30 fps live (15 slow), BASIC_MAX_PIXELS 2.1M; media copied to RGBA buffer (images ≤2048, video 256–1024 px); MediaMap ports mediaUV.

## 3. Media feeding (studio/media.ts, engineBridge.ts, offscreen.ts)
- useMedia {image, video: MediaInfo|null, camera 'off'|'starting'|'on'|'error', videoPaused, videoMuted, error, need}. Module singletons: image (ImageBitmap/canvas), video (hidden <video>, loop, muted), camEl/camStream. attachEngine(e) :58, mediaElement(kind) :67, mediaBlob(id) :72, syncMedia(force) :119, startMediaSync :172, decodeBitmap :207 (imageOrientation from-image, MAX_SIDE 2400), openVideo :237, loadFile(file) :280 → MediaRef.
- Camera: startCamera() :338 getUserMedia({video:{facingMode:'user', width:{ideal:1280}}, audio:false}); no environment/rear option, no device list, no getSettings(). stopCamera :377. cameraProblem :319.
- Mirror: recipe.media.mirror default false for all sources (recipe.ts:204); single «Espejo» toggle (panels.tsx:412). Stage and exports get the same recipe → mirror never differs between preview and export. The «inverted» feeling = front camera not mirrored by default. Fix: default mirror on when actual facingMode is 'user' (recipe-level, so exports follow); add rear camera.
- Real preview/export differences: (a) video/GIF/text-frame exports start at liveTime() and seek video to (start+i/fps)·rate mod duration, unrelated to the stage video position; (b) fixed-size presets reframe (cover); (c) preview simplify turns chroma off (basic also curve/bloom/grain); (d) camera: only live recording or still; (e) during export the stage video is paused/scrubbed.
- mountStudioEngine(container,{force}) (engineBridge.ts:43); getEngine :27; previewRecipe :216.
- Media store (studio/mediaStore.ts): IndexedDB mt-media/blobs; StoredMedia {id, kind, name, type, size, w, h, added, blob}; id = SHA-256 16 hex (big files: 3×2MB samples); limits image 40MB, video 200MB; put(file, meta) :80; gcMedia(referenced, grace) :136 (called from store.ts collectMedia :223).

## 4. Export pipeline (studio/exporting.ts)
- SIZE_PRESETS :19, resolveSize :30. offscreenEngine(recipe, size, {transparent?, readback?}) (offscreen.ts:24): fresh canvas + renderer (same kind as stage), fixedSize, preserveDrawingBuffer, alpha, no autoplay/interactive, stageMedia(), await ready().
- exportImage(r, spec, {transparent, format}) :55 renderAt(liveTime()) → toBlob (current video frame, no seek).
- exportVideo(r, spec, {fps, seconds, format 'mp4'|'webm', start}, progress, cancel) :189: import('mediabunny'); Output(Mp4OutputFormat({fastStart:'in-memory'})|WebMOutputFormat(), BufferTarget); CanvasSource(eng.canvas, {codec avc|vp9|vp8, quality QUALITY_HIGH, keyFrameInterval 2}); addVideoTrack(src,{frameRate}); per frame seek clip, renderAt(clipTime, start+i/fps), await src.add(i/fps, 1/fps); finalize → Blob. withRepairedAvc (exporters/avc.ts). Cancel → output.cancel(). NO AUDIO anywhere.
- videoFrames(r) :123 pauses stage <video> and seeks (seekVideo :106 waits 'seeked' ≤1.5s). No mediabunny decoding of the source yet.
- exportGif :314 (gifenc lazy; quantize/applyPalette per frame). LiveRecorder :225 MediaRecorder(captureStream) 16 Mbps; tidyRecording :295 remux via mb.Input(BlobSource)+Conversion.
- captureGrid(r, cols?, rows?, time) :362; captureFrames(...) :367 → gridToText/gridToAnsi.
- Progress (p,label) :71, Cancel {cancelled, active?} :73, useStopOnLeave :79.

## 5. Studio state / routing / persistence
- useStudio (store.ts:78): ready, space, entries, cursor, favorites, locks, arch, amount, change {kind, n}, playing, reducedMotion, ui, stats, undoTick, histLimit, pruned, storage, away. UIState {panel, hideUI, tab, views, viewOpts, terminal, sheet, component}.
- Entry (history.ts:12-33) {id, recipe, origin, kind, label?, seed?, arch?, space, created, updated?, edited, thumb?, thumbV?, favId?}; Favorite (:35-43); HISTORY_LIMIT 1000.
- Actions: currentRecipe :112, rollDice :305, vary :314, variations :324, applyRecipe :331, go/back/forward :336-348, edit(fn,key) :351 (undo per entry in memory), undo/redo, setSpace :477, favourites :503-565, setUI/setLocks/toggleLock… :571-577, hydrate :768, importSession :454.
- Persistence: IndexedDB keyval-store/keyval: mt.v3.history {v:3, ids, cursor}, mt.v3.e:<id>, mt.v3.t:<id>, mt.v2.favorites, mt.v2.seen, mt.v3.owner, legacy mt.v2.history; idbWrite(puts, dels, {fence|commit}) (idb.ts:100). localStorage mt.v2.prefs, mt.v3.preview, mt.v2.ramps, mt.motor, … sessionStorage mt.intro. Tab ownership: Web Lock + BroadcastChannel 'monotrama-estudio' (tabs.ts:13).
- Routing: MPA pages from PAGES (shared/site.ts; vite.config.ts:31); studio page studio/index.html. main.tsx: claimStudio → hydrate → bootFromUrl (#r=, #seed=&space=&arch=&gen=, #space=&source=, ?camino=) → <App/>. App.tsx switches only on space==='componentes' (:39-55). Keys 1..6 → SPACES. Adding a SpaceId touches spaces.ts, TABS (panels.tsx:31), PRESETS/spaceAccepts (presets.ts), SPACE_ICON (icons.tsx:66), genFuente branches, keys.
- Project zip (shared/project.ts): buildProject(recipe, media?) → receta.glyphos.json + medios/<name> + LEEME.txt; readProject(files); studio exportProject/openProject (packages.ts:47/59). Session zip (shared/session.ts): buildSession(data, media[], scope) → sesion.json + medios + LEEME; readSession. Zip helpers home-made (shared/zip.ts).

## 6. Generator / locks / variants
- roll(inp: RollInput) (random/index.ts:79): {space, arch?, base, locks?, seen, seed?, gen?, recent?, maxTries, fresh?, rand?} → {recipe, seed, fp, tries, repeated}.
- LockGroup = 'forma'|'color'|'glifos'|'movimiento'|'efectos'|'fuente'; copyGroup copies from base: forma→layers+warp, color→color, glifos→glyph+tone, movimiento→motion+interact, efectos→fx, fuente→source+media+text+msg.
- mutate(r, amount, seed, locks) :357; vary() adds 'variación' entries; variations(n) for the explorer; randomXforms.
- History: linear entries + cursor; forward() at end rolls; origin kept; edits in place with in-memory undo; favourites are copies linked by favId.

## 7. Masks / regions / dithering / text
- No spatial masks, regions or media layers. Closest: blend mask/cutout, media.reveal (global crossfade, opaque only), interact erase/paint/ripple (live-only sim, not in recipe), msg.box, transitions' cell masks (compose transCell), scrim (DOM/CSS + runtime option).
- Dither/halftone at CELL resolution: glyph.dither bayer8/hash; tone.levels; xforms semitono (45° dot screen), bandas, bloques (pixelate), contorno (Sobel), canales, caleido, ondular, desplazar, arrastre (pixel sort), estela; glyph mode lines/edge.
- Text exports (exporters/text.ts): gridToText :66 (cells alpha ≤40 hidden; wide chars), gridToAnsi(depth), gridToHtml, gridToHtmlPage, Frames/toAsciicast/toNodePlayer/toPythonPlayer/toShellBanner. SVG gridToSvg(g, r, {mode outline|text, transparent}) (opentype lazy). Code export embeds runtime (Glyphos.mount, <glyphos-field>, runtime VERSION 2.3.0).

## 8. Size / perf
- Chunks: mediabunny 689 KB (lazy), exporter-code 370 KB (lazy), studio entry 312 KB, opentype 170 KB (lazy), ComponentsSpace 127 KB (lazy), basic-engine 82 KB (lazy), create 70 KB, offscreen 51 KB, random 46 KB, legibility 43 KB, patterns 41 KB, export-sheet 37 KB (lazy).
- Heavy paths: per-combination field shader compile, xform program compile on first use, sync readGrid in WebGL, GIF quantise on main thread, exports on main thread yielding every 2–6 frames, shared thumbnail offscreen engine released after 30 s idle.
- Implications for a layered studio: N offscreen engines (N contexts) or render layers sequentially in one fixed-size engine and composite; media elements are module singletons (one image/video/camera) → must become per-layer sources; export timeline needs its own video clock (mediabunny Input + VideoSampleSink/CanvasSink) and AudioSampleSource/packet copy for sound.
