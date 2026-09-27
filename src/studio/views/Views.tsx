import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { create } from 'zustand';
import { gridToText } from '../../exporters/text';
import { copyText } from '../download';
import { captureGrid } from '../exporting';
import { openExport } from '../exportTab';
import { IDownload, IMore } from '../icons';
import { setUI, useRecipe, useStudio } from '../store';
import { useGuide } from '../guide/state';
import { VERDICT, inkFor, useLegibility, useLegibilityMeter } from './legibility';
import { setView, setViewOpts } from './state';
import {
  EXPORT_HINT, GITHUB_CELL, SAFE_BOTTOM, SAFE_TOP, TERM_SIZES, VIEWS, cardMedia, exportFor, markdownBlock, nonAscii, readmeGrid, readmeImage,
  terminalWindow, verticalFrame, viewInfo, type ViewId,
} from './views';
import '../css/views.css';

/**
 * Destination previews. The stage canvas is never scaled: each view sizes the element that holds it
 * to the destination's CSS size (a 360×225 card, a 9:16 frame, a README image, cols×rows cells), and
 * the renderer follows it, keeping the cell size in CSS px, exactly as exported code and fixed-size
 * exports do. The canvas container (`host`) is created once and moved into the slot of the view shown.
 */

export interface Insets { top: number; bottom: number }

/* ------------------------------------------------------------------ */
/* Slot and sizes                                                       */
/* ------------------------------------------------------------------ */

/** Where the live canvas goes in a view. React never renders children here: the host is moved in. */
function Slot({ host, className, style }: { host: HTMLElement; className: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && host.parentNode !== el) el.appendChild(host);
  }, [host]);
  return <div ref={ref} className={'vw-slot ' + className} style={style} />;
}

/** Inner size of an element, measured before paint and whenever it changes. */
function useSize(ref: RefObject<HTMLElement | null>, inner = false) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      let w = el.clientWidth, h = el.clientHeight;
      if (inner) {
        const cs = getComputedStyle(el);
        w -= parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        h -= parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      }
      setSize(s => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, inner]);
  return size;
}

/**
 * Room the views can use inside the stage: below the bar at its top (view selector, engine notes)
 * and above the dice deck and seed line, or above the settings sheet on phones. Layout offsets are
 * used (not bounding boxes) so the panel's slide transition does not count. Toasts go just under the
 * stage's top bar, so they never cover it, the deck or the basic-mode chip.
 */
