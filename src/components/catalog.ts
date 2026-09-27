/**
 * Component catalogue: live demos + code generators. The exported code is the very same
 * JavaScript that runs in the studio (imported raw), so what you tweak is what you ship.
 */
import scrambleSrc from './lib/scramble.js?raw';
import typewriterSrc from './lib/typewriter.js?raw';
import magnetSrc from './lib/magnet.js?raw';
import trailSrc from './lib/trail.js?raw';
import haloSrc from './lib/halo.js?raw';
import spinnersSrc from './lib/spinners.js?raw';
import bannerSrc from './lib/banner.js?raw';
import { scramble } from './lib/scramble.js';
import { typewriter } from './lib/typewriter.js';
import { magnet } from './lib/magnet.js';
import { trail } from './lib/trail.js';
import { halo } from './lib/halo.js';
import { spinner, progressText, SPINNERS, BAR_STYLES } from './lib/spinners.js';
import { renderBanner } from './lib/banner.js';

export type ParamType = 'text' | 'area' | 'range' | 'select' | 'color' | 'toggle';
export interface Param { key: string; label: string; type: ParamType; min?: number; max?: number; step?: number; opts?: Array<[string, string]> }
export type Values = Record<string, string | number | boolean>;
export interface Controller { destroy(): void }
export interface CodeTab { id: string; label: string; code: string; file?: string; lang: string }

export interface CompDef {
  id: string;
  name: string;
  blurb: string;
  tags: string[];
  params: Param[];
  defaults: Values;
  mount(stage: HTMLElement, v: Values, big: boolean): Controller;
  code(v: Values): CodeTab[];
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const js = (v: unknown) => JSON.stringify(v, null, 2);
/** Single-quoted shell word. */
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** MIT-0 header of every exported file that contains code. */
const LICENSE = 'Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function el(tag: string, style: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = style;
  e.textContent = text;
  return e;
}

/** Standard trio of exports for DOM components. */
function standardCode(fn: string, file: string, src: string, markup: string, selector: string, opts: Record<string, unknown>, reactTag: string, reactProps = ''): CodeTab[] {
  const call = `${fn}(document.querySelector(${JSON.stringify(selector)}), ${js(opts)});`;
  const html = `${markup}

<script type="module">
${src.trim()}

${call}
</script>`;
  const usage = `import { ${fn} } from './${file}';\n\n${call}`;
  const Comp = fn[0].toUpperCase() + fn.slice(1);
  const react = `// ${LICENSE}
import { useEffect, useRef } from 'react';
import { ${fn} } from './${file}';

const OPTIONS = ${js(opts)};

export default function ${Comp}(${reactProps ? `{ ${reactProps} }` : 'props'}) {
  const ref = useRef(null);
  useEffect(() => {
    const ctl = ${fn}(ref.current, OPTIONS);
    return () => ctl.destroy();
  }, []);
  return ${reactTag};
}
`;
  return [
    { id: 'html', label: 'HTML para pegar', code: html, lang: 'html', file: `${fn}.html` },
    { id: 'module', label: 'Módulo ES', code: `// ${file}\n${src.trim()}\n\n/* Uso:\n${usage}\n*/\n`, lang: 'js', file },
    { id: 'react', label: 'React', code: react, lang: 'jsx', file: `${Comp}.jsx` },
  ];
}

const TYPE = (big: boolean) => `font:600 ${big ? 'clamp(22px,4vw,44px)' : '19px'}/1.15 ${MONO};letter-spacing:-.02em;color:#ede6da;text-align:center;padding:0 16px`;

