/**
 * Code exporters: a background or component that works when pasted into any website.
 * The runtime (engine) is inlined, plus only the GLSL of the patterns this recipe uses.
 */
import RUNTIME from 'virtual:mt-runtime';
import { cloneRecipe, type Recipe } from '../engine/recipe';
import { pickPatterns } from '../engine/glsl/patterns';

export type Placement = 'fixed' | 'block' | 'hero';

export interface CodeOptions {
  placement: Placement;
  interactive: boolean;
  systemFont: boolean;
  height: number;      // for 'block'
  mediaUrl: string;    // for image / video sources
}

export const DEFAULT_CODE: CodeOptions = { placement: 'fixed', interactive: true, systemFont: false, height: 420, mediaUrl: '' };

const safeRuntime = () => RUNTIME.replace(/<\/(script)/gi, '<\\/$1');
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function exportRecipe(r: Recipe, o: CodeOptions): { recipe: Recipe; notes: string[] } {
  const x = cloneRecipe(r);
  const notes: string[] = [];
  x.meta = { name: r.meta.name, seed: r.meta.seed };
  delete x.media.ref; // the local file's name and id stay in the studio (privacy); the code takes a media URL
  if (o.systemFont) {
    if (x.glyph.font !== 'system') notes.push('Tipografía cambiada a la mono del sistema: cero peticiones externas.');
    x.glyph.font = 'system';
  } else if (x.glyph.font !== 'system' && x.glyph.font !== 'courier') {
    notes.push('La tipografía se carga desde Google Fonts. Actívala «sin dependencias» si prefieres la mono del sistema.');
  }
  if (x.source === 'camera') { x.source = 'pattern'; notes.push('La cámara no se exporta: el código usa el patrón. Pide permiso de cámara en tu propia web si lo necesitas.'); }
  if ((x.source === 'image' || x.source === 'video') && !o.mediaUrl) notes.push(`Indica la URL de tu ${x.source === 'image' ? 'imagen' : 'video'} (mismo dominio o servida con CORS).`);
  if (x.source === 'text' && x.text.font !== 'sans' && o.systemFont) x.text.font = 'sans';
  return { recipe: x, notes };
}

export function patternsFor(r: Recipe) {
  return pickPatterns(r.layers.filter(l => l.on).map(l => l.pattern));
}

function mountCall(r: Recipe, o: CodeOptions, target: string) {
  const opts: Record<string, unknown> = { patterns: '__P__', interactive: o.interactive, pointer: o.placement === 'fixed' ? 'window' : 'canvas' };
  if ((r.source === 'image' || r.source === 'video')) opts.media = o.mediaUrl || (r.source === 'image' ? 'tu-imagen.jpg' : 'tu-video.mp4');
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
  const hero = o.placement === 'hero'
    ? `\n  <div style="position:relative;z-index:1;text-align:center;color:#fff;padding:24px">\n    <h1>Tu titular</h1>\n  </div>`
    : '';
  const code = `<!-- Monotrama · ${title} · ${new Date().toISOString().slice(0, 10)}
     Fondo ASCII animado. Sin librerías. Respeta «reducir movimiento» y se pausa fuera de pantalla. -->
<div class="monotrama" style="${wrapperStyle(r, o)}">
  <canvas style="position:absolute;inset:0;width:100%;height:100%;display:block" aria-hidden="true"></canvas>${hero}
</div>
<script>
${safeRuntime()}
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
<title>${title.replace(/</g, '')}</title>
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
  const file = `/*! Monotrama <monotrama-field> · https://github.com/M1gu3hb/ASCII-Shader-Lab */
${RUNTIME}
Monotrama.register(${json(patternsFor(r))});
`;
  const attrJson = JSON.stringify(r).replace(/'/g, '&#39;');
  const media = r.source === 'image' || r.source === 'video' ? ` src="${o.mediaUrl || (r.source === 'image' ? 'tu-imagen.jpg' : 'tu-video.mp4')}"` : '';
  const style = o.placement === 'fixed' ? 'position:fixed;inset:0;z-index:-1' : o.placement === 'hero' ? 'min-height:100vh' : `height:${o.height}px`;
  const usage = `<script src="monotrama-field.js" defer></script>

<monotrama-field${media}${o.placement === 'fixed' ? ' pointer="window"' : ''}${o.interactive ? '' : ' static'}
  style="${style};background:${r.color.bg}"
  recipe='${attrJson}'>
</monotrama-field>`;
  return { file, usage, notes };
}

/** React component (works with Vite, Next.js — it's a client component — and CRA). */
export function reactComponent(src: Recipe, o: CodeOptions, name = 'MonotramaBackground'): { code: string; notes: string[] } {
  const { recipe: r, notes } = exportRecipe(src, o);
  const fixed = o.placement === 'fixed';
  const media = r.source === 'image' || r.source === 'video' ? `media: ${JSON.stringify(o.mediaUrl || (r.source === 'image' ? '/tu-imagen.jpg' : '/tu-video.mp4'))}, ` : '';
  const code = `'use client';
// ${name}.jsx — generado con Monotrama (ASCII Shader Lab). Sin dependencias.
import { useEffect, useRef } from 'react';

const RECIPE = ${json(r)};
const PATTERNS = ${json(patternsFor(r))};

function runtime() {
  if (typeof window === 'undefined') return null;
  if (!window.Monotrama) {
${RUNTIME}
  }
  return window.Monotrama;
}

export default function ${name}({ className, style, interactive = ${o.interactive}, children }) {
  const canvas = useRef(null);
  useEffect(() => {
    const M = runtime();
    if (!M || !canvas.current) return;
    const ctl = M.mount(canvas.current, RECIPE, { patterns: PATTERNS, interactive, ${media}pointer: ${fixed ? "'window'" : "'canvas'"} });
    return () => ctl && ctl.destroy();
  }, [interactive]);
  return (
    <div
      className={className}
      style={{ ${fixed ? "position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none'" : o.placement === 'hero' ? "position: 'relative', minHeight: '100vh', overflow: 'hidden'" : `position: 'relative', height: ${o.height}, overflow: 'hidden'`}, background: RECIPE.color.bg, ...style }}
    >
      <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {children && <div style={{ position: 'relative' }}>{children}</div>}
    </div>
  );
}
`;
  return { code, notes };
}

export const runtimeSize = () => new Blob([RUNTIME]).size;
