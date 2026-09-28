/**
 * Code exporters: a background or component that works when pasted into any website.
 * The runtime (engine) is inlined, plus only the GLSL of the patterns this recipe uses. With the basic
 * fallback (the default), the runtime also carries the Canvas 2D engine and the CPU versions of those
 * patterns, so a browser without WebGL 2 still animates the piece; without it, that browser shows the
 * poster or the background colour.
 * Everything exported here carries the MIT-0 header: people can use, change and sell it without attribution.
 */
import RUNTIME from 'virtual:mt-runtime';
import { patterns as BASIC_PATTERN_CODE, runtime as RUNTIME_BASIC } from 'virtual:mt-runtime-basic';
import { cloneRecipe, type Recipe } from '../engine/recipe';
import { pickPatterns } from '../engine/glsl/patterns';
import { LICENSE_LINE } from './text';
import { scrimCss, type Scrim } from '../shared/scrim';

export type Placement = 'fixed' | 'block' | 'hero';
export type Fallback = 'basic' | 'poster';

export interface CodeOptions {
  placement: Placement;
  interactive: boolean;
  systemFont: boolean;
  height: number;      // for 'block'
  mediaUrl: string;    // for image / video sources
  /** Image shown instead when the visitor's browser can draw neither with WebGL 2 nor, if included, the basic engine ('' = only the background colour). */
  poster?: string;
  /**
   * Without WebGL 2: 'basic' carries the basic engine (Canvas 2D) and the CPU versions of this piece's
   * patterns, so the piece still moves (the processor draws it, at most 30 fps); 'poster' keeps the code
   * lighter and shows the poster or the background colour. Default 'basic'.
   */
  fallback?: Fallback;
  /**
   * «Zona protegida» (the studio's previews): 'full' and 'gradient' are a layer the runtime adds over the
   * background; 'block' is a CSS class (monotrama-zona) for the blocks of text that go on top.
   */
  scrim?: Scrim | null;
}

export const DEFAULT_CODE: CodeOptions = { placement: 'fixed', interactive: true, systemFont: false, height: 420, mediaUrl: '', poster: '', fallback: 'basic' };

const withBasic = (o: CodeOptions) => (o.fallback ?? 'basic') === 'basic';

/** The CPU patterns the basic engine needs for this recipe (its field falls back to 'nube'). */
export function basicPatternIds(r: Recipe): string[] {
  const on = r.layers.filter(l => l.on).slice(0, 4).map(l => l.pattern);
  const ids = [...new Set(on.length ? on : ['nube'])];
  if (ids.some(id => !BASIC_PATTERN_CODE[id]) && !ids.includes('nube')) ids.push('nube');
  return ids.filter(id => BASIC_PATTERN_CODE[id]);
}

/**
 * The engine this export carries: the WebGL 2 runtime, or the runtime with the basic engine followed by
 * the scripts of the CPU patterns this recipe uses (each registers itself, once per page).
 */
export function runtimeCode(r: Recipe, o: Pick<CodeOptions, 'fallback'>): string {
  if (!withBasic(o as CodeOptions)) return RUNTIME;
  return RUNTIME_BASIC + '\n' + basicPatternIds(r).map(id => BASIC_PATTERN_CODE[id]).join('\n');
}

/** Only the pattern scripts (a React component on a page whose runtime came from another export). */
const basicPatternsCode = (r: Recipe) => basicPatternIds(r).map(id => BASIC_PATTERN_CODE[id]).join('\n');

const safeScript = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1');
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
/** Text that can sit inside an HTML comment (piece names come from shared links). */
const inComment = (s: string) => s.replace(/-{2,}/g, '–').replace(/[<>]/g, '').replace(/[\r\n]+/g, ' ');
/** Text that can sit inside a double-quoted / single-quoted HTML attribute. */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attr1 = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');

