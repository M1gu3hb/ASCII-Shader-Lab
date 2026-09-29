import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { create } from 'zustand';
import { gridToText } from '../../exporters/text';
import { copyText } from '../download';
import { captureGrid } from '../exporting';
import { openExport } from '../exportTab';
import { IDownload, IMore, VIEW_ICON } from '../icons';
import { useScramble } from '../motion/hooks';
import { setUI, useRecipe, useStudio } from '../store';
import type { Recipe } from '../../engine/recipe';
import { useGuide } from '../guide/state';
import { LegibilityReport, PageContent, ScrimFine, ScrimLayer, ScrimSeg, gradientSideOf, usePageLook } from './PageMock';
import { setView, setViewOpts } from './state';
import {
  EXPORT_HINT, GITHUB_CELL, SAFE_BOTTOM, SAFE_RIGHT, SAFE_TOP, TERM_SIZES, VIEWS, cardMedia, exportAlt, exportFor, markdownBlock, nonAscii, phoneFit,
  readmeGrid, readmeImage, terminalWindow, verticalFrame, viewInfo, type ViewId,
} from './views';
import { ScrollRow } from '../ui/ScrollRow';
import { Picker } from '../ui/Picker';
import { VIEW_OVERLAY_LABEL } from '../ui/copy';
import { LAND_Q, PHONE_Q, useMatch, usePhone } from '../ui/useMatch';
import { useSheet } from '../ui/sheetSnap';
import { useImmersive } from '../ui/Immersive';
import '../css/views.css';
import '../css/controls.css';

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
 * Room the views can use inside the stage: below the bar at its top (view selector and options)
 * and above the dice deck and seed line, or above the settings sheet on phones. Layout offsets are
 * used (not bounding boxes) so the panel's slide transition does not count. The notification area
 * (notes and toasts, Notices.tsx) hangs under that bar out of flow: it never changes this room.
 */