export function useStageInsets(stage: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>): Insets {
  const [ins, setIns] = useState<Insets>({ top: 64, bottom: 120 });
  const panel = useStudio(s => s.ui.panel);
  const hide = useStudio(s => s.ui.hideUI);
  const guiding = useGuide(s => s.path !== null);
  const cursor = useStudio(s => s.cursor);
  useLayoutEffect(() => {
    const st = stage.current;
    const app = st?.closest<HTMLElement>('.app');
    if (!st || !app) return;
    const measure = () => {
      const bar = top.current;
      const t = hide || !bar ? 12 : bar.offsetTop + bar.offsetHeight + 10;
      let b = 12;
      if (!hide) {
        const sheet = app.querySelector<HTMLElement>('.panel');
        const phone = innerWidth <= 900;
        if (phone && sheet && !app.classList.contains('panel-off')) b = app.clientHeight - sheet.offsetTop + 8;
        else {
          const tops = [...app.querySelectorAll<HTMLElement>('.deck, .seedline')].map(el => el.offsetTop);
          if (tops.length) b = app.clientHeight - Math.min(...tops) + 10;
        }
      }
      setIns(p => (p.top === t && p.bottom === b ? p : { top: t, bottom: b }));
      document.documentElement.style.setProperty('--toast-top', Math.round(st.getBoundingClientRect().top + t) + 'px');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(st);
    if (top.current) ro.observe(top.current);
    for (const el of app.querySelectorAll('.deck, .seedline, .panel')) ro.observe(el);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [stage, top, panel, hide, guiding, cursor]);
  useEffect(() => () => { document.documentElement.style.removeProperty('--toast-top'); }, []);
  return ins;
}

const areaStyle = (ins: Insets): CSSProperties => ({ top: ins.top, bottom: ins.bottom });

/* ------------------------------------------------------------------ */
/* The stage in each view                                               */
/* ------------------------------------------------------------------ */

export function ViewStage({ view, host, ins }: { view: ViewId; host: HTMLElement; ins: Insets }) {
  switch (view) {
    case 'web': return <WebView host={host} ins={ins} />;
    case 'tarjeta': return <CardView host={host} ins={ins} />;
    case 'vertical': return <VerticalView host={host} ins={ins} />;
    case 'readme': return <ReadmeView host={host} ins={ins} />;
    case 'terminal': return <TerminalView host={host} ins={ins} />;
    default: return <Slot host={host} className="vw-fill" />;
  }
}

/* Fondo web ------------------------------------------------------------ */

function WebView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const recipe = useRecipe();
  const mode = useStudio(s => s.ui.viewOpts.ink);
  const ink = inkFor(mode, recipe?.color.bg ?? '#000000');
  const h1 = useRef<HTMLHeadingElement>(null);
  useLegibilityMeter(true, recipe, ink, h1);
  const style = { '--pc': ink, '--pcb': ink === '#ffffff' ? '#111111' : '#ffffff' } as CSSProperties;
  return (
    <div className="vw-area" style={areaStyle(ins)}>
      <div className="vw-browser">
        <div className="vw-chrome" aria-hidden="true"><i /><i /><i /><span className="vw-url">tu-sitio.com</span></div>
        <div className="vw-viewport">
          <Slot host={host} className="vw-fill" />
          {/* test content over the background: what a visitor reads on top of it */}
          <div className="preview-content" style={style} aria-hidden="true">
            <div className="pc-nav"><b>Tu marca</b><span>Proyectos · Estudio · Contacto</span></div>
            <div className="pc-hero">
              <h1 ref={h1}>Un titular que se lee sin esfuerzo</h1>
              <p>Así se verá tu fondo detrás de contenido real. Si cuesta leer, baja el contraste o sube el tamaño de celda.</p>
              <div className="pc-btns"><span className="pc-btn">Botón principal</span><span className="pc-btn ghost">Saber más</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Tarjeta ---------------------------------------------------------------- */

function CardView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref, true);
  const page = useStudio(s => s.ui.viewOpts.page);
  const m = cardMedia(size.w || 800);
  const media = { width: m.w, height: m.h };
  return (
    <div ref={ref} className={'vw-area vw-scroll vw-site vw-' + page} style={{ ...areaStyle(ins), '--card-w': m.w + 'px' } as CSSProperties}
      tabIndex={0} role="region" aria-label="Página de ejemplo con tres tarjetas">
      <div className="vw-site-nav" aria-hidden="true"><b>Tu marca</b><span>Trabajo · Notas · Contacto</span></div>
      <p className="vw-site-h" aria-hidden="true">Proyectos recientes</p>
      <div className="vw-cards">
        <div className="vw-card">
          <Slot host={host} className="vw-card-media" style={media} />
          <div className="vw-card-body" aria-hidden="true">
            <h3>Tu pieza, en pequeño</h3>
            <p>Un texto breve bajo la imagen: así se ve a {m.w}×{m.h} px, entre otras tarjetas.</p>
            <span className="vw-card-btn">Ver proyecto</span>
          </div>
        </div>
        {[1, 2].map(i => (
          <div key={i} className="vw-card" aria-hidden="true">
            <div className="vw-card-media vw-ph" style={media} />
            <div className="vw-card-body">
              <h3>{i === 1 ? 'Otra tarjeta' : 'Y una más'}</h3>
              <p>Contenido de relleno para comparar tamaños y pesos visuales.</p>
              <span className="vw-card-btn">Ver proyecto</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Vertical 9:16 ---------------------------------------------------------- */

function VerticalView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const caption = useStudio(s => s.ui.viewOpts.caption);
  const f = verticalFrame(size.w, size.h);
  // on a very short stage the frame keeps its CSS size (what the export composes) and is shown smaller
  const k = size.h && f.h > size.h ? size.h / f.h : 1;
  return (
    <div ref={ref} className="vw-area vw-center" style={areaStyle(ins)}>
      <div className="vw-phone" style={{ width: f.w, height: f.h, transform: k < 1 ? `scale(${k})` : undefined }} data-frame={`${f.w}x${f.h}`}>
        <Slot host={host} className="vw-fill" />
        <div className="vw-safe vw-safe-top" style={{ height: SAFE_TOP * 100 + '%' }} aria-hidden="true"><span>interfaz de la app</span></div>
        <div className="vw-safe vw-safe-bottom" style={{ height: SAFE_BOTTOM * 100 + '%' }} aria-hidden="true">
          {caption && (
            <span className="vw-cap">
              <b>@tu_cuenta</b>
              <span>Tejido con caracteres, fotograma a fotograma ✦</span>
            </span>
          )}
          <span>interfaz de la app</span>
        </div>
      </div>
    </div>
  );
}

/* README ------------------------------------------------------------------ */

/** The README text version, shared by the page mock (which renders it) and the bar (which copies it). */
export const useReadme = create<{ text: string; cols: number; rows: number; gifW: number }>(() => ({ text: '', cols: 80, rows: 0, gifW: 640 }));

/** Captures the text version (80 columns) when the piece changes, at most every 700 ms. */
function useReadmeText(img: { w: number; h: number }) {
  const recipe = useRecipe();
  const last = useRef(0);
  useEffect(() => {
    if (!recipe || !img.w) return;
    let alive = true;
    const { cols, rows } = readmeGrid(img.w, img.h, recipe.glyph.cell, recipe.glyph.aspect);
    const wait = Math.max(120, 700 - (performance.now() - last.current));
    const t = setTimeout(() => {
      last.current = performance.now();
      void captureGrid(recipe, cols, rows)
        .then(g => { if (alive) useReadme.setState({ text: gridToText(g), cols, rows }); })
        .catch(() => undefined);
    }, wait);
    return () => { alive = false; clearTimeout(t); };
  }, [recipe, img.w, img.h]);
}

function ReadmeView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const art = useRef<HTMLElement>(null);
  const size = useSize(art, true);
  const page = useStudio(s => s.ui.viewOpts.page);
  const img = readmeImage(size.w || 800);
  const text = useReadme(s => s.text);
  const cols = useReadme(s => s.cols);
  useEffect(() => { useReadme.setState({ gifW: img.gifW }); }, [img.gifW]);
  useReadmeText(img);
  return (
    <div className={'vw-area vw-scroll vw-gh vw-' + page} style={areaStyle(ins)} tabIndex={0} role="region" aria-label="README de ejemplo">
      <div className="gh-box">
        <div className="gh-head" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 2.75A1.75 1.75 0 0 1 3.25 1h4.5c.97 0 1.84.47 2.25 1.2A2.6 2.6 0 0 1 12.25 1h1.5c.97 0 1.75.78 1.75 1.75v9.5c0 .97-.78 1.75-1.75 1.75h-3.6c-.46 0-.9.18-1.23.51l-.39.39a.75.75 0 0 1-1.06 0l-.39-.39A1.75 1.75 0 0 0 5.85 14h-2.6A1.75 1.75 0 0 1 1.5 12.25Zm6 1.5c0-.69-.56-1.25-1.25-1.25h-3a.25.25 0 0 0-.25.25v9.5c0 .14.11.25.25.25h2.6c.52 0 1.03.13 1.48.37Zm1.5 8.62c.45-.24.96-.37 1.48-.37h3.27a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25h-1.5c-.69 0-1.25.56-1.25 1.25Z" /></svg>
          README.md
        </div>
        <article className="gh-md" ref={art}>
          <h1 aria-hidden="true">tu-proyecto</h1>
          <p aria-hidden="true">Una línea que cuenta qué hace tu proyecto, con la pieza como cabecera:</p>
          <Slot host={host} className="gh-img" style={{ width: img.w, height: img.h }} />
          <p aria-hidden="true">Y la misma pieza como texto, en un bloque de código:</p>
          <pre className="gh-pre" tabIndex={0} role="region" aria-label={`Versión en texto, ${cols} columnas`}><code>{text ? text.replace(/\n+$/, '') : 'Tejiendo el texto…'}</code></pre>
        </article>
      </div>
    </div>
  );
}

/* Terminal ------------------------------------------------------------------ */

function TerminalView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const term = useStudio(s => s.ui.terminal);
  const cell = useStudio(s => s.entries[s.cursor]?.recipe.glyph.cell ?? 10);
  const aspect = useStudio(s => s.entries[s.cursor]?.recipe.glyph.aspect ?? 2);
  const win = terminalWindow(term.cols, term.rows, cell, aspect);
  const k = size.w ? Math.min(1, size.w / win.w, (size.h - 30) / win.h) : 1;
  return (
    <div ref={ref} className="vw-area vw-center" style={areaStyle(ins)}>
      <div className="term-win" style={{ transform: `scale(${Math.max(0.05, k)})` }}>
        <div className="term-bar" aria-hidden="true"><i /><i /><i /><span>monotrama — {term.cols}×{term.rows}</span></div>
        <Slot host={host} className="term-canvas" style={{ width: win.w, height: win.h }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The bar: selector, what the view simulates, its options, export     */
/* ------------------------------------------------------------------ */

export function ViewBar({ view }: { view: ViewId }) {
  const info = viewInfo(view);
  // phones: the options fold away so the preview keeps the room
  const [open, setOpen] = useState(false);
  const term = useStudio(s => s.ui.terminal);
  const gifW = useReadme(s => s.gifW);
  const more = view !== 'libre';
  const go = () => { const r = exportFor(view, { gifW, term }); if (r) openExport(r.tab, r); };
  const goLabel = view === 'readme' ? 'Exportar GIF para README' : 'Exportar para este destino';
  const hint = view === 'readme' ? `GIF de ${gifW} px de ancho, el de la imagen del README.` : EXPORT_HINT[view];
  return (
    <div className={'vbar' + (more ? ' more' : '')}>
      <div className="vbar-sel">
        <span className="vbar-lbl" id="vbar-lbl">Vista</span>
        <div className="vseg" role="group" aria-labelledby="vbar-lbl">
          {VIEWS.map(v => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} title={v.what}>{v.name}</button>
          ))}
        </div>
        <select className="vsel" aria-labelledby="vbar-lbl" value={view} onChange={e => setView(e.target.value as ViewId)}>
          {VIEWS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {more && (
          <button type="button" className="vbar-fold" aria-expanded={open} aria-controls="vbar-opts" onClick={() => setOpen(!open)} title="Opciones de la vista">
            <IMore /><span className="sr-only">Opciones de la vista</span>
          </button>
        )}
        {more && <button type="button" className="vbar-go vbar-go-sm" onClick={go} title={hint} aria-label={goLabel}><IDownload /><span>Exportar</span></button>}
      </div>
      {more && (
        <div className="vbar-more">
          <p className="vbar-what">{info.what}</p>
          {view === 'web' && <Legib />}
          <div className={'vbar-opts' + (open ? ' open' : '')} id="vbar-opts">
            <ViewOptions view={view} />
            <ViewNotes view={view} />
          </div>
          <button type="button" className="vbar-go vbar-go-lg" onClick={go} title={hint}><IDownload />{goLabel}</button>
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({ label, value, opts, onPick }: { label: string; value: T; opts: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <div className="vbar-seg" role="group" aria-label={label}>
      <span className="vbar-k" aria-hidden="true">{label}</span>
      {opts.map(([v, name]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>{name}</button>)}
    </div>
  );
}

function ViewOptions({ view }: { view: ViewId }) {
  const o = useStudio(s => s.ui.viewOpts);
  const term = useStudio(s => s.ui.terminal);
  const text = useReadme(s => s.text);
  switch (view) {
    case 'web':
      return <Seg label="Texto" value={o.ink} opts={[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']]} onPick={ink => setViewOpts({ ink })} />;
    case 'tarjeta':
      return <Seg label="Página" value={o.page} opts={[['light', 'Clara'], ['dark', 'Oscura']]} onPick={page => setViewOpts({ page })} />;
    case 'vertical':
      return (
        <label className="vbar-switch">
          <span>Pie de texto</span>
          <span className="switch"><input type="checkbox" role="switch" checked={o.caption} onChange={e => setViewOpts({ caption: e.target.checked })} /><span /></span>
        </label>
      );
    case 'readme':
      return (
        <>
          <Seg label="Página" value={o.page} opts={[['light', 'Clara'], ['dark', 'Oscura']]} onPick={page => setViewOpts({ page })} />
          <button type="button" className="vbar-btn" disabled={!text} onClick={() => void copyText(markdownBlock(text), 'Bloque Markdown copiado')}>Copiar bloque Markdown</button>
        </>
      );
    case 'terminal':
      return (
        <label className="vbar-size">
          <span>Tamaño</span>
          <select value={`${term.cols}x${term.rows}`} onChange={e => { const [cols, rows] = e.target.value.split('x').map(Number); setUI({ terminal: { cols, rows } }); }}>
            {!TERM_SIZES.some(([c, r]) => c === term.cols && r === term.rows) && <option value={`${term.cols}x${term.rows}`}>{term.cols}×{term.rows}</option>}
            {TERM_SIZES.map(([c, r]) => <option key={c + 'x' + r} value={`${c}x${r}`}>{c}×{r}</option>)}
          </select>
        </label>
      );
    default:
      return null;
  }
}

/** The legibility estimate of the test headline, labelled as an estimate. */
function Legib() {
  const est = useLegibility(s => s.est);
  return (
    <p className={'vbar-legib legib ' + (est?.level ?? 'wait')}>
      <span className="legib-dot" aria-hidden="true" />
      <span>Contraste estimado del titular: <b>{est ? `${est.ratio.toFixed(1)}:1` : '…'}</b></span>
      <span className="legib-say" aria-live="polite">{est ? VERDICT[est.level] : 'Midiendo…'}</span>
    </p>
  );
}

/** What the view cannot show as it will be (README: characters GitHub draws differently). */
function ViewNotes({ view }: { view: ViewId }) {
  const charset = useStudio(s => s.entries[s.cursor]?.recipe.glyph.charset ?? '');
  const aspect = useStudio(s => s.entries[s.cursor]?.recipe.glyph.aspect ?? 2);
  const text = useReadme(s => s.text);
  if (view !== 'readme') return null;
  const odd = nonAscii(charset + text);
  const tall = Math.abs(aspect - GITHUB_CELL) > 0.6;
  return (
    <>
      {odd.length > 0 && (
        <p className="vbar-warn" role="note">
          <b>Caracteres fuera de ASCII</b> ({odd.slice(0, 8).join(' ')}{odd.length > 8 ? ' …' : ''}): en GitHub pueden salir con otro ancho u otra forma y descuadrar el bloque. Para el texto, usa un juego ASCII en Glifos.
        </p>
      )}
      {tall && (
        <p className="vbar-note">
          En GitHub cada carácter es unas {GITHUB_CELL.toFixed(1).replace('.', ',')} veces más alto que ancho; tu celda es 1:{aspect.toFixed(1).replace('.', ',')}, así que el texto sale {aspect < GITHUB_CELL ? 'más alargado' : 'más aplastado'} que la imagen.
        </p>
      )}
    </>
  );
}