export function exportRecipe(r: Recipe, o: CodeOptions): { recipe: Recipe; notes: string[] } {
  const x = cloneRecipe(r);
  const notes: string[] = [];
  x.meta = { name: r.meta.name, seed: r.meta.seed };
  delete x.media.ref; // the local file's name and id stay in the studio (privacy); the code takes a media URL
  if (o.systemFont) {
    if (x.glyph.font !== 'system') notes.push('Tipografía cambiada a la mono del sistema: cero peticiones externas.');
    x.glyph.font = 'system';
  } else if (x.glyph.font !== 'system' && x.glyph.font !== 'courier') {
    notes.push('La tipografía se carga desde Google Fonts. Activa «Sin dependencias externas» si prefieres la mono del sistema.');
  }
  if (x.source === 'camera') { x.source = 'pattern'; notes.push('La cámara no se exporta: el código usa el patrón. Pide permiso de cámara en tu propia web si lo necesitas.'); }
  if ((x.source === 'image' || x.source === 'video') && !o.mediaUrl) notes.push(`Indica la URL de tu ${x.source === 'image' ? 'imagen' : 'video'} (mismo dominio o servida con CORS).`);
  if (x.source === 'text' && x.text.font !== 'sans' && o.systemFont) x.text.font = 'sans';
  return { recipe: x, notes };
}

/** The zone as a runtime option (full, gradient), or null. */
const scrimOption = (o: CodeOptions) =>
  o.scrim && o.scrim.shape !== 'block' ? { color: o.scrim.color, opacity: o.scrim.opacity, blur: o.scrim.blur, shape: o.scrim.shape } : null;
/** The zone as a class for your own blocks of text ('block'), or ''. */
function scrimClass(o: CodeOptions): string {
  if (!o.scrim || o.scrim.shape !== 'block') return '';
  return `.monotrama-zona{${scrimCss(o.scrim)};border-radius:16px;padding:16px 20px}`;
}
const SCRIM_NOTE = 'Zona protegida: si el navegador de quien visita no desenfoca (backdrop-filter), queda sólo el color, que es lo que más ayuda a leer.';

export function patternsFor(r: Recipe) {
  return pickPatterns(r.layers.filter(l => l.on).map(l => l.pattern));
}

const mediaOf = (r: Recipe, o: CodeOptions, root = '') => o.mediaUrl || (r.source === 'image' ? root + 'tu-imagen.jpg' : root + 'tu-video.mp4');

function mountCall(r: Recipe, o: CodeOptions, target: string) {
  const opts: Record<string, unknown> = { patterns: '__P__', interactive: o.interactive, pointer: o.placement === 'fixed' ? 'window' : 'canvas' };
  if ((r.source === 'image' || r.source === 'video')) opts.media = mediaOf(r, o);
  opts.poster = o.poster ?? '';
  // without this piece's CPU patterns, a basic engine brought by another export would draw something else
  if (!withBasic(o)) opts.basic = false;
  const z = scrimOption(o);
  if (z) opts.scrim = z;
  return `Monotrama.mount(${target}, ${json(r)}, ${json(opts).replace('"__P__"', json(patternsFor(r)))});`;
}

function wrapperStyle(r: Recipe, o: CodeOptions) {
  if (o.placement === 'fixed') return `position:fixed;inset:0;z-index:-1;pointer-events:none;background:${r.color.bg}`;
  if (o.placement === 'hero') return `position:relative;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:${r.color.bg}`;
  return `position:relative;height:${o.height}px;overflow:hidden;border-radius:16px;background:${r.color.bg}`;
}