export function useStageInsets(stage: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>): Insets {
  const [ins, setIns] = useState<Insets>({ top: 64, bottom: 120 });
  const panel = useStudio(s => s.ui.panel);
  const hide = useStudio(s => s.ui.hideUI);
  const guiding = useGuide(s => s.path !== null);
  const cursor = useStudio(s => s.cursor);
  const imm = useImmersive(s => s.on);
  const dragging = useSheet(s => s.dragging);
  const snap = useSheet(s => s.snap);
  useLayoutEffect(() => {
    const st = stage.current;
    const app = st?.closest<HTMLElement>('.app');
    const wrap = st?.closest<HTMLElement>('.stage-wrap');
    if (!st || !app || !wrap) return;
    const measure = () => {
      // the sheet is being dragged: the stage keeps its room until it is let go
      if (useSheet.getState().dragging) return;
      const bar = top.current;
      const t = hide || !bar || !bar.offsetHeight ? 12 : bar.offsetTop + bar.offsetHeight + 10;
      // what covers the stage from below, in the app's coordinates: the settings sheet on phones held
      // upright, else the deck and the seed line (or the immersive bar) where they overlap the stage
      const bottom = wrap.offsetTop + wrap.offsetHeight;
      let cover = bottom;
      if (!hide) {
        const sheet = app.querySelector<HTMLElement>('.panel');
        const upright = matchMedia(PHONE_Q).matches && !matchMedia(LAND_Q).matches;
        if (upright && sheet && !app.classList.contains('panel-off')) cover = sheet.offsetTop;
        else {
          const tops = [...app.querySelectorAll<HTMLElement>('.deck, .seedline, .imm-bar')]
            .filter(el => el.offsetParent !== null && el.offsetLeft < wrap.offsetLeft + wrap.offsetWidth)
            .map(el => el.offsetTop);
          if (tops.length) cover = Math.min(cover, ...tops);
        }
      }
      const b = Math.max(12, bottom - cover + 10);
      setIns(p => (p.top === t && p.bottom === b ? p : { top: t, bottom: b }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(st);
    if (top.current) ro.observe(top.current);
    for (const el of app.querySelectorAll('.deck, .seedline, .panel, .imm-bar')) ro.observe(el);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [stage, top, panel, hide, guiding, cursor, imm, dragging, snap]);
  return ins;
}

const areaStyle = (ins: Insets): CSSProperties => ({ top: ins.top, bottom: ins.bottom });

/* ------------------------------------------------------------------ */
/* The stage in each view                                               */
/* ------------------------------------------------------------------ */

export function ViewStage({ view, host, ins }: { view: ViewId; host: HTMLElement; ins: Insets }) {
  switch (view) {
    case 'web': return <WebView host={host} ins={ins} />;
    case 'movil': return <PhoneView host={host} ins={ins} />;
    case 'tarjeta': return <CardView host={host} ins={ins} />;
    case 'vertical': return <VerticalView host={host} ins={ins} />;
    case 'readme': return <ReadmeView host={host} ins={ins} />;
    case 'terminal': return <TerminalView host={host} ins={ins} />;
    default: return <FreeView host={host} ins={ins} />;
  }
}

/* Libre -------------------------------------------------------------------- */

/**
 * The whole stage, behind the deck and the panel. Except on a phone during a guide: the guide's sheet
 * covers the lower half of the screen and cannot be lowered, so the piece goes in the room above it
 * (the word and the photo's centre sat right under the sheet).
 */
function FreeView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const phone = usePhone();
  const land = useMatch(LAND_Q);
  const guiding = useGuide(s => s.path !== null);
  // phones held upright with the settings sheet at its peek or half: the whole piece above the sheet
  // (at full height the sheet takes the screen: the piece stays as it was behind it)
  const sheetOpen = useStudio(s => s.ui.panel);
  const snap = useSheet(s => s.snap);
  if (phone && guiding) return <div className="vw-area vw-free" style={areaStyle(ins)}><Slot host={host} className="vw-fill" /></div>;
  // (the view bar floats over the piece, as it does with the sheet closed)
  if (phone && !land && sheetOpen && snap !== 'full') return <div className="vw-area vw-free vw-above" style={{ top: 0, bottom: Math.max(0, ins.bottom - 10) }}><Slot host={host} className="vw-fill" /></div>;
  return <Slot host={host} className="vw-fill" />;
}

/* Fondo web ------------------------------------------------------------ */

function WebView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const recipe = useRecipe();
  const look = usePageLook();
  const content = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLDivElement>(null);
  const size = useSize(port);
  return (
    <div className="vw-area" style={areaStyle(ins)}>
      <figure className="vw-browser" aria-label="Vista previa: tu pieza como fondo de una página web, con contenido de ejemplo encima">
        <div className="vw-chrome" aria-hidden="true"><i /><i /><i /><span className="vw-url">tu-sitio.com</span></div>
        <div className="vw-viewport" ref={port}>
          <Slot host={host} className="vw-fill" />
          <ScrimLayer scrim={look.scrim} side={gradientSideOf(size.w, size.h)} />
          {/* test content over the background: what a visitor reads on top of it */}
          <PageContent contentRef={content} look={look} pieceKey={recipe} />
        </div>
      </figure>
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
      <div className="vw-site-h" aria-hidden="true">Proyectos recientes</div>
      <div className="vw-cards">
        <div className="vw-card">
          <Slot host={host} className="vw-card-media" style={media} />
          <div className="vw-card-body" aria-hidden="true">
            <div className="vw-card-h">Tu pieza, en pequeño</div>
            <p>Un texto breve bajo la imagen: así se ve a {m.w}×{m.h} px, entre otras tarjetas.</p>
            <span className="vw-card-btn">Ver proyecto</span>
          </div>
        </div>
        {[1, 2].map(i => (
          <div key={i} className="vw-card" aria-hidden="true">
            <div className="vw-card-media vw-ph" style={media} />
            <div className="vw-card-body">
              <div className="vw-card-h">{i === 1 ? 'Otra tarjeta' : 'Y una más'}</div>
              <p>Contenido de relleno para comparar tamaños y pesos visuales.</p>
              <span className="vw-card-btn">Ver proyecto</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Historia / Reel 9:16 ------------------------------------------------------ */

/**
 * A vertical video frame (1080×1920). Clean by default: it is the video itself, not an app. On request,
 * the bands where Reels, TikTok and Stories usually put their own interface (approximate: every app and
 * version differs), and a sample caption.
 */
function VerticalView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const caption = useStudio(s => s.ui.viewOpts.caption);
  const zones = useStudio(s => s.ui.viewOpts.zones);
  const f = verticalFrame(size.w, size.h);
  // on a very short stage the frame keeps its CSS size (what the export composes) and is shown smaller;
  // the box around it takes the smaller size, so it is centred and nothing of it is cut
  const k = size.h && size.w ? Math.min(1, size.h / f.h, size.w / f.w) : 1;
  return (
    <div ref={ref} className="vw-area vw-center" style={areaStyle(ins)}>
      <div className="vw-phone-box" style={{ width: f.w * k, height: f.h * k }}>
        <div className="vw-phone vw-story" style={{ width: f.w, height: f.h, transform: k < 1 ? `scale(${k})` : undefined }} data-frame={`${f.w}x${f.h}`}>
          <Slot host={host} className="vw-fill" />
          {zones && (
            <>
              <div className="vw-safe vw-safe-top" style={{ height: SAFE_TOP * 100 + '%' }} aria-hidden="true"><span>interfaz de la app · aprox.</span></div>
              <div className="vw-safe vw-safe-right" style={{ top: SAFE_TOP * 100 + '%', bottom: SAFE_BOTTOM * 100 + '%', width: SAFE_RIGHT * 100 + '%' }} aria-hidden="true">
                <span className="vw-safe-icons"><i>♥</i><i>✎</i><i>➦</i></span>
              </div>
              <div className="vw-safe vw-safe-bottom" style={{ height: SAFE_BOTTOM * 100 + '%' }} aria-hidden="true"><span>interfaz de la app · aprox.</span></div>
            </>
          )}
          {caption && (
            <span className="vw-cap" style={{ bottom: SAFE_BOTTOM * 50 + '%' }} aria-hidden="true">
              <b>@tu_cuenta</b>
              <span>Tejido con caracteres, fotograma a fotograma ✦</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* Pantalla de móvil ------------------------------------------------------------ */

/**
 * The piece as the background of a web page on a phone (390×844 CSS px), with the same kind of test
 * content as «Fondo web». The screen keeps its CSS size; the handset is drawn smaller when the stage
 * is short. Text regions are marked (data-legib) for the legibility estimate.
 */
function PhoneView({ host, ins }: { host: HTMLElement; ins: Insets }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const recipe = useRecipe();
  const look = usePageLook();
  const content = useRef<HTMLDivElement>(null);
  const pad = 12;
  const fit = phoneFit(size.w, size.h, pad + 5);
  const style = { width: fit.w, height: fit.h, '--pc': look.ink, '--pcb': look.ink === '#ffffff' ? '#111111' : '#ffffff' } as CSSProperties;
  return (
    <div ref={ref} className="vw-area vw-center" style={areaStyle(ins)}>
      <div className="vw-handset-box" style={{ width: (fit.w + pad * 2) * fit.k, height: (fit.h + pad * 2) * fit.k }}>
        <figure className="vw-handset" style={{ transform: fit.k < 1 ? `scale(${fit.k})` : undefined }} data-screen={`${fit.w}x${fit.h}`}
          aria-label="Vista previa: tu pieza como fondo de una web en un teléfono, con contenido de ejemplo encima">
          <div className="vw-handset-screen" style={style}>
            <Slot host={host} className="vw-fill" />
            <ScrimLayer scrim={look.scrim} side="bottom" />
            <div className="vw-handset-bar" aria-hidden="true"><span>9:41</span><i /><span>▮▮▮</span></div>
            {/* test content over the background: what a visitor reads on a phone */}
            <PageContent phone contentRef={content} look={look} pieceKey={recipe} />
          </div>
        </figure>
      </div>
    </div>
  );
}

/* README ------------------------------------------------------------------ */

/** The README text version, shared by the page mock (which renders it) and the bar (which copies it). */
export const useReadme = create<{ text: string; cols: number; rows: number; gifW: number }>(() => ({ text: '', cols: 80, rows: 0, gifW: 640 }));

/**
 * Captures the text version (80 columns) when the piece changes: one capture at a time, at least 700 ms
 * after the previous one ended, always of the latest piece. (Timed from when captures started, a slow
 * one, with software WebGL, let every nudge of a slider start another offscreen engine.)
 */
function useReadmeText(img: { w: number; h: number }) {
  const recipe = useRecipe();
  const q = useRef<{ want: { r: Recipe; cols: number; rows: number } | null; busy: boolean; last: number; t: number; alive: boolean }>(
    { want: null, busy: false, last: 0, t: 0, alive: true });
  const schedule = useRef(() => {
    const s = q.current;
    if (s.busy || !s.want) return; // the capture on its way takes the latest piece when it ends
    clearTimeout(s.t);
    s.t = window.setTimeout(async () => {
      const w = s.want;
      if (!w || !s.alive) return;
      s.want = null;
      s.busy = true;
      try {
        const g = await captureGrid(w.r, w.cols, w.rows);
        if (s.alive) useReadme.setState({ text: gridToText(g), cols: w.cols, rows: w.rows });
      } catch { /* the next change tries again */ }
      s.busy = false;
      s.last = performance.now();
      if (s.alive) schedule.current();
    }, Math.max(120, 700 - (performance.now() - s.last)));
  });
  useEffect(() => {
    if (!recipe || !img.w) return;
    const { cols, rows } = readmeGrid(img.w, img.h, recipe.glyph.cell, recipe.glyph.aspect);
    q.current.want = { r: recipe, cols, rows };
    schedule.current();
  }, [recipe, img.w, img.h]);
  useEffect(() => {
    const s = q.current;
    s.alive = true;
    return () => { s.alive = false; clearTimeout(s.t); };
  }, []);
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
          <div className="gh-h1" aria-hidden="true">tu-proyecto</div>
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
  const pr = useStudio(s => s.stats.pr);
  const win = terminalWindow(term.cols, term.rows, cell, aspect, pr);
  const k = size.w ? Math.min(1, size.w / win.w, (size.h - 30) / win.h) : 1;
  return (
    <div ref={ref} className="vw-area vw-center" style={areaStyle(ins)}>
      <div className="term-win" style={{ transform: `scale(${Math.max(0.05, k)})` }}>
        <div className="term-bar" aria-hidden="true"><i /><i /><i /><span>glyphos — {term.cols}×{term.rows}</span></div>
        <Slot host={host} className="term-canvas" style={{ width: win.w, height: win.h }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The bar: selector, what the view simulates, its options, export     */
/* ------------------------------------------------------------------ */

export function ViewBar({ view, extra }: { view: ViewId; extra?: ReactNode }) {
  const info = viewInfo(view);
  // phones: the options fold away so the preview keeps the room
  const [open, setOpen] = useState(false);
  const term = useStudio(s => s.ui.terminal);
  const gifW = useReadme(s => s.gifW);
  const more = view !== 'libre';
  const go = () => { const r = exportFor(view, { gifW, term }); if (r) openExport(r.tab, r); };
  const alt = exportAlt(view);
  const goLabel = view === 'readme' ? 'Exportar GIF para README' : 'Exportar para este destino';
  const hint = view === 'readme' ? `GIF de ${gifW} px de ancho, el de la imagen del README.` : EXPORT_HINT[view];
  const what = useScramble<HTMLParagraphElement>(info.what, { duration: 280 });
  return (
    <div className={'vbar' + (more ? ' more' : '')}>
      <div className="vbar-sel">
        <span className="vbar-lbl" id="vbar-lbl">Vista</span>
        {/* one choice among the destinations: wraps on narrow stages rather than hiding any */}
        <ScrollRow role="radiogroup" aria-labelledby="vbar-lbl" className="vseg" boxClassName="vseg-box">
          {VIEWS.map(v => {
            const Ic = VIEW_ICON[v.id];
            return (
              <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)} title={v.what}>
                {Ic && <Ic className="v-ic" />}<span>{v.name}</span>
              </button>
            );
          })}
        </ScrollRow>
        <Picker className="vsel-pk" value={view} label="Vista" labelId="vbar-lbl" minWidth={260}
          options={VIEWS.map(v => { const Ic = VIEW_ICON[v.id]; return { value: v.id, label: v.name, desc: v.what, icon: Ic ? <Ic width={16} height={16} /> : undefined }; })} onChange={v => setView(v)} />
        {more && (
          <button type="button" className="vbar-fold" aria-expanded={open} aria-controls="vbar-opts" onClick={() => setOpen(!open)} title="Opciones de la vista">
            <IMore /><span className="sr-only">Opciones de la vista</span>
          </button>
        )}
        {more && <button type="button" className="vbar-go vbar-go-sm" onClick={go} title={hint} aria-label={goLabel}><IDownload /><span>Exportar</span></button>}
        {extra}
      </div>
      {more && (
        <div className="vbar-more">
          <p className="vbar-what" ref={what}>{info.what}</p>
          {(view === 'web' || view === 'movil') && <LegibilityReport><ScrimFine /></LegibilityReport>}
          <div className={'vbar-opts' + (open ? ' open' : '')} id="vbar-opts">
            <ViewOptions view={view} />
            <ViewNotes view={view} />
            {alt && <button type="button" className="vbar-alt" title={alt.hint} onClick={() => openExport(alt.req.tab, alt.req)}>{alt.label}</button>}
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

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="vbar-switch">
      <span>{label}</span>
      <span className="switch"><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} /><span /></span>
    </label>
  );
}

function ViewOptions({ view }: { view: ViewId }) {
  const o = useStudio(s => s.ui.viewOpts);
  const term = useStudio(s => s.ui.terminal);
  const text = useReadme(s => s.text);
  switch (view) {
    case 'web':
    case 'movil':
      return (
        <>
          <Seg label="Texto" value={o.ink} opts={[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']]} onPick={ink => setViewOpts({ ink })} />
          <ScrimSeg />
        </>
      );
    case 'tarjeta':
      return <Seg label="Página" value={o.page} opts={[['light', 'Clara'], ['dark', 'Oscura']]} onPick={page => setViewOpts({ page })} />;
    case 'vertical':
      return (
        <>
          <Switch label={VIEW_OVERLAY_LABEL} on={o.zones} onChange={zones => setViewOpts({ zones })} />
          <Switch label="Pie de texto de ejemplo" on={o.caption} onChange={caption => setViewOpts({ caption })} />
        </>
      );
    case 'readme':
      return (
        <>
          <Seg label="Página" value={o.page} opts={[['light', 'Clara'], ['dark', 'Oscura']]} onPick={page => setViewOpts({ page })} />
          <button type="button" className="vbar-btn" disabled={!text} onClick={() => void copyText(markdownBlock(text), 'Bloque Markdown copiado')}>Copiar bloque Markdown</button>
        </>
      );
    case 'terminal': {
      const cur = `${term.cols}x${term.rows}`;
      const sizes = TERM_SIZES.map(([c, r]) => ({ value: `${c}x${r}`, label: `${c}×${r}` }));
      if (!sizes.some(x => x.value === cur)) sizes.unshift({ value: cur, label: `${term.cols}×${term.rows}` });
      return (
        <span className="vbar-size">
          <span id="vbar-term-l">Tamaño</span>
          <Picker size="sm" value={cur} label="Tamaño de la terminal" labelId="vbar-term-l" options={sizes} minWidth={140}
            onChange={v => { const [cols, rows] = v.split('x').map(Number); setUI({ terminal: { cols, rows } }); }} />
        </span>
      );
    }
    default:
      return null;
  }
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