export const COMPONENTS: CompDef[] = [
  {
    id: 'scramble', name: 'Descifrar', tags: ['texto', 'web'],
    blurb: 'El texto aparece desde caracteres aleatorios. Al cargar, al entrar en pantalla, al pasar el cursor o en bucle.',
    params: [
      { key: 'text', label: 'Texto', type: 'text' },
      { key: 'chars', label: 'Caracteres del ruido', type: 'text' },
      { key: 'duration', label: 'Duración (ms)', type: 'range', min: 300, max: 4000, step: 50 },
      { key: 'stagger', label: 'Orden', type: 'select', opts: [['left', 'De izquierda a derecha'], ['right', 'De derecha a izquierda'], ['center', 'Desde el centro'], ['random', 'Al azar']] },
      { key: 'trigger', label: 'Cuándo', type: 'select', opts: [['loop', 'En bucle'], ['view', 'Al entrar en pantalla'], ['hover', 'Al pasar el cursor'], ['load', 'Al cargar']] },
      { key: 'noiseColor', label: 'Color del ruido', type: 'color' },
    ],
    defaults: { text: 'Teje luz con caracteres', chars: '!<>-_\\/[]{}=+*^?#01', duration: 1400, stagger: 'left', trigger: 'loop', noiseColor: '#ff5b1f' },
    mount(stage, v, big) {
      const h = el('div', TYPE(big), String(v.text));
      stage.appendChild(h);
      return scramble(h, { chars: v.chars, duration: v.duration, stagger: v.stagger, trigger: v.trigger, noiseColor: v.noiseColor, loopDelay: 1800 });
    },
    code: v => standardCode('scramble', 'scramble.js', scrambleSrc,
      `<h1 class="descifrar" style="font-family:${MONO}">${esc(String(v.text))}</h1>`, '.descifrar',
      { chars: v.chars, duration: v.duration, stagger: v.stagger, trigger: v.trigger, noiseColor: v.noiseColor },
      `<h1 ref={ref} style={{ fontFamily: '${MONO}' }}>{children}</h1>`, 'children'),
  },
  {
    id: 'typewriter', name: 'Máquina de escribir', tags: ['texto', 'web', 'terminal'],
    blurb: 'Escribe frases, las sostiene y las borra. El borrado «marchita» cada letra por una rampa de densidad.',
    params: [
      { key: 'phrases', label: 'Frases (una por línea)', type: 'area' },
      { key: 'typeSpeed', label: 'Ms por letra', type: 'range', min: 15, max: 200, step: 1 },
      { key: 'deleteSpeed', label: 'Ms al borrar', type: 'range', min: 10, max: 150, step: 1 },
      { key: 'hold', label: 'Pausa (ms)', type: 'range', min: 200, max: 5000, step: 50 },
      { key: 'cursor', label: 'Cursor', type: 'select', opts: [['block', 'Bloque █'], ['bar', 'Barra ▏'], ['underscore', 'Guion bajo _'], ['none', 'Sin cursor']] },
      { key: 'erase', label: 'Borrado', type: 'select', opts: [['decay', 'Marchitar'], ['backspace', 'Retroceso']] },
      { key: 'ramp', label: 'Rampa del marchitado', type: 'text' },
    ],
    defaults: { phrases: 'Teje luz con caracteres.\nEscribe. Borra. Repite.\nHola, terminal.', typeSpeed: 55, deleteSpeed: 30, hold: 1500, cursor: 'block', erase: 'decay', ramp: '@#*+=-:. ' },
    mount(stage, v, big) {
      const h = el('div', TYPE(big).replace('text-align:center', 'text-align:left') + ';min-height:1.3em');
      stage.appendChild(h);
      return typewriter(h, { ...v, phrases: String(v.phrases).split('\n').filter(Boolean) });
    },
    code: v => standardCode('typewriter', 'typewriter.js', typewriterSrc,
      `<p class="maquina" style="font-family:${MONO}"></p>`, '.maquina',
      { phrases: String(v.phrases).split('\n').filter(Boolean), typeSpeed: v.typeSpeed, deleteSpeed: v.deleteSpeed, hold: v.hold, cursor: v.cursor, erase: v.erase, ramp: v.ramp },
      `<p ref={ref} style={{ fontFamily: '${MONO}' }} />`),
  },
  {
    id: 'magnet', name: 'Imán', tags: ['texto', 'cursor', 'web'],
    blurb: 'Las letras se fragmentan en caracteres y huyen del cursor; al alejarte, se recomponen.',
    params: [
      { key: 'text', label: 'Texto', type: 'text' },
      { key: 'radius', label: 'Alcance (px)', type: 'range', min: 30, max: 240, step: 1 },
      { key: 'force', label: 'Fuerza (px)', type: 'range', min: 4, max: 80, step: 1 },
      { key: 'chars', label: 'Fragmentos', type: 'text' },
      { key: 'swap', label: 'Cambio de glifo', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'accent', label: 'Color de los fragmentos', type: 'color' },
    ],
    defaults: { text: 'ACÉRCATE', radius: 110, force: 28, chars: '#%&*+=-:.', swap: 0.7, accent: '#ff5b1f' },
    mount(stage, v, big) {
      const h = el('div', TYPE(big).replace('clamp(22px,4vw,44px)', 'clamp(30px,6vw,64px)').replace('19px', '30px') + ';white-space:nowrap', String(v.text));
      stage.appendChild(h);
      return magnet(h, v);
    },
    code: v => standardCode('magnet', 'magnet.js', magnetSrc,
      `<div class="iman-zona" style="padding:40px"><h2 class="iman" style="font-family:${MONO}">${esc(String(v.text))}</h2></div>`, '.iman',
      { radius: v.radius, force: v.force, chars: v.chars, swap: v.swap, accent: v.accent },
      `<h2 ref={ref} style={{ fontFamily: '${MONO}' }}>{children}</h2>`, 'children'),
  },
  {
    id: 'trail', name: 'Estela', tags: ['cursor', 'web'],
    blurb: 'El cursor (o el dedo) deja caracteres que se desvanecen de @ a punto. Una sola capa ligera sobre la página.',
    params: [
      { key: 'ramp', label: 'Rampa', type: 'text' },
      { key: 'size', label: 'Tamaño (px)', type: 'range', min: 8, max: 48, step: 1 },
      { key: 'life', label: 'Vida (ms)', type: 'range', min: 200, max: 3000, step: 50 },
      { key: 'spacing', label: 'Separación (px)', type: 'range', min: 4, max: 60, step: 1 },
      { key: 'spread', label: 'Dispersión (px)', type: 'range', min: 0, max: 60, step: 1 },
      { key: 'gravity', label: 'Gravedad', type: 'range', min: -0.1, max: 0.1, step: 0.005 },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    defaults: { ramp: '@#%*+=-:. ', size: 16, life: 900, spacing: 14, spread: 10, gravity: 0.02, color: '#ff5b1f' },
    mount(stage, v) {
      stage.appendChild(el('div', 'font:500 13px ' + MONO + ';color:#8c857a;pointer-events:none;text-align:center', 'mueve el cursor o el dedo aquí'));
      return trail(stage, v);
    },
    code: v => standardCode('trail', 'trail.js', trailSrc, `<!-- La estela cubre toda la página -->`, 'body', v, `<div ref={ref} style={{ position: 'relative', minHeight: 300 }} />`),
  },
  {
    id: 'halo', name: 'Halo', tags: ['interfaz', 'cursor', 'web'],
    blurb: 'Botones y tarjetas cuyo fondo se enciende con caracteres alrededor del cursor. Canvas 2D ligero.',
    params: [
      { key: 'label', label: 'Texto del botón', type: 'text' },
      { key: 'ramp', label: 'Rampa', type: 'text' },
      { key: 'cell', label: 'Celda (px)', type: 'range', min: 5, max: 20, step: 1 },
      { key: 'radius', label: 'Radio (px)', type: 'range', min: 20, max: 200, step: 1 },
      { key: 'idle', label: 'Brillo en reposo', type: 'range', min: 0, max: 0.5, step: 0.01 },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    defaults: { label: 'Abrir el estudio →', ramp: ' .:-=+*#%@', cell: 9, radius: 80, idle: 0.14, color: '#ff5b1f' },
    mount(stage, v) {
      const b = el('button', 'font:600 16px/1 ' + MONO + ';color:#ede6da;background:#141311;border:1px solid rgba(237,230,218,.2);border-radius:14px;padding:26px 40px;cursor:pointer', String(v.label));
      b.setAttribute('type', 'button');
      stage.appendChild(b);
      return halo(b, { ramp: v.ramp, cell: v.cell, radius: v.radius, idle: v.idle, color: v.color });
    },
    code: v => standardCode('halo', 'halo.js', haloSrc,
      `<button class="halo" style="font:600 16px ${MONO};color:#ede6da;background:#141311;border:1px solid #333;border-radius:14px;padding:22px 36px">${esc(String(v.label))}</button>`, '.halo',
      { ramp: v.ramp, cell: v.cell, radius: v.radius, idle: v.idle, color: v.color },
      `<button ref={ref} {...props} />`),
  },
  {
    id: 'spinners', name: 'Indicadores', tags: ['interfaz', 'terminal'],
    blurb: 'Diez indicadores de carga en caracteres, para la web y para tu CLI (Node, Python o Bash).',
    params: [
      { key: 'name', label: 'Estilo', type: 'select', opts: Object.keys(SPINNERS).map(k => [k, k]) },
      { key: 'label', label: 'Texto', type: 'text' },
    ],
    defaults: { name: 'braille', label: 'Tejiendo' },
    mount(stage, v, big) {
      const wrap = el('div', `display:grid;grid-template-columns:repeat(auto-fill,minmax(${big ? 120 : 92}px,1fr));gap:${big ? 14 : 6}px;width:100%;max-width:640px;padding:12px;font:500 ${big ? 15 : 12}px ${MONO};color:#ede6da`);
      const ctls: Controller[] = [];
      for (const k of Object.keys(SPINNERS)) {
        const cell = el('div', `display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;border:1px solid ${k === v.name ? '#ff5b1f' : 'rgba(237,230,218,.1)'}`);
        const s = el('span', 'color:#ff5b1f;min-width:3ch');
        cell.append(s, el('span', 'color:#8c857a;font-size:12px', k));
        wrap.appendChild(cell);
        ctls.push(spinner(s, k));
      }
      stage.appendChild(wrap);
      return { destroy: () => ctls.forEach(c => c.destroy()) };
    },
    code: v => {
      const s = SPINNERS[String(v.name) as keyof typeof SPINNERS];
      const tabs = standardCode('spinner', 'spinners.js', spinnersSrc,
        `<span class="cargando" aria-label="${esc(String(v.label))}"></span> ${esc(String(v.label))}…`, '.cargando', v.name as never, `<span ref={ref} aria-label="Cargando" />`);
      const frames = JSON.stringify(s.frames);
      const label = String(v.label) + '…';
      tabs.push({
        id: 'node', label: 'Node CLI', lang: 'js', file: 'spinner.mjs', code: `// ${LICENSE}
// Indicador para tu CLI de Node. Ejecuta: node spinner.mjs
const frames = ${frames};
const label = ${JSON.stringify(label)};
const out = process.stdout, tty = out.isTTY; // redirigido a un archivo sólo escribe el resultado
let i = 0;
if (tty) out.write('\\x1b[?25l');
const id = setInterval(() => { if (tty) out.write('\\r' + frames[i = (i + 1) % frames.length] + ' ' + label); }, ${s.interval});
const stop = msg => { clearInterval(id); out.write((tty ? '\\r\\x1b[2K' : '') + msg + '\\n' + (tty ? '\\x1b[?25h' : '')); };
process.on('SIGINT', () => { stop('✖ Cancelado'); process.exit(130); });
// ...tu trabajo...
setTimeout(() => stop('✔ Listo'), 3000);
`,
      });
      tabs.push({
        id: 'python', label: 'Python', lang: 'py', file: 'spinner.py', code: `# ${LICENSE}
# Indicador para tus scripts de Python (sólo biblioteca estándar)
import itertools, sys, time
frames = ${frames}
label = ${JSON.stringify(label)}
tty = sys.stdout.isatty()  # redirigido a un archivo sólo escribe el resultado
clear = "\\r\\x1b[2K" if tty else ""
try:
    for f in itertools.islice(itertools.cycle(frames), 40):  # ...tu trabajo...
        if tty:
            sys.stdout.write("\\r" + f + " " + label)
            sys.stdout.flush()
        time.sleep(${s.interval / 1000})
    sys.stdout.write(clear + "✔ Listo\\n")
except KeyboardInterrupt:
    sys.stdout.write(clear + "✖ Cancelado\\n")
`,
      });
      tabs.push({
        id: 'bash', label: 'Bash', lang: 'bash', file: 'spinner.sh', code: `#!/usr/bin/env bash
# ${LICENSE}
# Indicador para scripts de shell: spin <pid>
spin() {
  local frames=(${s.frames.map(f => sq(f)).join(' ')})
  local i=0
  if [ -t 1 ]; then printf '\\033[?25l'; trap 'printf "\\r\\033[2K\\033[?25h"; exit 130' INT TERM; fi
  while kill -0 "$1" 2>/dev/null; do
    if [ -t 1 ]; then printf '\\r%s %s' "\${frames[i++ % \${#frames[@]}]}" ${sq(label)}; fi
    sleep ${(s.interval / 1000).toFixed(2)}
  done
  if [ -t 1 ]; then printf '\\r\\033[2K'; fi
  printf '✔ Listo\\n'
  if [ -t 1 ]; then printf '\\033[?25h'; trap - INT TERM; fi
}
sleep 3 & spin $!
`,
      });
      return tabs;
    },
  },
  {
    id: 'progress', name: 'Barra de progreso', tags: ['interfaz', 'terminal'],
    blurb: 'Barras de progreso de texto con precisión de subcarácter. La misma función sirve en la web y en la consola.',
    params: [
      { key: 'style', label: 'Estilo', type: 'select', opts: Object.keys(BAR_STYLES).map(k => [k, k]) },
      { key: 'width', label: 'Ancho (caracteres)', type: 'range', min: 8, max: 60, step: 1 },
    ],
    defaults: { style: 'bloques', width: 28 },
    mount(stage, v, big) {
      const pre = el('pre', `margin:0;font:500 ${big ? 16 : 10}px/1.6 ${MONO};color:#ede6da`);
      stage.appendChild(pre);
      let t = 0, id = 0;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const draw = () => {
        const val = reduced ? 0.62 : (Math.sin(t) * 0.5 + 0.5);
        pre.textContent = Object.keys(BAR_STYLES).map(k => (k === v.style ? '› ' : '  ') + progressText(val, Number(v.width), k)).join('\n');
        t += 0.02;
      };
      draw();
      if (!reduced) id = window.setInterval(draw, 40);
      return { destroy: () => clearInterval(id) };
    },
    code: v => {
      const tabs = standardCode('progress', 'spinners.js', spinnersSrc, `<pre class="progreso"></pre>`, '.progreso', { value: 0.42, width: v.width, style: v.style }, `<pre ref={ref} />`);
      tabs.push({
        id: 'node', label: 'Node CLI', lang: 'js', file: 'progress.mjs', code: `// ${LICENSE}
${spinnersSrc.slice(spinnersSrc.indexOf('export const BAR_STYLES')).split('export function progress(')[0].replace(/export /g, '')}
// Ejemplo (redirigido a un archivo sólo escribe la barra final)
const tty = process.stdout.isTTY;
let v = 0;
const id = setInterval(() => {
  v = Math.min(1, v + 0.03);
  if (tty) process.stdout.write('\\r' + progressText(v, ${v.width}, ${JSON.stringify(v.style)}));
  if (v >= 1) { clearInterval(id); process.stdout.write((tty ? '' : progressText(v, ${v.width}, ${JSON.stringify(v.style)})) + '\\n'); }
}, 60);
`,
      });
      return tabs;
    },
  },
  {
    id: 'banner', name: 'Rótulo', tags: ['texto', 'terminal'],
    blurb: 'Letras gigantes hechas de caracteres para README, terminal, comentarios de código o la web.',
    params: [
      { key: 'text', label: 'Texto', type: 'area' },
      { key: 'style', label: 'Estilo', type: 'select', opts: [['bloques', 'Bloques █'], ['medios', 'Medios bloques ▀▄'], ['sombra', 'Sombra ░▒▓█'], ['almohadilla', 'Almohadilla #'], ['densidad', 'Densidad .:-=+*#'], ['braille', 'Braille ⣿']] },
      { key: 'width', label: 'Columnas', type: 'range', min: 16, max: 140, step: 1 },
      { key: 'font', label: 'Tipografía', type: 'select', opts: [['"Helvetica Neue", Arial, sans-serif', 'Grotesca'], ['"Martian Mono", monospace', 'Martian Mono'], ['"Instrument Serif", serif', 'Instrument Serif'], ['"Press Start 2P", monospace', 'Píxel'], ['"VT323", monospace', 'VT323']] },
    ],
    defaults: { text: 'HOLA', style: 'medios', width: 56, font: '"Helvetica Neue", Arial, sans-serif' },
    mount(stage, v, big) {
      const pre = el('pre', `margin:0;font:500 ${big ? 'clamp(6px,1.25vw,12px)' : '4px'}/1.05 ${MONO};color:#ede6da;max-width:100%;overflow:hidden;padding:10px`);
      stage.appendChild(pre);
      const render = () => { pre.textContent = renderBanner(String(v.text), { style: v.style as string, width: Number(v.width), font: String(v.font) }); };
      render();
      void document.fonts?.ready.then(render);
      return { destroy() {} };
    },
    code: v => {
      const txt = renderBanner(String(v.text), { style: v.style as string, width: Number(v.width), font: String(v.font) });
      return [
        { id: 'text', label: 'Texto', code: txt + '\n', lang: 'txt', file: 'rotulo.txt' },
        { id: 'md', label: 'README', code: '```\n' + txt + '\n```\n', lang: 'md', file: 'rotulo.md' },
        { id: 'bash', label: 'Saludo de shell', code: `# ${LICENSE}\n# Pega al final de ~/.bashrc o ~/.zshrc. Sólo se muestra en sesiones interactivas (no rompe scp ni rsync).\ncase $- in *i*)\ncat <<'MONOTRAMA'\n${txt}\nMONOTRAMA\n;; esac\n`, lang: 'bash', file: 'saludo.sh' },
        { id: 'js', label: 'Para tu CLI (JS)', code: `// ${LICENSE}\nconsole.log(${JSON.stringify(txt)});\n`, lang: 'js', file: 'rotulo.js' },
        { id: 'module', label: 'Módulo ES', code: `// banner.js — genera rótulos en el navegador\n${bannerSrc.trim()}\n`, lang: 'js', file: 'banner.js' },
      ];
    },
  },
];

export const compById = (id: string | null) => COMPONENTS.find(c => c.id === id) ?? null;