/** Paste-anywhere HTML block. */
export function htmlSnippet(src: Recipe, o: CodeOptions): { code: string; notes: string[] } {
  const { recipe: r, notes } = exportRecipe(src, o);
  const title = r.meta.name ?? r.meta.seed ?? 'pieza';
  const zona = scrimClass(o);
  if (o.scrim) notes.push(SCRIM_NOTE);
  const hero = o.placement === 'hero'
    ? `\n  <div${zona ? ' class="monotrama-zona"' : ''} style="position:relative;z-index:1;text-align:center;color:#fff;padding:24px">\n    <h1>Tu titular</h1>\n  </div>`
    : '';
  const zonaNote = zona ? `\n     Zona protegida: pon class="monotrama-zona" en cada bloque de texto que vaya encima del fondo.` : o.scrim ? `\n     Zona protegida (${o.scrim.shape === 'full' ? 'toda la página' : 'degradado'}): la añade el script, entre el fondo y tu contenido.` : '';
  const code = `<!-- ${LICENSE_LINE}
     Monotrama · ${inComment(title)} · ${new Date().toISOString().slice(0, 10)}
     Fondo ASCII animado, sin librerías. Se pausa fuera de pantalla y respeta «reducir movimiento».
     ${withBasic(o) ? 'Sin WebGL 2 lo dibuja el motor básico (Canvas 2D, más lento); si tampoco puede, muestra el color de fondo o tu póster (URL en "poster").' : 'Sin WebGL 2 muestra el color de fondo, o tu póster si pones su URL en "poster".'}${zonaNote} -->${zona ? `\n<style>${zona}</style>` : ''}
<div class="monotrama" style="${wrapperStyle(r, o)}">
  <canvas style="position:absolute;inset:0;width:100%;height:100%;display:block" aria-hidden="true"></canvas>${hero}
</div>
<script>
/* ${LICENSE_LINE} */
${safeScript(runtimeCode(r, o))}
${mountCall(r, o, 'document.currentScript.previousElementSibling.querySelector("canvas")')}
</script>`;
  return { code, notes };
}

