import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { gradientSide, resolveScrim, scrimCss, withPreset, type Scrim, type ScrimMode, type ScrimSettings, type ScrimShape } from '../../shared/scrim';
import { useRecipe, useStudio } from '../store';
import { inkFor, useLegibility, useLegibilityMeter, type Estimate } from './legibility';
import { LEVEL_WORD, advice, reason, summary, type Level } from './readability';
import { setViewOpts } from './state';
import { useGuide } from '../guide/state';
import '../css/legib.css';
import { useScramble } from '../motion/hooks';

/**
 * The test page drawn over the piece in «Fondo web» and «Pantalla de móvil» (and so in the fondo guide),
 * its protected zone, and what the studio says about how it reads. The page is a picture of a page: no
 * headings, inert and hidden from assistive technology (the preview is labelled as a whole), so it never
 * passes for the studio's own content. Each text region is marked `data-legib` for the estimate.
 */

/** The text colour and the protected zone of the page previews, from the view options. */
export function usePageLook(): { ink: string; scrim: Scrim | null; settings: ScrimSettings } {
  const bg = useRecipe()?.color.bg ?? '#000000';
  const o = useStudio(s => s.ui.viewOpts);
  const ink = inkFor(o.ink, bg);
  return { ink, scrim: resolveScrim(o.scrim, ink, bg), settings: o.scrim };
}

/** «a:b;-webkit-c-d:e» → React style. */
function toStyle(css: string): CSSProperties {
  const st: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim().replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    st[name] = decl.slice(i + 1).trim();
  }
  return st as CSSProperties;
}

/** Full or gradient zone: a layer between the canvas and the page. */
export function ScrimLayer({ scrim, side }: { scrim: Scrim | null; side: 'left' | 'bottom' }) {
  if (!scrim || scrim.shape === 'block') return null;
  return <div className={'vw-scrim vw-scrim-' + scrim.shape} aria-hidden="true" data-side={side} style={toStyle(scrimCss(scrim, side))} />;
}

/** Block zone: a panel behind one block of text. */
function Shield({ scrim }: { scrim: Scrim | null }) {
  if (!scrim || scrim.shape !== 'block') return null;
  return <span className="pc-shield" aria-hidden="true" style={toStyle(scrimCss(scrim))} />;
}

export const gradientSideOf = (w: number, h: number) => gradientSide(w || 1, h || 1);

const legib = (id: string, role: string, name: string) => ({ 'data-legib': role, 'data-legib-id': id, 'data-legib-name': name });

/**
 * The content of the test page. `phone`: the mobile layout (burger menu, stacked buttons). The meter
 * measures it while it is shown; `key` is the piece being shown.
 */