export function htmlPage(src: Recipe, o: CodeOptions): string {
  const { code } = htmlSnippet(src, o);
  const title = src.meta.name ?? src.meta.seed ?? 'Monotrama';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;min-height:100%;background:${src.color.bg};color:#fff;font-family:system-ui,sans-serif}</style>
</head>
<body>
${code}
</body>
</html>
`;
}

/** A standalone file that defines <monotrama-field>. */
export function webComponent(src: Recipe, o: CodeOptions): { file: string; usage: string; notes: string[] } {
  const { recipe: r, notes } = exportRecipe(src, o);
  const file = `/*! ${LICENSE_LINE}
    <monotrama-field recipe='{…}'> · atributos: src (imagen o video), pointer="window", static, paused, poster (imagen si no hay WebGL 2${withBasic(o) ? ' ni motor básico' : ''}),
    scrim="full|gradient" con scrim-color, scrim-opacity (0 a 1) y scrim-blur (px): la zona protegida detrás de tu texto${withBasic(o) ? `
    Sin WebGL 2 dibuja el motor básico (Canvas 2D); el atributo no-basic lo desactiva (entonces se ve el póster o el color de fondo)` : ''} */
${runtimeCode(r, o)}
Monotrama.register(${json(patternsFor(r))});
`;
  const media = r.source === 'image' || r.source === 'video' ? ` src="${attr(mediaOf(r, o))}"` : '';
  const style = o.placement === 'fixed' ? 'position:fixed;inset:0;z-index:-1' : o.placement === 'hero' ? 'min-height:100vh' : `height:${o.height}px`;
  const z = scrimOption(o), zona = scrimClass(o);
  if (o.scrim) notes.push(SCRIM_NOTE);
  const zAttrs = z ? `\n  scrim="${z.shape}" scrim-color="${z.color}" scrim-opacity="${z.opacity}" scrim-blur="${z.blur}"` : '';
  const usage = `<!-- ${LICENSE_LINE} -->
<script src="monotrama-field.js" defer></script>${zona ? `\n<!-- Zona protegida: pon class="monotrama-zona" en cada bloque de texto que vaya encima del fondo. -->\n<style>${zona}</style>` : ''}

<monotrama-field${media}${o.placement === 'fixed' ? ' pointer="window"' : ''}${o.interactive ? '' : ' static'}${withBasic(o) ? '' : ' no-basic'} poster="${attr(o.poster ?? '')}"${zAttrs}
  style="${style};background:${r.color.bg}"
  recipe='${attr1(JSON.stringify(r))}'>
</monotrama-field>`;
  return { file, usage, notes };
}

/** React component (works with Vite, Next.js — it's a client component — and CRA). */
export function reactComponent(src: Recipe, o: CodeOptions, name = 'MonotramaBackground'): { code: string; notes: string[] } {
  const { recipe: r, notes } = exportRecipe(src, o);
  const fixed = o.placement === 'fixed';
  const media = r.source === 'image' || r.source === 'video' ? `media: ${JSON.stringify(mediaOf(r, o, '/'))}, ` : '';
  const z = scrimOption(o);
  const block = o.scrim?.shape === 'block' ? o.scrim : null;
  if (o.scrim) notes.push(SCRIM_NOTE);
  const blockStyle = block ? Object.fromEntries(scrimCss(block).split(';').map(d => {
    const i = d.indexOf(':');
    return [d.slice(0, i).replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()), d.slice(i + 1)];
  })) : null;
  const code = `'use client';
// ${LICENSE_LINE}
// ${name}.jsx — fondo ASCII animado de Monotrama. Sin dependencias.
// Props: className, style, interactive, poster (imagen que se ve si el navegador no tiene WebGL 2${withBasic(o) ? ' ni puede usar el motor básico' : ''}), scrim (zona protegida), children.${withBasic(o) ? `
// Sin WebGL 2 la dibuja el motor básico (Canvas 2D, incluido): más lento, pero se mueve.` : ''}
import { useEffect, useRef } from 'react';

const RECIPE = ${json(r)};
const PATTERNS = ${json(patternsFor(r))};
${block ? `// Zona protegida detrás de tu texto: se aplica al bloque de children; úsala también en tus propios bloques.
export const ZONA_PROTEGIDA = ${json({ ...blockStyle, borderRadius: 16, padding: '16px 20px' })};
` : `// Zona protegida: capa entre el fondo y tu contenido (${z ? (z.shape === 'full' ? 'toda la página' : 'degradado') : 'ninguna'}); null para quitarla.
const SCRIM = ${json(z)};
`}
function runtime() {
  if (typeof window === 'undefined') return null;
  if (!window.Monotrama${withBasic(o) ? ' || !window.Monotrama.__basic' : ''}) {
${withBasic(o) ? RUNTIME_BASIC : RUNTIME}
  }${withBasic(o) ? `
  // the CPU versions of this piece's patterns (each registers itself once per page)
  ${basicPatternsCode(r)}` : ''}
  return window.Monotrama;
}

export default function ${name}({ className, style, interactive = ${o.interactive}, poster = ${JSON.stringify(o.poster ?? '')}, ${block ? '' : 'scrim = SCRIM, '}children }) {
  const box = useRef(null);
  useEffect(() => {
    const M = runtime();
    if (!M || !box.current) return;
    // mount() creates its own canvas and destroy() removes it: a released WebGL context can't be reused,
    // and React (StrictMode) may mount twice
    const ctl = M.mount(box.current, RECIPE, { patterns: PATTERNS, interactive, ${media}poster, ${block ? '' : 'scrim, '}pointer: ${fixed ? "'window'" : "'canvas'"}${withBasic(o) ? '' : ', basic: false'} });
    return () => ctl && ctl.destroy();
  }, [interactive, poster${block ? '' : ', scrim'}]);
  return (
    <div
      className={className}
      style={{ ${fixed ? "position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none'" : o.placement === 'hero' ? "position: 'relative', minHeight: '100vh', overflow: 'hidden'" : `position: 'relative', height: ${o.height}, overflow: 'hidden'`}, background: RECIPE.color.bg, ...style }}
    >
      <div ref={box} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {children && <div style={{ position: 'relative'${block ? ', ...ZONA_PROTEGIDA' : ''} }}>{children}</div>}
    </div>
  );
}
`;
  return { code, notes };
}

/** Bytes of the engine an export carries (WebGL 2 alone, or with the basic engine and this piece's patterns). */
export const runtimeSize = (r?: Recipe, fallback: Fallback = 'poster') => new Blob([r ? runtimeCode(r, { fallback }) : RUNTIME]).size;