export function PageContent({ phone, contentRef, look, pieceKey }: { phone?: boolean; contentRef: RefObject<HTMLDivElement | null>; look: ReturnType<typeof usePageLook>; pieceKey: unknown }) {
  const { ink, scrim } = look;
  useLegibilityMeter(true, contentRef, ink, scrim, pieceKey);
  const style = { '--pc': ink, '--pcb': ink === '#ffffff' ? '#111111' : '#ffffff' } as CSSProperties;
  return (
    <div className={phone ? 'vw-mobile-content' : 'preview-content'} ref={contentRef} style={style} inert aria-hidden="true">
      <div className="pc-nav">
        <span className="pc-item"><Shield scrim={scrim} /><b className="pc-brand" {...legib('marca', 'nav', 'el nombre de la marca')}>Tu marca</b></span>
        {phone
          ? <span className="pc-item"><Shield scrim={scrim} /><span className="pc-burger" /></span>
          : <span className="pc-item"><Shield scrim={scrim} /><span className="pc-links" {...legib('menu', 'nav', 'el menú')}>Proyectos · Estudio · Contacto</span></span>}
      </div>
      <div className="pc-hero">
        <Shield scrim={scrim} />
        <div className="pc-h" {...legib('titular', 'headline', 'el titular')}>Un titular que se lee sin esfuerzo</div>
        <div className="pc-p" {...legib('parrafo', 'body', 'el párrafo')}>
          {phone ? 'Así se verá tu fondo en un teléfono, detrás de contenido real.' : 'Así se verá tu fondo detrás de contenido real. Si cuesta leer, prueba la zona protegida o calma el fondo.'}
        </div>
        <div className="pc-btns">
          <span className="pc-btn" {...legib('boton', 'button', 'el botón principal')}>Botón principal</span>
          <span className="pc-btn ghost" {...legib('saber', 'button', 'el botón «Saber más»')}>Saber más</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What the studio says                                                 */
/* ------------------------------------------------------------------ */

const MARK: Record<Level, string> = { buena: '✓', justa: '!', baja: '✕' };

/** The estimate's one line (also what screen readers hear when it changes). */
export function legibLine(est: Estimate | null): string {
  return est ? summary(est) : 'Midiendo…';
}

function Seg<T extends string>({ label, value, opts, onPick, className = 'vbar-seg' }: { label: string; value: T; opts: Array<[T, string]>; onPick: (v: T) => void; className?: string }) {
  const id = useId();
  return (
    <div className={className} role="group" aria-labelledby={id}>
      <span className="vbar-k" id={id}>{label}</span>
      {opts.map(([v, name]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>{name}</button>)}
    </div>
  );
}

const setScrim = (p: Partial<ScrimSettings>) => setViewOpts({ scrim: { ...useStudio.getState().ui.viewOpts.scrim, ...p } });
const pickMode = (mode: ScrimMode) => setViewOpts({ scrim: withPreset(useStudio.getState().ui.viewOpts.scrim, mode) });

/** «Zona protegida: No · Suave · Fuerte» (and «A medida» once a slider moved). */
export function ScrimSeg({ className }: { className?: string }) {
  const mode = useStudio(s => s.ui.viewOpts.scrim.mode);
  const opts: Array<[ScrimMode, string]> = [['off', 'No'], ['suave', 'Suave'], ['fuerte', 'Fuerte']];
  if (mode === 'custom') opts.push(['custom', 'A medida']);
  return <Seg label="Zona protegida" value={mode} opts={opts} onPick={pickMode} className={className} />;
}

const SHAPES: Array<[ScrimShape, string]> = [['block', 'Tras el texto'], ['full', 'Toda la página'], ['gradient', 'Degradado']];

/** Shape, opacity and blur of the zone (shown while it is on). */
export function ScrimFine({ segClass }: { segClass?: string }) {
  const s = useStudio(st => st.ui.viewOpts.scrim);
  const op = useId(), bl = useId();
  if (s.mode === 'off') return null;
  return (
    <div className="scrim-fine">
      <Seg label="Forma" value={s.shape} opts={SHAPES} onPick={shape => setScrim({ shape })} className={segClass} />
      <div className="scrim-range">
        <label htmlFor={op}>Opacidad</label>
        <input id={op} type="range" min={0} max={0.95} step={0.05} value={s.opacity} aria-valuetext={`${Math.round(s.opacity * 100)} %`}
          style={{ '--p': (s.opacity / 0.95) * 100 + '%' } as CSSProperties} onChange={e => setScrim({ opacity: +e.target.value, mode: 'custom' })} />
        <output htmlFor={op}>{Math.round(s.opacity * 100)} %</output>
      </div>
      <div className="scrim-range">
        <label htmlFor={bl}>Desenfoque</label>
        <input id={bl} type="range" min={0} max={16} step={1} value={s.blur} aria-valuetext={`${s.blur} píxeles`}
          style={{ '--p': (s.blur / 16) * 100 + '%' } as CSSProperties} onChange={e => setScrim({ blur: +e.target.value, mode: 'custom' })} />
        <output htmlFor={bl}>{s.blur} px</output>
      </div>
      <p className="note scrim-note">
        {s.shape === 'block' ? 'Un panel detrás de cada bloque de texto. En el código exportado es una clase CSS para tus propios bloques.'
          : s.shape === 'full' ? 'Una capa sobre todo el fondo.'
            : 'Más fuerte donde suele ir el texto (a la izquierda en pantallas anchas, abajo en las altas) y se desvanece.'}
        {' '}Se puede llevar al código (pestaña Código).
      </p>
    </div>
  );
}

/** Each region with its verdict and why. */
function Regions({ est }: { est: Estimate }) {
  return (
    <ul className="legib-list">
      {est.regions.filter(r => r.id !== 'boton' || r.level !== 'buena').map(r => (
        <li key={r.id} className={r.level}>
          <span className="legib-mark" aria-hidden="true">{MARK[r.level]}</span>
          <span><b>{r.name[0].toUpperCase() + r.name.slice(1)}</b>: {LEVEL_WORD[r.level].toLowerCase()}{r.level === 'buena' ? '' : ` — ${reason(r, est.light)}`}.</span>
        </li>
      ))}
    </ul>
  );
}

export const ESTIMATE_NOTE = 'Es una estimación: mide el fondo real detrás de cada texto, en varios fotogramas, y lo compara con lo que pide la norma WCAG (4.5:1 para texto normal, 3:1 para titulares grandes). No sustituye mirarlo tú.';

/**
 * The estimate in the view bar: one line with a «Detalles» disclosure (regions, what to try, the zone's
 * fine settings); in the fondo guide (`guide`), everything in view.
 */
export function LegibilityReport({ guide, children }: { guide?: boolean; children?: ReactNode }) {
  const est = useLegibility(s => s.est);
  const scrimMode = useStudio(s => s.ui.viewOpts.scrim.mode);
  const guiding = useGuide(s => s.path === 'fondo');
  const [open, setOpen] = useState(false);
  const id = useId();
  const level = est?.level ?? 'wait';
  // a new verdict resolves out of glyphs (its real words are in place for screen readers all along)
  const say = useScramble<HTMLElement>(legibLine(est), { duration: 260 });
  const tips = est ? advice(est, { light: est.light, scrim: scrimMode, alt: est.alt, guide }) : [];
  const box = useRef<HTMLDivElement>(null);
  useFitAbove(box, open && !guide, est);
  const detail = (
    <>
      {est && <Regions est={est} />}
      {tips.length > 0 && <ul className="legib-tips">{tips.map(t => <li key={t}>{t}</li>)}</ul>}
      {children}
      <p className="note legib-note">{ESTIMATE_NOTE}</p>
    </>
  );
  return (
    <div className={'legib-report' + (guide ? ' in-guide' : '')}>
      <p className={'legib legib-line ' + level} data-level={level}
        data-clash={est ? Math.round(Math.max(0, ...est.regions.filter(r => r.id !== 'boton').map(r => r.m.clash)) * 1000) : undefined}>
        <span className="legib-dot" aria-hidden="true" />
        <span className="legib-k">Legibilidad <span className="legib-est">(estimación)</span>:</span>{' '}
        <b className="legib-say" ref={say}>{legibLine(est)}</b>
        {!guide && (
          <button type="button" className="legib-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            {open ? 'Ocultar' : 'Detalles'}
          </button>
        )}
      </p>
      {/* what screen readers hear: the line, when it changes (once: the guide's copy speaks while it is open) */}
      {(guide || !guiding) && <span className="sr-only" aria-live="polite">{est ? `Legibilidad estimada: ${summary(est)}` : ''}</span>}
      {guide ? <div className="legib-detail">{detail}</div> : open && <div className="legib-detail" id={id} ref={box}>{detail}</div>}
    </div>
  );
}

/**
 * The details open over the preview: on a short screen they would run under the seed line and the dice
 * (or the settings sheet), so they end above what lies below them and scroll inside.
 */
function useFitAbove(ref: RefObject<HTMLElement | null>, on: boolean, content: unknown) {
  useLayoutEffect(() => {
    if (!on) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.maxHeight = '';
      const r = el.getBoundingClientRect();
      let limit = innerHeight;
      for (const b of document.querySelectorAll<HTMLElement>('.app .seedline, .app .deck, .app .panel')) {
        const q = b.getBoundingClientRect();
        if (q.width && q.height && q.top > r.top && q.left < r.right && q.right > r.left) limit = Math.min(limit, q.top);
      }
      if (r.bottom > limit - 8) el.style.maxHeight = Math.max(120, limit - 8 - r.top) + 'px';
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
    // (again when what it says changes: more regions or advice make it taller)
  }, [ref, on, content]);
}
